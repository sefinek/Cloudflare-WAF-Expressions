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
let pending = [];
let flushTimer = null;

function scheduleFlush() {
	if (flushTimer) clearTimeout(flushTimer);
	flushTimer = setTimeout(flushNow, FLUSH_DELAY_MS);
}

function flushNow() {
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	if (!pending.length) return Promise.resolve();

	const alerts = pending;
	pending = [];
	return Promise.allSettled([
		sendAlertEmail(alerts),
		sendDiscordAlert(alerts),
	]).then(([emailResult, discordResult]) => {
		if (emailResult.status === 'rejected') console.error(`[X] Failed to send alert email: ${emailResult.reason?.message}`);
		if (discordResult.status === 'rejected') console.error(`[X] Failed to send Discord alert: ${discordResult.reason?.message}`);

		// Retry failed alerts on the next flush instead of dropping them
		if (emailResult.status === 'rejected' || discordResult.status === 'rejected') {
			pending = alerts.concat(pending);
			scheduleFlush();
		}
	});
}

// pm2 restart/stop sends SIGTERM; without this, alerts queued in the 30s flush window are lost
for (const signal of ['SIGTERM', 'SIGINT']) {
	process.once(signal, () => flushNow().finally(() => process.exit(0)));
}

module.exports = (msg, type = 0) => {
	if (typeof msg === 'string' && (msg.includes('Ignoring local IP address') || msg.includes('Ignoring own IP address'))) type = 0;

	const { method, label, color } = LEVELS[type] || LEVELS[0];
	const output = 'pm_id' in process.env ? `${label} ${msg}` : `${color}${label} ${msg}${RESET}`;
	console[method](output);

	if (type === 2 || type === 3) {
		pending.push({ type, msg: String(msg) });
		scheduleFlush();
	}
};

module.exports.notify = msg => {
	pending.push({ type: 1, msg: String(msg) });
	scheduleFlush();
};

// Lets short-lived CLI tools flush pending alerts immediately instead of waiting out the 30s batch delay
module.exports.flush = flushNow;
