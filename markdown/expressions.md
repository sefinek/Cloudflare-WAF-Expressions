<div align="right">
    <h4>📥 » Last update: 29.04.2025 [DD.MM.YYYY]</h4>
</div>

## 🔥 Part 1 - Main firewall<div id="part1"></div>
> **Action:** Block
```
(cf.waf.credential_check.password_leaked) or
(http.referer eq "binance.com") or
(http.referer eq "google.com") or
(http.referer eq "http://n666888.com") or
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
(http.request.uri.path wildcard "*config*" and not http.host contains "cdn.") or
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
(http.request.uri.query wildcard "*etc/passwd*") or
(http.user_agent contains "   ") or
(http.user_agent eq "" and not http.host contains "api." and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.user_agent wildcard "*embeddedbrowser*" and not http.host contains "api." and not http.host contains "cdn.") or
(http.user_agent wildcard "*go-http-client*" and not http.host contains "api." and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.user_agent wildcard "*headless*" and not http.host contains "api." and not http.host contains "cdn.") or
(http.user_agent wildcard "*private_keys*") or
(http.user_agent wildcard "*windows 11*")
```

## 🔥 Part 2 - Main firewall<div id="part2"></div>
> **Action:** Block
```
(http.request.uri.path eq "/" and 
  (http.user_agent contains "aiohttp" or
   http.user_agent contains "curl" or
   http.user_agent contains "okhttp" or
   http.user_agent contains "python-requests" or
   http.user_agent contains "wget")) or
(http.request.uri.path wildcard "*.js*" and starts_with(http.host, "screenshots.")) or
(http.request.uri.path wildcard "*.log*" and not http.request.uri.path contains "ReShade.log" and not http.host contains "cdn." and http.host ne "blocklist.sefinek.net") or
(http.request.uri.path wildcard "*.py*") or
(http.request.uri.path wildcard "*.sh*" and http.host ne "cdn.sefinek.net") or
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
(http.request.uri.path wildcard "*wget%20*") or
(http.request.uri.path wildcard "*wget+*") or
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
(http.request.uri.query wildcard "*curl%20*") or
(http.request.uri.query wildcard "*curl+*") or
(http.request.uri.query wildcard "*ed25519*") or
(http.request.uri.query wildcard "*file://*") or
(http.request.uri.query wildcard "*php://*") or
(http.request.uri.query wildcard "*secrets.json*") or
(http.request.uri.query wildcard "*set-cookie:*") or
(http.request.uri.query wildcard "*wget%20*") or
(http.request.uri.query wildcard "*wget+*") or
(http.user_agent wildcard "*alittle client*") or
(http.user_agent wildcard "*php7.4-global*")
```

