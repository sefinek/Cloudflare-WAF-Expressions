const path = require('node:path');
const USE_HYPERLINKS = !('pm_id' in process.env);

module.exports = (text, filePath) => {
	if (!USE_HYPERLINKS) return text;

	const abs = path.resolve(filePath).split(path.sep).join('/');
	const url = encodeURI(abs.startsWith('/') ? `file://${abs}` : `file:///${abs}`);
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
};
