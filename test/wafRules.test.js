const fs = require('node:fs');
const path = require('node:path');

const MD = fs.readFileSync(path.join(__dirname, '..', 'rules', 'expressions.md'), 'utf8');

const wildcardToRegex = pattern => {
	const body = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
	return new RegExp(`^${body}$`, 'i');
};

const extractPathRules = () => MD.split('\n').reduce((rules, line) => {
	const match = line.match(/http\.request\.uri\.path wildcard "([^"]*)"/);
	if (!match) return rules;

	rules.push({
		pattern: match[1],
		regex: wildcardToRegex(match[1]),
		notStartsWith: [...line.matchAll(/not starts_with\(http\.request\.uri\.path, "([^"]*)"\)/g)].map(m => m[1]),
		notContains: [...line.matchAll(/not http\.request\.uri\.path contains "([^"]*)"/g)].map(m => m[1]),
	});
	return rules;
}, []);

const PATH_RULES = extractPathRules();

const isPathBlockedOnPrimaryHost = uriPath => PATH_RULES.some(rule =>
	rule.regex.test(uriPath) &&
	!rule.notStartsWith.some(prefix => uriPath.startsWith(prefix)) &&
	!rule.notContains.some(fragment => uriPath.includes(fragment))
);

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
];

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