## 🗑️ Part 3 - Deprecated browsers, etc.<div id="part3"></div>
> **Action:** Managed Challenge
```
(http.request.uri eq "https://sefinek.net/milosna-grota/verification/upload") or
(http.request.uri.path wildcard "*.php*" and not http.request.uri.path contains "/clientarea.php") or
(http.request.uri.path wildcard "*/wp-admin*") or
(http.request.uri.path wildcard "*/wp-includes*") or
(http.user_agent contains "/112.0") or
(http.user_agent contains "/113.0") or
(http.user_agent contains "/114.0" and not http.user_agent contains "OPR/114.0") or
(http.user_agent contains "/118.0") or
(http.user_agent contains "Chrome/101.") or
(http.user_agent contains "Chrome/104.") or
(http.user_agent contains "Chrome/74" and not http.user_agent contains "Better Uptime Bot" and not http.host contains "api.") or
(http.user_agent contains "Windows NT 5" and not http.user_agent contains "(via ggpht.com GoogleImageProxy)" and not http.host contains "api.") or
(http.user_agent wildcard "*android 8*" and not http.host contains "api.") or
(http.user_agent wildcard "*chrome/100*") or
(http.user_agent wildcard "*chrome/103*") or
(http.user_agent wildcard "*chrome/117*") or
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
(http.user_agent wildcard "*chrome/60*") or
(http.user_agent wildcard "*chrome/61*") or
(http.user_agent wildcard "*chrome/62*") or
(http.user_agent wildcard "*chrome/64*") or
(http.user_agent wildcard "*chrome/65*") or
(http.user_agent wildcard "*chrome/67*") or
(http.user_agent wildcard "*chrome/68*") or
(http.user_agent wildcard "*chrome/69*") or
(http.user_agent wildcard "*chrome/71*") or
(http.user_agent wildcard "*chrome/73*") or
(http.user_agent wildcard "*chrome/77*") or
(http.user_agent wildcard "*chrome/78*") or
(http.user_agent wildcard "*chrome/79*") or
(http.user_agent wildcard "*chrome/80*") or
(http.user_agent wildcard "*chrome/81*") or
(http.user_agent wildcard "*chrome/83*") or
(http.user_agent wildcard "*chrome/84*") or
(http.user_agent wildcard "*chrome/85*") or
(http.user_agent wildcard "*chrome/87*") or
(http.user_agent wildcard "*chrome/88*") or
(http.user_agent wildcard "*chrome/89*") or
(http.user_agent wildcard "*chrome/91*") or
(http.user_agent wildcard "*chrome/92*") or
(http.user_agent wildcard "*chrome/93*") or
(http.user_agent wildcard "*chrome/94*") or
(http.user_agent wildcard "*chrome/95*") or
(http.user_agent wildcard "*chrome/96*") or
(http.user_agent wildcard "*chrome/98*") or
(http.user_agent wildcard "*crios/121*") or
(http.user_agent wildcard "*firefox/3.5*") or
(http.user_agent wildcard "*firefox/45*") or
(http.user_agent wildcard "*firefox/52*") or
(http.user_agent wildcard "*firefox/57*") or
(http.user_agent wildcard "*firefox/62*") or
(http.user_agent wildcard "*firefox/76*") or
(http.user_agent wildcard "*firefox/77*") or
(http.user_agent wildcard "*firefox/79*") or
(http.user_agent wildcard "*firefox/83*") or
(http.user_agent wildcard "*firefox/84*") or
(http.user_agent wildcard "*html5plus*") or
(http.user_agent wildcard "*intel mac os x 12_5*") or
(http.user_agent wildcard "*mac os x 10_15*") or
(http.user_agent wildcard "*mac os x 10_9*") or
(http.user_agent wildcard "*msie 9.0*") or
(http.user_agent wildcard "*netfront*") or
(http.user_agent wildcard "*symbianos*") or
(http.user_agent wildcard "*trident/")
```

## 🤖 Part 4 - Block unnecessary bots<div id="part4"></div>
> **Action:** Block
```
(http.user_agent wildcard "*2ip*") or
(http.user_agent wildcard "*archive.org_bot*") or
(http.user_agent wildcard "*awariobot*") or
(http.user_agent wildcard "*barkrowler*") or
(http.user_agent wildcard "*blexbot*") or
(http.user_agent wildcard "*bomborabot*") or
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
(http.user_agent wildcard "*semantic-visions*") or
(http.user_agent wildcard "*semanticbot*") or
(http.user_agent wildcard "*serpstatbot*") or
(http.user_agent wildcard "*sqlmap*") or
(http.user_agent wildcard "*trendictionbot*") or
(http.user_agent wildcard "*ttd-content*") or
(http.user_agent wildcard "*voluumdsp*") or
(http.user_agent wildcard "*wc-test-dev-bot*") or
(http.user_agent wildcard "*webtechbot*") or
(http.user_agent wildcard "*whatcms*") or
(http.user_agent wildcard "*zgrab*")
```

