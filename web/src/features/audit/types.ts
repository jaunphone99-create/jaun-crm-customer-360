/* ชนิดข้อมูลและแคตตาล็อกของหน้า 16 · ประวัติการใช้งาน

   รูปร่างทุกตัวในไฟล์นี้คัดลอกมาจากค่าที่ RPC คืนจริงใน supabase/migrations/0011_api.sql
   (api.search_audit · api.search_security_log · api.get_entity_history) ไม่ใช่จากสิ่งที่หน้าจออยากได้
   ถ้า RPC เปลี่ยนเมื่อไร ให้แก้ที่นี่ที่เดียวแล้วปล่อยให้ TypeScript ชี้จุดที่พัง

   รายชื่อ action ด้านล่างไม่ได้พิมพ์ตามใจ — ทุกตัวถูกไล่หาจาก migration จริงแล้ว
   (trigger audit.log_row_change ใน 0008 + app.write_audit ใน 0011/0012)
   action ที่หา "ที่เขียน" ในฐานข้อมูลไม่เจอจะไม่ถูกใส่ในตัวเลือก เพราะตัวกรองที่คืนศูนย์แถวเสมอ
   ทำให้คนตรวจสอบเข้าใจผิดว่า "ไม่มีเหตุการณ์" ทั้งที่จริงคือ "ไม่มีวันมี" */

