import type { Access } from "@/lib/access";

import { MFA_REQUIRED_TEXT } from "./types";

/* กติกาการ "แสดงปุ่ม" ของหน้า 12

   ทุกฟังก์ชันที่นี่ตอบคำถามเดียว: ปุ่มนี้ควรโผล่ไหม และถ้าโผล่แล้วกดไม่ได้ ให้บอกเหตุผลว่าอะไร
   **ไม่มีฟังก์ชันไหนตัดสินสิทธิ์แทนฐานข้อมูล** — ผู้ปฏิเสธจริงคือ RPC (app.require_permission ·
   app.can_access_record · app.can_access_customer) และ RLS ที่ตรวจซ้ำทุกครั้งอยู่แล้ว

   เหตุผลที่ยังต้องมี: ถ้าวาดทุกปุ่มให้ทุกคน พนักงานจะเห็นปุ่ม "รวมลูกค้า" ที่กดแล้วโดนปฏิเสธเสมอ
   ซึ่งเป็นหน้าจอที่ชวนให้เข้าใจผิดเรื่องอำนาจของตัวเอง */

export type ButtonState = { visible: boolean; allowed: boolean; reason: string | null };

const HIDDEN: ButtonState = { visible: false, allowed: false, reason: null };
const OK: ButtonState = { visible: true, allowed: true, reason: null };

function blocked(reason: string): ButtonState {
  return { visible: true, allowed: false, reason };
}

/**
 * สิทธิ์นี้ใช้ได้ตอนนี้ไหม
 *
 * มีสิทธิ์แต่ยังติด MFA → วาดปุ่มแบบกดไม่ได้พร้อมเหตุผล (ข้อกำหนดของงานนี้ ข้อ 3)
 * ไม่มีสิทธิ์เลย → ไม่ต้องวาด เพราะผู้ใช้ไม่มีทางทำให้มันกดได้ด้วยตัวเอง
 */
export function permissionState(access: Access, permission: string): ButtonState {
  const usable = access.permissions.some((p) => p.permission_code === permission && p.effective_now);
  if (usable) return OK;
  const pending = access.permissions.some(
    (p) => p.permission_code === permission && (p.requires_mfa || p.requires_aal2)
  );
  return pending ? blocked(MFA_REQUIRED_TEXT) : HIDDEN;
}

/** สาขาที่ผู้ใช้ถือสิทธิ์นี้อยู่ (ORGANIZATION = ทุกสาขาขององค์กร · ตรงกับ app.effective_grants) */
export function scopeBranchIds(access: Access, permission: string): string[] {
  const rows = access.permissions.filter((p) => p.permission_code === permission && p.effective_now);
  if (rows.some((p) => p.scope === "ORGANIZATION" || p.scope === "SYSTEM")) {
    return access.branches.map((b) => b.branch_id);
  }
  const ids = new Set<string>();
  for (const p of rows) if (p.branch_id) ids.add(p.branch_id);
  return [...ids];
}

/**
 * ปุ่มแก้ของ "แถวหนึ่งแถว"
 *
 * เพิ่มเงื่อนไขสาขาจาก access เพื่อไม่ให้ปุ่มโผล่บนแถวของสาขาที่ผู้ใช้แตะไม่ได้
 * แถวที่ RPC คืนมาอยู่ในขอบเขต data_quality.view แล้ว แต่ "ดูได้" กับ "แก้ได้" เป็นคนละสิทธิ์
 */
export function rowActionState(access: Access, permission: string, branchId: string | null): ButtonState {
  const base = permissionState(access, permission);
  if (!base.visible || !base.allowed) return base;
  if (branchId === null) return base;

  const mine = scopeBranchIds(access, permission);
  /* ไม่มีสาขาผูกกับสิทธิ์นี้เลยแปลว่าเป็นสิทธิ์ระดับองค์กรที่ access ไม่ได้แจกแจงสาขาให้
     ปล่อยผ่านแล้วให้ฐานข้อมูลตัดสิน ดีกว่าซ่อนปุ่มที่จริง ๆ กดได้ */
  if (mine.length === 0) return base;
  return mine.includes(branchId) ? base : blocked("รายการนี้อยู่นอกสาขาที่คุณแก้ไขได้");
}

/**
 * ปุ่มตัดสินคู่ลูกค้าซ้ำ (รวม / ยืนยันคนละคน)
 *
 * ลอกเงื่อนไขของ api.merge_customers และ api.decide_duplicate มาสองข้อ:
 * ต้องมี customer.merge ซึ่งบังคับ MFA และผู้ตัดสินต้องไม่ใช่ผู้สร้างแถว (ข้อ 6.7)
 */
export function duplicateDecisionState(access: Access, createdBy: string | null): ButtonState {
  const base = permissionState(access, "customer.merge");
  if (!base.visible || !base.allowed) return base;
  if (createdBy !== null && createdBy === access.staff.staff_id) {
    return blocked("ผู้สร้างรายการนี้ตัดสินเองไม่ได้ · ให้คนอื่นที่มีสิทธิ์รวมลูกค้าเป็นผู้ตัดสิน");
  }
  return base;
}
