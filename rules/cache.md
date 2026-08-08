# Cache rules
`https://dash.cloudflare.com/<ACCOUNT>/<DOMAIN>/caching/rules`  
Last updated: 02.08.2026 (DD.MM.YYYY)

## For CDN subdomains and the most popular file extensions
```
(
  http.request.method in {"GET" "HEAD"}
  and
  (
    starts_with(http.host, "cdn.")
    or http.request.uri.path.extension in {
      "css" "js"
      "jpg" "jpeg" "png" "webp" "avif" "gif" "svg" "svgz" "ico" "bmp"
      "woff2" "woff" "ttf" "otf"
      "pdf"
      "mp4" "webm" "mkv" "avi"
      "mp3" "m4a" "ogg" "wav"
      "zip" "7z" "rar" "tar" "gz"
    }
  )
)
```

## For a broad range of file extensions
```
(
  http.request.method in {"GET" "HEAD"}
  and http.request.uri.path.extension in {
    "css" "js"
    "jpg" "jpeg" "png" "webp" "avif" "gif" "svg" "svgz" "ico" "bmp"
    "tif" "tiff" "pict" "eps"
    "woff2" "woff" "eot" "ttf" "otf"
    "pdf" "csv" "doc" "docx" "xls" "xlsx" "ppt" "pptx" "ps"
    "mp4" "webm" "mkv" "avi" "swf"
    "mp3" "m4a" "ogg" "wav" "flac" "mid" "midi" "pls"
    "zip" "7z" "rar" "tar" "gz" "bz2" "zst"
    "apk" "exe" "dmg" "iso" "bin" "jar" "class" "ejs"
  }
)
```
