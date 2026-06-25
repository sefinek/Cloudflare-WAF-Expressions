const PHASE = 'http_request_firewall_custom';
const PART_REGEX = /Part \d+/i;

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

module.exports = { PHASE, PART_REGEX, passthroughRule };
