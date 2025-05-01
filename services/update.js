const simpleGit = require('simple-git');
const log = require('../scripts/log.js');
const restartApp = require('./reloadApp.js');

const git = simpleGit();

const gitPull = async () => {
	log('Checking for updates...');

	try {
		const { summary } = await git.pull();
		if (!(summary.changes > 0 || summary.deletions > 0 || summary.insertions > 0)) return false;

		log(`Git changes detected: ${JSON.stringify(summary)}`);
		return true;
	} catch (err) {
		log(`Git pull failed! ${err.message}`, 3);
		return null;
	}
};

const gitPullAndRestart = async () => {
	const restart = await gitPull();
	if (restart) await restartApp();
};

module.exports = { gitPull, gitPullAndRestart };