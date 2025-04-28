const { exec } = require('node:child_process');
const ecosystem = require('../ecosystem.config.js');
const log = require('../scripts/log.js');

const executeCmd = cmd => new Promise((resolve, reject) => {
	exec(cmd, (err, stdout, stderr) => {
		if (err) {
			log(`Error executing command: ${cmd}\n${err}`, 3);
			return reject(err);
		}
		if (stderr) log(`Warning while executing: ${cmd}\n${stderr}`, 2);

		resolve(stdout.trim());
	});
});

const CMD_1 = 'npm install --omit=dev';
const CMD_2 = (() => {
	if (!ecosystem.apps?.[0]?.name) throw new Error('Missing app name in ecosystem config');
	return `pm2 restart ${ecosystem.apps[0].name}`;
})();

module.exports = async () => {
	try {
		// 1 - npm dependencies
		log(`Running npm '${CMD_1}'...`);
		const result1 = await executeCmd(CMD_1);
		log(result1);

		// 2 - restart
		log(`Running '${CMD_2}'...`);
		const result2 = await executeCmd(CMD_2);
		log(result2);
	} catch (err) {
		log(err, 3);
	}
};