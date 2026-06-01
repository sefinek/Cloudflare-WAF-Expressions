const path = require('node:path');
const parseExpressions = require('../data/scripts/parseExpressions.js');

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

	test('WORDPRESS_SUPPORT removes wp-content/wp-includes but keeps wp-admin', async () => {
		const all = joinExpressions(await run({ php: 'true', wp: 'true' }));
		expect(all).not.toContain('/wp-content');
		expect(all).not.toContain('/wp-includes');
		expect(all).toContain('/wp-admin');
	});

	test('CF_IP_BLOCKLIST_NAME is injected into the expressions', async () => {
		const all = joinExpressions(await run({ list: 'custom_list_42' }));
		expect(all).toContain('$custom_list_42');
		expect(all).not.toContain('$sefinek_cf_waf');
	});
});
