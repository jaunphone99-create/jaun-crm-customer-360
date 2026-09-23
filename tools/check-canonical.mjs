/* =====================================================================================
   tools/check-canonical.mjs — ตรวจความสอดคล้องภายในของ docs/00-brief/CANONICAL.md

   CANONICAL คือแหล่งจริงของทุกตัวเลขและทุกรหัสในโครงการ ถ้าไฟล์นี้ขัดกันเอง
   เอกสาร ฐานข้อมูล และ prototype ที่อ้างมันจะพากันผิดตามโดยไม่มีใครรู้
   สคริปต์นี้จึงตรวจสิ่งที่พิสูจน์ได้จากตัวไฟล์เอง + ไฟล์จริงในโครงการ

   ใช้:  node tools/check-canonical.mjs          พิมพ์ผลทุกข้อ
         node tools/check-canonical.mjs --quiet  พิมพ์เฉพาะข้อที่ไม่ผ่าน
   ออกด้วย exit code 1 เมื่อมีข้อใดไม่ผ่าน
   ================================================================================== */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUIET = process.argv.includes("--quiet");
const SRC = readFileSync(join(ROOT, "docs/00-brief/CANONICAL.md"), "utf8");

let failed = 0;
const ok = (name) => { if (!QUIET) console.log(`  ผ่าน    ${name}`); };
const bad = (name, detail) => { failed++; console.log(`  ไม่ผ่าน ${name}\n          ${detail}`); };
const check = (name, fn) => {
  try { const r = fn(); r === true ? ok(name) : bad(name, r); }
  catch (e) { bad(name, e.message); }
};

/* ---- ตัวช่วยอ่านไฟล์ markdown ------------------------------------------------- */

/** เนื้อหาตั้งแต่หัวข้อที่ขึ้นต้นด้วย `prefix` จนถึงหัวข้อระดับเดียวกันหรือสูงกว่าถัดไป */
function section(prefix) {
  const lines = SRC.split("\n");
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start < 0) throw new Error(`ไม่พบหัวข้อ "${prefix}"`);
  const level = prefix.match(/^#+/)[0].length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+) /);
    if (m && m[1].length <= level) return lines.slice(start, i).join("\n");
  }
  return lines.slice(start).join("\n");
}

/** ตารางแรกในข้อความ → { head: string[], rows: string[][] } (ไม่รวมแถวเส้นคั่น) */
function table(text, which = 0) {
  const blocks = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("|")) { (cur ??= []).push(line.trim()); }
    else if (cur) { blocks.push(cur); cur = null; }
  }
  if (cur) blocks.push(cur);
  if (!blocks[which]) throw new Error(`ไม่พบตารางลำดับที่ ${which}`);
  const cells = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const rows = blocks[which].filter((l) => !/^\|[\s:|-]+\|$/.test(l)).map(cells);
  return { head: rows[0], rows: rows.slice(1) };
}

