const { describe, test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule.js');

const log = mockModule('../data/scripts/log.js', mock.fn());
const {
	isPartDescription,
	isManagedDescription,
	buildZoneExpression,
	getRuleCap,
	BLOCKLIST_DESCRIPTION,
} = require('../data/services/cloudflare/wafRuleset.js');

describe('isPartDescription', () => {
	test('matches the exact part number', () => {
		assert.equal(isPartDescription('🔥 Part 1 - Suspicious paths & headers', 1), true);
	});

	test('does not match a different part sharing a numeric prefix (Part 1 vs Part 10)', () => {
		assert.equal(isPartDescription('🦕 Part 10 - Something', 1), false);
	});

	test('does not match a different part sharing a numeric prefix (Part 1 vs Part 12)', () => {
		assert.equal(isPartDescription('Part 12 - Something', 1), false);
	});

	test('handles a missing description', () => {
		assert.equal(isPartDescription(undefined, 1), false);
	});
});

describe('isManagedDescription', () => {
	test('recognizes Part descriptions', () => {
		assert.equal(isManagedDescription('🔥 Part 3 - Malicious extensions'), true);
	});

	test('recognizes the blocklist description', () => {
		assert.equal(isManagedDescription(BLOCKLIST_DESCRIPTION), true);
	});

	test('does not flag unrelated user rules', () => {
		assert.equal(isManagedDescription('My custom dashboard rule'), false);
	});
});

describe('buildZoneExpression', () => {
	const zone = { name: 'sefinek.net', id: 'zone-id-123' };

	test('returns null when there are no applicable entries', () => {
		assert.equal(buildZoneExpression([], zone), null);
	});

	test('returns the single expression as-is when only one entry applies', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: null, exclude: false }];
		assert.equal(buildZoneExpression(entries, zone), 'ip.src eq 1.2.3.4');
	});

	test('combines multiple applicable entries with OR', () => {
		const entries = [
			{ expression: 'ip.src eq 1.2.3.4', zone: null, exclude: false },
			{ expression: 'ip.src eq 5.6.7.8', zone: null, exclude: false },
		];
		assert.equal(buildZoneExpression(entries, zone), '(ip.src eq 1.2.3.4) or (ip.src eq 5.6.7.8)');
	});

	test('respects a [zone] scoped entry for a matching zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'sefinek.net', exclude: false }];
		assert.equal(buildZoneExpression(entries, zone), 'ip.src eq 1.2.3.4');
	});

	test('excludes a [zone] scoped entry for a non-matching zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'other.net', exclude: false }];
		assert.equal(buildZoneExpression(entries, zone), null);
	});

	test('respects a [!zone] excluded entry for the excluded zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'sefinek.net', exclude: true }];
		assert.equal(buildZoneExpression(entries, zone), null);
	});

	test('applies a [!zone] excluded entry to every other zone', () => {
		const entries = [{ expression: 'ip.src eq 1.2.3.4', zone: 'other.net', exclude: true }];
		assert.equal(buildZoneExpression(entries, zone), 'ip.src eq 1.2.3.4');
	});
});

describe('getRuleCap', () => {
	afterEach(() => log.mock.resetCalls());

	for (const [legacyId, expected] of [
		['free', 5],
		['lite', 5],
		['pro', 20],
		['business', 100],
		['enterprise', 1000],
	]) {
		test(`returns ${legacyId} -> ${expected}`, () => {
			assert.equal(getRuleCap({ name: 'sefinek.net', plan: { legacy_id: legacyId } }), expected);
		});
	}

	test('falls back to the Free cap and warns once for an unknown plan', () => {
		const zone = { name: 'sefinek.net', plan: { legacy_id: 'mystery' } };
		assert.equal(getRuleCap(zone), 5);
		assert.equal(getRuleCap(zone), 5);
		assert.equal(log.mock.callCount(), 1);
	});

	test('does not treat prototype properties as a known plan (Object.hasOwn guard)', () => {
		const zone = { name: 'sefinek.net', plan: { legacy_id: 'constructor' } };
		assert.equal(getRuleCap(zone), 5);
	});

	test('falls back to the Free cap when the zone has no plan info', () => {
		assert.equal(getRuleCap({ name: 'sefinek.net', plan: undefined }), 5);
	});
});
