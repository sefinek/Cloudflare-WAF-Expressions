# Changelog

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
