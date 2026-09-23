"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { getAccess, homePath } from "@/lib/access";
import { getDb, rpc, RpcError } from "@/lib/db";
import { DB_DRIVER, DEV_API_URL } from "@/lib/env";
import { toThaiMessage } from "@/lib/errors";
import { clearDevSession, readDevSession, writeDevSession } from "@/lib/session";

import { isInvited, isUsable, nextPathAfterSignIn } from "./rules";

/* การกระทำทั้งหมดของ Identity & Access ฝั่งหน้าเข้าสู่ระบบ

   ทุกอย่างอยู่ฝั่ง server เพราะเซสชันเป็น cookie HttpOnly — เบราว์เซอร์ไม่มี Supabase client
   ที่ถือเซสชันได้ ดังนั้น MFA enroll/challenge/verify และ functions.invoke ต้องเรียกที่นี่เท่านั้น
   (architecture §6.3 · CANONICAL ข้อ 9.8)

   งานที่ต้องใช้สิทธิ์ service_role (แปลง ST-NNNN เป็นบัญชี · ออกลิงก์คำเชิญ/รีเซ็ต)
   อยู่ใน Edge Function เสมอ — ในแอปนี้ไม่มีคีย์ service_role แม้แต่ที่เดียว */

/* ข้อความเดียวกันทุกกรณีที่เข้าไม่ได้ (CANONICAL ข้อ 9.2)
   ไม่มีบัญชี · รหัสผ่านผิด · บัญชีถูกปิด · บัญชียังไม่เปิดใช้งาน → ตอบเหมือนกันหมด
   เพราะข้อความที่ต่างกันคือการยืนยันให้คนนอกรู้ว่าอีเมล/รหัสพนักงานนี้มีอยู่จริง */
const SAME_ANSWER = "อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง";

/** รหัสผ่านอย่างน้อย 12 ตัวอักษร (CANONICAL ข้อ 9.2) — Supabase บังคับซ้ำอีกชั้น */
const MIN_PASSWORD = 12;

const STAFF_CODE = /^ST-\d{4,}$/i;

export type LoginState = { error: string | null };
export type FormState = { ok: boolean; message: string | null };

/* ---- เข้าสู่ระบบโหมดจริง: อีเมล หรือ ST-NNNN + รหัสผ่าน --------------------- */

/** ผลลัพธ์ของ Edge Function `staff-code-login` — คืน "session เท่านั้น" **ไม่มีอีเมล**
    (api-spec.md §Edge Functions · CANONICAL ข้อ 9.2)
    รับได้ทั้งแบบห่อ { ok, session } และแบบคืน session มาตรง ๆ */
type SessionTokens = { access_token?: string | null; refresh_token?: string | null };
type StaffCodeLogin = SessionTokens & { ok?: boolean; session?: SessionTokens | null };

function sessionOf(data: StaffCodeLogin | null): { access_token: string; refresh_token: string } | null {
  const tokens = data?.session ?? data;
  if (!tokens?.access_token || !tokens.refresh_token) return null;
  return { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
}

export async function passwordSignIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (DB_DRIVER !== "supabase") return { error: "ยังไม่ได้ตั้งค่าการต่อ Supabase" };

  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) return { error: SAME_ANSWER };

  const supabase = await getDb();

  if (STAFF_CODE.test(loginId)) {
    /* ST-NNNN แปลงเป็นบัญชีผู้ใช้ได้ด้วยสิทธิ์ service_role เท่านั้น
       จึงส่งทั้งรหัสพนักงานและรหัสผ่านให้ Edge Function ทำ password grant ฝั่งเซิร์ฟเวอร์
       แล้วคืน session กลับมาให้แอปตั้งเป็น cookie (api.svc_resolve_staff_code · ข้อ 9.2) */
    let result: StaffCodeLogin | null = null;
    try {
      const { data, error } = await supabase.functions.invoke<StaffCodeLogin>("staff-code-login", {
        body: { staff_code: loginId.toUpperCase(), password },
      });
      if (error) return { error: SAME_ANSWER };
      result = data;
    } catch {
      return { error: SAME_ANSWER };
    }

    if (result?.ok === false) return { error: SAME_ANSWER };

    const session = sessionOf(result);
    if (!session) return { error: SAME_ANSWER };

    const { error: setError } = await supabase.auth.setSession(session);
    if (setError) return { error: SAME_ANSWER };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email: loginId, password });
    if (error) return { error: SAME_ANSWER };
  }

  const access = await getAccess();
  if (!access) return { error: SAME_ANSWER };

  /* บัญชีที่ไม่ใช่ ACTIVE เข้าใช้งานไม่ได้ — ยกเว้น INVITED ที่ต้องไปตั้งรหัสผ่าน/เปิดใช้งานก่อน
     ที่เหลือ (SUSPENDED · DISABLED) ออกจากระบบทันทีแล้วตอบข้อความเดียวกับทุกกรณี */
  if (!isUsable(access) && !isInvited(access)) {
    await supabase.auth.signOut();
    return { error: SAME_ANSWER };
  }

  redirect(nextPathAfterSignIn(access));
}

