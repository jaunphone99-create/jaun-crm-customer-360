/* =====================================================================================
   web/scripts/check-format.mjs — ตรวจว่า src/lib/format/*.ts ให้ผลเท่ากับ prototype

   ทำไมต้องมีไฟล์นี้
   prototype/assets/app.js (JCRM.fmt) คือรูปแบบตัวเลข/วันที่ที่เจ้าของโครงการอนุมัติแล้ว
   และ tools/check-prototype.mjs ตรวจมันกับ CANONICAL ข้อ 1.2–1.3 ไว้อีกชั้น
   เมื่อย้ายมาเป็น TypeScript สิ่งที่พังได้เงียบที่สุดคือ "ผลต่างทีละตัวอักษร"
   เช่น − กลายเป็น - · "100%" แทน "100.0%" · 2.675 ปัดลงเพราะเผลอใช้ Math.round
   สคริปต์นี้จึงเรียกทั้งสองฝั่งด้วย argument ชุดเดียวกันแล้วเทียบสตริงตรง ๆ

   วิธีโหลดสองฝั่ง (เลือกวิธีที่ง่ายที่สุดที่ทำงานได้จริง ไม่ต้องเพิ่ม dependency)
   - ฝั่ง prototype: app.js เป็นสคริปต์เบราว์เซอร์ที่ไม่แตะ DOM ตอนโหลด จึงห่อด้วย
     new Function("window", src)(sandbox) ได้เลย — วิธีเดียวกับ tools/check-prototype.mjs
   - ฝั่ง TypeScript: Node ≥ 22.18 ลอก type ออกให้เอง จึง import ไฟล์ .ts ได้ตรง
     (นี่คือเหตุผลที่ number.ts กับ date.ts ตั้งใจไม่ import ไฟล์อื่น — Node ไม่ resolve
      import แบบไม่มีนามสกุลอย่างที่ bundler ของ Next ทำ)
   - หมวด 3 ตรึงค่าคาดหวังจาก CANONICAL ไว้ในสคริปต์ เพื่อจับกรณีที่สองฝั่ง "เพี้ยนตรงกัน"

   ใช้:  node scripts/check-format.mjs          พิมพ์ผลทุกข้อ
         node scripts/check-format.mjs --quiet  พิมพ์เฉพาะข้อที่ไม่ผ่าน
   ออกด้วย exit code 1 เมื่อมีข้อใดไม่ผ่าน
   ================================================================================== */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(WEB, "..");
const QUIET = process.argv.includes("--quiet");

let failed = 0;
const ok = (name) => { if (!QUIET) console.log(`  ผ่าน    ${name}`); };
const bad = (name, detail) => { failed++; console.log(`  ไม่ผ่าน ${name}\n          ${detail}`); };
const head = (title) => { if (!QUIET) console.log(`\n${title}`); };
const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));
const args = (a) => a.map(show).join(", ");

/* ---- 1. โหลด prototype (sandbox ไม่มี DOM) และไฟล์ TypeScript ------------------- */

const sandbox = {};
let F, D;
try {
  new Function("window", readFileSync(join(ROOT, "prototype/assets/data.js"), "utf8"))(sandbox);
  new Function("window", readFileSync(join(ROOT, "prototype/assets/app.js"), "utf8"))(sandbox);
  D = sandbox.JCRM_DATA;
  F = sandbox.JCRM && sandbox.JCRM.fmt;
  if (!F || typeof F.int !== "function") throw new Error("ไม่พบ window.JCRM.fmt");
} catch (e) {
  console.log(`  ไม่ผ่าน โหลด prototype/assets/app.js ไม่ได้\n          ${e.message}`);
  process.exit(1);
}

let N, T;
try {
  N = await import(pathToFileURL(join(WEB, "src/lib/format/number.ts")).href);
  T = await import(pathToFileURL(join(WEB, "src/lib/format/date.ts")).href);
} catch (e) {
  console.log(`  ไม่ผ่าน import src/lib/format/*.ts ไม่ได้ (ต้องใช้ Node ≥ 22.18 ที่ลอก type ให้เอง)\n          ${e.message}`);
  process.exit(1);
}

