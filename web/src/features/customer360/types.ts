/* ชนิดข้อมูลของหน้า 05 · ข้อมูลลูกค้า (Customer 360)

   รูปร่างทุกตัวคัดมาจากค่าที่ api.get_customer_360 คืนจริง
   (supabase/migrations/0011_api.sql:1089-1198 · ยืนยันด้วยการเรียกจริงกับฐานข้อมูลทดลอง)
   ไฟล์นี้มีแต่รูปร่างและป้ายที่ CANONICAL พิมพ์ไว้ ไม่มีการคิดค่าทางธุรกิจเอง */

/** ตัวเลือกจาก schema `ref` */
export type RefOption = { code: string; label_th: string };

export type Customer360Header = {
  customer_id: string;
  customer_no: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  lifecycle_stage: string | null;
  record_status: string;
  merged_into_id: string | null;
  legal_hold: boolean;
  province_code: string | null;
  first_channel_code: string | null;
  first_source_code: string | null;
  first_branch_id: string | null;
  first_seen_at: string | null;
  last_activity_at: string | null;
  last_channel_code: string | null;
  owner_staff_id: string | null;
  owner_display_name: string | null;
  badges: { vip: boolean; followingUp: boolean; newCustomer: boolean; notContacted: boolean };
  note_summary: string | null;
};

/** ตัวเลขสรุป 4 ช่อง — มาจาก app.customer_counters เท่านั้น หน้าจอห้ามคำนวณเอง (ข้อ 3.3 ข้อ 5) */
export type Customer360Counters = {
  interaction_count: number | null;
  walk_in_count: number | null;
  purchase_count: number | null;
  purchase_amount: number | null;
  months_as_customer: number | null;
};

export type Customer360Contact = {
  contact_id: string;
  contact_type: string;
  /** ค่าปิดบังเสมอ — ค่าเต็มได้ทางเดียวคือ api.reveal_contact (ข้อ 6.4 · D33) */
  value_masked: string | null;
  is_primary: boolean;
  is_valid: boolean;
  is_active: boolean;
};

export type Customer360Address = {
  address_id: string;
  district: string | null;
  province_code: string | null;
  value_masked: string | null;
  is_primary: boolean;
  is_active: boolean;
};

export type Customer360Consent = {
  purpose_code: string;
  status: string;
  channels: string[] | null;
  captured_at: string | null;
  notice_version: string | null;
};

export type Customer360Branch = {
  branch_id: string;
  code: string;
  name_th: string;
  first_linked_at: string | null;
  last_activity_at: string | null;
};

export type Customer360Note = {
  note_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

export type Customer360Interest = {
  product_model: string | null;
  product_type_code: string | null;
  interest_level: string | null;
  source: string;
  entity_ref: string | null;
};

export type Customer360NextFollowup = {
  source: string;
  entity_id: string;
  entity_ref: string | null;
  next_action: string | null;
  next_action_type_code: string | null;
  next_action_at: string | null;
  owner_staff_id: string | null;
} | null;

export type Customer360Tabs = {
  interactions: number;
  purchases: number;
  leads: number;
  opportunities: number;
  quotations: number;
  tasks: number;
  notes: number;
  documents: number;
  /** ฐานข้อมูลเป็นผู้ตอบว่าแท็บ "ประวัติการแก้ไข" เปิดได้หรือไม่ */
  can_view_history: boolean;
};

export type Customer360 = {
  ok: boolean;
  header: Customer360Header;
  counters: Customer360Counters;
  contacts: Customer360Contact[];
  addresses: Customer360Address[];
  consents: Customer360Consent[];
  tags: RefOption[];
  branches: Customer360Branch[];
  pinned_notes: Customer360Note[];
  interests: Customer360Interest[];
  next_followup: Customer360NextFollowup;
  tabs: Customer360Tabs;
};

/** โน้ตของลูกค้า — อ่านจาก crm.customer_notes ตรง ๆ (RPC คืนมาเฉพาะโน้ตที่ปักหมุด) */
export type NoteRow = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  created_by: string | null;
};

