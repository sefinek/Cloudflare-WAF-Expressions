const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isIP } = require('node:net');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { parse: parseExpressions } = require('../scripts/parseExpressions.js');
const log = require('../scripts/log.js');
const { version } = require('../../package.json');

// Rules format understood by this version of the script. Bump it only when rules/expressions.md changes in a way
// older parsers cannot handle; such files are then rejected by older installs instead of breaking them.
const SUPPORTED_FORMAT = 1;
const FORMAT_MARKER = /<!--\s*rules-format:\s*(\d+)\s*-->/;
// The API serves validated snapshots in the format this version supports. Raw GitHub is the fallback when the API is unavailable.
const DEFAULT_API_URL = 'https://api.sefinek.net/api/v2/cloudflare-waf/rules';
const DEFAULT_SOURCE_URL = 'https://raw.githubusercontent.com/sefinek/Cloudflare-WAF-Expressions/main/rules';
const MAX_FILE_SIZE = 1024 * 1024;

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

const getFormat = text => {
	const match = text.match(FORMAT_MARKER);
	return match ? Number(match[1]) : null;
};

const validateExpressions = text => {
	const format = getFormat(text);
	if (format === null) return 'missing <!-- rules-format: N --> marker';
	if (format > SUPPORTED_FORMAT) return `rules format ${format} requires a newer version of the script (this one supports format ${SUPPORTED_FORMAT}). Run 'npm run update'`;

	const blocks = parseExpressions(text);
	if (!blocks.length) return 'no rule blocks found';

	const invalid = blocks.find(block => !block.name || !block.action || !block.expressions);
	if (invalid) return `rule block "${invalid.name || '?'}" is missing a name, an action or an expression`;

	return null;
};

const isIPOrCIDR = value => {
	const [address, prefix, ...rest] = value.split('/');
	const family = isIP(address);
	if (!family || rest.length) return false;
	if (prefix === undefined) return true;
	if (!(/^\d{1,3}$/).test(prefix)) return false;
	return Number(prefix) <= (family === 4 ? 32 : 128);
};

const validateBlocklist = text => {
	const entries = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
	const invalid = entries.find(entry => !isIPOrCIDR(entry));
	return invalid ? `invalid entry "${invalid}"` : null;
};

const FILES = [
	{ name: 'expressions.md', bundled: 'rules/expressions.md', validate: validateExpressions },
	{ name: 'ip-blocklist.txt', bundled: 'rules/ip-blocklist.txt', validate: validateBlocklist },
];

const createHttp = () => {
	const http = axios.create({
		timeout: 15000,
		maxContentLength: MAX_FILE_SIZE,
		responseType: 'text',
		transformResponse: [data => data],
		headers: { 'User-Agent': `Mozilla/5.0 (compatible; Cloudflare-WAF-Expressions/${version}; +https://github.com/sefinek/Cloudflare-WAF-Expressions)` },
	});

	axiosRetry(http, { retries: 2, retryDelay: count => count * 5000 });
	return http;
};

const writeAtomic = async (filePath, data) => {
	const tmp = `${filePath}.tmp`;
	await fsp.writeFile(tmp, data, 'utf8');
	await fsp.rename(tmp, filePath);
};

/**
 * Keeps local copies of the rule files, downloaded from the API (apiUrl) or, if it is unavailable, from sourceUrl.
 * A downloaded file replaces the previous copy only after it passes validation, so a broken or incompatible
 * upload never reaches Cloudflare. Without any downloaded copy, the files bundled with the repository are used.
 */