/* ---- 2. เทียบผลทีละฟังก์ชันกับ prototype ---------------------------------------- */

/** iso ของ seed ตาม CANONICAL ข้อ 1.2 — เวลาอ้างอิงที่ทั้งโครงการใช้ทดสอบ */
const NOW = "2026-09-11T10:24:00+07:00";

/* [ชื่อที่แสดง, ฟังก์ชัน TypeScript, ฟังก์ชันใน JCRM.fmt, ชุด argument] */
const PARITY = [
  ["number.round", N.round, F.round, [
    [2.675, 2], [2.665, 2], [-2.675, 2], [1.005, 2], [0.5, 0], [-0.5, 0], [2.4999, 0],
    ["3.14159", 3], ["0.0001", 2], [null, 2], ["", 2], [1234.5, 1],
  ]],
  ["number.int", N.int, F.int, [
    [3125], [0], [-1], [999], [1000], [1234567], [-3332700], [2.5], [2.4], [-2.5],
    ["1008"], [null], [undefined], [""], [NaN],
  ]],
  ["number.money", N.money, F.money, [
    [3332700], [28900.5], [0], [1245000], [-28900.5], [-3332700], [0.005], [12.345],
    ["3051760.00"], ["28900.50"], [null], [""],
  ]],
  ["number.moneyTable", N.moneyTable, F.moneyTable, [
    [1245000], [28900.5], [0], [-1245000], [-0.5], ["3332700"], [null],
  ]],
  ["number.pct", N.pct, F.pct, [
    [753, 3125], [1, 1], [0, 3125], [3125, 3125], [215, 3121], [2977, 3121],
    [9496, 10000], [9495, 10000], [-5, 100], [5, -100], [0, 0], [1, 0], [null, 10], [10, null],
    [1, 3, 2], [2, 3, 0], [1, 8, 3],
  ]],
  ["number.pctValue", N.pctValue, F.pctValue, [
    [95.4], [100], [0], [-0.45], [24.05], ["87.0"], [null], [2.675, 2],
  ]],
  ["number.ratio", N.ratio, F.rate, [
    [{ num: 753, den: 3125, display: "24.1%" }], [{ num: 753, den: 3125 }],
    [{ num: 0, den: 0 }], [null], [undefined],
  ]],
  ["number.growth", N.growth, F.growth, [
    [112, 100], [95, 100], [100, 100], [0, 100], [3125, 2790], [3332700, 3051760],
    [100.4, 100], [-50, 100], [50, -100], [100, 0], [null, 100], [100, null],
  ]],
  ["number.pp", N.pp, F.pp, [
    [251, 1000, 230, 1000], [230, 1000, 251, 1000], [100, 1000, 100, 1000],
    [2977, 3121, 2680, 2825], [753, 3125, 664, 2790], [996, 1000, 1000, 1000],
    [1, 0, 1, 1], [1, 1, 1, 0], [null, 1, 1, 1],
  ]],
  ["number.deltaDir", N.deltaDir, F.deltaDir, [
    ["+12%"], ["−5%"], ["-5%"], ["0%"], ["–"], [null], [""], ["+2.1 pp"],
  ]],
  ["number.minutes", N.minutes, F.minutes, [[45], [0], [1], [125], [null], [""]]],
  ["number.dash", N.dash, F.dash, [["ก"], [0], [null], [undefined], [""], [12]]],
  ["number.showing", N.showing, F.showing, [
    [20, 1008], [20, 1008, { unit: "รายการ" }], [20, 1008, { unit: "รายการ", from: 21 }],
    [0, 1008, { unit: "รายการ" }], [20, null, { unit: "รายการ" }], [1, 1],
  ]],

  ["date.date", T.date, F.date, [
    [NOW], ["2026-09-11"], ["2026-09-11T03:24:00Z"], ["2026-01-01T00:00:00+07:00"],
    ["2026-12-31T23:59:00+07:00"], ["2026-09-10T23:30:00-05:00"], [null], [""], ["ไม่ใช่วันที่"],
  ]],
  ["date.dayMonth", T.dayMonth, F.dayMonth, [
    [NOW], ["2026-08-13"], ["2026-12-31T23:59:00+07:00"], [null],
  ]],
  ["date.time", T.time, F.time, [
    [NOW], [NOW, { suffix: false }], [NOW, { suffix: true }],
    ["2026-09-11T03:24:00Z"], ["2026-09-11T09:05:00+07:00"], ["2026-09-11"], [null],
  ]],
  ["date.dateTime", T.dateTime, F.dateTime, [
    [NOW], [NOW, { suffix: true }], [NOW, { suffix: false }],
    ["2026-09-11"], ["2026-09-11T03:24:00Z"], [null],
  ]],
  ["date.dayKey", T.dayKey, F.dayKey, [
    [NOW], ["2026-09-11T17:30:00Z"], ["2026-09-11T16:59:00Z"], ["2026-09-11"], [null],
  ]],
  ["date.minutesOfDay", T.minutesOfDay, F.minutesOfDay, [[NOW], ["2026-09-11"], [null]]],
  ["date.compareIso", T.compareIso, F.compareIso, [
    [NOW, NOW], [NOW, "2026-09-12T10:24:00+07:00"], ["2026-09-12T10:24:00+07:00", NOW],
    [NOW, "2026-09-11T09:00:00+07:00"], ["2026-09-11", "2026-09-11T00:00:00+07:00"],
  ]],
  ["date.minutesBetween", T.minutesBetween, F.minutesBetween, [
    ["2026-09-11T10:09:00+07:00", NOW], [NOW, "2026-09-11T10:09:00+07:00"],
    ["2026-09-10T23:00:00+07:00", NOW], [null, NOW],
  ]],
  ["date.addDays", T.addDays, F.addDays, [
    ["2026-09-11", 1], ["2026-09-11", -1], ["2026-09-12", -1], ["2026-01-01", -1],
    ["2026-12-31", 1], ["2028-02-28", 1], ["2026-09-11", 0], [null, 1],
  ]],
  ["date.rangeInclusive", T.rangeInclusive, F.rangeInclusive, [
    ["2026-08-13", "2026-09-12"], ["2026-09-11", "2026-09-12"],
    ["2025-12-25", "2026-01-02"], ["2026-01-01", "2027-01-01"], [null, "2026-09-12"],
  ]],
  ["date.asOf", T.asOf, F.asOf, [[NOW], ["2026-09-11"], ["2026-09-11T03:24:00Z"]]],
];

