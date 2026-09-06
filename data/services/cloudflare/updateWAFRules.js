const { axiosCf, getRequestCfCount, getRequestScCount, getRequestAbCount } = require('../axios.js');
const expressionParser = require('../../scripts/parseExpressions.js');
const syncIPList = require('./syncIPList.js');
const { load: loadCache, save: saveCache } = require('../ruleCache.js');
const { pull } = require('../updates.js');
const { PHASE, MAX_EXPRESSION_LENGTH, BLOCKLIST_PATH, BLOCKLIST_DESCRIPTION, isManagedDescription, isPartDescription, passthroughRule, buildZoneExpression, getRuleCap } = require('./wafRuleset.js');
const parseZoneScopedList = require('../../scripts/parseZoneScopedList.js');
const ensureUserLists = require('../../scripts/ensureUserLists.js');
const log = require('../../scripts/log.js');
const pluralize = require('../../scripts/pluralize.js');
const formatDuration = require('../../scripts/duration.js');

const { CF_API_TOKEN } = process.env;
if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN is missing. Check the .env file.');

const ALLOWLIST_PATH = 'rules/my-lists/allowlist.txt';

// Fallback for plans with no spare rule slot (Free/Pro with Part 1-5 already using the whole quota, or any
// zone with enough manual dashboard rules to fill it): merge the blocklist into whichever "block" action Part
// has the most headroom, instead of adding a rule. Picking the smallest Part leaves the most room under the
// per-rule character limit.
const pickBlocklistHostIndex = expressions => {
	let bestIndex = null;
	let bestLength = Infinity;
	for (const [indexStr, block] of Object.entries(expressions)) {
		const index = parseInt(indexStr);
		if (isNaN(index) || block.action !== 'block') continue;
		if (block.length < bestLength) {
			bestLength = block.length;
			bestIndex = index;
		}
	}
	return bestIndex;
};

