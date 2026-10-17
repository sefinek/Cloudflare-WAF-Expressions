const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mockModule } = require('./helpers/mockModule.js');

const log = mockModule('../data/scripts/log.js', mock.fn());
const { createRemoteRules, validateExpressions, validateBlocklist, SUPPORTED_FORMAT } = require('../data/services/remoteRules.js');

const SOURCE_URL = 'https://rules.example/rules';
const BUNDLED = fs.readFileSync(path.join(__dirname, '..', 'rules', 'expressions.md'), 'utf8');

const expressions = (format = SUPPORTED_FORMAT, expression = '(http.request.uri.path contains "/.env")') =>
	`<!-- rules-format: ${format} -->\n## Part 1\n> **Action:** Block\n\`\`\`\n${expression}\n\`\`\`\n`;

const BLOCKLIST = '# comment\n1.2.3.4\n10.0.0.0/8\n2001:4860:4860::8888\n2001:db8::/32\n';

// Responses per file name: { status, data, etag } or an Error to throw
const createHttp = responses => {
	const calls = [];
	return {
		calls,
		get: async (url, options) => {
			const name = url.slice(SOURCE_URL.length + 1);
			calls.push({ name, headers: options.headers });
			const res = responses[name];
			if (res instanceof Error) throw res;
			return { status: res.status ?? 200, data: res.data, headers: res.etag ? { etag: res.etag } : {} };
		},
	};
};

const setup = responses => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-rules-'));
	const http = createHttp(responses);
	return { dir, http, rules: createRemoteRules({ sourceUrl: SOURCE_URL, dir, http }) };
};

const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');

beforeEach(() => log.mock.resetCalls());

describe('validateExpressions', () => {
	test('accepts the bundled rules/expressions.md', () => {
		assert.equal(validateExpressions(BUNDLED), null);
	});

	test('rejects a file without the format marker', () => {
		assert.match(validateExpressions(expressions().replace(/<!--.*-->\n/, '')), /missing <!-- rules-format/);
	});

	test('rejects a newer format with an update hint', () => {
		assert.match(validateExpressions(expressions(SUPPORTED_FORMAT + 1)), /requires a newer version of the script.*npm run update/);
	});

	test('accepts an older format', () => {
		assert.equal(validateExpressions(expressions(0)), null);
	});

	test('rejects a file without rule blocks', () => {
		assert.match(validateExpressions(`<!-- rules-format: ${SUPPORTED_FORMAT} -->\n# Nothing here\n`), /no rule blocks/);
	});

	test('rejects a block with an empty expression', () => {
		assert.match(validateExpressions(expressions(SUPPORTED_FORMAT, '')), /missing a name, an action or an expression/);
	});
});

describe('validateBlocklist', () => {
	test('accepts IPv4, IPv6 and CIDR entries, ignoring comments and blank lines', () => {
		assert.equal(validateBlocklist(BLOCKLIST), null);
	});

	test('accepts the bundled rules/ip-blocklist.txt', () => {
		assert.equal(validateBlocklist(fs.readFileSync(path.join(__dirname, '..', 'rules', 'ip-blocklist.txt'), 'utf8')), null);
	});

	for (const entry of ['1.2.3', '1.2.3.4/33', '2001:db8::/129', '1.2.3.4/8/1', 'example.com', '<html>']) {
		test(`rejects "${entry}"`, () => {
			assert.match(validateBlocklist(`1.2.3.4\n${entry}\n`), /invalid entry/);
		});
	}
});

