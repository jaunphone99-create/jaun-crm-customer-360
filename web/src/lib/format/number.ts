/* ตัวจัดรูปแบบตัวเลข — ย้ายมาจาก prototype/assets/app.js (JCRM.fmt) แบบตรงทุกตัวอักษร
   เหตุผลที่ต้องเหมือนเป๊ะ: prototype คือหน้าตาที่เจ้าของโครงการอนุมัติแล้ว และ
   tools/check-prototype.mjs ได้ตรวจ JCRM.fmt กับ CANONICAL ข้อ 1.3 ไปแล้ว
   ถ้าเขียนใหม่ตามใจ ตัวเลขบนหน้าจอจริงจะเพี้ยนจากที่อนุมัติโดยไม่มีใครรู้
   web/scripts/check-format.mjs ตรวจความเท่ากันของสองฝั่งนี้ทุกครั้งที่รัน

   ทำไมไม่ใช้ Intl.NumberFormat / toFixed:
   CANONICAL ข้อ 1.3 บังคับปัดแบบ half away from zero ให้ตรงกับ round(x::numeric, n)
   ของ PostgreSQL (ฐานข้อมูลเป็นคนคำนวณ KPI) ส่วน toFixed/Math.round ปัดบน float
   ซึ่งให้ผลต่างในกรณีอย่าง 2.675 → ต้องได้ "2.68" แต่ float ให้ "2.67"
   ทุกฟังก์ชันในไฟล์นี้จึงแปลงเป็นจำนวนเต็มก่อนแล้วค่อยปัด

   ไฟล์นี้ตั้งใจไม่ import ไฟล์อื่น เพื่อให้ check-format.mjs โหลดตรงด้วย
   type stripping ของ Node ได้ (Node ไม่ resolve import แบบไม่มีนามสกุล) */

/** ค่าที่รับเป็นตัวเลขได้ — string ด้วย เพราะ numeric ของ Postgres มาเป็น string ผ่าน PostgREST */
export type Num = number | string | null | undefined;

/** − เครื่องหมายลบ U+2212 (CANONICAL ข้อ 1.3) — ไม่ใช่ยัติภังค์ */
export const MINUS = "−";
/** – ค่าว่าง/ไม่มีข้อมูล U+2013 */
export const DASH = "–";

/** เป้าหมาย KPI สำหรับเทียบผ่าน/ไม่ผ่าน — ค่า op/pct ต้องมาจากฐานข้อมูลหรือ CANONICAL ข้อ 12.3 ห้ามคิดเอง */
export type KpiTarget = { op: ">=" | "<"; pct: number };

/** ว่างสำหรับการแสดงผล: null · undefined · "" · NaN/Infinity (0 ไม่ใช่ค่าว่าง) */
export function isNil(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
}

/* แปลงเลขทศนิยม (number หรือ string) เป็นจำนวนเต็มคูณ 10^scale ด้วยการตัดสตริง
   แล้วปัด half away from zero จากหลักถัดไป — ตรงกับ round(x::numeric, n) ของ PostgreSQL */
function toScaled(x: number | string, scale: number): number {
  let s = typeof x === "number" ? String(x) : String(x).trim();
  if (/e/i.test(s)) { s = Number(s).toFixed(scale + 2); }
  const neg = s.charAt(0) === "-";
  if (neg || s.charAt(0) === "+") { s = s.slice(1); }
  const parts = s.split(".");
  const intPart = parts[0] || "0";
  const frac = (parts[1] || "") + "000000000000";
  const digits = intPart + frac.slice(0, scale);
  let n = parseInt(digits, 10) || 0;
  if (frac.charAt(scale) >= "5") { n += 1; }
  return neg && n !== 0 ? -n : n;
}

function pow10(n: number): number { let p = 1; while (n-- > 0) { p *= 10; } return p; }

/* หารจำนวนเต็มบวก a/b แล้วปัด half away from zero (ใช้เศษ ไม่ใช้ float) */
function divRound(a: number, b: number): number {
  let q = Math.floor(a / b);
  while (q * b > a) { q -= 1; }
  while ((q + 1) * b <= a) { q += 1; }
  const r = a - q * b;
  return (2 * r >= b) ? q + 1 : q;
}

