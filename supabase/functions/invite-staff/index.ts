/* invite-staff — เชิญพนักงานใหม่ (ข้อ 7.3 ข้อ 2 · 19.3 ข้อ 6 · 9.8)

   body    { email, employee_code, display_name, nickname?, phone?, role_code, branch_id? }
   คืนค่า  { ok: true, staff_id, staff_code, invite_url, expires_at }
           { ok: false, message }

   ลำดับที่ห้ามสลับ (สถาปัตยกรรม §3.5)
   1. verify JWT ของผู้เชิญ                         ← ผู้กระทำมาจาก JWT เท่านั้น ไม่รับจาก body
   2. api.can_assign_role(...) ด้วย JWT ของผู้เชิญ   ← ตรวจในบริบทผู้ใช้ ก่อนแตะ service_role
   3. api.svc_prepare_invite(...) ด้วย service_role  ← สร้าง staff_profiles(INVITED) + invitation + assignment
   4. auth.admin.generateLink(type:'invite')         ← ออกลิงก์ หลังฐานข้อมูลสร้างแถวสำเร็จแล้ว
   5. api.svc_link_invited_user(...)                 ← ผูก auth.users ที่เพิ่งเกิด เข้ากับโปรไฟล์ INVITED
      ขาดขั้นนี้ api.activate_self() จะหาโปรไฟล์ไม่เจอ (ค้นด้วย user_id = auth.uid())
      จึงตั้งรหัสผ่านครั้งแรกแล้วบัญชีจะไม่เปลี่ยนเป็น ACTIVE เลย

   Acceptance ที่ข้อ 2–3 เป็นผู้พิสูจน์ (ฐานข้อมูลตัดสิน ไม่ใช่ TypeScript):
   - Manager JP1 เชิญพนักงาน JP1 ได้ · เชิญข้ามสาขาไม่ได้ · สร้าง Role สูงกว่าตัวเองไม่ได้
     ทั้งหมดอยู่ใน app.assign_role_denial ซึ่ง can_assign_role และ svc_prepare_invite เรียกเหมือนกัน */

import { NO_CALLER_MESSAGE, verifyCaller } from "../_shared/caller.ts";
import { callerClient, confirmUrl, serviceClient } from "../_shared/clients.ts";
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

