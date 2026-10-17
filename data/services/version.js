const axios = require('axios');
const log = require('../scripts/log.js');
const { version } = require('../../package.json');

const REPO_URL = 'https://github.com/sefinek/Cloudflare-WAF-Expressions';
const PACKAGE_JSON_URL = 'https://raw.githubusercontent.com/sefinek/Cloudflare-WAF-Expressions/main/package.json';

const parseVersion = value => {
	const match = typeof value === 'string' && value.match(/^(\d+)\.(\d+)\.(\d+)$/);
	return match ? match.slice(1).map(Number) : null;
};

const isNewer = (latest, current) => {
	const a = parseVersion(latest);
	const b = parseVersion(current);
	if (!a || !b) return false;

	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return false;
};

let notifiedVersion = null;

const checkForUpdates = async () => {
	try {
		const { data } = await axios.get(PACKAGE_JSON_URL, { timeout: 15000 });
		const latest = data?.version;
		if (!parseVersion(latest)) throw new Error(`Invalid remote version: ${latest}`);

		if (isNewer(latest, version) && latest !== notifiedVersion) {
			notifiedVersion = latest;
			log(`A new version is available! v${version} → v${latest}. Run 'npm run update' to update. Changes: ${REPO_URL}/blob/main/CHANGELOG.md`, 2);
		}
	} catch (err) {
		log(`Version check failed: ${err.message}`);
	}
};

module.exports = checkForUpdates;
module.exports.isNewer = isNewer;
