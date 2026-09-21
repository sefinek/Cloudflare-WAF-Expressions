const { writeFile } = require('node:fs/promises');
const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');

const cases = [
	{ endpoint: '/', expect: 'control' },
	{ endpoint: '/?waf_probe=ordinary', expect: 'control' },
	{ endpoint: '/waf-probe-missing-20260921', expect: 'control' },
	{ endpoint: '/?waf_probe=/.git', expect: 'block' },
	{ endpoint: '/?waf_probe=/nested/.git/config', expect: 'block' },
	{ endpoint: '/?first=ok&waf_probe=/.GIT/config', expect: 'block' },
	{ endpoint: '/?waf_probe=%2F.git', expect: 'block' },
	{ endpoint: '/?waf_probe=/%2egit', expect: 'block' },
	{ endpoint: '/?waf_probe=%2F%2Egit%2Fconfig', expect: 'block' },
	{ endpoint: '/?waf_probe=%2f%2e%67%69%74', expect: 'block' },
	{ endpoint: '/?waf_probe=%252F%252egit', expect: 'block' },
	{ endpoint: '/?waf_probe=%2Fgit', expect: 'control' },
	{ endpoint: '/?waf_probe=%252eenv', expect: 'block' },
	{ endpoint: '/?waf_probe=etc%252fpasswd', expect: 'block' },
	{ endpoint: '/?waf_probe=%252e%252e%252fprobe', expect: 'block' },
	{ endpoint: '/?waf_probe=.%2e%5cprobe', expect: 'block' },
	{ endpoint: '/?waf_probe=%70hp%3a%2f%2ffilter', expect: 'block' },
	{ endpoint: '/?waf_probe=%66ile%3a%2f%2fwaf-probe', expect: 'block' },
	{ endpoint: '/?waf_probe=auto%5fprepend%5ffile', expect: 'block' },
	{ endpoint: '/?waf_probe=secrets%252ejson', expect: 'block' },
	{ endpoint: '/?waf_probe=set%2dcookie%3a', expect: 'block' },
	{ endpoint: '/?waf_probe=%65d25519', expect: 'block' },
	{ endpoint: '/?waf_probe=curl%2520example.invalid', expect: 'block' },
	{ endpoint: '/?waf_probe=curl+example.invalid', expect: 'block' },
	{ endpoint: '/?waf_probe=wget%20example.invalid', expect: 'block' },
	{ endpoint: '/?waf_probe=wget+example.invalid', expect: 'block' },
	{ endpoint: '/?waf_probe=%00', expect: 'block' },
	{ endpoint: '/?waf_probe=%0a', expect: 'block' },
	{ endpoint: '/?waf_probe=%0d', expect: 'block' },
	{ endpoint: '/terraform.tfstate', expect: 'block' },
	{ endpoint: '/terraform.tfstate.backup', expect: 'block' },
	{ endpoint: '/nested/terraform.tfstate', expect: 'block' },
	{ endpoint: '/TERRAFORM.TFSTATE', expect: 'block' },
	{ endpoint: '/client_secret.json', expect: 'block' },
	{ endpoint: '/client_secret_waf_probe.json', expect: 'block' },
	{ endpoint: '/nested/client_secret_waf_probe.json', expect: 'block' },
	{ endpoint: '/CLIENT_SECRET_WAF_PROBE.JSON', expect: 'block' },
	{ endpoint: '/aws_s3_config.json', expect: 'block' },
	{ endpoint: '/nested/aws_s3_config.json', expect: 'block' },
	{ endpoint: '/AWS_S3_CONFIG.JSON', expect: 'block' },
	{ endpoint: '/aws-ses.json', expect: 'block' },
	{ endpoint: '/nested/aws-ses.json', expect: 'block' },
	{ endpoint: '/AWS-SES.JSON', expect: 'block' },
	{ endpoint: '/aws/waf-probe.json', expect: 'block' },
	{ endpoint: '/nested/aws/waf-probe.json', expect: 'block' },
	{ endpoint: '/aws/nested/waf-probe.json', expect: 'block' },
	{ endpoint: '/AWS/WAF-PROBE.JSON', expect: 'block' },
	{ endpoint: '/s3.waf-probe', expect: 'block' },
	{ endpoint: '/nested/s3.waf-probe', expect: 'block' },
	{ endpoint: '/S3.WAF-PROBE', expect: 'block' },
	{ endpoint: '/terraform%2etfstate', expect: 'block' },
	{ endpoint: '/%61ws-ses.json', expect: 'block' },
	{ endpoint: '/aws%2Fwaf-probe.json', expect: 'block' },
	{ endpoint: '/aws%252Fwaf-probe.json', expect: 'block' },
	{ endpoint: '/%252egit/config', expect: 'block' },
	{ endpoint: '/waf-probe%252esql', expect: 'block' },
	{ endpoint: '/curl%2520example.invalid', expect: 'block' },
	{ endpoint: '/wget+example.invalid', expect: 'block' },
	{ endpoint: '/.git', expect: 'block' },
	{ endpoint: '/.git/config', expect: 'block' },
	{ endpoint: '/.ssh', expect: 'block' },
	{ endpoint: '/.ssh/config', expect: 'block' },
	{ endpoint: '/.kube/config', expect: 'block' },
	{ endpoint: '/.s3cfg', expect: 'block' },
	{ endpoint: '/.env', expect: 'block' },
	{ endpoint: '/.env.production', expect: 'block' },
	{ endpoint: '/.aws/config', expect: 'block' },
	{ endpoint: '/.well-known/waf-probe', expect: 'control' },
	{ endpoint: '/%252ewell-known/waf-probe', expect: 'control' },
	{ endpoint: '/.well-known/%252eenv', expect: 'block' },
	{ endpoint: '/.well-known/.git/waf-probe', expect: 'observe' },
	{ endpoint: '/client_secret_waf_probe.json.txt', expect: 'control' },
	{ endpoint: '/aws-ses.json.txt', expect: 'control' },
	{ endpoint: '/aws/waf-probe.txt', expect: 'control' },
	{ endpoint: '/s3-waf-probe', expect: 'control' },
	{ endpoint: '/?waf_probe=ordinary%20value', expect: 'control' },
];

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const verdict = (status, challenge, expected) => {
	if (status === 429) return 'INCONCLUSIVE: rate limited';
	if (challenge) return 'INCONCLUSIVE: Cloudflare challenge';
	if (status >= 500) return 'INCONCLUSIVE: server error';
	if (status >= 300 && status < 400) return 'INCONCLUSIVE: redirect';

	if (expected === 'observe') {
		return status === 403 ? 'OBSERVED: access denied' : 'OBSERVED: no HTTP 403';
	}

	if (expected === 'block') {
		return status === 403 ? 'PASS: expected HTTP 403' : 'FAIL: expected HTTP 403';
	}

	return (status >= 200 && status < 300) || status === 404
		? 'PASS: control request allowed'
		: 'FAIL: control request rejected';
};