function group3(intStr: string): string { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

function scaledToText(absScaled: number, d: number, grouping: boolean): string {
  const p = pow10(d);
  const ip = Math.floor(absScaled / p);
  const fp = absScaled - ip * p;
  let t = grouping ? group3(String(ip)) : String(ip);
  if (d > 0) { t += "." + String(fp + p).slice(1); }
  return t;
}

function signed(text: string, isNeg: boolean, isPos: boolean, withPlus: boolean): string {
  return (isNeg ? MINUS : (isPos && withPlus ? "+" : "")) + text;
}

/** ปัดเป็นข้อความ d ตำแหน่ง: round(2.675, 2) → "2.68" (ไม่คั่นหลักพัน) */
export function round(x: Num, d = 0): string {
  if (isNil(x)) { return DASH; }
  const v = toScaled(x as number | string, d);
  return signed(scaledToText(Math.abs(v), d, false), v < 0, false, false);
}

/** จำนวนคั่นหลักพัน "3,125" · ค่าลบใช้ − (ข้อ 1.3) */
export function int(n: Num): string {
  if (isNil(n)) { return DASH; }
  const v = toScaled(n as number | string, 0);
  return signed(group3(String(Math.abs(v))), v < 0, false, false);
}

/** เงินบนการ์ด/ข้อความ "฿3,332,700" · มีสตางค์จึงแสดง 2 ตำแหน่ง "฿28,900.50" (ข้อ 1.3) */
export function money(n: Num): string {
  if (isNil(n)) { return DASH; }
  return (toScaled(n as number | string, 2) < 0 ? MINUS : "") + "฿" + moneyTable(n).replace(MINUS, "");
}

/** เงินในช่องตาราง "1,245,000" — ไม่มี ฿ เพราะหัวคอลัมน์ต้องมี "(บาท)" อยู่แล้ว (ข้อ 1.3) */
export function moneyTable(n: Num): string {
  if (isNil(n)) { return DASH; }
  const v = toScaled(n as number | string, 2), a = Math.abs(v);
  const hasSatang = a % 100 !== 0;
  return signed(hasSatang ? scaledToText(a, 2, true) : group3(String(a / 100)), v < 0, false, false);
}

/** อัตรา num/den → "24.1%" · ทศนิยม 1 ตำแหน่งเสมอ รวม "100.0%" · ตัวหาร 0/ว่าง → "–" */
export function pct(num: Num, den: Num, digits = 1): string {
  const d = digits;
  if (isNil(num) || isNil(den) || Number(den) === 0) { return DASH; }
  const a = toScaled(num as number | string, 2), b = toScaled(den as number | string, 2);
  const neg = (a < 0) !== (b < 0) && a !== 0;
  const q = divRound(Math.abs(a) * pow10(d + 2), Math.abs(b));
  return signed(scaledToText(q, d, true), neg && q !== 0, false, false) + "%";
}

/** ค่าร้อยละที่คำนวณมาแล้ว เช่น 95.4 → "95.4%" */
export function pctValue(x: Num, digits = 1): string {
  const d = digits;
  if (isNil(x)) { return DASH; }
  const v = toScaled(x as number | string, d);
  return signed(scaledToText(Math.abs(v), d, true), v < 0, false, false) + "%";
}

/** อัตราที่ api.get_kpis ส่งมาเป็น {num, den, display} — ใช้ display ของฐานข้อมูลก่อนเสมอ
    เพราะฐานข้อมูลเป็นเจ้าของตัวเลข (ห้าม frontend คำนวณ KPI เอง) · null → "–" */
export type RatioValue = { num?: Num; den?: Num; display?: string | null };
export function ratio(r: RatioValue | null | undefined): string {
  if (!r) { return DASH; }
  if (r.display) { return r.display; }
  return pct(r.num, r.den);
}

export type DeltaDir = "up" | "down" | "flat" | "none";
export type DeltaInfo = { text: string; dir: DeltaDir };

/** ส่วนต่างของจำนวนเป็น % จำนวนเต็ม → "+12%" · "−5%" · "0%" · ช่วงก่อนหน้า 0/ว่าง → "–" (ข้อ 1.3) */
export function growth(current: Num, previous: Num): string {
  return growthInfo(current, previous).text;
}

/** เหมือน growth แต่คืนทิศทางมาด้วย เพื่อให้ป้ายเปลี่ยนแปลงเลือกสี/ไอคอนได้โดยไม่ต้องอ่านข้อความ */
export function growthInfo(current: Num, previous: Num): DeltaInfo {
  if (isNil(current) || isNil(previous) || Number(previous) === 0) { return { text: DASH, dir: "none" }; }
  const c = toScaled(current as number | string, 2), p = toScaled(previous as number | string, 2);
  const diff = c - p;
  const q = divRound(Math.abs(diff) * 100, Math.abs(p));
  const neg = (diff < 0) !== (p < 0);
  if (q === 0) { return { text: "0%", dir: "flat" }; }
  return { text: signed(String(q), neg, !neg, true) + "%", dir: neg ? "down" : "up" };
}

/** ส่วนต่างของอัตราเป็น pp → "+2.1 pp" — คำนวณจากอัตราที่ยังไม่ปัดทั้งสองช่วงแล้วค่อยปัด (ข้อ 1.3) */
export function pp(n1: Num, d1: Num, n0: Num, d0: Num): string {
  return ppInfo(n1, d1, n0, d0).text;
}

export function ppInfo(n1: Num, d1: Num, n0: Num, d0: Num): DeltaInfo {
  if ([n1, d1, n0, d0].some(isNil) || Number(d1) === 0 || Number(d0) === 0) { return { text: DASH, dir: "none" }; }
  const A = toScaled(n1 as number | string, 2), B = toScaled(d1 as number | string, 2);
  const C = toScaled(n0 as number | string, 2), E = toScaled(d0 as number | string, 2);
  let numer = A * E - C * B, denom = B * E;
  if (denom < 0) { numer = -numer; denom = -denom; }
  const q = divRound(Math.abs(numer) * 1000, denom);
  if (q === 0) { return { text: "0.0 pp", dir: "flat" }; }
  const neg = numer < 0;
  return { text: signed(scaledToText(q, 1, false), neg, !neg, true) + " pp", dir: neg ? "down" : "up" };
}

/** ข้อความป้ายเปลี่ยนแปลงที่ฐานข้อมูลส่งมาแล้ว ("+12%") → ทิศทาง up/down/flat/none */
export function deltaDir(text: string | null | undefined): DeltaDir {
  if (isNil(text) || text === DASH) { return "none"; }
  const t = String(text).trim();
  if (t.charAt(0) === "+") { return "up"; }
  if (t.charAt(0) === MINUS || t.charAt(0) === "-") { return "down"; }
  return "flat";
}

/** เทียบเป้าหมายด้วยค่าที่ยังไม่ปัด (ข้อ 1.3) — 94.96% แสดง "95.0%" แต่ไม่ผ่านเป้า ≥ 95%
    ถ้าปัดก่อนเทียบ หน้าจอจะขึ้นว่าผ่านทั้งที่ยังไม่ถึงเป้า
    target ต้องส่งเข้ามา (มาจาก api.get_kpis / CANONICAL ข้อ 12.3) — ไฟล์นี้ไม่รู้จักเป้าหมายของ KPI ใด
    คืน null เมื่อเทียบไม่ได้ ให้ผู้เรียกเลือกที่จะไม่แสดงป้ายผ่าน/ไม่ผ่าน */
export function meetsTarget(num: Num, den: Num, target: KpiTarget | null | undefined): boolean | null {
  if (!target || isNil(num) || isNil(den) || Number(den) === 0) { return null; }
  const a = toScaled(num as number | string, 2) * 10000;
  const b = toScaled(target.pct, 2) * toScaled(den as number | string, 2);
  return target.op === ">=" ? a >= b : a < b;
}

/** "45 นาที" (ใช้กับ "รอ {n} นาที" ในหน้ารับลูกค้า) */
export function minutes(n: Num): string {
  return isNil(n) ? DASH : int(n) + " นาที";
}

/** ค่าใดก็ได้ → ข้อความ หรือ "–" เมื่อว่าง — ใช้กับช่องข้อความที่อาจเป็น null */
export function dash(v: unknown): string {
  return isNil(v) ? DASH : String(v);
}

/** "แสดง 1–20 จาก 1,008 รายการ" (ข้อ 13.0) · ยอดรวมที่ยังไม่รู้ → "–" */
export function showing(shown: number, total: Num, opts?: { unit?: string; from?: number }): string {
  const unit = opts && opts.unit ? " " + opts.unit : "";
  const from = opts && opts.from ? opts.from : 1;
  const t = isNil(total) ? DASH : int(total);
  if (!shown) { return "แสดง 0 จาก " + t + unit; }
  return "แสดง " + int(from) + DASH + int(from + shown - 1) + " จาก " + t + unit;
}
