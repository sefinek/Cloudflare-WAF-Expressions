const fs = require('node:fs/promises');
const { setTimeout: sleep } = require('node:timers/promises');
const { axiosCf } = require('../axios.js');
const { load: loadCache, save: saveCache } = require('../ruleCache.js');
const fetchSniffCatIPs = require('../sniffcat.js');
const fetchAbuseIPDBIPs = require('../abuseipdb.js');
const log = require('../../scripts/log.js');
const pluralize = require('../../scripts/pluralize.js');
const { version } = require('../../../package.json');

const { CF_ACCOUNT_ID, SNIFFCAT_API_TOKEN, ABUSEIPDB_API_KEY } = process.env;
const USER_IP_LIST_PATH = 'rules/my-lists/ip-blocklist.txt';
// Cloudflare's item cap is shared across all custom lists on the account (Free/Pro/Business: 10,000; Enterprise: 500,000)
const DEFAULT_ITEM_CAP = 10000;
const ENTERPRISE_ITEM_CAP = 500000;
const LIST_NAME = process.env.CF_IP_BLOCKLIST_NAME || process.env.CF_IP_LIST_NAME || 'sefinek_cf_waf';
const LIST_SOURCES = [
	'rules/ip-blocklist.txt',
	'rules/my-lists/ip-blocklist.txt',
	...(SNIFFCAT_API_TOKEN ? ['SniffCat'] : []),
	...(ABUSEIPDB_API_KEY ? ['AbuseIPDB'] : []),
];
const LIST_DESCRIPTION = `Managed by Cloudflare-WAF-Expressions v${version} (https://github.com/sefinek/Cloudflare-WAF-Expressions). Sources: ${LIST_SOURCES.join(', ')}. Do not edit manually - any changes will be overwritten on the next sync.`;

const getAllLists = async () => {
	const { data } = await axiosCf.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists`);
	if (!data.success) throw new Error(`Failed to fetch lists: ${JSON.stringify(data.errors)}`);
	return data.result;
};

const isEnterpriseAccount = async () => {
	try {
		const { data } = await axiosCf.get(`/accounts/${CF_ACCOUNT_ID}/subscriptions`);
		if (!data.success) return false;
		return (data.result || []).some(sub => sub.rate_plan?.id === 'enterprise' || sub.rate_plan?.is_contract === true);
	} catch {
		// Token may lack Billing read permission - fall back to the conservative Free/Pro/Business cap
		return false;
	}
};

// The item cap is shared across every custom list on the account (hostname/ASN lists have their
// own separate Enterprise-only pools, so they're excluded from this shared IP/redirect list pool).
const resolveMaxListSize = (allLists, ownListId, itemCap) => {
	const usedByOthers = allLists
		.filter(l => l.id !== ownListId && l.kind !== 'hostname' && l.kind !== 'asn')
		.reduce((sum, l) => sum + (l.num_items || 0), 0);
	return Math.max(0, itemCap - usedByOthers);
};

const getOrCreateList = async (cache, allLists) => {
	if (cache.ipListId) {
		const existing = allLists.find(l => l.id === cache.ipListId);
		if (existing) {
			if (existing.description !== LIST_DESCRIPTION) {
				await axiosCf.put(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${cache.ipListId}`, { description: LIST_DESCRIPTION });
				log('IP list description updated', 1);
			}
			cache.ipListDescription = LIST_DESCRIPTION;
			return cache.ipListId;
		}
		// Cached list no longer exists on the account (deleted manually?) - fall through and recreate it
		delete cache.ipListId;
	}

	const existing = allLists.find(l => l.name === LIST_NAME);
	if (existing) {
		cache.ipListId = existing.id;
		if (existing.description !== LIST_DESCRIPTION) {
			await axiosCf.put(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${existing.id}`, { description: LIST_DESCRIPTION });
			log('IP list description updated', 1);
		}
		cache.ipListDescription = LIST_DESCRIPTION;
		return existing.id;
	}

	const existingIPLists = allLists.filter(l => l.kind === 'ip');

	log(`Creating new IP list '${LIST_NAME}'...`);
	let created;
	try {
		const res = await axiosCf.post(`/accounts/${CF_ACCOUNT_ID}/rules/lists`, {
			name: LIST_NAME,
			kind: 'ip',
			description: LIST_DESCRIPTION,
		});
		created = res.data;
	} catch (err) {
		const cfErrors = err.response?.data?.errors;
		if (cfErrors?.some(e => e.code === 10019)) {
			const listsUrl = `https://dash.cloudflare.com/${CF_ACCOUNT_ID}/configurations/lists`;
			const hint = existingIPLists.length > 0
				? `Set CF_IP_BLOCKLIST_NAME=${existingIPLists[0].name} in .env to reuse the existing list, or delete it at: ${listsUrl}`
				: `Delete an existing list from the Cloudflare dashboard and re-run: ${listsUrl}`;
			throw new Error(`List limit reached. ${hint}`, { cause: err });
		}
		throw new Error(`Failed to create list ${LIST_NAME}! ${cfErrors ? JSON.stringify(cfErrors) : err.message}`, { cause: err });
	}

	if (!created.success) throw new Error(`Failed to create list: ${JSON.stringify(created.errors)}`);

	cache.ipListId = created.result.id;
	cache.ipListDescription = LIST_DESCRIPTION;
	log(`Created IP list '${LIST_NAME}' (id: ${created.result.id})`, 1);
	return created.result.id;
};

