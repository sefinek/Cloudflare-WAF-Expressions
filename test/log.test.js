jest.mock('../data/services/mailer.js');
jest.mock('../data/services/discord.js');

describe('log.js alert queue', () => {
	let log, mailer, discord;

	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();

		mailer = require('../data/services/mailer.js');
		discord = require('../data/services/discord.js');
		mailer.mockResolvedValue(undefined);
		discord.mockResolvedValue(undefined);

		log = require('../data/scripts/log.js');
	});

	afterEach(async () => {
		// Drain any pending flush the test scheduled so it can't leak into the next test/process exit.
		await jest.runOnlyPendingTimersAsync().catch(() => undefined);
		jest.useRealTimers();
		// log.js registers SIGTERM/SIGINT handlers on require; each test requires a fresh instance
		// (via resetModules), so drop the previous test's handlers to avoid piling them up on `process`.
		process.removeAllListeners('SIGTERM');
		process.removeAllListeners('SIGINT');
	});

	test('does not queue info/success level logs', async () => {
		log('just info', 0);
		log('just a success', 1);
		await jest.advanceTimersByTimeAsync(30000);

		expect(mailer).not.toHaveBeenCalled();
		expect(discord).not.toHaveBeenCalled();
	});

	test('batches warnings/errors and flushes both channels after the delay', async () => {
		log('first warning', 2);
		log('second warning, an error this time', 3);

		await jest.advanceTimersByTimeAsync(30000);

		expect(mailer).toHaveBeenCalledTimes(1);
		expect(discord).toHaveBeenCalledTimes(1);
		expect(mailer.mock.calls[0][0]).toHaveLength(2);
		expect(discord.mock.calls[0][0]).toHaveLength(2);
	});

	test('log.notify() queues an update-type alert', async () => {
		log.notify('zone updated');
		await jest.advanceTimersByTimeAsync(30000);

		expect(mailer).toHaveBeenCalledTimes(1);
		expect(mailer.mock.calls[0][0]).toEqual([{ type: 1, msg: 'zone updated' }]);
	});

	test('a channel failure only retries that channel, never the one that already succeeded', async () => {
		mailer.mockResolvedValueOnce(undefined);
		discord.mockRejectedValueOnce(new Error('webhook down'));

		log('something went wrong', 3);
		await jest.advanceTimersByTimeAsync(30000); // first attempt: mail ok, discord fails

		expect(mailer).toHaveBeenCalledTimes(1);
		expect(discord).toHaveBeenCalledTimes(1);

		discord.mockResolvedValueOnce(undefined);
		await jest.advanceTimersByTimeAsync(30000); // retry

		// Mailer must NOT be called again - it already delivered this alert.
		expect(mailer).toHaveBeenCalledTimes(1);
		// Discord retries with exactly the original (still-undelivered) alert, not duplicated.
		expect(discord).toHaveBeenCalledTimes(2);
		expect(discord.mock.calls[1][0]).toEqual([{ type: 3, msg: 'something went wrong' }]);
	});

	test('flush() waits for an already in-flight send instead of racing it', async () => {
		let resolveMailer;
		mailer.mockImplementationOnce(() => new Promise(resolve => { resolveMailer = resolve; }));

		log('slow send in progress', 2);
		await jest.advanceTimersByTimeAsync(30000); // triggers flushNow(); mailer promise is now pending

		let flushResolved = false;
		const shutdown = log.flush().then(() => { flushResolved = true; });

		// The in-flight mailer call has not resolved yet, so shutdown must still be waiting.
		await Promise.resolve();
		await Promise.resolve();
		expect(flushResolved).toBe(false);

		resolveMailer(undefined);
		await shutdown;

		expect(flushResolved).toBe(true);
		expect(mailer).toHaveBeenCalledTimes(1);
	});

	test('flush() also sends alerts queued while an unrelated flush was in flight', async () => {
		let resolveMailer;
		mailer.mockImplementationOnce(() => new Promise(resolve => { resolveMailer = resolve; }));

		log('first batch', 2);
		await jest.advanceTimersByTimeAsync(30000); // first flush starts, mailer pending

		log('arrived during the in-flight send', 3);

		mailer.mockResolvedValueOnce(undefined);
		const shutdown = log.flush();

		resolveMailer(undefined);
		await shutdown;

		expect(mailer).toHaveBeenCalledTimes(2);
		expect(mailer.mock.calls[1][0]).toEqual([{ type: 3, msg: 'arrived during the in-flight send' }]);
	});
});
