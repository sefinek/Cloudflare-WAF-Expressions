process.loadEnvFile();
const readline = require('node:readline/promises');
const fs = require('node:fs/promises');
const path = require('node:path');
const { axios } = require('../services/axios.js');
const { PHASE, PART_REGEX, passthroughRule } = require('../services/cloudflare/wafRuleset.js');
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

const getEntrypoint = async zoneId => {
	log(`Fetching WAF rules for zone ${zoneId}...`);
	try {
		const { data } = await axios.get(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
		if (!data.success) throw new Error(`Failed to fetch ruleset: ${JSON.stringify(data.errors)}`);
		return data.result;
	} catch (err) {
		if (err.response?.status === 404) return null;
		throw err;
	}
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
			const entrypoint = await getEntrypoint(zone.id);
			const rules = entrypoint?.rules ?? [];
			const partRules = rules.filter(r => r.description && PART_REGEX.test(r.description));
			if (partRules.length > 0) toDelete.push({ zone, partRules, entrypoint });
		}

		const ipLists = await getIPLists();
		if (toDelete.length === 0 && ipLists.length === 0) return log('Nothing to delete', 1);

		console.log();
		log('WARNING! This operation is IRREVERSIBLE. The following will be permanently deleted:', 2);
		for (const { zone, partRules } of toDelete) {
			log(`Zone: ${zone.name}`);
			for (const r of partRules) log(`  - ${r.description} (rule: ${r.id})`);
		}
		if (ipLists.length > 0) {
			log('IP lists:');
			for (const l of ipLists) log(`  - ${l.name} (${l.id})`);
		}

		if (!await ask('\n> Proceed? [Yes/no] ')) return log('Aborted', 2);

		const cfDelete = async url => {
			let res;
			try {
				res = await axios.delete(url);
			} catch (err) {
				const cfResponse = err.response?.data;
				if (cfResponse) log(JSON.stringify(cfResponse), 3);
				throw new Error(`DELETE ${url} failed: ${err.message}`, { cause: err });
			}

			if (!res.data.success) throw new Error(`DELETE ${url} failed: ${JSON.stringify(res.data.errors)}`);
		};

		for (const { zone, partRules, entrypoint } of toDelete) {
			log(`Deleting ${partRules.length} rule(s) from zone ${zone.name}...`);
			const remaining = (entrypoint?.rules ?? []).filter(r => !(r.description && PART_REGEX.test(r.description)));
			const { data } = await axios.put(`/zones/${zone.id}/rulesets/phases/${PHASE}/entrypoint`, { rules: remaining.map(passthroughRule) });
			if (!data.success) throw new Error(`Failed to update ruleset for zone ${zone.name}: ${JSON.stringify(data.errors)}`);
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
