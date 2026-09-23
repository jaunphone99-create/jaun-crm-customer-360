/* ชนิดข้อมูลของหน้า 17 · PDPA — ความยินยอมและคำขอเจ้าของข้อมูล

   รูปร่างทุกตัวลอกมาจากค่าที่ RPC คืนจริงใน supabase/migrations/0011_api.sql
   ไม่ใช่จากสิ่งที่หน้าจออยากได้ — ถ้าลายเซ็น RPC เปลี่ยน ให้แก้ที่นี่แล้วให้ TypeScript ชี้จุดที่พัง

   ไฟล์นี้แยกจาก actions.ts เพราะไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async */

/* ---------------------------------------------------------------- enum ของฐานข้อมูล */

/** crm.dsr_type (0001_foundation.sql) — ลำดับตามที่ประกาศไว้ในฐานข้อมูล */
export const DSR_TYPES = [
  "ACCESS",
  "CORRECTION",
  "DELETION",
  "OBJECTION",
  "WITHDRAW_CONSENT",
  "PORTABILITY",
] as const;
export type DsrType = (typeof DSR_TYPES)[number];

/** crm.dsr_status */
export const DSR_STATUSES = ["RECEIVED", "VERIFIED", "IN_PROGRESS", "COMPLETED", "REJECTED"] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];

/** สถานะที่ยังต้องทำอะไรต่อ — ใช้นับแท็บและตัดสินว่าจะโชว์ปุ่มดำเนินการไหม */
export const OPEN_DSR_STATUSES: DsrStatus[] = ["RECEIVED", "VERIFIED", "IN_PROGRESS"];

/** วิธียืนยันตัวตนที่ api.update_dsr ยอมรับ — ไม่มีตัวเลือก "ถ่ายสำเนาบัตร" โดยตั้งใจ (ข้อ 10.4) */
export const DSR_VERIFICATION_METHODS = ["IN_PERSON_ID_SIGHTED", "OTP_TO_REGISTERED_CONTACT", "OTHER"] as const;
export type DsrVerificationMethod = (typeof DSR_VERIFICATION_METHODS)[number];

/** crm.consent_status */
export const CONSENT_STATUSES = ["GRANTED", "WITHDRAWN"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** crm.consent_capture_via */
export const CONSENT_CAPTURE_VIA = ["STAFF_FORM", "LINK_SENT", "LINE_OA", "WEB"] as const;
export type ConsentCaptureVia = (typeof CONSENT_CAPTURE_VIA)[number];

/** ช่องทางที่ customer_consents_channels_chk ยอมรับ (0004_crm_customer.sql) */
export const CONSENT_CHANNELS = ["LINE", "SMS", "PHONE", "EMAIL"] as const;

/* ------------------------------------------------------------------------ ป้ายภาษาไทย */

export const DSR_TYPE_LABEL: Record<string, string> = {
  ACCESS: "ขอดู/ขอสำเนา",
  CORRECTION: "ขอแก้ไข",
  DELETION: "ขอลบ",
  OBJECTION: "คัดค้านการประมวลผล",
  WITHDRAW_CONSENT: "ถอนความยินยอม",
  PORTABILITY: "ขอโอนย้ายข้อมูล",
};

export const DSR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: "รับคำขอแล้ว",
  VERIFIED: "ยืนยันตัวตนแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  COMPLETED: "เสร็จสิ้น",
  REJECTED: "ปฏิเสธคำขอ",
};

export const DSR_VERIFICATION_LABEL: Record<string, string> = {
  IN_PERSON_ID_SIGHTED: "ตรวจบัตรต่อหน้า (ไม่เก็บสำเนา)",
  OTP_TO_REGISTERED_CONTACT: "ส่งรหัสไปช่องทางที่ลงทะเบียนไว้",
  OTHER: "วิธีอื่น (ระบุในหมายเหตุ)",
};

export const CONSENT_STATUS_LABEL: Record<string, string> = {
  GRANTED: "ยินยอม",
  WITHDRAWN: "ถอนแล้ว",
};

export const CONSENT_VIA_LABEL: Record<string, string> = {
  STAFF_FORM: "พนักงานบันทึกต่อหน้า",
  LINK_SENT: "ส่งลิงก์ประกาศให้",
  LINE_OA: "ผ่าน LINE OA",
  WEB: "ผ่านเว็บไซต์",
};

/** สถานะแถวของ crm.customers ที่หน้านี้ต้องแยกแยะ */
export const RECORD_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ปกติ",
  MERGED: "ถูกรวมไปแล้ว",
  ANONYMIZED: "ทำข้อมูลนิรนามแล้ว",
};

