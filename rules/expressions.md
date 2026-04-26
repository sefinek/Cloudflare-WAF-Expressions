# ☁️ Firewall Rules for Cloudflare WAF
1. If **you use PHP**: for requests ending with `.php`, the **MANAGED CHALLENGE** event will be triggered.
    - **Using the script:** set `PHP_SUPPORT=true` in the `.env` file
    - **Not using the script:** remove the entire `wildcard "*.php*"` line from Part 5
2. There's no need to manually copy these expressions into Cloudflare or update them. The [script](https://github.com/sefinek/Cloudflare-WAF-Expressions?tab=readme-ov-file#automatic-highly-recommended) automatically and continuously manages these rules.
3. If you encounter any false positives, report them in the [Issues](https://github.com/sefinek/Cloudflare-WAF-Expressions/issues) section or on my [Discord server](https://discord.gg/RVH8UXgmzs).
4. If you host an API, use the `api.` subdomain (e.g., `api.example.com`).
5. If you use a CDN, use the `cdn.` subdomain (e.g., `cdn.example.com`).
6. Got any suggestions or ideas? Feel free to share them. Thanks!


## 🔥 Part 1 - Suspicious paths & headers<div id="part1"></div>
> **Action:** Block
```
(cf.waf.credential_check.password_leaked) or
(http.referer eq "binance.com") or
(http.referer eq "bing.com") or
(http.referer eq "google.com") or
(http.referer eq "http://n666888.com") or
(http.referer eq "https://bing.com") or
(http.referer eq "https://bing.com/") or
(http.referer eq "https://google.com") or
(http.referer eq "https://google.com/") or
(http.request.full_uri eq "https://api.sefinek.net/api/v2/random/animal/cat" and ip.geoip.asnum eq 8075 and http.user_agent eq "python-requests/2.31.0") or
(http.request.uri.path contains "\\") or
(http.request.uri.path eq "/backup") or
(http.request.uri.path eq "/git") or
(http.request.uri.path eq "/old") or
(http.request.uri.path wildcard "*/.*" and not starts_with(http.request.uri.path, "/.well-known/")) or
(http.request.uri.path wildcard "*//*") or
(http.request.uri.path wildcard "*/actuator*") or
(http.request.uri.path wildcard "*/cms*") or
(http.request.uri.path wildcard "*/credentials*") or
(http.request.uri.path wildcard "*/dbadmin*") or
(http.request.uri.path wildcard "*/debug*") or
(http.request.uri.path wildcard "*/env*") or
(http.request.uri.path wildcard "*/etc*") or
(http.request.uri.path wildcard "*/login.action*") or
(http.request.uri.path wildcard "*/phpmyadmin*") or
(http.request.uri.path wildcard "*/readme*") or
(http.request.uri.path wildcard "*/sito*") or
(http.request.uri.path wildcard "*/ssh*") or
(http.request.uri.path wildcard "*/user.action*") or
(http.request.uri.path wildcard "*/webdav*") or
(http.request.uri.path wildcard "*/~adm*") or
(http.request.uri.path wildcard "*/~sysadm*") or
(http.request.uri.path wildcard "*/~webmaster*") or
(http.request.uri.path wildcard "*appsettings*") or
(http.request.uri.path wildcard "*authorized_keys*") or
(http.request.uri.path wildcard "*backup.*") or
(http.request.uri.path wildcard "*config*" and not http.host contains "cdn." and not http.request.uri.path contains "/configuration") or
(http.request.uri.path wildcard "*docker-compose*") or
(http.request.uri.path wildcard "*dockerfile*") or
(http.request.uri.path wildcard "*dump.*") or
(http.request.uri.path wildcard "*file_put_contents*") or
(http.request.uri.path wildcard "*id_rsa*") or
(http.request.uri.path wildcard "*keys.json*") or
(http.request.uri.path wildcard "*pboot:if*") or
(http.request.uri.path wildcard "*server.key*") or
(http.request.uri.path wildcard "*sftp*") or
(http.request.uri.path wildcard "*wlwmanifest*") or
(http.request.uri.path wildcard "*www-sql*") or
(http.request.uri.path wildcard "*_all_dbs*") or
(http.request.uri.path wildcard "*_debugbar*") or
(http.request.uri.path wildcard "*~ftp*") or
(http.request.uri.path wildcard "*~tmp*") or
(http.request.uri.query wildcard "*.env*") or
(http.request.uri.query wildcard "*etc/passwd*") or
(http.user_agent contains "   ") or
(http.user_agent eq "" and not http.host contains "api." and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.user_agent eq "Mozilla/5.0 (Windows NT 10.0; Win64; x64)") or
(http.user_agent eq "Mozilla/5.0") or
(http.user_agent wildcard "*embeddedbrowser*" and not http.host contains "api." and not http.host contains "cdn.") or
(http.user_agent wildcard "*go-http-client*" and not http.host contains "api." and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.user_agent wildcard "*headless*" and not http.host contains "api." and not http.host contains "cdn.") or
(http.user_agent wildcard "*mozilla/4*") or
(http.user_agent wildcard "*private_keys*") or
(http.user_agent wildcard "*windows 11*")
```

## 🧨 Part 2 - Malicious extensions & injections<div id="part2"></div>
> **Action:** Block
```
(
  http.user_agent contains "aiohttp" or
  http.user_agent contains "aioquic" or
  http.user_agent contains "curl" or
  http.user_agent contains "okhttp" or
  http.user_agent contains "python-requests" or
  http.user_agent contains "python-httpx" or
  http.user_agent contains "wget"
) and not (
  starts_with(http.host, "api.") or
  starts_with(http.host, "cdn.") or
  http.host eq "blocklist.sefinek.net"
) or
(http.request.uri.path wildcard "*.env*") or
(http.request.uri.path wildcard "*.log*" and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.request.uri.path wildcard "*.py*") or
(http.request.uri.path wildcard "*.sh*" and http.host ne "cdn.sefinek.net") or
(http.request.uri.path wildcard "*.sql*") or
(http.request.uri.path wildcard "*.yaml*") or
(http.request.uri.path wildcard "*.yml*") or
(http.request.uri.path wildcard "*auth.json*") or
(http.request.uri.path wildcard "*conf.*") or
(http.request.uri.path wildcard "*crlfinjection*") or
(http.request.uri.path wildcard "*curl%20*") or
(http.request.uri.path wildcard "*curl+*") or
(http.request.uri.path wildcard "*fancyupload*") or
(http.request.uri.path wildcard "*php.ini*") or
(http.request.uri.path wildcard "*phpinfo*") or
(http.request.uri.path wildcard "*phpsysinfo*") or
(http.request.uri.path wildcard "*settings.local*") or
(http.request.uri.path wildcard "*settings.prod*") or
(http.request.uri.path wildcard "*wget*") or
(http.request.uri.query contains "%00") or
(http.request.uri.query contains "%0A") or
(http.request.uri.query contains "%0D") or
(http.request.uri.query contains "%2e%2e") or
(http.request.uri.query contains "..%2f") or
(http.request.uri.query contains "..%5c") or
(http.request.uri.query contains "../") or
(http.request.uri.query contains "..\\") or
(http.request.uri.query contains "squelette=../") or
(http.request.uri.query wildcard "*auto_prepend_file*") or
(http.request.uri.query wildcard "*crlfinjection*") or
(http.request.uri.query wildcard "*curl*") or
(http.request.uri.query wildcard "*ed25519*") or
(http.request.uri.query wildcard "*file://*") or
(http.request.uri.query wildcard "*php://*") or
(http.request.uri.query wildcard "*secrets.json*") or
(http.request.uri.query wildcard "*set-cookie:*") or
(http.request.uri.query wildcard "*wget*") or
(http.request.uri.query wildcard "*formfinder*") or
(http.user_agent wildcard "*\"*") or
(http.user_agent wildcard "*alittle client*")
```

## 🤖 Part 3 - Unwanted bots<div id="part3"></div>
> **Action:** Block
```
(cf.verified_bot_category in {"Archiver"}) or
(http.user_agent wildcard "*2ip*") or
(http.user_agent wildcard "*awariobot*") or
(http.user_agent wildcard "*barkrowler*") or
(http.user_agent wildcard "*blexbot*") or
(http.user_agent wildcard "*bomborabot*") or
(http.user_agent wildcard "*brightbot*") or
(http.user_agent wildcard "*buck*") or
(http.user_agent wildcard "*bvbot*") or
(http.user_agent wildcard "*bytespider*") or
(http.user_agent wildcard "*ccbot*") or
(http.user_agent wildcard "*checkhost*") or
(http.user_agent wildcard "*cincraw*") or
(http.user_agent wildcard "*claudebot*") or
(http.user_agent wildcard "*clickagy*") or
(http.user_agent wildcard "*cocolyzebot*") or
(http.user_agent wildcard "*criteobot*") or
(http.user_agent wildcard "*df bot 1.0*") or
(http.user_agent wildcard "*domainstatsbot*") or
(http.user_agent wildcard "*domcopbot*") or
(http.user_agent wildcard "*dotbot*") or
(http.user_agent wildcard "*globalping*") or
(http.user_agent wildcard "*gulperbot*") or
(http.user_agent wildcard "*httrack*") or
(http.user_agent wildcard "*iboubot*") or
(http.user_agent wildcard "*intelx.io*") or
(http.user_agent wildcard "*internet-structure*") or
(http.user_agent wildcard "*internetmeasurement*") or
(http.user_agent wildcard "*ioncrawl*") or
(http.user_agent wildcard "*keys-so-bot*") or
(http.user_agent wildcard "*magpie-crawler*") or
(http.user_agent wildcard "*masscan*") or
(http.user_agent wildcard "*megaindex*") or
(http.user_agent wildcard "*mj12bot*") or
(http.user_agent wildcard "*nimbostratus*") or
(http.user_agent wildcard "*omgili*") or
(http.user_agent wildcard "*onalyticabot*") or
(http.user_agent wildcard "*palo alto networks company*") or
(http.user_agent wildcard "*panscient.com*") or
(http.user_agent wildcard "*peer39_crawler*") or
(http.user_agent wildcard "*proximic*") or
(http.user_agent wildcard "*riddler*") or
(http.user_agent wildcard "*rogerbot*") or
(http.user_agent wildcard "*sbl-bot*") or
(http.user_agent wildcard "*scrapy*") or
(http.user_agent wildcard "*semantic-visions*") or
(http.user_agent wildcard "*semanticbot*") or
(http.user_agent wildcard "*serpstatbot*") or
(http.user_agent wildcard "*sqlmap*") or
(http.user_agent wildcard "*thinkbot*") or
(http.user_agent wildcard "*trendictionbot*") or
(http.user_agent wildcard "*ttd-content*") or
(http.user_agent wildcard "*voluumdsp*") or
(http.user_agent wildcard "*wc-test-dev-bot*") or
(http.user_agent wildcard "*webtechbot*") or
(http.user_agent wildcard "*whatcms*") or
(http.user_agent wildcard "*br-crawler*") or
(http.user_agent wildcard "*zgrab*")
```

## 🦕 Part 4 - Ancient browsers & IP blocklist<div id="part4"></div>
> **Action:** Block
```
(http.user_agent wildcard "*android 8*") or
(http.user_agent wildcard "*chrome/17*") or
(http.user_agent wildcard "*chrome/30*") or
(http.user_agent wildcard "*chrome/31*") or
(http.user_agent wildcard "*chrome/32*") or
(http.user_agent wildcard "*chrome/33*") or
(http.user_agent wildcard "*chrome/34*") or
(http.user_agent wildcard "*chrome/35*") or
(http.user_agent wildcard "*chrome/36*") or
(http.user_agent wildcard "*chrome/37*") or
(http.user_agent wildcard "*chrome/38*") or
(http.user_agent wildcard "*chrome/39*") or
(http.user_agent wildcard "*chrome/41*") or
(http.user_agent wildcard "*chrome/42*") or
(http.user_agent wildcard "*chrome/44*") or
(http.user_agent wildcard "*chrome/48*") or
(http.user_agent wildcard "*chrome/49*") or
(http.user_agent wildcard "*chrome/52*") or
(http.user_agent wildcard "*chrome/53*") or
(http.user_agent wildcard "*chrome/58*") or
(http.user_agent wildcard "*chrome/59*") or
(http.user_agent wildcard "*chrome/60*") or
(http.user_agent wildcard "*chrome/61*") or
(http.user_agent wildcard "*chrome/62*") or
(http.user_agent wildcard "*chrome/64*") or
(http.user_agent wildcard "*chrome/65*") or
(http.user_agent wildcard "*chrome/67*") or
(http.user_agent wildcard "*chrome/68*") or
(http.user_agent wildcard "*chrome/69*") or
(http.user_agent wildcard "*chrome/71*") or
(http.user_agent wildcard "*firefox/10*") or
(http.user_agent wildcard "*firefox/45*") or
(http.user_agent wildcard "*firefox/52*") or
(http.user_agent wildcard "*firefox/57*") or
(http.user_agent wildcard "*html5plus*") or
(http.user_agent wildcard "*msie*") or
(http.user_agent wildcard "*netfront*") or
(http.user_agent wildcard "*symbianos*") or
(http.user_agent wildcard "*trident/") or
(ip.src.continent eq "T1" and http.host ne "blocklist.sefinek.net") or
(ip.geoip.asnum in {10630}) or
(ip.src in $sefinek_waf)
```

## 🗑️ Part 5 - Deprecated browsers & CMS<div id="part5"></div>
> **Action:** Managed Challenge
```
(http.referer contains "http://" and not http.referer contains "localhost" and not http.referer contains "127.0.0.1") or
(http.request.uri.path wildcard "*.php*") or
(http.request.uri.path wildcard "*/wp-admin*") or
(http.request.uri.path wildcard "*/wp-content*") or
(http.request.uri.path wildcard "*/wp-includes*") or
(http.user_agent contains "Windows NT 5" and not http.user_agent contains "(via ggpht.com GoogleImageProxy)") or
(http.user_agent wildcard "*chrome/101*") or
(http.user_agent wildcard "*chrome/103*") or
(http.user_agent wildcard "*chrome/104*") or
(http.user_agent wildcard "*chrome/112*") or
(http.user_agent wildcard "*chrome/113*") or
(http.user_agent wildcard "*chrome/114*") or
(http.user_agent wildcard "*chrome/118*") or
(http.user_agent wildcard "*chrome/119*" and not ip.geoip.asnum eq 14618) or
(http.user_agent wildcard "*chrome/120*") or
(http.user_agent wildcard "*chrome/122*") or
(http.user_agent wildcard "*chrome/73*") or
(http.user_agent wildcard "*chrome/74*" and not http.user_agent contains "Better Uptime Bot") or
(http.user_agent wildcard "*chrome/77*") or
(http.user_agent wildcard "*chrome/78*") or
(http.user_agent wildcard "*chrome/79*") or
(http.user_agent wildcard "*chrome/80*") or
(http.user_agent wildcard "*chrome/81*") or
(http.user_agent wildcard "*chrome/83*") or
(http.user_agent wildcard "*chrome/84*") or
(http.user_agent wildcard "*chrome/85*") or
(http.user_agent wildcard "*chrome/86*") or
(http.user_agent wildcard "*chrome/87*") or
(http.user_agent wildcard "*chrome/88*") or
(http.user_agent wildcard "*chrome/89*") or
(http.user_agent wildcard "*chrome/91*") or
(http.user_agent wildcard "*chrome/92*") or
(http.user_agent wildcard "*chrome/93*") or
(http.user_agent wildcard "*chrome/94*") or
(http.user_agent wildcard "*chrome/95*") or
(http.user_agent wildcard "*chrome/96*") or
(http.user_agent wildcard "*chrome/97*") or
(http.user_agent wildcard "*crios/121*") or
(http.user_agent wildcard "*firefox/114*") or
(http.user_agent wildcard "*firefox/118*") or
(http.user_agent wildcard "*firefox/62*") or
(http.user_agent wildcard "*firefox/76*") or
(http.user_agent wildcard "*firefox/77*") or
(http.user_agent wildcard "*firefox/79*") or
(http.user_agent wildcard "*firefox/83*") or
(http.user_agent wildcard "*firefox/84*")
```

<div align="right">
    <h4>📥 » Last update: 26.04.2026 [DD.MM.YYYY]</h4>
</div>