const FN = "invite-staff";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const bad = requirePost(req);
  if (bad) return bad;

  const reqId = requestId(req);

  // 1) ผู้กระทำ = JWT ที่ verify แล้วเท่านั้น (ข้อ 9.8 ข้อ 1 และ 3)
  const caller = await verifyCaller(req);
  if (!caller) return failWithStatus(NO_CALLER_MESSAGE, 401);

  const body = await readJsonBody(req);
  if (!body) return fail("ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");

  const email = (str(body, "email") ?? "").toLowerCase();
  const employeeCode = str(body, "employee_code");
  const displayName = str(body, "display_name");
  const roleCode = str(body, "role_code");
  const branchId = str(body, "branch_id");
  const nickname = str(body, "nickname");
  const phone = str(body, "phone");

  if (!email || !employeeCode || !displayName) {
    return fail("ต้องระบุ อีเมล · ชื่อที่แสดง · รหัสพนักงาน");
  }
  if (!EMAIL_RE.test(email)) {
    return fail("รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจอีเมลแล้วลองใหม่");
  }
  if (!roleCode) {
    return fail("ต้องเลือกบทบาทของผู้ถูกเชิญ");
  }

  const service = serviceClient();

  // 2) ตรวจสิทธิ์ด้วย JWT ของผู้เชิญก่อน — คนละบริบทกับ service_role
  //    ใช้ปิดทางตั้งแต่ต้น · ฐานข้อมูลยังตรวจซ้ำอีกครั้งใน svc_prepare_invite (ห้ามตัดสินสิทธิ์แทนฐานข้อมูล)
  const caller$ = callerClient(caller.jwt);
  const permit = await caller$.schema("api").rpc("can_assign_role", {
    p_target_staff_id: null,
    p_role_code: roleCode,
    p_branch_id: branchId,
  });
  if (permit.error) {
    logFailure(FN, "can_assign_role", reqId, permit.error);
    return fail(safeMessage(permit.error, "ตรวจสอบสิทธิ์การเชิญไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  }
  if (permit.data !== true) {
    return fail("คุณไม่มีสิทธิ์เชิญผู้ใช้ด้วยบทบาทหรือสาขาที่เลือก");
  }

  // 3) สร้างแถวในฐานข้อมูลก่อนออกลิงก์ (19.3 ข้อ 6) · actor มาจาก JWT ไม่ใช่ body
  const prepared = await service.schema("api").rpc("svc_prepare_invite", {
    p: {
      actor_user_id: caller.userId,
      actor_aal: caller.aal,
      email,
      employee_code: employeeCode,
      display_name: displayName,
      nickname,
      phone,
      role_code: roleCode,
      branch_id: branchId,
    },
  });
  if (prepared.error) {
    logFailure(FN, "svc_prepare_invite", reqId, prepared.error);
    return fail(safeMessage(prepared.error, "เชิญผู้ใช้ไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่"));
  }

  const result = prepared.data as {
    ok?: boolean;
    staff_id?: string;
    staff_code?: string;
    invite_expires_at?: string;
  } | null;
  if (!result?.ok || !result.staff_id) {
    logFailure(FN, "svc_prepare_invite_shape", reqId, result);
    return fail(GENERIC_MESSAGE);
  }

  // 4) ออกลิงก์คำเชิญ (อายุลิงก์ = ค่า OTP ของโปรเจกต์ 3600 วินาที · คำเชิญเองอายุ 24 ชม. ตาม invite_expires_at)
  //    generateLink สร้างผู้ใช้ใน Auth ให้ แต่ **ไม่ส่งอีเมลเอง** — ผู้เรียกเป็นคนส่งลิงก์ต่อ
  const link = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: confirmUrl("/set-password") },
  });
  if (link.error || !link.data?.properties?.action_link) {
    logFailure(FN, "generateLink", reqId, link.error);
    // แถว INVITED ถูกสร้างไปแล้วและย้อนกลับจากที่นี่ไม่ได้ (ไม่มี svc_* สำหรับยกเลิก)
    // จึงบอกผู้ใช้ตามจริงว่าบัญชีถูกสร้างแล้ว เพื่อไม่ให้กดเชิญซ้ำจนรหัสพนักงานชนกัน
    return fail(
      "สร้างบัญชีสำเร็จแต่ออกลิงก์คำเชิญไม่สำเร็จ · บัญชีอยู่ในสถานะ “รอรับคำเชิญ” แล้ว กรุณาแจ้งผู้ดูแลระบบให้ออกลิงก์ใหม่ ไม่ต้องกดเชิญซ้ำ",
    );
  }

  // 5) ผูกบัญชี Auth ที่เพิ่งเกิดเข้ากับโปรไฟล์ INVITED
  //    RPC ตรวจเองว่าอีเมลตรงกัน · โปรไฟล์ยัง INVITED · ยังไม่เคยผูก (กันการยึดบัญชี)
  const authUserId = link.data.user?.id ?? null;
  if (!authUserId) {
    logFailure(FN, "generateLink_no_user", reqId, link.data);
    return fail(
      "สร้างบัญชีสำเร็จแต่ผูกบัญชีเข้าสู่ระบบไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบก่อนส่งลิงก์ให้พนักงาน",
    );
  }
  const linked = await service.schema("api").rpc("svc_link_invited_user", {
    p: { staff_id: result.staff_id, user_id: authUserId },
  });
  if (linked.error) {
    logFailure(FN, "svc_link_invited_user", reqId, linked.error);
    return fail(
      safeMessage(
        linked.error,
        "สร้างบัญชีสำเร็จแต่ผูกบัญชีเข้าสู่ระบบไม่สำเร็จ · อย่าส่งลิงก์ให้พนักงาน กรุณาแจ้งผู้ดูแลระบบ",
      ),
    );
  }

  return ok({
    staff_id: result.staff_id,
    staff_code: result.staff_code ?? null,
    invite_url: link.data.properties.action_link,
    expires_at: result.invite_expires_at ?? null,
  });
});
