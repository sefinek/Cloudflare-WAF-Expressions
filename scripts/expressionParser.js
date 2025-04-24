const fs = require('node:fs/promises');
const log = require('./log.js');
const PATTERN = /(## [^\n]*\n> \*\*Action:\*\* ([^\n]*)\n?)```([\s\S]*?)```/gi;

const expressionParser = text => [...text.matchAll(PATTERN)].map(([, name, action, expressions]) => {
	const quotedParts = [];

	const cleanExpressions = expressions
		.replace(/"([^"]*)"/g, (_, quote) => {
			quotedParts.push(quote);
			return '__QUOTE_PLACEHOLDER__';
		})
		.replace(/[\n\r]+/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/\{\s+/g, '{')
		.replace(/\s+}/g, '}')
		.replace(/__QUOTE_PLACEHOLDER__/g, () => `"${quotedParts.shift()}"`);

	return {
		name: name.split('\n', 1)[0].replace(/^##\s*/, '').trim(),
		action: action.trim().toLowerCase().replace(/\s+/g, '_'),
		expressions: cleanExpressions.trim(),
	};
});

module.exports = async () => {
	log(0, 'Parsing expressions from the markdown file...');

	try {
		const data = await fs.readFile('markdown/expressions.md', 'utf8');
		const codeBlocks = expressionParser(data);
		if (codeBlocks.length === 0) {
			log(2, 'No code blocks found');
			return null;
		}

		return codeBlocks.reduce((acc, block, index) => {
			acc[index + 1] = block;
			return acc;
		}, {});
	} catch (err) {
		log(3, `Error reading the file: ${err.message}`);
		return null;
	}
};