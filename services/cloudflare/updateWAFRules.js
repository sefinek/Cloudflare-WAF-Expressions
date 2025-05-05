const { axios, getRequestCount } = require('../axios.js');
const expressionParser = require('../../scripts/parseExpressions.js');
const fetchWAFRules = require('./fetchWAFRules.js');
const verifyAndReorderParts = require('./verifyAndReorderParts.js');
const { pull } = require('../updates.js');
const log = require('../../scripts/log.js');

const { CF_API_TOKEN } = process.env;
if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN is missing. Check the .env file.');

const getZones = async () => {
	await pull();

	log('Retrieving all zones from your Cloudflare account...');
	const { data } = await axios.get('/zones');
	if (!data.success) throw new Error(`Failed to fetch zones. ${JSON.stringify(data?.errors)}`);

	const zones = data.result;
	log(`Successfully retrieved ${zones.length} zone(s): ${zones.map(zone => zone.name).join(', ')}`, 1);
	return zones;
};

const verifyFilterUpdate = async (zoneId, filterId, expression) => {
	try {
		log('Verifying if the update was completed successfully...');
		const { data } = await axios.get(`/zones/${zoneId}/filters/${filterId}`);
		if (!data.success) throw new Error(`Verification failed. ${data?.errors}`);

		if (data.result.expression !== expression) log('Verification failed. Expression mismatch!', 2);
	} catch (err) {
		throw new Error(`Filter ${filterId}: Failed to verify - ${JSON.stringify(err.response?.data) || err.stack}`);
	}
};

const updateFilter = async (zoneId, filterId, expression, oldExpression) => {
	try {
		if (oldExpression === expression) return log('Rule is already up-to-date', 1);

		log('Discrepancy detected, updating the rule...');
		const { data } = await axios.put(`/zones/${zoneId}/filters/${filterId}`, { id: filterId, expression });
		if (!data.success) throw new Error(`Update failed. Details: ${data?.errors}`);

		await verifyFilterUpdate(zoneId, filterId, expression);
	} catch (err) {
		throw new Error(`Update failed - ${JSON.stringify(err.response?.data) || err.stack}`);
	}
};

const createNewRule = async (zoneId, description, action, expression, index) => {
	try {
		log(`Creating new WAF rule '${description}' (action ${action})...`);
		const { data } = await axios.post(`/zones/${zoneId}/filters`, [{ expression }]);
		if (!data.success) throw new Error(`Failed to create filter. ${data?.errors}`);

		const res = await axios.post(`/zones/${zoneId}/firewall/rules`, [{
			filter: { id: data.result[0].id },
			action,
			description,
			priority: (index || 0) + 1,
		}]);

		if (!res.data.success) throw new Error(`Failed to create rule. ${res.data?.errors}`);
		log(`WAF rule '${description}' created successfully`, 1);
	} catch (err) {
		throw new Error(`Failed to create new rule for zone ${zoneId} - ${JSON.stringify(err.response?.data) || err.stack}`);
	}
};

const updateWAFCustomRulesForZone = async (expressions, zone) => {
	try {
		log(`=================== ANALYZING THE ZONE ${zone.name.toUpperCase()} (${zone.id}) ===================`);

		const rules = await fetchWAFRules(zone.id);

		for (const [indexString, block] of Object.entries(expressions)) {
			const index = parseInt(indexString);
			const { name, action, expressions: part } = block;
			const matchingRule = rules.find(rule => rule.description && rule.description.includes(`Part ${index}`));

			if (part && matchingRule) {
				const filterId = matchingRule.filter.id;
				log(`» Checking '${matchingRule.description}' (${filterId})...`);
				await updateFilter(zone.id, filterId, part, matchingRule.filter.expression);
			} else if (part) {
				log(`» No matching rule found for part ${index}`, 2);
				await createNewRule(zone.id, name, action, part, index);
			}
		}

		await verifyAndReorderParts(zone.id);
	} catch (err) {
		throw new Error(`» Error during update: ${err.message}`);
	}
};

module.exports = async () => {
	try {
		const expressions = await expressionParser();
		if (!expressions || !Object.keys(expressions).length) return log('No expressions found.', 3);

		const zones = await getZones();
		for (const zone of zones) {
			await updateWAFCustomRulesForZone(expressions, zone);
		}

		log(`Successfully! All API requests: ${getRequestCount()}`, 1);
	} catch (err) {
		log(`WAF update failed! ${err.message}`, 3);
	}
};