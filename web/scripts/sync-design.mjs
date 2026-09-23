/* คัดลอก CSS ของ prototype เข้ามาในแอป

   prototype คือหน้าตาที่เจ้าของโครงการอนุมัติแล้ว และมี tools/check-prototype.mjs
   คอยตรวจว่ายังตรงกับ CANONICAL อยู่ ถ้าแอปเขียน CSS ของตัวเองแยกอีกชุด
   สองชุดจะค่อย ๆ เพี้ยนจากกันโดยไม่มีใครรู้ จึงใช้วิธีคัดลอกตอน build แทน
   แก้ที่ prototype/assets/ ที่เดียวเสมอ · ไฟล์ปลายทางอยู่ใน .gitignore

   รันอัตโนมัติจาก predev และ prebuild — หรือสั่งเอง: node scripts/sync-design.mjs */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(WEB, "..");
const SRC = join(REPO, "prototype/assets");
const OUT = join(WEB, "src/app/generated");

const FILES = ["app.css", "premium.css"];

/* หน้าที่แอปสร้างแล้ว — ดึง <style> เฉพาะหน้าออกจากไฟล์ prototype มาใช้ซ้ำ
   จะได้ไม่ต้องลอก CSS ด้วยมือแล้วเพี้ยนกันทีหลัง */
const PAGES = [
  { html: "01-login.html", out: "page-login.css" },
  { html: "07-reception.html", out: "page-reception.css" },
  { html: "04-quick-capture.html", out: "page-quick-capture.css" },
  { html: "03-customers.html", out: "page-customers.css" },
  { html: "05-customer-360.html", out: "page-customer-360.css" },
];

mkdirSync(OUT, { recursive: true });

const banner = (from) =>
  `/* ไฟล์นี้สร้างจาก ${from} โดย web/scripts/sync-design.mjs\n` +
  `   ห้ามแก้ไฟล์นี้ — แก้ที่ต้นทางแล้วรัน npm run dev หรือ npm run build ใหม่ */\n\n`;

let changed = 0;
const write = (dest, body) => {
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (current !== body) {
    writeFileSync(dest, body);
    changed++;
  }
};

/* @charset ต้องเป็นสิ่งแรกสุดของไฟล์ พอเติมคำอธิบายข้างบนแล้วมันก็ไม่มีผล — ตัดทิ้ง
   (ไฟล์ทั้งหมดเป็น UTF-8 อยู่แล้ว และ bundler อ่านเป็น UTF-8 เสมอ) */
const clean = (css) => css.replace(/^@charset\s+"[^"]*";\s*/i, "");

for (const name of FILES) {
  const src = join(SRC, name);
  if (!existsSync(src)) {
    console.error(`sync-design: ไม่พบ ${src.replace(REPO + "/", "")}`);
    process.exit(1);
  }
  write(join(OUT, name), banner(`prototype/assets/${name}`) + clean(readFileSync(src, "utf8")));
}

/* ฟอนต์ Kanit ที่ prototype เก็บไว้ในเครื่อง (CANONICAL ข้อ 15 · ใช้งานในวง LAN ได้โดยไม่ต้องต่อเน็ต)
   ย้ายไฟล์ .woff2 ไป public/fonts/ แล้วแก้ url() ในไฟล์ face ให้ชี้ไปที่นั่น */
{
  const facesSrc = join(SRC, "kanit-faces.css");
  const fontsSrc = join(SRC, "fonts");
  if (!existsSync(facesSrc) || !existsSync(fontsSrc)) {
    console.error("sync-design: ไม่พบ prototype/assets/kanit-faces.css หรือโฟลเดอร์ fonts");
    process.exit(1);
  }
  const faces = clean(readFileSync(facesSrc, "utf8")).replace(/url\((['"]?)fonts\//g, "url($1/fonts/");
  write(join(OUT, "kanit-faces.css"), banner("prototype/assets/kanit-faces.css") + faces);

  const fontsOut = join(WEB, "public/fonts");
  mkdirSync(fontsOut, { recursive: true });
  for (const f of readdirSync(fontsSrc).filter((f) => f.endsWith(".woff2"))) {
    const from = join(fontsSrc, f);
    const to = join(fontsOut, f);
    if (!existsSync(to) || statSync(from).size !== statSync(to).size) {
      copyFileSync(from, to);
      changed++;
    }
  }
}

for (const page of PAGES) {
  const src = join(REPO, "prototype", page.html);
  if (!existsSync(src)) {
    console.error(`sync-design: ไม่พบ prototype/${page.html}`);
    process.exit(1);
  }
  const html = readFileSync(src, "utf8");
  const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1].trim());
  if (blocks.length === 0) {
    console.error(`sync-design: prototype/${page.html} ไม่มีบล็อก <style>`);
    process.exit(1);
  }
  write(join(OUT, page.out), banner(`บล็อก <style> ของ prototype/${page.html}`) + blocks.join("\n\n") + "\n");
}

console.log(
  `sync-design: ${changed ? `อัปเดต ${changed} ไฟล์` : "ตรงกันอยู่แล้ว"} ` +
    `(${FILES.length} ไฟล์ร่วม + ${PAGES.length} หน้า)`
);
