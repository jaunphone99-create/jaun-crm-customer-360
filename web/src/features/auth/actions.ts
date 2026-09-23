"use server";

import { redirect } from "next/navigation";

import { getAccess, homePath } from "@/lib/access";
import { DB_DRIVER, DEV_API_URL } from "@/lib/env";
import { getDb } from "@/lib/db";
import { clearDevSession, writeDevSession } from "@/lib/session";

export type LoginState = { error: string | null };

/* ข้อความเดียวกันทุกกรณีที่เข้าไม่ได้ (CANONICAL ข้อ 9.2)
   ห้ามบอกว่า "ไม่มีบัญชีนี้" หรือ "รหัสผ่านผิด" แยกกัน เพราะเป็นการยืนยันว่ามีบัญชีอยู่จริง */
const SAME_ANSWER = "อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง";

/* ---- โหมดพัฒนา: เลือกว่าจะเป็นใคร ไม่มีรหัสผ่าน ---------------------------- */

export async function devSignIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (DB_DRIVER !== "dev") return { error: "โหมดนี้ใช้ได้เฉพาะตอนพัฒนา" };

  const staffCode = String(formData.get("staffCode") ?? "").trim().toUpperCase();
  const aal = String(formData.get("aal") ?? "aal2") === "aal1" ? "aal1" : "aal2";
  if (!/^ST-\d{4,}$/.test(staffCode)) return { error: "กรุณาเลือกผู้ใช้" };

  await writeDevSession({ staffCode, aal });

  const access = await getAccess();
  if (!access) {
    await clearDevSession();
    return { error: `ผู้ใช้ ${staffCode} เข้าใช้งานไม่ได้ (บัญชีอาจยังไม่ ACTIVE)` };
  }
  redirect(homePath(access));
}

/* ---- โหมดจริง: Supabase Auth ------------------------------------------------ */

export async function passwordSignIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (DB_DRIVER !== "supabase") return { error: "ยังไม่ได้ตั้งค่าการต่อ Supabase" };

  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) return { error: SAME_ANSWER };

  /* ST-NNNN ต้องแปลงเป็นบัญชีผู้ใช้ก่อน และต้องทำด้วยสิทธิ์ service_role
     จึงอยู่ใน Edge Function `staff-code-login` (api.svc_resolve_staff_code · ข้อ 9.2)
     ที่นี่ส่งต่อให้ Edge Function เท่านั้น ไม่มีคีย์ service_role ในแอป */
  if (/^ST-\d{4,}$/i.test(loginId)) {
    return { error: "ยังไม่ได้ติดตั้ง Edge Function staff-code-login — ระหว่างนี้ใช้อีเมลเข้าสู่ระบบ" };
  }

  const supabase = await getDb();
  const { error } = await supabase.auth.signInWithPassword({ email: loginId, password });
  if (error) return { error: SAME_ANSWER };

  const access = await getAccess();
  if (!access) return { error: SAME_ANSWER };
  redirect(homePath(access));
}

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
