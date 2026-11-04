// ゲームに要るものだけを返す配信サーバー。ngrok の内側で 127.0.0.1 にだけ開く
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2]);
const PORT = Number(process.argv[3]);
const DIRS = ['dist', 'previews', 'sfx'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const fail = (code) => { res.writeHead(code); res.end(); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405);
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return fail(400); }
  if (path === '/') path = '/index.html';
  const parts = path.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.'))) return fail(404);
  if (path !== '/index.html' && !DIRS.includes(parts[0])) return fail(404);
  const file = join(ROOT, ...parts);
  if (!file.startsWith(ROOT + sep)) return fail(404);
  let st;
  try { st = statSync(file); } catch { return fail(404); }
  if (!st.isFile()) return fail(404);
  const headers = { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  // 動画のシークのために Range に応える
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on 127.0.0.1:${PORT}`));
