/* ชนิดข้อมูลของหน้า 13 · ผู้ใช้งานและสิทธิ์

   รูปร่างทั้งหมดมาจากค่าที่ RPC คืนจริง (supabase/migrations/0011_api.sql)
   ไม่ใช่จากสิ่งที่หน้าจออยากได้ — ถ้า RPC เปลี่ยน ให้แก้ที่นี่แล้วให้ TypeScript ชี้จุดที่พัง

   ไฟล์นี้แยกจาก actions.ts เพราะไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async */

/** สถานะบัญชีพนักงาน (CANONICAL ข้อ 7.1) */
export type StaffStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";

/** บทบาทที่ยังมีผลของพนักงานหนึ่งคน — api.list_staff คืน assignment_id มาให้ถอนได้ */
export type StaffRoleRow = {
  assignment_id: string;
  role_code: string;
  branch_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

export type StaffTeamRow = { team_id: string; code: string; is_leader: boolean };

/** หนึ่งแถวของ api.list_staff */
export type StaffRow = {
  staff_id: string;
  staff_code: string;
  display_name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  employee_code: string | null;
  status: StaffStatus;
  identity_verified_by: string | null;
  invite_expires_at: string | null;
  roles: StaffRoleRow[];
  teams: StaffTeamRow[];
};

/** หนึ่งแถวของ api.list_role_grant_requests */
export type GrantRequestRow = {
  request_id: string;
  request_no: string | null;
  role_code: string;
  request_type: "GRANT" | "REVOKE";
  target_staff_id: string;
  target_staff_code: string | null;
  target_display_name: string | null;
  target_status: StaffStatus | null;
  requested_by: string | null;
  requested_at: string | null;
  request_reason: string | null;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

/** สาขาจาก core.branches (อ่านได้ทุกบทบาทที่เข้าหน้านี้ได้ · ใช้แปลง branch_id เป็นชื่อ) */
export type BranchRow = { branch_id: string; code: string; name_th: string };

/** บทบาทจาก core.roles — rank ใช้เรียง · is_branch_role บอกว่าต้องระบุสาขาหรือไม่ */
export type RoleCatalogRow = {
  code: string;
  rank: number | null;
  is_branch_role: boolean;
  requires_mfa: boolean;
  sort_order: number;
};

/** ตัวเลือกบทบาทที่ "ฐานข้อมูลบอกว่ามอบได้" — มาจาก api.can_assign_role ทุกตัว ไม่ใช่จากตารางในโค้ด */
export type AssignOption = {
  role_code: string;
  /** null = บทบาทระดับองค์กร (ไม่ผูกสาขา) */
  branch_id: string | null;
  branch_label: string | null;
};

/** ผลของ Server Action ที่ฟอร์มเอาไปแสดง — title/detail ผ่าน toThaiMessage มาแล้ว แสดงได้เสมอ */
export type ActionState = {
  ok: boolean;
  title: string | null;
  detail?: string | null;
  /** ลิงก์คำเชิญที่ต้องส่งให้พนักงานเอง เมื่อระบบยังไม่ได้ตั้งค่าอีเมลขาออก
      แสดงครั้งเดียวบนหน้าจอผู้เชิญ · ไม่เก็บลง storage และไม่ส่งไปที่อื่น */
  inviteUrl?: string | null;
};

export const INITIAL_ACTION: ActionState = { ok: false, title: null };

/** แท็บของหน้า */
export type UsersTab = "users" | "requests" | "devices";

/** บทบาทที่มอบผ่านหน้านี้ได้ — บทบาทสูงกว่านี้ต้องยื่นคำขอ (CANONICAL ข้อ 7.2)
    รายชื่อนี้ใช้แค่ "จะถามฐานข้อมูลเรื่องบทบาทไหนบ้าง" — ผู้ตัดสินคือ api.can_assign_role */
export const ASSIGNABLE_ROLES = ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "MARKETING", "OPERATIONS"] as const;

/** บทบาทที่ต้องผ่านคำขอ + ผู้บริหารอนุมัติ (api.request_role_grant) */
export const REQUEST_ONLY_ROLES = ["SYSTEM_ADMIN", "EXECUTIVE", "BUSINESS_ADMIN"] as const;

export const GRANT_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

export const GRANT_TYPE_LABEL: Record<string, string> = {
  GRANT: "มอบบทบาท",
  REVOKE: "ถอนบทบาท",
};

/** ข้อความเดียวที่ใช้ทุกที่เมื่อปุ่มติดเงื่อนไข MFA (ข้อกำหนดของงานนี้ ข้อ 4) */
export const MFA_REQUIRED_TEXT = "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน";