describe('sync', () => {
	test('downloads valid files and reads them instead of the bundled ones', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions(), etag: '"a"' }, 'ip-blocklist.txt': { data: BLOCKLIST, etag: '"b"' } });

		assert.equal(rules.getPath('expressions.md'), 'rules/expressions.md');
		await rules.sync();

		assert.equal(rules.getPath('expressions.md'), path.join(dir, 'expressions.md'));
		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.equal(read(dir, 'ip-blocklist.txt'), BLOCKLIST);
		assert.equal(JSON.parse(read(dir, 'state.json'))['expressions.md'].etag, '"a"');
	});

	test('sends the ETag and keeps the copy on 304', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions(), etag: '"a"' }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await rules.sync();

		const http = createHttp({ 'expressions.md': { status: 304 }, 'ip-blocklist.txt': { status: 304 } });
		await createRemoteRules({ sourceUrl: SOURCE_URL, dir, http }).sync();

		assert.deepEqual(http.calls.find(c => c.name === 'expressions.md').headers, { 'If-None-Match': '"a"' });
		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.equal(JSON.parse(read(dir, 'state.json'))['expressions.md'].etag, '"a"');
	});

	test('does not send the ETag when the local copy is missing', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions(), etag: '"a"' }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await rules.sync();
		fs.rmSync(path.join(dir, 'expressions.md'));

		const http = createHttp({ 'expressions.md': { data: expressions(), etag: '"a"' }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await createRemoteRules({ sourceUrl: SOURCE_URL, dir, http }).sync();

		assert.deepEqual(http.calls.find(c => c.name === 'expressions.md').headers, {});
		assert.ok(fs.existsSync(path.join(dir, 'expressions.md')));
	});

	test('keeps the last valid copy when the new file requires a newer script, warning only once', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await rules.sync();

		const newer = { 'expressions.md': { data: expressions(SUPPORTED_FORMAT + 1) }, 'ip-blocklist.txt': { status: 304 } };
		await createRemoteRules({ sourceUrl: SOURCE_URL, dir, http: createHttp(newer) }).sync();
		await createRemoteRules({ sourceUrl: SOURCE_URL, dir, http: createHttp(newer) }).sync();

		assert.equal(read(dir, 'expressions.md'), expressions());
		const rejections = log.mock.calls.filter(c => String(c.arguments[0]).startsWith('Rejected the downloaded expressions.md'));
		assert.deepEqual(rejections.map(c => c.arguments[1]), [2, 0]);
	});

	test('rejects an invalid blocklist and falls back to the bundled file', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: '<html>Not found</html>' } });
		await rules.sync();

		assert.equal(fs.existsSync(path.join(dir, 'ip-blocklist.txt')), false);
		assert.equal(rules.getPath('ip-blocklist.txt'), 'rules/ip-blocklist.txt');
	});

	test('a download error keeps the previous copy and continues with the other files', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await rules.sync();

		const updated = '1.1.1.1\n';
		await createRemoteRules({ sourceUrl: SOURCE_URL, dir, http: createHttp({ 'expressions.md': new Error('timeout'), 'ip-blocklist.txt': { data: updated } }) }).sync();

		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.equal(read(dir, 'ip-blocklist.txt'), updated);
		assert.ok(log.mock.calls.some(c => (/Failed to download .*expressions\.md: timeout/).test(c.arguments[0]) && c.arguments[1] === 2));
	});

	test('an empty source URL disables downloads and ignores old copies', async () => {
		const { dir, rules } = setup({ 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: BLOCKLIST } });
		await rules.sync();

		const http = createHttp({});
		const disabled = createRemoteRules({ sourceUrl: '', dir, http });
		await disabled.sync();

		assert.equal(http.calls.length, 0);
		assert.equal(disabled.getPath('expressions.md'), 'rules/expressions.md');
	});

	test('getPath rejects unknown files', () => {
		assert.throws(() => setup({}).rules.getPath('other.md'), /Unknown rule file/);
	});
});