head("1. ผลของ src/lib/format/*.ts เท่ากับ JCRM.fmt ของ prototype ทุกตัวอักษร");
for (const [name, tsFn, jsFn, cases] of PARITY) {
  if (typeof tsFn !== "function") { bad(name, "ไม่มีฟังก์ชันนี้ใน TypeScript"); continue; }
  if (typeof jsFn !== "function") { bad(name, "ไม่มีฟังก์ชันคู่กันใน JCRM.fmt"); continue; }
  const diffs = [];
  for (const a of cases) {
    let got, want;
    try { got = tsFn(...a); } catch (e) { got = `throw: ${e.message}`; }
    try { want = jsFn(...a); } catch (e) { want = `throw: ${e.message}`; }
    if (got !== want) diffs.push(`(${args(a)}) → ได้ ${show(got)} prototype ให้ ${show(want)}`);
  }
  diffs.length ? bad(`${name} (${cases.length} กรณี)`, diffs.join("\n          ")) : ok(`${name} (${cases.length} กรณี)`);
}

/* meetsTarget ของ prototype อ่านเป้าหมายจาก D.kpiTargets ส่วนฝั่ง TypeScript รับเป้าหมายเข้ามา
   (เป้าหมายเป็นของฐานข้อมูล ไม่ใช่ของตัวจัดรูปแบบ) จึงต้องเทียบแยกจากตารางข้างบน */
{
  const cases = [
    ["OUTCOME_COMPLETION", 2977, 3121], ["OUTCOME_COMPLETION", 9496, 10000], ["OUTCOME_COMPLETION", 9500, 10000],
    ["CAPTURE_RATE", 2718, 3125], ["CAPTURE_RATE", 95, 100], ["FOLLOWUP_COMPLETION", 850, 1000],
    ["DUPLICATE_RATE", 1, 1000], ["DUPLICATE_RATE", 20, 1000], ["MISSING_REQUIRED_RATE", 4, 1000],
    ["CAPTURE_RATE", null, 100], ["CAPTURE_RATE", 95, 0],
  ];
  const diffs = [];
  for (const [code, num, den] of cases) {
    const got = N.meetsTarget(num, den, D.kpiTargets[code]);
    const want = F.meetsTarget(num, den, code);
    if (got !== want) diffs.push(`(${code}, ${show(num)}, ${show(den)}) → ได้ ${show(got)} prototype ให้ ${show(want)}`);
  }
  diffs.length ? bad("number.meetsTarget (เทียบด้วยค่าที่ยังไม่ปัด)", diffs.join("\n          "))
    : ok(`number.meetsTarget (${cases.length} กรณี)`);
}

