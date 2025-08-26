## Cache for CDN and some extensions
```
(starts_with(http.host, "cdn.")) or
(starts_with(http.host, "screenshots.")) or
(http.request.uri.path.extension in {"avi" "avif" "mp3" "mp4" "wav" "jpg" "jpeg" "png" "gif" "ico" "bmp" "webm" "webp" "woff" "woff2"})
```

- Eligible for cache
- Edge TTL
    - Ignore cache-control header and use this TTL
- Browser TTL
    - Respect origin TTL


## Cache default file extensions
```
(http.request.uri.path.extension in {"7z" "avi" "avif" "apk" "bin" "bmp" "bz2" "class" "css" "csv" "doc" "docx" "dmg" "ejs" "eot" "eps" "exe" "flac" "gif" "gz" "ico" "iso" "jar" "jpg" "jpeg" "js" "mid" "midi" "mkv" "mp3" "mp4" "ogg" "otf" "pdf" "pict" "pls" "png" "ppt" "pptx" "ps" "rar" "svg" "svgz" "swf" "tar" "tif" "tiff" "ttf" "webm" "webp" "woff" "woff2" "xls" "xlsx" "zip" "zst"})
```

- Eligible for cache


[//]: # (## Bypass cache for blocklist.sefinek.net)
[//]: # (```js)
[//]: # (&#40;http.host eq "blocklist.sefinek.net" and http.request.uri.path.extension in {"txt" "conf"}&#41;)
[//]: # (```)
[//]: # ()
[//]: # (- Bypass cache)