describe('sync from the API', () => {
	const API_URL = 'https://api.example/rules';
	const crypto = require('node:crypto');
	const sha = text => crypto.createHash('sha256').update(text).digest('hex');

	const snapshot = (files = { 'expressions.md': expressions(), 'ip-blocklist.txt': BLOCKLIST }, version = 'v1') => JSON.stringify({
		success: true, format: SUPPORTED_FORMAT, version,
		files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content, sha256: sha(content), size: content.length }])),
	});

	// api: { status, data, etag } or an Error; raw: responses per file name for the GitHub fallback
	const createHttpWithApi = ({ api, raw = {} }) => {
		const calls = [];
		return {
			calls,
			get: async (url, options) => {
				if (url === API_URL) {
					calls.push({ api: true, params: options.params, headers: options.headers });
					if (api instanceof Error) throw api;
					return { status: api.status ?? 200, data: api.data, headers: api.etag ? { etag: api.etag } : {} };
				}
				const name = url.slice(SOURCE_URL.length + 1);
				calls.push({ name, headers: options.headers });
				const res = raw[name];
				if (!res || res instanceof Error) throw res ?? new Error(`unexpected request ${url}`);
				return { status: res.status ?? 200, data: res.data, headers: res.etag ? { etag: res.etag } : {} };
			},
		};
	};

	const rulesWith = (dir, http, sourceUrl = SOURCE_URL) => createRemoteRules({ apiUrl: API_URL, sourceUrl, dir, http });
	const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'remote-rules-api-'));

	test('downloads both files from the API without touching GitHub, asking for the supported format', async () => {
		const dir = tempDir();
		const http = createHttpWithApi({ api: { data: snapshot(), etag: '"1-v1"' } });
		await rulesWith(dir, http).sync();

		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.equal(read(dir, 'ip-blocklist.txt'), BLOCKLIST);
		assert.deepEqual(http.calls.map(c => c.api), [true]);
		assert.deepEqual(http.calls[0].params, { format: SUPPORTED_FORMAT });
		assert.equal(JSON.parse(read(dir, 'state.json')).api.version, 'v1');
	});

	test('sends the ETag on the next sync and keeps the files on 304', async () => {
		const dir = tempDir();
		await rulesWith(dir, createHttpWithApi({ api: { data: snapshot(), etag: '"1-v1"' } })).sync();

		const http = createHttpWithApi({ api: { status: 304 } });
		await rulesWith(dir, http).sync();

		assert.deepEqual(http.calls[0].headers, { 'If-None-Match': '"1-v1"' });
		assert.equal(http.calls.length, 1);
		assert.equal(read(dir, 'expressions.md'), expressions());
	});

	test('falls back to GitHub when the API is unavailable, warning only once', async () => {
		const dir = tempDir();
		const raw = { 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: BLOCKLIST } };
		await rulesWith(dir, createHttpWithApi({ api: new Error('connect ECONNREFUSED'), raw })).sync();
		await rulesWith(dir, createHttpWithApi({ api: new Error('connect ECONNREFUSED'), raw })).sync();

		assert.equal(read(dir, 'expressions.md'), expressions());
		const warnings = log.mock.calls.filter(c => String(c.arguments[0]).startsWith('Rules API'));
		assert.deepEqual(warnings.map(c => c.arguments[1]), [2, 0]);
		assert.match(warnings[0].arguments[0], /ECONNREFUSED\. Falling back to GitHub/);
	});

	test('a file not matching its checksum is not written and GitHub is used instead', async () => {
		const dir = tempDir();
		const body = JSON.parse(snapshot());
		body.files['ip-blocklist.txt'].sha256 = 'f'.repeat(64);
		const raw = { 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: '1.1.1.1\n' } };
		await rulesWith(dir, createHttpWithApi({ api: { data: JSON.stringify(body) }, raw })).sync();

		assert.equal(read(dir, 'ip-blocklist.txt'), '1.1.1.1\n');
		assert.ok(log.mock.calls.some(c => (/ip-blocklist\.txt does not match its checksum/).test(c.arguments[0])));
	});

	test('an incompatible or broken snapshot is rejected as a whole', async () => {
		const dir = tempDir();
		await rulesWith(dir, createHttpWithApi({ api: { data: snapshot(), etag: '"1-v1"' } })).sync();

		const newer = snapshot({ 'expressions.md': expressions(SUPPORTED_FORMAT + 1), 'ip-blocklist.txt': '9.9.9.9\n' }, 'v2');
		await rulesWith(dir, createHttpWithApi({ api: { data: newer } }), '').sync();

		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.equal(read(dir, 'ip-blocklist.txt'), BLOCKLIST);
		assert.ok(log.mock.calls.some(c => (/rejected expressions\.md: rules format .* requires a newer version.*Keeping the current rules/).test(c.arguments[0])));
	});

	test('invalid JSON is treated as an API failure', async () => {
		const dir = tempDir();
		const raw = { 'expressions.md': { data: expressions() }, 'ip-blocklist.txt': { data: BLOCKLIST } };
		await rulesWith(dir, createHttpWithApi({ api: { data: '<html>502 Bad Gateway</html>' }, raw })).sync();
		assert.equal(read(dir, 'expressions.md'), expressions());
		assert.ok(log.mock.calls.some(c => (/invalid JSON response/).test(c.arguments[0])));
	});

	test('after a GitHub fallback the next API request does not reuse the old ETag', async () => {
		const dir = tempDir();
		await rulesWith(dir, createHttpWithApi({ api: { data: snapshot(), etag: '"1-v1"' } })).sync();

		const raw = { 'expressions.md': { data: expressions(SUPPORTED_FORMAT, '(http.host eq "x")') }, 'ip-blocklist.txt': { status: 304 } };
		await rulesWith(dir, createHttpWithApi({ api: new Error('timeout'), raw })).sync();

		const http = createHttpWithApi({ api: { data: snapshot(), etag: '"1-v1"' } });
		await rulesWith(dir, http).sync();
		assert.deepEqual(http.calls[0].headers, {});
		assert.equal(read(dir, 'expressions.md'), expressions());
	});
});