/* ---- 3. ค่าคาดหวังที่ตรึงจาก CANONICAL ข้อ 1.2–1.3 ----------------------------- */

head("2. ค่าตัวอย่างตรงกับ CANONICAL ข้อ 1.2–1.3 ตัวต่อตัว");
const EXPECT = [
  ["ข้อ 1.3 จำนวนคั่นหลักพัน", () => N.int(3125), "3,125"],
  ["ข้อ 1.3 เงินบนการ์ด", () => N.money(3332700), "฿3,332,700"],
  ["ข้อ 1.3 เงินมีสตางค์แสดง 2 ตำแหน่ง", () => N.money(28900.5), "฿28,900.50"],
  ["ข้อ 1.3 เงินจำนวนเต็มไม่มีสตางค์", () => N.money(1245000), "฿1,245,000"],
  ["ข้อ 1.3 เงินในช่องตารางไม่มี ฿", () => N.moneyTable(1245000), "1,245,000"],
  ["ข้อ 1.3 อัตราทศนิยม 1 ตำแหน่ง", () => N.pct(753, 3125), "24.1%"],
  ["ข้อ 1.3 อัตราเต็มร้อยยังมีทศนิยม", () => N.pct(3125, 3125), "100.0%"],
  ["ข้อ 1.3 อัตราแบบส่งค่ามาแล้ว", () => N.pctValue(36), "36.0%"],
  ["ข้อ 1.3 ส่วนต่างของอัตราเป็น pp", () => N.pp(251, 1000, 230, 1000), "+2.1 pp"],
  ["ข้อ 1.3 pp ติดลบใช้ − (U+2212)", () => N.pp(996, 1000, 1000, 1000), "−0.4 pp"],
  ["ข้อ 1.3 ส่วนต่างของจำนวนเป็น % จำนวนเต็ม", () => N.growth(112, 100), "+12%"],
  ["ข้อ 1.3 ส่วนต่างติดลบใช้ − (U+2212)", () => N.growth(95, 100), "−5%"],
  ["ข้อ 1.3 ช่วงก่อนหน้าเป็น 0 → –", () => N.growth(112, 0), "–"],
  ["ข้อ 1.3 ตัวหารเป็น 0 → –", () => N.pct(1, 0), "–"],
  ["ข้อ 1.3 ค่าว่าง → –", () => N.int(null), "–"],
  ["ข้อ 1.3 ปัด half away from zero (2.675)", () => N.round(2.675, 2), "2.68"],
  ["ข้อ 1.3 ปัดค่าลบออกจากศูนย์ (−2.675)", () => N.round(-2.675, 2), "−2.68"],
  ["ข้อ 1.3 เทียบเป้าด้วยค่าที่ยังไม่ปัด (94.96% ไม่ผ่าน ≥95)", () => N.meetsTarget(9496, 10000, { op: ">=", pct: 95 }), false],
  ["ข้อ 1.3 94.96% ยังแสดงเป็น 95.0%", () => N.pct(9496, 10000), "95.0%"],
  ["ข้อ 1.2 วันที่ พ.ศ. แบบย่อ", () => T.date(NOW), "11 ก.ย. 2569"],
  ["ข้อ 1.2 เวลา 24 ชม. มี น.", () => T.time(NOW), "10:24 น."],
  ["ข้อ 19.5 วันเวลาในตารางไม่มี น.", () => T.dateTime(NOW), "11 ก.ย. 2569 10:24"],
  ["ข้อ 19.5 วันเวลาแบบข้อความเดี่ยวมี น.", () => T.dateTime(NOW, { suffix: true }), "11 ก.ย. 2569 10:24 น."],
  ["ข้อ 1.2 ขอบวันคิดตาม Asia/Bangkok ไม่ใช่ UTC", () => T.dayKey("2026-09-11T17:30:00Z"), "2026-09-12"],
  ["ข้อ 1.2 ISO โซนอื่นถูกแปลงมาที่ +07:00", () => T.time("2026-09-11T03:24:00Z"), "10:24 น."],
  ["design-system ข้อ 7.7 ช่วงวันที่รวมวันสุดท้าย", () => T.rangeInclusive("2026-08-13", "2026-09-12"), "13 ส.ค. – 11 ก.ย. 2569"],
  ["ข้อ 1.2 ณ เวลาอ้างอิง", () => T.asOf(NOW), "ณ 11 ก.ย. 2569 10:24 น."],
  ["ข้อ 1.2 บวกวันข้ามปี", () => T.addDays("2026-12-31", 1), "2027-01-01"],
  ["ข้อ 13.0 แถบจำนวนรายการ", () => N.showing(20, 1008, { unit: "รายการ" }), "แสดง 1–20 จาก 1,008 รายการ"],
];
for (const [name, fn, want] of EXPECT) {
  let got;
  try { got = fn(); } catch (e) { got = `throw: ${e.message}`; }
  got === want ? ok(name) : bad(name, `ได้ ${show(got)} ควรเป็น ${show(want)}`);
}

