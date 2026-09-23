import type { Access, Scope } from "@/lib/access";

import { MFA_REQUIRED_TEXT, type StaffRow } from "./types";

/* กติกาการ "แสดงปุ่ม" ของหน้า 13

   ทุกฟังก์ชันในไฟล์นี้ตอบคำถามเดียว: ปุ่มนี้ควรโผล่ไหม และถ้าโผล่แล้วกดไม่ได้ ให้บอกเหตุผลว่าอะไร
   **ไม่มีฟังก์ชันไหนตัดสินสิทธิ์แทนฐานข้อมูล** — ผู้ปฏิเสธจริงคือ app.staff_admin_denial และ
   app.assign_role_denial ใน supabase/migrations/0011_api.sql ที่ RPC เรียกทุกครั้ง
   ที่นี่ทำให้หน้าจอไม่หลอกผู้ใช้ให้กรอกฟอร์มยาว ๆ แล้วไปโดนปฏิเสธตอนกดบันทึกเท่านั้น

   เหตุผลที่ต้องลอกกติกามาบางส่วน: ถ้าโชว์ทุกปุ่มกับทุกแถว ผู้จัดการสาขาจะเห็นปุ่ม "ปิดใช้งาน"
   บนบัญชีผู้บริหาร ซึ่งกดแล้วโดนปฏิเสธเสมอ — เป็นหน้าจอที่ชวนให้เข้าใจผิดเรื่องอำนาจของตัวเอง */

const SCOPE_RANK: Record<Scope, number> = { OWN: 1, TEAM: 2, BRANCH: 3, ORGANIZATION: 4, SYSTEM: 5 };

/** ขอบเขตสูงสุดของสิทธิ์นี้ที่ "มีผลตอนนี้" — null = ไม่มีสิทธิ์นี้ที่ใช้ได้ */
export function topScope(access: Access, permission: string): Scope | null {
  let best: Scope | null = null;
  for (const p of access.permissions) {
    if (p.permission_code !== permission || !p.effective_now) continue;
    if (best === null || SCOPE_RANK[p.scope] > SCOPE_RANK[best]) best = p.scope;
  }
  return best;
}

/** สาขาที่ผู้ใช้ถือสิทธิ์นี้อยู่ (scope ORGANIZATION = ทุกสาขาขององค์กร · ตรงกับ app.effective_grants) */
export function scopeBranchIds(access: Access, permission: string): string[] {
  const rows = access.permissions.filter((p) => p.permission_code === permission && p.effective_now);
  if (rows.some((p) => p.scope === "ORGANIZATION")) return access.branches.map((b) => b.branch_id);
  const ids = new Set<string>();
  for (const p of rows) if (p.branch_id) ids.add(p.branch_id);
  return [...ids];
}

/** สถานะของปุ่มหนึ่งปุ่ม — visible=false คือไม่ต้องวาดเลย · reason ที่ไม่ใช่ null คือวาดแบบกดไม่ได้ */
export type ButtonState = { visible: boolean; allowed: boolean; reason: string | null };

const HIDDEN: ButtonState = { visible: false, allowed: false, reason: null };
const OK: ButtonState = { visible: true, allowed: true, reason: null };

function blocked(reason: string): ButtonState {
  return { visible: true, allowed: false, reason };
}

/** สิทธิ์นี้ใช้ได้ไหม — มีแต่ยังติด MFA ให้แสดงปุ่มพร้อมเหตุผล ไม่ใช่ซ่อนจนผู้ใช้งงว่าทำไมไม่มีปุ่ม */
export function permissionState(access: Access, permission: string): ButtonState {
  const usable = access.permissions.some((p) => p.permission_code === permission && p.effective_now);
  if (usable) return OK;
  const pending = access.permissions.some(
    (p) => p.permission_code === permission && (p.requires_mfa || p.requires_aal2)
  );
  return pending ? blocked(MFA_REQUIRED_TEXT) : HIDDEN;
}

const BRANCH_MANAGEABLE_ROLES = ["STAFF", "SUPERVISOR"];

