const { describe, test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule, unloadModule } = require('./helpers/mockModule.js');

// Only setTimeout is faked, so setImmediate stays real and can be used to drain pending promise chains.
const settle = () => new Promise(resolve => setImmediate(resolve));
const advance = async ms => {
	mock.timers.tick(ms);
	await settle();
};

describe('log.js alert queue', () => {
	let log, mailer, discord;

	beforeEach(() => {
		mock.timers.enable({ apis: ['setTimeout'] });

		mailer = mockModule('../data/services/mailer.js', mock.fn(async () => undefined));
		discord = mockModule('../data/services/discord.js', mock.fn(async () => undefined));

		unloadModule('../data/scripts/log.js');
		log = require('../data/scripts/log.js');
	});

	afterEach(() => {
		mock.timers.reset();
		// log.js registers SIGTERM/SIGINT handlers on require; each test requires a fresh instance,
		// so drop the previous test's handlers to avoid piling them up on `process`.
		process.removeAllListeners('SIGTERM');
		process.removeAllListeners('SIGINT');
	});

	test('does not queue info/success level logs', async () => {
		log('just info', 0);
		log('just a success', 1);
		await advance(30000);

		assert.equal(mailer.mock.callCount(), 0);
		assert.equal(discord.mock.callCount(), 0);
	});

	test('batches warnings/errors and flushes both channels after the delay', async () => {
		log('first warning', 2);
		log('second warning, an error this time', 3);

		await advance(30000);

		assert.equal(mailer.mock.callCount(), 1);
		assert.equal(discord.mock.callCount(), 1);
		assert.equal(mailer.mock.calls[0].arguments[0].length, 2);
		assert.equal(discord.mock.calls[0].arguments[0].length, 2);
	});

	test('log.notify() queues an update-type alert', async () => {
		log.notify('zone updated');
		await advance(30000);

		assert.equal(mailer.mock.callCount(), 1);
		assert.deepEqual(mailer.mock.calls[0].arguments[0], [{ type: 1, msg: 'zone updated' }]);
	});

	test('a channel failure only retries that channel, never the one that already succeeded', async () => {
		discord.mock.mockImplementationOnce(async () => {
			throw new Error('webhook down');
		});

		log('something went wrong', 3);
		await advance(30000); // first attempt: mail ok, discord fails

		assert.equal(mailer.mock.callCount(), 1);
		assert.equal(discord.mock.callCount(), 1);

		await advance(30000); // retry

		// Mailer must NOT be called again - it already delivered this alert.
		assert.equal(mailer.mock.callCount(), 1);
		// Discord retries with exactly the original (still-undelivered) alert, not duplicated.
		assert.equal(discord.mock.callCount(), 2);
		assert.deepEqual(discord.mock.calls[1].arguments[0], [{ type: 3, msg: 'something went wrong' }]);
	});

	test('flush() waits for an already in-flight send instead of racing it', async () => {
		let resolveMailer;
		mailer.mock.mockImplementationOnce(() => new Promise(resolve => { resolveMailer = resolve; }));

		log('slow send in progress', 2);
		await advance(30000); // triggers flushNow(); mailer promise is now pending

		let flushResolved = false;
		const shutdown = log.flush().then(() => { flushResolved = true; });

		// The in-flight mailer call has not resolved yet, so shutdown must still be waiting.
		await settle();
		assert.equal(flushResolved, false);

		resolveMailer(undefined);
		await shutdown;

		assert.equal(flushResolved, true);
		assert.equal(mailer.mock.callCount(), 1);
	});

	test('flush() also sends alerts queued while an unrelated flush was in flight', async () => {
		let resolveMailer;
		mailer.mock.mockImplementationOnce(() => new Promise(resolve => { resolveMailer = resolve; }));

		log('first batch', 2);
		await advance(30000); // first flush starts, mailer pending

		log('arrived during the in-flight send', 3);

		const shutdown = log.flush();

		resolveMailer(undefined);
		await shutdown;

		assert.equal(mailer.mock.callCount(), 2);
		assert.deepEqual(mailer.mock.calls[1].arguments[0], [{ type: 3, msg: 'arrived during the in-flight send' }]);
	});
});
