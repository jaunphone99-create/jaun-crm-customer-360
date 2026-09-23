"use server";

import { getDb } from "@/lib/db";
import { DB_DRIVER } from "@/lib/env";
import { clearDevSession } from "@/lib/session";

/* ออกจากระบบแบบ "ไม่พาไปไหน" สำหรับหน้าจอล็อกของเครื่อง counter

   ทำไมไม่ใช้ signOut() ของ features/auth: ตัวนั้นจบด้วย redirect('/login') ทันที
   ซึ่งจะพาออกจากหน้าไปก่อนที่ผู้ใช้จะเห็นหน้าจอล็อก — ที่นี่ต้องการ "ตัดเซสชันจริง
   แล้วค้างหน้าจอล็อกไว้" ตาม C-LOCK (design-system ข้อ 7.25 · security-design T-07)
   จุดสำคัญคือต้อง sign out จริง ไม่ใช่แค่วาดแผ่นทับจอ ไม่งั้นแค่รีเฟรชก็ใช้งานต่อได้ */

export async function lockSignOut(): Promise<void> {
  try {
    if (DB_DRIVER === "dev") {
      await clearDevSession();
    } else {
      const supabase = await getDb();
      await supabase.auth.signOut();
    }
  } catch {
    /* ตัดเซสชันไม่สำเร็จก็ยังต้องล็อกหน้าจอไว้ — ด่านถัดไป (proxy + layout) จะกันเอง */
  }
}
