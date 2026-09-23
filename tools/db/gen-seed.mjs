/* =====================================================================================
   tools/db/gen-seed.mjs — ตัวสร้าง supabase/seed.sql แบบ deterministic (PRNG seed 20260911)
   ตาม CANONICAL ข้อ 13 (ชุดข้อมูลตัวอย่าง) · ไม่มี dependency ภายนอก

   ใช้:  node tools/db/gen-seed.mjs            เขียนทับ supabase/seed.sql
         node tools/db/gen-seed.mjs --check    ตรวจ assertion อย่างเดียว ไม่เขียนไฟล์

   หลักการ (ข้อ 13.0):
     1. ข้อมูลระดับแถวทั้งหมด · ไม่มียอดสำเร็จรูป · KPI คำนวณจากแถวจริงผ่าน api.get_kpis / api.get_report
     2. ค่าคงที่ทุกตัวมาจาก CANONICAL ข้อ 13.1–13.14 · ข้อมูลเติมสร้างจาก PRNG seed คงที่
     3. seed ตั้ง app.bulk = on และ app.seed_mode = on ระหว่างโหลด แล้วจบด้วย refresh lifecycle
     4. ตัวสร้างนี้ assert ทุกยอดที่พิมพ์ใน CANONICAL ก่อนเขียนไฟล์ (fail เร็วกว่ารอ acceptance.sql)

   หมายเหตุผู้เขียน (ดู canonical_issues ของงานนี้):
     · ข้อ 13.6/13.1/13.2 ให้ leads ใน P = 892 · opportunities = 368 · lost lead = 143 และ
       "lead เปิดอยู่" รวมทุกสาขาเพียงหลักร้อยต้น ๆ  ผลบวกจึงไม่ลงตัวถ้า lead หนึ่งใบ = opportunity หนึ่งใบ
       (JP1: 298 = 52 เปิด + 45 LOST + แปลง → ต้องแปลง 201 ใบ แต่ opportunity ที่สร้างใน P มี 120)
       seed นี้จึงใช้การอ่านที่สอดคล้องที่สุด: lead หลายใบของ "ลูกค้าคนเดียวกัน" แปลงเข้า opportunity ใบเดียวได้
       (crm.leads.converted_opportunity_id ไม่มี unique index · CANONICAL ไม่ห้าม)
   ================================================================================== */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "supabase/seed.sql");
const CHECK_ONLY = process.argv.includes("--check");

/* ---------------------------------------------------------------- PRNG (mulberry32) */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260911);
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

