process.loadEnvFile();
const { CronJob } = require('cron');
const checkForUpdates = require('./data/services/version.js');
const updateWAFRules = require('./data/services/cloudflare/updateWAFRules.js');
const { version, author } = require('./package.json');
const log = require('./data/scripts/log.js');
const box = require('./data/scripts/box.js');

const CF_ORANGE = '\x1b[38;5;208m';
box([
	'               Cloudflare WAF Expressions',
	`                   v${version} by ${author.split('<')[0].trim()}`,
	'',
	'https://github.com/sefinek/Cloudflare-WAF-Expressions',
], CF_ORANGE);

// Validate environment variables
const { CF_API_TOKEN, CF_ACCOUNT_ID, MAILER_HOST, DISCORD_WEBHOOK_URL, GIT_PULL_CRON } = process.env;
if (!CF_API_TOKEN || typeof CF_API_TOKEN !== 'string' || CF_API_TOKEN.trim() === '') {
	throw new Error('Missing or invalid Account API token (process.env.CF_API_TOKEN)');
}

if (!CF_ACCOUNT_ID) {
	log('CF_ACCOUNT_ID is not set - IP list sync (rules/ip-blocklist.txt) will be skipped', 2);
}

if (!MAILER_HOST && !DISCORD_WEBHOOK_URL) {
	log('Neither MAILER_HOST nor DISCORD_WEBHOOK_URL is set - alerts for warnings/errors are disabled. Configuring at least one is highly recommended, otherwise sync failures may go unnoticed.', 2);
}

if (GIT_PULL_CRON !== undefined) {
	log('GIT_PULL_CRON is no longer used. The script does not update itself anymore: rules are downloaded automatically, and you will be notified when a new version of the script is available. Please remove it from your .env file.', 2);
}

// Cron jobs
new CronJob(process.env.RULES_UPDATE_CRON || '0 9,15,18,22 * * *', updateWAFRules, null, true); // At 9:00, 15:00, 18:00 and 22:00.
new CronJob('0 8,20 * * *', checkForUpdates, null, true); // At 8:00 and 20:00.

// Run the jobs immediately
void checkForUpdates();
void updateWAFRules();

// PM2 signal
process.send && process.send('ready');
