const pluralize = require('./pluralize.js');

module.exports = alerts => {
	const errorCount = alerts.filter(a => a.type === 3).length;
	const warnCount = alerts.filter(a => a.type === 2).length;
	const updateCount = alerts.filter(a => a.type === 1).length;
	const summary = [
		errorCount && `${errorCount} ${pluralize(errorCount, 'error')}`,
		warnCount && `${warnCount} ${pluralize(warnCount, 'warning')}`,
		updateCount && `${updateCount} ${pluralize(updateCount, 'update')}`,
	].filter(Boolean).join(', ');

	return { errorCount, warnCount, updateCount, summary };
};
