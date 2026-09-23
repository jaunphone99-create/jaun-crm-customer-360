import "server-only";

import { cache } from "react";

import { can, type Access } from "@/lib/access";
import { rpc } from "@/lib/db";

/* ค่าตั้งของเซสชันที่หน้าจอต้องใช้ (CANONICAL ข้อ 11.2)

   ข้อจำกัดที่ต้องรู้ก่อนแก้ไฟล์นี้:
   `api.get_settings()` ต้องมีสิทธิ์ `settings.business` หรือ `settings.system`
   (supabase/migrations/0011_api.sql) และ `app.settings` ไม่ได้ GRANT SELECT ให้ authenticated
   → พนักงานหน้าเคาน์เตอร์ซึ่งเป็นคนใช้เครื่อง counter จริง **อ่านค่านี้จากฐานข้อมูลไม่ได้**

   จึงทำสองทาง: ใครอ่านได้ก็อ่านของจริง ใครอ่านไม่ได้ใช้ค่าเริ่มต้นเดียวกับที่ฐานข้อมูลตั้งไว้
   (supabase/migrations/0001_foundation.sql บรรทัด 264 · `session.shared_counter_idle_min` = '10')
   ทางแก้ที่ถูกต้องระยะยาวคือให้ `api.get_my_access()` คืนค่านี้มาด้วย ซึ่งต้องแก้ migration
   — อยู่นอกขอบเขตงานนี้ ถือเป็นการบ้านของชุดที่ 2 */

/** ค่าเริ่มต้นเดียวกับฐานข้อมูล — ใช้เมื่อผู้ใช้ไม่มีสิทธิ์อ่าน app.settings */
export const DEFAULT_SHARED_COUNTER_IDLE_MIN = 10;

type SettingRow = { key: string; value: unknown };
type SettingsResult = { ok: boolean; settings: SettingRow[] };

/** แปลงค่า jsonb ที่อาจเป็น 10 หรือ "10" ให้เป็นจำนวนนาทีที่ใช้ได้จริง */
function toMinutes(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * นาทีที่ปล่อยให้เครื่อง counter ว่างได้ก่อนล็อกหน้าจอ
 * อ่านจากฐานข้อมูลเมื่อผู้ใช้มีสิทธิ์ดูค่าตั้ง · ไม่มีสิทธิ์ก็ใช้ค่าเริ่มต้นของฐานข้อมูล
 */
export const sharedCounterIdleMinutes = cache(async (access: Access): Promise<number> => {
  if (!can(access, "settings.business") && !can(access, "settings.system")) {
    return DEFAULT_SHARED_COUNTER_IDLE_MIN;
  }
  try {
    const data = await rpc<SettingsResult>("get_settings");
    const row = data?.settings?.find((s) => s.key === "session.shared_counter_idle_min");
    return toMinutes(row?.value) ?? DEFAULT_SHARED_COUNTER_IDLE_MIN;
  } catch {
    /* อ่านไม่ได้ไม่ใช่เหตุให้เลิกล็อกหน้าจอ — ใช้ค่าเริ่มต้นแล้วล็อกต่อไป */
    return DEFAULT_SHARED_COUNTER_IDLE_MIN;
  }
});
