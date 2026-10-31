const { describe, test, before, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mockModule } = require('./helpers/mockModule.js');

mockModule('../data/scripts/log.js', mock.fn());
const parseExpressions = require('../data/scripts/parseExpressions.js');

const FLAG_COMBINATIONS = [
	{ php: 'false', wp: 'false' },
	{ php: 'true', wp: 'false' },
	{ php: 'false', wp: 'true' },
	{ php: 'true', wp: 'true' },
];

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

before(() => process.chdir(path.join(__dirname, '..')));

afterEach(() => {
	process.env.PHP_SUPPORT = 'false';
	process.env.WORDPRESS_SUPPORT = 'false';
	process.env.CF_IP_BLOCKLIST_NAME = 'sefinek_cf_waf';
});

describe('parseExpressions', () => {
	test('parses all five rule blocks', async () => {
		const result = await run();
		assert.notEqual(result, null);
		assert.equal(result._meta.blocks, 5);
		for (let i = 1; i <= 5; i++) assert.ok(result[i].expressions.length > 0);
	});

	test('PHP_SUPPORT toggles the .php rule', async () => {
		assert.ok(!joinExpressions(await run({ php: 'true' })).includes('.php'));
		assert.ok(joinExpressions(await run({ php: 'false' })).includes('.php'));
	});

	for (const php of ['true', 'false']) {
		test(`preserves recursive query decoding with PHP_SUPPORT=${php}`, async () => {
			const result = await run({ php });
			assert.ok(result[1].expressions.includes('(url_decode(http.request.uri.query, "r") wildcard "*/.git*")'));
			assert.equal(result[1].action, 'block');
			assert.ok(result[1].length <= 4096);
		});
	}

	test('WORDPRESS_SUPPORT removes wp-admin, wp-content and wp-includes', async () => {
		const all = joinExpressions(await run({ php: 'true', wp: 'true' }));
		assert.ok(!all.includes('/wp-content'));
		assert.ok(!all.includes('/wp-includes'));
		assert.ok(!all.includes('/wp-admin'));
	});

	for (const flags of FLAG_COMBINATIONS) {
		test(`filters only the intended decoded path clauses with ${JSON.stringify(flags)}`, async () => {
			const baseline = await run();
			const result = await run(flags);
			const phpClause = '(url_decode(http.request.uri.path, "r") wildcard "*.php*" and not cf.client.bot)';
			const wpClauses = ['admin', 'content', 'includes'].map(directory =>
				`(url_decode(http.request.uri.path, "r") wildcard "*/wp-${directory}*"${directory === 'admin' ? '' : ' and not cf.client.bot'})`);
			const all = joinExpressions(baseline);
			for (const clause of [phpClause, ...wpClauses]) assert.ok(all.includes(clause), clause);

			for (let i = 1; i <= baseline._meta.blocks; i++) {
				let expected = baseline[i].expressions;
				if (flags.php === 'true') expected = expected.replace(`${phpClause} or `, '');
				if (flags.wp === 'true') {
					for (const clause of wpClauses) expected = expected.replace(`${clause} or `, '');
				}
				assert.deepEqual(result[i], { ...baseline[i], expressions: expected, length: expected.length });
			}
			assert.equal(joinExpressions(result).includes(wpClauses[0]), flags.wp !== 'true');
		});
	}

	test('overrides take precedence over the environment flags', async () => {
		const all = joinExpressions(await run());
		assert.ok(all.includes('.php'));
		process.env.PHP_SUPPORT = 'false';
		process.env.WORDPRESS_SUPPORT = 'false';
		const overridden = joinExpressions(await parseExpressions('rules/expressions.md', { php: true, wp: true }));
		assert.ok(!overridden.includes('.php*'));
		assert.ok(!overridden.includes('/wp-admin'));
	});

	test('CF_IP_BLOCKLIST_NAME is injected into the expressions', async () => {
		const all = joinExpressions(await run({ list: 'custom_list_42' }));
		assert.ok(all.includes('$custom_list_42'));
		assert.ok(!all.includes('$sefinek_cf_waf'));
	});

	for (const flags of FLAG_COMBINATIONS) {
		test(`keeps rule limits and grouping valid with ${JSON.stringify(flags)}`, async () => {
			const result = await run(flags);
			for (let i = 1; i <= 5; i++) {
				const expression = result[i].expressions;
				assert.ok(expression.length <= 4096);
				const unquoted = expression.replace(/"(?:\\.|[^"\\])*"/g, '""');
				let depth = 0;
				for (const char of unquoted) {
					if (char === '(') depth++;
					if (char === ')') depth--;
					assert.ok(depth >= 0);
				}
				assert.equal(depth, 0);
				assert.doesNotMatch(unquoted, /\b(?:or|and)\s+(?:or|and)\b|\b(?:or|and)\s*$/);
			}
		});
	}

	test('preserves decoded command spaces and raw control-byte checks', async () => {
		const all = joinExpressions(await run());
		for (const field of ['path', 'query']) {
			for (const command of ['curl', 'wget']) {
				assert.ok(all.includes(`url_decode(http.request.uri.${field}, "r") wildcard "*${command} *"`));
				assert.ok(!all.includes(`*${command}%20*`));
				assert.ok(!all.includes(`*${command}+*`));
			}
		}
		for (const code of ['%00', '%0a', '%0d']) assert.ok(all.includes(`lower(raw.http.request.uri.query) contains "${code}"`));
		assert.ok(!all.includes('squelette=../'));
		assert.ok(!all.includes('..%2f'));
		assert.ok(!all.includes('..%5c'));
	});
});
