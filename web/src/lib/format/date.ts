/* ตัวจัดรูปแบบวันที่/เวลา — ย้ายมาจาก prototype/assets/app.js (JCRM.fmt) แบบตรงทุกตัวอักษร
   เหตุผลเดียวกับ number.ts: prototype คือหน้าตาที่อนุมัติแล้ว และ web/scripts/check-format.mjs
   ตรวจว่าสองฝั่งให้ผลเท่ากัน

   ทำไมไม่ใช้ Intl.DateTimeFormat หรือ Date ของเครื่อง:
   CANONICAL ข้อ 1.2 ตรึงขอบวันธุรกิจไว้ที่ Asia/Bangkok และห้ามพึ่ง timezone ของ session
   ถ้าอ่านผ่าน Date ในเครื่อง เซิร์ฟเวอร์ที่รันด้วย UTC จะตัดวันผิดไป 7 ชั่วโมง ทำให้
   "วันนี้" ของหน้าจอไม่ตรงกับ "วันนี้" ของ KPI ที่ฐานข้อมูลคำนวณ
   ไฟล์นี้จึงแยกสตริง ISO เองแล้วเลื่อนไปที่ +07:00 ด้วยเลขจำนวนเต็ม

   นาฬิกา "ตอนนี้" ไม่ได้อยู่ในไฟล์นี้: เวลาอ้างอิงของรายงานคือ app.clock() ของฐานข้อมูล
   (ข้อ 1.2) ฟังก์ชันที่ต้องรู้เวลาปัจจุบัน เช่น asOf จึงบังคับให้ส่ง ISO เข้ามา

   ไฟล์นี้ตั้งใจไม่ import ไฟล์อื่น เพื่อให้ check-format.mjs โหลดตรงด้วย
   type stripping ของ Node ได้ (Node ไม่ resolve import แบบไม่มีนามสกุล) */

/** ค่า ISO ที่รับได้ — timestamptz จาก PostgREST มาเป็น string เสมอ */
export type IsoLike = string | null | undefined;

/** – ค่าว่าง/ไม่มีข้อมูล U+2013 (ต้องตรงกับ DASH ใน number.ts) */
export const DASH = "–";

/** ชื่อเดือนย่อไทย (ข้อ 1.2: "11 ก.ย. 2569") */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

type Parts = { y: number; mo: number; d: number; h: number | null; mi: number | null; s: number };

function isNil(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
}

function pad2(n: number): string { return (n < 10 ? "0" : "") + n; }

function thMonth(mo: number): string { return TH_MONTHS[mo - 1] ?? ""; }

/* แยก ISO เป็นส่วนประกอบตามเวลา Asia/Bangkok โดยไม่พึ่ง timezone ของเครื่อง
   ช่วงของเดือน/วันถูกบังคับใน regex เพื่อให้ค่าที่เพี้ยนกลายเป็น "–" แทนที่จะพิมพ์เดือนว่าง */
function parseIso(iso: IsoLike): Parts | null {
  if (isNil(iso)) { return null; }
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(String(iso));
  if (!m) { return null; }
  let p: Parts = { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: m[4] ? +m[4] : null, mi: m[5] ? +m[5] : null, s: m[6] ? +m[6] : 0 };
  const zone = m[7];
  if (zone && p.h !== null) {
    let off = 0;
    if (zone !== "Z") {
      const sg = zone.charAt(0) === "-" ? -1 : 1;
      const hh = +zone.slice(1, 3);
      const mm = +zone.slice(-2);
      off = sg * (hh * 60 + mm);
    }
    /* +07:00 อยู่แล้วก็ไม่ต้องแปลง — แปลงเฉพาะเมื่อ offset ต่างจาก 420 นาที */
    if (off !== 420) {
      const t = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi ?? 0, p.s) - off * 60000 + 420 * 60000;
      const dt = new Date(t);
      p = { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds() };
    }
  }
  return p;
}

function epochMinutes(p: Parts): number {
  return Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h ?? 0, p.mi ?? 0, 0) / 60000);
}

/** "11 ก.ย. 2569" — พ.ศ. แบบย่อ (ข้อ 1.2) */
export function date(iso: IsoLike): string {
  const p = parseIso(iso);
  return p ? p.d + " " + thMonth(p.mo) + " " + (p.y + 543) : DASH;
}

/** "11 ก.ย." — ใช้ในที่แคบอย่างการ์ด pipeline ที่ปีเดาได้จากบริบท */
export function dayMonth(iso: IsoLike): string {
  const p = parseIso(iso);
  return p ? p.d + " " + thMonth(p.mo) : DASH;
}

