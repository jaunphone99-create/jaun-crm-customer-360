/* ชนิดข้อมูลของหน้า 18 · ตั้งค่าระบบ

   รูปร่างทุกตัวคัดมาจากสิ่งที่ RPC คืนจริง (supabase/migrations/0011_api.sql บล็อก K และ L)
   ไม่ใช่จากสิ่งที่หน้าจออยากได้ — RPC เปลี่ยนเมื่อไรให้แก้ที่นี่ แล้วปล่อยให้ TypeScript ชี้จุดที่พัง

   แยกจาก actions.ts เพราะไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async */

/** หนึ่งแถวของ api.get_settings() — คืนเฉพาะคีย์ที่ "ผู้เรียกแก้ได้" เท่านั้น */
export type SettingRow = {
  key: string;
  /** ค่า jsonb ดิบ — ตีความตาม kind ใน catalog.ts เท่านั้น อย่าเดาจากรูปร่าง */
  value: unknown;
  /** รหัสสิทธิ์ที่แก้ค่านี้ได้ (settings.business | settings.system) */
  editable_by: string;
  /** staff ที่แก้ล่าสุด · null = ค่าที่มาจาก migration/seed ยังไม่มีใครแก้ */
  updated_by: string | null;
  updated_at: string | null;
};

/** หนึ่งแถวของ api.list_integration_logs(p) — ข้อ 9.6 */
export type IntegrationLogRow = {
  id: string;
  occurred_at: string | null;
  source_system_code: string | null;
  direction: string | null;
  operation: string | null;
  status: string | null;
  http_status: number | null;
  external_ref: string | null;
  error_message: string | null;
  payload_sha256: string | null;
  actor_label: string | null;
  request_id: string | null;
};

/** ระบบต้นทางจาก ref.source_systems (ข้อ 5.7) */
export type SourceSystemRow = {
  code: string;
  label_th: string;
  is_active: boolean;
  is_system: boolean;
};

export type BranchRow = { branch_id: string; code: string; name_th: string };

/** ผลของ Server Action ที่ฟอร์มเอาไปแสดง — ผ่าน toThaiMessage มาแล้ว แสดงได้เสมอ */
export type ActionState = {
  ok: boolean;
  title: string | null;
  detail?: string | null;
};

export const INITIAL_ACTION: ActionState = { ok: false, title: null };

/** แท็บของหน้า — อยู่ใน query string เพื่อให้แชร์ลิงก์กันดูได้ */
export type SettingsTab = "business" | "system" | "integration";

/** ข้อความเดียวที่ใช้ทุกที่เมื่อปุ่มติดเงื่อนไข MFA (เดียวกับหน้า 13) */
export const MFA_REQUIRED_TEXT = "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน";

/** ป้ายทิศทางของ integration log */
export const DIRECTION_LABEL: Record<string, string> = {
  INBOUND: "รับเข้า",
  OUTBOUND: "ส่งออก",
};
