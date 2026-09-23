"use server";

import { revalidatePath } from "next/cache";

import { getDb, rpc, RpcError } from "@/lib/db";
import { toThaiMessage } from "@/lib/errors";

import type { ActionState } from "./types";

/* การกระทำทั้งหมดของหน้า 13 · ผู้ใช้งานและสิทธิ์

   ทุกตัวส่งต่อให้ฐานข้อมูลตัดสิน — แอปไม่เช็คสิทธิ์เองก่อนแล้วคิดว่าพอ
   (การซ่อน/ปิดปุ่มเป็นเรื่องความสะดวก · การปฏิเสธจริงอยู่ที่ RPC และ RLS)

   งานที่ต้องใช้สิทธิ์ service_role (สร้างบัญชีผู้ใช้ · ban · ลบ MFA factor)
   อยู่ใน Edge Function เท่านั้น แอปเรียกผ่าน functions.invoke ซึ่งแนบเซสชันของผู้เรียกไปด้วย
   ห้ามมีคีย์ service_role ในแอปเด็ดขาด (CANONICAL ข้อ 9.8) */

const USERS = "/users";

/** แปลงข้อผิดพลาดให้เป็นข้อความที่แสดงบนจอได้ — ข้อความดิบของฐานข้อมูลห้ามขึ้นจอ */
function fail(e: unknown): ActionState {
  const thai = toThaiMessage(e);
  return { ok: false, title: thai.title, detail: thai.detail ?? null };
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** เหตุผลที่ผู้ใช้กรอก — RPC ทุกตัวของหน้านี้บังคับให้มี และเก็บลง audit */
function reasonOf(formData: FormData): string {
  return text(formData, "reason");
}

/* ---------------------------------------------------------------- Edge Function */

/** ดึงข้อความภาษาไทยที่ Edge Function ส่งกลับมาในเนื้อ response (supabase-js ไม่อ่านให้) */
async function functionErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.clone().json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim() !== "") return body.message;
    } catch {
      /* เนื้อไม่ใช่ JSON — ใช้ข้อความของ error แทน */
    }
  }
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "เรียกบริการฝั่งเซิร์ฟเวอร์ไม่สำเร็จ";
}

type FnResult = { ok?: boolean; message?: string | null };

/** เรียก Edge Function ตามสัญญาที่ตรึงไว้ — โยน RpcError เพื่อให้ toThaiMessage จัดการต่อทางเดียวกัน */
async function invokeFn<T extends FnResult>(name: string, body: Record<string, unknown>): Promise<T> {
  const db = await getDb();
  const { data, error } = await db.functions.invoke<T>(name, { body });
  if (error) throw new RpcError(`functions.${name}`, await functionErrorMessage(error));
  const result = (data ?? {}) as T;
  if (result.ok === false) {
    throw new RpcError(`functions.${name}`, result.message ?? "ทำรายการไม่สำเร็จ");
  }
  return result;
}

/* ------------------------------------------------------------------- เชิญพนักงาน */

type InviteResult = FnResult & { staff_code?: string; invite_url?: string; expires_at?: string };

/**
 * เชิญพนักงานใหม่ (Edge Function `invite-staff`)
 *
 * บทบาทกับสาขาถูกส่งมาเป็นคู่เดียวกันจากตัวเลือกที่ api.can_assign_role อนุมัติแล้ว
 * เพื่อไม่ให้เกิดคู่ที่ไม่มีอยู่จริง เช่น บทบาทระดับองค์กรที่ติดสาขามาด้วย
 * ต่อให้ผู้ใช้แก้ค่าในฟอร์มเอง app.assign_role_denial ก็ยังปฏิเสธที่ฐานข้อมูลอยู่ดี
 */
