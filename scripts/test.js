const expressionParser = require('./parseExpressions.js');

(async () => {
	const expressions = await expressionParser();
	console.log(expressions);
})();