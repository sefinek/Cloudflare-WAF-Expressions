require('dotenv').config();
const { CronJob } = require('cron');
const simpleGit = require('simple-git');
const git = simpleGit();
const executeWAFRuleUpdate = require('./jobs/updateWAFRules.js');
const log = require('./scripts/log.js');
const { version } = require('./package.json');

log(0, `Cloned version: v${version}`);

const pullAndUpdateWAFRules = async () => {
	try {
		const { summary } = await git.pull();
		log(0, JSON.stringify(summary));

		await executeWAFRuleUpdate();
	} catch (err) {
		log(3, 'Git pull failed:', err.message);
	}

	// log(0, '========= New update (30.10.2024). Consider removing all rules and make sure you have the latest version of this script. Then, run it again. =========');
};

// https://crontab.guru
new CronJob(process.env.RULES_UPDATE_SCHEDULE || '0 11,14,16,18,20 * * *', pullAndUpdateWAFRules, null, true, 'UTC'); // At minute 0 past hour 11, 14, 16, 18, and 20
(async () => pullAndUpdateWAFRules())();

if (process.env.NODE_ENV === 'production') {
	const restartApp = require('./jobs/reloadApp.js');
	new CronJob(process.env.APP_RESTART_SCHEDULE || '0 15 * * *', restartApp, null, true, 'UTC'); // At 15:00
}

// PM2
process.send && process.send('ready');