const fs = require('node:fs/promises');
const log = require('./log.js');

const PATTERN = /##\s*([^<\n]*)[^\n]*\n> \*\*Action:\*\* ([^\n]*)\n+```([\s\S]*?)```/gi;

const parseExpressions = text => {
	const blocks = [...text.matchAll(PATTERN)];

	return blocks.map(([, name, action, rawExpressions]) => {
		const quotedParts = [];
		let index = 0;

		let restored = rawExpressions
			.replace(/"((?:[^"\\]|\\.)*)"/g, (_, quote) => {
				const key = `__QUOTE_PLACEHOLDER_${index++}__`;
				quotedParts.push({ key, value: quote });
				return key;
			})
			.replace(/[\n\r]+/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/\{\s+/g, '{')
			.replace(/\s+}/g, '}')
			.trim();

		for (const { key, value } of quotedParts) {
			restored = restored.replace(key, `"${value}"`);
		}

		const cleaned = restored.trim();
		return {
			name: name.trim(),
			length: cleaned.length,
			action: action.trim().toLowerCase().replace(/\s+/g, '_'),
			expressions: cleaned,
		};
	});
};

module.exports = async () => {
	log('Parsing expressions from the markdown file...');

	try {
		const data = await fs.readFile('markdown/expressions.md', 'utf8');
		const parsed = parseExpressions(data);
		if (!parsed.length) {
			log('No code blocks found', 2);
			return null;
		}

		const result = parsed.reduce((acc, block, idx) => {
			if (!block.expressions) {
				log(`Block ${block.name} has empty expressions`, 2);
				return acc;
			}
			acc[idx + 1] = block;
			return acc;
		}, {});

		return Object.keys(result).length ? result : null;
	} catch (err) {
		log(`Error reading the file: ${err.message}`, 3);
		return null;
	}
};