const main = async () => {
	const { values } = parseArgs({
		options: {
			domain: { type: 'string' },
			output: { type: 'string', default: 'waf-probe-results.md' },
			'delay-ms': { type: 'string', default: '500' },
			'timeout-ms': { type: 'string', default: '15000' },
			help: { type: 'boolean' },
		},
	});

	if (values.help) {
		console.log('npm run probe:waf -- --domain sefinek.net [--output results.md] [--delay-ms 500] [--timeout-ms 15000]');
		return;
	}

	if (!values.domain) {
		throw new Error('Missing --domain. Usage: npm run probe:waf -- --domain sefinek.net');
	}

	const base = new URL(values.domain.includes('://') ? values.domain : `https://${values.domain}`);

	if (
		!['http:', 'https:'].includes(base.protocol) ||
		base.username || base.password ||
		base.pathname !== '/' || base.search || base.hash
	) {
		throw new Error('--domain must be a hostname or HTTP(S) origin without a path, query, fragment, or credentials.');
	}

	const delayMs = Number(values['delay-ms']);
	const timeoutMs = Number(values['timeout-ms']);
	if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60000 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
		throw new Error('--delay-ms: 0–60000; --timeout-ms: 1–60000.');
	}

	const rows = ['| Endpoint | HTTP status | Verdict |', '| --- | --- | --- |'];
	const legend = [
		'**Legend**',
		'',
		'- **PASS** - Matches the expected outcome: HTTP 403 for blocked probes, or HTTP 2xx/404 for control requests.',
		'- **FAIL** - Does not match the expected outcome.',
		'- **OBSERVED** - Recorded without a pass/fail expectation; requires interpretation for the deployment.',
		'- **INCONCLUSIVE** - Could not assess the result due to a challenge, redirect, rate limit, server error, or connection problem.',
		'',
		'HTTP 403 alone does not identify which WAF rule matched.',
	].join('\n');

	const save = () => writeFile(values.output, `${rows.join('\n')}\n\n${legend}\n`, 'utf8');
	await save();

	for (const [index, testCase] of cases.entries()) {
		if (index) await delay(delayMs);

		const url = `${base.origin}${testCase.endpoint}`;
		let status = '-';
		let result;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: { 'User-Agent': userAgent },
				redirect: 'manual',
				signal: AbortSignal.timeout(timeoutMs),
			});

			status = response.status;
			result = verdict(status, response.headers.get('cf-mitigated') === 'challenge', testCase.expect);

			if (response.body) await response.body.cancel();
		} catch (err) {
			result = err.name === 'TimeoutError' ? 'INCONCLUSIVE: timeout' : 'INCONCLUSIVE: connection error';
		}

		rows.push(`| ${url.replace(/\|/g, '%7C')} | ${status} | ${result} |`);
		await save();

		console.log(`[${index + 1}/${cases.length}] ${testCase.endpoint}: ${status} - ${result}`);
	}

	console.log('Saved:', values.output);
};

if (require.main === module) {
	main().catch(err => {
		console.error(err.message);
		process.exitCode = 1;
	});
}

module.exports = { cases, verdict };
