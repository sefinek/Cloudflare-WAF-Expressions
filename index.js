require('dotenv').config();
const { CronJob } = require('cron');
const simpleGit = require('simple-git');
const git = simpleGit();
const executeWAFRuleUpdate = require('./jobs/updateWAFRules.js');
const restartApp = require('./jobs/reloadApp.js');
const log = require('./scripts/log.js');
const { version } = require('./package.json');

log(0, `v${version} | https://github.com/sefinek/Cloudflare-WAF-Rules`);

const gitPullAndMaybeRestart = async () => {
	log(0, 'Checking for updates...');

	try {
		const { summary } = await git.pull();
		if (!(summary.changes > 0 || summary.deletions > 0 || summary.insertions > 0)) return;

		log(0, `Git changes detected: ${JSON.stringify(summary)}`);
		await restartApp();
	} catch (err) {
		log(3, `Git pull failed: ${err.message}`);
	}
};

// Cron jobs
new CronJob(process.env.RULES_UPDATE_CRON || '0 11 * * *', gitPullAndMaybeRestart, null, true); // At 11:00.
new CronJob(process.env.GIT_PULL_CRON || '0 11,14,16,18,20 * * *', executeWAFRuleUpdate, null, true); // At minute 0 past hour 11, 14, 16, 18, and 20.

// Run the jobs immediately
(async () => {
	await gitPullAndMaybeRestart();
	await executeWAFRuleUpdate();
})();

// PM2
process.send && process.send('ready');