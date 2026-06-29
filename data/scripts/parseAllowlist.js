const fs = require('node:fs/promises');

const ALLOWLIST_PATH = 'rules/my-lists/allowlist.txt';
const ZONE_PREFIX = /^\[(!?)([^\]]+)]\s*/;

module.exports = async () => {
	const text = await fs.readFile(ALLOWLIST_PATH, 'utf8');
	const entries = [];

	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;

		const match = line.match(ZONE_PREFIX);
		if (match) {
			const expression = line.slice(match[0].length).trim();
			if (!expression) continue;
			entries.push({ expression, zone: match[2].trim(), exclude: match[1] === '!' });
		} else {
			entries.push({ expression: line, zone: null, exclude: false });
		}
	}

	return entries;
};
