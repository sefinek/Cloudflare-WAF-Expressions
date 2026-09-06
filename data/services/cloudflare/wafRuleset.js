const log = require('../../scripts/log.js');

const PHASE = 'http_request_firewall_custom';
const PART_REGEX = /Part \d+/i;
// Hard Ruleset Engine limit, identical on every plan (Free through Enterprise) - not something Cloudflare lets you raise.
const MAX_EXPRESSION_LENGTH = 4096;

const BLOCKLIST_PATH = 'rules/my-lists/blocklist.txt';
const BLOCKLIST_DESCRIPTION = `🚫 Custom Blocklist (${BLOCKLIST_PATH})`;
const isManagedDescription = desc => PART_REGEX.test(desc) || desc === BLOCKLIST_DESCRIPTION;
const isPartDescription = (desc, index) => new RegExp(`Part ${index}\\b`).test(desc || '');

// Cloudflare caps the number of rules in the http_request_firewall_custom phase per plan.
// zone.plan.legacy_id is one of: free, lite, pro, business, enterprise.
const RULE_CAPS = { free: 5, lite: 5, pro: 20, business: 100, enterprise: 1000 };
const warnedPlans = new Set();
const getRuleCap = zone => {
	const legacyId = zone.plan?.legacy_id;
	if (legacyId in RULE_CAPS) return RULE_CAPS[legacyId];

	if (!warnedPlans.has(legacyId)) {
		warnedPlans.add(legacyId);
		log(`Unknown plan "${legacyId ?? 'unknown'}" for zone ${zone.name} - assuming the Free-tier rule cap (${RULE_CAPS.free}). Update RULE_CAPS in wafRuleset.js if this plan supports more rules.`, 2);
	}
	return RULE_CAPS.free;
};

const passthroughRule = rule => {
	const out = {
		action: rule.action,
		expression: rule.expression,
		description: rule.description,
		enabled: rule.enabled !== false,
	};
	if (rule.id) out.id = rule.id;
	if (rule.action_parameters) out.action_parameters = rule.action_parameters;
	if (rule.ref) out.ref = rule.ref;
	if (rule.logging) out.logging = rule.logging;
	return out;
};

// Combines the entries applicable to a zone (respecting [zone]/[!zone] prefixes) into a single expression
const buildZoneExpression = (entries, zone) => {
	const applicable = entries.filter(e => {
		if (!e.zone) return true;
		const matches = e.zone === zone.name || e.zone === zone.id;
		return e.exclude ? !matches : matches;
	});
	if (!applicable.length) return null;
	return applicable.length === 1
		? applicable[0].expression
		: applicable.map(e => `(${e.expression})`).join(' or ');
};

module.exports = { PHASE, PART_REGEX, MAX_EXPRESSION_LENGTH, BLOCKLIST_PATH, BLOCKLIST_DESCRIPTION, isManagedDescription, isPartDescription, passthroughRule, buildZoneExpression, getRuleCap };