const getZones = async (excludedNames = []) => {
	log('Retrieving all zones from your Cloudflare account...');

	const zones = [];
	let page = 1;

	while (true) {
		const { data } = await axiosCf.get('/zones', { params: { page, per_page: 1000 } });
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
	const planCaps = [...new Map(zones.map(z => [z.plan?.name || 'Unknown', getRuleCap(z)])).entries()];
	const ruleLimit = planCaps.length ? planCaps.map(([planName, cap]) => planCaps.length === 1 ? cap : `${planName}: ${cap}`).join(', ') : 'N/A';
	const warnings = [
		paused > 0 && `${paused} paused (!)`,
		partial > 0 && `${partial} partial (!)`,
		devMode > 0 && `${devMode} dev mode (!)`,
	].filter(Boolean);
	const excluded = excludedNames.length > 0 && `${excludedNames.length} excluded: ${excludedNames.join(', ')}`;
	const parts = [`${active} active`, ...warnings, `${accounts} ${pluralize(accounts, 'account')}`, `plans: ${plans || 'N/A'}`, `rule limit: ${ruleLimit}`, ...(excluded ? [excluded] : [])];
	log(`Successfully retrieved ${zones.length} ${pluralize(zones.length, 'zone')}: ${parts.join(', ')}`, 1);
	return zones;
};

const getEntrypoint = async zoneId => {
	try {
		const { data } = await axiosCf.get(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
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

const updateWAFCustomRulesForZone = async (expressions, allowlistEntries, blocklistEntries, blocklistHostIndex, zone) => {
	const allowlistExpression = buildZoneExpression(allowlistEntries, zone);
	const allowlist = allowlistExpression ? `Active (${allowlistExpression.length} chars)` : 'None';

	const wrap = expr => allowlistExpression ? `not (${allowlistExpression}) and (${expr})` : expr;

	const blocklistExpression = buildZoneExpression(blocklistEntries, zone);
	let blocklist = 'None';

	try {
		const entrypoint = await getEntrypoint(zone.id);
		const current = entrypoint?.rules ?? [];

		const userRules = current.filter(r => !isManagedDescription(r.description || ''));
		const existingManagedRules = current.filter(r => isManagedDescription(r.description || ''));

		const partRules = [];
		for (const [indexStr, block] of Object.entries(expressions)) {
			const index = parseInt(indexStr);
			if (isNaN(index)) continue;

			const { name, action, expressions: part } = block;
			const expression = wrap(part);
			if (expression.length > MAX_EXPRESSION_LENGTH) {
				throw new Error(`"${name}" for ${zone.name} is ${expression.length} characters, exceeding the ${MAX_EXPRESSION_LENGTH}-character limit per rule${allowlistExpression ? ' (inflated by rules/my-lists/allowlist.txt entries)' : ''}. Trim rules/expressions.md${allowlistExpression ? ' or rules/my-lists/allowlist.txt' : ''} to fit.`);
			}

			const match = existingManagedRules.find(r => isPartDescription(r.description, index));
			partRules.push({
				...(match?.id ? { id: match.id } : {}),
				action,
				expression,
				description: name,
				enabled: true,
			});
		}

		if (blocklistExpression) {
			const ruleCap = getRuleCap(zone);
			const hasSpareSlot = partRules.length + userRules.length < ruleCap;

			if (hasSpareSlot) {
				const expression = wrap(blocklistExpression);
				if (expression.length > MAX_EXPRESSION_LENGTH) {
					blocklist = `Skipped (${expression.length}/${MAX_EXPRESSION_LENGTH} chars)`;
					log(`Custom blocklist for ${zone.name} would be ${expression.length} characters as its own rule, exceeding the ${MAX_EXPRESSION_LENGTH}-character limit per rule. Skipping it for this zone - trim rules/my-lists/blocklist.txt to fit.`, 2);
				} else {
					const match = existingManagedRules.find(r => r.description === BLOCKLIST_DESCRIPTION);
					partRules.push({
						...(match?.id ? { id: match.id } : {}),
						action: 'block',
						expression,
						description: BLOCKLIST_DESCRIPTION,
						enabled: true,
					});
					blocklist = `Active (own rule, ${expression.length} chars)`;
				}
			} else {
				const hostIndex = blocklistHostIndex;
				const host = hostIndex !== null ? partRules.find(r => isPartDescription(r.description, hostIndex)) : null;

				if (!host) {
					blocklist = 'Skipped (no block-action Part rule available)';
					log(`Custom blocklist for ${zone.name} could not be merged - no "block" action Part rule found in rules/expressions.md.`, 2);
				} else {
					const rawPart = expressions[hostIndex].expressions;
					const merged = wrap(`${rawPart} or (${blocklistExpression})`);
					if (merged.length > MAX_EXPRESSION_LENGTH) {
						blocklist = `Skipped (${merged.length}/${MAX_EXPRESSION_LENGTH} chars)`;
						log(`Custom blocklist for ${zone.name} would push "${host.description}" to ${merged.length} characters, exceeding the ${MAX_EXPRESSION_LENGTH}-character limit per rule. Skipping it for this zone - trim rules/my-lists/blocklist.txt (remove entries or scope some to other zones with a [zone] prefix) to fit. This zone's plan has no spare rule slot (${partRules.length + userRules.length}/${ruleCap} used), so it can't get its own rule either.`, 2);
					} else {
						host.expression = merged;
						blocklist = `Active (merged into "${host.description}", ${merged.length} chars)`;
					}
				}
			}
		}

		const desired = [
			...userRules.map(passthroughRule),
			...partRules,
		];

		if (normalize(current) === normalize(desired)) return { status: 'Up to date', allowlist, blocklist, details: '-' };

		const { data } = await axiosCf.put(`/zones/${zone.id}/rulesets/phases/${PHASE}/entrypoint`, { rules: desired });
		if (!data.success) throw new Error(`Update failed. ${JSON.stringify(data?.errors)}`);

		return {
			status: 'Updated',
			allowlist,
			blocklist,
			details: `${partRules.length} managed, ${userRules.length} user ${pluralize(userRules.length, 'rule')} preserved`,
		};
	} catch (err) {
		const cfErrors = err.cause?.response?.data?.errors ?? err.response?.data?.errors;
		const details = cfErrors?.some(e => e.message?.includes('could not find list') || e.message?.includes('does not exist'))
			? 'Unknown IP list (run: node data/tools/deleteWAFRules.js)'
			: cfErrors?.length ? cfErrors.map(e => e.message).join('; ') : err.message;

		return { status: 'Error', allowlist, blocklist, details };
	}
};

module.exports = async () => {
	const start = Date.now();

	await pull();
	await ensureUserLists();

	try {
		const [expressions, allowlistEntries, blocklistEntries] = await Promise.all([expressionParser(), parseZoneScopedList(ALLOWLIST_PATH), parseZoneScopedList(BLOCKLIST_PATH)]);
		if (!expressions || !Object.keys(expressions).length) return log('No expressions found.', 3);

		const blocklistHostIndex = pickBlocklistHostIndex(expressions);

		await syncIPList();

		const cache = await loadCache();
		const excludedZones = (process.env.EXCLUDED_ZONES || '').split(',').map(s => s.trim()).filter(Boolean);
		const zones = await getZones(excludedZones);
		const filteredZones = excludedZones.length ? zones.filter(z => !excludedZones.includes(z.name)) : zones;

		log(`Analyzing ${pluralize(filteredZones.length, 'zone')}...`);

		const nameWidth = Math.max(...filteredZones.map(z => z.name.length));
		let failed = 0;
		for (const zone of filteredZones) {
			const result = await updateWAFCustomRulesForZone(expressions, allowlistEntries, blocklistEntries, blocklistHostIndex, zone);
			if (result.status === 'Error') failed++;

			const detailsSuffix = result.details !== '-' ? ` - ${result.details}` : '';
			const allowlistSuffix = result.allowlist !== 'None' ? ` [allowlist: ${result.allowlist}]` : '';
			const blocklistSuffix = result.blocklist !== 'None' ? ` [blocklist: ${result.blocklist}]` : '';
			const type = result.status === 'Error' ? 3 : result.blocklist.startsWith('Skipped') ? 2 : result.status === 'Updated' ? 1 : 0;
			const message = `${zone.name.padEnd(nameWidth)} : ${result.status}${detailsSuffix}${allowlistSuffix}${blocklistSuffix}`;
			log(message, type);

			if (type === 1) log.notify(message);
		}

		if (failed > 0) log(`${failed} ${pluralize(failed, 'zone')} failed to update - see above for details`, 3);

		const showVerifyNotice = !cache.verifyNoticeShown;
		if (showVerifyNotice) cache.verifyNoticeShown = true;

		await saveCache(cache);
		log(`Successfully! API requests - Cloudflare: ${getRequestCfCount()}; SniffCat: ${getRequestScCount()}; AbuseIPDB: ${getRequestAbCount()}; - took ${formatDuration(Date.now() - start)}`, 1);

		if (showVerifyNotice) {
			const border = '*'.repeat(80);
			log(`${border}\nNote: open your ${pluralize(filteredZones.length, 'website')} in a browser and check that everything loads correctly. If any page or static file gets wrongly blocked (HTTP 403), you can add an exception for it in rules/my-lists/allowlist.txt to bypass the WAF rules. If, however, you believe this is a genuine false positive that should be fixed in the rules themselves, let us know at: https://github.com/sefinek/Cloudflare-WAF-Expressions/issues\n${border}`);
		}
	} catch (err) {
		let cause = err;
		while (cause.cause) cause = cause.cause;
		const detail = cause.response?.data ? JSON.stringify(cause.response.data) : null;
		log(`WAF update failed! ${err.message}${detail ? ` - ${detail}` : ` - ${cause.message}`} - after ${formatDuration(Date.now() - start)}`, 3);
	}
};
