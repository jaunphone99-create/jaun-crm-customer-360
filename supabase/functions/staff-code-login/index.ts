/* staff-code-login — เข้าสู่ระบบด้วย ST-NNNN + รหัสผ่าน (ข้อ 9.2 · 9.8)

   body    { staff_code, password }
   คืนค่า  { ok: true, session: { access_token, refresh_token, expires_in, expires_at, token_type } }
           { ok: false, message }   ← ข้อความ "เดียวกันเสมอ" ทุกกรณี

   กติกาที่ผิดแล้วเสียหายจริง
   - **ห้ามคืนอีเมล** และห้ามบอกว่ามีบัญชีนั้นอยู่จริงหรือไม่ (ข้อ 9.2)
     อีเมลถูกใช้ภายในฟังก์ชันเพื่อทำ password grant เท่านั้น และไม่เคยอยู่ในคำตอบ
     ด้วยเหตุนี้เราจึงคืนเฉพาะ token ของ session ไม่คืน object `user` ของ Supabase
     (ใน `user` มีอีเมลติดมาด้วย)
   - ไม่มีบัญชี · รหัสผิด · บัญชีถูกปิด · เกินเพดานต่อ IP → ข้อความเดียวกันหมด
   - ไม่มีผู้เรียกที่ยืนยันตัวตน (ผู้ใช้ยังไม่ล็อกอิน) จึงไม่มีขั้น verify JWT ของผู้ใช้
     ด่านเดียวที่มีคือ service_role + api.svc_resolve_staff_code ซึ่งคืนเฉพาะบัญชี ACTIVE

   หมายเหตุเรื่อง session: CANONICAL ข้อ 9.2 ระบุว่าฟังก์ชันนี้ "ทำ password grant ฝั่ง server
   คืน session เท่านั้น ไม่คืนอีเมล" · Server Action ฝั่ง Next.js เอา token ที่ได้ไป
   setSession() แล้วเขียนเป็น cookie HttpOnly ต่อ (ไม่มี Supabase client ฝั่งเบราว์เซอร์) */

import { anonClient, serviceClient } from "../_shared/clients.ts";
import { logFailure } from "../_shared/errors.ts";
import {
  clientIp,
  fail,
  ok,
  preflight,
  readJsonBody,
  requestId,
  requirePost,
  str,
} from "../_shared/http.ts";
import { allowLoginAttempt } from "../_shared/rate-limit.ts";
import { identifierHash, recordLoginEvent } from "../_shared/login-events.ts";

const FN = "staff-code-login";

/** ข้อความเดียวที่ผู้ใช้จะได้เห็นเมื่อเข้าสู่ระบบไม่สำเร็จ ไม่ว่าสาเหตุจะเป็นอะไร (ข้อ 9.2) */
const SAME_MESSAGE = "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง";

const STAFF_CODE_RE = /^ST-\d{4,}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const bad = requirePost(req);
  if (bad) return bad;

  const reqId = requestId(req);
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");
  const service = serviceClient();

  const body = await readJsonBody(req);
  const rawCode = body ? str(body, "staff_code") : null;
  const password = body ? str(body, "password") : null;
  const staffCode = (rawCode ?? "").toUpperCase();
  const idHash = rawCode ? await identifierHash(staffCode) : null;

  /** ปฏิเสธด้วยข้อความเดียวกันเสมอ + บันทึกสาเหตุจริงไว้ฝั่งเซิร์ฟเวอร์อย่างเดียว */
  const deny = async (reason: string, userId: string | null = null) => {
    await recordLoginEvent(service, {
      event_type: reason === "RATE_LIMITED" ? "LOGIN_LOCKOUT" : "LOGIN",
      method: "STAFF_CODE",
      success: false,
      failure_reason: reason,
      user_id: userId,
      identifier_hash: idHash,
      ip,
      user_agent: userAgent,
      request_id: reqId,
    });
    return fail(SAME_MESSAGE);
  };

  // เพดานต่อ IP (best-effort · ดู _shared/rate-limit.ts) — นับก่อนแตะฐานข้อมูล
  if (!allowLoginAttempt(ip)) return await deny("RATE_LIMITED");

  if (!staffCode || !password) return await deny("MISSING_FIELDS");
  if (!STAFF_CODE_RE.test(staffCode)) return await deny("BAD_STAFF_CODE_FORMAT");

  // ST-NNNN → user_id · RPC คืน ok:false เมื่อไม่พบ / ไม่มี user_id / สถานะไม่ใช่ ACTIVE
  const resolved = await service
    .schema("api")
    .rpc("svc_resolve_staff_code", { p_staff_code: staffCode });
  if (resolved.error) {
    logFailure(FN, "svc_resolve_staff_code", reqId, resolved.error);
    return await deny("RESOLVE_ERROR");
  }
  const row = resolved.data as { ok?: boolean; user_id?: string } | null;
  if (!row?.ok || !row.user_id) return await deny("NO_ACTIVE_STAFF");

  // อ่านอีเมลด้วย admin API — ใช้ภายในฟังก์ชันเท่านั้น ห้ามหลุดออกไปกับคำตอบ
  const target = await service.auth.admin.getUserById(row.user_id);
  const email = target.data?.user?.email;
  if (target.error || !email) {
    logFailure(FN, "getUserById", reqId, target.error);
    return await deny("NO_AUTH_USER", row.user_id);
  }

  // password grant ฝั่งเซิร์ฟเวอร์ด้วย anon key — GoTrue เป็นผู้ตรวจรหัสผ่านและสถานะ ban
  const signIn = await anonClient().auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data?.session) {
    // ไม่แยกแยะ "รหัสผิด" กับ "บัญชีถูก ban" ในคำตอบ — แยกเฉพาะใน log
    return await deny(signIn.error?.code ?? "SIGN_IN_FAILED", row.user_id);
  }

  const s = signIn.data.session;
  await recordLoginEvent(service, {
    event_type: "LOGIN",
    method: "STAFF_CODE",
    success: true,
    user_id: row.user_id,
    identifier_hash: idHash,
    aal: "aal1", // password grant ให้ aal1 เสมอ · step-up TOTP เกิดที่ /login/mfa
    ip,
    user_agent: userAgent,
    request_id: reqId,
  });

  // คืนเฉพาะ token — ไม่มี s.user จึงไม่มีอีเมลติดไปกับคำตอบ (ข้อ 9.2)
  return ok({
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    },
  });
});
