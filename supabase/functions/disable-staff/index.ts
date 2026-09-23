/* disable-staff — ปิดใช้งานบัญชีพนักงาน (ข้อ 7.3 ข้อ 4–5 · 9.8)

   body    { staff_id, reason }
   คืนค่า  { ok: true, staff_id, staff_code } หรือ { ok: false, message }

   ลำดับที่ห้ามสลับ (สถาปัตยกรรม §3.5)
   0. verify JWT ของผู้กระทำ
   1. หา staff_code ของเป้าหมายด้วย JWT ผู้กระทำ (api.list_staff — เห็นเฉพาะคนในขอบเขตตน)
      แล้วแปลงเป็น user_id ด้วย api.svc_resolve_staff_code **ก่อน** ปิดบัญชี
      เพราะ RPC ตัวนั้นคืนเฉพาะบัญชี ACTIVE — ถ้าปิดก่อนจะหา user_id ไม่เจออีกเลย
   2. api.disable_staff(...) ด้วย **JWT ของผู้กระทำ** ← ด่านตรวจสิทธิ์จริง + งานข้อมูลทั้งหมด
      (โอน opportunity ให้ผู้จัดการสาขา · lead/task → owner ว่าง · ถอน assignment · status = DISABLED)
   3. ban บัญชีใน Auth ด้วย service_role
   4. api.svc_finalize_disable(...) ← ปิดคำเชิญที่ค้าง + เขียน audit STAFF_DISABLED
      RPC ตัวนี้ยืนยันเองว่า status ต้องเป็น DISABLED แล้วเท่านั้น จึงข้ามขั้น 2 ไม่ได้

   Acceptance "Disable แล้วเข้าไม่ได้ทันที": ban ทำให้ GoTrue ปฏิเสธทั้ง refresh token
   และ /auth/v1/user → proxy.ts ของ Next.js ที่เรียก getUser() ทุก request เด้งออกทันที
   ส่วน access token ใบที่ถืออยู่มีอายุ 15 นาที แต่ RLS ฝั่งฐานข้อมูลตัดสิทธิ์ทุกอย่างทิ้ง
   ไปแล้วตั้งแต่ขั้น 2 (assignment ถูกถอน + status ไม่ใช่ ACTIVE) จึงเข้าถึงข้อมูลไม่ได้

   เรียกซ้ำได้: ถ้าแอปเรียก api.disable_staff เองไปแล้ว ขั้น 2 จะไม่มีงานเหลือให้ทำ
   (ไม่มีรายการเปิดค้าง · status เป็น DISABLED อยู่แล้ว) และขั้น 3–4 เดินต่อได้ตามปกติ */

import { NO_CALLER_MESSAGE, verifyCaller } from "../_shared/caller.ts";
import { callerClient, serviceClient } from "../_shared/clients.ts";
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

const FN = "disable-staff";

/** ban ยาว ๆ แทน "ตลอดไป" — GoTrue รับเป็นช่วงเวลา (100 ปี) · ยกเลิกได้ด้วย 'none' */
const BAN_FOREVER = "876000h";

type StaffRow = { staff_id?: string; staff_code?: string; status?: string };

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
  if (!staffId) return fail("ต้องระบุบัญชีที่ต้องการปิดใช้งาน");
  if (!reason) return fail("ต้องระบุเหตุผลการปิดใช้งาน");

  const caller$ = callerClient(caller.jwt);
  const service = serviceClient();

  // 1) staff_code ของเป้าหมาย — อ่านด้วย JWT ผู้กระทำ จึงเห็นเฉพาะบัญชีในขอบเขตของตน
  const listed = await caller$.schema("api").rpc("list_staff", { p: {} });
  if (listed.error) {
    logFailure(FN, "list_staff", reqId, listed.error);
    return fail(safeMessage(listed.error, "อ่านข้อมูลบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  }
  const rows = ((listed.data as { staff?: StaffRow[] } | null)?.staff ?? []) as StaffRow[];
  const target = rows.find((r) => r.staff_id === staffId);
  if (!target?.staff_code) {
    // ไม่บอกว่า "ไม่มีบัญชีนี้" กับ "ไม่มีสิทธิ์เห็นบัญชีนี้" ต่างกัน
    return fail("ไม่พบบัญชีนี้ในขอบเขตที่คุณดูแล");
  }

  // user_id ต้องอ่านตอนบัญชียังเป็น ACTIVE · บัญชี INVITED ยังไม่มี user_id → ข้ามขั้น ban ได้
  let targetUserId: string | null = null;
  const resolved = await service
    .schema("api")
    .rpc("svc_resolve_staff_code", { p_staff_code: target.staff_code });
  if (resolved.error) {
    logFailure(FN, "svc_resolve_staff_code", reqId, resolved.error);
  } else {
    const row = resolved.data as { ok?: boolean; user_id?: string } | null;
    if (row?.ok && row.user_id) targetUserId = row.user_id;
  }

  // 2) ด่านตรวจสิทธิ์จริง + งานข้อมูลทั้งหมด ในบริบทของผู้กระทำ
  const disabled = await caller$.schema("api").rpc("disable_staff", {
    p_staff_id: staffId,
    p_reason: reason,
  });
  if (disabled.error) {
    logFailure(FN, "disable_staff", reqId, disabled.error);
    return fail(safeMessage(disabled.error, "ปิดใช้งานบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  }

  // 3) ban ใน Auth — ทำหลังฐานข้อมูลยืนยันว่าผู้กระทำมีสิทธิ์จริงเท่านั้น
  if (targetUserId) {
    const banned = await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: BAN_FOREVER,
    });
    if (banned.error) {
      logFailure(FN, "banUser", reqId, banned.error);
      // ฐานข้อมูลปิดสิทธิ์ไปแล้ว แต่ Auth ยังออก token ให้ได้ → ต้องให้คนแก้ต่อ ห้ามเงียบ
      return fail(
        "ปิดสิทธิ์ในระบบสำเร็จ แต่ระงับบัญชีเข้าสู่ระบบไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบให้ระงับบัญชีนี้ทันที",
      );
    }
  }

  // 4) ปิดคำเชิญที่ค้าง + เขียน audit STAFF_DISABLED ด้วย actor จาก JWT
  const finalized = await service.schema("api").rpc("svc_finalize_disable", {
    p: {
      actor_user_id: caller.userId,
      actor_aal: caller.aal,
      staff_id: staffId,
      reason,
    },
  });
  if (finalized.error) {
    logFailure(FN, "svc_finalize_disable", reqId, finalized.error);
    return fail(
      "ปิดใช้งานบัญชีสำเร็จแล้ว แต่บันทึกประวัติไม่ครบ กรุณาแจ้งผู้ดูแลระบบเพื่อตรวจบันทึกการตรวจสอบ",
    );
  }

  const result = finalized.data as { ok?: boolean; staff_code?: string } | null;
  if (!result?.ok) {
    logFailure(FN, "svc_finalize_disable_shape", reqId, result);
    return fail(GENERIC_MESSAGE);
  }

  return ok({ staff_id: staffId, staff_code: result.staff_code ?? target.staff_code });
});