export async function inviteStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const email = text(formData, "email").toLowerCase();
    const displayName = text(formData, "display_name");
    const employeeCode = text(formData, "employee_code");
    if (!email || !displayName || !employeeCode) {
      return { ok: false, title: "กรอกข้อมูลให้ครบ", detail: "ต้องระบุ อีเมล · ชื่อที่แสดง · รหัสพนักงาน" };
    }

    const [roleCode = "", branchId = ""] = text(formData, "assign").split("|");

    const result = await invokeFn<InviteResult>("invite-staff", {
      email,
      employee_code: employeeCode,
      display_name: displayName,
      nickname: text(formData, "nickname") || null,
      phone: text(formData, "phone") || null,
      role_code: roleCode || null,
      branch_id: branchId || null,
    });

    revalidatePath(USERS);
    /* generateLink ของ Supabase คืนลิงก์มาให้ แต่ไม่ได้ส่งอีเมลเอง
       ตราบใดที่ยังไม่ได้ตั้งค่าอีเมลขาออก ถ้าไม่แสดงลิงก์ตรงนี้ คำเชิญจะไม่มีทางถึงมือพนักงาน */
    return {
      ok: true,
      title: `สร้างคำเชิญแล้ว${result.staff_code ? ` · ${result.staff_code}` : ""}`,
      detail:
        "คำเชิญมีอายุ 24 ชั่วโมง · บัญชีเป็น “รอเปิดใช้งาน” จนพนักงานตั้งรหัสผ่านครั้งแรก · บทบาทมีผลเมื่อบัญชีเปิดใช้งาน",
      inviteUrl: result.invite_url ?? null,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------------------------------------------- แก้ไขโปรไฟล์ */

/** แก้โปรไฟล์ (api.update_staff) — ผู้จัดการสาขาแก้อีเมลไม่ได้ ฐานข้อมูลเป็นผู้ปฏิเสธ (ข้อ 7.3 ข้อ 5) */
export async function updateStaffProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const staffId = text(formData, "staff_id");
    if (!staffId) return { ok: false, title: "ไม่พบบัญชีที่เลือก" };

    const payload: Record<string, unknown> = {
      display_name: text(formData, "display_name"),
      nickname: text(formData, "nickname"),
      phone: text(formData, "phone"),
      employee_code: text(formData, "employee_code"),
    };
    /* ส่งอีเมลไปเฉพาะเมื่อฟอร์มมีช่องนั้นจริง — api.update_staff ใช้ `p ? 'email'` เป็นตัวตัดสิน
       ถ้าส่งคีย์ว่างไปด้วย ผู้จัดการสาขาจะโดนปฏิเสธทั้งที่ไม่ได้ตั้งใจแก้อีเมล */
    if (formData.has("email")) payload.email = text(formData, "email");

    await rpc("update_staff", { p_staff_id: staffId, p: payload });
    revalidatePath(USERS);
    return { ok: true, title: "บันทึกโปรไฟล์แล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ มอบ/ถอนบทบาท */

/** มอบบทบาท (api.assign_role) — เพดานการมอบตัดสินที่ app.assign_role_denial */
export async function assignRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const staffId = text(formData, "staff_id");
    const [roleCode = "", branchId = ""] = text(formData, "assign").split("|");
    const reason = reasonOf(formData);
    if (!staffId || !roleCode) return { ok: false, title: "เลือกบทบาทก่อน" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการมอบบทบาท" };

    await rpc("assign_role", {
      p_target_staff_id: staffId,
      p_role_code: roleCode,
      p_branch_id: branchId || null,
      p_reason: reason,
    });
    revalidatePath(USERS);
    return { ok: true, title: "มอบบทบาทแล้ว", detail: "ระบบบันทึกประวัติ ROLE_GRANTED พร้อมเหตุผลไว้แล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/** ถอนบทบาท (api.revoke_role) — ระบบตั้งวันสิ้นสุดเป็นตอนนี้ ไม่ลบแถว (ข้อ 7.1) */
export async function revokeRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const assignmentId = text(formData, "assignment_id");
    const reason = reasonOf(formData);
    if (!assignmentId) return { ok: false, title: "ไม่พบบทบาทที่เลือก" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการถอนบทบาท" };

    await rpc("revoke_role", { p_assignment_id: assignmentId, p_reason: reason });
    revalidatePath(USERS);
    return { ok: true, title: "ถอนบทบาทแล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------------------------------------------- ปิดใช้งาน */

/**
 * ปิดใช้งานบัญชี — เรียก Edge Function `disable-staff` ตัวเดียวจบ
 *
 * ฟังก์ชันทำตามลำดับที่ถูกต้องให้เอง:
 *   หา user_id ของเป้าหมาย → `api.disable_staff` ด้วย **JWT ของผู้กด** (ด่านตรวจสิทธิ์จริง)
 *   → ban บัญชีใน Auth + เพิกถอนเซสชัน → `api.svc_finalize_disable`
 *
 * **ห้ามให้แอปเรียก `api.disable_staff` เองก่อน** — เคยทำแบบนั้นแล้วพบว่า
 * พอสถานะกลายเป็น DISABLED ฟังก์ชันจะหา user_id ไม่เจอ (svc_resolve_staff_code คืนเฉพาะบัญชี ACTIVE)
 * การ ban จึงถูกข้ามเงียบ ๆ และระบบรายงานว่าสำเร็จ ทั้งที่เซสชันเดิมยังใช้งานต่อได้
 */
export async function disableStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const staffId = text(formData, "staff_id");
  const reason = reasonOf(formData);
  if (!staffId) return { ok: false, title: "ไม่พบบัญชีที่เลือก" };
  if (!reason) return { ok: false, title: "ต้องระบุเหตุผลการปิดใช้งาน" };
  if (formData.get("ack") !== "on") {
    return { ok: false, title: "ยืนยันว่าเข้าใจผลกระทบก่อน", detail: "ติ๊กช่อง “ฉันเข้าใจผลกระทบ” แล้วกดอีกครั้ง" };
  }

  try {
    await invokeFn("disable-staff", { staff_id: staffId, reason });
  } catch (e) {
    revalidatePath(USERS);
    return fail(e);
  }

  revalidatePath(USERS);
  return {
    ok: true,
    title: "ปิดใช้งานบัญชีแล้ว",
    detail: "บัญชีนี้เข้าสู่ระบบไม่ได้ทันทีและถูกออกจากทุกอุปกรณ์ · บทบาททั้งหมดสิ้นสุดแล้ว",
  };
}

/** รีเซ็ตการยืนยันตัวตนสองขั้นตอน (Edge Function `reset-mfa`) — ผู้ใช้ต้องลงทะเบียน TOTP ใหม่ */
export async function resetMfa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const staffId = text(formData, "staff_id");
    const reason = reasonOf(formData);
    if (!staffId) return { ok: false, title: "ไม่พบบัญชีที่เลือก" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการรีเซ็ต MFA" };

    await invokeFn("reset-mfa", { staff_id: staffId, reason });
    revalidatePath(USERS);
    return {
      ok: true,
      title: "รีเซ็ตการยืนยันตัวตนสองขั้นตอนแล้ว",
      detail: "ผู้ใช้ต้องลงทะเบียน TOTP ใหม่ในการเข้าสู่ระบบครั้งถัดไป · ระบบบันทึกประวัติ MFA_RESET ไว้แล้ว",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------- คำขอมอบบทบาทสูง */

/** ยื่นคำขอบทบาทสูง (api.request_role_grant) — ผู้บริหารเป็นผู้อนุมัติ (ข้อ 7.2) */
export async function requestRoleGrant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const staffId = text(formData, "staff_id");
    const roleCode = text(formData, "role_code");
    const requestType = text(formData, "request_type") === "REVOKE" ? "REVOKE" : "GRANT";
    const reason = reasonOf(formData);
    if (!staffId || !roleCode) return { ok: false, title: "เลือกผู้รับและบทบาทก่อน" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของคำขอ" };

    const result = await rpc<{ ok: boolean; request_no?: string }>("request_role_grant", {
      p_target_staff_id: staffId,
      p_role_code: roleCode,
      p_request_type: requestType,
      p_reason: reason,
    });
    revalidatePath(USERS);
    return {
      ok: true,
      title: `ยื่นคำขอแล้ว${result?.request_no ? ` · ${result.request_no}` : ""}`,
      detail: "รอผู้บริหารอนุมัติ · ผู้ตัดสินต้องไม่ใช่ผู้ยื่นหรือผู้รับ",
    };
  } catch (e) {
    return fail(e);
  }
}

/** ตัดสินคำขอ (api.decide_role_grant) — ปุ่มที่กดบอกเจตนามาเอง ไม่ใช้ state ฝั่ง client */
export async function decideRoleGrant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const requestId = text(formData, "request_id");
    const approve = text(formData, "decision") === "APPROVE";
    if (!requestId) return { ok: false, title: "ไม่พบคำขอนี้" };

    await rpc("decide_role_grant", {
      p_request_id: requestId,
      p_approve: approve,
      p_note: text(formData, "note") || null,
    });
    revalidatePath(USERS);
    return { ok: true, title: approve ? "อนุมัติคำขอแล้ว" : "ไม่อนุมัติคำขอแล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------------ อุปกรณ์ */

/**
 * ลงทะเบียนอุปกรณ์ counter (api.register_device)
 *
 * อุปกรณ์ที่ทำเครื่องหมายว่าใช้ร่วมกัน จะถูกล็อกหน้าจอเมื่อไม่มีการใช้งานตามเวลาที่ตั้งไว้
 * และต้องยืนยันตัวตนใหม่ก่อนใช้งานต่อ · หน้าเข้าสู่ระบบซ่อน “จดจำฉันไว้” บนเครื่องแบบนี้ (ข้อ 9.2)
 */
export async function registerDevice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const deviceId = text(formData, "device_id");
    const branchId = text(formData, "branch_id");
    if (!deviceId) return { ok: false, title: "ต้องระบุรหัสอุปกรณ์" };
    if (!branchId) return { ok: false, title: "เลือกสาขาของอุปกรณ์ก่อน" };

    const result = await rpc<{ ok: boolean; device_id?: string; is_shared_counter?: boolean }>("register_device", {
      p_device_id: deviceId,
      p_branch_id: branchId,
      p_is_shared_counter: formData.get("is_shared_counter") === "on",
    });
    revalidatePath(USERS);
    return {
      ok: true,
      title: `ลงทะเบียนอุปกรณ์ ${result?.device_id ?? deviceId} แล้ว`,
      detail: result?.is_shared_counter
        ? "เครื่องนี้เป็นอุปกรณ์ counter ที่ใช้ร่วมกัน · จะล็อกหน้าจอเมื่อไม่มีการใช้งานและต้องยืนยันตัวตนใหม่"
        : "เครื่องนี้ไม่ใช่อุปกรณ์ที่ใช้ร่วมกัน",
    };
  } catch (e) {
    return fail(e);
  }
}
