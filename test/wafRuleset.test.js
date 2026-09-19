jest.mock('../data/scripts/log.js');

const log = require('../data/scripts/log.js');
const {
	isPartDescription,
	isManagedDescription,
	buildZoneExpression,
	getRuleCap,
	BLOCKLIST_DESCRIPTION,
} = require('../data/services/cloudflare/wafRuleset.js');

describe('isPartDescription', () => {
	test('matches the exact part number', () => {
		expect(isPartDescription('🔥 Part 1 - Suspicious paths & headers', 1)).toBe(true);
	});

	test('does not match a different part sharing a numeric prefix (Part 1 vs Part 10)', () => {
		expect(isPartDescription('🦕 Part 10 - Something', 1)).toBe(false);
	});

	test('does not match a different part sharing a numeric prefix (Part 1 vs Part 12)', () => {
		expect(isPartDescription('Part 12 - Something', 1)).toBe(false);
	});

	test('handles a missing description', () => {
		expect(isPartDescription(undefined, 1)).toBe(false);
	});
});

describe('isManagedDescription', () => {
	test('recognizes Part descriptions', () => {
		expect(isManagedDescription('🔥 Part 3 - Malicious extensions')).toBe(true);
	});

	test('recognizes the blocklist description', () => {
		expect(isManagedDescription(BLOCKLIST_DESCRIPTION)).toBe(true);
	});

	test('does not flag unrelated user rules', () => {
		expect(isManagedDescription('My custom dashboard rule')).toBe(false);
	});
});

describe('buildZoneExpression', () => {
	const zone = { name: 'sefinek.net', id: 'zone-id-123' };

	test('returns null when there are no applicable entries', () => {
		expect(buildZoneExpression([], zone)).toBeNull();
	});

	test('returns the single expression as-is when only one entry applies', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: null, exclude: false }];
		expect(buildZoneExpression(entries, zone)).toBe('ip.src eq 1.2.3.4');
	});

	test('combines multiple applicable entries with OR', () => {
		const entries = [
			{ expression: 'ip.src eq 1.2.3.4', zone: null, exclude: false },
			{ expression: 'ip.src eq 5.6.7.8', zone: null, exclude: false },
		];
		expect(buildZoneExpression(entries, zone)).toBe('(ip.src eq 1.2.3.4) or (ip.src eq 5.6.7.8)');
	});

	test('respects a [zone] scoped entry for a matching zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'sefinek.net', exclude: false }];
		expect(buildZoneExpression(entries, zone)).toBe('ip.src eq 1.2.3.4');
	});

	test('excludes a [zone] scoped entry for a non-matching zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'other.net', exclude: false }];
		expect(buildZoneExpression(entries, zone)).toBeNull();
	});

	test('respects a [!zone] excluded entry for the excluded zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'sefinek.net', exclude: true }];
		expect(buildZoneExpression(entries, zone)).toBeNull();
	});

	test('applies a [!zone] excluded entry to every other zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'other.net', exclude: true }];
		expect(buildZoneExpression(entries, zone)).toBe('ip.src eq 1.2.3.4');
	});
});

describe('getRuleCap', () => {
	afterEach(() => jest.clearAllMocks());

	test.each([
		['free', 5],
		['lite', 5],
		['pro', 20],
		['business', 100],
		['enterprise', 1000],
	])('returns %s -> %i', (legacy_id, expected) => {
		expect(getRuleCap({ name: 'sefinek.net', plan: { legacy_id } })).toBe(expected);
	});

	test('falls back to the Free cap and warns once for an unknown plan', () => {
		const zone = { name: 'sefinek.net', plan: { legacy_id: 'mystery' } };
		expect(getRuleCap(zone)).toBe(5);
		expect(getRuleCap(zone)).toBe(5);
		expect(log).toHaveBeenCalledTimes(1);
	});

	test('does not treat prototype properties as a known plan (Object.hasOwn guard)', () => {
		const zone = { name: 'sefinek.net', plan: { legacy_id: 'constructor' } };
		expect(getRuleCap(zone)).toBe(5);
	});

	test('falls back to the Free cap when the zone has no plan info', () => {
		expect(getRuleCap({ name: 'sefinek.net', plan: undefined })).toBe(5);
	});
});
