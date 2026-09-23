import type { Access } from "@/lib/access";

import { MFA_REQUIRED_TEXT } from "./types";

/* กติกาการ "แสดงปุ่ม" ของหน้า 17

   ทุกฟังก์ชันในไฟล์นี้ตอบคำถามเดียว: ปุ่มนี้ควรโผล่ไหม และถ้าโผล่แล้วกดไม่ได้ ให้บอกเหตุผลว่าอะไร
   **ไม่มีฟังก์ชันไหนตัดสินสิทธิ์แทนฐานข้อมูล** — ผู้ปฏิเสธจริงคือ app.require_permission
   ใน api.create_dsr · api.update_dsr · api.anonymize_customer · api.set_legal_hold

   เหตุผลที่ยังต้องมีไฟล์นี้: ผู้ที่มี dsr.manage แต่ยังไม่ผ่าน MFA ในเซสชันนี้ ควรเห็นปุ่มพร้อมคำอธิบาย
   ไม่ใช่เห็นหน้าเปล่าแล้วเดาว่าตัวเองไม่มีสิทธิ์ ซึ่งจะทำให้เข้าใจอำนาจของตัวเองผิด */

/** สถานะของปุ่มหนึ่งปุ่ม — visible=false คือไม่ต้องวาดเลย · reason ที่ไม่ใช่ null คือวาดแบบกดไม่ได้ */
export type ButtonState = { visible: boolean; allowed: boolean; reason: string | null };

const HIDDEN: ButtonState = { visible: false, allowed: false, reason: null };
const OK: ButtonState = { visible: true, allowed: true, reason: null };

export function blocked(reason: string): ButtonState {
  return { visible: true, allowed: false, reason };
}

/** สิทธิ์นี้ใช้ได้ไหม — มีแต่ยังติด MFA ให้แสดงปุ่มพร้อมเหตุผล ไม่ใช่ซ่อนจนผู้ใช้งง */
export function permissionState(access: Access, permission: string): ButtonState {
  const usable = access.permissions.some((p) => p.permission_code === permission && p.effective_now);
  if (usable) return OK;
  const pending = access.permissions.some(
    (p) => p.permission_code === permission && (p.requires_mfa || p.requires_aal2)
  );
  return pending ? blocked(MFA_REQUIRED_TEXT) : HIDDEN;
}

/** ปุ่มที่มีเงื่อนไขเพิ่มเติมของหน้าจอเอง — เหตุผลของหน้าจอไม่มีวันทำให้ปุ่มที่ถูกซ่อนกลับมาโผล่ */
export function withReason(base: ButtonState, reason: string | null): ButtonState {
  if (!base.visible) return HIDDEN;
  if (!base.allowed) return base;
  return reason ? blocked(reason) : base;
}
