process.loadEnvFile();
const readline = require('node:readline/promises');
const fs = require('node:fs/promises');
const path = require('node:path');
const { axios } = require('../services/axios.js');
const log = require('../scripts/log.js');

const { CF_API_TOKEN, CF_ACCOUNT_ID } = process.env;
if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN is missing. Check the .env file.');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => rl.question(q).then(a => ['y', 'yes'].includes(a.trim().toLowerCase()));

const getZones = async () => {
	log('Fetching zones...');
	const { data } = await axios.get('/zones');
	if (!data.success) throw new Error(`Failed to fetch zones: ${JSON.stringify(data.errors)}`);
	log(`Found ${data.result.length} zone(s): ${data.result.map(z => z.name).join(', ')}`, 1);
	return data.result;
};

const getWAFRules = async zoneId => {
	log(`Fetching WAF rules for zone ${zoneId}...`);
	const { data } = await axios.get(`/zones/${zoneId}/firewall/rules`);
	if (!data.success) throw new Error(`Failed to fetch rules: ${JSON.stringify(data.errors)}`);
	return data.result;
};

const getIPLists = async () => {
	if (!CF_ACCOUNT_ID) return [];
	log('Fetching IP lists...');
	const { data } = await axios.get(`/accounts/${CF_ACCOUNT_ID}/rules/lists`);
	if (!data.success) throw new Error(`Failed to fetch lists: ${JSON.stringify(data.errors)}`);
	return data.result.filter(l => l.kind === 'ip');
};

(async () => {
	try {
		log('Fetching WAF rules and IP lists to delete...');
		const zones = await getZones();
		const toDelete = [];

		for (const zone of zones) {
			const rules = await getWAFRules(zone.id);
			const partRules = rules.filter(r => r.description && (/Part \d+/i).test(r.description));
			if (partRules.length > 0) toDelete.push({ zone, partRules });
		}

		const ipLists = await getIPLists();
		if (toDelete.length === 0 && ipLists.length === 0) return log('Nothing to delete.', 1);

		log('WARNING! This operation is IRREVERSIBLE. The following will be permanently deleted:', 3);
		for (const { zone, partRules } of toDelete) {
			log(`Zone: ${zone.name}`);
			for (const r of partRules) log(`  - ${r.description} (rule: ${r.id})`);
		}
		if (ipLists.length > 0) {
			log('IP lists:');
			for (const l of ipLists) log(`  - ${l.name} (${l.id})`);
		}

		if (!await ask('\n> Proceed? [Yes/no] ')) return log('Aborted.', 2);

		const cfDelete = async (url, ids) => {
			const qs = ids ? '?' + ids.map(id => `id=${id}`).join('&') : '';

			let res;
			try {
				res = await axios.delete(`${url}${qs}`);
			} catch (err) {
				const cfResponse = err.response?.data;
				if (cfResponse) log(JSON.stringify(cfResponse), 3);
				throw new Error(`DELETE ${url} failed: ${err.message}`, { cause: err });
			}

			if (!res.data.success) throw new Error(`DELETE ${url} failed: ${JSON.stringify(res.data.errors)}`);
		};

		for (const { zone, partRules } of toDelete) {
			log(`Deleting ${partRules.length} rule(s) from zone ${zone.name}...`);
			await cfDelete(`/zones/${zone.id}/firewall/rules`, partRules.map(r => r.id));

			log(`Deleting ${partRules.length} filter(s) from zone ${zone.name}...`);
			await cfDelete(`/zones/${zone.id}/filters`, partRules.map(r => r.filter.id));
		}

		for (const l of ipLists) {
			log(`Deleting IP list '${l.name}'...`);
			await cfDelete(`/accounts/${CF_ACCOUNT_ID}/rules/lists/${l.id}`);
		}

		try {
			await fs.unlink(path.join(__dirname, '../../data/rule-ids.json'));
			log('Cache cleared', 1);
		} catch { /* no cache file */ }

		log('Done! Run "node ." to recreate everything.', 1);
	} catch (err) {
		log(err.message, 3);
	} finally {
		rl.close();
	}
})();
