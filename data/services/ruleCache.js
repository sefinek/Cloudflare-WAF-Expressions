const fs = require('node:fs/promises');
const path = require('node:path');

const CACHE_PATH = path.join(__dirname, '../../data/rule-ids.json');

const load = async () => {
	try {
		return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
	} catch {
		return { zones: {}, ipListId: null };
	}
};

const save = async cache => {
	await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, '\t'), 'utf8');
};

module.exports = { load, save };
