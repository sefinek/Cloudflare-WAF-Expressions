require('dotenv').config();
const { CronJob } = require('cron');
const simpleGit = require('simple-git');
const git = simpleGit();
const executeWAFRuleUpdate = require('./jobs/updateWAFRules.js');
const restartApp = require('./jobs/reloadApp.js');
const log = require('./scripts/log.js');
const { version } = require('./package.json');

log(0, `Cloned version: v${version}`);

const gitPullAndMaybeRestart = async () => {
	try {
		const { summary } = await git.pull();
		if (!(summary.changes > 0 || summary.deletions > 0 || summary.insertions > 0)) return;

		log(0, JSON.stringify(summary));
		await restartApp();
	} catch (err) {
		log(3, 'Git pull failed:', err.message);
	}
};

// Cron jobs
new CronJob(process.env.RULES_UPDATE_CRON || '0 15 */2 * *', gitPullAndMaybeRestart, null, true, 'UTC'); //
new CronJob(process.env.GIT_PULL_CRON || '0 11,14,16,18,20 * * *', executeWAFRuleUpdate, null, true, 'UTC'); //

// Run the jobs immediately
(async () => {
	await gitPullAndMaybeRestart();
	await executeWAFRuleUpdate();
})();

// PM2
process.send && process.send('ready');