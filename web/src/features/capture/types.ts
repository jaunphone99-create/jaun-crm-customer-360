/* ชนิดข้อมูลของหน้า 04 · เพิ่มลูกค้า (Quick Capture)

   ค่าทุกตัวที่แสดงบนหน้าจอมาจากฐานข้อมูล (ref.* · api.get_my_access · api.find_customer_candidates)
   ไฟล์นี้มีแต่รูปร่างของข้อมูล ไม่มีค่าคงที่ทางธุรกิจ */

/** ตัวเลือกจาก schema `ref` (อ่านเฉพาะแถวที่ is_active เรียงตาม sort_order) */
export type RefOption = { code: string; label_th: string };

/** ref.channels — is_live ใช้บอกสถานะ lead เริ่มต้น (CANONICAL ข้อ 4.3 · 6.2) */
export type ChannelOption = RefOption & { is_live: boolean };

/** ref.interest_types — creates_lead บอกว่าความสนใจนี้สร้าง Lead อัตโนมัติหรือไม่ */
export type InterestOption = RefOption & { creates_lead: boolean };

/** สาขาที่ผู้ใช้สร้างลูกค้าได้ — มาจาก api.get_my_access() */
export type BranchOption = { branch_id: string; code: string; name_th: string };

export type CaptureRefs = {
  channels: ChannelOption[];
  interestTypes: InterestOption[];
  productTypes: RefOption[];
  provinces: RefOption[];
  sources: RefOption[];
  overrideReasons: RefOption[];
  /** ref.consent_purposes — ใช้เฉพาะตรวจว่ามี purpose นี้อยู่จริง */
  consentPurposes: RefOption[];
};

/** การ์ดผู้สมัครซ้ำจาก api.find_customer_candidates (app.candidate_card · CANONICAL ข้อ 6.5)
    ลูกค้านอกขอบเขตจะไม่มี lifecycle_stage และเบอร์ปิดบังจะมีเฉพาะเมื่อ "ตรงด้วยเบอร์" */
export type Candidate = {
  customer_id: string;
  customer_no: string;
  display_name: string | null;
  value_masked: string | null;
  lifecycle_stage?: string | null;
  score: number;
  reasons: string[];
  in_scope: boolean;
  can_view: boolean;
};

export type DupState = {
  /** idle = ยังไม่ตรวจ · results = มีผลแล้ว · limited = ถูกระงับชั่วคราว (ไม่บล็อกการบันทึก) */
  status: "idle" | "results" | "limited";
  /** ตัวระบุที่ผลชุดนี้ผูกอยู่ — ถ้าผู้ใช้แก้ตัวระบุ ผลเดิมใช้ไม่ได้ */
  key: string;
  candidates: Candidate[];
  message: string | null;
};

export type CaptureSuccess = {
  message: string;
  customerNo: string | null;
  visitNo: string | null;
  queueNo: number | null;
  leadNo: string | null;
};

export type CaptureState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  /** ข้อความเตือนที่ไม่ใช่ความผิดของช่องใดช่องหนึ่ง (เช่น ยังไม่ได้ตัดสินเรื่องข้อมูลซ้ำ) */
  formWarning: string | null;
  dup: DupState;
  success: CaptureSuccess | null;
  /** เพิ่มขึ้นทุกครั้งที่ action ตอบกลับ — ให้ฝั่งหน้าจอรู้ว่ามีผลลัพธ์ใหม่ */
  nonce: number;
};

export const EMPTY_DUP: DupState = { status: "idle", key: "", candidates: [], message: null };

export const INITIAL_CAPTURE_STATE: CaptureState = {
  fieldErrors: {},
  formError: null,
  formWarning: null,
  dup: EMPTY_DUP,
  success: null,
  nonce: 0,
};

/** visit ที่เปิดอยู่ซึ่งหน้านี้ถูกเรียกให้มาผูกลูกค้า (?visit=…) */
export type OpenVisit = {
  id: string;
  visit_no: string;
  branch_id: string;
  channel_code: string;
  interest_code: string | null;
  source_code: string | null;
};

export type CaptureMode = "customer" | "visit";

/** บริบทที่หน้า (server component) คำนวณให้ฟอร์มใช้ */
export type CaptureContext = {
  mode: CaptureMode;
  visit: OpenVisit | null;
  branches: BranchOption[];
  /** มี customer.consent.manage → แสดงส่วนยินยอมรับข่าวสาร */
  canConsent: boolean;
  /** มี visit.read → มีหน้ารับลูกค้าเข้าร้านให้กลับไปได้ */
  canReception: boolean;
  /** ข้อความแจ้งเมื่อผู้ใช้ขอ mode=visit แต่บทบาทเปิด visit ไม่ได้ */
  notice: string | null;
  /** ฉบับประกาศความเป็นส่วนตัวที่จะถูกบันทึก */
  noticeVersion: string;
};
