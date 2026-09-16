/* ============================================================================
   tools/check-prototype.mjs — ตรวจความสอดคล้องของ prototype กับ CANONICAL v2.2
   ใช้:   node tools/check-prototype.mjs                 (ทุกหน้าต้องมีไฟล์ครบ 19 หน้า)
          node tools/check-prototype.mjs --allow-missing  (ข้ามหน้าที่ยังไม่ได้สร้าง)
   ไม่มี dependency · exit 1 เมื่อไม่ผ่าน

   หมวดที่ตรวจ
     1. data.js / app.js โหลดได้ใน sandbox ที่ไม่มี DOM
     2. หน้าจอใน data.js = ตาราง CANONICAL ข้อ 14.1 · <body data-page data-roles> ของแต่ละไฟล์ตรงทุกตัวอักษร
     3. เมนู (ข้อ 14.2) · bottom nav · เพิ่มเติม · FAB อ้างเฉพาะหน้าที่มีจริง · ผู้ใช้ตัวอย่างข้อ 13.5
     4. ไม่มี hex นอก :root ของ app.css · ไม่มี hex ใน <style>/style="" ของหน้า
     5. ไม่มี URL ภายนอก / @import ระยะไกล / การเรียกเครือข่าย ทั้งโฟลเดอร์ prototype/
     6. ทุกหน้า include assets/app.css · assets/data.js · assets/app.js ตามลำดับ
     7. ตัวเลขใน data.js: ผลรวมรายสาขา = องค์กร · รายพนักงาน = JP1 · pipeline · งาน · ร้อยละคำนวณใหม่ (half away from zero)
     8. ค่า KPI องค์กรข้อ 13.1 ตรงค่าคงที่ · การ์ด dashboard ข้อ 14.7 ตรงข้อมูลที่อ้าง
     9. JCRM.can ให้ผลตรงตารางข้อ 13.13 · ตัวจัดรูปแบบตัวเลขใน app.js
    10. ค่าที่ปรับใน v2.2: สีกราฟ D49 · ป้ายไทยข้อ 4.8 · ชื่อทีม · ลูกค้าล่าสุด/กิจกรรมล่าสุด 13.5 · priority การ์ด 13.9
        · กระดิ่ง 13.14 · คำขอส่งออก · คู่ซ้ำ · NULL KPI คุณฝน 13.13 · KPI OPEN_* TASKS_* WON_LAST_7_DAYS · แจ้งเตือน/settings ใหม่
    11. พฤติกรรมของ app.js ตาม v2.2: ช่วงเวลาเฉพาะหน้า 02 09 12 · ช่องค้นหาซ่อนสำหรับ MK/SA · กติกาย้ายขั้น 4.4 · access() · ตัวเลือกข้อมูลตาม persona
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = join(ROOT, "prototype");
const ALLOW_MISSING = process.argv.includes("--allow-missing");

const fails = [];
const passes = [];
const notes = [];
let mark = 0;
const fail = (m) => fails.push(m);
const section = (title) => { if (fails.length === mark) passes.push(title); else passes.push(`(ไม่ผ่าน) ${title}`); mark = fails.length; };
const eq = (label, actual, expected) => { if (actual !== expected) fail(`${label}: ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`); };
const read = (f) => readFileSync(f, "utf8");
/* แท็ก <body> จริงของหน้า (ตัด <style> <script> และคอมเมนต์ออกก่อน เพื่อไม่ให้ข้อความในคอมเมนต์ถูกจับ) */
const bodyTag = (html) => (html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "").match(/<body\b[^>]*>/i) || [""])[0];

/* ---------------------------------------------------------------------------
   ค่าคาดหวังที่คัดจาก CANONICAL (ตรึงไว้ในสคริปต์ · ห้ามอ่านจาก data.js)
   ------------------------------------------------------------------------ */
