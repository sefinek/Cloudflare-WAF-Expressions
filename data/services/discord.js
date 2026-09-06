const axios = require('axios');
const alertSummary = require('../scripts/alertSummary.js');
const { name, version } = require('../../package.json');

const REPO_URL = 'https://github.com/sefinek/Cloudflare-WAF-Expressions';
const { DISCORD_WEBHOOK_URL } = process.env;
const NOTIFY_ON_UPDATE = (process.env.NOTIFY_ON_UPDATE_DISCORD || 'false').toLowerCase() === 'true';

const ERROR_COLOR = 0xE74C3C;
const WARN_COLOR = 0xF1C40F;
const UPDATE_COLOR = 0x2ECC71;
const DESCRIPTION_LIMIT = 4096;

module.exports = async allAlerts => {
	const alerts = NOTIFY_ON_UPDATE ? allAlerts : allAlerts.filter(a => a.type !== 1);
	if (!alerts.length || !DISCORD_WEBHOOK_URL) return;

	const { errorCount, warnCount, summary } = alertSummary(alerts);
	const title = `${name} - ${summary}`;

	const emoji = a => a.type === 3 ? '🔴' : a.type === 2 ? '🟡' : '🟢';
	let description = alerts.map(a => `${emoji(a)} ${a.msg}`).join('\n');
	if (description.length > DESCRIPTION_LIMIT) description = `${description.slice(0, DESCRIPTION_LIMIT - 3)}...`;

	try {
		await axios.post(DISCORD_WEBHOOK_URL, {
			embeds: [{
				title,
				url: REPO_URL,
				description,
				color: errorCount ? ERROR_COLOR : warnCount ? WARN_COLOR : UPDATE_COLOR,
				timestamp: new Date().toISOString(),
				footer: { text: `${name} v${version}` },
			}],
		});
	} catch (err) {
		console.error(`[X] Failed to send Discord alert: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
	}
};
