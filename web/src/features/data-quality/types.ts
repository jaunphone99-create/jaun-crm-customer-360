/* ชนิดข้อมูลของหน้า 12 · ศูนย์คุณภาพข้อมูล

   รูปร่างทุกตัวลอกมาจากค่าที่ RPC และตารางคืนจริง (supabase/migrations/0012_analytics.sql · 0010_security.sql)
   ไม่ใช่จากสิ่งที่หน้าจออยากได้ — ถ้าฐานข้อมูลเปลี่ยน ให้แก้ที่นี่แล้วปล่อยให้ TypeScript ชี้จุดที่พัง

   ไฟล์นี้แยกจาก actions.ts เพราะไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async */

/** ชนิดปัญหาทั้งเก้า — ลำดับเดียวกับ CANONICAL ข้อ 12.3 (ฐานข้อมูลตรวจค่านี้ซ้ำอีกชั้นใน c_codes) */
export const ISSUE_CODES = [
  "DUPLICATE_SUSPECTED",
  "MISSING_PHONE",
  "INVALID_PHONE",
  "LEAD_WITHOUT_OWNER",
  "LEAD_WITHOUT_OUTCOME",
  "OVERDUE_FOLLOWUP",
  "INCOMPLETE_CUSTOMER",
  "WON_WITHOUT_TRANSACTION",
  "VISIT_UNRECORDED",
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export function isIssueCode(value: string): value is IssueCode {
  return (ISSUE_CODES as readonly string[]).includes(value);
}

/** หนึ่งแถวของ rows ที่ api.list_data_quality_issues คืน */
export type IssueRow = {
  issue_code: IssueCode;
  entity_type: "DUPLICATE_DECISION" | "CUSTOMER" | "LEAD" | "TASK" | "OPPORTUNITY" | "VISIT";
  entity_id: string;
  customer_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
  detected_at: string | null;
};

/** หนึ่งแถวของ counts — จำนวนต่อชนิดต่อสาขา · ตัวเลขนี้มาจาก RPC เท่านั้น ห้ามนับจากความยาว array */
export type CountRow = {
  issue_code: IssueCode;
  branch_id: string | null;
  branch_code: string | null;
  value: number;
};

/** ผลของ api.list_data_quality_issues หนึ่งครั้ง */
export type IssueListResult = {
  ok: boolean;
  issue_code: IssueCode | null;
  branch_ids: string[];
  total: number;
  counts: CountRow[];
  rows: IssueRow[];
};

/** สรุปของทั้งหน้า — total ต่อชนิดเป็นค่าที่ RPC คืนมาตรง ๆ ไม่ได้บวกเอง */
export type Summary = {
  /** ผลของการถาม RPC หนึ่งครั้งต่อหนึ่งชนิดปัญหา */
  byCode: Record<IssueCode, { total: number; rows: IssueRow[] }>;
  /** จำนวนต่อชนิดต่อสาขา (เหมือนกันทุกครั้งที่เรียก จึงเก็บชุดเดียว) */
  counts: CountRow[];
  /** สาขาที่ฐานข้อมูลบอกว่าอยู่ในขอบเขตของคำขอนี้ */
  branchIds: string[];
};

export type BranchRow = { branch_id: string; code: string; name_th: string };

/** ลูกค้าเท่าที่หน้านี้ต้องใช้ — ไม่มีค่าเต็มของช่องทางติดต่อ (ข้อ 6.9) */
export type CustomerBrief = {
  id: string;
  customer_no: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  province_code: string | null;
  customer_type: string | null;
  first_branch_id: string | null;
  first_channel_code: string | null;
  first_seen_at: string | null;
  owner_staff_id: string | null;
};

/** เบอร์ของลูกค้าที่แสดงได้ — value_masked เท่านั้น ค่าเต็มมีทางเดียวคือ api.reveal_contact */
export type PhoneBrief = { contact_id: string; masked: string | null; is_valid: boolean; is_primary: boolean };

export type DuplicateDetail = {
  decision_id: string;
  score: number | null;
  matched_rules: string[];
  override_reason_code: string | null;
  created_by: string | null;
  created_at: string | null;
  /** ลูกค้าที่สร้างใหม่ (duplicate_decisions.customer_id) */
  newer: CustomerBrief | null;
  /** ลูกค้าที่มีอยู่เดิม (candidate_customer_id) */
  existing: CustomerBrief | null;
};

export type LeadBrief = {
  id: string;
  lead_no: string | null;
  customer_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
  status: string;
  channel_code: string | null;
  created_at: string | null;
};

export type TaskBrief = {
  id: string;
  task_no: string | null;
  title: string | null;
  customer_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
  status: string;
  due_at: string | null;
  is_next_action: boolean;
};

export type OpportunityBrief = {
  id: string;
  opportunity_no: string | null;
  customer_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
  won_at: string | null;
  won_amount: string | number | null;
};

export type VisitBrief = {
  id: string;
  visit_no: string | null;
  customer_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
  started_at: string | null;
};

export type RefOption = { code: string; label: string };

export type StaffOption = { staff_id: string; label: string };

/** ผลของ Server Action ที่ฟอร์มเอาไปแสดง — ผ่าน toThaiMessage มาแล้ว แสดงได้เสมอ */
export type ActionState = { ok: boolean; title: string | null; detail?: string | null };

export const INITIAL_ACTION: ActionState = { ok: false, title: null };

/** ข้อความเดียวที่ใช้ทุกที่เมื่อปุ่มติดเงื่อนไข MFA (ข้อกำหนดของงานนี้ ข้อ 3) */
export const MFA_REQUIRED_TEXT = "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน";

/** จำนวนแถวที่แสดงต่อหนึ่งชนิดปัญหา — ตัวนับยังเป็นค่าเต็มจาก RPC เสมอ (C-PAGINATION) */
export const ROWS_SHOWN = 20;
