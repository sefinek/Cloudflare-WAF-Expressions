process.loadEnvFile();
const { CronJob } = require('cron');
const { pullAndRestart } = require('./data/services/updates.js');
const updateWAFRules = require('./data/services/cloudflare/updateWAFRules.js');
const { version, author } = require('./package.json');
const log = require('./data/scripts/log.js');

log(`Author: ${author} | https://github.com/sefinek/Cloudflare-WAF-Expressions (v${version})`);

// Validate environment variables
const { NODE_ENV, CF_API_TOKEN, CF_ACCOUNT_ID } = process.env;
if (NODE_ENV !== 'production' && NODE_ENV !== 'development') {
	log('NODE_ENV is not set (process.env.NODE_ENV)', 2);
}

if (!CF_API_TOKEN || typeof CF_API_TOKEN !== 'string' || CF_API_TOKEN.trim() === '') {
	throw new Error('Missing or invalid Cloudflare API token (process.env.CF_API_TOKEN)');
}

if (!CF_ACCOUNT_ID) {
	log('CF_ACCOUNT_ID is not set - IP list sync (rules/ip-blocklist.txt) will be skipped', 2);
}

// Cron jobs
new CronJob(process.env.GIT_PULL_CRON || '30 8 * * *', pullAndRestart, null, true); // At 8:30.
new CronJob(process.env.RULES_UPDATE_CRON || '0 9,15,18,22 * * *', updateWAFRules, null, true); // At 9:00, 15:00, 18:00 and 22:00.

// Run the job immediately
void updateWAFRules();

// PM2 signal
process.send && process.send('ready');