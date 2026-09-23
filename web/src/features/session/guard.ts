import "server-only";

import type { Route } from "next";
import { headers } from "next/headers";
import { cache } from "react";

import { ruleFor, permissionsOf, PATH_HEADER, type AppRouteRule } from "./routes";

import { can, type Access } from "@/lib/access";
import { getDb } from "@/lib/db";
import { DB_DRIVER } from "@/lib/env";

/* ด่านที่สองของทุกหน้าในกลุ่ม (app) — ทำงานหลังรู้จักผู้ใช้แล้ว (architecture §6.3 ขั้นที่ 3–4)

   ลำดับการตัดสินสำคัญมาก และต้องเป็นลำดับนี้เท่านั้น:
     1. บัญชีไม่ ACTIVE           → ออกจากระบบ (INVITED ไปตั้งรหัสผ่าน · DISABLED/SUSPENDED กลับหน้าเข้าสู่ระบบ)
     2. บทบาทบังคับ MFA แต่ยัง aal1 → ไปยืนยันตัวตน (ยังไม่มี factor ให้ไปลงทะเบียนก่อน)
     3. สิทธิ์ของหน้านี้            → ไม่มีก็ขึ้นการ์ด "ไม่มีสิทธิ์เข้าหน้านี้"

   ถ้าสลับ 2 กับ 3 จะพังทันที เพราะผู้ใช้บทบาทบังคับ MFA ที่ aal1
   "ได้สิทธิ์เท่ากับไม่มีบทบาท" (ข้อ 9.2) → ทุกหน้าจะกลายเป็นไม่มีสิทธิ์แทนที่จะพาไปยืนยันตัวตน */

export { PATH_HEADER };

export type Gate =
  | { kind: "ok" }
  | { kind: "redirect"; to: Route; reason: string }
  | { kind: "denied"; rule: AppRouteRule | null; permissions: string[] };

/** เส้นทางที่ผู้ใช้กำลังขอ — มาจากหัวข้อที่ proxy.ts เขียนไว้ (Server Component อ่านเองไม่ได้) */
export const currentPathname = cache(async (): Promise<string | null> => {
  const value = (await headers()).get(PATH_HEADER);
  return value && value.startsWith("/") ? value : null;
});

/** ต้องยืนยัน MFA ก่อนใช้งานหรือไม่ — บทบาทที่ `requires_mfa` ขณะเซสชันยังเป็น aal1 (ข้อ 9.2) */
export function needsMfaStepUp(access: Access): boolean {
  return access.aal !== "aal2" && access.roles.some((r) => r.requires_mfa);
}

/* มี TOTP factor ที่ยืนยันแล้วหรือยัง — ตัดสินว่าจะพาไป "ยืนยัน" หรือ "ลงทะเบียนก่อน"
   เรียกเฉพาะตอนที่ต้อง step-up จริงเท่านั้น ไม่ได้ยิงทุก request
   โหมดพัฒนาไม่มี Supabase Auth จึงถือว่ามี factor แล้ว แล้วให้หน้า /login/mfa จัดการต่อ */
async function hasVerifiedFactor(): Promise<boolean> {
  if (DB_DRIVER !== "supabase") return true;
  try {
    const supabase = await getDb();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return false;
    return data.totp.some((f) => f.status === "verified");
  } catch {
    /* ถามไม่ได้ก็พาไปหน้ายืนยันตัวตน ซึ่งบอกสถานะจริงให้ผู้ใช้เองได้ดีกว่าหน้าเปล่า */
    return true;
  }
}

/** ตัดสินว่าหน้านี้เปิดให้ผู้ใช้คนนี้ได้ไหม */
export async function gateFor(access: Access): Promise<Gate> {
  /* ---- 1. สถานะบัญชี ---- */
  if (access.staff.status === "INVITED") {
    return { kind: "redirect", to: "/set-password", reason: "บัญชีที่ถูกเชิญต้องตั้งรหัสผ่านก่อน" };
  }
  if (access.staff.status !== "ACTIVE") {
    /* ปิดใช้งาน/ระงับแล้วต้องเข้าไม่ได้ทันที ไม่ต้องรอ cookie หมดอายุ (ข้อ 9.2)
       Server Component ลบ cookie เองไม่ได้ — พากลับหน้าเข้าสู่ระบบ ซึ่งเป็นผู้ล้างเซสชันให้ */
    return { kind: "redirect", to: "/login", reason: `บัญชีสถานะ ${access.staff.status}` };
  }

  /* ---- 2. MFA step-up ---- */
  if (needsMfaStepUp(access)) {
    const enrolled = await hasVerifiedFactor();
    return enrolled
      ? { kind: "redirect", to: "/login/mfa", reason: "บทบาทนี้ต้องยืนยันตัวตนสองขั้นตอน" }
      : { kind: "redirect", to: "/login/mfa/enroll", reason: "บทบาทนี้ต้องลงทะเบียน TOTP ก่อน" };
  }

  /* ---- 3. สิทธิ์รายหน้า ---- */
  const pathname = await currentPathname();
  if (!pathname) {
    /* ไม่รู้ว่าอยู่หน้าไหน = ตัดสินไม่ได้ → ปฏิเสธไว้ก่อน (ปกติจะไม่เกิด เพราะ proxy เขียนหัวข้อนี้ให้ทุก request) */
    console.warn(`[session] ไม่พบหัวข้อ ${PATH_HEADER} — proxy.ts อาจไม่ได้ทำงานกับเส้นทางนี้`);
    return { kind: "denied", rule: null, permissions: [] };
  }

  const rule = ruleFor(pathname);
  if (!rule) {
    console.warn(`[session] เส้นทาง ${pathname} ยังไม่ได้ประกาศใน features/session/routes.ts จึงถูกปฏิเสธ`);
    return { kind: "denied", rule: null, permissions: [] };
  }
  /* อาร์เรย์ = มีอย่างใดอย่างหนึ่งก็เข้าได้ (ดูเหตุผลใน routes.ts) */
  const needed = permissionsOf(rule);
  if (needed.length > 0 && !needed.some((code) => can(access, code))) {
    return { kind: "denied", rule, permissions: needed };
  }
  return { kind: "ok" };
}

/* บทบาทที่เปิดหน้านี้ได้ — อ่านจาก core.role_permissions ตัวจริง ไม่ใช่รายชื่อที่พิมพ์ไว้ในโค้ด
   (ถ้าพิมพ์ไว้เอง วันหนึ่งสิทธิ์เปลี่ยนแล้วการ์ดจะโกหกผู้ใช้)
   เรียกเฉพาะตอนปฏิเสธเท่านั้น · dev-api ไม่รองรับ select แบบฝังตาราง จึงอ่านแยกแล้วเรียงในโค้ด */
export async function rolesWithPermission(permissions: string[]): Promise<string[]> {
  if (permissions.length === 0) return [];
  try {
    const supabase = await getDb();
    const [grants, roles] = await Promise.all([
      supabase.schema("core").from("role_permissions").select("role_code").in("permission_code", permissions),
      supabase.schema("core").from("roles").select("code,sort_order"),
    ]);
    if (grants.error || !grants.data) return [];
    const order = new Map<string, number>(
      ((roles.data ?? []) as { code: string; sort_order: number | null }[]).map((r) => [r.code, r.sort_order ?? 999])
    );
    const codes = [...new Set((grants.data as { role_code: string }[]).map((g) => g.role_code))];
    return codes.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  } catch {
    return [];
  }
}
