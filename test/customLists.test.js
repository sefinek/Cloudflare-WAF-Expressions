const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule.js');

process.env.CF_API_TOKEN ||= 'test';
mockModule('../data/scripts/log.js', Object.assign(mock.fn(), { notify: mock.fn() }));

let entrypointRules = [];
let putRules = null;
mockModule('../data/services/axios.js', {
	axiosCf: {
		get: async () => ({ data: { success: true, result: { rules: entrypointRules } } }),
		put: async (url, body) => {
			putRules = body.rules;
			return { data: { success: true } };
		},
	},
	getRequestCfCount: () => 0,
	getRequestScCount: () => 0,
	getRequestAbCount: () => 0,
});

const { updateWAFCustomRulesForZone, pickHostIndex } = require('../data/services/cloudflare/updateWAFRules.js');
const { CUSTOM_LISTS, CHALLENGELIST_DESCRIPTION, BLOCKLIST_DESCRIPTION } = require('../data/services/cloudflare/wafRuleset.js');

const part = (name, action, expressions) => ({ name, action, expressions, length: expressions.length });
const EXPRESSIONS = {
	1: part('Part 1', 'block', '(http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git/")'),
	2: part('Part 2', 'block', '(http.request.uri.path contains "/wp-login")'),
	3: part('Part 3', 'block', '(http.user_agent contains "BadBot") or (http.user_agent contains "OtherBot") or (http.user_agent contains "x")'),
	4: part('Part 4', 'block', '(ip.src in $sefinek_cf_waf) or (http.user_agent contains "msie")'),
	5: part('Part 5', 'managed_challenge', '(http.user_agent contains "chrome/120")'),
	_meta: { version: 'test' },
};

const BOORU = 'starts_with(lower(http.request.uri.path), "/booru") and not cf.client.bot';

const zone = (name, plan = 'free') => ({ id: `id-${name}`, name, plan: { legacy_id: plan } });
const lists = ({ blocklist = [], challengelist = [] } = {}) => CUSTOM_LISTS.map(list => ({
	list,
	entries: { blocklist, challengelist }[list.key],
	hostIndex: pickHostIndex(EXPRESSIONS, list.action),
}));

const ruleFor = description => putRules.find(r => r.description === description);

beforeEach(() => {
	entrypointRules = [];
	putRules = null;
});

describe('pickHostIndex', () => {
	test('picks the shortest Part with the same action', () => {
		assert.equal(pickHostIndex(EXPRESSIONS, 'block'), 2);
		assert.equal(pickHostIndex(EXPRESSIONS, 'managed_challenge'), 5);
		assert.equal(pickHostIndex(EXPRESSIONS, 'js_challenge'), null);
	});
});

describe('challengelist.txt', () => {
	test('on the Free plan, a zone-scoped entry is merged into the Managed Challenge Part of that zone only', async () => {
		const result = await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({ challengelist: [{ expression: BOORU, zone: 'nekosia.cat', exclude: false }] }), zone('nekosia.cat'));

		assert.equal(result.status, 'Updated');
		assert.equal(putRules.length, 5);
		assert.equal(ruleFor('Part 5').action, 'managed_challenge');
		assert.equal(ruleFor('Part 5').expression, `${EXPRESSIONS[5].expressions} or (${BOORU})`);
		assert.match(result.lists.challengelist, /^Active \(merged into "Part 5"/);
		assert.equal(result.lists.blocklist, 'None');

		await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({ challengelist: [{ expression: BOORU, zone: 'nekosia.cat', exclude: false }] }), zone('sefinek.net'));
		assert.equal(ruleFor('Part 5').expression, EXPRESSIONS[5].expressions);
	});

	test('with a spare rule slot, it gets its own Managed Challenge rule', async () => {
		const result = await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({ challengelist: [{ expression: BOORU, zone: null, exclude: false }] }), zone('nekosia.cat', 'pro'));

		assert.equal(putRules.length, 6);
		assert.deepEqual({ ...ruleFor(CHALLENGELIST_DESCRIPTION), id: undefined }, { action: 'managed_challenge', expression: BOORU, description: CHALLENGELIST_DESCRIPTION, enabled: true, id: undefined });
		assert.equal(ruleFor('Part 5').expression, EXPRESSIONS[5].expressions);
		assert.match(result.lists.challengelist, /^Active \(own rule/);
	});

	test('the existing rule ID is kept, so the rule is updated in place', async () => {
		entrypointRules = [{ id: 'rule-1', action: 'managed_challenge', expression: 'old', description: CHALLENGELIST_DESCRIPTION, enabled: true }];
		await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({ challengelist: [{ expression: BOORU, zone: null, exclude: false }] }), zone('nekosia.cat', 'pro'));
		assert.equal(ruleFor(CHALLENGELIST_DESCRIPTION).id, 'rule-1');
	});

	test('the allowlist also bypasses the challenge list', async () => {
		await updateWAFCustomRulesForZone(EXPRESSIONS, [{ expression: 'ip.src eq 1.2.3.4', zone: null, exclude: false }], lists({ challengelist: [{ expression: BOORU, zone: null, exclude: false }] }), zone('nekosia.cat', 'pro'));
		assert.equal(ruleFor(CHALLENGELIST_DESCRIPTION).expression, `not (ip.src eq 1.2.3.4) and (${BOORU})`);
	});
});

describe('blocklist.txt and challengelist.txt together', () => {
	test('each list is merged into a Part with its own action on the Free plan', async () => {
		const result = await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({
			blocklist: [{ expression: 'ip.src eq 5.6.7.8', zone: null, exclude: false }],
			challengelist: [{ expression: BOORU, zone: null, exclude: false }],
		}), zone('nekosia.cat'));

		assert.equal(putRules.length, 5);
		assert.equal(ruleFor('Part 2').expression, `${EXPRESSIONS[2].expressions} or (ip.src eq 5.6.7.8)`);
		assert.equal(ruleFor('Part 5').expression, `${EXPRESSIONS[5].expressions} or (${BOORU})`);
		assert.match(result.lists.blocklist, /merged into "Part 2"/);
		assert.match(result.lists.challengelist, /merged into "Part 5"/);
	});

	test('on Pro both get their own rules, and old blocklist behavior is unchanged', async () => {
		await updateWAFCustomRulesForZone(EXPRESSIONS, [], lists({
			blocklist: [{ expression: 'ip.src eq 5.6.7.8', zone: null, exclude: false }],
			challengelist: [{ expression: BOORU, zone: null, exclude: false }],
		}), zone('nekosia.cat', 'pro'));

		assert.equal(putRules.length, 7);
		assert.equal(ruleFor(BLOCKLIST_DESCRIPTION).action, 'block');
		assert.equal(ruleFor(CHALLENGELIST_DESCRIPTION).action, 'managed_challenge');
	});
});
