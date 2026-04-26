const fs = require('node:fs/promises');
const { axios } = require('../axios.js');
const { load: loadCache, save: saveCache } = require('../ruleCache.js');
const log = require('../../scripts/log.js');

const { CF_ACCOUNT_ID } = process.env;
const LIST_NAME = process.env.CF_IP_LIST_NAME || 'sefinek_cf_waf';

const getOrCreateList = async cache => {
	if (cache.ipListId) return cache.ipListId;

	const { data } = await axios.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists`);
	if (!data.success) throw new Error(`Failed to fetch lists: ${JSON.stringify(data.errors)}`);

	const existing = data.result.find(l => l.name === LIST_NAME);
	if (existing) {
		cache.ipListId = existing.id;
		return existing.id;
	}

	const existingIPLists = data.result.filter(l => l.kind === 'ip');

	log(`Creating new IP list '${LIST_NAME}'...`);
	try {
		const { data: created } = await axios.post(`/accounts/${CF_ACCOUNT_ID}/rules/lists`, {
			name: LIST_NAME,
			kind: 'ip',
			description: 'WAF IP blocklist managed by Cloudflare-WAF-Expressions',
		});
		if (!created.success) throw new Error(`Failed to create list: ${JSON.stringify(created.errors)}`);

		cache.ipListId = created.result.id;
		log(`Created IP list '${LIST_NAME}' (id: ${created.result.id})`, 1);
		return created.result.id;
	} catch (err) {
		const cfErrors = err.response?.data?.errors;
		if (cfErrors?.some(e => e.code === 10019)) {
			const listsUrl = `https://dash.cloudflare.com/${CF_ACCOUNT_ID}/configurations/lists`;
			const hint = existingIPLists.length > 0
				? `Set CF_IP_LIST_NAME=${existingIPLists[0].name} in .env to reuse the existing list, or delete it at: ${listsUrl}`
				: `Delete an existing list from the Cloudflare dashboard and re-run: ${listsUrl}`;
			throw new Error(`List limit reached. ${hint}`, { cause: err });
		}
		throw new Error(`Failed to create list ${LIST_NAME}! ${cfErrors ? JSON.stringify(cfErrors) : err.message}`, { cause: err });
	}
};

const getAllListItems = async listId => {
	const items = [];
	let cursor = null;

	do {
		const params = cursor ? { cursor } : {};
		const { data } = await axios.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`, { params });
		if (!data.success) throw new Error(`Failed to fetch list items: ${JSON.stringify(data.errors)}`);

		items.push(...data.result);
		cursor = data.result_info?.cursors?.after ?? null;
	} while (cursor);

	return items;
};

const readIPs = async () => {
	const content = await fs.readFile('rules/ip-blocklist.txt', 'utf8');
	return content
		.split('\n')
		.map(line => line.trim())
		.filter(line => line && !line.startsWith('#'));
};

module.exports = async () => {
	if (!CF_ACCOUNT_ID) {
		log('CF_ACCOUNT_ID not set — skipping IP list sync', 2);
		return;
	}

	log('Syncing IP blocklist with Cloudflare Lists...');

	const cache = await loadCache();
	const desiredIPs = new Set(await readIPs());
	const listId = await getOrCreateList(cache);
	const currentItems = await getAllListItems(listId);

	const currentMap = new Map(currentItems.map(item => [item.ip, item.id]));
	const toAdd = [...desiredIPs].filter(ip => !currentMap.has(ip));
	const toDelete = currentItems
		.filter(item => !desiredIPs.has(item.ip))
		.map(item => ({ id: item.id }));

	if (toDelete.length > 0) {
		log(`Removing ${toDelete.length} IP(s) from list...`);
		const { data } = await axios.delete(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`, {
			data: { items: toDelete },
		});
		if (!data.success) throw new Error(`Failed to delete items: ${JSON.stringify(data.errors)}`);
	}

	if (toAdd.length > 0) {
		log(`Adding ${toAdd.length} IP(s) to list...`);
		const { data } = await axios.post(
			`/accounts/${CF_ACCOUNT_ID}/rules/lists/${listId}/items`,
			toAdd.map(ip => ({ ip }))
		);
		if (!data.success) throw new Error(`Failed to add items: ${JSON.stringify(data.errors)}`);
	}

	if (toAdd.length === 0 && toDelete.length === 0) {
		log('IP list is already up-to-date', 1);
	} else {
		log(`IP list synced: +${toAdd.length} added / -${toDelete.length} removed`, 1);
	}

	await saveCache(cache);
};
