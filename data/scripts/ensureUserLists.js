const fs = require('node:fs/promises');
const log = require('./log.js');

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
# Lines are combined with OR. If any line matches, all managed WAF rules (Part 1-5) are skipped for that request.
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
];

const W = 52;
const USE_COLOR = !('pm_id' in process.env);
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const box = lines => {
	const top = `╔${'═'.repeat(W + 2)}╗`;
	const bottom = `╚${'═'.repeat(W + 2)}╝`;
	const mid = lines.map(l => `║ ${l.padEnd(W)} ║`).join('\n');
	const frame = `${top}\n${mid}\n${bottom}`;
	console.log(USE_COLOR ? `${CYAN}${frame}${RESET}` : frame);
};

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
			log(`Created ${filePath}`, 1);
			return file;
		}
	}))).filter(Boolean);

	if (!created.length) return;

	box([
		'Your personal lists are ready in rules/my-lists/:',
		'',
		...FILES.map(f => `* ${f.label} - ${f.hint}`),
		'',
		'Edit these files to customize your WAF.',
		'They will never be overwritten by updates.',
	]);
};
