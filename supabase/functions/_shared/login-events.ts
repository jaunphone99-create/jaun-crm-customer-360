/* บันทึกเหตุการณ์ล็อกอินลง audit.login_events (ข้อ 9.2 "บันทึก" · แหล่งเดียว)

   สถานะปัจจุบัน — อ่านให้ครบก่อนใช้
   ------------------------------------------------------------------
   migration 0008 REVOKE สิทธิ์ทุกอย่างบน audit.login_events จาก service_role
   ("อ่านผ่าน RPC DEFINER เท่านั้น") และ **ยังไม่มี api.svc_* ตัวใดที่เขียนตารางนี้**
   แปลว่าวันนี้ Edge Function เขียน login_events ไม่ได้เลย ไม่ว่าจะเขียนโค้ดอย่างไร

   ไฟล์นี้จึงไม่ "คิดชื่อ RPC ขึ้นเอง" เพื่อไม่ให้เกิดสัญญาปลอมที่ทีมอื่นเข้าใจผิด
   แต่เตรียม hook ไว้ให้เปิดใช้ได้ทันทีเมื่อ migration เพิ่ม RPC ตัวนั้น:
   ตั้ง secret LOGIN_EVENT_RPC เป็นชื่อฟังก์ชันใน schema api (เช่น svc_log_login)
   แล้วฟังก์ชันนี้จะเรียกด้วย service_role ให้เอง · ไม่ตั้ง = ไม่ทำอะไร (no-op)

   สัญญาที่คาดไว้ของ RPC นั้น (เสนอไว้ใน README เพื่อให้เจ้าของ migration ตัดสิน):
     api.<ชื่อ>(p jsonb) โดย p = { event_type, method, success, failure_reason,
                                   user_id, identifier_hash, aal, ip, user_agent, request_id }

   ความล้มเหลวของการบันทึกห้ามทำให้การล็อกอินล้มเหลว — จับ error แล้วปล่อยผ่านเสมอ */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type LoginEvent = {
  /** เช่น LOGIN · LOGIN_LOCKOUT · PASSWORD_RESET_REQUESTED (รูปแบบ A–Z_ ตาม 0008) */
  event_type: string;
  /** เช่น STAFF_CODE · EMAIL_PASSWORD (รูปแบบ A–Z_) */
  method?: string;
  success: boolean;
  /** สาเหตุภายใน — ไม่เคยแสดงผู้ใช้ (ข้อความต่อผู้ใช้เหมือนกันทุกกรณี · ข้อ 9.2) */
  failure_reason?: string;
  user_id?: string | null;
  /** sha256 hex ของตัวระบุที่กรอก — เก็บ hash ไม่เก็บค่าจริง */
  identifier_hash?: string | null;
  aal?: "aal1" | "aal2" | null;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
};

/** sha256 hex ของตัวระบุ (อีเมล lower หรือ ST-NNNN) ตาม login_events_hash_chk ของ 0008 */
export async function identifierHash(identifier: string): Promise<string> {
  const data = new TextEncoder().encode(identifier.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** บันทึกแบบ best-effort · error ถูกกลืนเสมอ

    ค่าเริ่มต้นคือ api.svc_record_login_event ซึ่งเป็นประตูเดียวที่เขียน audit.login_events ได้
    (ตารางถูก REVOKE จากทุก role) · secret LOGIN_EVENT_RPC มีไว้เผื่อเปลี่ยนชื่อภายหลังเท่านั้น */
export async function recordLoginEvent(
  service: SupabaseClient,
  event: LoginEvent,
): Promise<void> {
  const rpc = Deno.env.get("LOGIN_EVENT_RPC") ?? "svc_record_login_event";
  try {
    await service.schema("api").rpc(rpc, { p: event });
  } catch (err) {
    // ห้ามทำให้ flow ล็อกอินล้มเหลวเพราะบันทึก log ไม่ได้
    console.error(`[login-events] rpc=${rpc} failed: ${String(err)}`);
  }
}