const EXPECTED_SCREENS = [
  ["01", "login", "01-login.html", ""],
  ["02", "dashboard", "02-dashboard.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS MARKETING EXECUTIVE BUSINESS_ADMIN"],
  ["03", "customers", "03-customers.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["04", "quick-capture", "04-quick-capture.html", "STAFF SUPERVISOR BRANCH_MANAGER BUSINESS_ADMIN"],
  ["05", "customer-360", "05-customer-360.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["06", "pipeline", "06-pipeline.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["07", "reception", "07-reception.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS"],
  ["08", "tasks", "08-tasks.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["09", "reports", "09-reports.html", "SUPERVISOR BRANCH_MANAGER OPERATIONS MARKETING EXECUTIVE BUSINESS_ADMIN"],
  ["10", "mobile", "10-mobile.html", "STAFF SUPERVISOR BRANCH_MANAGER"],
  ["11", "leads", "11-leads.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["12", "data-quality", "12-data-quality.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"],
  ["13", "users", "13-users.html", "SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN"],
  ["14", "master-data", "14-master-data.html", "MARKETING BUSINESS_ADMIN"],
  ["15", "exports", "15-exports.html", "BRANCH_MANAGER MARKETING EXECUTIVE BUSINESS_ADMIN"],
  ["16", "audit", "16-audit.html", "EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN"],
  ["17", "privacy", "17-privacy.html", "BUSINESS_ADMIN"],
  ["18", "settings", "18-settings.html", "BUSINESS_ADMIN SYSTEM_ADMIN"],
  ["19", "quotations", "19-quotations.html", "STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN"]
];
const EXPECTED_MENU = [
  ["หน้าหลัก", ["dashboard"]],
  ["ลูกค้า", ["customers", "quick-capture"]],
  ["ลูกค้าเข้าร้าน", ["reception"]],
  ["การขาย", ["leads", "pipeline", "quotations"]],
  ["ติดตามงาน", ["tasks"]],
  ["รายงาน", ["reports", "data-quality"]],
  ["ตั้งค่าระบบ", ["users", "master-data", "exports", "audit", "privacy", "settings"]]
];
const EXPECTED_STAFF = [
  ["ST-0001", "จ๋าอั๋น", "EXECUTIVE@", "ja@example.com", "ACTIVE"],
  ["ST-0002", "คุณแพร", "BUSINESS_ADMIN@", "prae@example.com", "ACTIVE"],
  ["ST-0003", "คุณต้น", "SYSTEM_ADMIN@", "ton@example.com", "ACTIVE"],
  ["ST-0010", "คุณปุ๊ก", "OPERATIONS@JP1 OPERATIONS@JP2 OPERATIONS@JP3 OPERATIONS@JP4", "puk@example.com", "ACTIVE"],
  ["ST-0011", "คุณมายด์", "MARKETING@", "mind@example.com", "ACTIVE"],
  ["ST-0020", "คุณเจ", "BRANCH_MANAGER@JP1", "jay@example.com", "ACTIVE"],
  ["ST-0021", "คุณบอส", "BRANCH_MANAGER@JP2", "boss@example.com", "ACTIVE"],
  ["ST-0022", "คุณหนึ่ง", "BRANCH_MANAGER@JP3", "nueng@example.com", "ACTIVE"],
  ["ST-0023", "คุณเบียร์", "BRANCH_MANAGER@JP4", "beer@example.com", "ACTIVE"],
  ["ST-0030", "คุณนัท", "SUPERVISOR@JP1", "nat@example.com", "ACTIVE"],
  ["ST-0045", "คุณขวัญ", "STAFF@JP1", "kwan@example.com", "ACTIVE"],
  ["ST-0046", "คุณคิม", "STAFF@JP1", "kim@example.com", "ACTIVE"],
  ["ST-0050", "คุณฝน", "STAFF@JPON", "fon@example.com", "ACTIVE"],
  ["ST-0051", "คุณโอ๊ต", "", "oat@example.com", "INVITED"]
];
/* ข้อ 13.1 */
const EXPECTED_ORG = {
  VISITS: 3125, WALKIN_VISITS: 2525, IDENTIFIED_VISITS: 2719, UNIQUE_CUSTOMERS: 1284, NEW_CUSTOMERS: 809, RETURNING_CUSTOMERS: 475,
  LEADS: 892, OPPORTUNITIES: 368, SALES: 215, SALES_AMOUNT: 3332700, LOST_OPPORTUNITIES: 153, LOST_LEADS: 143, LOST_TOTAL: 296,
  BUYERS: 209, REPEAT_BUYERS: 41, LEAD_RESPONSE_MIN: 18, OPEN_FOLLOWUP_CUSTOMERS: 117, OPEN_VISITS: 4
};
const EXPECTED_ORG_PREVIOUS = { VISITS: 2790, UNIQUE_CUSTOMERS: 1146, LEADS: 826, OPPORTUNITIES: 323, SALES: 182, SALES_AMOUNT: 3051760 };
const EXPECTED_ORG_DISPLAY = {
  LEAD_RATE: "28.5%", OPPORTUNITY_RATE: "41.3%", CLOSE_RATE: "58.4%", LOST_RATE: "41.6%", CONV_LEAD_TO_SALE: "24.1%", CONV_VISIT_TO_SALE: "6.9%",
  WALKIN_CONVERSION: "6.3%", REPEAT_RATE: "19.6%", CAPTURE_RATE: "87.0%", OUTCOME_COMPLETION: "95.4%", FOLLOWUP_COMPLETION: "85.0%",
  DUPLICATE_RATE: "0.1%", MISSING_REQUIRED_RATE: "0.4%"
};
/* ข้อ 13.13: [staff, aal, อ่านลูกค้า, แก้ลูกค้า, แก้ OP-2026-002998, อ่าน TK-2026-012508, เปิดเบอร์] */
const EXPECTED_13_13 = [
  ["ST-0045", "aal1", 1, 1, 1, 1, 1], ["ST-0046", "aal1", 1, 0, 0, 0, 1], ["ST-0030", "aal2", 1, 1, 1, 1, 1], ["ST-0030", "aal1", 0, 0, 0, 0, 0],
  ["ST-0020", "aal2", 1, 1, 1, 1, 1], ["ST-0021", "aal2", 0, 0, 0, 0, 0], ["ST-0050", "aal1", 0, 0, 0, 0, 0], ["ST-0010", "aal2", 1, 0, 0, 1, 0],
  ["ST-0011", "aal2", 0, 0, 0, 0, 0], ["ST-0001", "aal2", 1, 0, 0, 1, 1], ["ST-0001", "aal1", 0, 0, 0, 0, 0], ["ST-0002", "aal2", 1, 1, 1, 1, 1],
  ["ST-0003", "aal2", 0, 0, 0, 0, 0]
];

/* ---------------------------------------------------------------------------
   ตัวช่วยคำนวณ (BigInt · half away from zero · ไม่ใช้ float)
   ------------------------------------------------------------------------ */
const big = (n) => BigInt(n);
function divRoundBig(a, b) { /* a,b ≥ 0 */ const q = a / b, r = a % b; return 2n * r >= b ? q + 1n : q; }
function pctText(num, den) {
  const q = divRoundBig(big(num) * 1000n, big(den));
  return `${q / 10n}.${q % 10n}%`;
}
function growthText(cur, prev) {
  const diff = big(cur) - big(prev);
  const q = divRoundBig((diff < 0n ? -diff : diff) * 100n, big(prev));
  if (q === 0n) return "0%";
  return (diff < 0n ? "−" : "+") + q + "%";
}
function ppText(n1, d1, n0, d0) {
  const numer = big(n1) * big(d0) - big(n0) * big(d1), denom = big(d1) * big(d0);
  const q = divRoundBig((numer < 0n ? -numer : numer) * 1000n, denom);
  if (q === 0n) return "0.0 pp";
  return (numer < 0n ? "−" : "+") + (q / 10n) + "." + (q % 10n) + " pp";
}
const checkR = (label, r) => {
  if (!r || typeof r.num !== "number" || typeof r.den !== "number") { fail(`${label}: ไม่มี {num, den, display}`); return; }
  eq(`${label} (${r.num}/${r.den})`, r.display, pctText(r.num, r.den));
};
const sum = (arr, f) => arr.reduce((a, x) => a + (f === undefined ? x : typeof f === "function" ? f(x) : x[f]), 0);
const nz = (v) => (v == null ? 0 : v);

/* ---------------------------------------------------------------------------
   1. โหลด data.js + app.js
   ------------------------------------------------------------------------ */
const sandbox = {};
let D, J;
try {
  new Function("window", read(join(P, "assets/data.js")))(sandbox);
  D = sandbox.JCRM_DATA;
  if (!D) throw new Error("ไม่มี window.JCRM_DATA");
} catch (e) { console.error("  ไม่ผ่าน  โหลด assets/data.js ไม่ได้: " + e.message); process.exit(1); }
try {
  new Function("window", read(join(P, "assets/app.js")))(sandbox);
  J = sandbox.JCRM;
  if (!J || typeof J.can !== "function") throw new Error("ไม่มี window.JCRM.can");
} catch (e) { fail("โหลด assets/app.js ใน sandbox ไม่ได้: " + e.message); }
section("1. โหลด data.js และ app.js ได้โดยไม่ต้องมี DOM");

/* ---------------------------------------------------------------------------
   2. หน้าจอ ↔ ข้อ 14.1 ↔ ไฟล์ HTML
   ------------------------------------------------------------------------ */
eq("จำนวนหน้าจอใน data.js", D.screens.length, EXPECTED_SCREENS.length);
EXPECTED_SCREENS.forEach(([no, id, file, roles], i) => {
  const s = D.screens[i];
  if (!s) { fail(`data.js ไม่มีหน้าที่ ${no} (${id})`); return; }
  eq(`screens[${i}].no`, s.no, no); eq(`screens[${i}].id`, s.id, id); eq(`screens[${i}].file`, s.file, file);
  eq(`screens[${i}].roles (${id})`, s.roles.join(" "), roles);
  const path = join(P, file);
  if (!existsSync(path)) {
    if (ALLOW_MISSING) notes.push(`ข้าม ${file} (ยังไม่ได้สร้าง · --allow-missing)`);
    else fail(`ไม่พบไฟล์ ${file}`);
    return;
  }
  const html = read(path);
  const body = bodyTag(html);
  const pageAttr = body.match(/\bdata-page="([^"]*)"/);
  const rolesAttr = body.match(/\bdata-roles="([^"]*)"/);
  if (!pageAttr) fail(`${file}: <body> ไม่มี data-page`); else eq(`${file} data-page`, pageAttr[1], id);
  if (!rolesAttr) fail(`${file}: <body> ไม่มี data-roles`); else eq(`${file} data-roles`, rolesAttr[1], roles);
});
/* หน้า index.html ไม่อยู่ในตาราง 14.1 แต่ต้องใช้ data-page="index" data-roles="" (ข้อ 14.1 v2.2 ข้อตกลงของ prototype) */
[["index.html", "index", ""]].forEach(([file, id, roles]) => {
  const path = join(P, file);
  if (!existsSync(path)) { fail(`ไม่พบไฟล์ ${file}`); return; }
  const body = bodyTag(read(path));
  const pageAttr = body.match(/\bdata-page="([^"]*)"/), rolesAttr = body.match(/\bdata-roles="([^"]*)"/);
  if (!pageAttr) fail(`${file}: <body> ไม่มี data-page`); else eq(`${file} data-page`, pageAttr[1], id);
  if (!rolesAttr) fail(`${file}: <body> ไม่มี data-roles`); else eq(`${file} data-roles`, rolesAttr[1], roles);
});
eq("14.1 หน้า 01 roles ใน data.js", D.screens[0].roles.join(" "), "");
const knownFiles = new Set(EXPECTED_SCREENS.map((s) => s[2]));
readdirSync(P).filter((f) => /^\d\d-.*\.html$/.test(f)).forEach((f) => { if (!knownFiles.has(f)) fail(`${f} ไม่อยู่ในตารางหน้าจอข้อ 14.1`); });
section("2. หน้าจอ 19 หน้า + index · data-page/data-roles ตรง CANONICAL ข้อ 14.1 (หน้า 01 และ index ใช้ data-roles=\"\")");

/* ---------------------------------------------------------------------------
   3. เมนู · มือถือ · ผู้ใช้ตัวอย่าง
   ------------------------------------------------------------------------ */
const screenIds = new Set(D.screens.map((s) => s.id));
eq("จำนวนกลุ่มเมนู", D.menuGroups.length, EXPECTED_MENU.length);
EXPECTED_MENU.forEach(([label, ids], i) => {
  const g = D.menuGroups[i];
  if (!g) { fail(`ไม่มีกลุ่มเมนู ${label}`); return; }
  eq(`menuGroups[${i}].label`, g.label, label);
  eq(`menuGroups[${i}].screens`, g.screens.join(" "), ids.join(" "));
  g.screens.forEach((id) => {
    if (!screenIds.has(id)) fail(`เมนู ${label} อ้างหน้า ${id} ที่ไม่มี`);
    else eq(`กลุ่มของหน้า ${id}`, D.screens.find((s) => s.id === id).group, label);
  });
});
D.screens.filter((s) => s.group).forEach((s) => {
  const n = D.menuGroups.filter((g) => g.screens.includes(s.id)).length;
  if (n !== 1) fail(`หน้า ${s.id} อยู่ในเมนู ${n} กลุ่ม (ต้อง 1)`);
});
[...D.mobileNav, ...D.mobileMoreSheet, D.tabletFab].forEach((it) => { if (it.screen && !screenIds.has(it.screen)) fail(`เมนูมือถือ/FAB อ้างหน้า ${it.screen} ที่ไม่มี`); });
eq("bottom nav ป้าย", D.mobileNav.map((i) => i.label).join(" · "), "หน้าแรก · ลูกค้า · รับลูกค้า · งาน · เพิ่มเติม");
eq("เพิ่มเติม ป้าย", D.mobileMoreSheet.map((i) => i.label).join(" · "), "โอกาสการขาย · Leads · ศูนย์คุณภาพข้อมูล · ออกจากระบบ");
eq("จำนวนผู้ใช้ตัวอย่าง", D.staff.length, EXPECTED_STAFF.length);
EXPECTED_STAFF.forEach(([code, name, asg, email, status]) => {
  const s = D.staff.find((x) => x.staffCode === code);
  if (!s) { fail(`ไม่มีผู้ใช้ ${code}`); return; }
  eq(`${code} ชื่อ`, s.displayName, name); eq(`${code} อีเมล`, s.email, email); eq(`${code} สถานะ`, s.status, status);
  eq(`${code} บทบาท`, s.assignments.map((a) => `${a.role}@${a.branch || ""}`).join(" "), asg);
});
Object.entries(D.defaultPersonaByRole).forEach(([r, c]) => { if (!D.staff.find((s) => s.staffCode === c)) fail(`defaultPersonaByRole ${r} → ${c} ไม่มี`); });
eq("ผู้ใช้ตั้งต้น", D.meta.defaultStaffCode, "ST-0001");
eq("localStorage key", D.meta.storageKey, "jcrm.staff");
section("3. เมนู 14.2 · มือถือ 14.4 · ผู้ใช้ตัวอย่าง 13.5 อ้างถึงสิ่งที่มีจริง");

/* ---------------------------------------------------------------------------
   4. hex เฉพาะใน :root · 5. ไม่มีทรัพยากรภายนอก · 6. include ครบ
   ------------------------------------------------------------------------ */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
function outsideRoot(css) {
  let out = "", i = 0;
  const re = /:root\s*\{/g; let m;
  while ((m = re.exec(css))) {
    out += css.slice(i, m.index);
    let depth = 1, j = re.lastIndex;
    while (j < css.length && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    i = j; re.lastIndex = j;
  }
  return out + css.slice(i);
}
const appCss = stripCss(read(join(P, "assets/app.css")));
(outsideRoot(appCss).match(HEX) || []).forEach((h) => fail(`app.css มี hex ${h} นอก :root`));
if (!/^@charset[^;]*;\s*@import url\("kanit-faces\.css"\);/.test(read(join(P, "assets/app.css")))) fail("app.css ต้องขึ้นต้นด้วย @import url(\"kanit-faces.css\") (หลัง @charset)");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const TEXT_EXT = new Set([".html", ".css", ".js", ".md", ".json", ".txt", ".svg"]);
const allFiles = walk(P);
const htmlPages = allFiles.filter((f) => extname(f) === ".html");
htmlPages.forEach((f) => {
  const html = read(f), rel = relative(P, f);
  (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []).forEach((blk) => (stripCss(blk).match(HEX) || []).forEach((h) => fail(`${rel}: <style> มี hex ${h}`)));
  (html.match(/\sstyle="[^"]*"/gi) || []).forEach((a) => (a.match(HEX) || []).forEach((h) => fail(`${rel}: style="" มี hex ${h}`)));
});
allFiles.filter((f) => extname(f) === ".js").forEach((f) => {
  const src = read(f);
  (src.match(/(^|[^&])#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g) || []).forEach((h) => fail(`${relative(P, f)}: มีค่าสี hex ${h.trim()} ในโค้ด`));
});
section("4. สี hex อยู่เฉพาะในบล็อก :root ของ app.css");

allFiles.filter((f) => TEXT_EXT.has(extname(f))).forEach((f) => {
  const rel = relative(P, f);
  let src = read(f);
  if (extname(f) === ".css") src = stripCss(src);
  if (/https?:\/\//i.test(src)) fail(`${rel}: มี URL http(s):// (ต้องทำงานออฟไลน์)`);
  if (/(?:src|href)\s*=\s*["']\/\//i.test(src) || /url\(\s*["']?\/\//i.test(src)) fail(`${rel}: อ้างทรัพยากรแบบ //host`);
  if ([".css", ".html"].includes(extname(f))) (src.match(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi) || []).forEach((imp) => { if (!/kanit-faces\.css/.test(imp)) fail(`${rel}: @import ที่ไม่ใช่ kanit-faces.css (${imp})`); });
  if ([".js", ".html"].includes(extname(f)) && /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon|importScripts/.test(src)) fail(`${rel}: มีการเรียกเครือข่าย`);
});
section("5. ไม่มี URL ภายนอก · @import ระยะไกล · การเรียกเครือข่าย ใน prototype/");

htmlPages.filter((f) => dirname(f) === P).forEach((f) => {
  const html = read(f), rel = relative(P, f);
  const iCss = html.search(/<link[^>]+href="assets\/app\.css"/), iData = html.indexOf('<script src="assets/data.js"></script>'), iApp = html.indexOf('<script src="assets/app.js"></script>');
  if (iCss < 0) fail(`${rel}: ไม่มี <link rel="stylesheet" href="assets/app.css">`);
  if (iData < 0) fail(`${rel}: ไม่มี <script src="assets/data.js">`);
  if (iApp < 0) fail(`${rel}: ไม่มี <script src="assets/app.js">`);
  if (iCss >= 0 && iData >= 0 && iApp >= 0 && !(iCss < iData && iData < iApp)) fail(`${rel}: ลำดับต้องเป็น app.css → data.js → app.js`);
});
section("6. ทุกหน้า include app.css · data.js · app.js ตามลำดับ");

/* ---------------------------------------------------------------------------
   7. ความถูกต้องของตัวเลข
   ------------------------------------------------------------------------ */
const K = D.kpis, O = K.org.values;
const BR = ["JP1", "JP2", "JP3", "JP4"];
const byB = (rows, b) => rows.find((r) => r.branch === b);

/* 7.1 ข้อ 13.2 */
const M132 = [["visits", "VISITS"], ["walkInVisits", "WALKIN_VISITS"], ["identifiedVisits", "IDENTIFIED_VISITS"], ["uniqueCustomers", "UNIQUE_CUSTOMERS"],
  ["newCustomers", "NEW_CUSTOMERS"], ["returningCustomers", "RETURNING_CUSTOMERS"], ["leads", "LEADS"], ["opportunities", "OPPORTUNITIES"], ["sales", "SALES"],
  ["lostOpportunities", "LOST_OPPORTUNITIES"], ["lostLeads", "LOST_LEADS"], ["salesAmount", "SALES_AMOUNT"]];
eq("13.2 สาขา", K.branches.map((r) => r.branch).join(" "), BR.join(" "));
M132.forEach(([f, code]) => { eq(`13.2 Σ${f}`, sum(K.branches, f), K.branchesTotal[f]); eq(`13.2 รวม ${f} = ${code}`, K.branchesTotal[f], O[code]); });
["onlinePhoneVisits", "salesAmountPrevious"].forEach((f) => eq(`13.2 Σ${f}`, sum(K.branches, f), K.branchesTotal[f]));
eq("13.2 ยอดช่วงก่อนรวม = SALES_AMOUNT ก่อนหน้า", K.branchesTotal.salesAmountPrevious, K.org.previous.SALES_AMOUNT);
[...K.branches, K.branchesTotal].forEach((r) => {
  eq(`13.2 ${r.branch} walk-in + ออนไลน์ = VISITS`, r.walkInVisits + r.onlinePhoneVisits, r.visits);
  eq(`13.2 ${r.branch} ใหม่ + เก่า = ลูกค้าไม่ซ้ำ`, r.newCustomers + r.returningCustomers, r.uniqueCustomers);
  eq(`13.2 ${r.branch} ป้ายเปลี่ยนยอดขาย`, r.salesAmountGrowthDisplay, growthText(r.salesAmount, r.salesAmountPrevious));
});

/* 7.2 ข้อ 13.2b */
const C = K.branchComponents, CT = K.branchComponentsTotal;
Object.keys(CT).filter((k) => k !== "branch").forEach((f) => eq(`13.2b Σ${f}`, sum(C, f), CT[f]));
eq("13.2b Sales ต้นทาง Walk-in = WALKIN_CONVERSION ตัวตั้ง", CT.salesWalkinOrigin, K.org.rates.WALKIN_CONVERSION.num);
eq("13.2b ผู้ซื้อ = BUYERS", CT.buyers, O.BUYERS); eq("13.2b ผู้ซื้อซ้ำ = REPEAT_BUYERS", CT.repeatBuyers, O.REPEAT_BUYERS);
eq("13.1 ผู้ซื้อ 203 + 6", K.org.buyersBreakdown.onceInP + K.org.buyersBreakdown.twiceInP, O.BUYERS);
eq("13.1 ผู้ซื้อซ้ำ 6 + 35", K.org.repeatBuyersBreakdown.twiceInP + K.org.repeatBuyersBreakdown.boughtBeforeP, O.REPEAT_BUYERS);
eq("13.2b visit ปิดแล้ว = OUTCOME ตัวหาร", CT.visitsClosed, K.org.rates.OUTCOME_COMPLETION.den);
eq("13.2b ปิดแล้ว − UNRECORDED = OUTCOME ตัวตั้ง", CT.visitsClosed - CT.visitsUnrecorded, K.org.rates.OUTCOME_COMPLETION.num);
eq("13.2b FOLLOW_UP ตัวหาร = FOLLOWUP ตัวหาร", CT.followupDenominator, K.org.rates.FOLLOWUP_COMPLETION.den);
eq("13.2b ตรงเวลา = FOLLOWUP ตัวตั้ง", CT.followupOnTime, K.org.rates.FOLLOWUP_COMPLETION.num);
eq("13.1 ตัดออก 12 + 9 = 21", CT.followupExcludedOverdueInGrace + CT.followupExcludedOpenDueToday, K.org.followupBreakdown.excludedTotal);
[...C, CT].forEach((r) => eq(`13.2b ${r.branch} ตรงเวลา + ช้า + เปิดพ้นผ่อนผัน = ตัวหาร`, r.followupOnTime + r.followupLate + r.followupOpenPastGrace, r.followupDenominator));
const PV = K.branchPrevious, PT = K.branchPreviousTotal;
["visits", "uniqueCustomers", "leads", "opportunities", "sales"].forEach((f) => eq(`13.2b ก่อนหน้า Σ${f}`, sum(PV, f), PT[f]));
eq("13.2b ก่อนหน้า VISITS", PT.visits, K.org.previous.VISITS); eq("13.2b ก่อนหน้า UNIQUE", PT.uniqueCustomers, K.org.previous.UNIQUE_CUSTOMERS);
eq("13.2b ก่อนหน้า LEADS", PT.leads, K.org.previous.LEADS); eq("13.2b ก่อนหน้า OPPS", PT.opportunities, K.org.previous.OPPORTUNITIES); eq("13.2b ก่อนหน้า SALES", PT.sales, K.org.previous.SALES);
[...BR.map((b) => [byB(K.branches, b), byB(PV, b)]), [K.branchesTotal, PT]].forEach(([cur, prev]) => {
  ["visits", "uniqueCustomers", "leads", "opportunities", "sales"].forEach((f) => eq(`13.2b ${cur.branch} เปลี่ยน ${f}`, prev.growthDisplay[f], growthText(cur[f], prev[f])));
});
BR.forEach((b) => {
  const r = byB(K.branchRates, b), row = byB(K.branches, b), comp = byB(C, b), prev = byB(PV, b);
  const expect = {
    LEAD_RATE: [row.leads, row.visits], OPPORTUNITY_RATE: [row.opportunities, row.leads], CLOSE_RATE: [row.sales, row.sales + row.lostOpportunities],
    LOST_RATE: [row.lostOpportunities, row.sales + row.lostOpportunities], CONV_LEAD_TO_SALE: [row.sales, row.leads], CONV_LEAD_TO_SALE_PREVIOUS: [prev.sales, prev.leads],
    CONV_VISIT_TO_SALE: [row.sales, row.visits], WALKIN_CONVERSION: [comp.salesWalkinOrigin, row.walkInVisits], CAPTURE_RATE: [row.identifiedVisits, row.visits],
    OUTCOME_COMPLETION: [comp.visitsClosed - comp.visitsUnrecorded, comp.visitsClosed], FOLLOWUP_COMPLETION: [comp.followupOnTime, comp.followupDenominator],
    REPEAT_RATE: [comp.repeatBuyers, comp.buyers]
  };
  Object.entries(expect).forEach(([code, [n, d]]) => {
    eq(`13.2b ${b} ${code} ตัวตั้ง`, r[code].num, n); eq(`13.2b ${b} ${code} ตัวหาร`, r[code].den, d); checkR(`13.2b ${b} ${code}`, r[code]);
  });
  eq(`13.2b ${b} Lead→ขาย pp`, r.CONV_LEAD_TO_SALE_PP, ppText(row.sales, row.leads, prev.sales, prev.leads));
});

/* 7.3 ข้อ 13.1 อัตราองค์กร */
const ORG_RATE_INPUTS = {
  LEAD_RATE: [O.LEADS, O.VISITS], OPPORTUNITY_RATE: [O.OPPORTUNITIES, O.LEADS], CLOSE_RATE: [O.SALES, O.SALES + O.LOST_OPPORTUNITIES],
  LOST_RATE: [O.LOST_OPPORTUNITIES, O.SALES + O.LOST_OPPORTUNITIES], CONV_LEAD_TO_SALE: [O.SALES, O.LEADS], CONV_VISIT_TO_SALE: [O.SALES, O.VISITS],
  WALKIN_CONVERSION: [O.SALES_WALKIN_ORIGIN, O.WALKIN_VISITS], REPEAT_RATE: [O.REPEAT_BUYERS, O.BUYERS], CAPTURE_RATE: [O.IDENTIFIED_VISITS, O.VISITS],
  DUPLICATE_RATE: [K.dataQuality.issues.find((i) => i.code === "DUPLICATE_SUSPECTED").total, D.population.activeCustomers],
  MISSING_REQUIRED_RATE: [K.dataQuality.flaggedUniqueCustomers, D.population.activeCustomers]
};
Object.entries(K.org.rates).forEach(([code, r]) => {
  checkR(`13.1 ${code}`, r);
  eq(`13.1 ${code} ข้อความ`, r.display, EXPECTED_ORG_DISPLAY[code]);
  if (ORG_RATE_INPUTS[code]) { eq(`13.1 ${code} ตัวตั้ง`, r.num, ORG_RATE_INPUTS[code][0]); eq(`13.1 ${code} ตัวหาร`, r.den, ORG_RATE_INPUTS[code][1]); }
});
eq("จำนวนอัตราองค์กร", Object.keys(K.org.rates).length, Object.keys(EXPECTED_ORG_DISPLAY).length);
checkR("13.1 ลูกค้าใหม่", K.org.shares.NEW_CUSTOMERS); checkR("13.1 ลูกค้าเก่า", K.org.shares.RETURNING_CUSTOMERS);
checkR("13.1 Lead→ขาย ก่อนหน้า", K.org.ratesPrevious.CONV_LEAD_TO_SALE);
eq("13.1 Lead→ขาย pp", K.org.ppDisplay.CONV_LEAD_TO_SALE, ppText(O.SALES, O.LEADS, K.org.previous.SALES, K.org.previous.LEADS));
Object.entries(K.org.growthDisplay).forEach(([code, t]) => eq(`13.1 เปลี่ยน ${code}`, t, growthText(O[code], K.org.previous[code])));
Object.entries(K.org.targetDisplay).forEach(([code, t]) => {
  const r = K.org.rates[code], tg = D.kpiTargets[code];
  const ok = tg.op === ">=" ? big(r.num) * 100n >= big(tg.pct) * big(r.den) : big(r.num) * 100n < big(tg.pct) * big(r.den);
  eq(`13.1 เป้า ${code}`, t, ok ? "ผ่าน" : "ต่ำกว่าเป้า");
});
eq("13.0 ลูกค้า ACTIVE = 6,836 + 8,126", D.population.active2026 + D.population.imported2025, D.population.activeCustomers);
Object.entries(EXPECTED_ORG).forEach(([k, v]) => eq(`13.1 ${k}`, O[k], v));
Object.entries(EXPECTED_ORG_PREVIOUS).forEach(([k, v]) => eq(`13.1 ก่อนหน้า ${k}`, K.org.previous[k], v));

/* 7.4 Funnel */
[["ALL", K.branchesTotal], ...BR.map((b) => [b, byB(K.branches, b)])].forEach(([k, row]) => {
  const f = D.funnels[k];
  eq(`funnel ${k} VISITS`, f.VISITS, row.visits); eq(`funnel ${k} LEADS`, f.LEADS, row.leads); eq(`funnel ${k} OPPS`, f.OPPORTUNITIES, row.opportunities); eq(`funnel ${k} SALES`, f.SALES, row.sales);
  ["LEADS", "OPPORTUNITIES", "SALES"].forEach((s) => eq(`funnel ${k} ${s} %`, f.pctOfVisitors[s], pctText(f[s], f.VISITS)));
});

/* 7.5 ข้อ 13.3 แหล่งที่มา */
const SRC = K.sources;
BR.forEach((b) => {
  const row = SRC.byBranch[b];
  eq(`13.3 ${b} ผลรวมช่องทาง`, sum(SRC.channels, (c) => row[c]), row.total);
  eq(`13.3 ${b} รวม = ลูกค้าไม่ซ้ำ 13.2`, row.total, byB(K.branches, b).uniqueCustomers);
});
SRC.channels.forEach((c) => { eq(`13.3 Σ${c}`, sum(BR, (b) => SRC.byBranch[b][c]), SRC.total[c]); checkR(`13.3 ${c} %`, SRC.totalShares[c]); eq(`13.3 ${c} ตัวตั้ง`, SRC.totalShares[c].num, SRC.total[c]); eq(`13.3 ${c} ตัวหาร`, SRC.totalShares[c].den, SRC.total.total); });
eq("13.3 รวม = UNIQUE_CUSTOMERS", SRC.total.total, O.UNIQUE_CUSTOMERS);
eq("13.3 Σ ทุกช่องทาง", sum(SRC.channels, (c) => SRC.total[c]), SRC.total.total);
eq("13.3 WEBSITE", SRC.total.WEBSITE, 0);

/* 7.6 ข้อ 13.4 เหตุผลที่ไม่สำเร็จ */
const LR = K.lostReasons;
const lrRows = [...LR.top, LR.others, ...LR.othersMembers];
lrRows.forEach((r) => eq(`13.4 ${r.code} Σสาขา`, sum(BR, (b) => r.byBranch[b]), r.total));
BR.forEach((b) => {
  eq(`13.4 อื่น ๆ ${b} = Σสมาชิก`, sum(LR.othersMembers, (m) => m.byBranch[b]), LR.others.byBranch[b]);
  eq(`13.4 รวม ${b}`, sum([...LR.top, LR.others], (r) => r.byBranch[b]), LR.total.byBranch[b]);
  const row = byB(K.branches, b);
  eq(`13.4 รวม ${b} = Lost Opp + Lost Lead`, LR.total.byBranch[b], row.lostOpportunities + row.lostLeads);
});
eq("13.4 อื่น ๆ รวม = Σสมาชิก", sum(LR.othersMembers, "total"), LR.others.total);
eq("13.4 อื่น ๆ lead = Σสมาชิก", sum(LR.othersMembers, "leads"), LR.others.leads);
eq("13.4 รวม = LOST_TOTAL", sum([...LR.top, LR.others], "total"), O.LOST_TOTAL);
eq("13.4 lead รวม = LOST_LEADS", sum([...LR.top, LR.others], "leads"), O.LOST_LEADS);
eq("13.4 total.total", LR.total.total, O.LOST_TOTAL);
[...LR.top, LR.others].forEach((r) => { checkR(`13.4 ${r.code} %`, r.share); eq(`13.4 ${r.code} ตัวตั้ง`, r.share.num, r.total); eq(`13.4 ${r.code} ตัวหาร`, r.share.den, O.LOST_TOTAL); });

/* 7.7 ข้อ 13.6 รายพนักงาน · ทีม · 13.9 pipeline · 13.10 งาน */
const SJ = K.staffJP1, JP1 = byB(K.branches, "JP1");
["leads", "opportunities", "sales", "salesAmount", "lostOpportunities", "lostLeads", "openLeads", "openOpportunities", "openPipelineAmount", "wonLast7Days", "wonLast7DaysAmount"]
  .forEach((f) => eq(`13.6 Σ${f} = รวม JP1`, sum(SJ.slices, (s) => nz(s[f])), SJ.total[f]));
["leads", "opportunities", "sales", "salesAmount", "lostOpportunities", "lostLeads"].forEach((f) => eq(`13.6 รวม JP1 ${f} = 13.2`, SJ.total[f], JP1[f]));
eq("13.6 Lead เปิดอยู่ตามสถานะ", sum(Object.values(SJ.total.openLeadsByStatus)), SJ.total.openLeads);
SJ.slices.filter((s) => s.openByStage).forEach((s) => eq(`13.6 ${s.staff} Σขั้น`, sum(Object.values(s.openByStage)), s.openOpportunities));
["INTERESTED", "QUOTATION", "FOLLOW_UP"].forEach((st) => eq(`13.6 Σ${st}`, sum(SJ.slices, (s) => nz(s.openByStage && s.openByStage[st])), SJ.total.openByStage[st]));
eq("13.9 Sales 8 + 74 = 82", SJ.salesSplit.inLast7Days + SJ.salesSplit.others, JP1.sales);
eq("13.9 ยอด 285,400 + 959,600", SJ.salesSplit.inLast7DaysAmount + SJ.salesSplit.othersAmount, JP1.salesAmount);
const kw = SJ.slices.find((s) => s.staff === "ST-0045"), km = SJ.slices.find((s) => s.staff === "ST-0046");
const TM = K.teamJP1Sales;
eq("13.6 ทีม Leads = ขวัญ + คิม", TM.leads, kw.leads + km.leads); eq("13.6 ทีม Opps", TM.opportunities, kw.opportunities + km.opportunities);
eq("13.6 ทีม Sales", TM.sales, kw.sales + km.sales); eq("13.6 ทีม ยอดขาย", TM.salesAmount, kw.salesAmount + km.salesAmount);
eq("13.6 ทีม Conversion ตัวตั้ง/ตัวหาร", `${TM.convLeadToSale.num}/${TM.convLeadToSale.den}`, `${TM.sales}/${TM.leads}`); checkR("13.6 ทีม Conversion", TM.convLeadToSale);
eq("13.6 งานเกินกำหนดของทีม", TM.teamOverdueTasks, kw.tasksOverdue + km.tasksOverdue);
const PL = D.pipelineJP1.columns;
const openCols = PL.filter((c) => c.stage !== "WON");
eq("13.9 Σจำนวนคอลัมน์เปิด = โอกาสขายเปิด JP1", sum(openCols, "count"), SJ.total.openOpportunities);
eq("13.9 Σมูลค่าคอลัมน์เปิด", sum(openCols, "amount"), SJ.total.openPipelineAmount);
openCols.forEach((c) => eq(`13.9 ${c.stage} = Σพนักงาน`, c.count, SJ.total.openByStage[c.stage]));
const won = PL.find((c) => c.stage === "WON");
eq("13.9 ปิดการขาย 7 วัน จำนวน", won.count, SJ.total.wonLast7Days); eq("13.9 ปิดการขาย 7 วัน มูลค่า", won.amount, SJ.total.wonLast7DaysAmount);
PL.forEach((c) => c.cards.forEach((card) => { if (!D.customers.find((x) => x.customerNo === card.customerNo)) fail(`13.9 การ์ดอ้างลูกค้า ${card.customerNo} ที่ไม่มี`); }));
const TK = D.tasksKwan;
eq("13.10 ทั้งหมด = วันนี้ + เกินกำหนด", TK.today + TK.overdue, TK.total);
eq("13.10 จำนวนแถว", TK.rows.length, TK.total);
eq("13.10 แถววันนี้", TK.rows.filter((r) => r.group === "today").length, TK.today);
eq("13.10 แถวเกินกำหนด", TK.rows.filter((r) => r.group === "overdue").length, TK.overdue);
eq("13.10 = 13.6 งานวันนี้ขวัญ", TK.today, kw.tasksToday); eq("13.10 = 13.6 เกินกำหนดขวัญ", TK.overdue, kw.tasksOverdue);
eq("13.10 คิม = 13.6", `${TK.kim.today}·${TK.kim.overdue}`, `${km.tasksToday}·${km.tasksOverdue}`);
TK.rows.forEach((r) => {
  if (!D.customers.find((x) => x.customerNo === r.customerNo)) fail(`13.10 งาน #${r.no} อ้างลูกค้า ${r.customerNo} ที่ไม่มี`);
  const day = r.dueAt.slice(0, 10);
  if (r.group === "today" && day !== "2026-09-11") fail(`13.10 งาน #${r.no} กลุ่มวันนี้แต่ due ${day}`);
  if (r.group === "overdue" && !(day < "2026-09-11")) fail(`13.10 งาน #${r.no} กลุ่มเกินกำหนดแต่ due ${day}`);
});
const dueTodayFU = TK.rows.filter((r) => r.group === "today" && r.type === "FOLLOW_UP").length;
eq("13.1 FOLLOW_UP เปิด due วันนี้ JP1 = ขวัญ + คิม", dueTodayFU + TK.kim.today, CT.followupExcludedOpenDueToday);
eq("13.12 OVERDUE_FOLLOWUP JP1 = ขวัญ FOLLOW_UP เกินกำหนด + คิม", TK.rows.filter((r) => r.group === "overdue" && r.type === "FOLLOW_UP").length + TK.kim.overdue,
  K.dataQuality.issues.find((i) => i.code === "OVERDUE_FOLLOWUP").byBranch.JP1);
eq("13.14 แจ้งเตือนขวัญ 6", (D.notifications["ST-0045"] || []).length, 6); eq("13.14 แจ้งเตือนคิม 5", (D.notifications["ST-0046"] || []).length, 5);
eq("13.14 แจ้งเตือนนัท 3", (D.notifications["ST-0030"] || []).length, 3); eq("13.14 แจ้งเตือนเจ 4", (D.notifications["ST-0020"] || []).length, 4);
eq("13.14 แจ้งเตือนแพร 1", (D.notifications["ST-0002"] || []).length, 1); eq("13.14 แจ้งเตือนจ๋าอั๋น 1", (D.notifications["ST-0001"] || []).length, 1);
eq("13.14 ผู้รับแจ้งเตือน", Object.keys(D.notifications).sort().join(" "), "ST-0001 ST-0002 ST-0020 ST-0030 ST-0045 ST-0046");

/* 7.8 ข้อ 13.11 วันนี้ · 13.12 คุณภาพข้อมูล · 13.7 Customer 360 */
const TD = K.today;
["walkInVisits", "onlinePhoneVisits", "visits", "identifiedVisits", "uniqueCustomers", "uniqueSameDayLastWeek", "openVisits"].forEach((f) => eq(`13.11 Σ${f}`, sum(TD.rows, f), TD.total[f]));
[...TD.rows, TD.total].forEach((r) => {
  eq(`13.11 ${r.branch} walk-in + ออนไลน์`, r.walkInVisits + r.onlinePhoneVisits, r.visits);
  eq(`13.11 ${r.branch} เปลี่ยน`, r.growthDisplay, growthText(r.uniqueCustomers, r.uniqueSameDayLastWeek));
});
eq("13.11 visit เปิด = OPEN_VISITS", TD.total.openVisits, O.OPEN_VISITS);
eq("13.11 คิว JP1 = visit เปิด JP1", D.queueJP1.length, byB(TD.rows, "JP1").openVisits);
BR.forEach((b) => eq(`13.0 VISIT:${b}:20260911 = VISITS วันนี้`, D.runningNumbers[`VISIT:${b}:20260911`], byB(TD.rows, b).visits));
eq("13.0 QUEUE:JP1 = Walk-in JP1 วันนี้", D.runningNumbers["QUEUE:JP1:20260911"], byB(TD.rows, "JP1").walkInVisits);
eq("13.0 LD:2026 = 6,650 + 3 + 892", D.runningNumbers["LD:2026"], 6650 + 3 + O.LEADS);
K.dataQuality.issues.forEach((i) => eq(`13.12 ${i.code} Σสาขา`, sum(BR, (b) => i.byBranch[b]), i.total));
const dq = (code) => K.dataQuality.issues.find((i) => i.code === code).total;
eq("13.12 ลูกค้าไม่ซ้ำที่ติดธง = 23 + 42 − 4", dq("MISSING_PHONE") + dq("INCOMPLETE_CUSTOMER") - K.dataQuality.overlapMissingPhoneAndIncomplete, K.dataQuality.flaggedUniqueCustomers);
eq("13.12 LEAD_WITHOUT_OWNER JP1 = ไม่มี owner 13.6", K.dataQuality.issues.find((i) => i.code === "LEAD_WITHOUT_OWNER").byBranch.JP1, SJ.slices.find((s) => s.staff === null).openLeads);
eq("13.12 WON_WITHOUT_TRANSACTION = 12", dq("WON_WITHOUT_TRANSACTION"), 12);
const C360 = D.customer360["CUS-2026-000297"];
eq("13.7 ติดต่อ = interaction ที่ไม่ใช่ INTERNAL", C360.interactions.filter((i) => i.direction !== "INTERNAL").length, C360.summary.contacts);
eq("13.7 เข้าร้าน = visit WALK_IN", C360.interactions.filter((i) => i.channel === "WALK_IN" && i.visit).length, C360.summary.storeVisits);
eq("13.7 visit ทั้งหมด", C360.interactions.filter((i) => i.visit).length, C360.visitCount);
eq("13.7 ซื้อ = ธุรกรรมที่นับเป็นการซื้อ", C360.transactions.filter((t) => D.transactionTypes.find((x) => x.code === t.type).countsAsPurchase).length, C360.summary.purchases);
eq("13.7 ยอดซื้อสะสม", sum(C360.transactions, "amount"), C360.summary.lifetimeAmount);
eq("13.8 รายการลูกค้า 5 แถว", D.customerList.rows.length, 5);
eq("13.8 ยอดรวม = UNIQUE_CUSTOMERS", D.customerList.total, O.UNIQUE_CUSTOMERS);
D.customerList.rows.forEach((no) => { const c = D.customers.find((x) => x.customerNo === no); if (!c || !c.contacts.length) fail(`13.8 ${no} ไม่มีข้อมูลลูกค้า/เบอร์`); });
section("7. ตัวเลขใน data.js รวมกันได้และร้อยละคำนวณใหม่ตรงข้อความ (13.1–13.12)");

/* ---------------------------------------------------------------------------
   8. การ์ด dashboard ข้อ 14.7 ตรงข้อมูลที่อ้าง
   ------------------------------------------------------------------------ */
function resolve(path) {
  return path.split(".").reduce((o, seg) => {
    if (o == null) return undefined;
    const m = seg.match(/^(\w+)\[([^\]]+)\]$/);
    if (!m) return o[seg];
    const arr = o[m[1]];
    return Array.isArray(arr) ? arr.find((x) => x.branch === m[2] || x.staff === m[2]) : undefined;
  }, D);
}
const EXPECTED_CARDS = {
  org: "ลูกค้าไม่ซ้ำวันนี้ 16 (+14%) · ลูกค้าไม่ซ้ำ 1,284 (+12%) · Leads 892 (+8%) · Opportunities 368 (+14%) · ปิดการขาย 215 (+18%) · Conversion (Lead → ขาย) 24.1% (+2.1 pp)",
  branchManager: "ลูกค้าไม่ซ้ำวันนี้ 7 (+17%) · ลูกค้าไม่ซ้ำ 412 (+12%) · Leads 298 (+8%) · Opportunities 120 (+14%) · ปิดการขาย 82 (+19%) · Conversion (Lead → ขาย) 27.5% (+2.5 pp)",
  supervisor: "Leads 296 · Opportunities 120 · ปิดการขาย 82 · ยอดขาย ฿1,245,000 · Conversion (Lead → ขาย) 27.7% · งานเกินกำหนดของทีม 7",
  staff: "งานวันนี้ 8 · เกินกำหนด 4 · Lead ที่ดูแล (เปิดอยู่) 30 · โอกาสขายที่ดูแล 34 (฿731,600) · ปิดการขาย 30 วัน 44 · ยอดขาย 30 วัน ฿668,400"
};
D.dashboards.forEach((db) => {
  const text = db.cards.map((c) => `${c.labelTh} ${c.display}${c.delta ? ` (${c.delta})` : ""}`).join(" · ");
  eq(`14.7 การ์ด ${db.key}`, text, EXPECTED_CARDS[db.key]);
  db.cards.forEach((c) => {
    const v = resolve(c.ref);
    if (v === undefined) { fail(`14.7 ${db.key}.${c.key} อ้าง ${c.ref} ที่ไม่มี`); return; }
    if (v && typeof v === "object") eq(`14.7 ${db.key}.${c.key} = ${c.ref}`, c.display, v.display);
    else eq(`14.7 ${db.key}.${c.key} = ${c.ref}`, c.value, v);
  });
  db.widgets.forEach((w) => { if (w.ref && resolve(w.ref) === undefined) fail(`14.7 widget ${db.key}.${w.type} อ้าง ${w.ref} ที่ไม่มี`); });
});
eq("14.7 การ์ด org ลูกค้าไม่ซ้ำ เปลี่ยน", D.dashboards[0].cards[1].delta, K.org.growthDisplay.UNIQUE_CUSTOMERS);
eq("14.7 การ์ด BM Conversion pp", D.dashboards[1].cards[5].delta, byB(K.branchRates, "JP1").CONV_LEAD_TO_SALE_PP);
section("8. การ์ด dashboard ตามบทบาท (ข้อ 14.7) ตรงข้อมูลที่อ้าง");

/* ---------------------------------------------------------------------------
   9. สิทธิ์ข้อ 13.13 และตัวจัดรูปแบบของ app.js
   ------------------------------------------------------------------------ */
if (J) {
  const custCtx = { customer: { branches: ["JP1"], owner: "ST-0045" } };
  const oppCtx = { branch: "JP1", owner: "ST-0045" };
  EXPECTED_13_13.forEach(([s, a, ...exp]) => {
    const as = { staffCode: s, aal: a };
    const got = [J.can("customer.read", custCtx, as), J.can("customer.update", custCtx, as), J.can("opportunity.update", oppCtx, as),
      J.can("task.read", oppCtx, as), J.can("customer.pii.reveal", custCtx, as)].map((x) => (x ? 1 : 0));
    eq(`13.13 ${s} ${a} [อ่าน·แก้ลูกค้า·แก้ OP·อ่าน TK·เปิดเบอร์]`, got.join(""), exp.join(""));
  });
  if (J.can("customer.read", {}, { staffCode: "ST-0051" })) fail("13.13 ผู้ใช้ INVITED ไม่มีบทบาทต้องไม่มีสิทธิ์");
  if (Object.keys(D.permissions).some((p) => /^(customer|visit|lead|opportunity)\./.test(p) && D.permissions[p].SYSTEM_ADMIN)) fail("7.2 SYSTEM_ADMIN ต้องไม่มีสิทธิ์ customer.* visit.* lead.* opportunity.*");
  eq("14.1 หน้าแรก SYSTEM_ADMIN", J.landingFile({ staffCode: "ST-0003", aal: "aal2" }), "18-settings.html");
  eq("14.1 หน้าแรก STAFF", J.landingFile({ staffCode: "ST-0045", aal: "aal1" }), "02-dashboard.html");
  const f = J.fmt;
  [
    [f.int(3125), "3,125"], [f.money(3332700), "฿3,332,700"], [f.moneyTable(1245000), "1,245,000"], [f.pct(215, 892), "24.1%"], [f.pct(36, 100), "36.0%"],
    [f.pct(94.96, 100), "95.0%"], [String(f.meetsTarget(9496, 10000, "CAPTURE_RATE")), "false"], [f.growth(3125, 2790), "+12%"], [f.growth(95, 100), "−5%"],
    [f.growth(4, 0), "–"], [f.pp(215, 892, 182, 826), "+2.1 pp"], [f.pp(96, 1000, 100, 1000), "−0.4 pp"], [f.round(2.675, 2), "2.68"], [f.round(-2.5, 0), "−3"],
    [f.date("2026-09-11T10:24:00+07:00"), "11 ก.ย. 2569"], [f.time("2026-09-11T10:24:00+07:00"), "10:24 น."], [f.dateTime("2026-09-11T03:24:00Z"), "11 ก.ย. 2569 10:24"],
    [f.int(null), "–"]
  ].forEach(([got, want], i) => eq(`fmt ตัวอย่างที่ ${i + 1}`, got, want));
  if (/Math\.round\(/.test(read(join(P, "assets/app.js")))) fail("app.js ใช้ Math.round (ข้อ 1.3 ห้ามปัด float)");
}
section("9. JCRM.can ตรงข้อ 13.13 · ตัวจัดรูปแบบตัวเลข/วันที่ตรงข้อ 1.2–1.3");

/* ---------------------------------------------------------------------------
   10. ค่าที่ปรับใน CANONICAL v2.2 (ตรึงค่าคาดหวังในสคริปต์ · ห้ามอ่านจาก data.js)
   ------------------------------------------------------------------------ */
eq("meta.canonicalVersion", D.meta.canonicalVersion, "v2.2");
{
  const rootBlock = (appCss.match(/:root\s*\{[\s\S]*?\n\}/) || [""])[0];
  const token = (name) => { const m = rootBlock.match(new RegExp("--" + name + ":\\s*([^;]+);")); return m ? m[1].trim() : null; };
  eq("ข้อ 15 --chart-1", token("chart-1"), "#0B1E41"); eq("ข้อ 15 --chart-2", token("chart-2"), "#2F6FD6"); eq("ข้อ 15 --chart-3", token("chart-3"), "#C2410C");
  eq("ข้อ 15 --chart-4", token("chart-4"), "#B42359"); eq("ข้อ 15 --chart-5 (D49)", token("chart-5"), "#7C3AED"); eq("ข้อ 15 --chart-6", token("chart-6"), "#5B6B8C");
  eq("ข้อ 15 --chart-7", token("chart-7"), "#15803D");
  eq("ข้อ 15 เส้นคั่นกราฟ = --white", token("chart-separator"), "var(--white)"); eq("ข้อ 15 --white", token("white"), "#FBFBFB");
  eq("ข้อ 15 placeholder", token("text-placeholder"), "var(--gray-600)");
  eq("ข้อ 19.5 --priority-unknown", token("priority-unknown"), "var(--gray-300)");
  eq("ข้อ 15 สีเหตุผลที่ไม่สำเร็จ", token("chart-lost"), "var(--support-blue)");
  if (!/\.kanban-card \{[^}]*border-inline-start: 4px solid var\(--priority-unknown\)/.test(appCss)) fail("ข้อ 19.5 การ์ดที่ไม่มี priority ต้องใช้ขอบ --priority-unknown");
  if (!/\.btn--accent \{[^}]*var\(--jaun-orange\)[^}]*var\(--text-on-accent\)/.test(appCss)) fail("design-system 7.1: .btn--accent ต้องเป็นพื้นส้ม ตัวอักษร navy");
}
eq("ข้อ 2 ทีม", D.teams.map((t) => `${t.code}=${t.name}@${t.branch}`).join(" | "),
  "JP1-SALES=ทีมขาย JAUNPHONE 1@JP1 | JP2-SALES=ทีมขาย JAUNPHONE 2@JP2 | JP3-SALES=ทีมขาย JAUNPHONE 3@JP3 | JP4-SALES=ทีมขาย JAUNPHONE 4@JP4 | JPON-ADMIN=ทีมแอดมินออนไลน์@JPON");
{
  const EXPECTED_48 = {
    consentStatus: "GRANTED=ยินยอม/แจ้งแล้ว WITHDRAWN=ถอนแล้ว",
    consentCaptureVia: "STAFF_FORM=พนักงานบันทึก LINK_SENT=ส่งลิงก์ประกาศ LINE_OA=ผ่าน LINE OA WEB=ผ่านเว็บไซต์",
    duplicateStatus: "PENDING=รอตัดสิน MERGED=รวมแล้ว NOT_DUPLICATE=ยืนยันคนละคน",
    dsrStatus: "RECEIVED=รับคำขอแล้ว VERIFIED=ยืนยันตัวตนแล้ว IN_PROGRESS=กำลังดำเนินการ COMPLETED=เสร็จสิ้น REJECTED=ปฏิเสธคำขอ",
    exportStatus: "REQUESTED=รออนุมัติ APPROVED=อนุมัติแล้ว REJECTED=ไม่อนุมัติ GENERATED=พร้อมดาวน์โหลด DOWNLOADED=ดาวน์โหลดแล้ว EXPIRED=หมดอายุ",
    roleGrantStatus: "REQUESTED=รออนุมัติ APPROVED=อนุมัติแล้ว REJECTED=ไม่อนุมัติ",
    roleGrantType: "GRANT=มอบ REVOKE=ถอน",
    dsrVerificationMethod: "IN_PERSON_ID_SIGHTED=เห็นบัตรต่อหน้า OTP_TO_REGISTERED_CONTACT=รหัส OTP ไปช่องทางที่ลงทะเบียน OTHER=อื่น ๆ",
    dsrType: "ACCESS=ขอดู/ขอสำเนา CORRECTION=ขอแก้ไข DELETION=ขอลบ OBJECTION=คัดค้าน WITHDRAW_CONSENT=ถอนความยินยอม PORTABILITY=ขอโอนย้าย",
    interestLevel: "HOT=สนใจมาก WARM=สนใจ COLD=สนใจน้อย",
    staffStatus: "INVITED=เชิญแล้ว ACTIVE=ใช้งาน DISABLED=ปิดใช้งาน",
    interactionDirection: "INBOUND=ลูกค้าติดต่อมา OUTBOUND=พนักงานติดต่อไป INTERNAL=บันทึกภายใน"
  };
  Object.entries(EXPECTED_48).forEach(([k, v]) => eq(`ข้อ 4.8 ป้าย ${k}`, (D.enums[k] || []).map((x) => `${x.code}=${x.labelTh}`).join(" "), v));
}
{
  const R = D.recentCustomers["ST-0045"];
  const EXPECTED_RECENT = [["CUS-2026-000297", "2026-09-11T10:24"], ["CUS-2026-006310", "2026-09-10T16:40"], ["CUS-2026-005412", "2026-09-10T14:05"], ["CUS-2026-006840", "2026-09-10T11:20"], ["CUS-2026-005980", "2026-09-09T15:10"]];
  if (!R) fail("ข้อ 13.5 ไม่มี recentCustomers ของคุณขวัญ");
  else {
    eq("ข้อ 13.5 ลูกค้าของฉันล่าสุด", R.rows.map((r) => `${r.customerNo}@${String(r.lastActivityAt).slice(0, 16)}`).join(" "), EXPECTED_RECENT.map(([n, t]) => `${n}@${t}`).join(" "));
    R.rows.forEach((r) => {
      const c = D.customers.find((x) => x.customerNo === r.customerNo);
      if (!c) { fail(`ข้อ 13.5 ไม่มีลูกค้า ${r.customerNo}`); return; }
      eq(`ข้อ 13.5 ${r.customerNo} ผู้ดูแล`, c.owner, "ST-0045"); eq(`ข้อ 13.5 ${r.customerNo} last_activity_at`, c.lastActivityAt, r.lastActivityAt);
    });
  }
  eq("ข้อ 13.5 ผู้ดูแลลูกค้าคุณวิไลวรรณ = คุณคิม", (D.customers.find((x) => x.customerNo === "CUS-2026-006790") || {}).owner, "ST-0046");
  eq("ข้อ 13.5 กิจกรรมล่าสุด = 5 แถวแรกข้อ 13.8", (D.recentActivity || { rows: [] }).rows.join(" "), D.customerList.rows.slice(0, 5).join(" "));
  eq("ข้อ 13.8 สาขาของกิจกรรมล่าสุด", D.customerList.rows.map((no) => (D.customers.find((x) => x.customerNo === no) || {}).lastBranch).join(" "), "JP1 JP2 JP3 JP1 JP4");
}
{
  const EXPECTED_PRIORITY = { "CUS-2026-005980": "HIGH", "CUS-2026-006121": "NORMAL", "CUS-2026-005412": "HIGH", "CUS-2026-004877": "NORMAL", "CUS-2026-000297": "HIGH", "CUS-2026-003966": "NORMAL", "CUS-2026-006310": "NORMAL", "CUS-2026-006455": "NORMAL" };
  const cards = D.pipelineJP1.columns.flatMap((c) => c.cards);
  eq("ข้อ 13.9 จำนวนการ์ดตัวอย่าง", cards.length, 8);
  cards.forEach((c) => eq(`ข้อ 13.9 priority ${c.customerNo}`, c.priority, EXPECTED_PRIORITY[c.customerNo]));
}
{
  const EXPECTED_BELL = {
    "ST-0045": "FOLLOWUP_OVERDUE FOLLOWUP_OVERDUE FOLLOWUP_OVERDUE TASK_OVERDUE TASK_OVERDUE DATA_MISSING@2026-09-11T09:00",
    "ST-0046": "LEAD_ASSIGNED:LD-2026-007512@2026-09-10T18:05 FOLLOWUP_OVERDUE FOLLOWUP_OVERDUE FOLLOWUP_OVERDUE DATA_MISSING@2026-09-11T09:00",
    "ST-0030": "LEAD_UNASSIGNED LEAD_UNASSIGNED DUPLICATE_SUSPECTED@2026-09-10T18:00",
    "ST-0020": "LEAD_UNASSIGNED LEAD_UNASSIGNED DUPLICATE_SUSPECTED@2026-09-10T18:00 VISIT_OUTCOME_MISSING",
    "ST-0002": "EXPORT_APPROVAL_REQUIRED:EX-2026-000031",
    "ST-0001": "ROLE_GRANT_APPROVAL_REQUIRED:RG-2026-0003"
  };
  Object.entries(EXPECTED_BELL).forEach(([s, want]) => eq(`ข้อ 13.14 กระดิ่ง ${s}`, (D.notifications[s] || []).map((n) => n.code + (n.entityRef ? ":" + n.entityRef : "") + (n.createdAt ? "@" + n.createdAt.slice(0, 16) : "")).join(" "), want));
  eq("ข้อ 13.14 ขวัญ งานที่อ้าง", D.notifications["ST-0045"].filter((n) => n.taskRow).map((n) => n.taskRow).join(" "), "2 3 4 1 5");
  Object.values(D.notifications).flat().forEach((n) => { if (!n.target || !screenIds.has(n.target.screen)) fail(`13.14 แจ้งเตือน ${n.code} ไม่มีปลายทางที่มีจริง`); if (!D.notificationTypes.find((t) => t.code === n.code)) fail(`11.1 ไม่มีรหัส ${n.code}`); });
  const V22_NOTIF = { LOCKOUT_REPEATED: "บัญชีถูกล็อกซ้ำ", LINK_LIMIT_EXCEEDED: "ผูกลูกค้าข้ามสาขาเกินเกณฑ์", CUSTOMER_VIEW_LIMIT_EXCEEDED: "เปิดดูลูกค้าจำนวนมาก", EXPORT_READY: "ไฟล์ส่งออกพร้อมดาวน์โหลด", ROLE_GRANT_DECIDED: "คำขอบทบาทได้รับการตัดสินแล้ว", DSR_DUE_SOON: "คำขอเจ้าของข้อมูลใกล้ครบกำหนด" };
  Object.entries(V22_NOTIF).forEach(([c, t]) => eq(`ข้อ 11.1 v2.2 ${c}`, (D.notificationTypes.find((x) => x.code === c) || {}).titleTh, t));
  ["pdpa.current_notice_version", "security.login_ip_per_15min · dsr.anonymize_per_day"].forEach((k) => { if (!D.settings.find((x) => x.key === k)) fail(`ข้อ 11.2 v2.2 ไม่มี setting ${k}`); });
}
{
  const ex30 = D.exportRequests.find((x) => x.exportNo === "EX-2026-000030") || {};
  eq("ข้อ 13.14 EX-2026-000030", [ex30.requester, ex30.requestedAsRole, ex30.requestedAt, ex30.reason, ex30.rows, ex30.status, ex30.downloads, ex30.fileDeletedAt].join(" "),
    "ST-0020 BRANCH_MANAGER 2026-09-05T14:05:00+07:00 MANAGEMENT_REPORT 412 EXPIRED 1 2026-09-06");
  const ex31 = D.exportRequests.find((x) => x.exportNo === "EX-2026-000031") || {};
  eq("ข้อ 13.14 EX-2026-000031", [ex31.requester, ex31.requestedAsRole, ex31.requestedAt, ex31.reason, ex31.rows, ex31.status].join(" "), "ST-0011 MARKETING 2026-09-10T16:20:00+07:00 MARKETING_CAMPAIGN 1850 REQUESTED");
  ["CUS-2026-006633", "CUS-2026-002118"].forEach((no) => {
    const c = D.customers.find((x) => x.customerNo === no) || {};
    eq(`ข้อ 13.14 คู่ซ้ำ ${no} สาขาแรก · ผู้ดูแล`, `${c.firstBranch} ${c.branch} ${c.owner}`, "JP1 JP1 ST-0046");
  });
  const pair = D.duplicatePairs[0] || {};
  eq("ข้อ 13.14 คู่ซ้ำ", [pair.newCustomerNo, pair.candidateCustomerNo, pair.createdBy, pair.createdAt, pair.overrideReason, pair.score, pair.reasonTh, pair.status].join(" "),
    "CUS-2026-006633 CUS-2026-002118 ST-0046 2026-09-03 FAMILY_SHARED_PHONE 100 เบอร์โทรตรงกัน PENDING");
}
{
  const E = (D.kpis.emptyScopes || {})["ST-0050"];
  if (!E) fail("ข้อ 13.13 ไม่มีค่า NULL KPI ของคุณฝน");
  else {
    const UNBOUND = ["UNIQUE_CUSTOMERS", "NEW_CUSTOMERS", "RETURNING_CUSTOMERS", "BUYERS", "REPEAT_BUYERS"];
    Object.entries(E.values).forEach(([k, v]) => {
      if (UNBOUND.includes(k) || k === "LEAD_RESPONSE_MIN") { if (v !== null) fail(`ข้อ 13.13 คุณฝน ${k} ต้องเป็น NULL`); }
      else if (v !== 0) fail(`ข้อ 13.13 คุณฝน ${k} ต้องเป็น 0`);
    });
    UNBOUND.forEach((k) => { if (!(k in E.values)) fail(`ข้อ 13.13 คุณฝน ไม่มี ${k}`); });
    Object.keys(EXPECTED_ORG_DISPLAY).forEach((k) => { if (E.rates[k] !== null) fail(`ข้อ 13.13 คุณฝน อัตรา ${k} (0/0) ต้องเป็น NULL`); });
  }
}
{
  const C = D.kpis.current || {}, SJ2 = D.kpis.staffJP1, JP1c = (C.branches || {}).JP1 || {};
  eq("12.1 OPEN_VISITS องค์กร = 13.1", (C.org || {}).OPEN_VISITS, 4); eq("12.1 OPEN_FOLLOWUP_CUSTOMERS = 117", (C.org || {}).OPEN_FOLLOWUP_CUSTOMERS, 117);
  BR.forEach((b) => eq(`12.1 OPEN_VISITS ${b} = 13.11`, ((C.branches || {})[b] || {}).OPEN_VISITS, byB(K.today.rows, b).openVisits));
  eq("12.1 OPEN_LEADS JP1", JP1c.OPEN_LEADS, SJ2.total.openLeads); eq("12.1 OPEN_LEADS_BY_STATUS JP1", JSON.stringify(JP1c.OPEN_LEADS_BY_STATUS), JSON.stringify(SJ2.total.openLeadsByStatus));
  eq("12.1 OPEN_OPPORTUNITIES JP1", JP1c.OPEN_OPPORTUNITIES, 62); eq("12.1 OPEN_PIPELINE_AMOUNT JP1", JP1c.OPEN_PIPELINE_AMOUNT, 1327100);
  ["INTERESTED", "QUOTATION", "FOLLOW_UP"].forEach((st) => {
    const col = D.pipelineJP1.columns.find((c) => c.stage === st);
    eq(`12.1 OPEN_OPPORTUNITIES_BY_STAGE ${st} = 13.9`, (JP1c.OPEN_OPPORTUNITIES_BY_STAGE || {})[st], col.count);
    eq(`12.1 OPEN_PIPELINE_AMOUNT_BY_STAGE ${st} = 13.9`, (JP1c.OPEN_PIPELINE_AMOUNT_BY_STAGE || {})[st], col.amount);
  });
  eq("12.1 Σ มูลค่าต่อขั้น = OPEN_PIPELINE_AMOUNT", sum(Object.values(JP1c.OPEN_PIPELINE_AMOUNT_BY_STAGE || {})), JP1c.OPEN_PIPELINE_AMOUNT);
  eq("12.1 WON_LAST_7_DAYS JP1", `${JP1c.WON_LAST_7_DAYS} ${JP1c.WON_LAST_7_DAYS_AMOUNT}`, "8 285400");
  ["ST-0045", "ST-0046"].forEach((s) => {
    const sl = SJ2.slices.find((x) => x.staff === s), cs = (C.staff || {})[s] || {};
    eq(`12.1 ${s} OPEN_LEADS`, cs.OPEN_LEADS, sl.openLeads); eq(`12.1 ${s} OPEN_OPPORTUNITIES`, cs.OPEN_OPPORTUNITIES, sl.openOpportunities);
    eq(`12.1 ${s} OPEN_PIPELINE_AMOUNT`, cs.OPEN_PIPELINE_AMOUNT, sl.openPipelineAmount); eq(`12.1 ${s} BY_STAGE`, JSON.stringify(cs.OPEN_OPPORTUNITIES_BY_STAGE), JSON.stringify(sl.openByStage));
    eq(`12.1 ${s} WON_LAST_7_DAYS`, `${cs.WON_LAST_7_DAYS} ${cs.WON_LAST_7_DAYS_AMOUNT}`, `${sl.wonLast7Days} ${sl.wonLast7DaysAmount}`);
    eq(`12.1 ${s} TASKS_TODAY · TASKS_OVERDUE`, `${cs.TASKS_TODAY} ${cs.TASKS_OVERDUE}`, `${sl.tasksToday} ${sl.tasksOverdue}`);
  });
  eq("12.1 staff values", `${C.staff["ST-0045"].OPEN_LEADS} ${C.staff["ST-0045"].TASKS_TODAY} ${C.staff["ST-0046"].OPEN_OPPORTUNITIES} ${C.staff["ST-0046"].TASKS_OVERDUE}`, "30 8 28 3");
  eq("12.1 unassigned OPEN_LEADS JP1", ((C.unassigned || {}).JP1 || {}).OPEN_LEADS, 2);
  eq("12.1 TASKS_OVERDUE ทีม JP1-SALES", ((C.teams || {})["JP1-SALES"] || {}).TASKS_OVERDUE, K.teamJP1Sales.teamOverdueTasks);
}
eq("ข้อ 14.3 หน้าที่มีตัวเลือกช่วงเวลา", D.screens.filter((s) => s.periodPicker).map((s) => s.id).join(" "), "dashboard reports data-quality");
eq("ข้อ 14.3 meta.periodPickerScreens", D.meta.periodPickerScreens.join(" "), "dashboard reports data-quality");
eq("ข้อ 14.3 ค้นหาซ่อนสำหรับ", D.meta.searchHiddenRoles.join(" "), "MARKETING SYSTEM_ADMIN");
eq("ข้อ 9.2 Logout คงค่า", D.meta.logoutKeepKeys.join(" "), "device_id jcrm.login_id");
eq("ข้อ 14.4 ปุ่มรับลูกค้ามือถือ/FAB ใช้ mode=visit", `${D.mobileNav.find((x) => x.center).query} ${D.tabletFab.query}`, "?mode=visit ?mode=visit");
{
  const MRU = D.opportunityMoveRules || {};
  eq("ข้อ 4.4 v2.2 manual", (MRU.manual || []).map((r) => `${r.from}>${r.to}${r.requiresSentQuotation ? "(sent)" : ""}`).join(" "), "QUOTATION>FOLLOW_UP INTERESTED>QUOTATION(sent) INTERESTED>FOLLOW_UP(sent)");
  eq("ข้อ 4.4 v2.2 ห้ามย้อน", (MRU.neverManualTo || []).join(" "), "INTERESTED");
  eq("ข้อ 4.4 นิยามขั้น (มีใบ SENT)", D.opportunityStages.filter((s) => s.isOpen).map((s) => `${s.code}=${s.hasSentQuotationByDefinition}`).join(" "), "INTERESTED=false QUOTATION=true FOLLOW_UP=true");
}
section("10. ค่าที่ปรับใน CANONICAL v2.2 (สีกราฟ · ป้าย 4.8 · ทีม · 13.5 · 13.9 · 13.13 · 13.14 · KPI OPEN_* TASKS_* WON_LAST_7_DAYS)");

/* ---------------------------------------------------------------------------
   11. พฤติกรรมของ app.js ตาม v2.2
   ------------------------------------------------------------------------ */
if (J) {
  D.screens.forEach((s) => eq(`ข้อ 14.3 periodEnabled(${s.id})`, J.periodEnabled(s.id), ["dashboard", "reports", "data-quality"].includes(s.id)));
  [["ST-0011", false], ["ST-0003", false], ["ST-0051", false], ["ST-0001", true], ["ST-0002", true], ["ST-0010", true], ["ST-0020", true], ["ST-0030", true], ["ST-0045", true], ["ST-0050", true]]
    .forEach(([s, want]) => eq(`ข้อ 14.3 searchVisible ${s}`, J.searchVisible({ staffCode: s }), want));
  /* ข้อ 4.4: ตารางความจริงของการย้ายด้วยมือ */
  const STAGES = ["INTERESTED", "QUOTATION", "FOLLOW_UP", "WON", "LOST"];
  const allowed = (from, to, sent) => (from === "QUOTATION" && to === "FOLLOW_UP") || (from === "INTERESTED" && sent && (to === "QUOTATION" || to === "FOLLOW_UP"));
  STAGES.forEach((from) => [true, false].forEach((sent) => STAGES.forEach((to) => {
    const got = J.pipeline.checkMove(from, to, { hasSentQuotation: sent });
    eq(`ข้อ 4.4 ${from}→${to} sent=${sent}`, got.ok, allowed(from, to, sent));
    if (!got.ok && !got.reason) fail(`ข้อ 4.4 ${from}→${to} ต้องมีเหตุผล (toast)`);
  })));
  eq("ข้อ 4.4 allowedTargets(INTERESTED, ไม่ระบุ)", J.pipeline.allowedTargets("INTERESTED").join(" "), "");
  eq("ข้อ 4.4 allowedTargets(INTERESTED, true)", J.pipeline.allowedTargets("INTERESTED", true).join(" "), "QUOTATION FOLLOW_UP");
  eq("ข้อ 4.4 allowedTargets(QUOTATION)", J.pipeline.allowedTargets("QUOTATION").join(" "), "FOLLOW_UP");
  eq("ข้อ 4.4 allowedTargets(FOLLOW_UP)", J.pipeline.allowedTargets("FOLLOW_UP").join(" "), "");
  eq("ข้อ 4.4 เหตุผลย้อนเป็นสนใจ", J.pipeline.checkMove("FOLLOW_UP", "INTERESTED").reason, "ย้อนกลับไปขั้นสนใจไม่ได้");
  const kimCard = { stage: "QUOTATION", branch: "JP1", owner: "ST-0046" };
  eq("ข้อ 4.4 + 8.1 ขวัญย้ายการ์ดคิม", J.pipeline.canMoveCard(kimCard, "FOLLOW_UP", { staffCode: "ST-0045", aal: "aal1" }).ok, false);
  eq("ข้อ 4.4 + 8.1 นัทย้ายการ์ดคิม", J.pipeline.canMoveCard(kimCard, "FOLLOW_UP", { staffCode: "ST-0030", aal: "aal2" }).ok, true);
  eq("ข้อ 4.4 + 8.1 ปุ๊กย้ายการ์ด (อ่านอย่างเดียว)", J.pipeline.canMoveCard(kimCard, "FOLLOW_UP", { staffCode: "ST-0010", aal: "aal2" }).ok, false);
  /* access(): ซ่อน vs ปิดพร้อมเหตุผล (ข้อ 14.1) */
  const somchai = J.customerCtx("CUS-2026-000297");
  const a1 = J.access("customer.update", { customer: somchai }, { staffCode: "ST-0046", aal: "aal1" });
  eq("ข้อ 14.1 คิมแก้คุณสมชาย", `${a1.visible} ${a1.allowed} ${a1.reason}`, "true false " + D.meta.texts.reasonOwn);
  const a2 = J.access("customer.update", { customer: somchai }, { staffCode: "ST-0010", aal: "aal2" });
  eq("ข้อ 14.1 ปุ๊กแก้ลูกค้า (ไม่มีสิทธิ์เลย → ซ่อน)", `${a2.visible} ${a2.allowed}`, "false false");
  const a3 = J.access("customer.pii.reveal", { customer: somchai }, { staffCode: "ST-0001", aal: "aal1" });
  eq("ข้อ 14.1 จ๋าอั๋น aal1 เปิดเบอร์", `${a3.visible} ${a3.allowed} ${a3.reason}`, "true false " + D.meta.texts.reasonMfa);
  eq("ข้อ 8.0 v2.2 นัทมอบ lead ไม่มี owner", J.can("lead.assign", { branch: "JP1", owner: null }, { staffCode: "ST-0030", aal: "aal2" }), true);
  /* ตัวเลือกข้อมูลตาม persona */
  const S = J.select;
  eq("select.recentCustomersFor ขวัญ", S.recentCustomersFor("ST-0045").rows.map((r) => r.customerNo).join(" "), "CUS-2026-000297 CUS-2026-006310 CUS-2026-005412 CUS-2026-006840 CUS-2026-005980");
  eq("select.recentActivityFor เจ (JP1)", S.recentActivityFor({ staffCode: "ST-0020", aal: "aal2" }).rows.map((r) => r.customerNo).join(" "), "CUS-2026-000297 CUS-2026-006790");
  eq("select.recentActivityFor จ๋าอั๋น", S.recentActivityFor({ staffCode: "ST-0001", aal: "aal2" }).rows.length, 5);
  eq("select.recentActivityFor มายด์", S.recentActivityFor({ staffCode: "ST-0011", aal: "aal2" }), null);
  const tc = (s, aal) => { const t = S.tasksFor({ staffCode: s, aal }); return t && t.counts ? `${t.counts.total}/${t.counts.today}/${t.counts.overdue}` : String(t && t.counts); };
  eq("select.tasksFor ขวัญ", tc("ST-0045", "aal1"), "12/8/4"); eq("select.tasksFor คิม", tc("ST-0046", "aal1"), "9/6/3");
  eq("select.tasksFor นัท (ทีม)", tc("ST-0030", "aal2"), "21/14/7"); eq("select.tasksFor ฝน", tc("ST-0050", "aal1"), "0/0/0");
  eq("select.tasksFor มายด์ (ไม่มี task.read)", S.tasksFor({ staffCode: "ST-0011", aal: "aal2" }), null);
  const cardsText = (s, aal, opts) => S.dashboardFor({ staffCode: s, aal }, opts).cards.map((c) => `${c.display}${c.delta ? ` (${c.delta})` : ""}`).join(" · ");
  eq("select.dashboardFor คิม", cardsText("ST-0046", "aal1"), "6 · 3 · 26 · 28 (฿595,500) · 38 · ฿576,600");
  eq("select.dashboardFor ฝน (13.13)", cardsText("ST-0050", "aal1"), "0 · 0 · 0 · 0 (฿0) · 0 · ฿0");
  eq("select.dashboardFor บอส (JP2)", cardsText("ST-0021", "aal2"), "4 (0%) · 356 (+12%) · 241 (+8%) · 98 (+14%) · 61 (+17%) · 25.3% (+2.0 pp)");
  eq("select.dashboardFor จ๋าอั๋น เลือก JP3", cardsText("ST-0001", "aal2", { branch: "JP3" }), "3 (+50%) · 280 (+12%) · 187 (+8%) · 86 (+13%) · 45 (+18%) · 24.1% (+2.1 pp)");
  eq("select.dashboardFor มายด์ ไม่มีกิจกรรมล่าสุด", S.dashboardFor({ staffCode: "ST-0011", aal: "aal2" }).widgets.some((w) => w.type === "recentActivity"), false);
  eq("select.dashboardFor แพร มีแถวคุณภาพข้อมูล", S.dashboardFor({ staffCode: "ST-0002", aal: "aal2" }).widgets.some((w) => w.type === "dataQualityRow"), true);
  const fk = S.kpisFor({ staffCode: "ST-0050", aal: "aal1" });
  eq("select.kpisFor ฝน", `${fk.values.LEADS} ${fk.values.UNIQUE_CUSTOMERS} ${fk.rates.CONV_LEAD_TO_SALE} ${fk.values.SALES_AMOUNT}`, "0 null null 0");
  const nk = S.kpisFor({ staffCode: "ST-0030", aal: "aal2" });
  eq("select.kpisFor นัท (ทีม)", `${nk.values.LEADS} ${nk.values.UNIQUE_CUSTOMERS} ${nk.rates.CONV_LEAD_TO_SALE.display} ${nk.values.TASKS_OVERDUE}`, "296 null 27.7% 7");
  eq("select.customersFor ขวัญ", (() => { const r = S.customersFor({ staffCode: "ST-0045", aal: "aal1" }); return `${r.rows.map((c) => c.customerNo).join(",")} ${r.total}`; })(), "CUS-2026-000297,CUS-2026-006790 412");
  eq("select.customersFor บอส วันนี้", (() => { const r = S.customersFor({ staffCode: "ST-0021", aal: "aal2" }, { preset: "TODAY" }); return `${r.rows.map((c) => c.customerNo).join(",")} ${r.total}`; })(), "CUS-2026-006851 4");
  eq("select.pipelineFor ขวัญ JP1 หัวคอลัมน์", S.pipelineFor({ staffCode: "ST-0045", aal: "aal1" }).columns.map((c) => `${c.count}/${c.amount}`).join(" "), "32/426800 18/512300 12/388000 8/285400");
  eq("select.pipelineFor กรองคุณขวัญ", S.pipelineFor({ staffCode: "ST-0020", aal: "aal2" }, { owner: "ST-0045" }).columns.map((c) => `${c.count}/${c.amount}:${c.cards.length}`).join(" "), "17/null:1 10/null:1 7/null:1 4/145500:1");
  eq("select.queueFor ปุ๊ก JP1", (() => { const q = S.queueFor({ staffCode: "ST-0010", aal: "aal2" }); return `${q.branch} ${q.rows.length} ${q.chips.walkIn}·${q.chips.onlinePhone}·${q.chips.visits}·${q.chips.openVisits} ${q.readOnly}`; })(), "JP1 4 4·3·7·4 true");
  eq("select.exportsFor แพร รออนุมัติ", S.exportsFor({ staffCode: "ST-0002", aal: "aal2" }).pending.map((x) => x.exportNo).join(" "), "EX-2026-000031");
  eq("select.exportsFor จ๋าอั๋น รออนุมัติ", S.exportsFor({ staffCode: "ST-0001", aal: "aal2" }).pending.length, 0);
  eq("select.staffListFor นัท", S.staffListFor({ staffCode: "ST-0030", aal: "aal2" }).map((s) => s.staffCode).join(" "), "ST-0030 ST-0045 ST-0046");
  eq("select.notificationsFor คิม ปลายทาง", S.notificationsFor({ staffCode: "ST-0046", aal: "aal1" })[0].href, "11-leads.html?lead=LD-2026-007512");
  eq("alias JCRM.data.tasksFor", typeof D.tasksFor, "function");
  eq("alias ไม่ทับข้อมูล taskGroups", Array.isArray(D.taskGroups), true);
  /* component ที่ไม่ต้องใช้ DOM */
  eq("ui.initials ลูกค้า", J.ui.initials("สมชาย ใจดี"), "สจ"); eq("ui.initials พนักงาน", J.ui.initials("คุณขวัญ"), "ข"); eq("ui.initials ข้ามสระหน้า", J.ui.initials("เอกชัย ใจงาม"), "อจ");
  eq("fmt.showing", J.fmt.showing(5, 1284), "แสดง 1–5 จาก 1,284"); eq("fmt.showing ไม่รู้ยอด", J.fmt.showing(2, null, { unit: "รายการ" }), "แสดง 1–2 จาก – รายการ");
  eq("fmt.money สตางค์ (ข้อ 1.3 v2.2)", J.fmt.money(28900.5), "฿28,900.50"); eq("funnel ขั้นแรก 100.0%", J.fmt.pct(3125, 3125), "100.0%");
  eq("fmt.time เวลาเดี่ยวมี น.", J.fmt.time("2026-09-11T10:24:00+07:00"), "10:24 น."); eq("fmt.dateTime ในตารางไม่มี น.", J.fmt.dateTime("2026-09-11T10:24:00+07:00"), "11 ก.ย. 2569 10:24");
  eq("fmt.minutesBetween คิว 002", J.fmt.minutesBetween("2026-09-11T10:12:00+07:00", D.meta.now), 12);
  eq("fmt.rangeInclusive P", J.fmt.rangeInclusive("2026-08-13", "2026-09-12"), "13 ส.ค. – 11 ก.ย. 2569");
  const donut = J.chart.donut(null, { title: "แหล่งที่มาลูกค้า", segments: J.chart.sourceSegments(K.sources.total), centerValue: 1284 });
  eq("chart.donut legend (WEBSITE = 0 ไม่แสดง)", (donut.match(/data-jcrm-legend=/g) || []).length, 6);
  eq("chart.donut เส้นคั่น 2px", (donut.match(/stroke="var\(--chart-separator\)" stroke-width="2"/g) || []).length, 6);
  if (!/ดูเป็นตาราง/.test(donut)) fail("chart.donut ต้องมีปุ่ม \"ดูเป็นตาราง\" (ข้อ 15 v2.2)");
  const funnel = J.chart.funnel(null, { title: "Funnel", stages: J.chart.funnelStages("ALL") });
  if (!/100\.0%/.test(funnel)) fail("chart.funnel ขั้นแรกต้องแสดง 100.0%");
  if (!/stroke="var\(--chart-separator\)" stroke-width="2"/.test(funnel)) fail("chart.funnel ต้องมีเส้นคั่น 2px");
  eq("chart.lostReasonItems JP1", J.chart.lostReasonItems("JP1").map((i) => i.display).join(" | "), "27 · 28.1% | 17 · 17.7% | 15 · 15.6% | 12 · 12.5% | 10 · 10.4% | 15 · 15.6%");
  const tbl = J.ui.table({ columns: [{ key: "a", label: "ยอดขาย (บาท)", format: "moneyTable" }], rows: [{ a: 1245000 }, { a: null }], footer: { shown: 2, total: 412 } });
  if (!/1,245,000/.test(tbl) || !/แสดง 1–2 จาก 412/.test(tbl) || !/is-null/.test(tbl)) fail("ui.table ต้องจัดรูปเงินในตาราง · ท้ายตาราง \"แสดง 1–N จาก M\" · null แสดง –");
  const pb = J.ui.permButton({ label: "แก้ไข", permission: "customer.update", ctx: { customer: somchai }, as: { staffCode: "ST-0046", aal: "aal1" } });
  if (!/aria-disabled="true"/.test(pb)) fail("ui.permButton ต้องปิดพร้อมเหตุผลเมื่อมีสิทธิ์แต่แถวไม่ผ่านขอบเขต");
  eq("ui.permButton ซ่อนเมื่อไม่มีสิทธิ์", J.ui.permButton({ label: "แก้ไข", permission: "customer.update", as: { staffCode: "ST-0010", aal: "aal2" } }), "");
  if (!/<form|<div class="state/.test(J.ui.state("empty", { title: "ยังไม่มีลูกค้า" }))) fail("ui.state ต้องคืน markup");
  if (!/ห้ามบันทึกเลขบัตรประชาชน/.test(J.ui.piiWarn())) fail("ui.piiWarn ต้องมีข้อความข้อ 6.9");
  eq("form.containsThaiId", `${J.form.containsThaiId("1101700207366")} ${J.form.containsThaiId("1101700207365")} ${J.form.containsThaiId("โทร 0812345678")}`, "true false false");
  const errs = J.form.validate([{ name: "reason", label: "เหตุผลที่ไม่สำเร็จ", type: "select", required: true, requiredMessage: "เลือกเหตุผลที่ไม่สำเร็จ" }, { name: "note", label: "หมายเหตุ", type: "textarea", requiredWhen: { field: "reason", equals: "OTHER" } }], { reason: "OTHER", note: "" });
  eq("form.validate เหตุผล OTHER บังคับหมายเหตุ", Object.keys(errs).join(" "), "note");
  eq("link/param ชื่อตาม sitemap", J.link("customer-360", { c: "CUS-2026-000297" }), "05-customer-360.html?c=CUS-2026-000297");
}
section("11. app.js ตาม v2.2: ช่วงเวลา 02/09/12 · ค้นหาซ่อน MK/SA · กติกาย้ายขั้น 4.4 · access · select.* · component");

/* ---------------------------------------------------------------------------
   สรุป
   ------------------------------------------------------------------------ */
console.log("ตรวจ prototype กับ CANONICAL " + (D.meta && D.meta.canonicalVersion) + (ALLOW_MISSING ? " (--allow-missing)" : ""));
passes.forEach((m) => console.log((m.startsWith("(ไม่ผ่าน)") ? "  ไม่ผ่าน  " + m.slice(10) : "  ผ่าน    " + m)));
notes.forEach((m) => console.log("  หมายเหตุ " + m));
if (fails.length) {
  console.error(`\nไม่ผ่าน ${fails.length} ข้อ:`);
  fails.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log("\nผ่านทั้งหมด");
