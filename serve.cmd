@echo off
rem Serves this folder over http://localhost:8080 so the game can be opened in a
rem browser without any file:// restrictions, and so an Android phone on the same
rem Wi-Fi can download dist\The Wild West.apk directly. Close the window to stop it.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  echo Serving http://localhost:8080/  ^(Ctrl+C to stop^)
  echo Phone on the same Wi-Fi:  http://YOUR-PC-IP:8080/dist/The%%20Wild%%20West.apk
  rem .apk is mapped so Android treats the download as an installable package
  rem instead of an opaque blob, and range requests are honoured so a big file
  rem could be resumed; harmless for the small ones.
  node -e "const h=require('http'),f=require('fs'),p=require('path');const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.apk':'application/vnd.android.package-archive','.json':'application/json'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';const fp=p.join(process.cwd(),u);f.stat(fp,(e,st)=>{if(e||!st.isFile()){s.writeHead(404);s.end('not found');return}const type=t[p.extname(fp).toLowerCase()]||'application/octet-stream';const r=q.headers.range;if(r){const m=/bytes=(\d+)-/.exec(r);const start=m?parseInt(m[1],10):0;s.writeHead(206,{'Content-Type':type,'Content-Length':st.size-start,'Content-Range':'bytes '+start+'-'+(st.size-1)+'/'+st.size,'Accept-Ranges':'bytes'});f.createReadStream(fp,{start}).pipe(s);return}s.writeHead(200,{'Content-Type':type,'Content-Length':st.size,'Accept-Ranges':'bytes'});f.createReadStream(fp).pipe(s)})}).listen(8080);setInterval(()=>{},1<<30)"
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Serving http://localhost:8080/  ^(Ctrl+C to stop^)
  echo Phone on the same Wi-Fi:  http://YOUR-PC-IP:8080/dist/The%%20Wild%%20West.apk
  python -m http.server 8080
  goto :eof
)

echo Node or Python is required to serve the folder.
echo You can also just double-click index.html - the game runs from file:// too.
pause
