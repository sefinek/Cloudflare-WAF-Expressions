const { cases, verdict } = require('../data/tools/probeWAF.js');

describe('WAF probe verdicts', () => {
	test('does not repeat endpoints', () => {
		expect(new Set(cases.map(item => item.endpoint)).size).toBe(cases.length);
	});

	test('does not count a challenge as a confirmed block', () => {
		expect(verdict(403, true, 'block')).toMatch(/^INCONCLUSIVE:/);
		expect(verdict(403, false, 'block')).toMatch(/^PASS:/);
	});

	test.each([301, 302, 429, 500, 503])('treats HTTP %i as inconclusive', status => {
		expect(verdict(status, false, 'block')).toMatch(/^INCONCLUSIVE:/);
	});

	test('distinguishes missing protected files from missing control paths', () => {
		expect(verdict(404, false, 'block')).toMatch(/^FAIL:/);
		expect(verdict(404, false, 'control')).toMatch(/^PASS:/);
	});

	test('flags rejection of a control request', () => {
		expect(verdict(403, false, 'control')).toMatch(/^FAIL:/);
	});

	test('does not assert success for deployment-dependent probes', () => {
		expect(verdict(200, false, 'observe')).toMatch(/^OBSERVED:/);
		expect(verdict(403, false, 'observe')).toMatch(/^OBSERVED:/);
	});
});
