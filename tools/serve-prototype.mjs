/* เสิร์ฟ prototype แบบ static สำหรับดูในเบราว์เซอร์
   ใช้:  node tools/serve-prototype.mjs [port]     ค่าเริ่มต้น 8788
   ไม่มี dependency · ใช้เฉพาะตอนพัฒนา ไม่ใช่เซิร์ฟเวอร์สำหรับใช้งานจริง */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../prototype");
const PORT = Number(process.argv[2] || process.env.PORT || 8788);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p === "/") p = "/index.html";
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(ROOT)) throw new Error("นอกโฟลเดอร์ prototype");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("ไม่พบไฟล์: " + e.message);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`prototype: http://127.0.0.1:${PORT}`));
