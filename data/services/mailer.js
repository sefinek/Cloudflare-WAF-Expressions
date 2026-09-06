const nodemailer = require('nodemailer');
const alertSummary = require('../scripts/alertSummary.js');
const { name, version } = require('../../package.json');

const REPO_URL = 'https://github.com/sefinek/Cloudflare-WAF-Expressions';
const { MAILER_HOST, MAILER_PORT, MAILER_AUTH_USER, MAILER_AUTH_PASSWD, MAILER_TO } = process.env;
const NOTIFY_ON_UPDATE = (process.env.NOTIFY_ON_UPDATE_MAILER || 'false').toLowerCase() === 'true';

let transporter = null;
const getTransporter = () => {
	if (!MAILER_HOST) return null;
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: MAILER_HOST,
			port: parseInt(MAILER_PORT) || 587,
			secure: parseInt(MAILER_PORT) === 465,
			auth: MAILER_AUTH_USER ? { user: MAILER_AUTH_USER, pass: MAILER_AUTH_PASSWD } : undefined,
		});
	}
	return transporter;
};

module.exports = async allAlerts => {
	const alerts = NOTIFY_ON_UPDATE ? allAlerts : allAlerts.filter(a => a.type !== 1);
	if (!alerts.length) return;

	const transport = getTransporter();
	const to = MAILER_TO || MAILER_AUTH_USER;
	if (!transport || !to) return;

	const { summary } = alertSummary(alerts);
	const subject = `[${name}] ${summary}`;
	const label = a => a.type === 3 ? 'ERROR' : a.type === 2 ? 'WARN' : 'UPDATE';
	const text = `${alerts.map(a => `[${label(a)}] ${a.msg}`).join('\n')}\n\n${name} v${version} - ${REPO_URL}`;

	try {
		await transport.sendMail({ from: MAILER_AUTH_USER, to, subject, text });
	} catch (err) {
		console.error(`[X] Failed to send alert email: ${err.message}`);
	}
};
