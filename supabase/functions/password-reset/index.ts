/* password-reset — ขอลิงก์ตั้งรหัสผ่านใหม่ (ข้อ 9.2 · 9.8)

   body    { login_id }        ← อีเมล หรือ ST-NNNN
   คืนค่า  { ok: true } **เสมอ** ไม่ว่าจะมีบัญชีนั้นอยู่จริงหรือไม่

   เหตุผลที่ตอบ ok:true เสมอ: ถ้าตอบต่างกัน หน้าจอ "ลืมรหัสผ่าน" จะกลายเป็นเครื่องมือ
   ตรวจว่ารหัสพนักงาน/อีเมลใดมีอยู่ในองค์กร (account enumeration) · ข้อ 9.2 สั่งไว้ชัด
   ว่า "ตอบข้อความเดียวกันเสมอ"

   ใครได้ลิงก์จริงบ้าง
   - ST-NNNN → api.svc_resolve_staff_code คืนเฉพาะบัญชี ACTIVE เท่านั้น (บัญชี INVITED/DISABLED ไม่ได้ลิงก์)
   - อีเมล   → ส่งผ่าน GoTrue ตรง · GoTrue เงียบเมื่อไม่มีบัญชี และบัญชีที่ถูก ban
               (ผลของ disable-staff) ใช้ลิงก์เข้าระบบไม่ได้อยู่แล้ว
               *หมายเหตุ*: เส้นทางอีเมลยังตรวจสถานะ ACTIVE ในฐานข้อมูลไม่ได้
               เพราะไม่มี api.svc_* ที่ค้นบัญชีจากอีเมล — ดู README หัวข้อ "ช่องที่ยังเปิดอยู่"

   อายุลิงก์ 1 ชั่วโมง มาจากค่า OTP ของโปรเจกต์ (3600 วินาที) ไม่ได้ตั้งในโค้ดนี้ */

import { anonClient, confirmUrl, serviceClient } from "../_shared/clients.ts";
import { logFailure } from "../_shared/errors.ts";
import {
  clientIp,
  ok,
  preflight,
  readJsonBody,
  requestId,
  requirePost,
  str,
} from "../_shared/http.ts";
import { identifierHash, recordLoginEvent } from "../_shared/login-events.ts";
import { allowLoginAttempt } from "../_shared/rate-limit.ts";

const FN = "password-reset";
const STAFF_CODE_RE = /^ST-\d{4,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const bad = requirePost(req);
  if (bad) return bad;

  const reqId = requestId(req);
  const ip = clientIp(req);
  const service = serviceClient();

  /* จำกัดอัตราเหมือนการเข้าสู่ระบบ — ถ้าไม่จำกัด ปลายทางนี้กลายเป็นเครื่องมือยิงอีเมลรบกวน
     และใช้ไล่เดาว่าอีเมลไหนมีบัญชีอยู่จากพฤติกรรมของระบบได้ (ข้อ 9.2)
     ถูกจำกัดแล้วยังตอบ ok:true เหมือนเดิม เพื่อไม่ให้ผู้เรียกแยกกรณีออก */
  if (!allowLoginAttempt(ip)) {
    await recordLoginEvent(service, {
      event_type: "PASSWORD_RESET_REQUESTED",
      method: "EMAIL_LINK",
      success: true,
      failure_reason: "RATE_LIMITED",
      ip,
      user_agent: req.headers.get("user-agent"),
      request_id: reqId,
    });
    return ok();
  }

  // ทุกทางออกของฟังก์ชันนี้คือ ok:true — ตัวแปรด้านล่างมีผลแค่ "ส่งอีเมลจริงหรือไม่"
  const finish = async (outcome: string, hash: string | null, userId: string | null = null) => {
    await recordLoginEvent(service, {
      event_type: "PASSWORD_RESET_REQUESTED",
      method: "EMAIL_LINK",
      success: true, // คำขอถูกรับเสมอ · ผลจริงอยู่ใน failure_reason
      failure_reason: outcome,
      user_id: userId,
      identifier_hash: hash,
      ip,
      user_agent: req.headers.get("user-agent"),
      request_id: reqId,
    });
    return ok();
  };

  const body = await readJsonBody(req);
  const loginId = body ? str(body, "login_id") : null;
  if (!loginId) return await finish("MISSING_LOGIN_ID", null);

  const hash = await identifierHash(loginId);
  let email: string | null = null;
  let userId: string | null = null;

  if (STAFF_CODE_RE.test(loginId.toUpperCase())) {
    const resolved = await service
      .schema("api")
      .rpc("svc_resolve_staff_code", { p_staff_code: loginId.toUpperCase() });
    if (resolved.error) {
      logFailure(FN, "svc_resolve_staff_code", reqId, resolved.error);
      return await finish("RESOLVE_ERROR", hash);
    }
    const row = resolved.data as { ok?: boolean; user_id?: string } | null;
    if (!row?.ok || !row.user_id) return await finish("NO_ACTIVE_STAFF", hash);

    userId = row.user_id;
    const target = await service.auth.admin.getUserById(userId);
    if (target.error || !target.data?.user?.email) {
      logFailure(FN, "getUserById", reqId, target.error);
      return await finish("NO_AUTH_USER", hash, userId);
    }
    email = target.data.user.email;
  } else if (EMAIL_RE.test(loginId)) {
    email = loginId.toLowerCase();
  } else {
    return await finish("BAD_LOGIN_ID_FORMAT", hash);
  }

  // GoTrue เป็นผู้ส่งอีเมล และตอบ 200 แม้ไม่มีบัญชีนั้น — เงียบเสมอ
  const sent = await anonClient().auth.resetPasswordForEmail(email, {
    redirectTo: confirmUrl("/set-password"),
  });
  if (sent.error) {
    // ล้มเหลวจากฝั่งเรา (เช่น mailer ล่ม) ก็ยังตอบ ok:true · ร่องรอยอยู่ใน log
    logFailure(FN, "resetPasswordForEmail", reqId, sent.error);
    return await finish("MAILER_ERROR", hash, userId);
  }

  return await finish("SENT", hash, userId);
});
