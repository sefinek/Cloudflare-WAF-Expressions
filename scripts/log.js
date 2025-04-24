const levels = {
	0: '[i]',
	1: '[✔]',
	2: '[⚠]',
	3: '[×]',
	4: '[D]',
};

module.exports = (level, message) => {
	const logFunction = level === 2 ? console.warn : level >= 3 ? console.error : console.log;
	logFunction(`${levels[level] || '[?]'} ${message}`);
};