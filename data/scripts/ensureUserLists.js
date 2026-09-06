const fs = require('node:fs/promises');
const log = require('./log.js');
const box = require('./box.js');
const hyperlink = require('./hyperlink.js');
const { MAX_EXPRESSION_LENGTH } = require('../services/cloudflare/wafRuleset.js');

const USER_LISTS_DIR = 'rules/my-lists';

const FILES = [
	{
		name: 'ip-blocklist.txt',
		label: 'ip-blocklist.txt',
		hint: 'custom IPs to block',
		template: `# === Cloudflare WAF IP Blocklist ===
# Add your own IP addresses here, one per line. Both IPv4 and IPv6 are supported.
# This file is yours. It will never be overwritten by git pulls or project updates.
# It is merged with the built-in rules/ip-blocklist.txt automatically on every sync.
#
# Examples:
#   203.0.113.42
#   198.51.100.0/24
#   2001:db8::1
`,
	},
	{
		name: 'allowlist.txt',
		label: 'allowlist.txt',
		hint: 'expressions to bypass WAF rules',
		template: `# === Cloudflare WAF Allowlist ===
# Each non-comment, non-empty line must be a valid Cloudflare rule expression.
# Lines are combined with OR. If any line matches, all managed WAF rules (Part 1-5, plus your blocklist.txt rule if you have one) are skipped for that request.
# User rules added manually in the Cloudflare dashboard are NOT affected.
# This file is yours. It will never be overwritten by git pulls or project updates.
#
# Examples:
#   Bypass for all zones:
#     http.user_agent contains "Better Uptime Bot"
#     ip.geoip.asnum eq 14618
#     ip.src eq 1.2.3.4
#
#   Bypass only for a specific zone (by name or zone ID):
#     [sefinek.net] http.user_agent contains "Better Uptime Bot"
#     [e1566f71dc0ea1f10b434542e0cbefe5] ip.src eq 1.2.3.4
#
#   Bypass for all zones except a specific one:
#     [!sniffcat.com] http.user_agent contains "Better Uptime Bot"
#
# Leave this file empty (only comments) to disable the allowlist rule entirely.
`,
	},
	{
		name: 'blocklist.txt',
		label: 'blocklist.txt',
		hint: 'expressions to always block, synced alongside the managed Part 1-5 rules',
		template: `# === Cloudflare WAF Blocklist [BETA] ===
# The opposite of allowlist.txt. Each non-comment, non-empty line must be a valid Cloudflare rule expression.
# Lines are combined with OR into a single additional rule (action: Block).
# Survives repository syncs (unlike Part 1-5, which are regenerated from rules/expressions.md on every sync).
# Also respects allowlist.txt: a request matching the allowlist bypasses this rule too.
# This file is yours. It will never be overwritten by git pulls or project updates.
#
# Cloudflare limits the number of custom rules per zone depending on the plan (Free: 5, Pro: 20, Business: 100, Enterprise: 1000).
# Part 1-5 alone already use up 5 - so on the Free plan there's no room left for a separate rule for this list. In that case (or
# when manually added rules in the Cloudflare dashboard fill the remaining slots), the content is merged into whichever Part rule
# has the most spare room. On Pro and higher plans it usually gets its own rule.
#
# Cloudflare also limits the length of a single rule expression to ${MAX_EXPRESSION_LENGTH} characters, on every plan (this is a hard limit of the
# Ruleset Engine, not something tied to a paid plan - see https://developers.cloudflare.com/ruleset-engine/rules-language/expressions/).
# If your combined lines would exceed this limit for a given zone (either as a separate rule or after being merged into a Part),
# synchronization for that zone is skipped and a warning is logged instead of an error.
#
# Examples:
#   Block for all zones:
#     http.user_agent contains "SomeBadBot"
#     ip.geoip.asnum eq 12345
#     ip.src eq 1.2.3.4
#
#   Block only for a specific zone (by name or zone ID):
#     [sefinek.net] http.user_agent contains "SomeBadBot"
#     [e1566f71dc0ea1f10b434542e0cbefe5] ip.src eq 1.2.3.4
#
#   Block for all zones except a specific one:
#     [!sniffcat.com] http.user_agent contains "SomeBadBot"
#
# Leave this file empty (only comments) to disable this rule entirely.
`,
	},
];

module.exports = async () => {
	await fs.mkdir(USER_LISTS_DIR, { recursive: true });

	const created = (await Promise.all(FILES.map(async file => {
		const filePath = `${USER_LISTS_DIR}/${file.name}`;
		try {
			await fs.access(filePath);
			return null;
		} catch (err) {
			if (err.code !== 'ENOENT') throw err;
			await fs.writeFile(filePath, file.template);
			log(`Created ${hyperlink(filePath, filePath)}`, 1);
			return file;
		}
	}))).filter(Boolean);

	if (!created.length) return;

	box([
		'Your personal lists are ready in rules/my-lists/:',
		'',
		...FILES.map(f => `* ${hyperlink(f.label, `${USER_LISTS_DIR}/${f.name}`)} - ${f.hint}`),
		'',
		'Edit these files to customize your WAF.',
		'They will never be overwritten by updates.',
	]);
};
