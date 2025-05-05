const simpleGit = require('simple-git');
const restartApp = require('./reloadApp.js');
const log = require('../scripts/log.js');

const git = simpleGit();

const pull = async () => {
	try {
		if (process.env.NODE_ENV === 'production') {
			log('Resetting local repository to HEAD (--hard)...', 0);
			await git.reset(['--hard']);
		}

		log('Pulling the repository and the required submodule...');
		const { summary } = await git.pull(['--recurse-submodules']);

		const { changes, insertions, deletions } = summary;
		if (changes > 0 || insertions > 0 || deletions > 0) {
			log(`Updates detected. Changes: ${changes}; Insertions: ${insertions}; Deletions: ${deletions}`);
			return true;
		} else {
			log('No new updates detected', 1);
			return false;
		}
	} catch (err) {
		log(err, 3);
		return null;
	}
};

const pullAndRestart = async () => {
	try {
		const updatesAvailable = await pull();
		if (updatesAvailable) await restartApp();
	} catch (err) {
		log(err, 3);
	}
};

module.exports = { pull, pullAndRestart };