/** หนึ่งบรรทัดของไทม์ไลน์ — รวม interaction และ visit ที่ไม่มี interaction เข้าด้วยกันแล้ว */
export type TimelineItem = {
  key: string;
  at: string;
  /** รหัสใน ref.interaction_types — ใช้เป็นตัวกรอง "ประเภท" */
  typeCode: string;
  /** รหัสใน ref.channels — ใช้เป็นตัวกรอง "ช่องทาง" และสีของจุดบนเส้น */
  channelCode: string;
  direction: string | null;
  branchId: string | null;
  summary: string | null;
  ownerStaffId: string | null;
  visitNo: string | null;
  visitStatus: string | null;
  visitOutcomeCode: string | null;
};

/** หนึ่งแถวของ api.get_entity_history */
export type HistoryEntry = {
  id: string;
  occurred_at: string;
  actor_staff_code: string | null;
  actor_label: string | null;
  action: string;
  entity_ref: string | null;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

/** สิ่งที่หน้าจอต้องรู้เกี่ยวกับสิทธิ์ — ใช้ซ่อน/ปิดปุ่มเท่านั้น ฐานข้อมูลยังตัดสินเองทุกครั้ง */
export type Customer360Access = {
  canReveal: boolean;
  revealNeedsMfa: boolean;
  canUpdate: boolean;
  canMerge: boolean;
  mergeNeedsMfa: boolean;
};

export type Customer360Data = {
  detail: Customer360;
  timeline: TimelineItem[];
  notes: NoteRow[];
  /** จริงเมื่อรายการถูกตัดเพราะยาวเกินเพดาน — หน้าจอต้องบอกผู้ใช้ ไม่ใช่ทำเป็นว่าครบ */
  timelineTruncated: boolean;
  notesTruncated: boolean;
  history: HistoryEntry[];
  channels: RefOption[];
  interactionTypes: RefOption[];
  visitOutcomes: RefOption[];
  consentPurposes: RefOption[];
  /** ป้ายไทยของจังหวัดและแหล่งที่มาของลูกค้ารายนี้ (อ่านเฉพาะรหัสที่ใช้จริง) */
  provinceLabel: string | null;
  sourceLabel: string | null;
  /** ชื่อเรียกพนักงานตาม staff_id — id ที่สิทธิ์ไม่ถึงจะไม่มีในนี้ */
  staffNames: Record<string, string>;
  /** ชื่อสาขาตาม branch_id — ใช้กับไทม์ไลน์ข้ามสาขา */
  branchNames: Record<string, string>;
};

/** ป้าย lifecycle (CANONICAL ข้อ 3.4 · โทนสีข้อ 15) */
export const LIFECYCLE: Record<string, { label: string; tone: string }> = {
  REPEAT: { label: "ลูกค้าซื้อซ้ำ", tone: "badge--success" },
  CUSTOMER: { label: "ลูกค้าปัจจุบัน", tone: "badge--success" },
  OPPORTUNITY: { label: "มีโอกาสซื้อ", tone: "badge--warning" },
  LEAD: { label: "สนใจซื้อ", tone: "badge--info" },
  LOST: { label: "ไม่สำเร็จ", tone: "badge--danger" },
  IDENTIFIED: { label: "รู้จักแล้ว", tone: "badge--neutral" },
};

/** ป้ายเสริมตามลำดับ CANONICAL ข้อ 3.5 (สูงสุด 3 ป้าย) */
export const SUPPLEMENTARY: Array<{ key: keyof Customer360Header["badges"]; label: string; tone: string }> = [
  { key: "vip", label: "VIP", tone: "badge--navy" },
  { key: "followingUp", label: "ติดตามอยู่", tone: "badge--warning" },
  { key: "newCustomer", label: "ลูกค้าใหม่", tone: "badge--info" },
  { key: "notContacted", label: "ยังไม่ได้ติดต่อ", tone: "badge--danger" },
];

export const SUPPLEMENTARY_MAX = 3;

/** ป้ายสถานะ visit (CANONICAL ข้อ 4.1) */
export const VISIT_STATUS: Record<string, { label: string; tone: string }> = {
  WAITING: { label: "รอรับบริการ", tone: "badge--warning" },
  IN_SERVICE: { label: "กำลังให้บริการ", tone: "badge--info" },
  COMPLETED: { label: "เสร็จสิ้น", tone: "badge--success" },
  LEFT: { label: "ออกก่อนรับบริการ", tone: "badge--neutral" },
  CANCELLED: { label: "ยกเลิก (สร้างผิด)", tone: "badge--neutral" },
};

/** ป้ายสถานะความยินยอม (CANONICAL ข้อ 10.2) */
export const CONSENT_STATUS: Record<string, { label: string; tone: string }> = {
  GRANTED: { label: "ยินยอม/แจ้งแล้ว", tone: "badge--success" },
  WITHDRAWN: { label: "ถอนแล้ว", tone: "badge--neutral" },
};

/** ทิศทางการติดต่อ (crm.interactions.direction) */
export const DIRECTION_LABEL: Record<string, string> = {
  INBOUND: "ลูกค้าติดต่อมา",
  OUTBOUND: "พนักงานติดต่อไป",
  INTERNAL: "บันทึกภายใน",
};

/** ป้ายชนิดช่องทางติดต่อ (crm.contact_type) */
export const CONTACT_TYPE_LABEL: Record<string, string> = {
  PHONE: "โทรศัพท์",
  LINE_ID: "LINE ID",
  LINE_USER_ID: "LINE userId",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  EMAIL: "อีเมล",
};

/** ช่องทางของความยินยอม ⊆ {LINE, SMS, PHONE, EMAIL} (CANONICAL ข้อ 10.2) */
export const CONSENT_CHANNEL_LABEL: Record<string, string> = {
  LINE: "LINE",
  SMS: "SMS",
  PHONE: "โทรศัพท์",
  EMAIL: "อีเมล",
};

/* ---- การขอดูค่าเต็มของช่องทางติดต่อ ----------------------------------------
   รูปร่างเหล่านี้อยู่ที่นี่ ไม่ใช่ใน actions.ts เพราะไฟล์ "use server"
   ส่งออกได้เฉพาะฟังก์ชัน async เท่านั้น (Next.js ปฏิเสธค่าคงที่ที่ export ออกมา) */

/** purpose ที่ api.reveal_contact ยอมรับ (0011_api.sql:1216) */
export type RevealPurpose = "VIEW" | "CALL" | "COPY" | "LINE_OPEN";

export type RevealState = {
  contactId: string | null;
  purpose: RevealPurpose | null;
  value: string | null;
  /** วินาทีที่หน้าจอต้องซ่อนค่าคืน — ฐานข้อมูลเป็นผู้กำหนด */
  autoHideSeconds: number;
  error: string | null;
  /** เพิ่มขึ้นทุกครั้งที่ action ตอบกลับ — ให้หน้าจอรู้ว่าเป็นผลลัพธ์ใหม่แม้ค่าจะเท่าเดิม */
  nonce: number;
};

export const INITIAL_REVEAL: RevealState = {
  contactId: null,
  purpose: null,
  value: null,
  autoHideSeconds: 30,
  error: null,
  nonce: 0,
};

/** ระดับความสนใจ — ป้ายและโทนตรงตาม prototype/assets/data.js (enums.interestLevel) */
export const INTEREST_LEVEL: Record<string, { label: string; tone: string }> = {
  HOT: { label: "สนใจมาก", tone: "badge--warning" },
  WARM: { label: "สนใจ", tone: "badge--info" },
  COLD: { label: "สนใจน้อย", tone: "badge--neutral" },
};
