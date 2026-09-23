import { addDays, asOf, date, dayKey, minutesOfDay, rangeInclusive, time } from "@/lib/format/date";

import { PRESET_LABEL } from "./labels";
import type { KpiResult, Preset } from "./types";

/* ข้อความบอก "ตัวเลขชุดนี้คือช่วงไหน เทียบกับอะไร ณ เวลาใด"

   ทุกค่าในไฟล์นี้มาจาก api.get_kpis (period.start/end/cmp_start/cmp_end และ clock)
   ไม่มีการคิดวันที่เองแม้แต่ค่าเดียว — เพราะขอบวันธุรกิจเป็นของฐานข้อมูล (CANONICAL ข้อ 1.2)
   ถ้าหน้าจอคำนวณ "30 วันล่าสุด" เอง เครื่องที่ตั้งเวลาเพี้ยนจะอ้างช่วงผิดจากตัวเลขที่แสดงอยู่จริง */

/** ขอบบนของช่วงตกที่เที่ยงคืนพอดีหรือไม่ — preset อย่าง TODAY ตัดที่ app.clock() จึงไม่ใช่ (ข้อ 12.0) */
function endsAtMidnight(iso: string): boolean {
  return minutesOfDay(iso) === 0;
}

/** "13 ส.ค. – 11 ก.ย. 2569" หรือ "4 ก.ย. 2569 00:00 ถึง 10:24 น." เมื่อขอบบนไม่ใช่เที่ยงคืน */
function spanText(start: string, end: string): string {
  if (!endsAtMidnight(end)) return `${date(start)} ${time(start, { suffix: false })} ถึง ${time(end)}`;
  /* ช่วงวันเดียว (TODAY · YESTERDAY) เขียนเป็นวันเดียว — "11 ก.ย. – 11 ก.ย. 2569" อ่านแล้วสะดุด */
  if (dayKey(start) === dayKey(addDays(end, -1))) return date(start);
  return rangeInclusive(start, end);
}

/** "30 วันล่าสุด · 13 ส.ค. – 11 ก.ย. 2569" */
export function periodText(result: KpiResult): string {
  const label = PRESET_LABEL[result.preset as Preset] ?? result.preset;
  return `${label} · ${spanText(result.period.start, result.period.end)}`;
}

/** "เทียบ 14 ก.ค. – 12 ส.ค. 2569" — ข้อความเดียวกับที่ป้ายเปลี่ยนแปลงหมายถึง */
export function compareText(result: KpiResult): string {
  return `เทียบ ${spanText(result.period.cmp_start, result.period.cmp_end)}`;
}

/** "ณ 11 ก.ย. 2569 10:24 น." — เวลาของฐานข้อมูล ไม่ใช่ของเครื่องผู้ใช้ */
export function clockText(result: KpiResult): string {
  return asOf(result.clock);
}
