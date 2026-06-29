const { axios, getRequestCount } = require('../axios.js');
const expressionParser = require('../../scripts/parseExpressions.js');
const syncIPList = require('./syncIPList.js');
const { load: loadCache, save: saveCache } = require('../ruleCache.js');
const { pull } = require('../updates.js');
const { PHASE, PART_REGEX, passthroughRule } = require('./wafRuleset.js');
const parseAllowlist = require('../../scripts/parseAllowlist.js');
const ensureUserLists = require('../../scripts/ensureUserLists.js');
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

const getEntrypoint = async zoneId => {
	try {
		const { data } = await axios.get(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
		if (!data.success) throw new Error(`Failed to fetch ruleset. ${JSON.stringify(data?.errors)}`);
		return data.result;
	} catch (err) {
		if (err.response?.status === 404) return null;
		throw new Error(`Failed to fetch ruleset for zone ${zoneId} - ${JSON.stringify(err.response?.data)}`, { cause: err });
	}
};

const normalize = rules => JSON.stringify(rules.map(r => ({
	action: r.action,
	expression: r.expression,
	description: r.description,
	enabled: r.enabled !== false,
})));

const buildAllowlistExpression = (entries, zone) => {
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

const updateWAFCustomRulesForZone = async (expressions, allowlistEntries, zone) => {
	log(`=================== ANALYZING THE ZONE ${zone.name.toUpperCase()} (${zone.id}) ===================`);
	const allowlistExpression = buildAllowlistExpression(allowlistEntries, zone);

	try {
		const entrypoint = await getEntrypoint(zone.id);
		const current = entrypoint?.rules ?? [];

		const userRules = current.filter(r => !PART_REGEX.test(r.description || ''));
		const existingPartRules = current.filter(r => PART_REGEX.test(r.description || ''));

		const partRules = [];
		for (const [indexStr, block] of Object.entries(expressions)) {
			const index = parseInt(indexStr);
			if (isNaN(index)) continue;

			const { name, action, expressions: part } = block;
			if (!part) {
				log(`» No expression for part ${index}, skipping`);
				continue;
			}

			const expression = allowlistExpression
				? `not (${allowlistExpression}) and (${part})`
				: part;

			const match = existingPartRules.find(r => r.description?.includes(`Part ${index}`));
			partRules.push({
				...(match?.id ? { id: match.id } : {}),
				action,
				expression,
				description: name,
				enabled: true,
			});
		}

		const desired = [
			...userRules.map(passthroughRule),
			...partRules,
		];

		if (normalize(current) === normalize(desired)) return log('All rules are already up-to-date', 1);

		const allowlistStatus = allowlistExpression ? `allowlist active (${allowlistExpression.length} chars)` : 'no allowlist';
		log(`Writing ruleset: ${partRules.length} managed part rule(s), ${userRules.length} user rule(s) preserved, ${allowlistStatus}...`);

		const { data } = await axios.put(`/zones/${zone.id}/rulesets/phases/${PHASE}/entrypoint`, { rules: desired });
		if (!data.success) throw new Error(`Update failed. ${JSON.stringify(data?.errors)}`);

		log('Ruleset updated successfully', 1);
	} catch (err) {
		const cfErrors = err.cause?.response?.data?.errors ?? err.response?.data?.errors;
		if (cfErrors?.some(e => e.message?.includes('could not find list') || e.message?.includes('does not exist'))) {
			log('Unknown IP list referenced in WAF expression. The list may have been deleted or CF_IP_BLOCKLIST_NAME has changed.', 2);
			log('To fix this, run: node data/tools/deleteWAFRules.js', 2);
		}
		throw new Error('» Error during update - updateWAFCustomRulesForZone()', { cause: err });
	}
};

module.exports = async () => {
	await pull();
	await ensureUserLists();

	try {
		const [expressions, allowlistEntries] = await Promise.all([expressionParser(), parseAllowlist()]);
		if (!expressions || !Object.keys(expressions).length) return log('No expressions found.', 3);

		await syncIPList();

		const cache = await loadCache();
		const excludedZones = (process.env.EXCLUDED_ZONES || '').split(',').map(s => s.trim()).filter(Boolean);
		const zones = await getZones(excludedZones);
		const filteredZones = excludedZones.length ? zones.filter(z => !excludedZones.includes(z.name)) : zones;

		for (const zone of filteredZones) {
			await updateWAFCustomRulesForZone(expressions, allowlistEntries, zone);
		}

		const showVerifyNotice = !cache.verifyNoticeShown;
		if (showVerifyNotice) cache.verifyNoticeShown = true;

		await saveCache(cache);
		log(`Successfully! All API requests: ${getRequestCount()}`, 1);

		if (showVerifyNotice) log(`IMPORTANT! Open your website${filteredZones.length === 1 ? '' : 's'} in a browser and confirm everything loads correctly. If any pages or static files are wrongly blocked (HTTP 403), report it at: https://github.com/sefinek/Cloudflare-WAF-Expressions/issues`);
	} catch (err) {
		let cause = err;
		while (cause.cause) cause = cause.cause;
		const detail = cause.response?.data ? JSON.stringify(cause.response.data) : null;
		log(`WAF update failed! ${err.message}${detail ? ` - ${detail}` : ` - ${cause.message}`}`, 3);
	}
};
