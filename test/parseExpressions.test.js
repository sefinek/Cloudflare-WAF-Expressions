const path = require('node:path');
const parseExpressions = require('../data/scripts/parseExpressions.js');

jest.mock('../data/scripts/log.js', () => jest.fn());

const joinExpressions = result => Object.values(result)
	.filter(block => block && block.expressions)
	.map(block => block.expressions)
	.join(' ');

const run = async ({ php = 'false', wp = 'false', list = 'sefinek_cf_waf' } = {}) => {
	process.env.PHP_SUPPORT = php;
	process.env.WORDPRESS_SUPPORT = wp;
	process.env.CF_IP_BLOCKLIST_NAME = list;
	return parseExpressions();
};

beforeAll(() => process.chdir(path.join(__dirname, '..')));

afterEach(() => {
	process.env.PHP_SUPPORT = 'false';
	process.env.WORDPRESS_SUPPORT = 'false';
	process.env.CF_IP_BLOCKLIST_NAME = 'sefinek_cf_waf';
});

describe('parseExpressions', () => {
	test('parses all five rule blocks', async () => {
		const result = await run();
		expect(result).not.toBeNull();
		expect(result._meta.blocks).toBe(5);
		for (let i = 1; i <= 5; i++) expect(result[i].expressions.length).toBeGreaterThan(0);
	});

	test('PHP_SUPPORT toggles the .php rule', async () => {
		expect(joinExpressions(await run({ php: 'true' }))).not.toContain('.php');
		expect(joinExpressions(await run({ php: 'false' }))).toContain('.php');
	});

	test.each(['true', 'false'])('preserves recursive query decoding with PHP_SUPPORT=%s', async php => {
		const result = await run({ php });
		expect(result[1].expressions).toContain('(url_decode(http.request.uri.query, "r") wildcard "*/.git*")');
		expect(result[1].action).toBe('block');
		expect(result[1].length).toBeLessThanOrEqual(4096);
	});

	test('WORDPRESS_SUPPORT removes wp-content/wp-includes but keeps wp-admin', async () => {
		const all = joinExpressions(await run({ php: 'true', wp: 'true' }));
		expect(all).not.toContain('/wp-content');
		expect(all).not.toContain('/wp-includes');
		expect(all).toContain('/wp-admin');
	});

	test.each([
		{ php: 'false', wp: 'false' },
		{ php: 'true', wp: 'false' },
		{ php: 'false', wp: 'true' },
		{ php: 'true', wp: 'true' },
	])('filters only the intended decoded path clauses with %j', async flags => {
		const baseline = await run();
		const result = await run(flags);
		const phpClause = '(url_decode(http.request.uri.path, "r") wildcard "*.php*" and not cf.client.bot)';
		const wpClauses = ['content', 'includes'].map(directory =>
			`(url_decode(http.request.uri.path, "r") wildcard "*/wp-${directory}*" and not cf.client.bot)`);
		const all = joinExpressions(baseline);
		for (const clause of [phpClause, ...wpClauses]) expect(all).toContain(clause);

		for (let i = 1; i <= baseline._meta.blocks; i++) {
			let expected = baseline[i].expressions;
			if (flags.php === 'true') expected = expected.replace(`${phpClause} or `, '');
			if (flags.wp === 'true') {
				for (const clause of wpClauses) expected = expected.replace(`${clause} or `, '');
			}
			expect(result[i]).toEqual({ ...baseline[i], expressions: expected, length: expected.length });
		}
		expect(joinExpressions(result)).toContain('(url_decode(http.request.uri.path, "r") wildcard "*/wp-admin*")');
	});

	test('CF_IP_BLOCKLIST_NAME is injected into the expressions', async () => {
		const all = joinExpressions(await run({ list: 'custom_list_42' }));
		expect(all).toContain('$custom_list_42');
		expect(all).not.toContain('$sefinek_cf_waf');
	});

	test.each([
		{ php: 'false', wp: 'false' },
		{ php: 'true', wp: 'false' },
		{ php: 'false', wp: 'true' },
		{ php: 'true', wp: 'true' },
	])('keeps rule limits and grouping valid with %j', async flags => {
		const result = await run(flags);
		for (let i = 1; i <= 5; i++) {
			const expression = result[i].expressions;
			expect(expression.length).toBeLessThanOrEqual(4096);
			const unquoted = expression.replace(/"(?:\\.|[^"\\])*"/g, '""');
			let depth = 0;
			for (const char of unquoted) {
				if (char === '(') depth++;
				if (char === ')') depth--;
				expect(depth).toBeGreaterThanOrEqual(0);
			}
			expect(depth).toBe(0);
			expect(unquoted).not.toMatch(/\b(?:or|and)\s+(?:or|and)\b|\b(?:or|and)\s*$/);
		}
	});

	test('preserves decoded command spaces and raw control-byte checks', async () => {
		const all = joinExpressions(await run());
		for (const field of ['path', 'query']) {
			for (const command of ['curl', 'wget']) {
				expect(all).toContain(`url_decode(http.request.uri.${field}, "r") wildcard "*${command} *"`);
				expect(all).not.toContain(`*${command}%20*`);
				expect(all).not.toContain(`*${command}+*`);
			}
		}
		for (const code of ['%00', '%0a', '%0d']) expect(all).toContain(`lower(raw.http.request.uri.query) contains "${code}"`);
		expect(all).not.toContain('squelette=../');
		expect(all).not.toContain('..%2f');
		expect(all).not.toContain('..%5c');
	});
});
