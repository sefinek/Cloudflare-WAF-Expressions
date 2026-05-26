const { axios, getRequestCount } = require('../axios.js');
const expressionParser = require('../../scripts/parseExpressions.js');
const fetchWAFRules = require('./fetchWAFRules.js');
const verifyAndReorderParts = require('./verifyAndReorderParts.js');
const syncIPList = require('./syncIPList.js');
const { load: loadCache, save: saveCache } = require('../ruleCache.js');
const { pull } = require('../updates.js');
const log = require('../../scripts/log.js');

const { CF_API_TOKEN } = process.env;
if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN is missing. Check the .env file.');

const getZones = async (excludedNames = []) => {
	log('Retrieving all zones from your Cloudflare account...');

	const zones = [];
	let page = 1;

	while (true) {
		const { data } = await axios.get('/zones', { params: { page, per_page: 1000 } });
		if (!data.success) throw new Error(`Failed to fetch zones. ${JSON.stringify(data?.errors)}`);

		zones.push(...data.result);

		if (page >= data.result_info.total_pages) break;
		page++;
	}

	const active = zones.filter(z => z.status === 'active').length;
	const paused = zones.filter(z => z.paused).length;
	const partial = zones.filter(z => z.type === 'partial').length;
	const devMode = zones.filter(z => z.development_mode > 0).length;
	const accounts = new Set(zones.map(z => z.account?.id)).size;
	const plans = [...new Set(zones.map(z => z.plan?.name).filter(Boolean))].join(', ');
	const warnings = [
		paused > 0 && `${paused} paused (!)`,
		partial > 0 && `${partial} partial (!)`,
		devMode > 0 && `${devMode} dev mode (!)`,
	].filter(Boolean);
	const excluded = excludedNames.length > 0 && `${excludedNames.length} excluded: ${excludedNames.join(', ')}`;
	const parts = [`${active} active`, ...warnings, `${accounts} account(s)`, `plans: ${plans || 'N/A'}`, ...(excluded ? [excluded] : [])];
	log(`Successfully retrieved ${zones.length} zone(s): ${parts.join(', ')}`, 1);
	return zones;
};

const updateFilter = async (zoneId, filterId, expression, oldExpression) => {
	if (oldExpression === expression) return log('Rule is already up-to-date', 1);

	try {
		log('Discrepancy detected, updating the rule...');

		const { data } = await axios.put(`/zones/${zoneId}/filters/${filterId}`, { id: filterId, expression });
		if (!data.success) throw new Error(`Update failed. Details: ${data?.errors}`);
	} catch (err) {
		const cfErrors = err.response?.data?.errors;
		if (cfErrors?.some(e => e.code === 10030)) {
			log('Unknown IP list referenced in WAF expression. The list may have been deleted or CF_IP_BLOCKLIST_NAME has changed.', 2);
			log('To fix this, run: node data/tools/deleteWAFRules.js', 2);
		}
		throw new Error(`Update failed - ${JSON.stringify(err.response?.data)}`, { cause: err });
	}
};

const createNewRule = async (zoneId, description, action, expression, index, zoneCache) => {
	log(`Creating new WAF rule '${description}' (action ${action}, length: ${expression.length})...`);

	try {
		const { data } = await axios.post(`/zones/${zoneId}/filters`, [{ expression }]);
		if (!data.success) throw new Error(`Failed to create filter. ${data?.errors}`);

		const filterId = data.result[0].id;
		const res = await axios.post(`/zones/${zoneId}/firewall/rules`, [{
			filter: { id: filterId },
			action,
			description,
			priority: index,
		}]);

		if (!res.data.success) throw new Error(`Failed to create rule. ${res.data?.errors}`);

		const ruleId = res.data.result[0].id;
		zoneCache[index] = { ruleId, filterId };
		log(`WAF rule '${description}' created successfully`, 1);
	} catch (err) {
		throw new Error(`Failed to create new rule for zone ${zoneId} - ${JSON.stringify(err.response?.data)}`, { cause: err });
	}
};

const updateWAFCustomRulesForZone = async (expressions, zone, cache) => {
	log(`=================== ANALYZING THE ZONE ${zone.name.toUpperCase()} (${zone.id}) ===================`);

	const zoneCache = cache.zones[zone.id] ?? {};
	let cacheChanged = false;
	let rulesCreated = false;

	try {
		const rules = await fetchWAFRules(zone.id);

		for (const [indexStr, block] of Object.entries(expressions)) {
			const index = parseInt(indexStr);
			if (isNaN(index)) continue;
			const { name, action, expressions: part } = block;

			const cached = zoneCache[index];
			let matchingRule = cached ? rules.find(rule => rule.id === cached.ruleId) : null;

			if (!matchingRule) {
				matchingRule = rules.find(rule => rule.description && rule.description.includes(`Part ${index}`));
				if (matchingRule) {
					if (!cached) log(`» Part ${index}: matched by name - IDs cached for future runs.`);
					zoneCache[index] = { ruleId: matchingRule.id, filterId: matchingRule.filter.id };
					cacheChanged = true;
				}
			}

			if (matchingRule) {
				const filterId = matchingRule.filter.id;
				log(`» Checking '${matchingRule.description}' (${filterId}) [length: ${block.length}]...`);
				await updateFilter(zone.id, filterId, part, matchingRule.filter.expression);
			} else if (part) {
				log(`» No matching rule found for part ${index}`);
				await createNewRule(zone.id, name, action, part, index, zoneCache);
				cacheChanged = true;
				rulesCreated = true;
			}
		}

		await verifyAndReorderParts(zone.id, rulesCreated ? null : rules);
	} catch (err) {
		throw new Error('» Error during update - updateWAFCustomRulesForZone()', { cause: err });
	}

	if (cacheChanged) cache.zones[zone.id] = zoneCache;
};

module.exports = async () => {
	await pull();

	try {
		const expressions = await expressionParser();
		if (!expressions || !Object.keys(expressions).length) return log('No expressions found.', 3);

		await syncIPList();

		const cache = await loadCache();
		const excludedZones = (process.env.EXCLUDED_ZONES || '').split(',').map(s => s.trim()).filter(Boolean);
		const zones = await getZones(excludedZones);
		const filteredZones = excludedZones.length ? zones.filter(z => !excludedZones.includes(z.name)) : zones;

		for (const zone of filteredZones) {
			await updateWAFCustomRulesForZone(expressions, zone, cache);
		}

		await saveCache(cache);
		log(`Successfully! All API requests: ${getRequestCount()}`, 1);
	} catch (err) {
		let cause = err;
		while (cause.cause) cause = cause.cause;
		const detail = cause.response?.data ? JSON.stringify(cause.response.data) : null;
		log(`WAF update failed! ${err.message}${detail ? ` - ${detail}` : ` - ${cause.message}`}`, 3);
	}
};
