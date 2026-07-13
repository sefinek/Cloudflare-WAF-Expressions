# Changelog

## [v3.1.1] - 2026-07-13
- Significantly improved the regular expressions, resolving numerous false-positive issues.


## [v3.1.0] - 2026-06-29
- Added `rules/my-lists/allowlist.txt`. Defines WAF expressions excluded from all managed rules (Part 1-5). Supports per-zone targeting via `[zone.com]` and `[!zone.com]` prefixes.
- On first run, if `rules/my-lists/` files are missing, an info box is printed and the files are created automatically.


## [v3.0.0] - 2026-06-22

> [!WARNING]
> Your Cloudflare API token now requires the **Zone WAF → Edit** permission - the old **Firewall Services** permission may no longer be sufficient. Migrating to an [Account API token](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens) (`cfat_` prefix) is recommended. See the README for the full list of permissions.

### Changed
- **WAF rule management has been moved from the deprecated Firewall Rules API to the Rulesets API (WAF custom rules).** Cloudflare put the old API into maintenance mode (error 10020, `firewallrules.api.maintenance_mode`), causing rule updates to fail on affected accounts. Your existing rules (`Part N`) are detected and reused automatically - no manual steps needed. [#5](https://github.com/sefinek/Cloudflare-WAF-Expressions/issues/5)
- Fewer API requests per run: one read and at most one write per zone.


## [v2.3.1] - 2026-06-12

### Added
- Added automatic creation of the `rules/my-lists/ip-blocklist.txt` file if it doesn't exist.

### Fixed
- Fixed known issues in the rules.


## [v2.3.0] - 2026-06-01

### Added
- Blocking for backup and archive extensions: `.bak`, `.old`, `.orig`, `.swp`, `.gz`, `.tgz`, `.tar`, `.bz2`, `.xz`, `.7z`. Archives excluded on `cdn.` hosts.
- One-time post-sync notice to verify the site loads correctly.
- Jest test suite (`test/`). Run with `npm test`.

### Fixed
- Part 2 extension rules were matching `.ext` anywhere in the path, causing false-positive 403s on content-hashed assets (e.g. `/_next/static/chunks/11.shudcv6pi8.css`). Extensions are now anchored to the end of the path.


## [v2.2.0] - 2026-05-26

### Added
- `rules/my-lists/ip-blocklist.txt` - custom IP blocklist, merged automatically with the built-in list and SniffCat on every sync. The folder is excluded from git.
- `EXCLUDED_ZONES` - comma-separated list of domains to skip during WAF rule updates. Excluded zones are shown in the log when retrieving zones.

### Changed
- `CF_IP_LIST_NAME` renamed to `CF_IP_BLOCKLIST_NAME`. The old name still works as a fallback - updating the variable is recommended.


## [v2.1.1] - 2026-05-23

### Fixed
- Zone fetching (`/zones`) did not handle pagination - with more than 20 domains, some zones were skipped and WAF rules were not applied to them.

### Changed
- Zone summary log now includes more details: active zone count, number of accounts, and plans. Warnings for paused, partial, and dev mode zones are shown only when they occur.


## [v2.1.0] - 2026-05-22

### Added
- New `WORDPRESS_SUPPORT` environment variable - when set to `true`, Managed Challenge rules for `/wp-content` and `/wp-includes` paths are removed, allowing WordPress themes, plugins, CSS, images and JS to load correctly. The `/wp-admin` rule remains active.


## [v2.0.2] - 2026-05-14

### Fixed
- Removed redundant `verifyFilterUpdate` call after each filter PUT - the extra GET request was doubling API usage per updated rule and likely contributing to Cloudflare rate limiting (HTTP 429, code 10040).

### Changed
- Default `RULES_UPDATE_CRON` changed from `0 11,14,16,18,20 * * *` to `0 9,15,18,22 * * *` - 4 runs per day with better spacing to reduce API pressure.
- Default `GIT_PULL_CRON` changed from `0 13 * * *` to `30 8 * * *` - runs 30 minutes before the first WAF update, ensuring code is up to date before the 9:00 sync.


## [v2.0.1] - 2026-05-01

### Fixed
- `CF_IP_LIST_NAME` was not applied to WAF expressions - the list name in `expressions.md` was hardcoded and the env variable was ignored. The correct name is now injected automatically at parse time.
- `axios.js`: missing optional chaining on `err.response.data` in the `onRetry` callback, could cause a `TypeError` crash on network errors (`ECONNABORTED`, `ENOTFOUND`).

### Changed
- Renamed default IP list from `sefinek_waf` to `sefinek_cf_waf` for consistency.
- Rewrote `.env.default` - descriptions are now more accurate and detailed.
- `CF_IP_LIST_NAME` now has a default value (`sefinek_cf_waf`) instead of being empty.
- Removed `CF_API_TOKEN` length validation - Cloudflare API tokens do not have a fixed length (e.g. may be 53 characters despite previously being 40).


## [v2.0.0] - 2026-04-26

### Breaking Changes
- Renamed `markdown/` folder to `rules/` - update any scripts or references pointing to the old path.
- `CF_ACCOUNT_ID` is now required in `.env` - without it the IP list will not be created or updated.
- API token permissions changed - `Zone WAF: Edit` is no longer needed. Required permissions are now: `Account / Account Filter Lists: Edit`, `Zone / Zone: Read`, `Zone / Firewall Services: Edit`.

### Added
- **SniffCat IP blocklist integration** - the script now fetches malicious IPs dynamically from the [SniffCat](https://sniffcat.com) database and merges them with the static `rules/ip-blocklist.txt` on every sync. Requires `SNIFFCAT_API_TOKEN`. Configurable via `SNIFFCAT_CONFIDENCE_MIN` (default: `78`) and `SNIFFCAT_LIMIT` (default: `3000`).
- **Cloudflare Lists integration** - IP blocklist (`rules/ip-blocklist.txt`) is now synced automatically to a Cloudflare Custom IP List and referenced in WAF rules as `ip.src in $<list_name>`. Configurable via `CF_IP_LIST_NAME`.
- **Rule ID cache** (`data/rule-ids.json`) - WAF rule and filter IDs are cached locally to avoid fragile name-based matching on every run.
- **Cleanup tool** (`data/scripts/deleteWAFRules.js`) - removes all custom WAF rules, filters, and the managed IP list from Cloudflare, then clears the local cache. Shows a full preview and requires confirmation before proceeding.
- New environment variables `CF_ACCOUNT_ID`, `CF_IP_LIST_NAME`, `SNIFFCAT_API_TOKEN`, `SNIFFCAT_CONFIDENCE_MIN`, `SNIFFCAT_LIMIT` (see `.env.default`).

### Changed
- **WAF rules restructured** - new names, emojis, and order optimized for Cloudflare's 4096-character limit per rule:
  - 🔥 Part 1 - Suspicious paths & headers (Block)
  - 🧨 Part 2 - Malicious extensions & injections (Block)
  - 🤖 Part 3 - Unwanted bots (Block)
  - 🦕 Part 4 - Ancient browsers & IP blocklist (Block)
  - 🗑️ Part 5 - Deprecated browsers & CMS (Managed Challenge)
- IP blocklist moved from inline WAF expression (Part 5) to a dedicated Cloudflare List - removes the per-rule character limit constraint for IPs.
- `verifyAndReorderParts` now reuses already-fetched rules when no new rules were created, reducing redundant API calls.

### Fixed
- `RULES_UPDATE_CRON` and `GIT_PULL_CRON` env variables were swapped - `RULES_UPDATE_CRON` now correctly controls WAF rule updates, `GIT_PULL_CRON` controls git pull + restart.
- Wrong rule priority on creation (was offset by 1).
- Null crash in `verifyAndReorderParts` when a rule had no description.