const waitForBulkOperation = async operationId => {
	const maxAttempts = 30;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const { data } = await axiosCf.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists/bulk_operations/${operationId}`);
		if (!data.success) throw new Error(`Failed to check bulk operation status: ${JSON.stringify(data.errors)}`);

		const { status, error } = data.result;
		if (status === 'completed') return;
		if (status === 'failed') throw new Error(`Bulk operation failed: ${error || 'unknown reason'}`);

		await sleep(2000);
	}

	throw new Error(`Bulk operation ${operationId} did not complete within ${maxAttempts * 2}s`);
};

const getAllListItems = async listId => {
	const items = [];
	let cursor = null;

	do {
		const params = cursor ? { cursor, per_page: 500 } : { per_page: 500 };
		const { data } = await axiosCf.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`, { params });
		if (!data.success) throw new Error(`Failed to fetch list items: ${JSON.stringify(data.errors)}`);

		items.push(...data.result);
		cursor = data.result_info?.cursors?.after ?? null;
	} while (cursor);

	return items;
};

const readIPsFromFile = async filePath => {
	try {
		const content = await fs.readFile(filePath, 'utf8');
		return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
	} catch (err) {
		if (err.code === 'ENOENT') return [];
		throw err;
	}
};

const readIPs = async maxListSize => {
	const [builtinIPs, userIPs, sniffcatIPs, abuseIPDBIPs] = await Promise.all([
		readIPsFromFile('rules/ip-blocklist.txt'),
		readIPsFromFile(USER_IP_LIST_PATH),
		fetchSniffCatIPs(),
		fetchAbuseIPDBIPs(),
	]);

	// Built-in, custom, and SniffCat IPs are always kept in full; AbuseIPDB (the largest,
	// most elastic source) is trimmed from the tail (lowest confidence first) if the
	// combined list would exceed Cloudflare's account-wide custom list item cap.
	const priorityIPs = [...new Set([...builtinIPs, ...userIPs, ...sniffcatIPs])];
	const prioritySet = new Set(priorityIPs);
	const newAbuseIPDBIPs = abuseIPDBIPs.filter(ip => !prioritySet.has(ip));

	const budget = Math.max(0, maxListSize - priorityIPs.length);
	const truncatedCount = Math.max(0, newAbuseIPDBIPs.length - budget);
	const usedAbuseIPDBIPs = truncatedCount > 0 ? newAbuseIPDBIPs.slice(0, budget) : newAbuseIPDBIPs;

	const merged = [...new Set([...priorityIPs, ...usedAbuseIPDBIPs])].sort();
	const totalRaw = builtinIPs.length + userIPs.length + sniffcatIPs.length + abuseIPDBIPs.length;
	const dupes = totalRaw - truncatedCount - merged.length;

	log(`Desired list: ${merged.length} unique IPs (${builtinIPs.length} built-in + ${userIPs.length} custom + ${sniffcatIPs.length} SniffCat + ${abuseIPDBIPs.length} AbuseIPDB${dupes > 0 ? `, ${dupes} duplicates removed` : ''})`);

	if (truncatedCount > 0) {
		log(`List size limit exceeded! Combined sources produce ${(totalRaw - dupes).toLocaleString('en-US')} unique IPs, but only ${maxListSize.toLocaleString('en-US')} ${pluralize(maxListSize, 'item')} of your account's shared custom list quota ${maxListSize === 1 ? 'is' : 'are'} available for '${LIST_NAME}'. Dropped the ${truncatedCount.toLocaleString('en-US')} lowest-confidence AbuseIPDB ${pluralize(truncatedCount, 'IP')} to fit - lower ABUSEIPDB_LIMIT and/or raise ABUSEIPDB_CONFIDENCE_MIN in .env to fix this permanently.`, 3);
	}

	return merged;
};

