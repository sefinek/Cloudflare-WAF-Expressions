const fs = require('node:fs');
const path = require('node:path');

const MD = fs.readFileSync(path.join(__dirname, '..', 'rules', 'expressions.md'), 'utf8');

const decode = value => {
	let previous;
	do {
		previous = value;
		value = value.replace(/\+/g, ' ').replace(/%([a-f\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
	} while (value !== previous);
	return value;
};

const wildcardToRegex = pattern => {
	const body = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
	return new RegExp(`^${body}$`, 'i');
};

const extractPathRules = () => MD.split('\n').reduce((rules, line) => {
	const match = line.match(/(url_decode\(http\.request\.uri\.path, "r"\)|http\.request\.uri\.path) wildcard "([^"]*)"/);
	if (!match) return rules;

	rules.push({
		pattern: match[2],
		decoded: match[1].startsWith('url_decode'),
		regex: wildcardToRegex(match[2]),
		notStartsWith: [...line.matchAll(/not starts_with\((?:url_decode\(http\.request\.uri\.path, "r"\)|http\.request\.uri\.path), "([^"]*)"\)/g)].map(m => m[1]),
		notContains: [...line.matchAll(/not http\.request\.uri\.path contains "([^"]*)"/g)].map(m => m[1]),
	});
	return rules;
}, []);

const PATH_RULES = extractPathRules();

const isPathBlockedOnPrimaryHost = uriPath => PATH_RULES.some(rule => {
	const value = rule.decoded ? decode(uriPath) : uriPath;
	return rule.regex.test(value) &&
		!rule.notStartsWith.some(prefix => value.startsWith(prefix)) &&
		!rule.notContains.some(fragment => value.includes(fragment));
});

const PASS = [
	'/_next/static/chunks/11.shudcv6pi8.css',
	'/_next/static/chunks/app.pyabcd.js',
	'/_next/static/chunks/x.sqlhash.css',
	'/_next/static/chunks/y.ymlhash.css',
	'/_next/static/chunks/z.envhash.js',
	'/_next/static/chunks/a.loghash.css',
	'/.well-known/acme-challenge/test123',
	'/favicon.ico',
	'/robots.txt',
	'/page.shtml',
	'/lib/module.pyc',
	'/assets/z.envmap.js',
	'/%252ewell-known/acme-challenge/test123',
	'/assets/app%252epyabcd.js',
	'/aws-ses.json.txt',
	'/aws/waf-probe.txt',
];

const BLOCK = [
	'/test.sh',
	'/config.py',
	'/dump.sql',
	'/config.yml',
	'/app.yaml',
	'/error.log',
	'/.env',
	'/.env.local',
	'/.env.production',
	'/api/.env',
	'/deep/nested/install.sh',
	'/app/main.py',
	'/database/dump.sql',
	'/k8s/deployment.yaml',
	'/ci/config.yml',
	'/logs/access.log',
	'/phpmyadmin/index.html',
	'/actuator/health',
	'/auth.json',
	'/test.SH',
	'/downloads/db.sql.gz',
	'/dump.sql.bz2',
	'/backup.tar.gz',
	'/index.php.bak',
	'/config.py.old',
	'/wp-config.php.swp',
	'/config.yml.bak',
	'/aws%252fwaf-probe.json',
	'/%252egit/config',
	'/.well-known/%252eenv',
	'/terraform%252etfstate',
	'/waf-probe%252esql',
	'/curl%2520example.invalid',
	'/wget+example.invalid',
];

describe('decoded query rules', () => {
	const { cases } = require('../data/tools/probeWAF.js');
	const queryRules = [...MD.matchAll(/url_decode\(http\.request\.uri\.query, "r"\) (wildcard|contains) ("(?:\\.|[^"\\])*")/g)]
		.map(([, operator, literal]) => ({ operator, pattern: JSON.parse(literal) }));
	test.each(cases.filter(item => item.endpoint.startsWith('/?') && !(/%(?:00|0a|0d)/i).test(item.endpoint)))('$expect: $endpoint', item => {
		const query = decode(item.endpoint.slice(2));
		const blocked = queryRules.some(rule => rule.operator === 'wildcard' ? wildcardToRegex(rule.pattern).test(query) : query.includes(rule.pattern));
		expect(blocked).toBe(item.expect === 'block');
	});
});

test('contains no duplicate top-level conditions across blocks', () => {
	const conditions = MD.split('\n').filter(line => line.startsWith('(') && (/\)(?: or)?\s*$/).test(line))
		.map(line => line.trim().replace(/ or$/, ''));
	expect(new Set(conditions).size).toBe(conditions.length);
});

test('keeps comparison values sorted within each field and operator group', () => {
	for (const [, block] of MD.matchAll(/```\r?\n([\s\S]*?)```/g)) {
		const groups = new Map();
		for (const line of block.split('\n')) {
			const match = line.trim().match(/^\(?((?:url_decode\([^)]*\)|lower\([^)]*\)|http\.[\w.]+) (?:eq|contains|wildcard)) ("(?:\\.|[^"\\])*")/);
			if (!match) continue;
			if (!groups.has(match[1])) groups.set(match[1], []);
			groups.get(match[1]).push(JSON.parse(match[2]));
		}
		for (const values of groups.values()) expect(values).toEqual([...values].sort());
	}
});

describe('WAF path rules on the primary host', () => {
	test.each(PASS)('passes: %s', uriPath => expect(isPathBlockedOnPrimaryHost(uriPath)).toBe(false));
	test.each(BLOCK)('blocks: %s', uriPath => expect(isPathBlockedOnPrimaryHost(uriPath)).toBe(true));
});

describe('regression guards for the extension-anchoring fix', () => {
	test('loose mid-path and per-extension companion wildcards are gone', () => {
		for (const removed of [
			'"*.sh*"', '"*.py*"', '"*.sql*"', '"*.yml*"', '"*.yaml*"', '"*.log*"',
			'"*.sh.*"', '"*.py.*"', '"*.sql.*"', '"*.yml.*"', '"*.yaml.*"', '"*.log.*"',
		]) {
			expect(MD).not.toContain(removed);
		}
	});

	test('end-anchored extension and backup/archive rules are present', () => {
		for (const anchored of ['"*.sh"', '"*.py"', '"*.sql"', '"*/.env*"', '"*.gz"', '"*.bak"', '"*.tar"']) {
			expect(MD).toContain(anchored);
		}
	});
});
