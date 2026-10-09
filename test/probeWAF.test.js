const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { cases, verdict } = require('../data/tools/probeWAF.js');

describe('WAF probe verdicts', () => {
	test('does not repeat endpoints', () => {
		assert.equal(new Set(cases.map(item => item.endpoint)).size, cases.length);
	});

	test('does not count a challenge as a confirmed block', () => {
		assert.match(verdict(403, true, 'block'), /^INCONCLUSIVE:/);
		assert.match(verdict(403, false, 'block'), /^PASS:/);
	});

	for (const status of [301, 302, 429, 500, 503]) {
		test(`treats HTTP ${status} as inconclusive`, () => {
			assert.match(verdict(status, false, 'block'), /^INCONCLUSIVE:/);
		});
	}

	test('distinguishes missing protected files from missing control paths', () => {
		assert.match(verdict(404, false, 'block'), /^FAIL:/);
		assert.match(verdict(404, false, 'control'), /^PASS:/);
	});

	test('flags rejection of a control request', () => {
		assert.match(verdict(403, false, 'control'), /^FAIL:/);
	});

	test('does not assert success for deployment-dependent probes', () => {
		assert.match(verdict(200, false, 'observe'), /^OBSERVED:/);
		assert.match(verdict(403, false, 'observe'), /^OBSERVED:/);
	});
});
