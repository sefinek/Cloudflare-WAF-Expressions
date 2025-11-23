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

		let cleaned = restored.trim();

		// Filter out PHP-related rules if PHP_SUPPORT is enabled
		const phpSupport = process.env.PHP_SUPPORT || 'false';
		if (phpSupport.toLowerCase() === 'true') {
			// Remove PHP blocking expressions with proper parenthesis matching
			cleaned = cleaned.replace(/\s*\(\s*http\.request\.uri\.path\s+(?:wildcard|contains|eq)\s+"[^"]*\.php[^"]*"(?:\s+and\s+[^)]+)?\s*\)\s*(?:or|$)/gi, '');

			// Clean up remaining logical operators
			cleaned = cleaned.replace(/^\s*(?:or|and)\s+/i, ''); // Remove leading operators
			cleaned = cleaned.replace(/\s+(?:or|and)\s*$/i, ''); // Remove trailing operators
			cleaned = cleaned.replace(/\s+(?:or|and)\s+(?:or|and)\s+/gi, ' or '); // Fix double operators
			cleaned = cleaned.trim();

			// Handle edge case where expression becomes empty or invalid
			if (!cleaned || cleaned === 'or' || cleaned === 'and') cleaned = '(true)';
		}

		return {
			name: name.trim(),
			length: cleaned.length,
			action: action.trim().toLowerCase().replace(/\s+/g, '_'),
			expressions: cleaned,
		};
	});
};

const parseExpressionsMain = async () => {
	// Validate PHP_SUPPORT environment variable
	const phpSupport = process.env.PHP_SUPPORT || 'false';
	if (!['true', 'false'].includes(phpSupport)) log('Invalid PHP_SUPPORT value. Must be "true" or "false"', 2);

	try {
		// Extract expressions
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

		// _meta section
		const versionMatch = data.match(/Last update:\s*([\d.]+)/i);
		result._meta = {
			version: versionMatch ? versionMatch[1] : null,
			totalLength: parsed.reduce((sum, block) => sum + block.length, 0),
			blocks: parsed.length,
		};

		log(`Parsed ${result._meta.blocks} expression blocks (rules version: ${result._meta.version}, length: ${result._meta.totalLength} characters); PHP support: ${phpSupport === 'true' ? 'Enabled' : 'Disabled'}`, 1);
		return Object.keys(result).length ? result : null;
	} catch (err) {
		log(`Error reading the file: ${err.message}`, 3);
		return null;
	}
};

module.exports = parseExpressionsMain;

if (require.main === module) {
	(async () => {
		// Test with PHP_SUPPORT disabled
		process.env.PHP_SUPPORT = 'false';
		const resultDisabled = await parseExpressionsMain();
		log(`Test 1 - PHP_SUPPORT=false: ${resultDisabled ? 'PASSED' : 'FAILED'}`, resultDisabled ? 1 : 2);

		// Test with PHP_SUPPORT enabled
		process.env.PHP_SUPPORT = 'true';
		const resultEnabled = await parseExpressionsMain();
		log(`Test 2 - PHP_SUPPORT=true: ${resultEnabled ? 'PASSED' : 'FAILED'}`, resultEnabled ? 1 : 2);
	})();
}