module.exports = async () => {
	if (!process.env.CF_IP_BLOCKLIST_NAME || process.env.CF_IP_BLOCKLIST_NAME === '') {
		log('CF_IP_BLOCKLIST_NAME is empty - skipping IP list sync', 2);
		return;
	}

	if (!CF_ACCOUNT_ID) {
		log('CF_ACCOUNT_ID not set - skipping IP list sync', 2);
		return;
	}

	log(`Syncing IP list '${LIST_NAME}' with Cloudflare...`);

	const cache = await loadCache();
	const [allLists, enterprise] = await Promise.all([getAllLists(), isEnterpriseAccount()]);
	const listId = await getOrCreateList(cache, allLists);
	const maxListSize = resolveMaxListSize(allLists, listId, enterprise ? ENTERPRISE_ITEM_CAP : DEFAULT_ITEM_CAP);

	const [desiredIPs, currentItems] = await Promise.all([
		readIPs(maxListSize).then(ips => new Set(ips)),
		getAllListItems(listId),
	]);

	const currentMap = new Map(currentItems.map(item => [item.ip, item.id]));
	const toAdd = [...desiredIPs].filter(ip => !currentMap.has(ip));
	const toDelete = currentItems
		.filter(item => !desiredIPs.has(item.ip))
		.map(item => ({ id: item.id }));

	log(`CF list: ${currentItems.length} IPs | diff: +${toAdd.length} to add / -${toDelete.length} to remove`);

	if (toDelete.length > 0) {
		log(`Removing ${toDelete.length} stale ${pluralize(toDelete.length, 'IP')} (no longer in desired list)...`);
		const { data } = await axiosCf.delete(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`, { data: { items: toDelete } });
		if (!data.success) throw new Error(`Failed to delete items: ${JSON.stringify(data.errors)}`);
		await waitForBulkOperation(data.result.operation_id);
	}

	if (toAdd.length > 0) {
		log(`Adding ${toAdd.length} new ${pluralize(toAdd.length, 'IP')}...`);
		const { data } = await axiosCf.post(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`, toAdd.map(ip => ({ ip })));
		if (!data.success) throw new Error(`Failed to add items: ${JSON.stringify(data.errors)}`);
		await waitForBulkOperation(data.result.operation_id);
	}

	if (toAdd.length === 0 && toDelete.length === 0) {
		log('IP list is already up-to-date', 1);
	} else {
		log(`IP list synced: +${toAdd.length} added / -${toDelete.length} removed`, 1);
	}

	await saveCache(cache);
};
