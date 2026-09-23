import "server-only";

import { cookies } from "next/headers";

import { DB_DRIVER } from "@/lib/env";

/* เซสชันโหมดพัฒนา — ใช้เฉพาะเมื่อ JCRM_DB_DRIVER=dev

   โหมดนี้ไม่มีการตรวจรหัสผ่าน ผู้ใช้เลือกว่าจะเป็นใครจากรายชื่อใน seed
   จุดประสงค์คือให้ทดลอง Core Flow กับ RLS ตัวจริงได้โดยไม่ต้องมี Supabase
   บน staging/production ตัวตนมาจาก Supabase Auth และ env.ts บล็อกโหมดนี้ไว้แล้ว */

const COOKIE = "jcrm.dev.session";

export type DevSession = { staffCode: string; aal: "aal1" | "aal2" };

export async function readDevSession(): Promise<DevSession | null> {
  if (DB_DRIVER !== "dev") return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [staffCode, aal] = raw.split("|");
  if (!staffCode || !/^ST-\d{4,}$/.test(staffCode)) return null;
  return { staffCode, aal: aal === "aal2" ? "aal2" : "aal1" };
}

export async function writeDevSession(session: DevSession): Promise<void> {
  (await cookies()).set(COOKIE, `${session.staffCode}|${session.aal}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearDevSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