/** "10:24 น." · opts.suffix === false → "10:24" — เวลาเดี่ยวมี "น." (ข้อ 19.5 ข้อ 4) */
export function time(iso: IsoLike, opts?: { suffix?: boolean }): string {
  const p = parseIso(iso);
  if (!p || p.h === null) { return DASH; }
  return pad2(p.h) + ":" + pad2(p.mi ?? 0) + (opts && opts.suffix === false ? "" : " น.");
}

/** "11 ก.ย. 2569 10:24" — วันเวลาในตาราง/รายการไม่มี "น." (ข้อ 19.5 ข้อ 4)
    opts.suffix === true → "11 ก.ย. 2569 10:24 น." สำหรับข้อความเดี่ยวอย่าง "ณ …" */
export function dateTime(iso: IsoLike, opts?: { suffix?: boolean }): string {
  const p = parseIso(iso);
  if (!p) { return DASH; }
  if (p.h === null) { return date(iso); }
  return date(iso) + " " + time(iso, { suffix: !!(opts && opts.suffix) });
}

/** key วันที่ "YYYY-MM-DD" ตาม Asia/Bangkok — ใช้จัดกลุ่ม/เทียบ "วันนี้" กับนาฬิกาของฐานข้อมูล */
export function dayKey(iso: IsoLike): string | null {
  const p = parseIso(iso);
  return p ? p.y + "-" + pad2(p.mo) + "-" + pad2(p.d) : null;
}

/** นาทีนับจากเที่ยงคืน Asia/Bangkok · ค่าที่ไม่มีเวลา → null */
export function minutesOfDay(iso: IsoLike): number | null {
  const p = parseIso(iso);
  return p && p.h !== null ? p.h * 60 + (p.mi ?? 0) : null;
}

/** เทียบเวลาสองค่า → −1 · 0 · 1 · ค่าที่อ่านไม่ได้ถูกจัดไว้ท้ายสุด */
export function compareIso(a: IsoLike, b: IsoLike): -1 | 0 | 1 {
  const ka = dayKey(a), kb = dayKey(b);
  if (ka === null || kb === null) { return ka === kb ? 0 : (ka === null ? 1 : -1); }
  if (ka !== kb) { return ka < kb ? -1 : 1; }
  const ma = minutesOfDay(a) ?? 0, mb = minutesOfDay(b) ?? 0;
  return ma === mb ? 0 : (ma < mb ? -1 : 1);
}

/** นาทีเต็มจาก a ถึง b (ใช้กับ "รอ {n} นาที") · อ่านไม่ได้ → null */
export function minutesBetween(a: IsoLike, b: IsoLike): number | null {
  const pa = parseIso(a), pb = parseIso(b);
  if (!pa || !pb) { return null; }
  return epochMinutes(pb) - epochMinutes(pa);
}

/** บวกวันให้ key "YYYY-MM-DD" ด้วยจำนวนเต็ม — ไม่แตะเวลา จึงข้ามปัญหา DST/offset ไปทั้งหมด */
export function addDays(key: IsoLike, n: number): string | null {
  const p = parseIso(key);
  if (!p) { return null; }
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d) + n * 86400000);
  return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
}

/** ช่วงวันที่แบบรวมวันสุดท้าย "13 ส.ค. – 11 ก.ย. 2569"
    รับขอบบนแบบ exclusive เพราะช่วงเวลาทั้งระบบใช้ [start, endExclusive) (ข้อ 1.2)
    แต่ผู้ใช้อ่านเป็นวันสุดท้ายที่รวมอยู่ จึงลบหนึ่งวันก่อนแสดง */
export function rangeInclusive(startKey: IsoLike, endExclusiveKey: IsoLike): string {
  const s = parseIso(startKey), e = parseIso(addDays(endExclusiveKey, -1));
  if (!s || !e) { return DASH; }
  const left = s.d + " " + thMonth(s.mo) + (s.y !== e.y ? " " + (s.y + 543) : "");
  return left + " " + DASH + " " + e.d + " " + thMonth(e.mo) + " " + (e.y + 543);
}

/** "ณ 11 ก.ย. 2569 10:24 น." — ต้องส่งเวลาอ้างอิงจากฐานข้อมูล (app.clock()) เข้ามาเสมอ
    ห้ามให้ frontend หยิบ new Date() มาเอง เพราะเครื่องผู้ใช้กับนาฬิกาของรายงานอาจคนละค่า */
export function asOf(iso: IsoLike): string {
  return "ณ " + dateTime(iso, { suffix: true });
}