## 🌍 Part 5 - Block bots, ASNs and IPs<div id="part5"></div>
> **Action:** Block
```
(ip.geoip.country eq "T1" and http.host ne "blocklist.sefinek.net") or
(ip.geoip.asnum in {10630}) or
(ip.src in {
    102.22.20.58          102.68.128.195        103.106.114.106
    103.151.30.155        103.153.134.22        103.156.70.38
    103.165.155.254       103.169.129.4         103.169.254.9
    103.171.156.218       103.177.9.104         103.188.252.66
    103.208.27.214        103.24.213.118        103.242.104.182
    103.250.130.104       103.46.4.7            103.6.177.174
    103.68.214.97         109.202.99.46         113.164.94.137
    114.129.2.82          114.132.202.246       114.132.202.78
    115.127.116.242       118.101.56.156        12.127.44.138
    120.28.217.209        122.155.165.191       122.185.198.242
    124.158.182.34        125.25.56.164         132.147.137.52
    134.122.135.138       138.121.161.84        138.68.86.32
    139.99.8.91           143.255.80.134        148.230.206.229
    152.32.213.18         156.146.33.76         161.49.215.28
    164.92.244.132        165.16.88.161         167.99.55.197
    168.232.174.43        172.183.241.1         175.100.91.212
    175.22.148.13         177.130.104.106       177.234.240.123
    177.54.226.50         177.70.72.103         177.87.144.122
    179.1.192.5           179.43.188.122        179.49.162.133
    180.211.183.2         180.31.234.71         184.72.145.180
    184.82.244.173        185.130.44.86         185.220.101.37
    185.255.45.241        187.188.101.205       187.204.18.213
    188.134.80.97         188.136.154.43        189.35.11.247
    189.48.88.204         190.102.139.146       190.83.12.220
    190.94.212.198        190.94.212.240        191.179.216.84
    191.240.153.144       191.37.1.155          193.176.211.244
    194.126.177.84        194.163.149.123       199.167.236.12
    20.191.210.159        200.174.198.136       200.174.198.144
    200.174.198.222       200.174.198.224       200.174.198.92
    2001:bc8:182c:1005::1 201.131.239.233       201.77.128.158
    201.77.96.149         202.47.181.150        202.47.88.2
    202.62.84.210         205.185.125.235       209.209.28.22
    212.174.79.169        213.232.87.230        213.232.87.232
    213.232.87.234        216.87.69.230         216.9.224.141
    217.182.194.108       24.172.34.114         2400:e920:0:8:250:56ff:fe94:474e
    2a01:239:2d0:bc00::1  36.182.49.26          36.255.84.69
    36.91.135.141         36.95.142.35          37.120.192.154
    4.227.97.45           43.134.1.40           43.134.121.40
    43.153.207.93         45.164.174.27         45.227.195.121
    45.231.223.252        45.236.170.234        45.66.35.22
    45.70.236.150         46.161.196.222        46.2.5.84
    47.106.193.183        47.51.30.226          5.75.225.67
    51.145.176.250        52.169.23.0           52.178.159.39
    77.238.225.41         82.80.249.249         91.215.85.29
    93.91.196.190         94.179.141.78         176.102.144.126
    103.28.253.19         89.228.193.116        88.218.62.29
    119.45.233.65         162.240.107.211       143.110.208.18
    122.10.112.77         80.85.245.5           179.43.191.19
    92.63.25.37           89.110.84.123         193.41.206.72
    13.95.133.245         146.190.174.167       182.44.2.148
    175.27.157.221        37.187.181.109        196.251.72.191
    156.228.179.28        104.207.39.26         156.228.100.3
    196.251.113.74        77.111.245.13         162.240.96.88
    35.222.91.153         196.251.72.64         173.199.122.130
    136.227.162.124       152.39.163.95         185.247.229.182
    92.118.69.175         119.13.224.52         222.252.17.222
    124.243.183.136       111.119.201.71        111.119.217.95
    146.70.187.159        5.62.47.232           162.240.151.98
    203.33.203.148        172.190.180.150       212.54.224.108
})
```