/* ---- เข้าสู่ระบบโหมดพัฒนา: เลือกว่าจะเป็นใคร ไม่มีรหัสผ่าน ------------------ */

export async function devSignIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (DB_DRIVER !== "dev") return { error: "โหมดนี้ใช้ได้เฉพาะตอนพัฒนา" };

  /* รับได้ทั้งปุ่มเลือกผู้ใช้และช่องพิมพ์รหัสพนักงาน — ให้ทดสอบ ST-NNNN ได้บนโหมดพัฒนา */
  const typed = String(formData.get("staffCodeTyped") ?? "").trim();
  const staffCode = (typed || String(formData.get("staffCode") ?? "")).trim().toUpperCase();
  const aal = String(formData.get("aal") ?? "aal2") === "aal1" ? "aal1" : "aal2";
  if (!STAFF_CODE.test(staffCode)) return { error: "กรุณาเลือกผู้ใช้ หรือกรอกรหัสพนักงานเป็น ST-NNNN" };

  await writeDevSession({ staffCode, aal });

  const access = await getAccess().catch(() => null);

  /* โหมดพัฒนาก็ต้องสะท้อนกติกาจริง: บัญชีที่ไม่ใช่ ACTIVE เข้าไม่ได้
     (INVITED ยังไปต่อได้ที่หน้าตั้งรหัสผ่าน เหมือนคนที่กดลิงก์คำเชิญ) */
  if (!access || (!isUsable(access) && !isInvited(access))) {
    await clearDevSession();
    return { error: SAME_ANSWER };
  }

  /* บทบาทที่ requires_mfa + aal1 → ไป /login/mfa ไม่ใช่เข้าใช้งานได้เลย
     (nextPathAfterSignIn เป็นผู้ตัดสินจาก api.get_my_access() ตัวจริง) */
  redirect(nextPathAfterSignIn(access));
}

/* ---- ยืนยัน MFA (TOTP 6 หลัก) ---------------------------------------------- */

function readOtp(formData: FormData): string {
  return String(formData.get("code") ?? "").replace(/\D/g, "");
}

