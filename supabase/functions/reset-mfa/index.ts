/* reset-mfa — ล้าง TOTP factor ของบัญชีเป้าหมาย (ข้อ 7.3 ข้อ 6 · 9.8 · หมายเหตุผู้เขียน E12)

   body    { staff_id, reason }
   คืนค่า  { ok: true, staff_id } หรือ { ok: false, message }

   ใครทำได้ — ฐานข้อมูลเป็นผู้ตัดสินใน api.svc_reset_mfa_authorize ทั้งหมด:
   - ผู้กระทำต้องเป็น aal2 (ยืนยัน MFA ในเซสชันนี้แล้ว)
   - เป้าหมายเป็น BUSINESS_ADMIN / EXECUTIVE / SYSTEM_ADMIN → ต้องให้ EXECUTIVE เป็นผู้ทำ
   - เป้าหมายอื่น → ต้องให้ BUSINESS_ADMIN เป็นผู้ทำ
   ฟังก์ชันนี้ไม่ตัดสินอะไรเอง เพียงส่ง (actor_user_id, actor_aal) ที่ verify แล้วไปให้ RPC

   หมายเหตุชื่อคีย์: สัญญาฝั่งแอปใช้ `staff_id` แต่ RPC รับ `target_staff_id` — แปลงที่นี่
   ห้ามส่ง staff_id ของผู้กระทำจาก body เด็ดขาด ผู้กระทำมาจาก JWT เท่านั้น (ข้อ 9.8 ข้อ 3)

   ลบ factor แล้วเกิดอะไรต่อ: ผู้ใช้เหลือ 0 factor → เซสชันไต่ไป aal2 ไม่ได้อีก
   บทบาทที่ roles.requires_mfa = true จะได้สิทธิ์เท่ากับไม่มีบทบาทจนกว่าจะลงทะเบียน TOTP ใหม่
   (ข้อ 9.2) → หน้า (app)/layout.tsx พาไป /login/mfa/enroll เอง */

import { NO_CALLER_MESSAGE, verifyCaller } from "../_shared/caller.ts";
import { serviceClient } from "../_shared/clients.ts";
import { GENERIC_MESSAGE, logFailure, safeMessage } from "../_shared/errors.ts";
import {
  fail,
  failWithStatus,
  ok,
  preflight,
  readJsonBody,
  requestId,
  requirePost,
  str,
} from "../_shared/http.ts";

const FN = "reset-mfa";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const bad = requirePost(req);
  if (bad) return bad;

  const reqId = requestId(req);

  const caller = await verifyCaller(req);
  if (!caller) return failWithStatus(NO_CALLER_MESSAGE, 401);

  const body = await readJsonBody(req);
  if (!body) return fail("ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");

  const staffId = str(body, "staff_id");
  const reason = str(body, "reason");
  if (!staffId) return fail("ต้องระบุบัญชีที่ต้องการรีเซ็ต MFA");
  if (!reason) return fail("ต้องระบุเหตุผลของการรีเซ็ต MFA");

  // ปิดทางตั้งแต่ต้นเมื่อเซสชันยังเป็น aal1 — ฐานข้อมูลก็ปฏิเสธอยู่ดี แต่ข้อความนี้บอกทางออกชัดกว่า
  if (caller.aal !== "aal2") {
    return fail("ต้องยืนยันตัวตนสองขั้น (MFA) ในเซสชันนี้ก่อนจึงจะรีเซ็ต MFA ให้ผู้อื่นได้");
  }

  const service = serviceClient();

  // ฐานข้อมูลตัดสินสิทธิ์ + เขียน audit MFA_RESET แล้วคืน user_id ของเป้าหมายให้เราไปลบ factor
  const authorized = await service.schema("api").rpc("svc_reset_mfa_authorize", {
    p: {
      actor_user_id: caller.userId,
      actor_aal: caller.aal,
      target_staff_id: staffId,
      reason,
    },
  });
  if (authorized.error) {
    logFailure(FN, "svc_reset_mfa_authorize", reqId, authorized.error);
    return fail(safeMessage(authorized.error, "รีเซ็ต MFA ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  }

  const result = authorized.data as {
    ok?: boolean;
    target_user_id?: string | null;
  } | null;
  if (!result?.ok) {
    logFailure(FN, "svc_reset_mfa_authorize_shape", reqId, result);
    return fail(GENERIC_MESSAGE);
  }

  // บัญชีที่ยังไม่เคยเข้าสู่ระบบ (INVITED) ยังไม่มี user_id → ไม่มี factor ให้ลบ แต่ audit ถูกเขียนแล้ว
  const targetUserId = result.target_user_id ?? null;
  if (!targetUserId) return ok({ staff_id: staffId, factors_deleted: 0 });

  const factors = await service.auth.admin.mfa.listFactors({ userId: targetUserId });
  if (factors.error) {
    logFailure(FN, "listFactors", reqId, factors.error);
    return fail("อ่านรายการอุปกรณ์ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  let deleted = 0;
  for (const factor of factors.data?.factors ?? []) {
    const removed = await service.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: targetUserId,
    });
    if (removed.error) {
      logFailure(FN, "deleteFactor", reqId, removed.error);
      // ลบได้บางส่วน = ยังเข้าด้วยเครื่องเดิมได้ ต้องให้คนตามต่อ ห้ามรายงานว่าสำเร็จ
      return fail(
        "ลบอุปกรณ์ยืนยันตัวตนได้ไม่ครบ กรุณาลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ",
      );
    }
    deleted += 1;
  }

  return ok({ staff_id: staffId, factors_deleted: deleted });
});