/** หนึ่งแถวของ api.search_audit — ชื่อคีย์ตรงตาม jsonb_build_object ใน 0011_api.sql */
export type AuditEntry = {
  id: number;
  occurred_at: string;
  actor_staff_id: string | null;
  actor_staff_code: string | null;
  actor_label: string | null;
  actor_roles: string[] | null;
  aal: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_ref: string | null;
  branch_id: string | null;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

/** หนึ่งแถวของ api.search_security_log → login_events (audit.login_events) */
export type LoginEvent = {
  id: number;
  occurred_at: string;
  user_id: string | null;
  staff_id: string | null;
  event_type: string;
  method: string | null;
  success: boolean;
  failure_reason: string | null;
  aal: string | null;
  ip: string | null;
  device_id: string | null;
};

/** หนึ่งแถวของ api.search_security_log → audit_entries
    ตัวนี้ "ไม่มี" before/after/actor_staff_id/branch_id โดยตั้งใจของ RPC — อย่าเติมเอง */
export type SecurityAuditEntry = {
  id: number;
  occurred_at: string;
  actor_staff_code: string | null;
  actor_label: string | null;
  aal: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_ref: string | null;
  changed_fields: string[] | null;
  reason: string | null;
};

/** หนึ่งแถวของ api.search_access_log (audit.access_logs)
    RPC ตัวนี้ "ไม่คืน" search_hashes โดยตั้งใจ — เป็น sha256 ไม่มี salt ของเบอร์โทร/LINE/อีเมล
    ซึ่งเดาย้อนกลับได้ คืนมาแค่ search_term_count · อย่าเพิ่มช่อง hash เข้ามาในชนิดนี้ */
export type AccessEntry = {
  id: number;
  occurred_at: string;
  actor_staff_id: string | null;
  actor_staff_code: string | null;
  actor_roles: string[] | null;
  aal: string | null;
  action: string;
  customer_id: string | null;
  contact_id: string | null;
  visit_id: string | null;
  branch_id: string | null;
  purpose: string | null;
  search_term_count: number;
  result_count: number | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  device_id: string | null;
};

/** ตัวกรองที่ api.search_access_log รับจริง */
export type AccessFilter = {
  from?: string;
  to?: string;
  action?: string;
  customer_id?: string;
  actor_staff_id?: string;
  branch_id?: string;
  limit?: number;
};

/** ความหมายของ purpose ใน CONTACT_REVEALED (0008_audit.sql) */
export const PURPOSE_LABELS: Record<string, string> = {
  VIEW: "ดูบนหน้าจอ",
  CALL: "กดโทรออก",
  COPY: "คัดลอก",
  LINE_OPEN: "เปิดแชต LINE",
};

/** ตัวกรองที่ api.search_audit รับจริง (อ่านจากตัว SQL ไม่ใช่จากเอกสาร)
    คีย์อื่นที่ส่งไปจะถูก RPC เมินเฉย — จึงห้ามมีคีย์อื่นในชนิดนี้ */
export type AuditFilter = {
  from?: string;
  to?: string;
  action?: string;
  entity_type?: string;
  entity_ref?: string;
  entity_id?: string;
  actor_staff_id?: string;
  limit?: number;
};

/** ตัวกรองที่ api.search_security_log รับจริง — มีแค่ช่วงเวลากับเพดาน */
export type SecurityFilter = { from?: string; to?: string; limit?: number };

/** เพดานแถวของ RPC ทั้งสองตัว (least(limit, 200) ใน 0011_api.sql) */
export const RPC_MAX_ROWS = 200;

export type AuditTab = "business" | "security";

/* ---------------------------------------------------------------------------
   แคตตาล็อก action
   ------------------------------------------------------------------------ */

/** action ที่ RPC เขียนเองแบบมีความหมาย (app.write_audit ใน 0011/0012) */
const RPC_ACTIONS = [
  "EXPORT_REQUESTED",
  "EXPORT_DECIDED",
  "EXPORT_DOWNLOADED",
  "REPORT_EXPORTED",
  "SETTINGS_UPDATED",
  "INTEGRATION_UPDATED",
  "DSR_PACKAGE_BUILT",
  "STAFF_DISABLED",
  "MFA_RESET",
] as const;

/** action ที่ trigger audit.log_row_change ตั้งชื่อเป็นพิเศษ (0008_audit.sql ส่วนที่ 6) */
const SEMANTIC_TRIGGER_ACTIONS = [
  "PERMISSION_CHANGED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "ROLE_GRANT_REQUESTED",
  "ROLE_GRANT_DECIDED",
  "STAFF_INVITED",
  "CUSTOMER_MERGED",
  "CUSTOMER_ANONYMIZED",
  "CUSTOMER_TAG_REMOVED",
  "CONSENT_RECORDED",
  "DSR_COMPLETED",
  "OPPORTUNITY_WON",
  "LEAD_ASSIGNED",
  "OPPORTUNITY_ASSIGNED",
  "TASK_ASSIGNED",
] as const;

/** action แบบ {ENTITY}_{CREATED|UPDATED|DELETED} ที่ trigger สร้างจากชื่อตาราง
    (audit.entity_code: customers → CUSTOMER · customer_contacts → CUSTOMER_CONTACT · …) */
const ROW_CHANGE_ACTIONS = [
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "CUSTOMER_CONTACT_CREATED",
  "CUSTOMER_CONTACT_UPDATED",
  "CUSTOMER_CONTACT_DELETED",
  "CUSTOMER_ADDRESS_CREATED",
  "CUSTOMER_ADDRESS_UPDATED",
  "CUSTOMER_NOTE_CREATED",
  "CUSTOMER_MERGE_CREATED",
  "DUPLICATE_DECISION_UPDATED",
  "VISIT_CREATED",
  "VISIT_UPDATED",
  "INTERACTION_CREATED",
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "OPPORTUNITY_CREATED",
  "OPPORTUNITY_UPDATED",
  "QUOTATION_CREATED",
  "QUOTATION_UPDATED",
  "TASK_CREATED",
  "TASK_UPDATED",
  "STAFF_UPDATED",
  "STAFF_INVITATION_CREATED",
  "TEAM_CREATED",
  "TEAM_UPDATED",
  "TEAM_MEMBER_CREATED",
  "TEAM_MEMBER_DELETED",
  "DEVICE_CREATED",
  "DSR_CREATED",
  "DSR_UPDATED",
] as const;

/** ตัวเลือกของช่อง "การกระทำ" ในแท็บธุรกิจ — เรียงตามตัวอักษรให้หาง่าย */
export const BUSINESS_ACTIONS: string[] = [
  ...RPC_ACTIONS,
  ...SEMANTIC_TRIGGER_ACTIONS,
  ...ROW_CHANGE_ACTIONS,
].sort();

/** เงื่อนไขเดียวกับที่ api.search_security_log ใช้คัด audit_entries (0011_api.sql)
    เขียนซ้ำที่นี่เพื่อ "เลือกตัวเลือกในช่องกรอง" เท่านั้น — ผู้คัดจริงคือฐานข้อมูล */
export function isSecurityAction(action: string): boolean {
  return (
    action.startsWith("ROLE_") ||
    action.startsWith("STAFF_") ||
    action.startsWith("MFA_") ||
    action === "PERMISSION_CHANGED" ||
    action === "SETTINGS_UPDATED" ||
    action === "INTEGRATION_UPDATED"
  );
}

/** ชนิดรายการที่ app.audit_entity_types() รู้จัก — ส่งค่าอื่นไปตัวกรองจะไม่ตรงกับอะไรเลย */
export const ENTITY_TYPES = [
  "CUSTOMER",
  "CONTACT",
  "ADDRESS",
  "NOTE",
  "CONSENT",
  "VISIT",
  "INTERACTION",
  "LEAD",
  "OPPORTUNITY",
  "QUOTATION",
  "TASK",
  "TRANSACTION_REF",
  "STAFF",
  "ROLE_ASSIGNMENT",
  "ROLE_GRANT_REQUEST",
  "TEAM",
  "EXPORT",
  "DSR",
  "SETTING",
  "REF",
  "DUPLICATE_DECISION",
] as const;

/* ---------------------------------------------------------------------------
   มุมมองสำเร็จรูป — เกณฑ์ยอมรับของเจ้าของโครงการ
   "ต้องย้อนดูการ Reveal Contact · Link Branch · Invite · Disable · Merge · Edit สำคัญ ได้"

   แต่ละมุมมองแปลงเป็น "ชุด action" ที่ api.search_audit ยิงได้จริง (RPC รับ action ทีละตัว
   จึงยิงขนานแล้วรวมผล) · มุมมองที่ฐานข้อมูลยังไม่เปิดทางให้อ่าน ตั้ง available = false
   แล้วหน้าจอจะบอกตรง ๆ ว่าอ่านไม่ได้และอยู่ตารางไหน แทนที่จะโชว์ตารางว่างให้เข้าใจผิด
   ------------------------------------------------------------------------ */

export type ViewKey =
  | "all"
  | "reveal"
  | "link_branch"
  | "invite"
  | "disable"
  | "merge"
  | "edit"
  | "roles"
  | "pdpa"
  | "export";

export type ViewDef = {
  key: ViewKey;
  label: string;
  /** ว่าง = ไม่กรอง action (ใช้กับ "ทั้งหมด") */
  actions: string[];
  /** อ่านผ่าน RPC ที่มีอยู่ได้หรือไม่ */
  available: boolean;
  /** อ่านจากไหน — audit.audit_logs (การแก้ข้อมูล) หรือ audit.access_logs (การเข้าถึงข้อมูล) */
  source?: "audit" | "access";
  /** อธิบายใต้ตาราง — ต้องบอกว่าข้อมูลมาจากไหน หรือทำไมถึงยังอ่านไม่ได้ */
  note: string;
};

export const VIEWS: ViewDef[] = [
  {
    key: "all",
    label: "ทั้งหมด",
    actions: [],
    available: true,
    note: "ทุกการกระทำที่ audit.audit_logs บันทึกไว้ในขอบเขตที่คุณอ่านได้ เรียงใหม่ไปเก่า",
  },
  {
    key: "reveal",
    label: "เปิดเผยช่องทางติดต่อ",
    actions: ["CONTACT_REVEALED"],
    available: true,
    source: "access",
    note:
      "ทุกครั้งที่มีคนเปิดค่าเต็มของเบอร์โทร LINE หรืออีเมล (api.reveal_contact เขียนก่อนคืนค่า) " +
      "พร้อมเหตุผลที่ใช้ · อ่านผ่าน api.search_access_log ซึ่งไม่ส่งค่าแฮชของคำค้นออกมา",
  },
  {
    key: "link_branch",
    label: "ผูกลูกค้าเข้าสาขา",
    actions: ["CUSTOMER_LINKED_TO_BRANCH"],
    available: true,
    source: "access",
    note:
      "การผูกลูกค้าเดิมเข้ากับสาขาที่เพิ่งมาใช้บริการ · เหตุการณ์นี้อยู่ใน audit.access_logs " +
      "เพราะ crm.customer_branches ถูกยกเว้นจาก trigger ของ audit.audit_logs (0008_audit.sql ส่วนที่ 10)",
  },
  {
    key: "invite",
    label: "เชิญผู้ใช้เข้าระบบ",
    actions: ["STAFF_INVITED", "STAFF_INVITATION_CREATED"],
    available: true,
    note: "การสร้างบัญชีจากคำเชิญ (core.staff_profiles) และใบเชิญที่ออกให้ (core.staff_invitations)",
  },
  {
    key: "disable",
    label: "ปิดใช้งานบัญชี",
    actions: ["STAFF_DISABLED"],
    available: true,
    note: "api.disable_staff และ api.svc_finalize_disable เขียน STAFF_DISABLED ทั้งคู่",
  },
  {
    key: "merge",
    label: "รวมลูกค้า",
    actions: ["CUSTOMER_MERGED", "CUSTOMER_MERGE_CREATED"],
    available: true,
    note: "CUSTOMER_MERGE_CREATED คือใบรวม (MG-…) · CUSTOMER_MERGED คือรายที่ถูกรวมเปลี่ยนสถานะ",
  },
  {
    key: "edit",
    label: "แก้ไขข้อมูลลูกค้าที่สำคัญ",
    actions: [
      "CUSTOMER_UPDATED",
      "CUSTOMER_CONTACT_UPDATED",
      "CUSTOMER_CONTACT_DELETED",
      "CUSTOMER_ADDRESS_UPDATED",
      "CUSTOMER_TAG_REMOVED",
      "CUSTOMER_ANONYMIZED",
      "CONSENT_RECORDED",
    ],
    available: true,
    note: "การแก้ข้อมูลหลักของลูกค้า ช่องทางติดต่อ ที่อยู่ ป้าย ความยินยอม และการทำนิรนาม",
  },
  {
    key: "roles",
    label: "เปลี่ยนบทบาทและสิทธิ์",
    actions: ["ROLE_GRANTED", "ROLE_REVOKED", "ROLE_GRANT_REQUESTED", "ROLE_GRANT_DECIDED", "PERMISSION_CHANGED", "MFA_RESET"],
    available: true,
    note: "การมอบ/ถอนบทบาท คำขอบทบาท การแก้ตารางสิทธิ์ และการรีเซ็ต MFA",
  },
  {
    key: "pdpa",
    label: "PDPA และความยินยอม",
    actions: ["CONSENT_RECORDED", "DSR_CREATED", "DSR_UPDATED", "DSR_COMPLETED", "DSR_PACKAGE_BUILT", "CUSTOMER_ANONYMIZED"],
    available: true,
    note: "ความยินยอม คำขอเจ้าของข้อมูล และการทำข้อมูลเป็นนิรนาม",
  },
  {
    key: "export",
    label: "คำขอส่งออกข้อมูล",
    actions: ["EXPORT_REQUESTED", "EXPORT_DECIDED", "EXPORT_DOWNLOADED", "REPORT_EXPORTED"],
    available: true,
    note: "วงจรคำขอส่งออก ตั้งแต่ยื่น อนุมัติ จนถึงดาวน์โหลด",
  },
];

export function viewFor(key: string): ViewDef {
  return VIEWS.find((v) => v.key === key) ?? VIEWS[0]!;
}

/** ข้อความเดียวที่ใช้ทุกที่เมื่อสิทธิ์ติดเงื่อนไข MFA (เหมือนหน้า 13) */
export const MFA_REQUIRED_TEXT = "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน";

/** แหล่งของแถว — ใช้เป็นป้ายในคอลัมน์ "แหล่ง" ตาม sitemap ข้อ 19.4 */
export type LogSource = "audit_logs" | "login_events";

export const SOURCE_LABEL: Record<LogSource, string> = {
  audit_logs: "ประวัติการแก้ไข",
  login_events: "เหตุการณ์เข้าสู่ระบบ",
};
