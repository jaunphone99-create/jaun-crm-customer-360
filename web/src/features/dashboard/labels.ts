import type { Preset } from "./types";

/* ป้ายภาษาไทยของหน้า 02

   ทุกข้อความในไฟล์นี้คัดมาจาก CANONICAL ข้อ 12.1–12.3 · ข้อ 14.7 และ
   docs/06-ux/sitemap-screen-specs.md ข้อ 5.5 แบบคำต่อคำ — ห้ามแต่งใหม่
   เหตุผล: ป้ายการ์ดคือสิ่งที่ผู้บริหารใช้เรียกตัวเลขในที่ประชุม ถ้าหน้าจอเรียกชื่อหนึ่ง
   แต่รายงาน (หน้า 09) เรียกอีกชื่อ จะกลายเป็นคนละตัวเลขในความเข้าใจของผู้ใช้ทันที

   ไฟล์นี้ไม่มี "ค่า" ของ KPI ใดเลย — มีแต่ชื่อ ค่าทั้งหมดมาจาก api.get_kpis */

/** ป้ายช่วงเวลา (CANONICAL ข้อ 12.0 · prototype/assets/data.js meta.presets) */
export const PRESET_LABEL: Record<Preset, string> = {
  TODAY: "วันนี้",
  YESTERDAY: "เมื่อวาน",
  LAST_7_DAYS: "7 วันล่าสุด",
  THIS_WEEK: "สัปดาห์นี้",
  LAST_30_DAYS: "30 วันล่าสุด",
  THIS_MONTH: "เดือนนี้",
  LAST_MONTH: "เดือนที่แล้ว",
  THIS_QUARTER: "ไตรมาสนี้",
};

/** ชื่อ KPI กลาง — ใช้กับหัวตารางและแถวคุณภาพข้อมูล (CANONICAL ข้อ 12.1–12.3) */
export const KPI_LABEL: Record<string, string> = {
  VISITS: "ผู้มาติดต่อ (Visitor)",
  UNIQUE_CUSTOMERS: "ลูกค้าไม่ซ้ำ",
  LEADS: "Leads",
  OPPORTUNITIES: "Opportunities",
  SALES: "ปิดการขาย (Sales)",
  SALES_AMOUNT: "ยอดขาย (บาท)",
  CONV_LEAD_TO_SALE: "Conversion (Lead → ขาย)",
  TASKS_TODAY: "งานวันนี้",
  TASKS_OVERDUE: "เกินกำหนด",
  OPEN_LEADS: "Lead เปิดอยู่",
  OPEN_OPPORTUNITIES: "โอกาสขายเปิดอยู่",
  OPEN_PIPELINE_AMOUNT: "มูลค่า",
  CAPTURE_RATE: "อัตราบันทึกตัวตนลูกค้า",
  OUTCOME_COMPLETION: "บันทึกผลการให้บริการครบ",
  FOLLOWUP_COMPLETION: "ติดตามตรงเวลา",
  DUPLICATE_RATE: "อัตราข้อมูลซ้ำ",
  MISSING_REQUIRED_RATE: "ข้อมูลจำเป็นไม่ครบ",
};

export const kpiLabel = (code: string): string => KPI_LABEL[code] ?? code;

/** ป้ายขอบเขตในบรรทัดรองของหัวหน้า (sitemap ข้อ 5.5) */
export const SCOPE_ALL = "ทั้งองค์กร";
export const SCOPE_MINE = "ของฉัน";
export const SCOPE_TEAM = "ทีมของฉัน";