const createRemoteRules = ({ apiUrl, sourceUrl, dir = 'data/remote-rules', http = createHttp() } = {}) => {
	const statePath = path.join(dir, 'state.json');
	const localPath = name => path.join(dir, name);

	const loadState = async () => {
		try {
			return JSON.parse(await fsp.readFile(statePath, 'utf8'));
		} catch {
			return {};
		}
	};

	const syncFile = async (file, state) => {
		const url = `${sourceUrl}/${file.name}`;
		const previous = state[file.name] ?? {};
		const hasCopy = fs.existsSync(localPath(file.name));

		let res;
		try {
			res = await http.get(url, {
				headers: hasCopy && previous.etag ? { 'If-None-Match': previous.etag } : {},
				validateStatus: status => status === 200 || status === 304,
			});
		} catch (err) {
			log(`Failed to download ${url}: ${err.message}. Using the ${hasCopy ? 'last downloaded' : 'bundled'} version.`, 2);
			return;
		}

		if (res.status === 304) return;

		const error = file.validate(res.data);
		if (error) {
			// Logged as a warning (sent as an alert) only once per distinct problem, not on every sync
			log(`Rejected the downloaded ${file.name}: ${error}. Keeping the ${hasCopy ? 'last downloaded' : 'bundled'} version.`, error === previous.rejected ? 0 : 2);
			state[file.name] = { ...previous, rejected: error };
			return;
		}

		await writeAtomic(localPath(file.name), res.data);
		state[file.name] = { etag: res.headers.etag ?? null, downloadedAt: new Date().toISOString() };
		// The local copies no longer match the API snapshot, so the next API request must not be answered with 304
		delete state.api;
		log(`Downloaded ${file.name} (${res.data.length} bytes)`, 1);
	};

	// Logs a problem with the API once per distinct reason, then falls back to sourceUrl
	const apiFailed = (state, reason) => {
		const fallback = sourceUrl ? 'Falling back to GitHub' : 'Keeping the current rules';
		log(`Rules API ${apiUrl}: ${reason}. ${fallback}.`, reason === state.apiError ? 0 : 2);
		state.apiError = reason;
		return false;
	};

	// Returns true when the local copies are up to date with the API, false when the fallback should be used
	const syncFromApi = async state => {
		const hasCopies = FILES.every(file => fs.existsSync(localPath(file.name)));

		let res;
		try {
			res = await http.get(apiUrl, {
				params: { format: SUPPORTED_FORMAT },
				headers: hasCopies && state.api?.etag ? { 'If-None-Match': state.api.etag } : {},
				validateStatus: status => status === 200 || status === 304,
			});
		} catch (err) {
			return apiFailed(state, err.response ? `HTTP ${err.response.status}` : err.message);
		}

		if (res.status === 304) {
			delete state.apiError;
			return true;
		}

		let body;
		try {
			body = JSON.parse(res.data);
		} catch {
			return apiFailed(state, 'invalid JSON response');
		}

		const contents = {};
		for (const file of FILES) {
			const entry = body?.files?.[file.name];
			if (typeof entry?.content !== 'string') return apiFailed(state, `${file.name} is missing in the response`);
			if (sha256(entry.content) !== entry.sha256) return apiFailed(state, `${file.name} does not match its checksum`);

			const error = file.validate(entry.content);
			if (error) return apiFailed(state, `rejected ${file.name}: ${error}`);
			contents[file.name] = entry.content;
		}

		const changed = FILES.filter(file => !fs.existsSync(localPath(file.name)) || fs.readFileSync(localPath(file.name), 'utf8') !== contents[file.name]);
		for (const file of changed) await writeAtomic(localPath(file.name), contents[file.name]);

		state.api = { etag: res.headers.etag ?? null, format: body.format, version: body.version, downloadedAt: new Date().toISOString() };
		delete state.apiError;
		if (changed.length) log(`Downloaded rules version ${body.version} (format ${body.format}) from the API: ${changed.map(f => f.name).join(', ')}`, 1);
		return true;
	};

	const sync = async () => {
		if (!apiUrl && !sourceUrl) return;

		await fsp.mkdir(dir, { recursive: true });
		const state = await loadState();

		const upToDate = apiUrl ? await syncFromApi(state) : false;
		if (!upToDate && sourceUrl) {
			for (const file of FILES) await syncFile(file, state);
		}

		await writeAtomic(statePath, JSON.stringify(state, null, '\t'));
	};

	// Path of the file to read: the downloaded copy if there is one, otherwise the bundled file.
	// With both remote sources disabled, an old downloaded copy is ignored.
	const getPath = name => {
		const file = FILES.find(f => f.name === name);
		if (!file) throw new Error(`Unknown rule file: ${name}`);
		return (apiUrl || sourceUrl) && fs.existsSync(localPath(name)) ? localPath(name) : file.bundled;
	};

	return Object.freeze({ sync, getPath });
};

const { RULES_API_URL, RULES_SOURCE_URL } = process.env;
const apiUrl = (RULES_API_URL ?? DEFAULT_API_URL).trim();
const sourceUrl = (RULES_SOURCE_URL ?? DEFAULT_SOURCE_URL).trim().replace(/\/+$/, '');

module.exports = {
	...createRemoteRules({ apiUrl, sourceUrl }),
	createRemoteRules,
	validateExpressions,
	validateBlocklist,
	SUPPORTED_FORMAT,
};
