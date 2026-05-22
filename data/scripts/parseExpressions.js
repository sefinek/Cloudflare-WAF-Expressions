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

		// Filter out PHP-related and WordPress static asset rules based on environment flags
		const phpSupport = process.env.PHP_SUPPORT || 'false';
		if (phpSupport.toLowerCase() === 'true') {
			cleaned = cleaned.replace(/\s*\(\s*http\.request\.uri\.path\s+(?:wildcard|contains|eq)\s+"[^"]*\.php[^"]*"(?:\s+and\s+[^)]+)?\s*\)\s*(?:or|$)/gi, '');
		}

		const wpSupport = process.env.WORDPRESS_SUPPORT || 'false';
		if (wpSupport.toLowerCase() === 'true') {
			cleaned = cleaned.replace(/\s*\(\s*http\.request\.uri\.path\s+wildcard\s+"[^"]*\/wp-(?:content|includes)[^"]*"\s*\)\s*(?:or|$)/gi, '');
		}

		if (phpSupport.toLowerCase() === 'true' || wpSupport.toLowerCase() === 'true') {
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
	// Validate environment variables
	const phpSupport = process.env.PHP_SUPPORT || 'false';
	if (!['true', 'false'].includes(phpSupport)) log('Invalid PHP_SUPPORT value. Must be "true" or "false"', 2);

	const wpSupport = process.env.WORDPRESS_SUPPORT || 'false';
	if (!['true', 'false'].includes(wpSupport)) log('Invalid WORDPRESS_SUPPORT value. Must be "true" or "false"', 2);
	if (wpSupport.toLowerCase() === 'true' && phpSupport.toLowerCase() !== 'true') log('WORDPRESS_SUPPORT=true but PHP_SUPPORT is not enabled - WordPress requires PHP; set PHP_SUPPORT=true to avoid broken functionality', 2);

	try {
		// Extract expressions
		let data = await fs.readFile('rules/expressions.md', 'utf8');

		// Replace hardcoded IP list name with the configured one
		const listName = process.env.CF_IP_LIST_NAME || 'sefinek_cf_waf';
		data = data.replace(/ip\.src in \$\w+/g, `ip.src in $${listName}`);

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

		log(`Parsed ${result._meta.blocks} expression blocks (rules version: ${result._meta.version}, length: ${result._meta.totalLength} characters); PHP support: ${phpSupport === 'true' ? 'Enabled' : 'Disabled'}; WordPress support: ${wpSupport === 'true' ? 'Enabled' : 'Disabled'}`, 1);
		return Object.keys(result).length ? result : null;
	} catch (err) {
		log(`Error reading the file: ${err.message}`, 3);
		return null;
	}
};

module.exports = parseExpressionsMain;

if (require.main === module) {
	const assert = (label, condition) => log(`${label}: ${condition ? 'PASSED' : 'FAILED'}`, condition ? 1 : 3);

	(async () => {
		// Test 1: basic parsing with PHP_SUPPORT disabled
		process.env.PHP_SUPPORT = 'false';
		process.env.WORDPRESS_SUPPORT = 'false';
		process.env.CF_IP_LIST_NAME = 'sefinek_cf_waf';
		const r1 = await parseExpressionsMain();
		assert('Test 1 - PHP_SUPPORT=false: parses successfully', r1 !== null);

		// Test 2: basic parsing with PHP_SUPPORT enabled
		process.env.PHP_SUPPORT = 'true';
		const r2 = await parseExpressionsMain();
		assert('Test 2 - PHP_SUPPORT=true: parses successfully', r2 !== null);

		// Test 3: .php expressions must be absent when PHP_SUPPORT=true
		const allExpressions2 = Object.values(r2).filter(b => b?.expressions).map(b => b.expressions).join(' ');
		assert('Test 3 - PHP_SUPPORT=true: .php rule removed', !allExpressions2.includes('.php'));

		// Test 4: .php expressions must be present when PHP_SUPPORT=false
		process.env.PHP_SUPPORT = 'false';
		const r4 = await parseExpressionsMain();
		const allExpressions4 = Object.values(r4).filter(b => b?.expressions).map(b => b.expressions).join(' ');
		assert('Test 4 - PHP_SUPPORT=false: .php rule present', allExpressions4.includes('.php'));

		// Test 5: CF_IP_LIST_NAME is injected into expressions
		process.env.CF_IP_LIST_NAME = 'test_list_123';
		const r5 = await parseExpressionsMain();
		const allExpressions5 = Object.values(r5).filter(b => b?.expressions).map(b => b.expressions).join(' ');
		assert('Test 5 - CF_IP_LIST_NAME injected into expressions', allExpressions5.includes('$test_list_123'));
		assert('Test 5 - CF_IP_LIST_NAME: old name absent', !allExpressions5.includes('$sefinek_cf_waf'));

		// Test 6: wp-content and wp-includes rules removed when WORDPRESS_SUPPORT=true
		process.env.PHP_SUPPORT = 'true';
		process.env.WORDPRESS_SUPPORT = 'true';
		process.env.CF_IP_LIST_NAME = 'sefinek_cf_waf';
		const r6 = await parseExpressionsMain();
		const allExpressions6 = Object.values(r6).filter(b => b?.expressions).map(b => b.expressions).join(' ');
		assert('Test 6 - WORDPRESS_SUPPORT=true: wp-content rule removed', !allExpressions6.includes('/wp-content'));
		assert('Test 6 - WORDPRESS_SUPPORT=true: wp-includes rule removed', !allExpressions6.includes('/wp-includes'));
		assert('Test 6 - WORDPRESS_SUPPORT=true: wp-admin rule kept', allExpressions6.includes('/wp-admin'));

		// Test 7: wp-content and wp-includes rules present when WORDPRESS_SUPPORT=false
		process.env.WORDPRESS_SUPPORT = 'false';
		const r7 = await parseExpressionsMain();
		const allExpressions7 = Object.values(r7).filter(b => b?.expressions).map(b => b.expressions).join(' ');
		assert('Test 7 - WORDPRESS_SUPPORT=false: wp-content rule present', allExpressions7.includes('/wp-content'));
		assert('Test 7 - WORDPRESS_SUPPORT=false: wp-includes rule present', allExpressions7.includes('/wp-includes'));
	})();
}