/** "**1,008**" · "฿3,332,700" · "215" → 1008 / 3332700 / 215 · ที่เหลือ → null */
function num(cell) {
  const m = String(cell).replace(/\*\*/g, "").trim().match(/^฿?(-?[\d,]+)/);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

/* ---- 1. รายการหน้าจอ (ข้อ 14.1) ↔ ไฟล์ prototype จริง ------------------------- */

const screens = table(section("### 14.1 ")).rows
  .filter((r) => /^\d{2}$/.test(r[0]))
  .map((r) => ({ no: r[0], id: r[1].replace(/`/g, ""), name: r[2], phase: r[6] }));

check("14.1 · มี 19 หน้า รหัส 01–19 ต่อเนื่อง ไม่ซ้ำ", () => {
  if (screens.length !== 19) return `นับได้ ${screens.length} หน้า`;
  const want = Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, "0"));
  const got = screens.map((s) => s.no);
  return got.join(",") === want.join(",") ? true : `รหัสไม่ตรง: ${got.join(" ")}`;
});

check("14.1 · ไฟล์ prototype/NN-id.html มีครบและ data-page ตรงกับ id", () => {
  const problems = [];
  for (const s of screens) {
    const f = join(ROOT, `prototype/${s.no}-${s.id}.html`);
    if (!existsSync(f)) { problems.push(`ไม่มีไฟล์ ${s.no}-${s.id}.html`); continue; }
    const html = readFileSync(f, "utf8");
    if (!html.includes(`data-page="${s.id}"`)) problems.push(`${s.no}-${s.id}.html ไม่มี data-page="${s.id}"`);
  }
  return problems.length ? problems.join(" · ") : true;
});

/* ---- 2. ตัวเลขรายสาขา (13.2) บวกกันได้ยอดรวม -------------------------------- */

const t132 = table(section("### 13.2 "));
const branchRows = t132.rows.filter((r) => /^JAUNPHONE/.test(r[0]));
const totalRow = t132.rows.find((r) => /รวม/.test(r[0]));

check("13.2 · ทุกคอลัมน์ตัวเลขของ 4 สาขาบวกกันได้แถว รวม", () => {
  if (branchRows.length !== 4) return `พบสาขา ${branchRows.length} แถว (ควรเป็น 4)`;
  if (!totalRow) return "ไม่พบแถว รวม";
  const problems = [];
  for (let c = 1; c < t132.head.length; c++) {
    const want = num(totalRow[c]);
    if (want === null) continue;                       // คอลัมน์ "เปลี่ยน" เป็นเปอร์เซ็นต์
    const parts = branchRows.map((r) => num(r[c]));
    if (parts.some((p) => p === null)) continue;
    const got = parts.reduce((a, b) => a + b, 0);
    if (got !== want) problems.push(`${t132.head[c]}: บวกได้ ${got} แต่แถวรวมเขียน ${want}`);
  }
  return problems.length ? problems.join(" · ") : true;
});

/* ---- 3. ยอดรวมรายสาขา (13.2) ตรงกับ KPI องค์กร (13.1) ---------------------- */

const kpi = {};
for (const r of table(section("### 13.1 ")).rows) {
  const key = r[0].replace(/`/g, "").trim();
  kpi[key] = r[1];
}
const kpiNum = (key) => num(kpi[key]);
const pair = (key, i) => {                              // "153 · 143 · 296" → ช่องที่ i
  const parts = String(kpi[key] ?? "").split("·").map((s) => num(s));
  return parts[i] ?? null;
};

check("13.1 ↔ 13.2 · ยอดองค์กรตรงกับผลรวมรายสาขา", () => {
  const tot = (h) => num(totalRow[t132.head.indexOf(h)]);
  const cmp = [
    ["VISITS", kpiNum("VISITS"), tot("VISITS")],
    ["WALKIN_VISITS", kpiNum("WALKIN_VISITS"), tot("Walk-in")],
    ["IDENTIFIED_VISITS", kpiNum("IDENTIFIED_VISITS"), tot("Identified")],
    ["UNIQUE_CUSTOMERS", kpiNum("UNIQUE_CUSTOMERS"), tot("ลูกค้าไม่ซ้ำ")],
    ["LEADS", kpiNum("LEADS"), tot("Leads")],
    ["OPPORTUNITIES", kpiNum("OPPORTUNITIES"), tot("Opps")],
    ["SALES", kpiNum("SALES"), tot("Sales")],
    ["SALES_AMOUNT", kpiNum("SALES_AMOUNT"), tot("ยอดขาย (บาท)")],
    ["LOST_OPPORTUNITIES", pair("LOST_OPPORTUNITIES · LOST_LEADS · LOST_TOTAL", 0), tot("Lost Opp")],
    ["LOST_LEADS", pair("LOST_OPPORTUNITIES · LOST_LEADS · LOST_TOTAL", 1), tot("Lost Lead")],
  ];
  const problems = cmp.filter(([, a, b]) => a === null || b === null || a !== b)
    .map(([k, a, b]) => `${k}: 13.1 = ${a} · 13.2 = ${b}`);
  return problems.length ? problems.join(" · ") : true;
});

check("13.1 · ความสัมพันธ์ภายใน (ใหม่+เก่า = ไม่ซ้ำ · walk-in+ออนไลน์ = visit · lost รวมกัน)", () => {
  const problems = [];
  const newRet = kpi["NEW_CUSTOMERS · RETURNING_CUSTOMERS"];
  const n = num(String(newRet).split("·")[0]), r = num(String(newRet).split("·")[1]);
  if (n + r !== kpiNum("UNIQUE_CUSTOMERS")) problems.push(`ใหม่ ${n} + เก่า ${r} ≠ ไม่ซ้ำ ${kpiNum("UNIQUE_CUSTOMERS")}`);

  const online = num(totalRow[t132.head.indexOf("ออนไลน์/โทร")]);
  if (kpiNum("WALKIN_VISITS") + online !== kpiNum("VISITS"))
    problems.push(`walk-in ${kpiNum("WALKIN_VISITS")} + ออนไลน์ ${online} ≠ visit ${kpiNum("VISITS")}`);

  const k = "LOST_OPPORTUNITIES · LOST_LEADS · LOST_TOTAL";
  if (pair(k, 0) + pair(k, 1) !== pair(k, 2))
    problems.push(`lost opp ${pair(k, 0)} + lost lead ${pair(k, 1)} ≠ lost รวม ${pair(k, 2)}`);
  return problems.length ? problems.join(" · ") : true;
});

check("13.4 · เหตุผลที่ไม่สำเร็จบวกกันได้ LOST_TOTAL", () => {
  const t = table(section("### 13.4 "));
  const want = pair("LOST_OPPORTUNITIES · LOST_LEADS · LOST_TOTAL", 2);
  const col = t.head.findIndex((h) => /รวม|จำนวน/.test(h));
  if (col < 0) return `ไม่พบคอลัมน์จำนวนในตาราง 13.4 (หัว: ${t.head.join(" | ")})`;
  const rows = t.rows.filter((r) => !/รวม/.test(r[0]) && num(r[col]) !== null);
  const got = rows.reduce((a, r) => a + num(r[col]), 0);
  return got === want ? true : `บวกได้ ${got} แต่ LOST_TOTAL = ${want}`;
});

/* ---- 4. รหัสอ้างอิงต่อเนื่อง (ข้อ 16 Decision log · ข้อ 17 คำถาม) ------------- */

const contiguous = (text, letter) => {
  const ids = [...text.matchAll(new RegExp(`^\\| ${letter}(\\d+) \\|`, "gm"))].map((m) => Number(m[1]));
  if (!ids.length) return `ไม่พบรหัส ${letter}`;
  const gaps = ids.filter((v, i) => v !== i + 1);
  return gaps.length ? `รหัส ${letter} ไม่ต่อเนื่อง (สะดุดที่ ${letter}${gaps[0]})` : ids.length;
};

check("16 · Decision log D1…Dn ต่อเนื่องไม่ข้ามเลข", () => {
  const r = contiguous(section("## 16. "), "D");
  return typeof r === "number" ? true : r;
});

check("17 · คำถาม Q1…Qn ต่อเนื่อง และทุกแถวมีคอลัมน์สถานะ", () => {
  const sec = section("## 17. ");
  const r = contiguous(sec, "Q");
  if (typeof r !== "number") return r;
  const t = table(sec);
  if (t.head.length !== 4) return `ตารางควรมี 4 คอลัมน์ (# · คำถาม · ค่าที่ใช้ไปก่อน · สถานะ) แต่มี ${t.head.length}`;
  const blank = t.rows.filter((row) => /^Q\d+$/.test(row[0]) && !row[3]);
  return blank.length ? `ไม่มีสถานะ: ${blank.map((b) => b[0]).join(" ")}` : true;
});

check("17 · แถวที่ยังไม่ยืนยันต้องคงคำว่า รอยืนยัน (ห้ามกลายเป็น Final เอง)", () => {
  const t = table(section("## 17. "));
  const wrong = t.rows.filter((r) => /^Q\d+$/.test(r[0]))
    .filter((r) => !/ยืนยัน/.test(r[3]));
  return wrong.length ? `สถานะกำกวมที่ ${wrong.map((w) => w[0]).join(" ")}` : true;
});

/* ---- 5. ไฟล์ที่ข้อ 18 อ้าง ต้องมีจริง ---------------------------------------- */

check("18 · ไฟล์เอกสารทุกชุดที่อ้างถึงมีอยู่จริง", () => {
  const sec = section("## 18. ");
  const dirs = { "00-brief": [], "01-requirement": [], "02-architecture": [], "03-data": [],
    "04-security": [], "05-analytics": [], "06-ux": [], "07-api": [], "08-delivery": [] };
  /* เดินทีละบรรทัดโดยจำ "โฟลเดอร์ล่าสุดที่เห็น" ไว้
     เพราะผังขึ้นบรรทัดใหม่ได้เมื่อรายชื่อยาว และบรรทัดต่อเนื่องไม่มี ├── นำหน้า
     เวอร์ชันก่อนหน้าอ่านเฉพาะบรรทัดที่มี ├── จึงมองข้ามไฟล์ในบรรทัดต่อเนื่องทั้งหมด
     (จับได้ตอนเพิ่มเอกสารเตรียม Pilot แล้วผังบอกว่ามี ทั้งที่ไฟล์ยังไม่ถูกสร้าง) */
  let current = null;
  for (const line of sec.split("\n")) {
    if (!line.includes("│")) { current = null; continue; }
    const dir = Object.keys(dirs).find((d) => line.includes(`${d}/`));
    if (dir) current = dir;
    if (!current) continue;
    for (const f of line.matchAll(/([\w-]+\.md)/g)) dirs[current].push(f[1]);
  }
  const missing = [];
  for (const [dir, files] of Object.entries(dirs))
    for (const f of files)
      if (!existsSync(join(ROOT, "docs", dir, f))) missing.push(`docs/${dir}/${f}`);
  const listed = Object.values(dirs).flat().length;
  if (listed < 15) return `อ่านรายชื่อไฟล์จากผังได้แค่ ${listed} ไฟล์ — ผังในข้อ 18 อาจเปลี่ยนรูปแบบ`;
  return missing.length ? `ไม่มีไฟล์: ${missing.join(" · ")}` : true;
});

check("18 · เครื่องมือใน tools/ ที่อ้างถึงมีอยู่จริง", () => {
  const want = ["tools/db/run.mjs", "tools/db/supabase-shim.sql", "tools/db/gen-seed.mjs",
    "tools/db/gen-data-dictionary.mjs", "tools/db/dev-api.mjs", "tools/check-prototype.mjs",
    "tools/check-canonical.mjs", "tools/serve-prototype.mjs", "tools/smoke-test.py"];
  const missing = want.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length) return `ไม่มี: ${missing.join(" · ")}`;

  /* ผังต้องไม่โฆษณาเครื่องมือที่ยังไม่มี — ผังที่บอกว่ามีของที่ยังไม่มี
     ทำให้คนอ่านวางแผนโดยคิดว่ามีเครื่องมือนั้นอยู่แล้ว */
  const sec = section("## 18. ");
  const treeStart = sec.indexOf("└── tools/");
  const tree = treeStart < 0 ? "" : sec.slice(treeStart, sec.indexOf("```", treeStart));
  const ghosts = [...tree.matchAll(/([\w-]+\.(?:mjs|py|sql))/g)]
    .map((m) => m[1])
    .filter((f) => !existsSync(join(ROOT, "tools", f)) && !existsSync(join(ROOT, "tools/db", f)));
  return ghosts.length ? `ผังอ้างเครื่องมือที่ยังไม่มี: ${[...new Set(ghosts)].join(" · ")}` : true;
});

/* ---- 6. Direction ข้อ 20 ต้องอ้างหน้าจอที่มีจริง ------------------------------ */

/* หน้าที่ต้องเขียนใน Phase 1 = หน้าที่ข้อ 14.1 ระบุ Phase 1 ยกเว้นหน้า 10
   (10 = ตัวอย่างมือถือ ใช้เป็นต้นแบบ ไม่ได้เขียนเป็นหน้าจริง · ข้อ 20.9 และ phase1-plan.md) */
const PHASE1_SCREENS = screens
  .filter((s) => /(^|[^0-9])1([^0-9]|$)/.test(s.phase) && s.no !== "10")
  .map((s) => s.no);

check("20.9 · ลำดับการพัฒนาครอบคลุมหน้า Phase 1 ครบตามข้อ 14.1 (ยกเว้นหน้า 10)", () => {
  const sec = section("### 20.9 ");
  const inTable = table(sec).rows.map((r) => r[r.length - 1].replace(/[^\d]/g, "")).filter(Boolean);
  const inParens = [...sec.matchAll(/\((\d{2})\)/g)].map((m) => m[1]);
  const got = [...new Set([...inTable, ...inParens])].sort();
  const want = [...PHASE1_SCREENS].sort();
  const missing = want.filter((c) => !got.includes(c));
  const extra = got.filter((c) => !want.includes(c));
  if (missing.length || extra.length)
    return `ขาด ${missing.join(" ") || "–"} · เกิน ${extra.join(" ") || "–"}`;
  return true;
});

check("20.8 ↔ 20.9 ↔ phase1-plan.md · จำนวนหน้า Phase 1 ต้องเขียนตรงกันทุกที่", () => {
  const n = PHASE1_SCREENS.length;
  const problems = [];
  const s208 = section("### 20.8 ");
  const m208 = s208.match(/หน้าจอ (\d+) หน้า/);
  if (!m208) problems.push("ข้อ 20.8 ไม่ได้ระบุจำนวนหน้า");
  else if (Number(m208[1]) !== n) problems.push(`ข้อ 20.8 เขียน ${m208[1]} หน้า`);

  const planPath = join(ROOT, "docs/08-delivery/phase1-plan.md");
  if (!existsSync(planPath)) problems.push("ไม่มี docs/08-delivery/phase1-plan.md");
  else {
    const plan = readFileSync(planPath, "utf8");
    const head = plan.match(/## หน้าจอที่จะทำ \((\d+) หน้า/);
    if (!head) problems.push("phase1-plan.md ไม่มีหัวข้อ หน้าจอที่จะทำ (N หน้า…)");
    else if (Number(head[1]) !== n) problems.push(`phase1-plan.md เขียน ${head[1]} หน้า`);
    const from = plan.indexOf("## หน้าจอที่จะทำ");
    const to = plan.indexOf("\n## ", from + 1);
    const rows = ((from < 0 ? "" : plan.slice(from, to < 0 ? undefined : to)).match(/^\| \d{2} \| /gm) || []).length;
    if (rows !== n) problems.push(`ตารางหน้าจอใน phase1-plan.md มี ${rows} แถว`);
  }
  return problems.length ? `ควรเป็น ${n} หน้า — ${problems.join(" · ")}` : true;
});

check("20 · หัวข้อ Direction เรียงต่อเนื่องจาก 20.1 และอยู่ท้ายไฟล์", () => {
  /* ข้อ 20 โตได้เรื่อย ๆ (20.11 = สถานะการพัฒนา) — ตรวจแค่ว่าเลขต่อเนื่องไม่ข้าม */
  const heads = [...SRC.matchAll(/^### 20\.(\d+)/gm)].map((m) => Number(m[1]));
  if (heads.length < 10) return `มีแค่ ${heads.length} หัวข้อ (ต้องมีอย่างน้อย 20.1–20.10)`;
  const want = Array.from({ length: heads.length }, (_, i) => i + 1);
  return heads.join(",") === want.join(",") ? true : `พบ 20.${heads.join(" 20.")}`;
});

/* ---- สรุป -------------------------------------------------------------------- */

console.log(failed ? `\n${failed} ข้อไม่ผ่าน` : "\nผ่านทั้งหมด");
process.exit(failed ? 1 : 0);