/** บัญชีนี้มีบทบาทธุรกิจ (อะไรก็ได้ที่ไม่ใช่ SYSTEM_ADMIN) หรือไม่ — ใช้กับขอบเขต SYSTEM (ข้อ 7.1) */
function hasBusinessRole(staff: StaffRow): boolean {
  return staff.roles.some((r) => r.role_code !== "SYSTEM_ADMIN");
}

/**
 * ปุ่มจัดการบัญชี (แก้โปรไฟล์ · มอบบทบาท · ปิดใช้งาน) ของแถวหนึ่ง
 *
 * ลอกโครงเดียวกับ app.staff_admin_denial: ขอบเขต BRANCH จัดการได้เฉพาะบัญชีที่ทุก assignment
 * เป็น STAFF/SUPERVISOR ในสาขาของตน · ขอบเขต SYSTEM จัดการได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ
 */
export function staffActionState(
  access: Access,
  permission: string,
  target: StaffRow,
  opts: { selfText?: string } = {}
): ButtonState {
  const base = permissionState(access, permission);
  if (!base.visible) return HIDDEN;

  if (target.staff_id === access.staff.staff_id) {
    return blocked(opts.selfText ?? "ทำรายการกับบัญชีของตนเองไม่ได้");
  }

  const scope = topScope(access, permission);
  if (scope === "SYSTEM" && hasBusinessRole(target)) return HIDDEN;

  if (scope === "BRANCH" || scope === "TEAM" || scope === "OWN") {
    const mine = scopeBranchIds(access, permission);
    const manageable =
      target.roles.length > 0 &&
      target.roles.every(
        (r) => BRANCH_MANAGEABLE_ROLES.includes(r.role_code) && r.branch_id !== null && mine.includes(r.branch_id)
      );
    if (!manageable) return HIDDEN;
  }

  return base;
}

/**
 * รีเซ็ต MFA ของบัญชีนี้ได้ไหม (Edge Function `reset-mfa` · ข้อ 7.3 ข้อ 6)
 *
 * ลอกกติกาของ api.svc_reset_mfa_authorize: บัญชีที่ถือบทบาทสูงต้องให้ผู้บริหารเป็นผู้ทำ
 * บัญชีอื่นให้ผู้ดูแลข้อมูลธุรกิจเป็นผู้ทำ และผู้กระทำต้องยืนยัน MFA ในเซสชันนี้เสมอ
 */
export function resetMfaState(access: Access, target: StaffRow): ButtonState {
  if (target.staff_id === access.staff.staff_id) return HIDDEN;
  if (target.roles.length === 0) return HIDDEN;

  const high = target.roles.some((r) => ["BUSINESS_ADMIN", "EXECUTIVE", "SYSTEM_ADMIN"].includes(r.role_code));
  const needed = high ? "EXECUTIVE" : "BUSINESS_ADMIN";
  if (!access.roles.some((r) => r.role_code === needed)) return HIDDEN;

  return access.aal === "aal2" ? OK : blocked(MFA_REQUIRED_TEXT);
}

/** ถอนบทบาทหนึ่งแถวได้ไหม (api.revoke_role) — บทบาทสูงต้องใช้คำขอชนิด REVOKE */
export function revokeState(access: Access, target: StaffRow, roleCode: string, branchId: string | null): ButtonState {
  const base = permissionState(access, "role.assign");
  if (!base.visible) return HIDDEN;
  if (target.staff_id === access.staff.staff_id) return blocked("ถอนบทบาทของตนเองไม่ได้");
  if (["EXECUTIVE", "BUSINESS_ADMIN", "SYSTEM_ADMIN"].includes(roleCode)) {
    return blocked("บทบาทนี้ถอนผ่านคำขอชนิดถอนเท่านั้น");
  }
  const scope = topScope(access, "role.assign");
  if (scope !== null && SCOPE_RANK[scope] <= SCOPE_RANK.BRANCH) {
    const mine = scopeBranchIds(access, "role.assign");
    if (!BRANCH_MANAGEABLE_ROLES.includes(roleCode) || branchId === null || !mine.includes(branchId)) {
      return blocked("ผู้จัดการสาขาถอนได้เฉพาะพนักงานขาย/แอดมินและหัวหน้าทีมในสาขาของตน");
    }
  }
  return base;
}
