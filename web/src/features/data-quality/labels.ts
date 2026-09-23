import type { IssueCode } from "./types";

/* ป้ายและกติกาของแต่ละชนิดปัญหา (CANONICAL ข้อ 12.3 ตาราง "รายการในศูนย์คุณภาพข้อมูล")

   ตารางนี้ลอกจากเอกสารตรง ๆ เพราะ ENUM ของปัญหาไม่ได้เก็บป้ายไทยไว้ในฐานข้อมูล
   (analytics.data_quality_issues สร้าง issue_code เป็นข้อความคงที่ในตัว view)
   ส่วน "สิทธิ์ที่ใช้แก้" ที่นี่มีไว้ตัดสินว่าจะ "วาดปุ่มไหม" เท่านั้น
   ผู้ปฏิเสธจริงคือ RPC และ RLS ซึ่งตรวจสิทธิ์ชุดของตัวเองอีกชั้นเสมอ */

export const ISSUE_LABEL: Record<IssueCode, string> = {
  DUPLICATE_SUSPECTED: "ลูกค้าอาจซ้ำ",
  MISSING_PHONE: "ไม่มีเบอร์โทร",
  INVALID_PHONE: "เบอร์ไม่ถูกต้อง",
  LEAD_WITHOUT_OWNER: "Lead ไม่มีผู้รับผิดชอบ",
  LEAD_WITHOUT_OUTCOME: "Lead ค้างไม่มีผล",
  OVERDUE_FOLLOWUP: "ติดตามเกินกำหนด",
  INCOMPLETE_CUSTOMER: "ข้อมูลลูกค้าไม่ครบ",
  WON_WITHOUT_TRANSACTION: "ปิดขายแต่ไม่มีเลขธุรกรรม",
  VISIT_UNRECORDED: "ไม่ได้บันทึกผลการให้บริการ",
};

/** เงื่อนไขที่ทำให้รายการติดอยู่ในศูนย์คุณภาพข้อมูล — บอกผู้ใช้ว่า "แก้อะไรแล้วจะหลุด" */
export const ISSUE_CONDITION: Record<IssueCode, string> = {
  DUPLICATE_SUSPECTED: "คู่ลูกค้าที่ระบบสงสัยว่าซ้ำและยังไม่มีการตัดสิน",
  MISSING_PHONE: "ลูกค้าที่มาจากหน้าร้านหรือโทรเข้า แต่ยังไม่มีเบอร์โทรที่ใช้งานอยู่",
  INVALID_PHONE: "ลูกค้าที่มีเบอร์โทรใช้งานอยู่แต่รูปแบบเบอร์ไม่ถูกต้อง",
  LEAD_WITHOUT_OWNER: "Lead ที่ยังเปิดอยู่และยังไม่มีผู้รับผิดชอบ",
  LEAD_WITHOUT_OUTCOME: "Lead ที่ยังเปิดอยู่เกินจำนวนวันที่ตั้งไว้ใน dq.lead_without_outcome_days",
  OVERDUE_FOLLOWUP: "งานติดตามที่เลยกำหนดและยังไม่ปิด",
  INCOMPLETE_CUSTOMER: "ลูกค้าที่ขาดนามสกุล ขาดจังหวัด และยังไม่มี Lead หรือโอกาสขายที่ระบุความสนใจ",
  WON_WITHOUT_TRANSACTION: "โอกาสขายที่ปิดการขายแล้วเกินจำนวนวันที่ตั้งไว้ แต่ยังไม่มีเลขธุรกรรมผูก",
  VISIT_UNRECORDED: "การให้บริการที่ระบบปิดให้เพราะไม่ได้บันทึกผล ในช่วงวันที่ตั้งไว้ และยังไม่มีใครรับทราบ",
};

/** สิทธิ์ที่เอกสารกำหนดว่าใช้แก้ปัญหาชนิดนี้ — ใช้ตัดสินว่าจะวาดปุ่มไหมเท่านั้น */
export const ISSUE_FIX_PERMISSION: Record<IssueCode, string> = {
  DUPLICATE_SUSPECTED: "customer.merge",
  MISSING_PHONE: "data_quality.resolve",
  INVALID_PHONE: "data_quality.resolve",
  LEAD_WITHOUT_OWNER: "lead.assign",
  LEAD_WITHOUT_OUTCOME: "lead.update",
  OVERDUE_FOLLOWUP: "task.update",
  INCOMPLETE_CUSTOMER: "data_quality.resolve",
  WON_WITHOUT_TRANSACTION: "transaction.link",
  VISIT_UNRECORDED: "visit.update",
};

/** Phase ของงานตาม sitemap-screen-specs ข้อ 15 — แสดงให้เห็นว่าชนิดไหนอยู่ในขอบเขตรอบนี้ */
export const ISSUE_PHASE: Record<IssueCode, string> = {
  DUPLICATE_SUSPECTED: "1",
  MISSING_PHONE: "1",
  INVALID_PHONE: "1",
  LEAD_WITHOUT_OWNER: "2",
  LEAD_WITHOUT_OUTCOME: "2",
  OVERDUE_FOLLOWUP: "2",
  INCOMPLETE_CUSTOMER: "1",
  WON_WITHOUT_TRANSACTION: "2",
  VISIT_UNRECORDED: "1",
};

/** คำอธิบายเพิ่มของชนิดที่มีเงื่อนไขพิเศษเกินกว่าสิทธิ์ตัวเดียว */
export const ISSUE_EXTRA_RULE: Partial<Record<IssueCode, string>> = {
  DUPLICATE_SUSPECTED: "ต้องยืนยันตัวตนสองขั้นตอน และผู้ตัดสินต้องไม่ใช่ผู้สร้างรายการ",
  VISIT_UNRECORDED: "ผลการให้บริการแก้ไม่ได้หลังข้ามวัน จึงบันทึกเป็นการรับทราบแทน",
};

export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "บุคคลธรรมดา",
  BUSINESS: "นิติบุคคล",
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: "ใหม่",
  CONTACTED: "ติดต่อแล้ว",
  QUALIFIED: "สนใจจริง",
  CONVERTED: "แปลงเป็นโอกาสขาย",
  LOST: "ไม่สำเร็จ",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: "เปิดอยู่",
  IN_PROGRESS: "กำลังทำ",
  DONE: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};
