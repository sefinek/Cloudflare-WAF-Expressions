const sendAlertEmail = require('../services/mailer.js');
const sendDiscordAlert = require('../services/discord.js');

const LEVELS = {
	0: { method: 'log', label: '[i]', color: '\x1b[36m' }, // Cyan
	1: { method: 'log', label: '[✓]', color: '\x1b[32m' }, // Green
	2: { method: 'warn', label: '[!]', color: '\x1b[33m' }, // Yellow
	3: { method: 'error', label: '[X]', color: '\x1b[31m' }, // Red
};

const RESET = '\x1b[0m';

const FLUSH_DELAY_MS = 30000;
// Independent per-channel queues + retry state, so a failure on one channel (e.g. Discord webhook down)
// never causes a re-send to a channel that already succeeded (e.g. duplicate emails).
let mailQueue = [];
let discordQueue = [];
let flushTimer = null;
// Tracks the in-progress flush so a shutdown signal awaits the already-dispatched network requests
// instead of racing them - calling flushNow() again while one is in flight just returns the same promise.
let inFlight = null;

function scheduleFlush() {
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(() => flushNow().catch(() => undefined), FLUSH_DELAY_MS);
}

function flushNow() {
	if (inFlight) return inFlight;

	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	if (!mailQueue.length && !discordQueue.length) return Promise.resolve();

	const mailBatch = mailQueue;
	const discordBatch = discordQueue;
	mailQueue = [];
	discordQueue = [];

	inFlight = Promise.allSettled([
		mailBatch.length ? sendAlertEmail(mailBatch) : Promise.resolve(),
		discordBatch.length ? sendDiscordAlert(discordBatch) : Promise.resolve(),
	]).then(([emailResult, discordResult]) => {
		if (emailResult.status === 'rejected') {
			console.error(`[X] Failed to send alert email: ${emailResult.reason?.message}`);
			mailQueue = mailBatch.concat(mailQueue);
		}
		if (discordResult.status === 'rejected') {
			console.error(`[X] Failed to send Discord alert: ${discordResult.reason?.message}`);
			discordQueue = discordBatch.concat(discordQueue);
		}
	}).finally(() => {
		inFlight = null;
		if (mailQueue.length || discordQueue.length) scheduleFlush();
	});

	return inFlight;
}

// pm2 restart/stop sends SIGTERM; without this, alerts queued in the 30s flush window are lost.
// Flushed twice: the first call waits out any flush already in flight, the second sends whatever
// was queued (or arrived) while waiting - a single call could miss either case.
async function shutdownFlush() {
	await flushNow().catch(() => undefined);
	await flushNow().catch(() => undefined);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
	process.once(signal, () => shutdownFlush().finally(() => process.exit(0)));
}

module.exports = (msg, type = 0) => {
	if (typeof msg === 'string' && (msg.includes('Ignoring local IP address') || msg.includes('Ignoring own IP address'))) type = 0;

	const { method, label, color } = LEVELS[type] || LEVELS[0];
	const output = 'pm_id' in process.env ? `${label} ${msg}` : `${color}${label} ${msg}${RESET}`;
	console[method](output);

	if (type === 2 || type === 3) {
		const alert = { type, msg: String(msg) };
		mailQueue.push(alert);
		discordQueue.push(alert);
		scheduleFlush();
	}
};

module.exports.notify = msg => {
	const alert = { type: 1, msg: String(msg) };
	mailQueue.push(alert);
	discordQueue.push(alert);
	scheduleFlush();
};

// Lets short-lived CLI tools flush pending alerts immediately instead of waiting out the 30s batch delay
module.exports.flush = shutdownFlush;
