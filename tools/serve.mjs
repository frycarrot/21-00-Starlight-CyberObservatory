// 局域网预览服务器（不需要装任何东西）：node tools/serve.mjs [端口]
// 手机和电脑连同一个 Wi-Fi，用手机浏览器打开打印出来的地址即可。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.argv[2]) || 8848;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('没有这个文件');
  }
}).listen(port, '0.0.0.0', () => {
  console.log('\n赛博天文台预览已启动（关掉这个窗口就停止）\n');
  console.log(`  电脑：http://localhost:${port}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  手机：http://${a.address}:${port}/        试验台：http://${a.address}:${port}/?lab`);
      }
    }
  }
  console.log('\n第一次运行时 Windows 可能弹防火墙提示，勾选「专用网络」并允许。\n');
});
