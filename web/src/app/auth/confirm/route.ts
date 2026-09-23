import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { DB_DRIVER } from "@/lib/env";

/* ปลายทางของลิงก์ในอีเมลคำเชิญและลิงก์รีเซ็ตรหัสผ่าน

   Supabase ส่งลิงก์มาพร้อม token_hash + type แล้วคาดหวังให้ "ฝั่งเซิร์ฟเวอร์" เอาไปแลกเป็นเซสชัน
   ต้องทำที่นี่เท่านั้น เพราะ cookie เป็น HttpOnly (CANONICAL ข้อ 9.2 · architecture §6.3)
   ถ้าไม่มีเส้นทางนี้ ลิงก์ในอีเมลจะพาไปหน้าว่างและคำเชิญใช้ไม่ได้เลย

   หลังแลกสำเร็จจึงพาไปหน้าถัดไป (ค่าเริ่มต้น /set-password) — ปลายทางรับมาจาก ?next=
   และ **อนุญาตเฉพาะเส้นทางภายในที่รู้จัก** กันคนส่งลิงก์ที่พาผู้ใช้ออกไปเว็บอื่น */

const ALLOWED_NEXT = new Set(["/set-password", "/login/mfa/enroll", "/dashboard"]);

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/set-password";
  const path = raw.split("?")[0] ?? "";
  return ALLOWED_NEXT.has(path) ? raw : "/set-password";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?link=${encodeURIComponent(reason)}`, url.origin));

  /* โหมดพัฒนาไม่มี Supabase Auth ให้แลก token — ฐานข้อมูลทดลองออกลิงก์ตรงมาที่หน้าปลายทางอยู่แล้ว */
  if (DB_DRIVER === "dev") return NextResponse.redirect(new URL(next, url.origin));

  if (!tokenHash || !type) return fail("invalid");

  const supabase = await getDb();
  const { error } = await supabase.auth.verifyOtp({
    type: type as "invite" | "recovery" | "email" | "magiclink",
    token_hash: tokenHash,
  });

  /* ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — บอกกลาง ๆ ว่าใช้ไม่ได้ ไม่บอกว่าบัญชีมีอยู่จริงหรือไม่ */
  if (error) return fail("expired");

  return NextResponse.redirect(new URL(next, url.origin));
}