/* -------------------------------------------------------------- รูปร่างที่ RPC คืนมา */

/** หนึ่งแถวของ api.list_dsr */
export type DsrRow = {
  dsr_id: string;
  request_no: string | null;
  customer_id: string | null;
  requester_name: string;
  requester_contact_masked: string | null;
  request_type: DsrType;
  status: DsrStatus;
  received_at: string;
  received_by: string | null;
  /** generated column = received_at + 30 วัน (ข้อ 10.4) — ฐานข้อมูลคิดให้ ห้ามบวกเองที่หน้าจอ */
  due_at: string;
  verification_method: DsrVerificationMethod | null;
  /** ผู้ยืนยันตัวตน — ตัวเดียวกับที่ api.anonymize_customer ใช้ตรวจ 2-person control */
  verified_by: string | null;
  extended_until: string | null;
  completed_at: string | null;
  note: string | null;
};

/** ลูกค้าเท่าที่หน้านี้ต้องรู้ — อ่านจาก crm.customers ผ่าน RLS (ไม่ใช่การคำนวณ) */
export type CustomerBrief = {
  customer_id: string;
  customer_no: string;
  display_name: string;
  record_status: string;
  legal_hold: boolean;
};

/** พนักงานเท่าที่ต้องใช้แปลง uuid เป็นชื่อคน (core.staff_profiles ผ่าน RLS) */
export type StaffBrief = { staff_id: string; staff_code: string; display_name: string };

/** หนึ่งแถวของ crm.customer_consents — ประวัติแบบ append-only (ข้อ 10.2) */
export type ConsentRow = {
  consent_id: string;
  purpose_code: string;
  status: ConsentStatus;
  channels: string[];
  notice_version: string | null;
  captured_via: ConsentCaptureVia;
  captured_by: string | null;
  captured_at: string;
  evidence: string | null;
};

/** วัตถุประสงค์ความยินยอมจาก ref.consent_purposes */
export type ConsentPurpose = { code: string; label_th: string; sort_order: number };

/** ความยินยอม "สถานะปัจจุบัน" ที่ api.get_customer_360 คืนมา (crm.customer_consent_current) */
export type CurrentConsent = {
  purpose_code: string;
  status: ConsentStatus;
  channels: string[] | null;
  captured_at: string | null;
  notice_version: string | null;
};

/** หนึ่งบรรทัดของ api.get_entity_history / api.search_audit เท่าที่หน้านี้ใช้ */
export type AuditEntry = {
  id: string;
  occurred_at: string;
  actor_staff_code: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_ref: string | null;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

/* ------------------------------------------------------------------- สถานะของฟอร์ม */

/** ผลของ Server Action ที่ฟอร์มเอาไปแสดง — title/detail ผ่าน toThaiMessage มาแล้ว แสดงได้เสมอ */
export type ActionState = {
  ok: boolean;
  title: string | null;
  detail?: string | null;
  /** หัวข้อของแพ็กเกจข้อมูลที่ api.build_dsr_package สร้าง — ชื่อหมวดเท่านั้น ไม่มีค่าในหมวด */
  packageSections?: string[] | null;
};

export const INITIAL_ACTION: ActionState = { ok: false, title: null };

/** แท็บของหน้า — เก็บใน query string เพื่อให้แชร์ลิงก์ให้ดูด้วยกันได้ */
export type PrivacyTab = "dsr" | "consent" | "hold";

/** ข้อความเดียวที่ใช้ทุกที่เมื่อปุ่มติดเงื่อนไข MFA (ตรงกับหน้า 13) */
export const MFA_REQUIRED_TEXT = "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน";

/** เหตุผลที่ฐานข้อมูลจะปฏิเสธการทำข้อมูลนิรนามของผู้ยืนยันตัวตนเอง (api.anonymize_customer) */
export const TWO_PERSON_TEXT = "ผู้ดำเนินการต้องไม่ใช่ผู้ยืนยันตัวตน (ข้อ 10.4 · Q26)";

/** รูปแบบรหัสลูกค้าที่ใช้ตรวจก่อนยิง — ฐานข้อมูลเป็นผู้ตัดสินว่ามีจริงหรือไม่ */
export const CUSTOMER_NO_PATTERN = /^CUS-\d{4}-\d{6}$/;

export const purposeLabel = (code: string, purposes: ConsentPurpose[]): string =>
  purposes.find((p) => p.code === code)?.label_th ?? code;