export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = readOtp(formData);
  if (code.length !== 6) return { ok: false, message: "กรุณากรอกรหัสตัวเลข 6 หลัก" };

  let next: Route = "/dashboard";

  if (DB_DRIVER === "dev") {
    /* ฐานข้อมูลทดลองไม่มีที่เก็บ factor ของ TOTP จริง — ที่นี่จึงยืนยันแค่รูปแบบรหัส
       แล้วยกเซสชันเป็น aal2 เพื่อพิสูจน์ "ทางเดิน" ว่าบทบาทที่บังคับ MFA ข้ามขั้นนี้ไม่ได้
       สิทธิ์ที่ได้กลับมาเป็นของจริงทั้งหมด เพราะ api.get_my_access() อ่าน aal จาก token */
    const session = await readDevSession();
    if (!session) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
    await writeDevSession({ staffCode: session.staffCode, aal: "aal2" });
    const access = await getAccess().catch(() => null);
    if (!access) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
    next = isInvited(access) ? "/set-password" : homePath(access);
  } else {
    const supabase = await getDb();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return { ok: false, message: "ตรวจสอบอุปกรณ์ยืนยันตัวตนไม่ได้ กรุณาลองใหม่" };

    const totp = factors?.totp?.[0];
    if (!totp) {
      /* ยังไม่มี factor ที่ยืนยันแล้ว → ต้องลงทะเบียนก่อนใช้งาน (ข้อ 9.2) */
      redirect("/login/mfa/enroll");
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (challengeError || !challenge) return { ok: false, message: "ขอรหัสยืนยันไม่สำเร็จ กรุณาลองใหม่" };

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) return { ok: false, message: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ กรุณากรอกรหัสล่าสุดจากแอป Authenticator" };

    const access = await getAccess();
    if (!access) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
    next = isInvited(access) ? "/set-password" : homePath(access);
  }

  redirect(next);
}

/* ---- ลงทะเบียน TOTP ครั้งแรก ------------------------------------------------ */

export type EnrollState = {
  ok: boolean;
  message: string | null;
  /** ข้อมูลที่แสดงครั้งเดียว ไม่เก็บลงที่ไหนทั้งสิ้น */
  factorId?: string;
  qrCode?: string;
  secret?: string;
};

export async function startTotpEnroll(_prev: EnrollState, _formData: FormData): Promise<EnrollState> {
  if (DB_DRIVER !== "supabase") {
    return { ok: false, message: "โหมดพัฒนายังไม่มีที่เก็บ TOTP จริง — ลงทะเบียนได้เมื่อต่อ Supabase แล้ว" };
  }

  const access = await getAccess();
  if (!access) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };

  const supabase = await getDb();

  /* ถ้าเคยกดลงทะเบียนแล้วไม่จบ จะเหลือ factor ค้างที่ยังไม่ยืนยัน และ Supabase จะไม่ยอมให้
     ลงทะเบียนชื่อเดิมซ้ำ — เก็บกวาดของค้างก่อน ผู้ใช้จะได้ไม่ติดตายโดยไม่รู้สาเหตุ */
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `JAUN CRM · ${access.staff.staff_code}`,
    issuer: "JAUN CRM",
  });
  if (error || !data) return { ok: false, message: "เริ่มลงทะเบียนไม่สำเร็จ กรุณาลองใหม่" };

  return { ok: true, message: null, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotpEnroll(_prev: FormState, formData: FormData): Promise<FormState> {
  if (DB_DRIVER !== "supabase") return { ok: false, message: "โหมดพัฒนายังไม่มีที่เก็บ TOTP จริง" };

  const factorId = String(formData.get("factorId") ?? "");
  const code = readOtp(formData);
  if (!factorId) return { ok: false, message: "เริ่มลงทะเบียนใหม่อีกครั้ง" };
  if (code.length !== 6) return { ok: false, message: "กรุณากรอกรหัสตัวเลข 6 หลัก" };

  const supabase = await getDb();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ กรุณากรอกรหัสล่าสุดจากแอป Authenticator" };

  const access = await getAccess();
  if (!access) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };

  /* คนที่เพิ่งรับคำเชิญและบทบาทบังคับ MFA จะเปิดใช้งานบัญชีได้ก็ต่อเมื่อมี factor แล้ว
     (api.activate_self ตรวจเงื่อนไขนี้เอง — ที่นี่แค่เรียกให้ถูกจังหวะ) */
  if (isInvited(access)) {
    const activation = await activateSelf();
    if (!activation.ok) return activation;
  }

  redirect(homePath(access));
}

/* ---- ตั้งรหัสผ่านครั้งแรก / รับคำเชิญ · ตั้งรหัสผ่านใหม่ --------------------- */

