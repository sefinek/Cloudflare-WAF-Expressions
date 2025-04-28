require('dotenv').config();

const { CronJob } = require('cron');
const simpleGit = require('simple-git');
const restartApp = require('./services/reloadApp.js');
const updateWAFRules = require('./services/cloudflare/updateWAFRules.js');
const { version, author } = require('./package.json');
const log = require('./scripts/log.js');

const git = simpleGit();

log(`https://github.com/sefinek/Cloudflare-WAF-Rules - v${version} | Author: ${author}`);

// Validate environment variables
const { NODE_ENV, CF_API_TOKEN } = process.env;
if (NODE_ENV !== 'production' && NODE_ENV !== 'development') {
	log('NODE_ENV is not set (process.env.NODE_ENV)', 2);
}
if (!CF_API_TOKEN || typeof CF_API_TOKEN !== 'string' || CF_API_TOKEN.trim() === '' || CF_API_TOKEN.length !== 40) {
	throw new Error('Missing or invalid Cloudflare API token (process.env.CF_API_TOKEN)');
}

// Update?
const gitPullAndMaybeRestart = async () => {
	log('Checking for updates...');

	try {
		const { summary } = await git.pull();
		if (!(summary.changes > 0 || summary.deletions > 0 || summary.insertions > 0)) return;

		log(`Git changes detected: ${JSON.stringify(summary)}`);
		await restartApp();
	} catch (err) {
		log(`Git pull failed! ${err.message}`, 3);
	}
};

// Cron jobs
new CronJob(process.env.RULES_UPDATE_CRON || '0 13 * * *', gitPullAndMaybeRestart, null, true); // At 13:00.
new CronJob(process.env.GIT_PULL_CRON || '0 11,14,16,18,20 * * *', updateWAFRules, null, true); // At minute 0 past hour 11, 14, 16, 18, and 20.

// Run the jobs immediately
(async () => {
	await gitPullAndMaybeRestart();
	await updateWAFRules();
})();

// PM2 signal
process.send && process.send('ready');