/* ---- 4. กติกาเขียนโค้ดที่ CANONICAL ข้อ 1.3 ห้ามไว้ ---------------------------- */

head("3. ไฟล์ TypeScript ไม่ใช้วิธีปัดที่ต้องห้าม");
for (const rel of ["src/lib/format/number.ts", "src/lib/format/date.ts"]) {
  const src = readFileSync(join(WEB, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = [];
  /* ไม่ตรวจ .toFixed เพราะ toScaled ใช้ครั้งเดียวเพื่อคลี่เลขแบบ 1e-7 ให้เป็นทศนิยมธรรมดา
     ก่อนเข้าเส้นทางจำนวนเต็ม — จุดเดียวกับที่ app.js ใช้ ไม่ใช่การปัดค่าสุดท้าย */
  if (/Math\.round\s*\(/.test(src)) found.push("Math.round (ข้อ 1.3 ห้ามปัด float)");
  if (/Intl\.(NumberFormat|DateTimeFormat)/.test(src)) found.push("Intl (ผลต่างตาม runtime/locale)");
  if (/toLocale(String|DateString|TimeString)\s*\(/.test(src)) found.push("toLocaleString (ผลต่างตาม runtime/locale)");
  if (/new Date\s*\(\s*\)/.test(src)) found.push("new Date() (ข้อ 1.2 เวลาอ้างอิงมาจาก app.clock() ของฐานข้อมูล)");
  found.length ? bad(rel, found.join(" · ")) : ok(rel);
}

/* ---- สรุป -------------------------------------------------------------------- */

console.log(failed ? `\n${failed} ข้อไม่ผ่าน` : "\nผ่านทั้งหมด");
process.exit(failed ? 1 : 0);
