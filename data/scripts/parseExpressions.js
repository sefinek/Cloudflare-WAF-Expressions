const fs = require('node:fs/promises');
const log = require('./log.js');

const PATTERN = /##\s*([^<\n]*)[^\n]*\n> \*\*Action:\*\* ([^\n]*)\n+```([\s\S]*?)```/gi;

const envFlag = name => (process.env[name] || 'false').toLowerCase() === 'true';

const parseExpressions = (text, { php = envFlag('PHP_SUPPORT'), wp = envFlag('WORDPRESS_SUPPORT') } = {}) => {
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
		if (php) {
			cleaned = cleaned.replace(/\s*\(\s*(?:http\.request\.uri\.path|url_decode\(http\.request\.uri\.path,\s*"r"\))\s+(?:wildcard|contains|eq)\s+"[^"]*\.php[^"]*"(?:\s+and\s+[^)]+)?\s*\)\s*(?:or|$)/gi, '');
		}

		if (wp) {
			cleaned = cleaned.replace(/\s*\(\s*(?:http\.request\.uri\.path|url_decode\(http\.request\.uri\.path,\s*"r"\))\s+wildcard\s+"[^"]*\/wp-(?:admin|content|includes)[^"]*"(?:\s+and\s+[^)]+)?\s*\)\s*(?:or|$)/gi, '');
		}

		if (php || wp) {
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

module.exports = async (filePath = 'rules/expressions.md', overrides = {}) => {
	// Validate environment variables
	const phpSupport = process.env.PHP_SUPPORT || 'false';
	if (!['true', 'false'].includes(phpSupport)) log('Invalid PHP_SUPPORT value. Must be "true" or "false"', 2);

	const wpSupport = process.env.WORDPRESS_SUPPORT || 'false';
	if (!['true', 'false'].includes(wpSupport)) log('Invalid WORDPRESS_SUPPORT value. Must be "true" or "false"', 2);

	const php = overrides.php ?? phpSupport.toLowerCase() === 'true';
	const wp = overrides.wp ?? wpSupport.toLowerCase() === 'true';
	if (wp && !php) log('WORDPRESS_SUPPORT=true but PHP_SUPPORT is not enabled - WordPress requires PHP; set PHP_SUPPORT=true to avoid broken functionality', 2);

	try {
		// Extract expressions
		let data = await fs.readFile(filePath, 'utf8');

		// Replace hardcoded IP list name with the configured one
		const listName = process.env.CF_IP_BLOCKLIST_NAME || process.env.CF_IP_LIST_NAME || 'sefinek_cf_waf';
		data = data.replace(/ip\.src in \$\w+/g, `ip.src in $${listName}`);

		const parsed = parseExpressions(data, { php, wp });
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

		log(`Parsed ${result._meta.blocks} expression blocks from ${filePath} (rules version: ${result._meta.version}, length: ${result._meta.totalLength} characters); PHP support: ${php ? 'Enabled' : 'Disabled'}; WordPress support: ${wp ? 'Enabled' : 'Disabled'}`, 1);
		return Object.keys(result).length ? result : null;
	} catch (err) {
		log(`Error reading the file: ${err.message}`, 3);
		return null;
	}
};

module.exports.parse = parseExpressions;