/** เปิดใช้งานบัญชีของตนเองหลังตั้งรหัสผ่าน (api.activate_self · ข้อ 7.3) */
async function activateSelf(): Promise<FormState> {
  try {
    await rpc<{ ok: boolean }>("activate_self");
    return { ok: true, message: null };
  } catch (e) {
    if (e instanceof RpcError && e.message.includes("MFA")) {
      /* บทบาทนี้ต้องมี TOTP ก่อนจึงจะเปิดใช้งานได้ — พาไปลงทะเบียนต่อทันที */
      redirect("/login/mfa/enroll");
    }
    const thai = toThaiMessage(e);
    return { ok: false, message: thai.detail ? `${thai.title} — ${thai.detail}` : thai.title };
  }
}

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = String(formData.get("tokenHash") ?? "").trim();
  const tokenType = String(formData.get("tokenType") ?? "invite").trim();

  if (DB_DRIVER === "dev") {
    /* โหมดพัฒนาไม่มี Supabase Auth จึงเก็บรหัสผ่านไม่ได้จริง
       แต่ขั้นตอน "เปิดใช้งานบัญชีด้วยตนเอง" เป็น RPC ตัวจริง ทดสอบได้ครบ */
    const result = await activateSelf();
    if (!result.ok) return result;
    const access = await getAccess().catch(() => null);
    redirect(access ? homePath(access) : "/login");
  }

  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` };
  }
  if (password !== confirm) return { ok: false, message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };

  const supabase = await getDb();

  /* มาจากลิงก์ในอีเมล (คำเชิญหรือรีเซ็ตรหัสผ่าน) → แลก token เป็นเซสชันก่อน
     ทำที่นี่เพราะ Server Action เขียน cookie ได้ ส่วน Server Component เขียนไม่ได้ */
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: tokenType === "recovery" ? "recovery" : "invite",
      token_hash: tokenHash,
    });
    if (error) {
      return {
        ok: false,
        message: "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่จากผู้จัดการสาขาหรือผู้ดูแลข้อมูลธุรกิจ",
      };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    /* Supabase ปฏิเสธเอง เช่น รหัสผ่านอยู่ในรายการที่รั่วไหล — บอกให้เปลี่ยน ไม่โทษผู้ใช้ */
    return { ok: false, message: "ตั้งรหัสผ่านนี้ไม่ได้ กรุณาเลือกรหัสผ่านอื่นที่ยาวและไม่เคยใช้ที่อื่น" };
  }

  const access = await getAccess();
  if (!access) return { ok: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };

  if (isInvited(access)) {
    const result = await activateSelf();
    if (!result.ok) return result;
  }

  const after = await getAccess();
  redirect(after ? nextPathAfterSignIn(after) : "/login");
}

/* ---- ลืมรหัสผ่าน ------------------------------------------------------------ */

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = String(formData.get("loginId") ?? "").trim();

  /* ตอบข้อความเดียวกันเสมอ ไม่ว่าจะมีบัญชีนั้นหรือไม่ หรือ Edge Function จะล้มหรือไม่ (ข้อ 9.2)
     ถ้าตอบต่างกันแม้แต่กรณีเดียว หน้านี้จะกลายเป็นเครื่องมือตรวจว่าอีเมลไหนมีอยู่ในระบบ */
  if (loginId) {
    try {
      const supabase = await getDb();
      await supabase.functions.invoke("password-reset", { body: { login_id: loginId } });
    } catch {
      /* เงียบไว้โดยตั้งใจ — ดูเหตุผลด้านบน */
    }
  }

  return { ok: true, message: null };
}

/* ---- ออกจากระบบ ------------------------------------------------------------- */

export async function signOut(): Promise<void> {
  if (DB_DRIVER === "dev") {
    await clearDevSession();
  } else {
    const supabase = await getDb();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

/* ---- รายชื่อผู้ใช้ตัวอย่างสำหรับหน้าเข้าสู่ระบบโหมดพัฒนา -------------------- */

export type DevStaff = {
  staff_code: string;
  display_name: string;
  nickname: string | null;
  status: string;
  roles: string;
  branches: string;
};

export async function listDevStaff(): Promise<DevStaff[]> {
  if (DB_DRIVER !== "dev" || !DEV_API_URL) return [];
  try {
    const res = await fetch(`${DEV_API_URL}/dev/staff`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: DevStaff[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}
