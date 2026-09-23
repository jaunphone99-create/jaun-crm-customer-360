#!/usr/bin/env node
/* ตรวจว่าไม่มีความลับหลุดเข้า git (Direction 23 ก.ย. 2569 · CANONICAL ข้อ 20.20)
   "Secret/Token ทุกชนิดห้าม Commit ลง Repo ให้ใช้ Environment/Secret Store เท่านั้น"

   .gitignore เป็นแค่ข้อตกลง — ไฟล์ที่ถูก `git add -f` หรือที่เพิ่มเข้ามาก่อนจะมีกฎ ignore
   จะอยู่ใน repo ต่อไปโดยไม่มีอะไรเตือน · ไฟล์นี้จึงตรวจ "ไฟล์ที่ git ติดตามอยู่จริง"
   ไม่ใช่ตรวจว่ากฎ ignore เขียนครบหรือยัง

   ความลับที่หลุดเข้า git แล้ว **ลบออกด้วย commit ใหม่ไม่พอ** ต้องถือว่ารั่วและหมุนค่าใหม่ทั้งชุด
   ด่านนี้จึงคุ้มกว่ามากถ้าจับได้ก่อน push */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* ต้องใช้ fileURLToPath ไม่ใช่ .pathname — เส้นทางของโครงการนี้มีอักษรไทย
   ซึ่ง .pathname คืนมาแบบ percent-encoded แล้ว fs/spawn หาไฟล์ไม่เจอ */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/* รูปแบบที่ถือว่าเป็นความลับจริง — ตั้งใจให้แคบ เพื่อไม่ให้คนเริ่มเมินคำเตือน
   (ด่านที่เตือนผิดบ่อย ๆ จะถูกปิดทิ้งภายในสัปดาห์เดียว แล้วกลายเป็นไม่มีด่านเลย) */
const PATTERNS = [
  { name: "JWT (อาจเป็น access token หรือ service_role key)", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase publishable key ที่ฝังในโค้ด", re: /\bsb_publishable_[A-Za-z0-9_-]{20,}/ },
  { name: "คีย์ส่วนตัว (PEM)", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Supabase access token ของ CLI", re: /\bsbp_[a-f0-9]{40,}/ },
  { name: "รหัสผ่านฐานข้อมูลใน connection string", re: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]{8,}@/ },
];

/* ไฟล์ที่ "ไม่ควรถูกติดตาม" ไม่ว่าเนื้อหาจะเป็นอะไร */
const FORBIDDEN_PATHS = [
  /(^|\/)pilot\.json$/, /(^|\/)staging\.json$/, /(^|\/)prod\.json$/,
  /\.smoke\.json$/, /(^|\/)supabase\/\.temp\//,
  /\.(pem|key|p12|pfx)$/, /(^|\/)service-account[^/]*\.json$/,
  /(^|\/)\.env$/, /(^|\/)\.env\.(?!example)[^/]+$/,
];

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean);

const problems = [];

for (const rel of tracked) {
  if (FORBIDDEN_PATHS.some((re) => re.test(rel))) {
    problems.push(`${rel} — ไฟล์ชนิดนี้ห้ามอยู่ใน repo`);
    continue;
  }
  let size;
  try { size = statSync(ROOT + rel).size; } catch { continue; }
  if (size > 2_000_000) continue;                     // ข้ามไฟล์ใหญ่ (seed ฯลฯ)
  let text;
  try { text = readFileSync(ROOT + rel, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue;                  // ไฟล์ไบนารี
  for (const { name, re } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const line = text.slice(0, m.index).split("\n").length;
    problems.push(`${rel}:${line} — ${name}`);
  }
}

if (problems.length) {
  console.error("ไม่ผ่าน · พบความลับในไฟล์ที่ git ติดตามอยู่:\n");
  for (const p of problems) console.error("  " + p);
  console.error("\nถ้าค่านี้เคยถูก push แล้ว ให้ถือว่ารั่ว — หมุนค่าใหม่ทั้งชุด อย่าแค่ลบไฟล์");
  process.exit(1);
}

console.log(`ผ่าน · ตรวจไฟล์ที่ git ติดตาม ${tracked.length} ไฟล์ ไม่พบความลับ`);