/* ---------------------------------------------------------------- เวลา (Asia/Bangkok) */
const HOUR = 3600, DAY = 86400, TZ = 7 * HOUR;
/** เวลาตามนาฬิกา Asia/Bangkok → epoch seconds */
function ts(y, mo, d, h = 0, mi = 0, s = 0) { return Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - TZ; }
/** epoch seconds → ข้อความ timestamptz ที่มี +07 เสมอ (ข้อ 1.2) */
function fmt(sec) {
  const d = new Date((sec + TZ) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+07`;
}
function bkkDateStr(sec) { const d = new Date((sec + TZ) * 1000); const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; }
function yymmdd(sec) { const d = new Date((sec + TZ) * 1000); const p = (n) => String(n).padStart(2, "0");
  return `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`; }
function yyyymmdd(sec) { return bkkDateStr(sec).replace(/-/g, ""); }

const CLOCK      = ts(2026, 9, 11, 10, 24);
const TODAY0     = ts(2026, 9, 11);
const TOMORROW0  = ts(2026, 9, 12);
const P_START    = ts(2026, 8, 13);
const P_END      = TOMORROW0;
const PREV_START = ts(2026, 7, 14);
const PREV_END   = P_START;
const W7_START   = ts(2026, 9, 5);           // "7 วันล่าสุด"
const LAST_WEEK_DAY = ts(2026, 9, 4);        // วันเดียวกันสัปดาห์ก่อน (เทียบ TODAY)
const OPEN_HOUR  = 10 * HOUR;                // business_hours default 10:00–21:00 (ข้อ 11.2)
const WORK_SPAN  = 10.5 * HOUR;              // 10:00 → 20:30
const SAFE_START = 10 * HOUR + 30 * 60;      // 10:30 — หลัง 10:24 เสมอ (กติกาวันที่ 4 ก.ย. ข้อ 13.11)
const SAFE_SPAN  = 9.5 * HOUR;               // 10:30 → 20:00

const P_DAYS    = 30;   // 13 ส.ค. … 11 ก.ย.
const PREV_DAYS = 30;   // 14 ก.ค. … 12 ส.ค.
const TODAY_D   = 29;   // index ของ 11 ก.ย. ใน P
const SEP4_D    = 22;   // index ของ 4 ก.ย. ใน P
const SEP8_D    = 26;   // index ของ 8 ก.ย. ใน P

/** เวลาจาก "ตำแหน่งวันแบบทศนิยม" ในช่วง (ใช้ 10:30–20:00 เพื่อไม่ชนกติกา 10:24 ของ 4 ก.ย.) */
function posTimeSafe(base, pos) {
  const d = Math.floor(pos), f = Math.min(Math.max(pos - d, 0), 0.999);
  return base + d * DAY + SAFE_START + Math.round(f * SAFE_SPAN);
}
/** ตำแหน่งวันแบบทศนิยมจากเวลา (ผกผันของ posTimeSafe) */
function timePosSafe(base, sec) {
  const d = Math.floor((sec - base) / DAY);
  const within = sec - (base + d * DAY) - SAFE_START;
  return d + Math.min(Math.max(within / SAFE_SPAN, 0), 0.999);
}

/* ---------------------------------------------------------------- uuid แบบ deterministic */
function uid(tag, n) {
  return `${tag.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
const T = { ORG: 1, BU: 2, BRANCH: 3, TEAM: 4, STAFF: 5, USER: 6, TAG: 7, CUST: 0x10, CONTACT: 0x11,
  VISIT: 0x20, INTER: 0x21, LEAD: 0x30, OPP: 0x31, OPPITEM: 0x32, QUO: 0x33, QUOITEM: 0x34, TXN: 0x35,
  TASK: 0x40, NOTIF: 0x41, DUP: 0x42, MERGE: 0x43, EXPORT: 0x44, RG: 0x45, CONSENT: 0x46, NOTE: 0x47,
  OWNCH: 0x48, ADDR: 0x49, INVITE: 0x4a, MFA: 0x4b };

/* ---------------------------------------------------------------- SQL helpers */
function q(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}
const out = [];
function raw(s) { out.push(s); }
function batchInsert(table, cols, rows, chunk = 800) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` +
      part.map((r) => "  (" + cols.map((c) => q(r[c])).join(", ") + ")").join(",\n") + ";");
  }
}
let failures = 0;
function assertEq(actual, expected, msg) {
  if (actual !== expected) { console.error(`✗ ${msg}: ได้ ${actual} คาดว่า ${expected}`); failures++; }
}
function assertTrue(cond, msg) { if (!cond) { console.error(`✗ ${msg}`); failures++; } }

/* ---------------------------------------------------------------- ค่าคงที่จาก CANONICAL ข้อ 13 */
const BCODES = ["JP1", "JP2", "JP3", "JP4"];
const BR = {
  JP1: { V: 1008, W: 812, IDN: 891, U: 412, NEW: 262, RET: 150, L: 298, O: 120, S: 82, LO: 51, LL: 45, AMT: 1245000,
         Vp: 900, Up: 368, Lp: 276, Op: 105, Sp: 69, AMTp: 1111600, IDNp: 795, ONp: 180, LOp: 30, LLp: 40,
         UNREC: 44, UNREC7: 9, walkinSales: 60, buyers: 80, dbl: 2, prior: 14,
         openOpp: 62, oppStages: [32, 18, 12], openLead: 58, leadNEW: 14, leadCONT: 29, leadQUAL: 15,
         preNewLeads: 6, msgLeads: 75, notContacted: 8,
         chan: { WALK_IN: 147, LINE: 116, FACEBOOK: 66, INSTAGRAM: 33, TIKTOK: 29, PHONE: 21 },
         fu: { den: 352, ontime: 305, late: 47, openPast: 0, grace: 6, today: 9 },
         dq: { DUP: 5, MISSING_PHONE: 7, INVALID_PHONE: 2, LEAD_WITHOUT_OWNER: 2, LEAD_WITHOUT_OUTCOME: 6,
               OVERDUE_FOLLOWUP: 6, INCOMPLETE_CUSTOMER: 13, WON_WITHOUT_TRANSACTION: 4, VISIT_UNRECORDED: 9 },
         today: { walkin: 4, online: 3, visits: 7, identified: 4, unique: 7, open: 4, lastWeek: 6 } },
  JP2: { V: 842, W: 694, IDN: 740, U: 356, NEW: 222, RET: 134, L: 241, O: 98, S: 61, LO: 40, LL: 38, AMT: 906500,
         Vp: 752, Up: 318, Lp: 223, Op: 86, Sp: 52, AMTp: 839350, IDNp: 661, ONp: 164, LOp: 24, LLp: 34,
         UNREC: 38, UNREC7: 8, walkinSales: 46, buyers: 59, dbl: 2, prior: 10,
         openOpp: 50, oppStages: [26, 15, 9], openLead: 46, leadNEW: 5, leadCONT: 25, leadQUAL: 16,
         preNewLeads: 5, msgLeads: 60, notContacted: 0,
         chan: { WALK_IN: 143, LINE: 93, FACEBOOK: 53, INSTAGRAM: 27, TIKTOK: 23, PHONE: 17 },
         fu: { den: 290, ontime: 246, late: 37, openPast: 7, grace: 2, today: 0 },
         dq: { DUP: 4, MISSING_PHONE: 6, INVALID_PHONE: 2, LEAD_WITHOUT_OWNER: 2, LEAD_WITHOUT_OUTCOME: 5,
               OVERDUE_FOLLOWUP: 9, INCOMPLETE_CUSTOMER: 11, WON_WITHOUT_TRANSACTION: 3, VISIT_UNRECORDED: 8 },
         today: { walkin: 2, online: 2, visits: 4, identified: 4, unique: 4, open: 0, lastWeek: 4 } },
  JP3: { V: 694, W: 521, IDN: 596, U: 280, NEW: 176, RET: 104, L: 187, O: 86, S: 45, LO: 36, LL: 33, AMT: 712300,
         Vp: 620, Up: 250, Lp: 173, Op: 76, Sp: 38, AMTp: 678380, IDNp: 532, ONp: 134, LOp: 20, LLp: 30,
         UNREC: 34, UNREC7: 7, walkinSales: 31, buyers: 44, dbl: 1, prior: 7,
         openOpp: 45, oppStages: [23, 13, 9], openLead: 42, leadNEW: 4, leadCONT: 23, leadQUAL: 15,
         preNewLeads: 4, msgLeads: 50, notContacted: 0,
         chan: { WALK_IN: 64, LINE: 95, FACEBOOK: 54, INSTAGRAM: 27, TIKTOK: 24, PHONE: 16 },
         fu: { den: 226, ontime: 190, late: 30, openPast: 6, grace: 2, today: 0 },
         dq: { DUP: 4, MISSING_PHONE: 5, INVALID_PHONE: 1, LEAD_WITHOUT_OWNER: 2, LEAD_WITHOUT_OUTCOME: 4,
               OVERDUE_FOLLOWUP: 8, INCOMPLETE_CUSTOMER: 9, WON_WITHOUT_TRANSACTION: 3, VISIT_UNRECORDED: 7 },
         today: { walkin: 2, online: 2, visits: 4, identified: 3, unique: 3, open: 0, lastWeek: 2 } },
  JP4: { V: 581, W: 498, IDN: 492, U: 236, NEW: 149, RET: 87, L: 166, O: 64, S: 27, LO: 26, LL: 27, AMT: 468900,
         Vp: 518, Up: 210, Lp: 154, Op: 56, Sp: 23, AMTp: 422430, IDNp: 439, ONp: 117, LOp: 14, LLp: 24,
         UNREC: 28, UNREC7: 5, walkinSales: 21, buyers: 26, dbl: 1, prior: 4,
         openOpp: 35, oppStages: [18, 10, 7], openLead: 36, leadNEW: 5, leadCONT: 20, leadQUAL: 11,
         preNewLeads: 4, msgLeads: 38, notContacted: 1,
         chan: { WALK_IN: 108, LINE: 56, FACEBOOK: 32, INSTAGRAM: 16, TIKTOK: 14, PHONE: 10 },
         fu: { den: 178, ontime: 148, late: 24, openPast: 6, grace: 2, today: 0 },
         dq: { DUP: 3, MISSING_PHONE: 5, INVALID_PHONE: 1, LEAD_WITHOUT_OWNER: 2, LEAD_WITHOUT_OUTCOME: 4,
               OVERDUE_FOLLOWUP: 8, INCOMPLETE_CUSTOMER: 9, WON_WITHOUT_TRANSACTION: 2, VISIT_UNRECORDED: 5 },
         today: { walkin: 1, online: 1, visits: 2, identified: 2, unique: 2, open: 0, lastWeek: 2 } },
};

/* ตรวจผลรวมกับข้อ 13.1 / 13.2 ทันที */
const sum = (f) => BCODES.reduce((a, c) => a + f(BR[c]), 0);
assertEq(sum((b) => b.V), 3125, "13.2 ผลรวม VISITS");
assertEq(sum((b) => b.W), 2525, "13.2 ผลรวม Walk-in");
assertEq(sum((b) => b.IDN), 2719, "13.2 ผลรวม Identified");
assertEq(sum((b) => b.U), 1284, "13.2 ผลรวมลูกค้าไม่ซ้ำ");
assertEq(sum((b) => b.NEW), 809, "13.2 ผลรวมลูกค้าใหม่");
assertEq(sum((b) => b.RET), 475, "13.2 ผลรวมลูกค้าเก่า");
assertEq(sum((b) => b.L), 892, "13.2 ผลรวม Leads");
assertEq(sum((b) => b.O), 368, "13.2 ผลรวม Opportunities");
assertEq(sum((b) => b.S), 215, "13.2 ผลรวม Sales");
assertEq(sum((b) => b.LO), 153, "13.2 ผลรวม Lost Opp");
assertEq(sum((b) => b.LL), 143, "13.2 ผลรวม Lost Lead");
assertEq(sum((b) => b.AMT), 3332700, "13.2 ผลรวมยอดขาย");
assertEq(sum((b) => b.Vp), 2790, "13.2b ผลรวม VISITS ก่อน");
assertEq(sum((b) => b.Up), 1146, "13.2b ผลรวมลูกค้าไม่ซ้ำก่อน");
assertEq(sum((b) => b.Lp), 826, "13.2b ผลรวม Leads ก่อน");
assertEq(sum((b) => b.Op), 323, "13.2b ผลรวม Opps ก่อน");
assertEq(sum((b) => b.Sp), 182, "13.2b ผลรวม Sales ก่อน");
assertEq(sum((b) => b.AMTp), 3051760, "13.2b ผลรวมยอดขายก่อน");
assertEq(sum((b) => b.UNREC), 144, "13.2b ผลรวม UNRECORDED");
assertEq(sum((b) => b.UNREC7), 29, "13.12 ผลรวม VISIT_UNRECORDED 7 วัน");
assertEq(sum((b) => b.walkinSales), 158, "13.2b ผลรวม Sales ต้นทาง Walk-in");
assertEq(sum((b) => b.buyers), 209, "13.2b ผลรวมผู้ซื้อ");
assertEq(sum((b) => b.dbl + b.prior), 41, "13.2b ผลรวมผู้ซื้อซ้ำ");
assertEq(sum((b) => b.fu.den), 1046, "13.2b ผลรวมตัวหาร FOLLOW_UP");
assertEq(sum((b) => b.fu.ontime), 889, "13.2b ผลรวมตรงเวลา");
assertEq(sum((b) => b.fu.late), 138, "13.2b ผลรวมเสร็จช้า");
assertEq(sum((b) => b.fu.openPast), 19, "13.2b ผลรวมเปิด·พ้นผ่อนผัน");
assertEq(sum((b) => b.fu.grace), 12, "13.2b ผลรวมตัดออก·ในผ่อนผัน");
assertEq(sum((b) => b.fu.today), 9, "13.2b ผลรวมตัดออก·due วันนี้");
assertEq(sum((b) => b.today.visits), 17, "13.11 ผลรวม VISITS วันนี้");
assertEq(sum((b) => b.today.unique), 16, "13.11 ผลรวมลูกค้าไม่ซ้ำวันนี้");
assertEq(sum((b) => b.today.lastWeek), 14, "13.11 ผลรวมสัปดาห์ก่อน");
for (const c of BCODES) {
  const b = BR[c];
  assertEq(b.fu.ontime + b.fu.late + b.fu.openPast, b.fu.den, `13.2b ตัวหาร FOLLOW_UP ${c}`);
  assertEq(b.dq.OVERDUE_FOLLOWUP, b.fu.grace + b.fu.openPast, `13.12 OVERDUE_FOLLOWUP ${c}`);
  assertEq(Object.values(b.chan).reduce((a, x) => a + x, 0), b.U, `13.3 ผลรวมช่องทาง ${c}`);
  assertEq(b.NEW + b.RET, b.U, `13.2 ใหม่+เก่า ${c}`);
  assertEq(b.oppStages.reduce((a, x) => a + x, 0), b.openOpp, `13.9 ผลรวมคอลัมน์ pipeline ${c}`);
  assertEq(b.leadNEW + b.leadCONT + b.leadQUAL, b.openLead, `13.6 ผลรวมสถานะ lead เปิด ${c}`);
  assertEq(b.today.walkin + b.today.online, b.today.visits, `13.11 walk-in+online ${c}`);
}
assertEq(sum((b) => b.dq.DUPLICATE_SUSPECTED ?? b.dq.DUP), 16, "13.12 ผลรวม DUPLICATE_SUSPECTED");
assertEq(sum((b) => b.dq.MISSING_PHONE), 23, "13.12 ผลรวม MISSING_PHONE");
assertEq(sum((b) => b.dq.INVALID_PHONE), 6, "13.12 ผลรวม INVALID_PHONE");
assertEq(sum((b) => b.dq.LEAD_WITHOUT_OWNER), 8, "13.12 ผลรวม LEAD_WITHOUT_OWNER");
assertEq(sum((b) => b.dq.LEAD_WITHOUT_OUTCOME), 19, "13.12 ผลรวม LEAD_WITHOUT_OUTCOME");
assertEq(sum((b) => b.dq.OVERDUE_FOLLOWUP), 31, "13.12 ผลรวม OVERDUE_FOLLOWUP");
assertEq(sum((b) => b.dq.INCOMPLETE_CUSTOMER), 42, "13.12 ผลรวม INCOMPLETE_CUSTOMER");
assertEq(sum((b) => b.dq.WON_WITHOUT_TRANSACTION), 12, "13.12 ผลรวม WON_WITHOUT_TRANSACTION");
const CHAN_TOTALS = { WALK_IN: 462, LINE: 360, FACEBOOK: 205, INSTAGRAM: 103, TIKTOK: 90, PHONE: 64 };
for (const [k, v] of Object.entries(CHAN_TOTALS)) assertEq(sum((b) => b.chan[k]), v, `13.3 ผลรวมช่องทาง ${k}`);

/* เหตุผลที่ไม่สำเร็จ (ข้อ 13.4) — [JP1,JP2,JP3,JP4] และจำนวนที่เป็น Lead */
const LOST = [
  { code: "PRICE",            br: [27, 22, 19, 15], total: 83, lead: 38 },
  { code: "COMPARING",        br: [17, 14, 12, 10], total: 53, lead: 27 },
  { code: "NOT_READY",        br: [15, 12, 11,  9], total: 47, lead: 26 },
  { code: "DOCUMENTS",        br: [12, 10,  8,  6], total: 36, lead: 14 },
  { code: "CHANGED_MIND",     br: [10,  8,  7,  5], total: 30, lead: 13 },
  { code: "OUT_OF_STOCK",     br: [ 6,  5,  4,  3], total: 18, lead:  9 },
  { code: "FINANCE_REJECTED", br: [ 4,  3,  3,  1], total: 11, lead:  5 },
  { code: "COMPETITOR",       br: [ 3,  2,  2,  2], total:  9, lead:  3 },
  { code: "UNREACHABLE",      br: [ 1,  1,  2,  2], total:  6, lead:  6 },
  { code: "PROMOTION",        br: [ 1,  1,  1,  0], total:  3, lead:  2 },
];
for (const r of LOST) assertEq(r.br.reduce((a, x) => a + x, 0), r.total, `13.4 ผลรวมสาขาของ ${r.code}`);
assertEq(LOST.reduce((a, r) => a + r.total, 0), 296, "13.4 LOST_TOTAL");
assertEq(LOST.reduce((a, r) => a + r.lead, 0), 143, "13.4 ผลรวม 'ในนั้นเป็น Lead'");
for (let i = 0; i < 4; i++)
  assertEq(LOST.reduce((a, r) => a + r.br[i], 0), BR[BCODES[i]].LO + BR[BCODES[i]].LL, `13.4 ผลรวมของ ${BCODES[i]}`);

/* แบ่ง LOST เป็น lead/opportunity ต่อสาขา (max-flow บนกราฟเล็ก · deterministic) */
const leadRowTarget = BCODES.map((c) => BR[c].LL);          // 45 38 33 27
const leadColTarget = LOST.map((r) => r.lead);
const leadAlloc = LOST.map(() => [0, 0, 0, 0]);
{
  /* node: 0 = source · 1..R = เหตุผล · R+1..R+4 = สาขา · R+5 = sink */
  const R = LOST.length, N = R + 6, SRC = 0, SNK = R + 5;
  const cap = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let r = 0; r < R; r++) {
    cap[SRC][1 + r] = leadColTarget[r];
    for (let b = 0; b < 4; b++) cap[1 + r][R + 1 + b] = LOST[r].br[b];
  }
  for (let b = 0; b < 4; b++) cap[R + 1 + b][SNK] = leadRowTarget[b];
  let flow = 0;
  for (;;) {
    const prev = new Array(N).fill(-1); prev[SRC] = SRC;
    const queue = [SRC];
    while (queue.length) {
      const u = queue.shift();
      for (let v = 0; v < N; v++) if (prev[v] < 0 && cap[u][v] > 0) { prev[v] = u; queue.push(v); }
    }
    if (prev[SNK] < 0) break;
    let add = Infinity;
    for (let v = SNK; v !== SRC; v = prev[v]) add = Math.min(add, cap[prev[v]][v]);
    for (let v = SNK; v !== SRC; v = prev[v]) { cap[prev[v]][v] -= add; cap[v][prev[v]] += add; }
    flow += add;
  }
  assertEq(flow, 143, "13.4 แบ่ง lead ต่อสาขา/เหตุผล (max-flow)");
  for (let r = 0; r < R; r++) for (let b = 0; b < 4; b++) leadAlloc[r][b] = LOST[r].br[b] - cap[1 + r][R + 1 + b];
  for (let b = 0; b < 4; b++)
    assertEq(leadAlloc.reduce((a, x) => a + x[b], 0), leadRowTarget[b], `13.4 lost lead ของ ${BCODES[b]}`);
  for (let r = 0; r < R; r++)
    assertEq(leadAlloc[r].reduce((a, x) => a + x, 0), leadColTarget[r], `13.4 lost lead ของเหตุผล ${LOST[r].code}`);
}
const oppAlloc = LOST.map((r, i) => r.br.map((v, b) => v - leadAlloc[i][b]));
for (let b = 0; b < 4; b++)
  assertEq(oppAlloc.reduce((a, r) => a + r[b], 0), BR[BCODES[b]].LO, `13.4 lost opportunity ของ ${BCODES[b]}`);

/* ---------------------------------------------------------------- โครงองค์กร (ข้อ 2) */
const ORG = uid(T.ORG, 1);
const BU = { JAUNPHONE: uid(T.BU, 1), JPM: uid(T.BU, 2) };
const BRANCH = { JP1: uid(T.BRANCH, 1), JP2: uid(T.BRANCH, 2), JP3: uid(T.BRANCH, 3), JP4: uid(T.BRANCH, 4), JPON: uid(T.BRANCH, 5) };
const TEAM = { "JP1-SALES": uid(T.TEAM, 1), "JP2-SALES": uid(T.TEAM, 2), "JP3-SALES": uid(T.TEAM, 3),
               "JP4-SALES": uid(T.TEAM, 4), "JPON-ADMIN": uid(T.TEAM, 5) };

/* พนักงาน (ข้อ 13.5) */
const STAFF_DEF = [
  { code: "ST-0001", name: "จ๋าอั๋น",  role: "EXECUTIVE",      branch: null,   team: null,          email: "ja@example.com",    status: "ACTIVE" },
  { code: "ST-0002", name: "คุณแพร",   role: "BUSINESS_ADMIN", branch: null,   team: null,          email: "prae@example.com",  status: "ACTIVE" },
  { code: "ST-0003", name: "คุณต้น",   role: "SYSTEM_ADMIN",   branch: null,   team: null,          email: "ton@example.com",   status: "ACTIVE" },
  { code: "ST-0010", name: "คุณปุ๊ก",   role: "OPERATIONS",     branch: "ALL4", team: null,          email: "puk@example.com",   status: "ACTIVE" },
  { code: "ST-0011", name: "คุณมายด์", role: "MARKETING",      branch: null,   team: null,          email: "mind@example.com",  status: "ACTIVE" },
  { code: "ST-0020", name: "คุณเจ",    role: "BRANCH_MANAGER", branch: "JP1",  team: null,          email: "jay@example.com",   status: "ACTIVE" },
  { code: "ST-0021", name: "คุณบอส",   role: "BRANCH_MANAGER", branch: "JP2",  team: null,          email: "boss@example.com",  status: "ACTIVE" },
  { code: "ST-0022", name: "คุณหนึ่ง", role: "BRANCH_MANAGER", branch: "JP3",  team: null,          email: "nueng@example.com", status: "ACTIVE" },
  { code: "ST-0023", name: "คุณเบียร์", role: "BRANCH_MANAGER", branch: "JP4", team: null,          email: "beer@example.com",  status: "ACTIVE" },
  { code: "ST-0030", name: "คุณนัท",   role: "SUPERVISOR",     branch: "JP1",  team: "JP1-SALES",   email: "nat@example.com",   status: "ACTIVE", leader: true },
  { code: "ST-0045", name: "คุณขวัญ",  role: "STAFF",          branch: "JP1",  team: "JP1-SALES",   email: "kwan@example.com",  status: "ACTIVE" },
  { code: "ST-0046", name: "คุณคิม",   role: "STAFF",          branch: "JP1",  team: "JP1-SALES",   email: "kim@example.com",   status: "ACTIVE" },
  { code: "ST-0050", name: "คุณฝน",    role: "STAFF",          branch: "JPON", team: "JPON-ADMIN",  email: "fon@example.com",   status: "ACTIVE" },
  { code: "ST-0051", name: "คุณโอ๊ต",  role: null,             branch: null,   team: null,          email: "oat@example.com",   status: "INVITED" },
];
const S = {};   // staff_code → { id, userId, ... }
STAFF_DEF.forEach((s, i) => { S[s.code] = { ...s, id: uid(T.STAFF, i + 1), userId: uid(T.USER, i + 1) }; });
const MFA_ROLES = new Set(["SUPERVISOR", "BRANCH_MANAGER", "MARKETING", "OPERATIONS", "BUSINESS_ADMIN", "EXECUTIVE", "SYSTEM_ADMIN"]);
const KWAN = S["ST-0045"].id, KIM = S["ST-0046"].id, NAT = S["ST-0030"].id, JAY = S["ST-0020"].id;
const BM = { JP1: JAY, JP2: S["ST-0021"].id, JP3: S["ST-0022"].id, JP4: S["ST-0023"].id };
/** พนักงานที่เป็นเจ้าของรายการของสาขา (JP1 = ขวัญ/คิม · สาขาอื่น = ผู้จัดการสาขา ข้อ 13.5) */
function ownerOf(bc, i) { return bc === "JP1" ? (i % 2 === 0 ? KWAN : KIM) : BM[bc]; }
function teamOf(bc, staffId) { return staffId && bc === "JP1" && (staffId === KWAN || staffId === KIM || staffId === NAT) ? TEAM["JP1-SALES"] : null; }

/* ---------------------------------------------------------------- ชื่อสำหรับข้อมูลเติม */
const FIRSTS = ["สมหญิง","วีระ","ณัฐวุฒิ","ปริญญา","อรทัย","ชัยวัฒน์","สุกัญญา","ธนากร","เบญจมาศ","กิตติ",
  "พรทิพย์","อนุชา","จันทิมา","ศราวุธ","นภาพร","ทศพล","วราภรณ์","ภาณุพงศ์","สุพรรษา","เอกชัย",
  "รุ่งนภา","ปิยะพงษ์","ดวงใจ","สมพงษ์","กนกวรรณ","จักรพันธ์","มาลี","ประเสริฐ","ศิริลักษณ์","วิชัย",
  "อารีย์","ธีระ","สุชาดา","นพดล","พิชญา","ชูเกียรติ","รัตนา","สุรชัย","ณัฐริกา","บุญมี"];
const LASTS = ["ใจดี","รักเรียน","ทองคำ","แสงทอง","ศรีทอง","พูนสุข","มั่งมี","บุญเรือง","วงศ์ทอง","สุขสันต์",
  "เจริญพร","ดีงาม","กล้าหาญ","ทรัพย์เย็น","พงษ์ไพร","อ่อนหวาน","ยิ่งยง","แก้วมณี","ชัยชนะ","สมบูรณ์",
  "พรหมมา","นาคทอง","สิงห์โต","จันทร์เพ็ญ","เพชรรัตน์","ภูผา","ธารทอง","วารีรัตน์","อินทรีย์","ขยันดี"];
let nameSeq = 0;
function fillerName() {
  const f = FIRSTS[nameSeq % FIRSTS.length];
  const l = LASTS[Math.floor(nameSeq / FIRSTS.length) % LASTS.length];
  nameSeq++;
  return [f, l];
}
let phoneSeq = 0;
/** เบอร์ข้อมูลเติมช่วง 080-000-0000 – 080-099-9999 (ข้อ 13.0 ข้อ 5) */
function fillerPhone() {
  const n = phoneSeq++; const a = Math.floor(n / 10000) % 100, b = n % 10000;
  return `080-${String(a).padStart(3, "0")}-${String(b).padStart(4, "0")}`;
}
const PROVINCES = ["TH-10", "TH-11", "TH-12", "TH-20", "TH-50", "TH-40", "TH-90", "TH-30", "TH-73", "TH-74"];
const ONLINE_CHANS = ["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK"];
const SOURCES = ["FACEBOOK_ADS", "FACEBOOK_PAGE", "TIKTOK", "INSTAGRAM", "LINE_OA", "GOOGLE_MAPS", "PASSING_BY", "REFERRAL", "EXISTING_CUSTOMER", "EVENT"];
const INTERESTS = ["BUY", "SELL", "TRADE_IN", "INSTALLMENT", "ACCESSORY", "REPAIR", "INQUIRY"];
const LEAD_INTERESTS = ["BUY", "SELL", "TRADE_IN", "INSTALLMENT", "ACCESSORY"];
const MODELS = ["iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro", "iPhone 16", "iPhone 15",
  "iPad Air", "iPad Pro", "MacBook Air", "Apple Watch Series 11", "AirPods Pro 3"];

/** แบ่งจำนวนเต็ม total ตามน้ำหนัก ด้วยวิธีเศษมากสุด (deterministic) */
function largestRemainder(total, weights) {
  const wsum = weights.reduce((a, x) => a + x, 0);
  if (wsum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, x) => a + x, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < order.length && left > 0; k++) { base[order[k][1]]++; left--; }
  return base;
}

/* ---------------------------------------------------------------- จำนวน opportunity ยุคเก่า (ข้อ 13.2/13.9) */
const OLD_OPP = {};
for (const c of BCODES) {
  const b = BR[c];
  OLD_OPP[c] = b.openOpp + b.Sp + b.LOp + b.S + b.LO - b.Op - b.O;
  assertTrue(OLD_OPP[c] >= 0, `opportunity ยุคเก่าของ ${c} ติดลบ (${OLD_OPP[c]})`);
  assertTrue(b.Sp + b.LOp >= OLD_OPP[c], `${c}: การปิดในช่วงก่อนหน้าน้อยกว่า opportunity ยุคเก่า`);
}

/* ---------------------------------------------------------------- รายชื่อลูกค้าที่ระบุชื่อ (ข้อ 13.7–13.14) */
/** key → {seq, year, first, last, branch, pool, chan, source, owner, province, note} */
const NAMED_CUST = {
  somchai:    { year: 2026, seq: 297,  first: "สมชาย",     last: "ใจดี",     branch: "JP1", pool: "Bold",  chan: "FACEBOOK", source: "FACEBOOK_PAGE", owner: "KWAN", province: "TH-10" },
  natthaporn: { year: 2026, seq: 2118, first: "ณัฐพร",     last: "สุขใจ",    branch: "JP1", pool: "inert", chan: "LINE",     source: "LINE_OA",       owner: "KIM",  province: "TH-10" },
  supawadee:  { year: 2026, seq: 3966, first: "สุภาวดี",   last: "ดีมาก",    branch: "JP1", pool: "Bold",  chan: "LINE",     source: "LINE_OA",       owner: "KIM",  province: "TH-10" },
  kittipong:  { year: 2026, seq: 4127, first: "กิตติพงษ์", last: "กล้าหาญ",  branch: "JP3", pool: "Bold",  chan: "FACEBOOK", source: "FACEBOOK_PAGE", owner: "BM",   province: "TH-50" },
  somchai2:   { year: 2026, seq: 4410, first: "สมชาย",     last: "ใจดี",     branch: "JP1", pool: "Bold",  chan: "LINE",     source: "REFERRAL",      owner: "KIM",  province: "TH-10" },
  woracheth:  { year: 2026, seq: 4877, first: "วรเชษฐ์",   last: "มั่นคง",   branch: "JP1", pool: "Bold",  chan: "LINE",     source: "LINE_OA",       owner: "KIM",  province: "TH-10" },
  pimchanok:  { year: 2026, seq: 5412, first: "พิมพ์ชนก",  last: "ศรีสุข",   branch: "JP1", pool: "Bprev", chan: "LINE",     source: "LINE_OA",       owner: "KWAN", province: "TH-10" },
  sunisa:     { year: 2026, seq: 5733, first: "สุนิสา",    last: "แก้วใส",   branch: "JP1", pool: "Bprev", chan: "FACEBOOK", source: "FACEBOOK_ADS",  owner: "KWAN", province: "TH-10" },
  onuma:      { year: 2026, seq: 5980, first: "อรอุมา",    last: "แสนดี",    branch: "JP1", pool: "Bprev", chan: "LINE",     source: "LINE_OA",       owner: "KWAN", province: "TH-10" },
  kamonchanok:{ year: 2026, seq: 6002, first: "กมลชนก",    last: "สายสุข",   branch: "JP1", pool: "Bprev", chan: "INSTAGRAM",source: "INSTAGRAM",     owner: "KWAN", province: "TH-10" },
  pakorn:     { year: 2026, seq: 6121, first: "ปกรณ์",     last: "ใจกว้าง",  branch: "JP1", pool: "A", idx: 78,  chan: "WALK_IN",  source: "PASSING_BY",   owner: "KIM",  province: "TH-10" },
  manop:      { year: 2026, seq: 6310, first: "มานพ",      last: "รักงาน",   branch: "JP1", pool: "A", idx: 267, chan: "WALK_IN",  source: "PASSING_BY",   owner: "KWAN", province: "TH-10" },
  siriporn:   { year: 2026, seq: 6455, first: "ศิริพร",    last: "พรมดี",    branch: "JP1", pool: "A", idx: 412, chan: "WALK_IN",  source: "PASSING_BY",   owner: "KIM",  province: "TH-10" },
  teerapat:   { year: 2026, seq: 6511, first: "ธีรภัทร",   last: "วงศ์ใหญ่", branch: "JP1", pool: "A", idx: 468, chan: "WALK_IN",  source: "PASSING_BY",   owner: "KWAN", province: "TH-10" },
  piyanut:    { year: 2026, seq: 6598, first: "ปิยะนุช",   last: "บุญมา",    branch: "JP1", pool: "A", idx: 555, chan: "LINE",     source: "LINE_OA",      owner: "KWAN", province: "TH-10" },
  natthapon:  { year: 2026, seq: 6633, first: "ณัฐพล",     last: "สุขใจ",    branch: "JP1", pool: "A", idx: 590, chan: "WALK_IN",  source: "REFERRAL",     owner: "KIM",  province: "TH-10" },
  weerayut:   { year: 2026, seq: 6702, first: "วีรยุทธ",   last: "ชัยมงคล",  branch: "JP1", pool: "A", idx: 659, chan: "LINE",     source: "LINE_OA",      owner: "KWAN", province: "TH-10" },
  thanapon:   { year: 2026, seq: 6774, first: "ธนพล",      last: "รุ่งเรือง",branch: "JP4", pool: "A", idx: 731, chan: "TIKTOK",   source: "TIKTOK",       owner: "BM",   province: "TH-73" },
  wilaiwan:   { year: 2026, seq: 6790, first: "วิไลวรรณ",  last: "สวยดี",    branch: "JP1", pool: "A", idx: 747, chan: "INSTAGRAM",source: "INSTAGRAM",    owner: "KIM",  province: "TH-10" },
  chanakan:   { year: 2026, seq: 6840, first: "ชนากานต์",  last: "ใจงาม",    branch: "JP1", pool: "A", idx: 797, chan: "WALK_IN",  source: "PASSING_BY",   owner: "KWAN", province: "TH-10" },
  natchaya:   { year: 2026, seq: 6851, first: "ณัฐชยา",    last: "มากมี",    branch: "JP2", pool: "A", idx: 808, chan: "WALK_IN",  source: "PASSING_BY",   owner: "BM",   province: "TH-20" },
  supakorn:   { year: 2026, seq: 6852, first: "ศุภกร",     last: "ทองแท้",   branch: "JP1", pool: "A", idx: 809, chan: "LINE",     source: "LINE_OA",      owner: "KIM",  province: "TH-10" },
  jiraporn:   { year: 2025, seq: 7321, first: "จิราพร",    last: "ทองดี",    branch: "JP1", pool: "import", chan: "LINE",  source: "LINE_OA",      owner: "KWAN", province: "TH-10" },
};

/* ---------------------------------------------------------------- ตารางลูกค้า */
const customers = [];                 // ทุกแถวของ crm.customers
const byNo = new Map();               // 'CUS-2026-000297' → customer
const namedCust = {};                 // key → customer
let custUid = 0;
function newCustomer(o) {
  const c = { id: uid(T.CUST, ++custUid), ...o };
  c.no = `CUS-${c.year}-${String(c.seq).padStart(6, "0")}`;
  c.status = c.status || "ACTIVE";
  c.createdVia = c.createdVia || (c.year === 2025 ? "IMPORT" : "QUICK_CAPTURE");
  customers.push(c); byNo.set(c.no, c);
  return c;
}
function resolveOwner(tag, bc) { return tag === "KWAN" ? KWAN : tag === "KIM" ? KIM : tag === "BM" ? BM[bc] : null; }

/* --- 1) ลูกค้าใหม่ใน P: CUS-2026-006044 … 006852 (809 ราย · ข้อ 13.0 ข้อ 3) --- */
const NEW_FIRST = 6044, NEW_LAST = 6852, NEW_N = NEW_LAST - NEW_FIRST + 1;
assertEq(NEW_N, 809, "13.0 จำนวนลูกค้าใหม่ใน P");
/* ตารางเวลาการสร้าง (anchor ตามลูกค้าที่ระบุชื่อ) */
const NEW_ANCHORS = [
  [1,   0.02],
  [590, posOf(21, 14, 0)],                      // CUS-2026-006633 คุณณัฐพล สร้าง 3 ก.ย. (ข้อ 13.14)
  [797, posOf(28, 10, 35)],                     // CUS-2026-006840 คุณชนากานต์ (กิจกรรมล่าสุด 10 ก.ย. 11:20)
  [808, posOf(28, 16, 0)],                      // CUS-2026-006851 คุณณัฐชยา
];
/** ตารางเวลาแบบ anchor: anchors = [[index, pos], …] · pos = วัน+เศษของวัน (map ลง 10:30–20:00) */
function interpSchedule(n, base, anchors) {
  const pos = new Array(n + 1);
  for (const [i, p] of anchors) pos[i] = p;
  for (let k = 0; k < anchors.length - 1; k++) {
    const [i0, p0] = anchors[k], [i1, p1] = anchors[k + 1];
    for (let i = i0 + 1; i < i1; i++) pos[i] = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
  }
  const t = new Array(n + 1);
  for (let i = 1; i <= n; i++) if (pos[i] !== undefined) t[i] = posTimeSafe(base, pos[i]);
  return t;
}
/** pos ของเวลาในวัน (ชั่วโมง:นาที) ภายในหน้าต่าง 10:30–20:00 */
function posOf(day, h, mi) { return day + (h * 3600 + mi * 60 - SAFE_START) / SAFE_SPAN; }
const newTimes = interpSchedule(NEW_N, P_START, NEW_ANCHORS);
newTimes[809] = ts(2026, 9, 11, 9, 50);         // CUS-2026-006852 ลูกค้า visit ออนไลน์รายการที่ 3 ของ JP1 วันนี้
assertTrue(newTimes[808] < newTimes[809], "ลำดับเวลาสร้างลูกค้าใหม่ 2 รายสุดท้าย");
/* สาขาของลูกค้าใหม่: กระจายแบบ deterministic ตามสัดส่วน NEW ของแต่ละสาขา */
const newBranchOf = new Array(NEW_N + 1);
{
  const want = BCODES.map((c) => BR[c].NEW);
  const got = [0, 0, 0, 0];
  for (let i = 1; i <= NEW_N; i++) {
    let best = 0, bestScore = -1;
    for (let b = 0; b < 4; b++) {
      if (got[b] >= want[b]) continue;
      const score = (want[b] - got[b]) / want[b];
      if (score > bestScore + 1e-12) { bestScore = score; best = b; }
    }
    newBranchOf[i] = BCODES[best]; got[best]++;
  }
  // บังคับสาขาของลูกค้าที่ระบุชื่อ แล้วสลับกับคนใกล้เคียงเพื่อคงจำนวนรายสาขา
  for (const [key, d] of Object.entries(NAMED_CUST)) {
    if (d.pool !== "A") continue;
    const i = d.idx;
    if (newBranchOf[i] === d.branch) continue;
    const from = newBranchOf[i];
    let swap = -1;
    for (let j = NEW_N; j >= 1; j--) if (newBranchOf[j] === d.branch && !Object.values(NAMED_CUST).some((x) => x.pool === "A" && x.idx === j)) { swap = j; break; }
    assertTrue(swap > 0, `หาคู่สลับสาขาให้ ${key} ไม่ได้`);
    newBranchOf[i] = d.branch; newBranchOf[swap] = from;
  }
  const chk = [0, 0, 0, 0];
  for (let i = 1; i <= NEW_N; i++) chk[BCODES.indexOf(newBranchOf[i])]++;
  for (let b = 0; b < 4; b++) assertEq(chk[b], want[b], `จำนวนลูกค้าใหม่ของ ${BCODES[b]}`);
}
/* ช่องทางแรกของลูกค้าใหม่ (ข้อ 13.3): WALK_IN ทั้งหมดเป็นลูกค้าใหม่ · ที่เหลือแบ่งตามสัดส่วน */
const CH_ORDER = ["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "PHONE"];
const newChanPool = {}, retChanPool = {};
for (const c of BCODES) {
  const b = BR[c];
  const onlineTotal = CH_ORDER.reduce((a, k) => a + b.chan[k], 0);
  assertEq(onlineTotal + b.chan.WALK_IN, b.U, `13.3 ผลรวมช่องทางของ ${c}`);
  const newOnline = b.NEW - b.chan.WALK_IN;
  assertTrue(newOnline >= 0, `${c}: ลูกค้าใหม่น้อยกว่าลูกค้าช่องทาง WALK_IN`);
  assertTrue(newOnline <= b.ONp + b.V, `${c}: ลูกค้าใหม่ช่องทางออนไลน์มากเกินไป`);
  const split = largestRemainder(newOnline, CH_ORDER.map((k) => b.chan[k]));
  const np = [], rp = [];
  for (let i = 0; i < CH_ORDER.length; i++) {
    for (let k = 0; k < split[i]; k++) np.push(CH_ORDER[i]);
    for (let k = 0; k < b.chan[CH_ORDER[i]] - split[i]; k++) rp.push(CH_ORDER[i]);
  }
  for (let k = 0; k < b.chan.WALK_IN; k++) np.push("WALK_IN");
  assertEq(np.length, b.NEW, `13.3 ช่องทางของลูกค้าใหม่ ${c}`);
  assertEq(rp.length, b.RET, `13.3 ช่องทางของลูกค้าเก่า ${c}`);
  newChanPool[c] = np; retChanPool[c] = rp;
}
/* สร้างแถวลูกค้าใหม่ */
const newCustIdx = new Array(NEW_N + 1);
{
  const namedByIdx = {};
  for (const [key, d] of Object.entries(NAMED_CUST)) if (d.pool === "A") namedByIdx[d.idx] = [key, d];
  const cursor = { JP1: 0, JP2: 0, JP3: 0, JP4: 0 };
  for (let i = 1; i <= NEW_N; i++) {
    const bc = newBranchOf[i];
    const seq = NEW_FIRST + i - 1;
    const nk = namedByIdx[i];
    let chan;
    if (nk) {
      chan = nk[1].chan;
      const p = newChanPool[bc], at = p.indexOf(chan);
      assertTrue(at >= 0, `ช่องทาง ${chan} ของ ${nk[0]} ไม่มีเหลือในสาขา ${bc}`);
      p.splice(at, 1);
    }
    const c = newCustomer({
      year: 2026, seq, branch: bc, pool: "A", named: nk ? nk[0] : null,
      first: nk ? nk[1].first : null, last: nk ? nk[1].last : null,
      chan: chan || null, source: nk ? nk[1].source : null,
      province: nk ? nk[1].province : null, ownerTag: nk ? nk[1].owner : (bc === "JP1" ? "KIM" : "BM"),
      created: newTimes[i], firstSeen: newTimes[i],
    });
    newCustIdx[i] = c;
    if (nk) namedCust[nk[0]] = c;
    cursor[bc]++;
  }
  // แจกช่องทางที่เหลือให้ลูกค้าใหม่ที่ยังไม่มี (ตามลำดับคงที่)
  for (let i = 1; i <= NEW_N; i++) {
    const c = newCustIdx[i];
    if (c.chan) continue;
    c.chan = newChanPool[c.branch].shift();
    c.source = c.chan === "WALK_IN" ? "PASSING_BY" : c.chan === "PHONE" ? "REFERRAL"
      : c.chan === "LINE" ? "LINE_OA" : c.chan === "FACEBOOK" ? "FACEBOOK_PAGE"
      : c.chan === "INSTAGRAM" ? "INSTAGRAM" : "TIKTOK";
  }
  for (const c of BCODES) assertEq(newChanPool[c].length, 0, `ช่องทางลูกค้าใหม่ของ ${c} เหลือค้าง`);
}

/* --- 2) ลูกค้าที่สร้างในช่วงก่อนหน้า: CUS-2026-005042 … 006043 (1,002 ราย) --- */
const POOL = {};   // branch → { Bold:[], Bprev:[], Cold:[], Cprev:[] }
for (const c of BCODES) POOL[c] = { Bold: [], Bprev: [], Cold: [], Cprev: [] };
const namedBold = {};
for (const [k, d] of Object.entries(NAMED_CUST)) if (d.pool === "Bold") (namedBold[d.branch] ||= []).push([k, d]);

const PREV_FIRST = 5042, PREV_LAST = 6043, PREV_N = PREV_LAST - PREV_FIRST + 1;
const OLD_FIRST = 4903, OLD_LAST = 5041, OLD_N = OLD_LAST - OLD_FIRST + 1;
const INERT26_LAST = 4902;
{
  const bPrevWant = {}, cPrevWant = {}, cOldWant = {};
  let totPrev = 0, totOld = 0;
  for (const c of BCODES) {
    const b = BR[c];
    const bold = (namedBold[c] || []).length;
    bPrevWant[c] = b.RET - bold;
    cOldWant[c] = OLD_OPP[c];
    cPrevWant[c] = b.Up - b.RET - cOldWant[c];
    assertTrue(cPrevWant[c] >= 0, `${c}: ลูกค้าช่วงก่อนหน้าไม่พอ (${cPrevWant[c]})`);
    totPrev += bPrevWant[c] + cPrevWant[c]; totOld += cOldWant[c];
  }
  assertEq(totPrev, PREV_N, "จำนวนลูกค้าที่สร้างในช่วงก่อนหน้า");
  assertEq(totOld, OLD_N, "จำนวนลูกค้ายุคเก่า (ก่อน 14 ก.ค.)");

  /* ลำดับสาขาของบล็อก prev (ถ่วงน้ำหนัก) แล้วบังคับ index ของลูกค้าที่ระบุชื่อ */
  const slots = new Array(PREV_N + 1);
  {
    const want = BCODES.map((c) => bPrevWant[c] + cPrevWant[c]);
    const got = [0, 0, 0, 0];
    for (let i = 1; i <= PREV_N; i++) {
      let best = 0, bestScore = -1;
      for (let b = 0; b < 4; b++) {
        if (got[b] >= want[b]) continue;
        const sc = (want[b] - got[b]) / want[b];
        if (sc > bestScore + 1e-12) { bestScore = sc; best = b; }
      }
      slots[i] = BCODES[best]; got[best]++;
    }
    const forced = Object.entries(NAMED_CUST).filter(([, d]) => d.pool === "Bprev");
    const forcedIdx = new Set(forced.map(([, d]) => d.seq - PREV_FIRST + 1));
    for (const [key, d] of forced) {
      const i = d.seq - PREV_FIRST + 1;
      if (slots[i] === d.branch) continue;
      const from = slots[i];
      let swap = -1;
      for (let j = PREV_N; j >= 1; j--) if (slots[j] === d.branch && !forcedIdx.has(j)) { swap = j; break; }
      assertTrue(swap > 0, `หาคู่สลับสาขาให้ ${key} ไม่ได้`);
      slots[i] = d.branch; slots[swap] = from;
    }
    const chk = [0, 0, 0, 0];
    for (let i = 1; i <= PREV_N; i++) chk[BCODES.indexOf(slots[i])]++;
    for (let b = 0; b < 4; b++) assertEq(chk[b], want[b], `จำนวนลูกค้าบล็อก prev ของ ${BCODES[b]}`);
  }
  const prevTimes = interpSchedule(PREV_N, PREV_START, [[1, 0.02], [PREV_N, 29.9]]);
  const namedPrevByIdx = {};
  for (const [k, d] of Object.entries(NAMED_CUST)) if (d.pool === "Bprev") namedPrevByIdx[d.seq - PREV_FIRST + 1] = [k, d];
  /* B ก่อน C ในแต่ละสาขา (ลูกค้าที่ระบุชื่อถูกจองเป็น B ไว้ก่อน) */
  const bLeft = { ...bPrevWant };
  for (const [, d] of Object.entries(NAMED_CUST)) if (d.pool === "Bprev") bLeft[d.branch]--;
  for (const c of BCODES) assertTrue(bLeft[c] >= 0, `โควตา Bprev ของ ${c} ไม่พอสำหรับลูกค้าที่ระบุชื่อ`);
  for (let i = 1; i <= PREV_N; i++) {
    const bc = slots[i], seq = PREV_FIRST + i - 1;
    const nk = namedPrevByIdx[i];
    const isB = nk ? true : bLeft[bc] > 0;
    if (isB && !nk) bLeft[bc]--;
    const c = newCustomer({
      year: 2026, seq, branch: bc, pool: isB ? "Bprev" : "Cprev", named: nk ? nk[0] : null,
      first: nk ? nk[1].first : null, last: nk ? nk[1].last : null,
      chan: nk ? nk[1].chan : null, source: nk ? nk[1].source : null,
      province: nk ? nk[1].province : null, ownerTag: nk ? nk[1].owner : (bc === "JP1" ? "KIM" : "BM"),
      created: prevTimes[i], firstSeen: prevTimes[i],
    });
    if (nk) namedCust[nk[0]] = c;
    POOL[bc][isB ? "Bprev" : "Cprev"].push(c);
  }
  for (const c of BCODES) {
    assertEq(POOL[c].Bprev.length, bPrevWant[c], `จำนวน Bprev ของ ${c}`);
    assertEq(POOL[c].Cprev.length, cPrevWant[c], `จำนวน Cprev ของ ${c}`);
  }

  /* --- 3) ลูกค้ายุคเก่า (opportunity ค้างจากก่อน 14 ก.ค.): CUS-2026-004903 … 005041 --- */
  const oldSlots = [];
  for (const c of BCODES) for (let k = 0; k < cOldWant[c]; k++) oldSlots.push(c);
  oldSlots.sort((a, b) => BCODES.indexOf(a) - BCODES.indexOf(b));
  const oldTimes = interpSchedule(OLD_N, ts(2026, 7, 8), [[1, 0.0], [OLD_N, 5.9]]);
  for (let i = 1; i <= OLD_N; i++) {
    const bc = oldSlots[(i - 1) * 1 % oldSlots.length];
    const c = newCustomer({
      year: 2026, seq: OLD_FIRST + i - 1, branch: bc, pool: "Cold",
      chan: ONLINE_CHANS[i % ONLINE_CHANS.length], source: SOURCES[i % SOURCES.length],
      ownerTag: bc === "JP1" ? "KIM" : "BM", created: oldTimes[i], firstSeen: oldTimes[i],
    });
    POOL[bc].Cold.push(c);
  }
  for (const c of BCODES) assertEq(POOL[c].Cold.length, cOldWant[c], `จำนวน Cold ของ ${c}`);
}

/* --- 4) ลูกค้า 2026 ที่เหลือ (inert) + ลูกค้าที่ระบุชื่อที่มีเลขต่ำ --- */
const MERGED_SEQ = [];   // เลขของลูกค้าที่ถูกรวม 16 ราย (ข้อ 13.0 ข้อ 3)
const DUP_CAND_SEQ = []; // ลูกค้าคู่เทียบของ DUPLICATE_SUSPECTED 16 ราย
{
  const inertTimes = interpSchedule(INERT26_LAST, ts(2026, 1, 1),
    [[1, 0.0], [297, posOf(10, 13, 15)], [INERT26_LAST, 187.9]]);
  const namedBySeq = {};
  for (const [k, d] of Object.entries(NAMED_CUST)) if (d.year === 2026 && d.seq <= INERT26_LAST) namedBySeq[d.seq] = [k, d];
  /* เลือกเลขของ MERGED 16 ราย และคู่เทียบ duplicate 16 ราย (ต้องไม่ชนกับที่ระบุชื่อ) */
  for (let k = 0; k < 16; k++) MERGED_SEQ.push(1200 + k * 37);
  DUP_CAND_SEQ.push(2118);                                  // คุณณัฐพร สุขใจ (ข้อ 13.14)
  for (let k = 0; k < 15; k++) DUP_CAND_SEQ.push(2300 + k * 41);
  const mergedSet = new Set(MERGED_SEQ), dupSet = new Set(DUP_CAND_SEQ);
  for (const s of MERGED_SEQ) assertTrue(!namedBySeq[s], `เลข MERGED ${s} ชนกับลูกค้าที่ระบุชื่อ`);
  for (const s of DUP_CAND_SEQ) assertTrue(s === 2118 || !namedBySeq[s], `เลขคู่ซ้ำ ${s} ชนกับลูกค้าที่ระบุชื่อ`);

  /* สาขาของคู่เทียบ duplicate = สาขาของลูกค้าใหม่ที่ถูกตั้งข้อสงสัย (กำหนดภายหลัง) — ที่นี่ตั้งค่าเริ่มต้น */
  const dupBranchPlan = [];
  for (const c of BCODES) for (let k = 0; k < BR[c].dq.DUP; k++) dupBranchPlan.push(c);
  assertEq(dupBranchPlan.length, 16, "13.12 แผนสาขาของ DUPLICATE_SUSPECTED");

  let dupI = 0;
  for (let seq = 1; seq <= INERT26_LAST; seq++) {
    const nk = namedBySeq[seq];
    const isDup = dupSet.has(seq);
    let bc, chan, source, first, last, prov, ownerTag, pool = "inert";
    if (nk) {
      bc = nk[1].branch; chan = nk[1].chan; source = nk[1].source; first = nk[1].first; last = nk[1].last;
      prov = nk[1].province; ownerTag = nk[1].owner; pool = nk[1].pool;
    } else {
      bc = BCODES[seq % 4];
      chan = ONLINE_CHANS[seq % ONLINE_CHANS.length];
      source = SOURCES[seq % SOURCES.length];
      [first, last] = fillerName();
      prov = PROVINCES[seq % PROVINCES.length];
      ownerTag = bc === "JP1" ? "KIM" : "BM";
    }
    if (isDup && !nk) { bc = dupBranchPlan[dupI]; ownerTag = bc === "JP1" ? "KIM" : "BM"; }
    if (isDup) dupI++;
    const merged = mergedSet.has(seq);
    const c = newCustomer({
      year: 2026, seq, branch: bc, pool, named: nk ? nk[0] : null, first, last,
      chan, source, province: prov, ownerTag,
      created: inertTimes[seq], firstSeen: inertTimes[seq],
      status: merged ? "MERGED" : "ACTIVE", dupCandidate: isDup,
    });
    if (nk) { namedCust[nk[0]] = c; if (nk[1].pool === "Bold") POOL[bc].Bold.push(c); }
  }
  /* survivor ของลูกค้าที่ถูกรวม */
  const survivors = MERGED_SEQ.map((s) => byNo.get(`CUS-2026-${String(s + 5).padStart(6, "0")}`));
  MERGED_SEQ.forEach((s, i) => {
    const m = byNo.get(`CUS-2026-${String(s).padStart(6, "0")}`);
    const surv = survivors[i];
    assertTrue(surv && surv.status === "ACTIVE", `หา survivor ของ ${m.no} ไม่ได้`);
    m.mergedInto = surv.id; m.mergedIntoNo = surv.no; surv.createdVia = "MERGE_SURVIVOR";
  });
  for (const c of BCODES) assertEq(POOL[c].Bold.length, (namedBold[c] || []).length, `จำนวน Bold ของ ${c}`);
}

/* --- 5) ลูกค้านำเข้าก่อนปี 2026: CUS-2025-000001 … 008126 --- */
const IMPORT_N = 8126;
const dqCust = { MISSING_PHONE: [], INVALID_PHONE: [], INCOMPLETE_CUSTOMER: [] };
{
  const importTimes = interpSchedule(IMPORT_N, ts(2025, 1, 2), [[1, 0.0], [IMPORT_N, 361.9]]);
  /* จองเลขให้รายการคุณภาพข้อมูล (ข้อ 13.12) */
  const plan = new Map();   // seq → {kind, branch}
  let s = 101;
  for (const c of BCODES) for (let k = 0; k < BR[c].dq.MISSING_PHONE; k++) { plan.set(s, { kind: "MISS", branch: c, alsoIncomplete: k === 0 }); s += 7; }
  s = 1501;
  for (const c of BCODES) for (let k = 0; k < BR[c].dq.INCOMPLETE_CUSTOMER - 1; k++) { plan.set(s, { kind: "INC", branch: c }); s += 11; }
  s = 3001;
  for (const c of BCODES) for (let k = 0; k < BR[c].dq.INVALID_PHONE; k++) { plan.set(s, { kind: "INV", branch: c }); s += 13; }
  assertTrue(!plan.has(7321), "เลขคุณภาพข้อมูลชนกับคุณจิราพร");

  for (let seq = 1; seq <= IMPORT_N; seq++) {
    const p = plan.get(seq);
    const nk = seq === 7321 ? ["jiraporn", NAMED_CUST.jiraporn] : null;
    let bc, chan, first, last, prov;
    if (nk) { bc = nk[1].branch; chan = nk[1].chan; first = nk[1].first; last = nk[1].last; prov = nk[1].province; }
    else if (p) {
      bc = p.branch;
      chan = p.kind === "MISS" ? "WALK_IN" : ONLINE_CHANS[seq % ONLINE_CHANS.length];
      const inc = p.kind === "INC" || (p.kind === "MISS" && p.alsoIncomplete);
      [first, last] = fillerName();
      if (inc) { last = null; prov = null; } else prov = PROVINCES[seq % PROVINCES.length];
    } else {
      bc = BCODES[(seq + 1) % 4];
      chan = ONLINE_CHANS[seq % ONLINE_CHANS.length];
      [first, last] = fillerName();
      prov = PROVINCES[seq % PROVINCES.length];
    }
    const c = newCustomer({
      year: 2025, seq, branch: bc, pool: nk ? "import-named" : "import", named: nk ? nk[0] : null,
      first, last, chan, source: chan === "WALK_IN" ? "PASSING_BY" : SOURCES[seq % SOURCES.length],
      province: prov, ownerTag: nk ? nk[1].owner : (bc === "JP1" ? "KIM" : "BM"),
      created: importTimes[seq], firstSeen: importTimes[seq], createdVia: "IMPORT",
    });
    if (nk) namedCust[nk[0]] = c;
    if (p) {
      if (p.kind === "MISS") { dqCust.MISSING_PHONE.push(c); if (p.alsoIncomplete) dqCust.INCOMPLETE_CUSTOMER.push(c); }
      if (p.kind === "INC") dqCust.INCOMPLETE_CUSTOMER.push(c);
      if (p.kind === "INV") dqCust.INVALID_PHONE.push(c);
    }
  }
  assertEq(dqCust.MISSING_PHONE.length, 23, "13.12 MISSING_PHONE");
  assertEq(dqCust.INCOMPLETE_CUSTOMER.length, 42, "13.12 INCOMPLETE_CUSTOMER");
  assertEq(dqCust.INVALID_PHONE.length, 6, "13.12 INVALID_PHONE");
}
assertEq(customers.length, 6852 + 8126, "จำนวนแถว crm.customers");
assertEq(customers.filter((c) => c.status === "ACTIVE").length, 14962, "13.0 ลูกค้า ACTIVE");
assertEq(customers.filter((c) => c.status === "MERGED").length, 16, "13.0 ลูกค้า MERGED");

/* ---------------------------------------------------------------- ชุดลูกค้าต่อสาขา/ช่วง */
const curSet = {}, prevSet = {};
for (const c of BCODES) { curSet[c] = []; prevSet[c] = []; }
for (const c of customers) {
  if (c.pool === "A") curSet[c.branch].push(c);
  else if (c.pool === "Bold" || c.pool === "Bprev") { curSet[c.branch].push(c); prevSet[c.branch].push(c); }
  else if (c.pool === "Cold" || c.pool === "Cprev") prevSet[c.branch].push(c);
}
for (const c of BCODES) {
  assertEq(curSet[c].length, BR[c].U, `ชุดลูกค้าใน P ของ ${c}`);
  assertEq(prevSet[c].length, BR[c].Up, `ชุดลูกค้าช่วงก่อนหน้าของ ${c}`);
}
/* ช่องทางแรกของลูกค้าเก่าที่กลับมาใน P (ข้อ 13.3) */
for (const bc of BCODES) {
  const pool = retChanPool[bc].slice();
  const rets = curSet[bc].filter((c) => c.pool === "Bold" || c.pool === "Bprev");
  for (const c of rets) if (c.chan) { const i = pool.indexOf(c.chan); assertTrue(i >= 0, `ช่องทาง ${c.chan} ของ ${c.no} ไม่มีในโควตาสาขา ${bc}`); pool.splice(i, 1); }
  for (const c of rets) if (!c.chan) { c.chan = pool.shift(); c.source = c.chan === "PHONE" ? "REFERRAL" : c.chan === "LINE" ? "LINE_OA" : c.chan === "FACEBOOK" ? "FACEBOOK_PAGE" : c.chan === "INSTAGRAM" ? "INSTAGRAM" : "TIKTOK"; }
  assertEq(pool.length, 0, `โควตาช่องทางลูกค้าเก่าของ ${bc} เหลือค้าง`);
  const tally = {};
  for (const c of curSet[bc]) tally[c.chan] = (tally[c.chan] || 0) + 1;
  for (const [k, v] of Object.entries(BR[bc].chan)) assertEq(tally[k] || 0, v, `13.3 ${bc} ช่องทาง ${k}`);
}
/* ลูกค้าที่ไม่มีช่องทาง (Cprev/Cold) กำหนดภายหลังจาก visit แรก */

/* ---------------------------------------------------------------- visit + interaction */
const visits = [];
const interactions = [];
let visitUid = 0, interUid = 0;
const OUTCOMES_ANON = ["SERVICE_DONE", "NOT_YET", "NOT_INTERESTED", "SERVICE_DONE", "LEFT_BEFORE_SERVICE"];
const OUTCOMES_ID = ["SERVICE_DONE", "FOLLOW_UP", "NOT_YET", "SERVICE_DONE", "FOLLOW_UP", "NOT_INTERESTED"];
function addVisit(o) {
  const v = { id: uid(T.VISIT, ++visitUid), ...o };
  v.party = v.party || 1;
  visits.push(v); return v;
}
function addInteraction(o) { const i = { id: uid(T.INTER, ++interUid), ...o }; interactions.push(i); return i; }

/* --- 1) วันนี้ 11 ก.ย. (ข้อ 13.11) --- */
const todayCust = {};      // branch → รายชื่อลูกค้าที่มีกิจกรรมวันนี้
const namedToday = {};
{
  /* เลือกลูกค้าเพิ่มสำหรับกิจกรรมวันนี้จากชุดของสาขา (ไม่ทับกับลูกค้าที่ระบุชื่อ) */
  const used = new Set(Object.values(namedCust).map((c) => c.id));
  const pickFrom = (bc, n) => {
    const res = [];
    for (const c of curSet[bc]) {
      if (res.length >= n) break;
      if (used.has(c.id) || c.pool === "A") continue;      // ใช้ลูกค้าเก่าเพื่อไม่กระทบลำดับเลขลูกค้าใหม่
      used.add(c.id); res.push(c);
    }
    assertEq(res.length, n, `เลือกลูกค้าวันนี้ของ ${bc}`);
    return res;
  };
  /* JP1: คิว 001 (IN_SERVICE) + คิว 002–004 (WAITING · ไม่ระบุตัวตน) + ออนไลน์ 3 (ศุภกร · วิไลวรรณ · สมชาย) + OUTBOUND 3 ราย */
  const jp1extra = pickFrom("JP1", 4);   // ลูกค้าคิว 001 + OUTBOUND 3 ราย
  const q1 = jp1extra[0], outs = jp1extra.slice(1);
  namedToday.queue1 = q1; namedToday.outbound = outs;
  q1.ownerTag = "KIM"; outs.forEach((c) => (c.ownerTag = "KIM"));
  addVisit({ branch: "JP1", cust: q1, t: ts(2026, 9, 11, 10, 5), chan: "WALK_IN", status: "IN_SERVICE",
             outcome: null, owner: KWAN, interest: "BUY", walkin: true, queueSlot: 1 });
  addVisit({ branch: "JP1", cust: null, t: ts(2026, 9, 11, 10, 12), chan: "WALK_IN", status: "WAITING",
             outcome: null, owner: null, interest: "TRADE_IN", walkin: true, queueSlot: 2 });
  addVisit({ branch: "JP1", cust: null, t: ts(2026, 9, 11, 10, 18), chan: "WALK_IN", status: "WAITING",
             outcome: null, owner: null, interest: "REPAIR", walkin: true, queueSlot: 3 });
  addVisit({ branch: "JP1", cust: null, t: ts(2026, 9, 11, 10, 21), chan: "WALK_IN", status: "WAITING",
             outcome: null, owner: null, interest: "INQUIRY", walkin: true, queueSlot: 4 });
  addVisit({ branch: "JP1", cust: namedCust.supakorn, t: ts(2026, 9, 11, 9, 50), chan: "LINE", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 10, 2), owner: KIM, interest: "BUY" });
  addVisit({ branch: "JP1", cust: namedCust.wilaiwan, t: ts(2026, 9, 11, 10, 11), chan: "INSTAGRAM", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 10, 20), owner: KIM, interest: "BUY" });
  addVisit({ branch: "JP1", cust: namedCust.somchai, t: ts(2026, 9, 11, 10, 24), chan: "LINE", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 10, 24), owner: KWAN, interest: "INSTALLMENT",
             summary: "สอบถาม iPhone 17 Pro และเงื่อนไขผ่อน", itype: "INQUIRY", fixedNo: "V-JP1-260911-007" });
  outs.forEach((c, i) => addInteraction({ branch: "JP1", cust: c, visit: null, root: false, chan: "PHONE",
    dir: "OUTBOUND", itype: "CALL", t: ts(2026, 9, 11, 9, 30 + i * 5), owner: KIM, summary: "โทรติดตามลูกค้า" }));

  /* JP2: walk-in 2 (ณัฐชยา 10:20 + 1 ราย) · ออนไลน์ 2 · ระบุตัวตนครบ 4 */
  const jp2extra = pickFrom("JP2", 3);
  addVisit({ branch: "JP2", cust: namedCust.natchaya, t: ts(2026, 9, 11, 10, 20), chan: "WALK_IN", status: "COMPLETED",
             outcome: "FOLLOW_UP", end: ts(2026, 9, 11, 10, 22), owner: BM.JP2, interest: "BUY", walkin: true, queueSlot: 2 });
  addVisit({ branch: "JP2", cust: jp2extra[0], t: ts(2026, 9, 11, 9, 20), chan: "WALK_IN", status: "COMPLETED",
             outcome: "SERVICE_DONE", end: ts(2026, 9, 11, 9, 55), owner: BM.JP2, interest: "REPAIR", walkin: true, queueSlot: 1 });
  addVisit({ branch: "JP2", cust: jp2extra[1], t: ts(2026, 9, 11, 9, 35), chan: "LINE", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 9, 50), owner: BM.JP2, interest: "BUY" });
  addVisit({ branch: "JP2", cust: jp2extra[2], t: ts(2026, 9, 11, 9, 45), chan: "FACEBOOK", status: "COMPLETED",
             outcome: "SERVICE_DONE", end: ts(2026, 9, 11, 10, 0), owner: BM.JP2, interest: "INQUIRY" });

  /* JP3: walk-in 2 · ออนไลน์ 2 · ระบุตัวตน 3 (กิตติพงษ์ Facebook 10:16) */
  const jp3extra = pickFrom("JP3", 2);
  addVisit({ branch: "JP3", cust: namedCust.kittipong, t: ts(2026, 9, 11, 10, 16), chan: "FACEBOOK", status: "COMPLETED",
             outcome: "FOLLOW_UP", end: ts(2026, 9, 11, 10, 22), owner: BM.JP3, interest: "BUY" });
  addVisit({ branch: "JP3", cust: jp3extra[0], t: ts(2026, 9, 11, 9, 15), chan: "WALK_IN", status: "COMPLETED",
             outcome: "SERVICE_DONE", end: ts(2026, 9, 11, 9, 40), owner: BM.JP3, interest: "REPAIR", walkin: true, queueSlot: 1 });
  addVisit({ branch: "JP3", cust: null, t: ts(2026, 9, 11, 9, 55), chan: "WALK_IN", status: "COMPLETED",
             outcome: "SERVICE_DONE", end: ts(2026, 9, 11, 10, 10), owner: BM.JP3, interest: "INQUIRY", walkin: true, queueSlot: 2 });
  addVisit({ branch: "JP3", cust: jp3extra[1], t: ts(2026, 9, 11, 9, 5), chan: "LINE", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 9, 30), owner: BM.JP3, interest: "BUY" });

  /* JP4: walk-in 1 · ออนไลน์ 1 (ธนพล TikTok 10:06) · ระบุตัวตน 2 */
  const jp4extra = pickFrom("JP4", 1);
  addVisit({ branch: "JP4", cust: namedCust.thanapon, t: ts(2026, 9, 11, 10, 6), chan: "TIKTOK", status: "COMPLETED",
             outcome: "NOT_YET", end: ts(2026, 9, 11, 10, 15), owner: BM.JP4, interest: "BUY" });
  addVisit({ branch: "JP4", cust: jp4extra[0], t: ts(2026, 9, 11, 9, 25), chan: "WALK_IN", status: "COMPLETED",
             outcome: "SERVICE_DONE", end: ts(2026, 9, 11, 9, 50), owner: BM.JP4, interest: "REPAIR", walkin: true, queueSlot: 1 });

  todayCust.JP1 = [q1, ...outs, namedCust.supakorn, namedCust.wilaiwan, namedCust.somchai];
  todayCust.JP2 = [namedCust.natchaya, ...jp2extra];
  todayCust.JP3 = [namedCust.kittipong, ...jp3extra];
  todayCust.JP4 = [namedCust.thanapon, ...jp4extra];
  for (const c of BCODES) assertEq(new Set(todayCust[c].map((x) => x.id)).size, BR[c].today.unique, `13.11 ลูกค้าไม่ซ้ำวันนี้ ${c}`);
  for (const c of BCODES) {
    const tv = visits.filter((v) => v.branch === c && v.t >= TODAY0);
    assertEq(tv.length, BR[c].today.visits, `13.11 VISITS วันนี้ ${c}`);
    assertEq(tv.filter((v) => v.walkin).length, BR[c].today.walkin, `13.11 Walk-in วันนี้ ${c}`);
    assertEq(tv.filter((v) => v.cust).length, BR[c].today.identified, `13.11 Identified วันนี้ ${c}`);
    assertEq(tv.filter((v) => v.status === "WAITING" || v.status === "IN_SERVICE").length, BR[c].today.open, `13.11 visit เปิดอยู่ ${c}`);
  }
}

/* --- 2) visit ของลูกค้าที่ระบุชื่อ (นอกเหนือจากวันนี้) --- */
const explicitP = new Map(), explicitPrev = new Map();
function planP(cust, list) { explicitP.set(cust.id, (explicitP.get(cust.id) || []).concat(list)); }
function planPrev(cust, list) { explicitPrev.set(cust.id, (explicitPrev.get(cust.id) || []).concat(list)); }
/* ลูกค้าที่มี visit วันนี้แล้ว นับ visit วันนี้เป็นส่วนหนึ่งของแผน */
for (const bc of BCODES) for (const v of visits.filter((x) => x.branch === bc && x.cust)) planP(v.cust, []);
/* คุณสมชาย ใจดี (ข้อ 13.7) */
{
  const c = namedCust.somchai;
  addVisit({ branch: "JP1", cust: c, t: ts(2026, 1, 11, 13, 15), chan: "FACEBOOK", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 1, 11, 13, 45), owner: KWAN, interest: "BUY", itype: "INQUIRY", summary: "สอบถามราคา iPhone 15" });
  addVisit({ branch: "JP1", cust: c, t: ts(2026, 1, 20, 15, 30), chan: "WALK_IN", status: "COMPLETED", outcome: "PURCHASED",
             end: ts(2026, 1, 20, 16, 30), owner: KWAN, interest: "BUY", walkin: true, itype: "PURCHASE", summary: "ปิดการขาย iPhone 15 128GB" });
  addVisit({ branch: "JP1", cust: c, t: ts(2026, 8, 12, 19, 40), chan: "LINE", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 8, 12, 20, 10), owner: KWAN, interest: "BUY", itype: "INQUIRY", summary: "สอบถามราคา iPhone 16" });
  addVisit({ branch: "JP1", cust: c, t: ts(2026, 8, 15, 11, 5), chan: "WALK_IN", status: "COMPLETED", outcome: "PURCHASED",
             end: ts(2026, 8, 15, 12, 0), owner: KWAN, interest: "BUY", walkin: true, itype: "PURCHASE", summary: "ปิดการขาย iPhone 16 128GB ฿28,900" });
  addVisit({ branch: "JP1", cust: c, t: ts(2026, 9, 8, 16, 10), chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 9, 8, 17, 0), owner: KWAN, interest: "BUY", walkin: true, itype: "VISIT",
             summary: "ทดลองเครื่อง / สนใจผ่อน", fixedNo: "V-JP1-260908-017" });
  addInteraction({ branch: "JP1", cust: c, visit: null, root: false, chan: "LINE", dir: "OUTBOUND",
                   itype: "QUOTATION_SENT", t: ts(2026, 9, 1, 14, 22), owner: KWAN, summary: "ส่งใบเสนอราคา QT-2026-001702" });
  planP(c, []); planPrev(c, []);
}

/* --- 3) visit เพิ่มเติมของลูกค้าที่ระบุชื่อ (ข้อ 13.5 · 13.8 · 13.10) --- */
{
  const c1 = namedCust.wilaiwan;           // กิจกรรมแรก = วันที่สร้าง (เลขลูกค้า 006790)
  addVisit({ branch: "JP1", cust: c1, t: c1.created, chan: "INSTAGRAM", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: c1.created + 1800, owner: KIM, interest: "BUY" });
  const c2 = namedCust.natchaya;
  addVisit({ branch: "JP2", cust: c2, t: c2.created, chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: c2.created + 2400, owner: BM.JP2, interest: "BUY", walkin: true });
  const c3 = namedCust.thanapon;
  addVisit({ branch: "JP4", cust: c3, t: c3.created, chan: "TIKTOK", status: "COMPLETED", outcome: "NOT_YET",
             end: c3.created + 1200, owner: BM.JP4, interest: "BUY" });
  const pc = namedCust.pimchanok;          // กิจกรรมล่าสุด 10 ก.ย. 14:05 (ข้อ 13.5)
  addVisit({ branch: "JP1", cust: pc, t: ts(2026, 8, 20, 14, 0), chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 8, 20, 15, 0), owner: KWAN, interest: "BUY", walkin: true });
  addVisit({ branch: "JP1", cust: pc, t: ts(2026, 9, 10, 14, 5), chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 9, 10, 15, 0), owner: KWAN, interest: "INSTALLMENT", walkin: true });
  const ck = namedCust.chanakan;           // กิจกรรมล่าสุด 10 ก.ย. 11:20
  addVisit({ branch: "JP1", cust: ck, t: ck.created, chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ck.created + 1500, owner: KWAN, interest: "BUY", walkin: true });
  addVisit({ branch: "JP1", cust: ck, t: ts(2026, 9, 10, 11, 20), chan: "WALK_IN", status: "COMPLETED", outcome: "FOLLOW_UP",
             end: ts(2026, 9, 10, 12, 0), owner: KWAN, interest: "BUY", walkin: true });
  for (const c of [c1, c2, c3, pc, ck]) planP(c, []);
  planPrev(namedCust.somchai, []);
  /* เพดานเวลากิจกรรมของลูกค้าที่คุณขวัญดูแล (ข้อ 13.5 รายชื่อ 5 อันดับ) */
  for (const k of ["sunisa", "kamonchanok", "teerapat", "weerayut", "piyanut", "onuma"]) namedCust[k].maxDay = 26;
  namedCust.manop.maxDay = 27;
  /* ลูกค้าที่คุณขวัญดูแล — กิจกรรมล่าสุดถูกตรึงในข้อ 13.5 จึงไม่ให้ข้อมูลเติมแตะ */
  for (const k of ["somchai", "jiraporn", "pimchanok", "sunisa", "kamonchanok", "manop", "onuma",
                   "teerapat", "chanakan", "weerayut", "piyanut"]) namedCust[k].reserved = true;
  namedCust.pimchanok.maxT = ts(2026, 9, 10, 14, 5);
}

/* --- 4) visit ทั่วไป --- */
function genericVisits(bc, isP) {
  const b = BR[bc];
  const base = isP ? P_START : PREV_START;
  const lo = isP ? P_START : PREV_START, hi = isP ? P_END : PREV_END;
  const lastDay = isP ? 28 : 29;
  const all = isP ? curSet[bc] : prevSet[bc];
  const ex = isP ? explicitP : explicitPrev;
  const fixed = visits.filter((v) => v.branch === bc && v.t >= lo && v.t < hi);
  const Vt = (isP ? b.V : b.Vp) - fixed.length;
  const IDNt = (isP ? b.IDN : b.IDNp) - fixed.filter((v) => v.cust).length;
  const ONLt = (isP ? b.V - b.W : b.ONp) - fixed.filter((v) => v.chan !== "WALK_IN").length;
  const ANONt = Vt - IDNt;
  const g = all.filter((c) => !ex.has(c.id));
  assertTrue(Vt >= 0 && IDNt >= g.length && ANONt >= 0 && ONLt >= 0,
    `${bc} ${isP ? "P" : "prev"}: จำนวน visit ไม่พอ (V=${Vt} IDN=${IDNt} ANON=${ANONt} ONL=${ONLt} cust=${g.length})`);

  /* จำนวน visit ต่อลูกค้า */
  const baseN = Math.floor(IDNt / g.length), rem = IDNt % g.length;
  const counts = g.map((_, i) => baseN + (i < rem ? 1 : 0));
  /* ลูกค้าที่ต้องเริ่มด้วยช่องทางออนไลน์ (กิจกรรมแรกของตน) */
  const needFirstOnline = g.map((c, i) =>
    ((isP && c.pool === "A") || (!isP && c.pool === "Bprev")) && c.chan !== "WALK_IN" ? i : -1).filter((i) => i >= 0);
  assertTrue(ONLt >= needFirstOnline.length, `${bc} ${isP ? "P" : "prev"}: visit ออนไลน์ไม่พอ (${ONLt} < ${needFirstOnline.length})`);
  let onlineLeft = ONLt - needFirstOnline.length;
  const firstOnlineSet = new Set(needFirstOnline);
  /* ลูกค้าที่ยังไม่มีช่องทางแรก (Cprev) — ใช้ช่องทางของ visit แรก */
  const noChan = g.map((c, i) => (!c.chan ? i : -1)).filter((i) => i >= 0);
  const giveOnline = new Set();
  for (const i of noChan) { if (onlineLeft <= 0) break; giveOnline.add(i); onlineLeft--; }
  for (const i of noChan) {
    const c = g[i];
    c.chan = giveOnline.has(i) ? ONLINE_CHANS[i % ONLINE_CHANS.length] : "WALK_IN";
    c.source = c.chan === "WALK_IN" ? "PASSING_BY" : c.chan === "LINE" ? "LINE_OA" : c.chan === "FACEBOOK" ? "FACEBOOK_PAGE" : c.chan === "INSTAGRAM" ? "INSTAGRAM" : "TIKTOK";
  }
  /* วันของแต่ละ visit */
  const unrecTotal = isP ? b.UNREC : Math.round((b.Vp * b.UNREC) / b.V);
  const unrec7 = isP ? b.UNREC7 : 0;
  const rows = [];
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    const n = counts[i];
    let start;
    if (isP && c.pool === "A") start = Math.floor((c.created - P_START) / DAY);
    else start = Math.floor(((i * 7919) % 1000) / 1000 * (lastDay - 2));
    const minDay = Math.max(0, Math.floor((c.firstSeen - base) / DAY));
    if (start < minDay) start = minDay;
    const cap = Math.min(lastDay, c.maxDay !== undefined && isP ? c.maxDay : lastDay);
    if (start > cap) start = cap;
    for (let k = 0; k < n; k++) {
      let d = n === 1 ? start : start + Math.round((k * (cap - start)) / n);
      if (d > cap) d = cap;
      const firstOfCust = k === 0;
      let chan = "WALK_IN";
      if (firstOfCust && (firstOnlineSet.has(i) || giveOnline.has(i))) chan = c.chan;
      rows.push({ cust: c, d, chan, first: firstOfCust, exactT: (isP && c.pool === "A" && firstOfCust) ? c.created : null });
    }
  }
  /* แจกโควตาออนไลน์ที่เหลือให้ visit ที่ไม่ใช่ visit แรก */
  for (let i = 0; i < rows.length && onlineLeft > 0; i++) {
    if (rows[i].chan !== "WALK_IN" || rows[i].first) continue;
    rows[i].chan = ONLINE_CHANS[i % ONLINE_CHANS.length];
    onlineLeft--;
  }
  assertEq(onlineLeft, 0, `${bc} ${isP ? "P" : "prev"}: โควตา visit ออนไลน์เหลือ`);
  /* visit ไม่ระบุตัวตน (walk-in) กระจายทุกวัน */
  for (let k = 0; k < ANONt; k++) rows.push({ cust: null, d: k % (lastDay + 1), chan: "WALK_IN", first: false, exactT: null });
  assertEq(rows.length, Vt, `${bc} ${isP ? "P" : "prev"}: จำนวน visit ทั่วไป`);

  /* outcome: UNRECORDED ตามโควตา · ที่เหลือหมุนตามรายการ */
  const unrecFixed = fixed.filter((v) => v.outcome === "UNRECORDED").length;
  let needUnrec = unrecTotal - unrecFixed;
  let need7 = unrec7;
  const in7 = (d) => isP && d >= 23 && d <= 28;     // 5–10 ก.ย.
  const cand7 = rows.filter((r) => in7(r.d));
  for (const r of cand7) { if (need7 <= 0) break; r.unrec = true; need7--; needUnrec--; }
  assertEq(need7, 0, `${bc}: VISIT_UNRECORDED 7 วันไม่ครบ`);
  for (const r of rows) { if (needUnrec <= 0) break; if (r.unrec || in7(r.d)) continue; r.unrec = true; needUnrec--; }
  assertEq(needUnrec, 0, `${bc} ${isP ? "P" : "prev"}: UNRECORDED ไม่ครบ`);

  /* เวลาในวัน */
  const byDay = new Map();
  for (const r of rows) { if (!byDay.has(r.d)) byDay.set(r.d, []); byDay.get(r.d).push(r); }
  for (const [d, list] of byDay) {
    const dayStart = base + d * DAY;
    const isSep4 = isP && d === SEP4_D;
    const early = isSep4 ? b.today.lastWeek : 0;
    let earlyDone = 0; const earlySeen = new Set();
    list.forEach((r, idx) => {
      if (r.exactT !== null) { r.t = r.exactT; return; }
      if (isSep4 && earlyDone < early && r.cust && !earlySeen.has(r.cust.id)
          && r.cust.firstSeen <= dayStart + 9 * HOUR + 30 * 60) {
        r.t = dayStart + 9 * HOUR + 30 * 60 + earlyDone * 8 * 60;      // 09:30 … ก่อน 10:24
        earlySeen.add(r.cust.id); earlyDone++;
        return;
      }
      const span = isSep4 ? SAFE_SPAN : WORK_SPAN;
      const st = isSep4 ? SAFE_START : OPEN_HOUR;
      r.t = dayStart + st + Math.round((idx * span) / Math.max(list.length, 1));
      if (r.cust && r.t < r.cust.firstSeen) r.t = r.cust.firstSeen;
    });
    if (isSep4) assertEq(earlyDone, early, `${bc}: ลูกค้าไม่ซ้ำก่อน 10:24 ของ 4 ก.ย.`);
  }
  /* สร้างแถว visit */
  let oi = 0;
  for (const r of rows) {
    const walkin = r.chan === "WALK_IN";
    let outcome, status = "COMPLETED";
    if (r.unrec) outcome = "UNRECORDED";
    else {
      outcome = r.cust ? OUTCOMES_ID[oi % OUTCOMES_ID.length] : OUTCOMES_ANON[oi % OUTCOMES_ANON.length];
      if (outcome === "LEFT_BEFORE_SERVICE" && !walkin) outcome = "SERVICE_DONE";
      if (outcome === "LEFT_BEFORE_SERVICE") status = "LEFT";
      oi++;
    }
    const dayEnd = base + r.d * DAY + 23 * HOUR + 59 * 60 + 59;
    addVisit({
      branch: bc, cust: r.cust, t: r.t, chan: r.chan, status,
      outcome, end: r.unrec ? dayEnd : Math.min(r.t + 1800, dayEnd), closedBySystem: !!r.unrec,
      owner: r.cust || status !== "LEFT" ? ownerOf(bc, oi + r.d) : null,
      interest: walkin ? INTERESTS[(oi + r.d) % INTERESTS.length] : (r.cust ? INTERESTS[(oi + 1) % 5] : null),
      walkin,
    });
  }
}
for (const bc of BCODES) { genericVisits(bc, false); genericVisits(bc, true); }

/* --- 5) ตรวจยอด visit ตามข้อ 13.2 --- */
for (const bc of BCODES) {
  const b = BR[bc];
  const inP = visits.filter((v) => v.branch === bc && v.t >= P_START && v.t < P_END);
  const inPrev = visits.filter((v) => v.branch === bc && v.t >= PREV_START && v.t < PREV_END);
  assertEq(inP.length, b.V, `13.2 VISITS ${bc}`);
  assertEq(inP.filter((v) => v.chan === "WALK_IN").length, b.W, `13.2 Walk-in ${bc}`);
  assertEq(inP.filter((v) => v.cust).length, b.IDN, `13.2 Identified ${bc}`);
  assertEq(inPrev.length, b.Vp, `13.2b VISITS ก่อน ${bc}`);
  assertEq(inP.filter((v) => v.outcome === "UNRECORDED").length, b.UNREC, `13.2b UNRECORDED ${bc}`);
  assertEq(inP.filter((v) => v.outcome === "UNRECORDED" && v.t >= W7_START).length, b.UNREC7, `13.12 VISIT_UNRECORDED ${bc}`);
  assertEq(inP.filter((v) => v.status === "COMPLETED" || v.status === "LEFT").length, b.V - b.today.open, `13.2b visit ปิดแล้ว ${bc}`);
  /* ลูกค้าไม่ซ้ำก่อน 10:24 ของวันเดียวกันสัปดาห์ก่อน (ข้อ 13.11) */
  const lw = new Set(visits.filter((v) => v.branch === bc && v.cust && v.t >= LAST_WEEK_DAY && v.t < LAST_WEEK_DAY + 10 * HOUR + 24 * 60).map((v) => v.cust.id));
  assertEq(lw.size, b.today.lastWeek, `13.11 ลูกค้าไม่ซ้ำสัปดาห์ก่อน ${bc}`);
}

/* ---------------------------------------------------------------- opportunity + lead */
const leads = [];
const opps = [];
let leadUid = 0, oppUid = 0;
function addLead(o) { const l = { id: uid(T.LEAD, ++leadUid), ...o }; leads.push(l); return l; }
function addOpp(o) { const o2 = { id: uid(T.OPP, ++oppUid), ...o }; opps.push(o2); return o2; }
/** เลือกลูกค้าจากชุด โดยกิจกรรมต้องไม่เกิดก่อน first_seen_at (invariant ข้อ 3.2) */
function pickCustAt(pool, t, i) {
  const n = pool.length;
  for (let k = 0; k < n; k++) { const c = pool[(i + k * 7 + 3) % n]; if (c.firstSeen <= t && !c.reserved) return c; }
  assertTrue(false, "pickCustAt: ไม่พบลูกค้าที่ first_seen ก่อนเวลาเหตุการณ์");
  return pool[0];
}
/** flag แบบกระจายสม่ำเสมอ: k ค่า true ใน n ช่อง */
function spreadFlags(n, k) {
  const f = new Array(n);
  for (let i = 0; i < n; i++) f[i] = Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n);
  assertEq(f.filter(Boolean).length, k, `spreadFlags(${n},${k})`);
  return f;
}
/** เวลาแบบกระจายในช่วง [a,b) ตามลำดับ i/n (อยู่ในเวลาทำการ) */
function spreadTime(base, days, i, n) { return posTimeSafe(base, ((i + 0.5) * days) / n); }

/* การ์ด pipeline ของ JP1 (ข้อ 13.9) และรายการที่ระบุชื่อ */
const JP1_PIPE = {
  onuma:      { cust: "onuma",      stage: "INTERESTED", owner: "KWAN", amount: 32900, nextAt: ts(2026, 9, 11, 10, 30), prio: "HIGH",   model: "iPhone 17",           action: "ส่งใบเสนอราคา iPhone 17", atype: "SEND_QUOTATION", created: ts(2026, 9, 9, 15, 10) },
  pakorn:     { cust: "pakorn",     stage: "INTERESTED", owner: "KIM",  amount: 21900, nextAt: ts(2026, 9, 12, 11, 0),  prio: "NORMAL", model: "iPad Air",            action: "ติดตามลูกค้าเรื่อง iPad Air", atype: "CALL" },
  pimchanok:  { cust: "pimchanok",  stage: "QUOTATION",  owner: "KWAN", amount: 49900, nextAt: ts(2026, 9, 10, 15, 0),  prio: "HIGH",   model: "iPhone 17 Pro Max",   action: "ติดตามใบเสนอราคา iPhone 17 Pro Max", atype: "FOLLOW_UP" },
  woracheth:  { cust: "woracheth",  stage: "QUOTATION",  owner: "KIM",  amount: 29900, nextAt: ts(2026, 9, 15, 14, 0),  prio: "NORMAL", model: "iPhone 16",           action: "ติดตามใบเสนอราคา iPhone 16", atype: "CALL" },
  somchai:    { cust: "somchai",    stage: "FOLLOW_UP",  owner: "KWAN", amount: 45900, nextAt: ts(2026, 9, 18, 10, 0),  prio: "HIGH",   model: "iPhone 17 Pro",       action: "โทรติดตามเรื่องผ่อน", atype: "CALL", fixedNo: "OP-2026-002998", created: ts(2026, 9, 1, 14, 0) },
  supawadee:  { cust: "supawadee",  stage: "FOLLOW_UP",  owner: "KIM",  amount: 34900, nextAt: ts(2026, 9, 17, 13, 0),  prio: "NORMAL", model: "iPad Pro",            action: "ติดตามการตัดสินใจ iPad Pro", atype: "CALL" },
  somchai2:   { cust: "somchai2",   stage: "INTERESTED", owner: "KIM",  amount: 18900, nextAt: ts(2026, 9, 16, 11, 0),  prio: "NORMAL", model: "iPhone 16",           action: "ติดตามความสนใจ iPhone 16", atype: "CALL" },
};
const JP3_PIPE = { kittipong: { cust: "kittipong", stage: "INTERESTED", owner: "BM", amount: 33900, nextAt: ts(2026, 9, 16, 10, 30), prio: "NORMAL", model: "iPhone 17", action: "ติดตามลูกค้า", atype: "CALL" } };

/* ---- โครงสร้างต่อสาขา ---- */
const PRICE_LIST = [45900, 39900, 34900, 32900, 29900, 28900, 25900, 23900, 21900, 18900, 15900, 12900, 9900, 7900, 5900, 3900];
function amountsFor(n, total, fixed = []) {
  /* fixed = ยอดที่ตรึงไว้ · ที่เหลือกระจายรอบค่าเฉลี่ยแล้วปรับใบสุดท้ายให้ผลรวมตรง */
  const res = fixed.slice();
  let left = total - fixed.reduce((a, x) => a + x, 0);
  const free = n - fixed.length;
  assertTrue(free >= 0, `amountsFor: ยอดที่ตรึงเกินจำนวน (${n} · ${fixed.length})`);
  if (free === 0) { assertEq(left, 0, "amountsFor ไม่มีช่องอิสระแต่ยอดไม่ลงตัว"); return res; }
  const avg = left / free;
  const JIT = [-0.32, -0.14, 0.05, 0.21, 0.38, -0.24, 0.11, -0.05];
  for (let i = 0; i < free - 1; i++) {
    let v = Math.round((avg * (1 + JIT[i % JIT.length])) / 100) * 100;
    v = Math.max(900, Math.min(v, left - 900 * (free - 1 - i)));
    res.push(v); left -= v;
  }
  assertTrue(left >= 900, `amountsFor: ยอดคงเหลือน้อยเกินไป (${left})`);
  res.push(left);
  assertEq(res.reduce((a, x) => a + x, 0), total, "amountsFor ผลรวม");
  return res;
}

const oppPlan = {};      // branch → { old:[], prev:[], cur:[] } (descriptor)
for (const bc of BCODES) {
  const b = BR[bc];
  const prevClose = b.Sp + b.LOp, pClose = b.S + b.LO;
  const nOld = OLD_OPP[bc];
  const fromPrevInPrev = prevClose - nOld;
  const prevLeft = b.Op - fromPrevInPrev;
  const fromPrevInP = Math.min(prevLeft, pClose);
  const fromCurInP = pClose - fromPrevInP;
  assertEq(b.O - fromCurInP, b.openOpp, `13.9 จำนวน opportunity เปิดอยู่ของ ${bc}`);
  assertTrue(fromPrevInPrev >= 0 && prevLeft - fromPrevInP === 0, `${bc}: สมดุล opportunity ช่วงก่อนหน้าไม่ลงตัว`);
  oppPlan[bc] = { nOld, fromPrevInPrev, fromPrevInP, fromCurInP,
                  prevLostInPrev: Math.min(b.LOp, nOld), prevWonFromOld: nOld - Math.min(b.LOp, nOld) };
}

/* ---- ยอดขายของช่วงก่อนหน้า (ข้อ 13.2b) ---- */
const PREV_AMT = {};
for (const bc of BCODES) PREV_AMT[bc] = { list: amountsFor(BR[bc].Sp, BR[bc].AMTp), i: 0 };

/* ---- opportunity ยุคเก่า (ปิดในช่วงก่อนหน้า) ---- */
for (const bc of BCODES) {
  const b = BR[bc], p = oppPlan[bc];
  const lostFromOld = p.prevLostInPrev, wonFromOld = p.prevWonFromOld;
  const lostR = [];
  for (let i = 0; i < LOST.length; i++) for (let k = 0; k < Math.ceil(LOST[i].br[BCODES.indexOf(bc)] / 2); k++) lostR.push(LOST[i].code);
  POOL[bc].Cold.forEach((c, i) => {
    const isLost = i < lostFromOld;
    const created = c.created;
    const closed = spreadTime(PREV_START, 29.5, i, Math.max(p.nOld, 1));
    const owner = ownerOf(bc, i);
    addOpp({ branch: bc, cust: c, cohort: "old", owner, created,
      stage: isLost ? "LOST" : "WON",
      wonAt: isLost ? null : closed, wonAmount: isLost ? null : PREV_AMT[bc].list[PREV_AMT[bc].i++],
      closedAt: closed, lostReason: isLost ? lostR[i % lostR.length] : null,
      origin: i % 3 === 0 ? "WALK_IN" : "PHONE", interest: LEAD_INTERESTS[i % 5], model: MODELS[i % MODELS.length] });
  });
  assertEq(opps.filter((o) => o.branch === bc && o.cohort === "old").length, p.nOld, `จำนวน opportunity ยุคเก่า ${bc}`);
}

/* ---- opportunity ของช่วงก่อนหน้า + ช่วง P ---- */
const pWinOpps = {};     // branch → opportunity ที่ WON ใน P ตามลำดับ
for (const bc of BCODES) {
  const b = BR[bc], p = oppPlan[bc];
  const Blist = curSet[bc].filter((c) => (c.pool === "Bold" || c.pool === "Bprev") && !c.reserved);
  const Alist = curSet[bc].filter((c) => c.pool === "A" && !c.reserved);
  const Clist = prevSet[bc].filter((c) => c.pool === "Cprev" && !c.reserved);
  /* ลูกค้าที่เคยซื้อก่อน P ต้องเป็นลูกค้าที่กลับมาใน P (ข้อ 13.2b ผู้ซื้อซ้ำ) */
  const somchaiFirst = bc === "JP1";
  const priorCust = [];
  if (somchaiFirst) priorCust.push(namedCust.somchai);
  for (const c of Blist) { if (priorCust.length >= b.prior) break; if (!priorCust.includes(c)) priorCust.push(c); }
  assertEq(priorCust.length, b.prior, `13.2b ลูกค้าที่เคยซื้อก่อน P ของ ${bc}`);
  const dblCust = [];
  for (const c of Blist) { if (dblCust.length >= b.dbl) break; if (!priorCust.includes(c)) dblCust.push(c); }
  const otherBuyers = [];
  const needOther = b.buyers - b.prior - b.dbl;
  const named = new Set([namedCust.manop?.id, namedCust.siriporn?.id]);
  for (const c of Alist) { if (otherBuyers.length >= needOther) break; if (bc === "JP1" && named.has(c.id)) continue; otherBuyers.push(c); }
  if (bc === "JP1") { otherBuyers.length = Math.max(0, needOther - 2); otherBuyers.push(namedCust.manop, namedCust.siriporn); }
  assertEq(otherBuyers.length, needOther, `13.2b ผู้ซื้ออื่นของ ${bc}`);

  /* ---- 1) opportunity ที่สร้างในช่วงก่อนหน้าและปิดในช่วงก่อนหน้า ---- */
  const lostLeftPrev = Math.max(0, b.LOp - p.nOld);
  const prevInPrevCust = [];
  for (let i = 0; i < p.fromPrevInPrev; i++) {
    const isLost = i < lostLeftPrev;
    /* ผู้ซื้อซ้ำที่เคยซื้อก่อน P ต้องมีการซื้อในช่วงก่อนหน้า (ยกเว้นคุณสมชายที่ซื้อ ม.ค.) */
    const wonIdx = i - lostLeftPrev;
    let cust;
    if (!isLost && wonIdx < priorCust.length - (somchaiFirst ? 1 : 0)) cust = priorCust[wonIdx + (somchaiFirst ? 1 : 0)];
    else cust = Clist[i % Math.max(Clist.length, 1)] || Blist[i % Blist.length];
    prevInPrevCust.push(cust);
    const created = Math.max(spreadTime(PREV_START, 27, i, Math.max(p.fromPrevInPrev, 1)), cust.firstSeen);
    const closed = Math.min(Math.max(created + 3 * DAY, created + HOUR), PREV_END - HOUR);
    assertTrue(closed >= created && closed < PREV_END, `${bc}: เวลาปิด opportunity ช่วงก่อนหน้าไม่ถูกต้อง`);
    addOpp({ branch: bc, cust, cohort: "prevClosedPrev", owner: ownerOf(bc, i), created,
      stage: isLost ? "LOST" : "WON", wonAt: isLost ? null : closed,
      wonAmount: isLost ? null : PREV_AMT[bc].list[PREV_AMT[bc].i++], closedAt: closed,
      lostReason: isLost ? LOST[i % LOST.length].code : null,
      origin: i % 2 === 0 ? "WALK_IN" : "PHONE", interest: LEAD_INTERESTS[i % 5], model: MODELS[i % MODELS.length] });
  }
  const prevWonList = opps.filter((o) => o.branch === bc && (o.cohort === "old" || o.cohort === "prevClosedPrev") && o.stage === "WON");
  assertEq(prevWonList.length, b.Sp, `13.2b Sales ช่วงก่อนหน้า ${bc}`);
  assertEq(prevWonList.reduce((a, o) => a + o.wonAmount, 0), b.AMTp, `13.2b ยอดขายช่วงก่อนหน้า ${bc}`);
  assertEq(PREV_AMT[bc].i, b.Sp, `13.2b ใช้ยอดขายช่วงก่อนหน้าครบ ${bc}`);

  /* ---- 2) ผู้ชนะใน P (S ใบ) : ลำดับลูกค้า ----
     ส่วนหัว = opportunity ที่สร้างในช่วงก่อนหน้า → ต้องเป็นลูกค้าที่มีอยู่ก่อน P (pool B)
     ส่วนท้าย = opportunity ที่สร้างใน P → เป็นลูกค้าใหม่ได้ */
  const nPrevWinB = p.fromPrevInP, nCurWinB = b.S - p.fromPrevInP;
  const somchaiInTail = bc === "JP1";
  const priorHead = priorCust.filter((c) => !(somchaiInTail && c.id === namedCust.somchai.id));
  const headOthersN = nPrevWinB - priorHead.length - 2 * b.dbl;
  assertTrue(headOthersN >= 0, `${bc}: ช่องผู้ชนะ cohort ก่อนหน้าไม่พอ`);
  const usedB = new Set([...priorCust, ...dblCust].map((c) => c.id));
  const headOthers = [];
  for (const c of Blist) { if (headOthers.length >= headOthersN) break; if (usedB.has(c.id)) continue; headOthers.push(c); usedB.add(c.id); }
  assertEq(headOthers.length, headOthersN, `${bc}: ลูกค้าเดิมสำหรับผู้ชนะ cohort ก่อนหน้า`);
  const tailOthersN = b.buyers - b.prior - b.dbl - headOthersN;
  assertTrue(tailOthersN >= 0, `${bc}: ผู้ซื้อส่วนท้ายติดลบ`);
  const tailOthers = [];
  if (bc === "JP1") { tailOthers.push(namedCust.manop, namedCust.siriporn); }
  for (const c of Alist) { if (tailOthers.length >= tailOthersN) break; if (tailOthers.includes(c)) continue; tailOthers.push(c); }
  assertEq(tailOthers.length, tailOthersN, `${bc}: ผู้ซื้อส่วนท้าย`);
  const winCust = [];
  for (const c of priorHead) winCust.push(c);
  for (const c of dblCust) { winCust.push(c); winCust.push(c); }
  for (const c of headOthers) winCust.push(c);
  assertEq(winCust.length, nPrevWinB, `${bc}: จำนวนผู้ชนะ cohort ก่อนหน้า`);
  if (somchaiInTail) winCust.push(namedCust.somchai);
  for (const c of tailOthers) winCust.push(c);
  assertEq(winCust.length, b.S, `13.2 จำนวน Sales ${bc}`);
  assertEq(new Set(winCust.map((c) => c.id)).size, b.buyers, `13.2b ผู้ซื้อ ${bc}`);
  const ordered = winCust;
  const nCurWin = nCurWinB;
  pWinOpps[bc] = { ordered, nCurWin };
}

/* ---- ช่องเวลาของ opportunity ที่สร้างใน P (เลข OP ต้องเรียงตาม created_at · ข้อ 13.0 ข้อ 8) ---- */
const CUR_OPP_N = sum((b) => b.O);
const curOppTimes = interpSchedule(CUR_OPP_N, P_START, [
  [1, 0.02], [37, posOf(2, 11, 5)], [245, posOf(19, 14, 0)], [CUR_OPP_N, posOf(28, 19, 0)]]);
const curOppBranch = new Array(CUR_OPP_N + 1);
{
  const want = BCODES.map((c) => BR[c].O), got = [0, 0, 0, 0];
  for (let i = 1; i <= CUR_OPP_N; i++) {
    let best = 0, bestScore = -1;
    for (let b = 0; b < 4; b++) { if (got[b] >= want[b]) continue; const sc = (want[b] - got[b]) / want[b]; if (sc > bestScore + 1e-12) { bestScore = sc; best = b; } }
    curOppBranch[i] = BCODES[best]; got[best]++;
  }
  for (const i of [37, 245]) {
    if (curOppBranch[i] === "JP1") continue;
    const from = curOppBranch[i];
    let sw = -1; for (let j = CUR_OPP_N; j >= 1; j--) if (curOppBranch[j] === "JP1" && j !== 37 && j !== 245) { sw = j; break; }
    assertTrue(sw > 0, "หาคู่สลับสาขาของ opportunity ที่ระบุชื่อไม่ได้");
    curOppBranch[i] = "JP1"; curOppBranch[sw] = from;
  }
  const chk = [0, 0, 0, 0];
  for (let i = 1; i <= CUR_OPP_N; i++) chk[BCODES.indexOf(curOppBranch[i])]++;
  for (let b = 0; b < 4; b++) assertEq(chk[b], want[b], `จำนวน opportunity ใน P ของ ${BCODES[b]}`);
}
const curSlots = {}; for (const c of BCODES) curSlots[c] = [];
for (let i = 1; i <= CUR_OPP_N; i++) curSlots[curOppBranch[i]].push({ rank: i, t: curOppTimes[i] });

/* ---- รายละเอียดผู้ชนะใน P + opportunity ที่สร้างในช่วงก่อนหน้าและปิดใน P ---- */
const WIN_META = {};
for (const bc of BCODES) {
  const b = BR[bc], p = oppPlan[bc];
  const { ordered, nCurWin } = pWinOpps[bc];
  const S = b.S, nPrevWin = p.fromPrevInP;
  assertEq(nPrevWin + nCurWin, S, `13.2 แบ่งผู้ชนะ ${bc}`);
  const idx = (key) => (namedCust[key] ? ordered.findIndex((c) => c.id === namedCust[key].id) : -1);
  const owners = new Array(S).fill(bc === "JP1" ? null : BM[bc]);
  const recent = new Array(S).fill(false);
  if (bc === "JP1") {
    const iSom = idx("somchai"), iMan = idx("manop"), iSir = idx("siriporn");
    assertTrue(iSom >= nPrevWin && iMan >= nPrevWin && iSir >= nPrevWin, "ผู้ชนะที่ระบุชื่อของ JP1 ต้องอยู่ cohort CUR");
    owners[iSom] = KWAN; owners[iMan] = KWAN; owners[iSir] = KIM;
    recent[iMan] = true; recent[iSir] = true;
    let kwanCur = 3 - 2, kimCur = 4 - 1;
    for (let i = nPrevWin; i < S; i++) {
      if (owners[i]) continue;
      if (kwanCur > 0) { owners[i] = KWAN; kwanCur--; } else { owners[i] = KIM; kimCur--; }
      recent[i] = true;
    }
    assertEq(kwanCur, 0, "JP1 ผู้ชนะ cohort CUR ของคุณขวัญ"); assertEq(kimCur, 0, "JP1 ผู้ชนะ cohort CUR ของคุณคิม");
    let kwanPrev = 44 - 3, kimPrev = 38 - 4, recKwanLeft = 4 - 2;
    for (let i = 0; i < nPrevWin; i++) {
      if (kwanPrev > 0) { owners[i] = KWAN; kwanPrev--; if (recKwanLeft > 0) { recent[i] = true; recKwanLeft--; } }
      else { owners[i] = KIM; kimPrev--; }
    }
    assertEq(kwanPrev, 0, "JP1 ผู้ชนะ cohort PREV ของคุณขวัญ"); assertEq(kimPrev, 0, "JP1 ผู้ชนะ cohort PREV ของคุณคิม");
    assertEq(recent.filter(Boolean).length, 8, "13.9 ปิดการขายใน 7 วันล่าสุดของ JP1");
    assertEq(owners.filter((o) => o === KWAN).length, 44, "13.6 Sales ของคุณขวัญ");
    assertEq(owners.filter((o) => o === KIM).length, 38, "13.6 Sales ของคุณคิม");
  }
  let amounts = new Array(S).fill(0);
  if (bc === "JP1") {
    const iSom = idx("somchai"), iMan = idx("manop"), iSir = idx("siriporn");
    const kwanRecIdx = [], kimRecIdx = [], kwanRestIdx = [], kimRestIdx = [];
    for (let i = 0; i < S; i++) {
      const isK = owners[i] === KWAN;
      (recent[i] ? (isK ? kwanRecIdx : kimRecIdx) : (isK ? kwanRestIdx : kimRestIdx)).push(i);
    }
    const put = (idxs, total, fixedMap) => {
      const fixed = idxs.filter((i) => fixedMap[i] !== undefined).map((i) => fixedMap[i]);
      const vals = amountsFor(idxs.length, total, fixed);
      let f = 0, g = fixed.length;
      for (const i of idxs) amounts[i] = fixedMap[i] !== undefined ? vals[f++] : vals[g++];
    };
    put(kwanRecIdx, 145500, { [iMan]: 28900 });
    put(kimRecIdx, 139900, { [iSir]: 25900 });
    put(kwanRestIdx, 668400 - 145500, { [iSom]: 28900 });
    put(kimRestIdx, 576600 - 139900, {});
    assertEq(amounts.filter((_, i) => owners[i] === KWAN).reduce((a, x) => a + x, 0), 668400, "13.6 ยอดขายคุณขวัญ");
    assertEq(amounts.filter((_, i) => owners[i] === KIM).reduce((a, x) => a + x, 0), 576600, "13.6 ยอดขายคุณคิม");
    assertEq(amounts.filter((_, i) => recent[i]).reduce((a, x) => a + x, 0), 285400, "13.9 ยอดปิดการขาย 7 วัน JP1");
  } else amounts = amountsFor(S, b.AMT);
  assertEq(amounts.reduce((a, x) => a + x, 0), b.AMT, `13.2 ยอดขาย ${bc}`);
  const origins = new Array(S).fill("PHONE");
  {
    let left = b.walkinSales;
    for (let i = 0; i < S && left > 0; i++) {
      if (bc === "JP1" && ordered[i].id === namedCust.somchai.id) continue;
      origins[i] = "WALK_IN"; left--;
    }
    assertEq(left, 0, `13.2b Sales ต้นทาง Walk-in ${bc}`);
    if (bc === "JP1") origins[idx("somchai")] = "LINE";
    assertEq(origins.filter((x) => x === "WALK_IN").length, b.walkinSales, `13.2b ช่องทาง Walk-in ${bc}`);
  }
  const wonAt = new Array(S);
  for (let i = 0; i < S; i++) {
    if (bc === "JP1" && recent[i]) wonAt[i] = null;
    else wonAt[i] = spreadTime(P_START, bc === "JP1" ? 22.5 : 28.5, i, S);
  }
  if (bc === "JP1") {
    const iSom = idx("somchai"), iMan = idx("manop"), iSir = idx("siriporn");
    wonAt[iSom] = ts(2026, 8, 15, 11, 5);
    wonAt[iMan] = ts(2026, 9, 10, 16, 40);
    wonAt[iSir] = ts(2026, 9, 9, 14, 0);
    let k = 0;
    for (let i = 0; i < S; i++) if (wonAt[i] === null) { wonAt[i] = posTimeSafe(W7_START, 0.4 + k * 0.8); k++; }
    for (let i = 0; i < S; i++)
      assertTrue(recent[i] ? (wonAt[i] >= W7_START && wonAt[i] < TODAY0) : wonAt[i] < W7_START, `13.9 ช่วงเวลา won_at ของ JP1 (i=${i})`);
  }
  WIN_META[bc] = { ordered, owners, amounts, origins, wonAt, recent, nPrevWin, nCurWin };

  for (let i = 0; i < nPrevWin; i++) {
    const created = Math.max(spreadTime(PREV_START, 29, i, Math.max(nPrevWin, 1)), ordered[i].firstSeen, PREV_START + 600);
    assertTrue(created < PREV_END, `${bc}: opportunity ช่วงก่อนหน้าออกนอกช่วง`);
    addOpp({ branch: bc, cust: ordered[i], cohort: "prevClosedP", owner: owners[i], created,
      stage: "WON", wonAt: wonAt[i], wonAmount: amounts[i], closedAt: wonAt[i], lostReason: null,
      origin: origins[i], interest: LEAD_INTERESTS[i % 5], model: MODELS[i % MODELS.length], winIdx: i });
  }
}
for (const bc of BCODES)
  assertEq(opps.filter((o) => o.branch === bc && o.created >= PREV_START && o.created < PREV_END).length, BR[bc].Op,
    `13.2b Opportunities ช่วงก่อนหน้า ${bc}`);

/* ---- opportunity ที่สร้างใน P ---- */
{
  /* จองช่องเวลาให้ opportunity ของคุณอรอุมา (กิจกรรมล่าสุด 9 ก.ย. 15:10 · ข้อ 13.5) */
  const wantT = ts(2026, 9, 9, 15, 10);
  let r = 1; while (r < CUR_OPP_N && curOppTimes[r + 1] <= wantT) r++;
  assertTrue(r !== 37 && r !== 245, "ช่องเวลาของคุณอรอุมาชนกับ opportunity ที่ระบุชื่อ");
  if (curOppBranch[r] !== "JP1") {
    const from = curOppBranch[r];
    let sw = -1; for (let j = CUR_OPP_N; j >= 1; j--) if (curOppBranch[j] === "JP1" && j !== 37 && j !== 245 && j !== r) { sw = j; break; }
    curOppBranch[r] = "JP1"; curOppBranch[sw] = from;
    for (const c of BCODES) curSlots[c] = [];
    for (let i = 1; i <= CUR_OPP_N; i++) curSlots[curOppBranch[i]].push({ rank: i, t: curOppTimes[i] });
  }
  curOppTimes[r] = wantT;
  for (const s of curSlots.JP1) if (s.rank === r) s.t = wantT;
  var ONUMA_RANK = r;
}
const openOppsByBranch = {};
for (const bc of BCODES) {
  const b = BR[bc], W = WIN_META[bc];
  const slots = curSlots[bc];
  assertEq(slots.length, b.O, `ช่องเวลา opportunity ใน P ของ ${bc}`);
  const roles = new Array(b.O).fill(null);
  const findRank = (rk) => slots.findIndex((s) => s.rank === rk);
  const namedOpen = [];
  if (bc === "JP1") {
    roles[findRank(37)] = { type: "WIN", winIdx: W.ordered.findIndex((c) => c.id === namedCust.somchai.id), no: "OP-2026-002790" };
    roles[findRank(245)] = { type: "OPEN", key: "somchai" };
    roles[findRank(ONUMA_RANK)] = { type: "OPEN", key: "onuma" };
    namedOpen.push("pimchanok", "woracheth", "supawadee", "pakorn", "somchai2");
  } else if (bc === "JP3") namedOpen.push("kittipong");
  /* ผู้ชนะ cohort CUR ที่เหลือ → ช่องเวลาแรก ๆ (created ≤ won) */
  let winLeft = W.nCurWin - (bc === "JP1" ? 1 : 0);
  const winIdxs = [];
  for (let i = W.nPrevWin; i < W.ordered.length; i++) if (!(bc === "JP1" && W.ordered[i].id === namedCust.somchai.id)) winIdxs.push(i);
  assertEq(winIdxs.length, winLeft, `${bc}: ผู้ชนะ cohort CUR ที่เหลือ`);
  let wi = 0;
  for (let i = 0; i < b.O && wi < winIdxs.length; i++) {
    if (roles[i]) continue;
    if (slots[i].t > W.wonAt[winIdxs[wi]] || slots[i].t < W.ordered[winIdxs[wi]].firstSeen) continue;
    roles[i] = { type: "WIN", winIdx: winIdxs[wi] }; wi++;
  }
  assertEq(wi, winIdxs.length, `${bc}: หาช่องเวลาให้ผู้ชนะ cohort CUR ไม่ครบ`);
  /* opportunity ที่ระบุชื่อและเปิดอยู่ */
  let free = [];
  for (let i = 0; i < b.O; i++) if (!roles[i]) free.push(i);
  namedOpen.forEach((k, j) => {
    const maxT = namedCust[k] ? namedCust[k].maxT : undefined;
    let at = free[Math.floor(((j + 1) * free.length) / (namedOpen.length + 2))];
    if (maxT !== undefined) { const ok = free.filter((x) => slots[x].t <= maxT && !roles[x]); assertTrue(ok.length > 0, `ไม่มีช่องเวลา opportunity ให้ ${k}`); at = ok[ok.length - 1]; }
    while (roles[at]) at = free[(free.indexOf(at) + 1) % free.length];
    roles[at] = { type: "OPEN", key: k };
  });
  free = []; for (let i = 0; i < b.O; i++) if (!roles[i]) free.push(i);
  const nLost = b.LO, nOpenLeft = free.length - nLost;
  const lostFlag = spreadFlags(free.length, nLost);
  free.forEach((i, j) => { roles[i] = lostFlag[j] ? { type: "LOST" } : { type: "OPEN" }; });
  assertEq(roles.filter((x) => x.type === "OPEN").length, b.openOpp, `13.9 opportunity เปิดอยู่ ${bc}`);
  assertEq(roles.filter((x) => x.type === "LOST").length, b.LO, `13.2 lost opportunity ${bc}`);
  assertEq(roles.filter((x) => x.type === "WIN").length, W.nCurWin, `13.2 ผู้ชนะ cohort CUR ${bc}`);

  /* เหตุผลที่ไม่สำเร็จของ opportunity (ข้อ 13.4) */
  const bi = BCODES.indexOf(bc);
  const lostReasons = [];
  for (let ri = 0; ri < LOST.length; ri++) for (let k = 0; k < oppAlloc[ri][bi]; k++) lostReasons.push(LOST[ri].code);
  assertEq(lostReasons.length, b.LO, `13.4 เหตุผลของ lost opportunity ${bc}`);

  /* owner/stage/ยอด ของ opportunity ที่เปิดอยู่ */
  const openIdx = roles.map((x, i) => (x.type === "OPEN" ? i : -1)).filter((i) => i >= 0);
  const STAGES = ["INTERESTED", "QUOTATION", "FOLLOW_UP"];
  const openPlan = new Map();
  if (bc === "JP1") {
    const want = { KWAN: [17, 10, 7], KIM: [15, 8, 5] };
    const fixedByKey = { onuma: ["KWAN", 0], pakorn: ["KIM", 0], somchai2: ["KIM", 0], pimchanok: ["KWAN", 1],
                         woracheth: ["KIM", 1], somchai: ["KWAN", 2], supawadee: ["KIM", 2] };
    const left = { KWAN: want.KWAN.slice(), KIM: want.KIM.slice() };
    for (const [k, v] of Object.entries(fixedByKey)) left[v[0]][v[1]]--;
    for (const i of openIdx) {
      const rk = roles[i].key;
      if (rk && fixedByKey[rk]) { openPlan.set(i, { own: fixedByKey[rk][0], st: fixedByKey[rk][1], key: rk }); continue; }
      let own = null, st = -1;
      for (const o of ["KWAN", "KIM"]) for (let s2 = 0; s2 < 3; s2++) if (left[o][s2] > 0) { own = o; st = s2; break; }
      for (const o of ["KWAN", "KIM"]) { for (let s2 = 0; s2 < 3; s2++) if (left[o][s2] > 0) { own = o; st = s2; } }
      own = null; st = -1;
      outer: for (const o of ["KWAN", "KIM"]) for (let s2 = 0; s2 < 3; s2++) if (left[o][s2] > 0) { own = o; st = s2; break outer; }
      assertTrue(own !== null, "JP1: โควตา opportunity เปิดอยู่ไม่พอ");
      left[own][st]--; openPlan.set(i, { own, st });
    }
    for (const o of ["KWAN", "KIM"]) for (let s2 = 0; s2 < 3; s2++) assertEq(left[o][s2], 0, `13.6 โควตา opportunity เปิดอยู่ ${o}/${STAGES[s2]}`);
  } else {
    const left = b.oppStages.slice();
    for (const i of openIdx) {
      let st = -1; for (let s2 = 0; s2 < 3; s2++) if (left[s2] > 0) { st = s2; break; }
      left[st]--; openPlan.set(i, { own: "BM", st, key: roles[i].key });
    }
    for (let s2 = 0; s2 < 3; s2++) assertEq(left[s2], 0, `13.9 โควตาขั้นของ ${bc}`);
  }
  /* ยอดคาดการณ์ */
  const amtByIdx = new Map();
  if (bc === "JP1") {
    const TOT = { KWAN: [236800, 289300, 205500], KIM: [190000, 223000, 182500] };
    const FIXED = { onuma: 32900, pakorn: 21900, somchai2: 18900, pimchanok: 49900, woracheth: 29900, somchai: 45900, supawadee: 34900 };
    for (const o of ["KWAN", "KIM"]) for (let s2 = 0; s2 < 3; s2++) {
      const ids = openIdx.filter((i) => openPlan.get(i).own === o && openPlan.get(i).st === s2);
      const fx = ids.filter((i) => openPlan.get(i).key).map((i) => FIXED[openPlan.get(i).key]);
      const vals = amountsFor(ids.length, TOT[o][s2], fx);
      let f = 0, g = fx.length;
      for (const i of ids) amtByIdx.set(i, openPlan.get(i).key ? vals[f++] : vals[g++]);
    }
    assertEq(openIdx.reduce((a, i) => a + amtByIdx.get(i), 0), 1327100, "13.9 มูลค่า pipeline JP1");
  } else {
    const total = b.openOpp * 18000;
    const vals = amountsFor(openIdx.length, total, []);
    openIdx.forEach((i, j) => amtByIdx.set(i, vals[j]));
    if (bc === "JP3") { const ki = openIdx.find((i) => openPlan.get(i).key === "kittipong"); if (ki !== undefined) amtByIdx.set(ki, 33900); }
  }
  /* สร้างแถว */
  let lostI = 0, otherOpenSeq = 0, lostKwanLeft = bc === "JP1" ? 26 : 0;
  const openList = [];
  for (let i = 0; i < b.O; i++) {
    const role = roles[i], t = slots[i].t;
    if (role.type === "WIN") {
      const wIdx = role.winIdx;
      addOpp({ branch: bc, cust: W.ordered[wIdx], cohort: "cur", owner: W.owners[wIdx], created: t,
        stage: "WON", wonAt: W.wonAt[wIdx], wonAmount: W.amounts[wIdx], closedAt: W.wonAt[wIdx],
        lostReason: null, origin: W.origins[wIdx], interest: LEAD_INTERESTS[i % 5],
        model: MODELS[i % MODELS.length], fixedNo: role.no, winIdx: wIdx });
    } else if (role.type === "LOST") {
      const cust = pickCustAt(curSet[bc], t, i * 13 + 5);
      const closed = Math.min(t + 5 * DAY, TODAY0 - HOUR);
      const lostOwner = bc === "JP1" ? (lostKwanLeft-- > 0 ? KWAN : KIM) : BM[bc];
      addOpp({ branch: bc, cust, cohort: "cur", owner: lostOwner, created: t,
        stage: "LOST", wonAt: null, wonAmount: null, closedAt: closed,
        lostReason: lostReasons[lostI++], origin: i % 2 ? "WALK_IN" : "PHONE",
        interest: LEAD_INTERESTS[i % 5], model: MODELS[i % MODELS.length] });
    } else {
      const pl = openPlan.get(i);
      const key = pl.key;
      const pipe = key ? (JP1_PIPE[key] || JP3_PIPE[key]) : null;
      const cust = key ? namedCust[key] : pickCustAt(curSet[bc], t, i * 29 + 11);
      const owner = pl.own === "KWAN" ? KWAN : pl.own === "KIM" ? KIM : BM[bc];
      const o = addOpp({ branch: bc, cust, cohort: "cur", owner, created: t,
        stage: STAGES[pl.st], wonAt: null, wonAmount: null, closedAt: null, lostReason: null,
        origin: pipe ? (key === "somchai" ? "LINE" : "WALK_IN") : (i % 3 ? "WALK_IN" : "PHONE"),
        interest: pipe ? "BUY" : LEAD_INTERESTS[i % 5], model: pipe ? pipe.model : MODELS[i % MODELS.length],
        expected: amtByIdx.get(i), fixedNo: pipe ? pipe.fixedNo : null,
        prio: pipe ? pipe.prio : ["NORMAL", "NORMAL", "HIGH", "LOW", "NORMAL"][otherOpenSeq % 5],
        nextAction: pipe ? pipe.action : "ติดตามลูกค้า", nextType: pipe ? pipe.atype : "CALL",
        nextAt: pipe ? pipe.nextAt : posTimeSafe(TOMORROW0, (otherOpenSeq % 20) + 0.3), key });
      openList.push(o); otherOpenSeq++;
    }
  }
  openOppsByBranch[bc] = openList;
  assertEq(lostI, b.LO, `13.4 ใช้เหตุผล lost opportunity ครบ ${bc}`);
  if (bc === "JP1") {
    const curB = opps.filter((o) => o.branch === "JP1" && o.cohort === "cur");
    assertEq(curB.filter((o) => o.owner === KWAN).length, 63, "13.6 Opportunities ของคุณขวัญ");
    assertEq(curB.filter((o) => o.owner === KIM).length, 57, "13.6 Opportunities ของคุณคิม");
    assertEq(curB.filter((o) => o.stage === "LOST" && o.owner === KWAN).length, 26, "13.6 Lost Opp ของคุณขวัญ");
    assertEq(curB.filter((o) => o.stage === "LOST" && o.owner === KIM).length, 25, "13.6 Lost Opp ของคุณคิม");
  }
}
/* ตรวจยอด opportunity ตามข้อ 13.1 / 13.2 / 13.9 */
for (const bc of BCODES) {
  const b = BR[bc];
  const o = opps.filter((x) => x.branch === bc);
  assertEq(o.filter((x) => x.created >= P_START && x.created < P_END).length, b.O, `13.2 Opportunities ${bc}`);
  assertEq(o.filter((x) => x.stage === "WON" && x.wonAt >= P_START && x.wonAt < P_END).length, b.S, `13.2 Sales ${bc}`);
  assertEq(o.filter((x) => x.stage === "WON" && x.wonAt >= P_START && x.wonAt < P_END).reduce((a, x) => a + x.wonAmount, 0), b.AMT, `13.2 ยอดขาย ${bc}`);
  assertEq(o.filter((x) => x.stage === "LOST" && x.closedAt >= P_START && x.closedAt < P_END).length, b.LO, `13.2 Lost Opp ${bc}`);
  assertEq(o.filter((x) => x.stage === "WON" && x.wonAt >= PREV_START && x.wonAt < PREV_END).length, b.Sp, `13.2b Sales ก่อน ${bc}`);
  assertEq(o.filter((x) => ["INTERESTED", "QUOTATION", "FOLLOW_UP"].includes(x.stage)).length, b.openOpp, `13.9 opportunity เปิดอยู่ ${bc}`);
  assertEq(o.filter((x) => x.stage === "WON" && x.wonAt >= W7_START && x.wonAt < TOMORROW0 && bc === "JP1").length, bc === "JP1" ? 8 : 0, `13.9 ปิดการขาย 7 วัน ${bc}`);
  assertEq(o.filter((x) => x.stage === "WON" && x.wonAt >= P_START && x.wonAt < P_END && x.origin === "WALK_IN").length, b.walkinSales, `13.2b Walk-in sales ${bc}`);
}

/* ---------------------------------------------------------------- lead */
const MSG_CHANS = ["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK"];
const LEAD_PREV_N = sum((b) => b.Lp), LEAD_CUR_N = sum((b) => b.L);
assertEq(LEAD_PREV_N, 826, "13.2b Leads ช่วงก่อนหน้า"); assertEq(LEAD_CUR_N, 892, "13.1 Leads ใน P");
const leadPrevTimes = interpSchedule(LEAD_PREV_N, PREV_START, [[1, 0.02], [823, posOf(29, 19, 40)], [LEAD_PREV_N, 29.97]]);
const leadCurTimes = interpSchedule(LEAD_CUR_N, P_START, [[1, 0.02], [807, posOf(26, 16, 10)], [LEAD_CUR_N, posOf(28, 19, 30)]]);
function assignBranches(n, want, forced) {
  const arr = new Array(n + 1); const got = [0, 0, 0, 0];
  for (let i = 1; i <= n; i++) {
    let best = 0, bestScore = -1;
    for (let b = 0; b < 4; b++) { if (got[b] >= want[b]) continue; const sc = (want[b] - got[b]) / want[b]; if (sc > bestScore + 1e-12) { bestScore = sc; best = b; } }
    arr[i] = BCODES[best]; got[best]++;
  }
  const fset = new Set(forced.map((f) => f[0]));
  for (const [i, bc] of forced) {
    if (arr[i] === bc) continue;
    const from = arr[i];
    let sw = -1; for (let j = n; j >= 1; j--) if (arr[j] === bc && !fset.has(j)) { sw = j; break; }
    assertTrue(sw > 0, `assignBranches: หาคู่สลับไม่ได้ (i=${i})`);
    arr[i] = bc; arr[sw] = from;
  }
  const chk = [0, 0, 0, 0]; for (let i = 1; i <= n; i++) chk[BCODES.indexOf(arr[i])]++;
  for (let b = 0; b < 4; b++) assertEq(chk[b], want[b], `assignBranches โควตา ${BCODES[b]}`);
  return arr;
}
const leadPrevBranch = assignBranches(LEAD_PREV_N, BCODES.map((c) => BR[c].Lp), [[823, "JP1"]]);
const leadCurBranch = assignBranches(LEAD_CUR_N, BCODES.map((c) => BR[c].L), [[807, "JP1"], [859, "JP1"]]);
const leadPrevSlots = {}, leadCurSlots = {};
for (const c of BCODES) { leadPrevSlots[c] = []; leadCurSlots[c] = []; }
for (let i = 1; i <= LEAD_PREV_N; i++) leadPrevSlots[leadPrevBranch[i]].push({ rank: i, t: leadPrevTimes[i] });
for (let i = 1; i <= LEAD_CUR_N; i++) leadCurSlots[leadCurBranch[i]].push({ rank: i, t: leadCurTimes[i] });

const AFTER_28AUG = ts(2026, 8, 28, 10, 24);
let respIdx = 0;
const RESP_MIN = () => { const v = 18 + ((respIdx % 5) - 2); respIdx++; return v; };
const openLeadsByBranch = {};
for (const bc of BCODES) {
  const b = BR[bc], bi = BCODES.indexOf(bc);
  /* ---------- prev cohort ---------- */
  const ps = leadPrevSlots[bc];
  assertEq(ps.length, b.Lp, `ช่องเวลา lead ช่วงก่อนหน้า ${bc}`);
  const prevOpps = opps.filter((o) => o.branch === bc && o.created >= PREV_START && o.created < PREV_END);
  assertEq(prevOpps.length, b.Op, `opportunity ช่วงก่อนหน้า ${bc}`);
  const somchaiPrevRank = bc === "JP1" ? 823 : -1;
  const prevRoles = new Array(b.Lp).fill(null);
  const somIdxPrev = ps.findIndex((s) => s.rank === somchaiPrevRank);
  if (somIdxPrev >= 0) prevRoles[somIdxPrev] = { type: "CONV_SPECIAL" };
  /* NEW ค้างก่อน P (LEAD_WITHOUT_OUTCOME) เลือกจากช่องเวลาท้าย ๆ ของ prev */
  let placed = 0;
  for (let i = b.Lp - 1; i >= 0 && placed < b.preNewLeads; i--) { if (prevRoles[i]) continue; prevRoles[i] = { type: "PRE_NEW" }; placed++; }
  assertEq(placed, b.preNewLeads, `13.6 lead NEW ก่อน P ของ ${bc}`);
  let freeP = []; for (let i = 0; i < b.Lp; i++) if (!prevRoles[i]) freeP.push(i);
  const lostPrevFlag = spreadFlags(freeP.length, b.LLp);
  freeP.forEach((i, j) => { prevRoles[i] = lostPrevFlag[j] ? { type: "LOST" } : { type: "CONV" }; });
  /* ---------- cur cohort ---------- */
  const cs = leadCurSlots[bc];
  assertEq(cs.length, b.L, `ช่องเวลา lead ใน P ${bc}`);
  const curOppsB = opps.filter((o) => o.branch === bc && o.cohort === "cur");
  const convTargets = curOppsB.filter((o) => o.fixedNo !== "OP-2026-002790" && o.fixedNo !== "OP-2026-002998");
  const curRoles = new Array(b.L).fill(null);
  const openCur = b.openLead - b.preNewLeads;
  const newCur = bc === "JP4" ? 1 : bc === "JP1" ? 8 : 0;
  /* lead ที่ระบุชื่อ */
  const fix = (rank, role) => { const i = cs.findIndex((s) => s.rank === rank); assertTrue(i >= 0, `ไม่พบช่องเวลา lead rank ${rank}`); curRoles[i] = role; return i; };
  if (bc === "JP1") { fix(807, { type: "OPEN", st: "CONTACTED", key: "somchaiIpad" }); fix(859, { type: "OPEN", st: "CONTACTED", key: "wilaiwan", msg: true }); }
  /* lead เปิดอยู่: เลือกช่องเวลาหลัง 28 ส.ค. 10:24 */
  const cand = [];
  for (let i = 0; i < b.L; i++) if (!curRoles[i] && cs[i].t >= AFTER_28AUG) cand.push(i);
  const already = curRoles.filter((x) => x && x.type === "OPEN").length;
  const needOpen = openCur - already;
  assertTrue(cand.length >= needOpen, `${bc}: ช่องเวลา lead เปิดอยู่หลัง 28 ส.ค. ไม่พอ (${cand.length} < ${needOpen})`);
  const openFlag = spreadFlags(cand.length, needOpen);
  cand.forEach((i, j) => { if (openFlag[j]) curRoles[i] = { type: "OPEN" }; });
  let freeC = []; for (let i = 0; i < b.L; i++) if (!curRoles[i]) freeC.push(i);
  const lostFlagC = spreadFlags(freeC.length, b.LL);
  freeC.forEach((i, j) => { curRoles[i] = lostFlagC[j] ? { type: "LOST" } : { type: "CONV" }; });
  assertEq(curRoles.filter((x) => x.type === "OPEN").length, openCur, `13.6 lead เปิดอยู่ (cohort P) ${bc}`);
  assertEq(curRoles.filter((x) => x.type === "LOST").length, b.LL, `13.2 lost lead ${bc}`);

  /* สถานะ · ช่องทาง · owner ของ lead เปิดอยู่ */
  const openIdxs = curRoles.map((x, i) => (x.type === "OPEN" ? i : -1)).filter((i) => i >= 0);
  const stLeft = { NEW: newCur, CONTACTED: b.leadCONT, QUALIFIED: b.leadQUAL };
  assertEq(stLeft.NEW + stLeft.CONTACTED + stLeft.QUALIFIED, openCur, `13.6 ผลรวมสถานะ lead เปิดอยู่ (cohort P) ${bc}`);
  for (const i of openIdxs) if (curRoles[i].st) stLeft[curRoles[i].st]--;
  const plain = openIdxs.filter((i) => !curRoles[i].st);
  /* 2 ใบแรกที่ไม่ใช่ lead ที่ระบุชื่อ = LEAD_WITHOUT_OWNER (สถานะ CONTACTED) */
  const noOwnerIdx = plain.slice(0, 2);
  assertEq(noOwnerIdx.length, 2, `13.12 LEAD_WITHOUT_OWNER ${bc}`);
  for (const i of noOwnerIdx) { curRoles[i].st = "CONTACTED"; curRoles[i].noOwner = true; stLeft.CONTACTED--; }
  /* lead NEW ของ cohort P (ช่องทางข้อความ · ยังไม่ติดต่อ) */
  const rest = plain.filter((i) => !curRoles[i].noOwner);
  for (let k = 0; k < newCur; k++) { curRoles[rest[rest.length - 1 - k]].st = "NEW"; curRoles[rest[rest.length - 1 - k]].msg = true; stLeft.NEW--; }
  for (const i of rest) {
    if (curRoles[i].st) continue;
    if (stLeft.CONTACTED > 0) { curRoles[i].st = "CONTACTED"; stLeft.CONTACTED--; }
    else { curRoles[i].st = "QUALIFIED"; stLeft.QUALIFIED--; }
  }
  for (const k of ["NEW", "CONTACTED", "QUALIFIED"]) assertEq(stLeft[k], 0, `13.6 โควตาสถานะ ${k} ของ ${bc}`);
  /* ช่องทางข้อความของ lead เปิดอยู่ (ที่เหลือหลังหัก LOST ซึ่งเป็นช่องทางข้อความทั้งหมด) */
  const msgOpen = b.msgLeads - b.LL;
  assertTrue(msgOpen >= newCur && msgOpen <= openIdxs.length, `${bc}: โควตา lead ช่องทางข้อความไม่สมเหตุผล (${msgOpen})`);
  let need = msgOpen;
  for (const i of openIdxs) if (curRoles[i].msg) need--;
  for (const i of openIdxs) { if (need <= 0) break; if (curRoles[i].msg) continue; curRoles[i].msg = true; need--; }
  assertEq(need, 0, `${bc}: โควตา lead ช่องทางข้อความที่เปิดอยู่`);
  for (const i of openIdxs) if (!curRoles[i].msg) curRoles[i].msg = false;
  const stCount = { NEW: 0, CONTACTED: 0, QUALIFIED: 0 };
  for (const i of openIdxs) stCount[curRoles[i].st]++;
  assertEq(stCount.NEW, newCur, `13.6 lead NEW ใน P ของ ${bc}`);
  /* lead ของลูกค้าที่ระบุชื่อ (ข้อ 13.8) */
  if (bc === "JP4") {
    const i = openIdxs.find((x) => curRoles[x].st === "NEW" && cs[x].t >= namedCust.thanapon.firstSeen);
    assertTrue(i !== undefined, "ไม่มีช่องเวลา lead NEW ให้คุณธนพล");
    curRoles[i].forceCust = "thanapon"; curRoles[i].msg = true;
  }
  if (bc === "JP2") {
    const ok = openIdxs.filter((x) => !curRoles[x].key && !curRoles[x].noOwner && cs[x].t >= namedCust.natchaya.firstSeen);
    assertTrue(ok.length > 0, "ไม่มีช่องเวลา lead ให้คุณณัฐชยา");
    curRoles[ok[ok.length - 1]].forceCust = "natchaya";
  }

  /* owner ของ lead ใน P */
  const ownerPlanCur = new Array(b.L).fill(null);
  {
    for (const i of noOwnerIdx) ownerPlanCur[i] = "NONE";
    if (bc === "JP1") {
      const quota = { KWAN: { OPEN: 27, LOST: 23, CONV: 104 }, KIM: { OPEN: 23, LOST: 22, CONV: 97 } };
      for (let i = 0; i < b.L; i++) {               // รอบแรก: lead ที่ระบุชื่อ
        if (ownerPlanCur[i] === "NONE") continue;
        const key = curRoles[i].key;
        const own = key === "wilaiwan" ? "KIM" : key === "somchaiIpad" ? "KWAN" : null;
        if (!own) continue;
        quota[own][curRoles[i].type]--; ownerPlanCur[i] = own;
      }
      for (let i = 0; i < b.L; i++) {               // รอบสอง: ที่เหลือ
        if (ownerPlanCur[i]) continue;
        const t = curRoles[i].type;
        const own = quota.KWAN[t] > 0 ? "KWAN" : "KIM";
        quota[own][t]--; ownerPlanCur[i] = own;
      }
      for (const o of ["KWAN", "KIM"]) for (const t of ["OPEN", "LOST", "CONV"]) assertEq(quota[o][t], 0, `13.6 โควตา lead ${o}/${t}`);
    } else for (let i = 0; i < b.L; i++) if (ownerPlanCur[i] !== "NONE") ownerPlanCur[i] = "BM";
  }

  /* ---------- สร้างแถว lead ---------- */
  const lostReasonsLead = [];
  for (let ri = 0; ri < LOST.length; ri++) for (let k = 0; k < leadAlloc[ri][bi]; k++) lostReasonsLead.push(LOST[ri].code);
  assertEq(lostReasonsLead.length, b.LL, `13.4 เหตุผลของ lost lead ${bc}`);
  const openList = [];
  /* prev cohort */
  const convPrevTargets = prevOpps.slice().sort((a, b2) => a.cust.firstSeen - b2.cust.firstSeen || (a.id < b2.id ? -1 : 1));
  const nConvPrev = prevRoles.filter((r) => r.type === "CONV").length;
  let cpi = 0;
  ps.forEach((slot, i) => {
    const role = prevRoles[i];
    let cust, status, opp = null, closed = null, reason = null, chan, fc = null, owner = ownerOf(bc, i);
    if (role.type === "CONV_SPECIAL") {
      const target = opps.find((o) => o.fixedNo === "OP-2026-002790");
      cust = namedCust.somchai; status = "CONVERTED"; opp = target; closed = target.wonAt; chan = "LINE"; fc = slot.t; owner = KWAN;
    } else if (role.type === "PRE_NEW") {
      cust = pickCustAt(prevSet[bc], slot.t, i * 17 + 3); status = "NEW"; chan = MSG_CHANS[i % 4];
      owner = ownerOf(bc, i);
    } else if (role.type === "LOST") {
      cust = pickCustAt(prevSet[bc], slot.t, i * 23 + 7); status = "LOST";
      closed = Math.min(slot.t + 4 * DAY, PREV_END - HOUR); reason = LOST[i % LOST.length].code;
      chan = MSG_CHANS[i % 4]; fc = slot.t + 900;
    } else {
      let ti = Math.min(Math.floor((cpi * convPrevTargets.length) / Math.max(nConvPrev, 1)), convPrevTargets.length - 1);
      for (let k = 0; k < convPrevTargets.length && convPrevTargets[ti].cust.firstSeen > slot.t; k++) ti = (ti + 1) % convPrevTargets.length;
      const target = convPrevTargets[ti]; cpi++;
      assertTrue(target.cust.firstSeen <= slot.t, `${bc}: lead ที่แปลงแล้วเกิดก่อนลูกค้า (prev)`);
      cust = target.cust; status = "CONVERTED"; opp = target;
      closed = Math.max(slot.t, target.created); chan = target.origin; fc = slot.t; owner = target.owner;
    }
    addLead({ branch: bc, cust, cohort: "prev", slotRank: slot.rank, created: slot.t, status, owner,
      chan, opp, closedAt: closed, lostReason: reason, firstContact: chan === "WALK_IN" || chan === "PHONE" ? slot.t : fc,
      interest: LEAD_INTERESTS[i % 5], model: MODELS[i % MODELS.length],
      nextAction: "ติดต่อกลับลูกค้า", nextType: "CALL", nextAt: posTimeSafe(TOMORROW0, (i % 18) + 0.3), prio: "NORMAL",
      isOpen: status === "NEW" });
    if (status === "NEW") openList.push(leads[leads.length - 1]);
  });
  /* cur cohort */
  const convCurTargets = convTargets.slice().sort((a, b2) => a.cust.firstSeen - b2.cust.firstSeen || (a.id < b2.id ? -1 : 1));
  const nConvCur = curRoles.filter((r) => r.type === "CONV").length;
  let cci = 0, lostI = 0, msgSeq = 0;
  cs.forEach((slot, i) => {
    const role = curRoles[i];
    let cust, status, opp = null, closed = null, reason = null, chan, fc = null;
    const ownTag = ownerPlanCur[i];
    let owner = ownTag === "NONE" ? null : ownTag === "KWAN" ? KWAN : ownTag === "KIM" ? KIM : BM[bc];
    if (role.type === "OPEN") {
      status = role.st;
      chan = role.msg ? (role.key === "wilaiwan" ? "INSTAGRAM" : role.forceCust === "thanapon" ? "TIKTOK" : MSG_CHANS[msgSeq++ % 4]) : (i % 5 === 0 ? "PHONE" : "WALK_IN");
      cust = role.forceCust ? namedCust[role.forceCust]
           : role.key === "wilaiwan" ? namedCust.wilaiwan
           : role.key === "somchaiIpad" ? namedCust.somchai : pickCustAt(curSet[bc], slot.t, i * 31 + 17);
      if (status !== "NEW") fc = (chan === "WALK_IN" || chan === "PHONE") ? slot.t : slot.t + RESP_MIN() * 60;
    } else if (role.type === "LOST") {
      status = "LOST"; reason = lostReasonsLead[lostI++];
      chan = MSG_CHANS[msgSeq++ % 4];
      cust = pickCustAt(curSet[bc], slot.t, i * 19 + 5);
      closed = Math.min(slot.t + 3 * DAY, TODAY0 - HOUR);
      fc = slot.t + RESP_MIN() * 60;
    } else {
      let ti = Math.min(Math.floor((cci * convCurTargets.length) / Math.max(nConvCur, 1)), convCurTargets.length - 1);
      for (let k = 0; k < convCurTargets.length && convCurTargets[ti].cust.firstSeen > slot.t; k++) ti = (ti + 1) % convCurTargets.length;
      const target = convCurTargets[ti]; cci++;
      assertTrue(target.cust.firstSeen <= slot.t, `${bc}: lead ที่แปลงแล้วเกิดก่อนลูกค้า (P)`);
      cust = target.cust; status = "CONVERTED"; opp = target; closed = Math.max(slot.t, target.created);
      chan = target.origin;
      fc = (chan === "WALK_IN" || chan === "PHONE") ? slot.t : slot.t + RESP_MIN() * 60;
    }
    const isNamed = role.key === "somchaiIpad";
    const l = addLead({ branch: bc, cust, cohort: "cur", slotRank: slot.rank, created: slot.t, status, owner,
      chan, opp, closedAt: closed, lostReason: reason, firstContact: fc,
      interest: isNamed ? "BUY" : LEAD_INTERESTS[i % 5], model: isNamed ? "iPad Air" : MODELS[i % MODELS.length],
      level: isNamed ? "WARM" : null,
      nextAction: isNamed ? "ติดตามความสนใจ iPad Air" : "ติดต่อกลับลูกค้า",
      nextType: isNamed ? "FOLLOW_UP" : "CALL",
      nextAt: isNamed ? ts(2026, 9, 20, 11, 0) : posTimeSafe(TOMORROW0, (i % 18) + 0.3),
      prio: "NORMAL", isOpen: ["NEW", "CONTACTED", "QUALIFIED"].includes(status), key: role.key });
    if (l.isOpen) openList.push(l);
  });
  assertEq(lostI, b.LL, `13.4 ใช้เหตุผล lost lead ครบ ${bc}`);
  openLeadsByBranch[bc] = openList;
  assertEq(openList.length, b.openLead, `13.6 lead เปิดอยู่ ${bc}`);
  if (bc === "JP1") {
    const curL = leads.filter((l) => l.branch === "JP1" && l.cohort === "cur");
    assertEq(curL.filter((l) => l.owner === KWAN).length, 154, "13.6 Leads ของคุณขวัญ");
    assertEq(curL.filter((l) => l.owner === KIM).length, 142, "13.6 Leads ของคุณคิม");
    assertEq(curL.filter((l) => !l.owner).length, 2, "13.6 Leads ที่ไม่มี owner");
    assertEq(curL.filter((l) => l.status === "LOST" && l.owner === KWAN).length, 23, "13.6 Lost Lead ของคุณขวัญ");
    assertEq(curL.filter((l) => l.status === "LOST" && l.owner === KIM).length, 22, "13.6 Lost Lead ของคุณคิม");
    assertEq(openList.filter((l) => l.owner === KWAN).length, 30, "13.6 lead เปิดอยู่ของคุณขวัญ");
    assertEq(openList.filter((l) => l.owner === KIM).length, 26, "13.6 lead เปิดอยู่ของคุณคิม");
  }
}
/* lead ของคุณสมชายเมื่อ ม.ค. (ข้อ 13.7) */
{
  const janOpp = addOpp({ branch: "JP1", cust: namedCust.somchai, cohort: "jan", owner: KWAN,
    created: ts(2026, 1, 11, 13, 15), stage: "WON", wonAt: ts(2026, 1, 20, 15, 30), wonAmount: 23900,
    closedAt: ts(2026, 1, 20, 15, 30), lostReason: null, origin: "FACEBOOK", interest: "BUY",
    model: "iPhone 15", fixedNo: "OP-2026-000231" });
  addLead({ branch: "JP1", cust: namedCust.somchai, cohort: "jan", slotRank: 312, created: ts(2026, 1, 11, 13, 15),
    status: "CONVERTED", owner: KWAN, chan: "FACEBOOK", opp: janOpp, closedAt: ts(2026, 1, 20, 15, 30),
    lostReason: null, firstContact: ts(2026, 1, 11, 13, 20), interest: "BUY", model: "iPhone 15",
    nextAction: "ติดต่อกลับลูกค้า", nextType: "CALL", nextAt: null, prio: "NORMAL", isOpen: false, fixedNo: "LD-2026-000312" });
}
/* ตรวจยอด lead */
for (const bc of BCODES) {
  const b = BR[bc];
  const L = leads.filter((l) => l.branch === bc);
  assertEq(L.filter((l) => l.created >= P_START && l.created < P_END).length, b.L, `13.2 Leads ${bc}`);
  assertEq(L.filter((l) => l.created >= PREV_START && l.created < PREV_END).length, b.Lp, `13.2b Leads ก่อน ${bc}`);
  assertEq(L.filter((l) => l.status === "LOST" && l.closedAt >= P_START && l.closedAt < P_END).length, b.LL, `13.2 Lost Lead ${bc}`);
  assertEq(L.filter((l) => l.isOpen).length, b.openLead, `13.6 lead เปิดอยู่ ${bc}`);
  assertEq(L.filter((l) => l.isOpen && !l.owner).length, 2, `13.12 LEAD_WITHOUT_OWNER ${bc}`);
  assertEq(L.filter((l) => l.isOpen && l.created < AFTER_28AUG).length, b.dq.LEAD_WITHOUT_OUTCOME, `13.12 LEAD_WITHOUT_OUTCOME ${bc}`);
  const msgP = L.filter((l) => l.created >= P_START && l.created < P_END && MSG_CHANS.includes(l.chan));
  assertEq(msgP.length, b.msgLeads, `12.2 lead ช่องทางข้อความใน P ${bc}`);
  assertEq(msgP.filter((l) => !l.firstContact).length, b.notContacted, `12.2 ยังไม่ติดต่อ ${bc}`);
}
assertEq(leads.filter((l) => l.created >= P_START && l.created < P_END && MSG_CHANS.includes(l.chan) && l.firstContact).length, 214,
  "12.2 ฐาน LEAD_RESPONSE_MIN");
assertEq(leads.filter((l) => l.created >= P_START && l.created < P_END && MSG_CHANS.includes(l.chan) && !l.firstContact).length, 9,
  "12.2 ยังไม่ติดต่อ (องค์กร)");

/* ---------------------------------------------------------------- ใบเสนอราคา (ข้อ 13.7) */
const quotations = [];
{
  const openQuo = [];
  for (const bc of BCODES) for (const o of openOppsByBranch[bc]) if (o.stage === "QUOTATION" || o.stage === "FOLLOW_UP") openQuo.push(o);
  assertEq(openQuo.length, 93, "จำนวนใบเสนอราคาของ opportunity ที่เปิดอยู่");
  const somchaiOpp = opps.find((o) => o.fixedNo === "OP-2026-002998");
  const others = openQuo.filter((o) => o !== somchaiOpp).sort((a, b2) => a.created - b2.created || (a.id < b2.id ? -1 : 1));
  const ANCHOR = ts(2026, 9, 1, 14, 22);
  const slots = new Array(94);
  for (let j = 1; j <= 22; j++) slots[j] = posTimeSafe(ts(2026, 8, 20), ((j - 1) * 12) / 22);
  slots[23] = ANCHOR;
  for (let j = 24; j <= 93; j++) slots[j] = posTimeSafe(ts(2026, 9, 1), 0.5 + ((j - 24) * 9.3) / 70);
  let prevT = 0;
  const rows = [];
  let oi = 0;
  for (let j = 1; j <= 93; j++) {
    if (j === 23) { rows.push({ opp: somchaiOpp, t: ANCHOR, no: "QT-2026-001702" }); prevT = ANCHOR; continue; }
    const o = others[oi++];
    let t = Math.max(slots[j], o.created + HOUR, prevT + 60);
    if (j < 23) assertTrue(t < ANCHOR, `ใบเสนอราคาช่องที่ ${j} ต้องก่อน 1 ก.ย. 14:22 (${fmt(t)})`);
    else assertTrue(t > ANCHOR, `ใบเสนอราคาช่องที่ ${j} ต้องหลัง 1 ก.ย. 14:22`);
    prevT = t;
    rows.push({ opp: o, t });
  }
  rows.forEach((r, i) => {
    const num = 1680 + i;
    const sentAt = r.t;
    const validUntil = bkkDateStr(sentAt + 7 * DAY);
    const q2 = { id: uid(T.QUO, i + 1), no: r.no || `QT-2026-${String(num).padStart(6, "0")}`,
      opp: r.opp, created: r.t, sentAt, validUntil,
      status: sentAt + 7 * DAY < TODAY0 ? "EXPIRED" : "SENT",
      channel: r.opp.origin === "WALK_IN" ? "WALK_IN" : r.opp.origin,
      total: r.no ? 49900 : Math.round((r.opp.expected || 20000) * 1.05 / 100) * 100 };
    if (r.no) { q2.status = "EXPIRED"; q2.validUntil = "2026-09-08"; q2.channel = "LINE"; q2.sentAt = ts(2026, 9, 1, 14, 22); }
    quotations.push(q2);
  });
  assertEq(quotations.find((x) => x.no === "QT-2026-001702") !== undefined, true, "13.7 QT-2026-001702");
  assertEq(quotations[quotations.length - 1].no, "QT-2026-001772", "13.0 เลขใบเสนอราคาสุดท้าย");
}

/* ---------------------------------------------------------------- transaction ref (ข้อ 13.0 ข้อ 6) */
const txns = [];
{
  const wonAll = opps.filter((o) => o.stage === "WON");
  const noTxn = new Set();
  for (const bc of BCODES) {
    const b = BR[bc];
    const cand = wonAll.filter((o) => o.branch === bc && o.wonAt < CLOCK - 3 * DAY).sort((a, b2) => b2.wonAt - a.wonAt);
    assertTrue(cand.length >= b.dq.WON_WITHOUT_TRANSACTION, `${bc}: opportunity WON ที่เก่ากว่า 3 วันไม่พอ`);
    for (let i = 0; i < b.dq.WON_WITHOUT_TRANSACTION; i++) noTxn.add(cand[i].id);
  }
  assertEq(noTxn.size, 12, "13.12 WON_WITHOUT_TRANSACTION");
  let n = 0;
  for (const o of wonAll) {
    if (noTxn.has(o.id)) continue;
    n++;
    txns.push({ id: uid(T.TXN, n), cust: o.cust, branch: o.branch, opp: o,
      type: o.interest === "TRADE_IN" ? "TRADE_IN_SALE" : o.interest === "INSTALLMENT" ? "INSTALLMENT_CONTRACT" : "SALE",
      externalNo: `POS-${yyyymmdd(o.wonAt)}-${String(n).padStart(5, "0")}`, at: o.wonAt, amount: o.wonAmount });
  }
}

/* ---------------------------------------------------------------- งาน (task) */
const tasks = [];
let taskUid = 0;
const ANCHOR_TASK = ts(2026, 9, 8, 16, 40);
function addTask(o) { const t2 = { id: uid(T.TASK, ++taskUid), ...o }; tasks.push(t2); return t2; }
/* 1) task next action ของ lead/opportunity ที่เปิดอยู่ */
for (const bc of BCODES) {
  for (const l of openLeadsByBranch[bc])
    addTask({ branch: bc, cust: l.cust, lead: l, opp: null, type: l.nextType, title: l.nextAction,
      owner: l.owner, prio: l.prio, due: l.nextAt, status: "OPEN", isNext: true, created: l.created, flexible: false });
  for (const o of openOppsByBranch[bc])
    addTask({ branch: bc, cust: o.cust, lead: null, opp: o, type: o.nextType, title: o.nextAction,
      owner: o.owner, prio: o.prio, due: o.nextAt, status: "OPEN", isNext: true,
      created: o.fixedNo === "OP-2026-002998" ? ANCHOR_TASK : o.created,
      fixedNo: o.fixedNo === "OP-2026-002998" ? "TK-2026-012508" : null, flexible: false });
}
/* 2) งานของคุณขวัญตามข้อ 13.10 (นอกเหนือจาก task next action #2 และ #6) */
const KWAN_TASKS = [
  { n: 1,  due: ts(2026, 9, 10, 13, 0),  type: "CALL",       cust: "jiraporn",   title: "โทรยืนยันวันรับเครื่อง",        prio: "NORMAL" },
  { n: 3,  due: ts(2026, 9, 10, 17, 30), type: "FOLLOW_UP",  cust: "sunisa",     title: "ติดตามความสนใจ iPad",           prio: "NORMAL" },
  { n: 4,  due: ts(2026, 9, 10, 19, 0),  type: "FOLLOW_UP",  cust: "kamonchanok",title: "ติดตามเรื่องเทิร์นเครื่อง",      prio: "NORMAL" },
  { n: 5,  due: ts(2026, 9, 11, 10, 0),  type: "CALL",       cust: "manop",      title: "โทรขอเลขใบเสร็จ POS",           prio: "NORMAL" },
  { n: 7,  due: ts(2026, 9, 11, 11, 30), type: "FOLLOW_UP",  cust: "teerapat",   title: "ติดตามการตัดสินใจ iPhone 16",   prio: "NORMAL" },
  { n: 8,  due: ts(2026, 9, 11, 13, 0),  type: "APPOINTMENT",cust: "chanakan",   title: "นัดเข้าร้านดูเครื่อง",           prio: "NORMAL" },
  { n: 9,  due: ts(2026, 9, 11, 14, 30), type: "DOCUMENT",   cust: "pimchanok",  title: "เตรียมเอกสารผ่อน",              prio: "NORMAL" },
  { n: 10, due: ts(2026, 9, 11, 16, 0),  type: "FOLLOW_UP",  cust: "weerayut",   title: "ติดตามราคา AirPods",            prio: "LOW" },
  { n: 11, due: ts(2026, 9, 11, 17, 30), type: "CALL",       cust: "jiraporn",   title: "โทรแจ้งเครื่องพร้อมรับ",        prio: "NORMAL" },
  { n: 12, due: ts(2026, 9, 11, 19, 0),  type: "FOLLOW_UP",  cust: "piyanut",    title: "ติดตามโปรโมชั่นผ่อน 0%",        prio: "NORMAL" },
];
for (const t2 of KWAN_TASKS)
  addTask({ branch: "JP1", cust: namedCust[t2.cust], lead: null, opp: null, type: t2.type, title: t2.title,
    owner: KWAN, prio: t2.prio, due: t2.due, status: "OPEN", isNext: false, flexible: true, tag: `KWAN#${t2.n}` });
/* งานของคุณคิม: เกินกำหนด 3 + วันนี้ 6 (ทั้งหมด FOLLOW_UP · ข้อ 13.10) */
{
  const kimCust = curSet.JP1.filter((c) => c.ownerTag === "KIM" && !Object.values(namedCust).includes(c));
  const kimDue = [ts(2026, 9, 10, 14, 0), ts(2026, 9, 10, 16, 30), ts(2026, 9, 10, 20, 0),
                  ts(2026, 9, 11, 9, 30), ts(2026, 9, 11, 11, 0), ts(2026, 9, 11, 12, 30),
                  ts(2026, 9, 11, 14, 0), ts(2026, 9, 11, 15, 30), ts(2026, 9, 11, 18, 0)];
  kimDue.forEach((d, i) => addTask({ branch: "JP1", cust: kimCust[i], lead: null, opp: null, type: "FOLLOW_UP",
    title: "ติดตามลูกค้า", owner: KIM, prio: "NORMAL", due: d, status: "OPEN", isNext: false, flexible: true, tag: `KIM#${i}` }));
}

/* 3) งาน FOLLOW_UP ที่ due อยู่ใน P (ข้อ 13.2b) */
const fuCustUsed = new Set([namedCust.somchai.id]);
for (const t2 of tasks) if (t2.type === "FOLLOW_UP" && t2.status === "OPEN" && t2.cust) fuCustUsed.add(t2.cust.id);
for (const bc of BCODES) {
  const b = BR[bc], fu = b.fu;
  const doneN = fu.ontime + fu.late;
  const pool = curSet[bc];
  let ci = 0;
  const nextCust = (distinct) => {
    for (let k = 0; k < pool.length; k++) {
      const c = pool[(ci + k) % pool.length];
      if (!distinct || !fuCustUsed.has(c.id)) { ci = (ci + k + 1) % pool.length; if (distinct) fuCustUsed.add(c.id); return c; }
    }
    assertTrue(false, `${bc}: หาลูกค้าสำหรับงาน FOLLOW_UP ไม่ได้`); return pool[0];
  };
  for (let i = 0; i < doneN; i++) {
    const late = i >= fu.ontime;
    const due = late ? posTimeSafe(P_START, 0.3 + (i - fu.ontime) * (26.0 / Math.max(fu.late, 1)))
                     : posTimeSafe(P_START, 0.2 + i * (27.8 / Math.max(fu.ontime, 1)));
    addTask({ branch: bc, cust: nextCust(false), lead: null, opp: null, type: "FOLLOW_UP",
      title: "ติดตามลูกค้าหลังเข้าร้าน", owner: ownerOf(bc, i), prio: "NORMAL", due,
      status: "DONE", completed: late ? due + 30 * HOUR : due - HOUR, isNext: false, flexible: true });
  }
  for (let i = 0; i < fu.openPast; i++)
    addTask({ branch: bc, cust: nextCust(true), lead: null, opp: null, type: "FOLLOW_UP",
      title: "ติดตามลูกค้าที่ค้างอยู่", owner: ownerOf(bc, i), prio: "NORMAL",
      due: posTimeSafe(P_START, 24.2 + i * 0.3), status: "OPEN", isNext: false, flexible: true });
  const graceLeft = bc === "JP1" ? 0 : fu.grace;
  for (let i = 0; i < graceLeft; i++)
    addTask({ branch: bc, cust: nextCust(true), lead: null, opp: null, type: "FOLLOW_UP",
      title: "ติดตามลูกค้า (ครบกำหนดเมื่อวาน)", owner: ownerOf(bc, i), prio: "NORMAL",
      due: ts(2026, 9, 10, 12, 0) + i * 2 * HOUR, status: "OPEN", isNext: false, flexible: true });
}
/* 4) งาน FOLLOW_UP ที่ครบกำหนดหลังช่วง P — เติมให้ OPEN_FOLLOWUP_CUSTOMERS = 117 (ข้อ 13.1) */
{
  const have = new Set();
  for (const t2 of tasks) if (t2.type === "FOLLOW_UP" && (t2.status === "OPEN" || t2.status === "IN_PROGRESS") && t2.cust) have.add(t2.cust.id);
  const need = 117 - have.size;
  assertTrue(need >= 0, `13.1 OPEN_FOLLOWUP_CUSTOMERS เกิน 117 แล้ว (${have.size})`);
  let made = 0;
  if (!have.has(namedCust.kittipong.id)) {
    have.add(namedCust.kittipong.id);
    addTask({ branch: "JP3", cust: namedCust.kittipong, lead: null, opp: null, type: "FOLLOW_UP",
      title: "นัดติดตามครั้งถัดไป", owner: BM.JP3, prio: "NORMAL", due: ts(2026, 9, 15, 11, 0),
      status: "OPEN", isNext: false, flexible: true });
    made++;
  }
  outer2: for (const bc of BCODES) for (const c of curSet[bc]) {
    if (made >= need) break outer2;
    if (have.has(c.id)) continue;
    have.add(c.id);
    addTask({ branch: bc, cust: c, lead: null, opp: null, type: "FOLLOW_UP", title: "นัดติดตามครั้งถัดไป",
      owner: ownerOf(bc, made), prio: "NORMAL", due: posTimeSafe(TOMORROW0, 1 + (made % 20) + 0.4),
      status: "OPEN", isNext: false, flexible: true });
    made++;
  }
  assertEq(made, need, "13.1 เติมงาน FOLLOW_UP ให้ครบ 117 ลูกค้า");
  assertEq(have.size, 117, "13.1 OPEN_FOLLOWUP_CUSTOMERS");
}
/* 5) เวลาสร้างงาน + เลข TK (ข้อ 13.0 ข้อ 8 · TK-2026-012508 = 8 ก.ย. 16:40 · สูงสุด 12660) */
{
  const flexible = tasks.filter((t2) => t2.flexible);
  const fixed = tasks.filter((t2) => !t2.flexible);
  const X = fixed.filter((t2) => t2.created > ANCHOR_TASK).length;
  const need = 152 - X;
  const lateCand = flexible.filter((t2) => t2.due > ANCHOR_TASK + 2 * HOUR).sort((a, b2) => a.due - b2.due);
  assertTrue(need >= 0 && need <= lateCand.length,
    `เลข TK: ต้องการงานที่สร้างหลัง 8 ก.ย. 16:40 อีก ${need} รายการ แต่มีช่องได้ ${lateCand.length} (คงที่แล้ว ${X})`);
  const lateSet = new Set(lateCand.slice(0, need).map((t2) => t2.id));
  let k = 0, e = 0;
  for (const t2 of flexible) {
    if (lateSet.has(t2.id)) { t2.created = Math.min(ANCHOR_TASK + HOUR + k * 60, t2.due); k++; }
    else { t2.created = Math.min(t2.due - 5 * DAY, ANCHOR_TASK - HOUR - (e % 500) * 60); e++; }
    assertTrue(t2.created <= t2.due, "เวลาสร้างงานต้องไม่เกิน due");
  }
  const sorted = tasks.slice().sort((a, b2) => a.created - b2.created || (a.id < b2.id ? -1 : 1));
  const total = sorted.length;
  sorted.forEach((t2, i) => { t2.no = `TK-2026-${String(12660 - total + i + 1).padStart(6, "0")}`; });
  const som = tasks.find((t2) => t2.fixedNo === "TK-2026-012508");
  assertTrue(som !== undefined, "ไม่พบงาน next action ของ OP-2026-002998");
  assertEq(som.no, "TK-2026-012508", "13.7 เลขงานของคุณสมชาย");
  assertEq(sorted[total - 1].no, "TK-2026-012660", "13.0 เลขงานสูงสุด");
}
/* ตรวจยอดงานตามข้อ 13.1 · 13.2b · 13.10 · 13.12 */
{
  const openT = tasks.filter((t2) => t2.status === "OPEN" || t2.status === "IN_PROGRESS");
  const overdue = (t2) => t2.due < TODAY0, todayT = (t2) => t2.due >= TODAY0 && t2.due < TOMORROW0;
  assertEq(openT.filter((t2) => t2.owner === KWAN && todayT(t2)).length, 8, "13.10 งานวันนี้ของคุณขวัญ");
  assertEq(openT.filter((t2) => t2.owner === KWAN && overdue(t2)).length, 4, "13.10 งานเกินกำหนดของคุณขวัญ");
  assertEq(openT.filter((t2) => t2.owner === KIM && todayT(t2)).length, 6, "13.10 งานวันนี้ของคุณคิม");
  assertEq(openT.filter((t2) => t2.owner === KIM && overdue(t2)).length, 3, "13.10 งานเกินกำหนดของคุณคิม");
  assertEq(openT.filter((t2) => t2.branch === "JP1" && overdue(t2) && (t2.owner === KWAN || t2.owner === KIM)).length, 7,
    "13.6 งานเกินกำหนดของทีม JP1-SALES");
  for (const bc of BCODES) {
    const b = BR[bc];
    const inP = tasks.filter((t2) => t2.branch === bc && t2.type === "FOLLOW_UP" && t2.due >= P_START && t2.due < P_END && t2.status !== "CANCELLED");
    const den = inP.filter((t2) => !(t2.status !== "DONE" && t2.due + 24 * HOUR > CLOCK));
    const num = den.filter((t2) => t2.status === "DONE" && t2.completed <= t2.due + 24 * HOUR);
    assertEq(den.length, b.fu.den, `13.2b ตัวหาร FOLLOWUP_COMPLETION ${bc}`);
    assertEq(num.length, b.fu.ontime, `13.2b ตัวตั้ง FOLLOWUP_COMPLETION ${bc}`);
    assertEq(openT.filter((t2) => t2.branch === bc && t2.type === "FOLLOW_UP" && t2.due < TODAY0).length,
      b.dq.OVERDUE_FOLLOWUP, `13.12 OVERDUE_FOLLOWUP ${bc}`);
    assertEq(inP.filter((t2) => t2.status !== "DONE" && todayT(t2)).length, b.fu.today, `13.2b งาน FOLLOW_UP due วันนี้ ${bc}`);
  }
  const fuOpenCust = new Set(openT.filter((t2) => t2.type === "FOLLOW_UP" && t2.cust).map((t2) => t2.cust.id));
  assertEq(fuOpenCust.size, 117, "13.1 OPEN_FOLLOWUP_CUSTOMERS");
}

/* ---------------------------------------------------------------- เลข visit / queue (ข้อ 4.1 · 13.0 ข้อ 8) */
{
  /* 8 ก.ย. ที่ JP1: visit ของคุณสมชาย 16:10 ต้องเป็นลำดับที่ 17 (V-JP1-260908-017) */
  const d8 = visits.filter((v) => v.branch === "JP1" && bkkDateStr(v.t) === "2026-09-08");
  const som8 = d8.find((v) => v.fixedNo === "V-JP1-260908-017");
  const rest = d8.filter((v) => v !== som8).sort((a, b2) => a.t - b2.t || (a.id < b2.id ? -1 : 1));
  assertTrue(rest.length >= 16, `8 ก.ย. JP1 มี visit ไม่พอ (${rest.length})`);
  const base8 = ts(2026, 9, 8);
  rest.forEach((v, i) => {
    v.t = i < 16 ? base8 + 10 * HOUR + Math.round((i * 5.8 * HOUR) / 16)
                 : base8 + 16 * HOUR + 20 * 60 + Math.round(((i - 16) * 4.3 * HOUR) / Math.max(rest.length - 16, 1));
    if (v.end !== null && v.end !== undefined && !v.closedBySystem) v.end = Math.min(v.t + 1800, base8 + 23 * HOUR + 59 * 60 + 59);
  });
  const byBD = new Map();
  for (const v of visits) {
    const k = v.branch + "|" + bkkDateStr(v.t);
    if (!byBD.has(k)) byBD.set(k, []);
    byBD.get(k).push(v);
  }
  const runVisit = [], runQueue = [];
  for (const [k, list] of byBD) {
    const [bc, dstr] = k.split("|");
    list.sort((a, b2) => a.t - b2.t || (a.id < b2.id ? -1 : 1));
    let qn = 0;
    list.forEach((v, i) => {
      v.no = `V-${bc}-${yymmdd(v.t)}-${String(i + 1).padStart(3, "0")}`;
      if (v.chan === "WALK_IN") { qn++; v.queue = qn; }
    });
    runVisit.push({ scope_key: `VISIT:${bc}:${dstr.replace(/-/g, "")}`, last_value: list.length });
    if (qn > 0) runQueue.push({ scope_key: `QUEUE:${bc}:${dstr.replace(/-/g, "")}`, last_value: qn });
  }
  var RUN_VISIT = runVisit, RUN_QUEUE = runQueue;
  for (const v of visits) if (v.fixedNo) assertEq(v.no, v.fixedNo, `13.7/13.11 เลข visit ${v.fixedNo}`);
  const q1 = visits.find((v) => v.branch === "JP1" && v.t === ts(2026, 9, 11, 10, 5));
  assertEq(q1.queue, 1, "13.11 คิว 001 ของ JP1");
  assertEq(RUN_VISIT.find((r) => r.scope_key === "VISIT:JP1:20260911").last_value, 7, "13.0 VISIT:JP1:20260911");
  assertEq(RUN_QUEUE.find((r) => r.scope_key === "QUEUE:JP1:20260911").last_value, 4, "13.0 QUEUE:JP1:20260911");
  for (const [bc, v, qv] of [["JP2", 4, 2], ["JP3", 4, 2], ["JP4", 2, 1]]) {
    assertEq(RUN_VISIT.find((r) => r.scope_key === `VISIT:${bc}:20260911`).last_value, v, `13.0 VISIT:${bc}:20260911`);
    assertEq(RUN_QUEUE.find((r) => r.scope_key === `QUEUE:${bc}:20260911`).last_value, qv, `13.0 QUEUE:${bc}:20260911`);
  }
}
/* interaction ต้นทางของทุก visit ที่ไม่ใช่ CANCELLED (ข้อ 3.3 ข้อ 1) */
for (const v of visits) {
  if (v.status === "CANCELLED") continue;
  addInteraction({ branch: v.branch, cust: v.cust, visit: v, root: true, chan: v.chan, dir: "INBOUND",
    itype: v.itype || (v.outcome === "PURCHASED" ? "PURCHASE" : v.chan === "WALK_IN" ? "VISIT" : "INQUIRY"),
    t: v.t, owner: v.owner, summary: v.summary || null });
}
/* ตัวนับของคุณสมชาย (ข้อ 13.7) */
{
  const c = namedCust.somchai;
  assertEq(visits.filter((v) => v.cust === c).length, 6, "13.7 จำนวน visit ของคุณสมชาย");
  assertEq(interactions.filter((i) => i.cust === c).length, 7, "13.7 จำนวน interaction ของคุณสมชาย");
  assertEq(visits.filter((v) => v.cust === c && v.chan === "WALK_IN").length, 3, "13.7 เข้าร้านของคุณสมชาย");
  assertEq(opps.filter((o) => o.cust === c && o.stage === "WON").length, 2, "13.7 การซื้อของคุณสมชาย");
  assertEq(opps.filter((o) => o.cust === c && o.stage === "WON").reduce((a, o) => a + o.wonAmount, 0), 52800, "13.7 ยอดซื้อสะสม");
}

/* ---------------------------------------------------------------- ช่องทางติดต่อ · tag · ความยินยอม · โน้ต */
const contacts = [];
let contactUid = 0;
function addContact(cust, type, raw, valid = true, primary = true) {
  contacts.push({ id: uid(T.CONTACT, ++contactUid), cust, type, raw, valid, primary });
}
const NAMED_PHONE = { somchai: "081-234-5678", natchaya: "095-123-4567", kittipong: "090-987-6543",
  wilaiwan: "098-765-4321", thanapon: "081-456-7890", somchai2: "081-234-5679",
  natthapon: "089-111-2222", natthaporn: "089-111-2222", jiraporn: "089-222-5678" };
{
  const namedIds = new Map();
  for (const [k, c] of Object.entries(namedCust)) if (NAMED_PHONE[k]) namedIds.set(c.id, NAMED_PHONE[k]);
  for (const c of customers) {
    const activity = ["A", "Bold", "Bprev", "Cold", "Cprev"].includes(c.pool);
    if (namedIds.has(c.id)) { addContact(c, "PHONE", namedIds.get(c.id)); continue; }
    if (activity) addContact(c, "PHONE", fillerPhone());
  }
  for (const c of dqCust.INVALID_PHONE) addContact(c, "PHONE", "12345", false);
  addContact(namedCust.somchai, "LINE_ID", "somchai_j", true, false);
  addContact(namedCust.somchai, "EMAIL", "somchai.j@example.com", true, false);
}
const TAGS = [["VIP", "ลูกค้าคนสำคัญ (VIP)"], ["INSTALLMENT", "ผ่อนชำระ"], ["STUDENT", "นักศึกษา"],
  ["TRADE_IN", "Trade-in"], ["IPHONE_FAN", "สาย iPhone"]];
const customerTags = [["somchai", "VIP"], ["somchai", "INSTALLMENT"], ["somchai", "IPHONE_FAN"]];

/* ---------------------------------------------------------------- ข้อมูลซ้ำ · การรวมลูกค้า */
const dupDecisions = [];
{
  const cands = DUP_CAND_SEQ.map((s) => byNo.get(`CUS-2026-${String(s).padStart(6, "0")}`));
  const targets = [];
  targets.push(namedCust.natthapon);                       // CUS-2026-006633 (ข้อ 13.14)
  for (const bc of BCODES) {
    const want = BR[bc].dq.DUP - (bc === "JP1" ? 1 : 0);
    let got = 0;
    for (const c of curSet[bc]) {
      if (got >= want) break;
      if (c.pool !== "A" || targets.includes(c)) continue;
      targets.push(c); got++;
    }
    assertEq(got, want, `13.12 ลูกค้าที่สงสัยว่าซ้ำของ ${bc}`);
  }
  assertEq(targets.length, 16, "13.12 DUPLICATE_SUSPECTED");
  targets.forEach((c, i) => {
    const cand = i === 0 ? namedCust.natthaporn : cands[i];
    assertTrue(cand && cand.status === "ACTIVE" && cand.id !== c.id, `คู่เทียบข้อมูลซ้ำที่ ${i} ไม่ถูกต้อง`);
    dupDecisions.push({ id: uid(T.DUP, i + 1), cust: c, cand,
      score: 100, rules: ["เบอร์โทรตรงกัน"],
      reason: i === 0 ? "FAMILY_SHARED_PHONE" : ["FAMILY_SHARED_PHONE", "DIFFERENT_PERSON", "OTHER"][i % 3],
      note: i % 3 === 2 ? "ลูกค้ายืนยันว่าเป็นคนละคน" : null,
      createdBy: i === 0 ? KIM : ownerOf(c.branch, i),
      createdAt: i === 0 ? ts(2026, 9, 3, 15, 0) : Math.max(c.created, P_START) + DAY });
  });
  /* ให้คู่ตัวอย่างของหน้า 12 ใช้เบอร์เดียวกันจริง (ข้อ 13.14) */
  namedCust.natthaporn.first_branch_forced = "JP1";
}
const merges = [];
customers.filter((c) => c.status === "MERGED").forEach((m, i) => {
  merges.push({ id: uid(T.MERGE, i + 1), no: `MG-2026-${String(i + 1).padStart(6, "0")}`,
    survivor: m.mergedInto, merged: m.id, at: ts(2026, 6, 1) + i * DAY, by: S["ST-0002"].id });
});
assertEq(merges.length, 16, "13.0 จำนวนการรวมลูกค้า");

/* ---------------------------------------------------------------- แจ้งเตือน · export · คำขอบทบาท · audit (ข้อ 13.14) */
const notifications = [];
{
  let n = 0;
  const add = (staff, code, title, body, entityType, entityId, entityRef, at, key) =>
    notifications.push({ id: uid(T.NOTIF, ++n), staff, code, title, body, entityType, entityId, entityRef, at, key });
  const openT = tasks.filter((t) => t.status === "OPEN");
  const kwanOverdueFU = openT.filter((t) => t.owner === KWAN && t.type === "FOLLOW_UP" && t.due < TODAY0).sort((a, b) => a.due - b.due);
  assertEq(kwanOverdueFU.length, 3, "13.14 งานติดตามเกินกำหนดของคุณขวัญ");
  const kwanOverdueOther = openT.filter((t) => t.owner === KWAN && t.type !== "FOLLOW_UP" && t.due < TODAY0);
  const kwanTodayLate = openT.filter((t) => t.owner === KWAN && t.due >= TODAY0 && t.due <= CLOCK);
  assertEq(kwanOverdueOther.length, 1, "13.14 งานเกินกำหนดอื่นของคุณขวัญ");
  assertEq(kwanTodayLate.length, 1, "13.14 งานวันนี้ที่เลยเวลาของคุณขวัญ");
  for (const t of kwanOverdueFU)
    add(KWAN, "FOLLOWUP_OVERDUE", "ติดตามเกินกำหนด", "งานติดตาม " + t.title + " เกินกำหนดแล้ว", "TASK", t.id, t.no, t.due + 24 * HOUR, `FOLLOWUP_OVERDUE:${t.id}:0`);
  for (const t of [...kwanOverdueOther, ...kwanTodayLate])
    add(KWAN, "TASK_OVERDUE", "งานเกินกำหนด", "งาน " + t.title + " เกินกำหนดแล้ว", "TASK", t.id, t.no, t.due + HOUR, `TASK_OVERDUE:${t.id}:0`);
  add(KWAN, "DATA_MISSING", "ข้อมูลไม่ครบ", "มีรายการที่ข้อมูลไม่ครบรอการแก้ไข", null, null, null, ts(2026, 9, 11, 9, 0), "DATA_MISSING:2026-09-11:0");
  const wilaiLead = leads.find((l) => l.key === "wilaiwan");
  assertTrue(wilaiLead !== undefined, "ไม่พบ lead ของคุณวิไลวรรณ");
  wilaiLead.fixedNo = "LD-2026-007512";
  add(KIM, "LEAD_ASSIGNED", "ได้รับมอบหมาย Lead", "คุณได้รับมอบหมาย Lead LD-2026-007512", "LEAD", wilaiLead.id, "LD-2026-007512", ts(2026, 9, 10, 18, 5), `LEAD_ASSIGNED:${wilaiLead.id}`);
  const kimOverdueFU = openT.filter((t) => t.owner === KIM && t.type === "FOLLOW_UP" && t.due < TODAY0).sort((a, b) => a.due - b.due);
  assertEq(kimOverdueFU.length, 3, "13.14 งานติดตามเกินกำหนดของคุณคิม");
  for (const t of kimOverdueFU)
    add(KIM, "FOLLOWUP_OVERDUE", "ติดตามเกินกำหนด", "งานติดตาม " + t.title + " เกินกำหนดแล้ว", "TASK", t.id, t.no, t.due + 24 * HOUR, `FOLLOWUP_OVERDUE:${t.id}:0`);
  add(KIM, "DATA_MISSING", "ข้อมูลไม่ครบ", "มีรายการที่ข้อมูลไม่ครบรอการแก้ไข", null, null, null, ts(2026, 9, 11, 9, 0), "DATA_MISSING:2026-09-11:0");
  const unassigned = leads.filter((l) => l.branch === "JP1" && l.isOpen && !l.owner);
  assertEq(unassigned.length, 2, "13.14 lead JP1 ที่ไม่มีผู้รับผิดชอบ");
  for (const st of [NAT, JAY]) {
    for (const l of unassigned)
      add(st, "LEAD_UNASSIGNED", "Lead ยังไม่มีผู้รับผิดชอบ", "Lead ยังไม่มีผู้รับผิดชอบ", "LEAD", l.id, null, l.created + HOUR, `LEAD_UNASSIGNED:${l.id}:0`);
    add(st, "DUPLICATE_SUSPECTED", "ลูกค้าอาจซ้ำ", "มีลูกค้าที่อาจซ้ำรอการตัดสิน", null, null, null, ts(2026, 9, 10, 18, 0), "DUPLICATE_SUSPECTED:JP1:2026-09-10");
  }
  add(JAY, "VISIT_OUTCOME_MISSING", "ไม่ได้บันทึกผลการให้บริการ", "มีการมาติดต่อที่ยังไม่ได้บันทึกผล", null, null, null, ts(2026, 9, 11, 0, 5), "VISIT_OUTCOME_MISSING:JP1:2026-09-10:0");
  add(S["ST-0002"].id, "EXPORT_APPROVAL_REQUIRED", "มีคำขอส่งออกรออนุมัติ", "คำขอส่งออก EX-2026-000031 รออนุมัติ", "EXPORT", uid(T.EXPORT, 31), "EX-2026-000031", ts(2026, 9, 10, 16, 20), `EXPORT_APPROVAL_REQUIRED:${uid(T.EXPORT, 31)}`);
  add(S["ST-0001"].id, "ROLE_GRANT_APPROVAL_REQUIRED", "มีคำขอมอบบทบาทรออนุมัติ", "คำขอ RG-2026-0003 รออนุมัติ", "ROLE_GRANT", uid(T.RG, 3), "RG-2026-0003", ts(2026, 9, 11, 9, 12), `ROLE_GRANT_APPROVAL_REQUIRED:${uid(T.RG, 3)}`);
  const tally = {};
  for (const x of notifications) tally[x.staff] = (tally[x.staff] || 0) + 1;
  assertEq(tally[KWAN], 6, "13.14 กระดิ่งของคุณขวัญ");
  assertEq(tally[KIM], 5, "13.14 กระดิ่งของคุณคิม");
  assertEq(tally[NAT], 3, "13.14 กระดิ่งของคุณนัท");
  assertEq(tally[JAY], 4, "13.14 กระดิ่งของคุณเจ");
  assertEq(tally[S["ST-0002"].id], 1, "13.14 กระดิ่งของคุณแพร");
  assertEq(tally[S["ST-0001"].id], 1, "13.14 กระดิ่งของจ๋าอั๋น");
  assertEq(notifications.length, 20, "13.14 จำนวนแจ้งเตือนทั้งหมด");
}
/* lead ที่ระบุชื่อ (ข้อ 13.7) */
{
  const l1 = leads.find((l) => l.key === "somchaiIpad"); assertTrue(!!l1, "ไม่พบ lead iPad ของคุณสมชาย");
  l1.fixedNo = "LD-2026-007460";
  const l2 = leads.find((l) => l.cohort === "prev" && l.cust === namedCust.somchai); assertTrue(!!l2, "ไม่พบ lead 12 ส.ค. ของคุณสมชาย");
  l2.fixedNo = "LD-2026-006650";
}
/* เลข LD */
{
  const prevL = leads.filter((l) => l.cohort === "prev").sort((a, b) => a.slotRank - b.slotRank);
  const curL = leads.filter((l) => l.cohort === "cur").sort((a, b) => a.slotRank - b.slotRank);
  prevL.forEach((l, i) => { l.no = `LD-2026-${String(5828 + i).padStart(6, "0")}`; });
  curL.forEach((l, i) => { l.no = `LD-2026-${String(6654 + i).padStart(6, "0")}`; });
  for (const l of leads) if (l.cohort === "jan") l.no = "LD-2026-000312";
  for (const l of leads) if (l.fixedNo) assertEq(l.no, l.fixedNo, `13.7/13.14 เลข lead ${l.fixedNo}`);
  assertEq(curL[curL.length - 1].no, "LD-2026-007545", "13.0 เลข lead สูงสุด");
}
/* เลข OP */
{
  const byCohort = (names, from) => {
    const list = opps.filter((o) => names.includes(o.cohort)).sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
    list.forEach((o, i) => { o.no = `OP-2026-${String(from + i).padStart(6, "0")}`; });
    return list;
  };
  byCohort(["old"], 2292);
  byCohort(["prevClosedPrev", "prevClosedP"], 2431);
  const cur = byCohort(["cur"], 2754);
  for (const o of opps) if (o.cohort === "jan") o.no = "OP-2026-000231";
  for (const o of opps) if (o.fixedNo) assertEq(o.no, o.fixedNo, `13.7 เลข opportunity ${o.fixedNo}`);
  assertEq(cur[cur.length - 1].no, "OP-2026-003121", "13.0 เลข opportunity สูงสุด");
}

/* ---------------------------------------------------------------- invariant ข้อ 3.2 */
{
  const earliest = new Map(), firstEv = new Map();
  const note = (cust, t, chan, branch) => {
    if (!cust) return;
    const cur = earliest.get(cust.id);
    if (cur === undefined || t < cur) { earliest.set(cust.id, t); firstEv.set(cust.id, { chan, branch }); }
  };
  for (const v of visits) if (v.status !== "CANCELLED") note(v.cust, v.t, v.chan, v.branch);
  for (const i of interactions) note(i.cust, i.t, i.chan, i.branch);
  for (const l of leads) note(l.cust, l.created, l.chan, l.branch);
  for (const o of opps) { note(o.cust, o.created, o.origin, o.branch); if (o.closedAt) note(o.cust, o.closedAt, null, o.branch); }
  for (const t of txns) note(t.cust, t.at, null, t.branch);
  let bad = 0, badChan = 0, badBranch = 0;
  for (const c of customers) {
    const e = earliest.get(c.id);
    if (e === undefined) continue;
    if (e < c.firstSeen) bad++;
    else if (e === c.firstSeen) {
      const f = firstEv.get(c.id);
      if (f.branch !== c.branch) badBranch++;
    }
  }
  assertEq(bad, 0, "ข้อ 3.2 invariant: ไม่มีกิจกรรมก่อน first_seen_at");
  assertEq(badBranch, 0, "ข้อ 3.2 สาขาของกิจกรรมแรกตรงกับ first_branch_id");
}

/* ===================================================================================== */
/* ส่วนที่ 3 — เขียน SQL                                                                   */
/* ===================================================================================== */
raw(`-- =====================================================================================
-- supabase/seed.sql — ข้อมูลตัวอย่างของ JAUN CRM · Customer 360 (CANONICAL ข้อ 13)
-- สร้างอัตโนมัติด้วย tools/db/gen-seed.mjs (PRNG seed 20260911) — ห้ามแก้ด้วยมือ
-- "ตอนนี้" = 11 ก.ย. 2569 10:24 น. · P = [13 ส.ค. 2569, 12 ก.ย. 2569)
-- =====================================================================================
SELECT set_config('app.bulk', 'on', false);
SELECT set_config('app.seed_mode', 'on', false);
UPDATE app.settings SET value = '"dev"'::jsonb WHERE key = 'env';
UPDATE app.settings SET value = '{"as_of": "2026-09-11T10:24:00+07:00"}'::jsonb WHERE key = 'clock';`);

const OC = ["id", "organization_id", "code", "name_th", "is_active"];
batchInsert("core.organizations", ["id", "code", "name_th", "is_active"], [{ id: ORG, code: "JAUN", name_th: "JAUN", is_active: true }]);
batchInsert("core.business_units", OC, [
  { id: BU.JAUNPHONE, organization_id: ORG, code: "JAUNPHONE", name_th: "JAUN PHONE", is_active: true },
  { id: BU.JPM, organization_id: ORG, code: "JPM", name_th: "JAUN POWER MONEY", is_active: true }]);
batchInsert("core.branches", ["id", "organization_id", "business_unit_id", "code", "name_th", "branch_type", "is_active"], [
  { id: BRANCH.JP1, organization_id: ORG, business_unit_id: BU.JAUNPHONE, code: "JP1", name_th: "JAUNPHONE 1", branch_type: "store", is_active: true },
  { id: BRANCH.JP2, organization_id: ORG, business_unit_id: BU.JAUNPHONE, code: "JP2", name_th: "JAUNPHONE 2", branch_type: "store", is_active: true },
  { id: BRANCH.JP3, organization_id: ORG, business_unit_id: BU.JAUNPHONE, code: "JP3", name_th: "JAUNPHONE 3", branch_type: "store", is_active: true },
  { id: BRANCH.JP4, organization_id: ORG, business_unit_id: BU.JAUNPHONE, code: "JP4", name_th: "JAUNPHONE 4", branch_type: "store", is_active: true },
  { id: BRANCH.JPON, organization_id: ORG, business_unit_id: BU.JAUNPHONE, code: "JPON", name_th: "ทีมออนไลน์ส่วนกลาง", branch_type: "online_team", is_active: true }]);
batchInsert("core.teams", ["id", "organization_id", "branch_id", "code", "name_th", "is_active"],
  [["JP1-SALES", BRANCH.JP1, "ทีมขาย JAUNPHONE 1"], ["JP2-SALES", BRANCH.JP2, "ทีมขาย JAUNPHONE 2"],
   ["JP3-SALES", BRANCH.JP3, "ทีมขาย JAUNPHONE 3"], ["JP4-SALES", BRANCH.JP4, "ทีมขาย JAUNPHONE 4"],
   ["JPON-ADMIN", BRANCH.JPON, "ทีมแอดมินออนไลน์"]].map(([c, b, n]) =>
    ({ id: TEAM[c], organization_id: ORG, branch_id: b, code: c, name_th: n, is_active: true })));

/* auth.users ครบ 14 คน · คุณโอ๊ต (ST-0051) ยังไม่ยืนยันอีเมลและยังไม่เปิดใช้งาน (ข้อ 7.3 · 13.5) */
batchInsert("auth.users", ["id", "email", "email_confirmed_at"],
  STAFF_DEF.map((s) => ({ id: S[s.code].userId, email: s.email,
    email_confirmed_at: s.status === "ACTIVE" ? fmt(ts(2026, 1, 5, 9, 0)) : null })));
batchInsert("auth.mfa_factors", ["id", "user_id", "factor_type", "status"],
  STAFF_DEF.filter((s) => s.status === "ACTIVE" && s.role && MFA_ROLES.has(s.role))
    .map((s, i) => ({ id: uid(T.MFA, i + 1), user_id: S[s.code].userId, factor_type: "totp", status: "verified" })));
batchInsert("core.staff_profiles",
  ["id", "organization_id", "staff_code", "employee_code", "display_name", "nickname", "email", "user_id", "status", "invite_expires_at", "created_at", "updated_at"],
  STAFF_DEF.map((s) => ({ id: S[s.code].id, organization_id: ORG, staff_code: s.code, employee_code: s.code.replace("ST-", "EMP"),
    display_name: s.name, nickname: s.name, email: s.email, user_id: S[s.code].userId,
    status: s.status, invite_expires_at: s.status === "INVITED" ? fmt(ts(2026, 9, 17, 9, 0)) : null,
    created_at: fmt(ts(2026, 1, 5, 9, 0)), updated_at: fmt(ts(2026, 1, 5, 9, 0)) })));
{
  const rows = [];
  let i = 0;
  for (const s of STAFF_DEF) {
    if (!s.role) continue;
    const brs = s.branch === "ALL4" ? ["JP1", "JP2", "JP3", "JP4"] : s.branch ? [s.branch] : [null];
    for (const b of brs) rows.push({ id: uid(T.STAFF, 100 + (++i)), organization_id: ORG, staff_id: S[s.code].id,
      role_code: s.role, branch_id: b ? BRANCH[b] : null, valid_from: fmt(ts(2026, 1, 5, 9, 0)) });
  }
  batchInsert("core.staff_role_assignments", ["id", "organization_id", "staff_id", "role_code", "branch_id", "valid_from"], rows);
}
batchInsert("core.team_members", ["id", "organization_id", "team_id", "staff_id", "is_leader", "valid_from"],
  STAFF_DEF.filter((s) => s.team).map((s, i) => ({ id: uid(T.TEAM, 100 + i), organization_id: ORG,
    team_id: TEAM[s.team], staff_id: S[s.code].id, is_leader: !!s.leader, valid_from: fmt(ts(2026, 1, 5, 9, 0)) })));
batchInsert("core.staff_invitations", ["id", "organization_id", "staff_id", "email", "invited_by", "invited_at", "expires_at"],
  [{ id: uid(T.INVITE, 1), organization_id: ORG, staff_id: S["ST-0051"].id, email: "oat@example.com",
     invited_by: S["ST-0003"].id, invited_at: fmt(ts(2026, 9, 10, 9, 0)), expires_at: fmt(ts(2026, 9, 17, 9, 0)) }]);
batchInsert("crm.tags", ["id", "organization_id", "code", "label_th", "is_active"],
  TAGS.map(([c, l], i) => ({ id: uid(T.TAG, i + 1), organization_id: ORG, code: c, label_th: l, is_active: true })));

/* ---- ลูกค้า ---- */
{
  const rows = customers.map((c) => {
    if (!c.first) { const [f, l] = fillerName(); c.first = f; c.last = l; }
    if (c.province === undefined) c.province = PROVINCES[(c.seq + c.year) % PROVINCES.length];
    return { id: c.id, organization_id: ORG, customer_no: c.no, first_name: c.first, last_name: c.last,
      nickname: null, customer_type: "INDIVIDUAL", first_seen_at: fmt(c.firstSeen), first_channel_code: c.chan,
      first_source_code: c.source || null, first_branch_id: BRANCH[c.branch], owner_staff_id: resolveOwner(c.ownerTag, c.branch),
      lifecycle_stage: "IDENTIFIED", record_status: "ACTIVE", merged_into_id: null, province_code: c.province,
      legal_hold: false, created_via: c.createdVia, has_open_followup: false, has_new_lead: false,
      created_at: fmt(c.created), updated_at: fmt(c.created) };
  });
  batchInsert("crm.customers", Object.keys(rows[0]), rows, 500);
  const merged = customers.filter((c) => c.status === "MERGED");
  raw(`UPDATE crm.customers c SET record_status = 'MERGED', merged_into_id = v.into_id::uuid\n` +
      `FROM (VALUES\n  ${merged.map((m) => `('${m.id}','${m.mergedInto}')`).join(",\n  ")}\n) AS v(cid, into_id)\nWHERE c.id = v.cid::uuid;`);
}
batchInsert("crm.customer_contacts", ["id", "organization_id", "customer_id", "contact_type", "value_raw", "is_primary", "is_valid", "is_active", "created_at", "updated_at"],
  contacts.map((x) => ({ id: x.id, organization_id: ORG, customer_id: x.cust.id, contact_type: x.type, value_raw: x.raw,
    is_primary: x.primary, is_valid: x.valid, is_active: true, created_at: fmt(x.cust.created), updated_at: fmt(x.cust.created) })), 500);
batchInsert("crm.customer_tags", ["id", "organization_id", "customer_id", "tag_id", "created_at", "updated_at"],
  customerTags.map(([ck, tg], i) => ({ id: uid(T.TAG, 500 + i), organization_id: ORG, customer_id: namedCust[ck].id,
    tag_id: TAGS.findIndex(([c]) => c === tg) >= 0 ? uid(T.TAG, TAGS.findIndex(([c]) => c === tg) + 1) : null,
    created_at: fmt(ts(2026, 1, 20, 15, 30)), updated_at: fmt(ts(2026, 1, 20, 15, 30)) })));
batchInsert("crm.customer_consents", ["id", "organization_id", "customer_id", "purpose_code", "status", "notice_version", "channels", "captured_via", "captured_by", "captured_at", "evidence", "created_at", "updated_at"],
  [{ id: uid(T.CONSENT, 1), organization_id: ORG, customer_id: namedCust.somchai.id, purpose_code: "PRIVACY_NOTICE",
     status: "GRANTED", notice_version: "PN-2026-01", channels: "{}", captured_via: "LINK_SENT", captured_by: KWAN,
     captured_at: fmt(ts(2026, 1, 11, 13, 20)), evidence: "ส่งลิงก์ประกาศความเป็นส่วนตัวทาง LINE", created_at: fmt(ts(2026, 1, 11, 13, 20)), updated_at: fmt(ts(2026, 1, 11, 13, 20)) },
   { id: uid(T.CONSENT, 2), organization_id: ORG, customer_id: namedCust.somchai.id, purpose_code: "MARKETING",
     status: "GRANTED", notice_version: "PN-2026-01", channels: "{LINE}", captured_via: "STAFF_FORM", captured_by: KWAN,
     captured_at: fmt(ts(2026, 1, 20, 15, 40)), evidence: "ลูกค้าอายุ 20 ปีขึ้นไป · ยินยอมรับข่าวสารทาง LINE", created_at: fmt(ts(2026, 1, 20, 15, 40)), updated_at: fmt(ts(2026, 1, 20, 15, 40)) }]);
batchInsert("crm.customer_notes", ["id", "organization_id", "customer_id", "branch_id", "body", "is_pinned", "created_at", "created_by", "updated_at", "updated_by"],
  [{ id: uid(T.NOTE, 1), organization_id: ORG, customer_id: namedCust.somchai.id, branch_id: BRANCH.JP1,
     body: "ชอบให้ติดต่อทาง LINE หลัง 18:00", is_pinned: true, created_at: fmt(ts(2026, 9, 8, 17, 5)),
     created_by: KWAN, updated_at: fmt(ts(2026, 9, 8, 17, 5)), updated_by: KWAN }]);

/* ---- visit ---- */
{
  const rows = visits.map((v) => ({
    id: v.id, organization_id: ORG, visit_no: v.no, branch_id: BRANCH[v.branch], team_id: teamOf(v.branch, v.owner),
    channel_code: v.chan, status: v.status, queue_no: v.queue ?? null, party_size: v.party,
    customer_id: v.cust ? v.cust.id : null, interest_code: v.chan === "WALK_IN" ? (v.interest || "INQUIRY") : (v.interest || null),
    source_code: v.chan === "WALK_IN" ? (v.cust ? v.cust.source : "PASSING_BY") : null,
    started_at: fmt(v.t),
    service_started_at: v.status === "WAITING" || v.status === "LEFT" ? null : fmt(v.t),
    ended_at: v.status === "WAITING" || v.status === "IN_SERVICE" ? null : fmt(v.end ?? v.t + 1800),
    owner_staff_id: v.status === "WAITING" ? null : (v.owner || ownerOf(v.branch, 0)),
    outcome_code: v.outcome, cancel_reason: null, closed_by_system: !!v.closedBySystem,
    created_at: fmt(v.t), created_by: v.owner || null, updated_at: fmt(v.t), updated_by: v.owner || null }));
  batchInsert("crm.visits", Object.keys(rows[0]), rows, 500);
}
/* ---- interaction ---- */
{
  const rows = interactions.map((i) => ({
    id: i.id, organization_id: ORG, customer_id: i.cust ? i.cust.id : null, visit_id: i.visit ? i.visit.id : null,
    is_visit_root: !!i.root, lead_id: null, opportunity_id: null, branch_id: BRANCH[i.branch],
    channel_code: i.chan, direction: i.dir, interaction_type_code: i.itype, occurred_at: fmt(i.t),
    owner_staff_id: i.owner || null, summary: i.summary || null,
    created_at: fmt(i.t), created_by: i.owner || null, updated_at: fmt(i.t), updated_by: i.owner || null }));
  batchInsert("crm.interactions", Object.keys(rows[0]), rows, 500);
}
/* ---- opportunity (lead_id เติมหลังใส่ lead) ---- */
{
  const rows = opps.map((o) => {
    const open = ["INTERESTED", "QUOTATION", "FOLLOW_UP"].includes(o.stage);
    return { id: o.id, organization_id: ORG, opportunity_no: o.no, customer_id: o.cust.id, lead_id: null,
      origin_channel_code: o.origin, origin_visit_id: null, branch_id: BRANCH[o.branch],
      owner_staff_id: o.owner, team_id: teamOf(o.branch, o.owner), interest_code: o.interest,
      stage: o.stage, priority_code: open ? (o.prio || "NORMAL") : null,
      expected_amount: open ? o.expected : (o.wonAmount || 0),
      next_action: open ? o.nextAction : null, next_action_type_code: open ? o.nextType : null,
      next_action_at: open ? fmt(o.nextAt) : null,
      won_amount: o.stage === "WON" ? o.wonAmount : null, won_at: o.stage === "WON" ? fmt(o.wonAt) : null,
      closed_at: o.closedAt ? fmt(o.closedAt) : null, lost_reason_code: o.lostReason, lost_note: null,
      created_at: fmt(o.created), created_by: o.owner, updated_at: fmt(o.closedAt || o.created), updated_by: o.owner };
  });
  batchInsert("crm.opportunities", Object.keys(rows[0]), rows, 500);
}
/* ---- lead ---- */
{
  const rows = leads.map((l) => {
    const open = ["NEW", "CONTACTED", "QUALIFIED"].includes(l.status);
    return { id: l.id, organization_id: ORG, lead_no: l.no, customer_id: l.cust.id, branch_id: BRANCH[l.branch],
      owner_staff_id: l.owner || null, team_id: teamOf(l.branch, l.owner), channel_code: l.chan,
      source_code: l.cust.source || null, campaign_id: null, visit_id: null, interest_code: l.interest,
      product_type_code: null, product_model: l.model, interest_level: l.level || null, status: l.status,
      priority_code: open ? l.prio : null, next_action: open ? l.nextAction : null,
      next_action_type_code: open ? l.nextType : null, next_action_at: open ? fmt(l.nextAt) : null,
      first_contacted_at: l.status === "NEW" ? null : (l.firstContact ? fmt(l.firstContact) : null),
      closed_at: l.closedAt ? fmt(l.closedAt) : null, lost_reason_code: l.lostReason || null, lost_note: null,
      converted_opportunity_id: l.opp ? l.opp.id : null,
      created_at: fmt(l.created), created_by: l.owner || ownerOf(l.branch, 1), updated_at: fmt(l.closedAt || l.created), updated_by: l.owner || ownerOf(l.branch, 1) };
  });
  batchInsert("crm.leads", Object.keys(rows[0]), rows, 500);
  raw(`UPDATE crm.opportunities o SET lead_id = s.lead_id
FROM (SELECT DISTINCT ON (converted_opportunity_id) converted_opportunity_id AS opp_id, id AS lead_id
        FROM crm.leads WHERE converted_opportunity_id IS NOT NULL ORDER BY converted_opportunity_id, created_at) s
WHERE o.id = s.opp_id;`);
}
/* ---- opportunity_items ของการ์ดที่ระบุชื่อ (ข้อ 13.7 · 13.9) ---- */
{
  const items = [];
  const put = (oppNoKey, model, price, level) => {
    const o = typeof oppNoKey === "string" ? opps.find((x) => x.no === oppNoKey) : oppNoKey;
    if (!o) return;
    items.push({ id: uid(T.OPPITEM, items.length + 1), organization_id: ORG, opportunity_id: o.id,
      product_type_code: model.startsWith("iPad") ? "IPAD" : model.startsWith("Mac") ? "MAC" : model.startsWith("Air") ? "AIRPODS" : "IPHONE",
      product_model: model, quantity: 1, unit_price: price, interest_level: level,
      created_at: fmt(o.created), created_by: o.owner, updated_at: fmt(o.created), updated_by: o.owner });
  };
  put("OP-2026-002998", "iPhone 17 Pro", 45900, "HOT");
  put("OP-2026-002790", "iPhone 16 128GB", 28900, null);
  put("OP-2026-000231", "iPhone 15 128GB", 23900, null);
  for (const [k, p] of Object.entries(JP1_PIPE)) {
    if (k === "somchai") continue;
    const o = openOppsByBranch.JP1.find((x) => x.key === k);
    if (o) put(o, p.model, o.expected, p.prio === "HIGH" ? "HOT" : "WARM");
  }
  const kit = openOppsByBranch.JP3.find((x) => x.key === "kittipong");
  if (kit) put(kit, "iPhone 17", kit.expected, "WARM");
  const manopOpp = opps.find((o) => o.cust === namedCust.manop && o.stage === "WON");
  const siriOpp = opps.find((o) => o.cust === namedCust.siriporn && o.stage === "WON");
  if (manopOpp) put(manopOpp, "iPhone 16 128GB", manopOpp.wonAmount, null);
  if (siriOpp) put(siriOpp, "iPhone 15", siriOpp.wonAmount, null);
  batchInsert("crm.opportunity_items", Object.keys(items[0]), items);
}
/* ---- ใบเสนอราคา ---- */
{
  const rows = quotations.map((x) => ({ id: x.id, organization_id: ORG, quotation_no: x.no, opportunity_id: x.opp.id,
    customer_id: x.opp.cust.id, branch_id: BRANCH[x.opp.branch], owner_staff_id: x.opp.owner, status: x.status,
    sent_at: fmt(x.sentAt), sent_channel_code: x.channel, valid_until: x.validUntil, total_amount: x.total,
    installment_months: null, terms_note: null, created_at: fmt(x.created), created_by: x.opp.owner,
    updated_at: fmt(x.sentAt), updated_by: x.opp.owner }));
  batchInsert("crm.quotations", Object.keys(rows[0]), rows, 500);
  const som = quotations.find((x) => x.no === "QT-2026-001702");
  batchInsert("crm.quotation_items", ["id", "organization_id", "quotation_id", "product_type_code", "product_model", "variant", "quantity", "unit_price", "discount_amount", "created_at", "updated_at"],
    [{ id: uid(T.QUOITEM, 1), organization_id: ORG, quotation_id: som.id, product_type_code: "IPHONE",
       product_model: "iPhone 17 Pro Max", variant: "256GB", quantity: 1, unit_price: 49900, discount_amount: 0,
       created_at: fmt(som.created), updated_at: fmt(som.created) }]);
}
/* ---- transaction ref ---- */
{
  const rows = txns.map((t) => ({ id: t.id, organization_id: ORG, customer_id: t.cust.id, branch_id: BRANCH[t.branch],
    opportunity_id: t.opp.id, transaction_type_code: t.type, source_system_code: "MANUAL", external_no: t.externalNo,
    transacted_at: fmt(t.at), amount: t.amount, created_at: fmt(t.at), created_by: t.opp.owner,
    updated_at: fmt(t.at), updated_by: t.opp.owner }));
  batchInsert("crm.transaction_refs", Object.keys(rows[0]), rows, 500);
}
/* ---- งาน ---- */
{
  const rows = tasks.map((t) => ({ id: t.id, organization_id: ORG, task_no: t.no, task_type_code: t.type,
    title: t.title, description: null, customer_id: t.cust ? t.cust.id : null,
    lead_id: t.lead ? t.lead.id : null, opportunity_id: t.opp ? t.opp.id : null, branch_id: BRANCH[t.branch],
    owner_staff_id: t.owner || null, team_id: teamOf(t.branch, t.owner), status: t.status,
    priority_code: t.prio || "NORMAL", due_at: fmt(t.due), remind_at: fmt(t.due - 15 * 60),
    completed_at: t.status === "DONE" ? fmt(t.completed) : null, cancelled_at: null,
    is_next_action: !!t.isNext, created_at: fmt(t.created), created_by: t.owner || null,
    updated_at: fmt(t.created), updated_by: t.owner || null }));
  batchInsert("crm.tasks", Object.keys(rows[0]), rows, 500);
}

/* ---- ข้อมูลซ้ำ · การรวมลูกค้า ---- */
batchInsert("crm.duplicate_decisions", ["id", "organization_id", "customer_id", "candidate_customer_id", "score", "matched_rules", "override_reason_code", "override_note", "status", "created_by", "created_at", "updated_at"],
  dupDecisions.map((d) => ({ id: d.id, organization_id: ORG, customer_id: d.cust.id, candidate_customer_id: d.cand.id,
    score: d.score, matched_rules: `{"${d.rules.join('","')}"}`, override_reason_code: d.reason, override_note: d.note,
    status: "PENDING", created_by: d.createdBy, created_at: fmt(d.createdAt), updated_at: fmt(d.createdAt) })));
batchInsert("crm.customer_merges", ["id", "organization_id", "merge_no", "survivor_customer_id", "merged_customer_id", "reason", "field_choices", "snapshot", "moved_counts", "merged_by", "merged_at", "created_at", "created_by", "updated_at", "updated_by"],
  merges.map((m) => ({ id: m.id, organization_id: ORG, merge_no: m.no, survivor_customer_id: m.survivor,
    merged_customer_id: m.merged, reason: "ข้อมูลซ้ำ ยืนยันแล้วว่าเป็นคนเดียวกัน", field_choices: "{}", snapshot: "{}",
    moved_counts: "{}", merged_by: m.by, merged_at: fmt(m.at), created_at: fmt(m.at), created_by: m.by,
    updated_at: fmt(m.at), updated_by: m.by })));
/* ---- แจ้งเตือน ---- */
batchInsert("crm.notifications", ["id", "organization_id", "recipient_staff_id", "code", "entity_type", "entity_id", "entity_ref", "title", "body", "created_at", "read_at", "dedupe_key", "created_by", "updated_at"],
  notifications.map((x) => ({ id: x.id, organization_id: ORG, recipient_staff_id: x.staff, code: x.code,
    entity_type: x.entityType, entity_id: x.entityId, entity_ref: x.entityRef, title: x.title, body: x.body,
    created_at: fmt(x.at), read_at: null, dedupe_key: x.key, created_by: null, updated_at: fmt(x.at) })));
/* ---- การเปลี่ยนผู้รับผิดชอบ (ข้อ 13.14) ---- */
{
  const wl = leads.find((l) => l.fixedNo === "LD-2026-007512");
  batchInsert("crm.ownership_changes", ["id", "organization_id", "entity_type", "entity_id", "from_staff_id", "to_staff_id", "reason_code", "note", "changed_by", "changed_at", "created_at"],
    [{ id: uid(T.OWNCH, 1), organization_id: ORG, entity_type: "LEAD", entity_id: wl.id, from_staff_id: KWAN,
       to_staff_id: KIM, reason_code: "SHIFT_CHANGE", note: "เปลี่ยนกะ", changed_by: JAY,
       changed_at: fmt(ts(2026, 9, 10, 18, 5)), created_at: fmt(ts(2026, 9, 10, 18, 5)) }]);
}
/* ---- คำขอส่งออก (ข้อ 13.14) ---- */
batchInsert("audit.export_requests", ["id", "organization_id", "export_no", "requested_by", "requested_as_role", "requested_at", "branch_ids", "reason_code", "reason_note", "filter", "row_count", "status", "approved_by", "decided_at", "decision_note", "generated_at", "file_path", "file_deleted_at", "download_count", "last_downloaded_at", "expired_at", "created_at", "created_by", "updated_at", "updated_by"],
  [{ id: uid(T.EXPORT, 30), organization_id: ORG, export_no: "EX-2026-000030", requested_by: JAY,
     requested_as_role: "BRANCH_MANAGER", requested_at: fmt(ts(2026, 9, 5, 14, 5)), branch_ids: `{${BRANCH.JP1}}`,
     reason_code: "MANAGEMENT_REPORT", reason_note: null, filter: "{}", row_count: 412, status: "EXPIRED",
     approved_by: null, decided_at: null, decision_note: null, generated_at: fmt(ts(2026, 9, 5, 14, 10)),
     file_path: "exports/EX-2026-000030.csv", file_deleted_at: fmt(ts(2026, 9, 6, 14, 10)), download_count: 1,
     last_downloaded_at: fmt(ts(2026, 9, 5, 15, 0)), expired_at: fmt(ts(2026, 9, 6, 14, 10)),
     created_at: fmt(ts(2026, 9, 5, 14, 5)), created_by: JAY, updated_at: fmt(ts(2026, 9, 6, 14, 10)), updated_by: JAY },
   { id: uid(T.EXPORT, 31), organization_id: ORG, export_no: "EX-2026-000031", requested_by: S["ST-0011"].id,
     requested_as_role: "MARKETING", requested_at: fmt(ts(2026, 9, 10, 16, 20)),
     branch_ids: `{${BRANCH.JP1},${BRANCH.JP2},${BRANCH.JP3},${BRANCH.JP4}}`, reason_code: "MARKETING_CAMPAIGN",
     reason_note: null, filter: '{"consent": "MARKETING"}', row_count: 1850, status: "REQUESTED", approved_by: null,
     decided_at: null, decision_note: null, generated_at: null, file_path: null, file_deleted_at: null,
     download_count: 0, last_downloaded_at: null, expired_at: null, created_at: fmt(ts(2026, 9, 10, 16, 20)),
     created_by: S["ST-0011"].id, updated_at: fmt(ts(2026, 9, 10, 16, 20)), updated_by: S["ST-0011"].id }]);
/* ---- คำขอมอบบทบาท (ข้อ 13.14) ---- */
batchInsert("core.role_grant_requests", ["id", "organization_id", "request_no", "role_code", "target_staff_id", "requested_by", "requested_at", "request_reason", "status", "request_type", "created_at", "created_by", "updated_at", "updated_by"],
  [{ id: uid(T.RG, 3), organization_id: ORG, request_no: "RG-2026-0003", role_code: "SYSTEM_ADMIN",
     target_staff_id: S["ST-0051"].id, requested_by: S["ST-0003"].id, requested_at: fmt(ts(2026, 9, 11, 9, 12)),
     request_reason: "ดูแลระบบร่วมกับคุณต้น", status: "REQUESTED", request_type: "GRANT",
     created_at: fmt(ts(2026, 9, 11, 9, 12)), created_by: S["ST-0003"].id, updated_at: fmt(ts(2026, 9, 11, 9, 12)), updated_by: S["ST-0003"].id }]);
/* ---- audit / access log (ข้อ 13.14) ---- */
batchInsert("audit.audit_logs", ["occurred_at", "organization_id", "actor_type", "actor_staff_id", "actor_staff_code", "actor_label", "actor_roles", "aal", "action", "entity_type", "entity_id", "entity_ref", "branch_id", "reason"],
  [{ occurred_at: fmt(ts(2026, 9, 11, 9, 12)), organization_id: ORG, actor_type: "STAFF", actor_staff_id: S["ST-0003"].id,
     actor_staff_code: "ST-0003", actor_label: "คุณต้น", actor_roles: "{SYSTEM_ADMIN}", aal: "aal2",
     action: "ROLE_GRANT_REQUESTED", entity_type: "ROLE_GRANT", entity_id: uid(T.RG, 3), entity_ref: "RG-2026-0003",
     branch_id: null, reason: "SYSTEM_ADMIN → ST-0051" },
   { occurred_at: fmt(ts(2026, 9, 10, 18, 42)), organization_id: ORG, actor_type: "STAFF", actor_staff_id: KWAN,
     actor_staff_code: "ST-0045", actor_label: "คุณขวัญ", actor_roles: "{STAFF}", aal: "aal1",
     action: "CUSTOMER_CONTACT_UPDATED", entity_type: "CUSTOMER", entity_id: namedCust.jiraporn.id,
     entity_ref: "CUS-2025-007321", branch_id: BRANCH.JP1, reason: "แก้เบอร์โทรตามที่ลูกค้าแจ้ง" },
   { occurred_at: fmt(ts(2026, 9, 10, 18, 5)), organization_id: ORG, actor_type: "STAFF", actor_staff_id: JAY,
     actor_staff_code: "ST-0020", actor_label: "คุณเจ", actor_roles: "{BRANCH_MANAGER}", aal: "aal2",
     action: "LEAD_ASSIGNED", entity_type: "LEAD", entity_id: leads.find((l) => l.fixedNo === "LD-2026-007512").id,
     entity_ref: "LD-2026-007512", branch_id: BRANCH.JP1, reason: "SHIFT_CHANGE" },
   { occurred_at: fmt(ts(2026, 9, 10, 16, 20)), organization_id: ORG, actor_type: "STAFF", actor_staff_id: S["ST-0011"].id,
     actor_staff_code: "ST-0011", actor_label: "คุณมายด์", actor_roles: "{MARKETING}", aal: "aal2",
     action: "EXPORT_REQUESTED", entity_type: "EXPORT", entity_id: uid(T.EXPORT, 31), entity_ref: "EX-2026-000031",
     branch_id: null, reason: "MARKETING_CAMPAIGN 1,850 แถว" }]);
batchInsert("audit.access_logs", ["occurred_at", "organization_id", "actor_staff_id", "actor_staff_code", "actor_roles", "aal", "action", "customer_id", "contact_id", "branch_id", "purpose"],
  [{ occurred_at: fmt(ts(2026, 9, 11, 10, 20)), organization_id: ORG, actor_staff_id: KWAN, actor_staff_code: "ST-0045",
     actor_roles: "{STAFF}", aal: "aal1", action: "CONTACT_REVEALED", customer_id: namedCust.somchai.id,
     contact_id: contacts.find((c) => c.cust === namedCust.somchai && c.type === "PHONE").id,
     branch_id: BRANCH.JP1, purpose: "CALL" }]);

/* ---- running numbers · customer_branches · refresh ---- */
{
  const rn = [{ scope_key: "CUS:2026", last_value: 6852 }, { scope_key: "CUS:2025", last_value: 8126 },
    { scope_key: "LD:2026", last_value: 7545 }, { scope_key: "OP:2026", last_value: 3121 },
    { scope_key: "QT:2026", last_value: 1772 }, { scope_key: "TK:2026", last_value: 12660 },
    { scope_key: "EX:2026", last_value: 31 }, { scope_key: "MG:2026", last_value: 16 },
    { scope_key: "RG:2026", last_value: 3 }, { scope_key: "ST", last_value: 51 },
    ...RUN_VISIT, ...RUN_QUEUE];
  batchInsert("app.running_numbers", ["scope_key", "last_value"], rn, 500);
}
raw(`-- ผูกลูกค้ากับสาขาแรกให้ครบทุกราย (trigger ผูกให้เฉพาะลูกค้าที่มีกิจกรรม)
INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via, created_by)
SELECT c.organization_id, c.id, c.first_branch_id, c.first_seen_at, NULL, 'CREATED', NULL
FROM crm.customers c WHERE c.first_branch_id IS NOT NULL
ON CONFLICT (customer_id, branch_id) DO NOTHING;

-- ปิดโหมด bulk แล้วคำนวณแคชกิจกรรมและวงจรชีวิตของลูกค้าทุกราย (ข้อ 13.0 ข้อ 7 · 19.1 ข้อ 11)
SELECT app.refresh_customer_activity(c.id) FROM crm.customers c
 WHERE EXISTS (SELECT 1 FROM crm.visits v WHERE v.customer_id = c.id)
    OR EXISTS (SELECT 1 FROM crm.interactions i WHERE i.customer_id = c.id)
    OR EXISTS (SELECT 1 FROM crm.leads l WHERE l.customer_id = c.id)
    OR EXISTS (SELECT 1 FROM crm.opportunities o WHERE o.customer_id = c.id)
    OR EXISTS (SELECT 1 FROM crm.transaction_refs t WHERE t.customer_id = c.id)
    OR EXISTS (SELECT 1 FROM crm.tasks tk WHERE tk.customer_id = c.id);
SELECT app.refresh_customer_lifecycle(c.id) FROM crm.customers c;

SELECT set_config('app.bulk', 'off', false);
SELECT set_config('app.seed_mode', 'off', false);`);

/* ===================================================================================== */
if (failures > 0) { console.error(`\n${failures} assertion ล้มเหลว — ไม่เขียนไฟล์`); process.exit(1); }
if (!CHECK_ONLY) {
  writeFileSync(OUT, out.join("\n") + "\n", "utf8");
  console.log(`เขียน ${OUT}`);
  console.log(`  ลูกค้า ${customers.length} · visit ${visits.length} · interaction ${interactions.length} · lead ${leads.length} · opportunity ${opps.length} · ใบเสนอราคา ${quotations.length} · ธุรกรรม ${txns.length} · งาน ${tasks.length}`);
} else console.log("assertion ผ่านทั้งหมด");
