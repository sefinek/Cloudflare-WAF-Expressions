const LEVELS = {
	0: { method: 'log', label: '[i]', color: '\x1b[36m' }, // Cyan
	1: { method: 'log', label: '[✓]', color: '\x1b[32m' }, // Green
	2: { method: 'warn', label: '[!]', color: '\x1b[33m' }, // Yellow
	3: { method: 'error', label: '[X]', color: '\x1b[31m' }, // Red
};

const RESET = '\x1b[0m';

module.exports = (msg, type = 0) => {
	if (typeof msg === 'string' && (msg.includes('Ignoring local IP address') || msg.includes('Ignoring own IP address'))) type = 0;

	const { method, label, color } = LEVELS[type] || LEVELS[0];
	const output = 'pm_id' in process.env ? `${label} ${msg}` : `${color}${label} ${msg}${RESET}`;
	console[method](output);
};