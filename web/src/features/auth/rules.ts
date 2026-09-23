import "server-only";

import type { Route } from "next";

import { homePath, type Access } from "@/lib/access";

/* กติกาของ "ขั้นถัดไป" หลังยืนยันตัวตน — ที่เดียวที่ตัดสินว่าจะพาผู้ใช้ไปไหน

   สิ่งที่ไฟล์นี้ทำคือ "พาไปหน้าที่ถูกต้อง" เท่านั้น ไม่ใช่การให้สิทธิ์
   คนที่ข้ามไปพิมพ์ URL เองก็ยังไม่ได้สิทธิ์อยู่ดี เพราะสิทธิ์ตัดสินที่ฐานข้อมูล:
   ผู้ใช้บทบาทที่ requires_mfa ตอน aal1 จะได้ roles[].effective_now = false
   และ permissions ทุกข้อ effective_now = false เท่ากับไม่มีบทบาท (CANONICAL ข้อ 9.2)

   ค่าทั้งหมดอ่านจาก api.get_my_access() — ไม่มีการเดาจากฝั่งแอป */

/** บัญชีนี้มีบทบาทที่บังคับยืนยันสองขั้นตอนหรือไม่ */
export function requiresMfa(access: Access): boolean {
  return access.roles.some((r) => r.requires_mfa);
}

/** ต้องไปยืนยัน MFA ก่อนจึงจะใช้งานได้จริง (มีบทบาทที่บังคับ แต่เซสชันยังเป็น aal1) */
export function mfaPending(access: Access): boolean {
  return access.aal !== "aal2" && requiresMfa(access);
}

/** บัญชีที่ยังไม่ได้ตั้งรหัสผ่าน/ยังไม่เปิดใช้งาน ต้องจบ flow คำเชิญก่อน (ข้อ 7.3) */
export function isInvited(access: Access): boolean {
  return access.staff.status === "INVITED";
}

/** เข้าใช้งานต่อได้เลยหรือไม่ — ใช้ตัดสินว่าจะเด้งกลับหน้าเข้าสู่ระบบไหม */
export function isUsable(access: Access): boolean {
  return access.staff.status === "ACTIVE";
}

/** หน้าถัดไปหลังยืนยันตัวตนสำเร็จ (architecture §6.3 ขั้นที่ 2–3) */
export function nextPathAfterSignIn(access: Access): Route {
  if (isInvited(access)) return "/set-password";
  if (mfaPending(access)) return "/login/mfa";
  return homePath(access);
}

/** ข้อความอธิบายว่าทำไมต้องยืนยัน MFA — ข้อความเดียวกับ prototype/01-login.html */
export function mfaReason(roleLabels: string[]): string {
  const roles = roleLabels.length > 0 ? roleLabels.join(" · ") : "ของคุณ";
  return `บทบาท ${roles} ต้องยืนยัน MFA ก่อนใช้งาน ถ้ายังไม่ยืนยัน ระบบจะถือว่าไม่มีสิทธิ์ของบทบาทนี้`;
}
