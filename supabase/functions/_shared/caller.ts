/* ตรวจ JWT ของผู้เรียก แล้วดึง (sub, aal) ออกมาให้ RPC เป็นผู้ตัดสินสิทธิ์

   ข้อ 9.8 (1)(3): ฟังก์ชันที่มีผู้เรียกเป็นผู้ใช้ ต้อง verify JWT ก่อน และ
   **ห้ามรับ actor/staff_id จาก body** — ผู้กระทำมาจาก JWT ที่ verify แล้วเท่านั้น

   verify อย่างไร: เรียก auth.getUser(token) ซึ่งยิงไปที่ GoTrue (/auth/v1/user)
   GoTrue เป็นผู้ตรวจลายเซ็น อายุ และสถานะ ban ให้ — ถ้าบัญชีถูก ban หรือ token หมดอายุจะไม่ผ่าน
   เมื่อผ่านแล้วจึงค่อยถอด payload อ่าน claim `aal` (ปลอดภัย เพราะพิสูจน์ความถูกต้องของ token ไปแล้ว) */

import { anonKey, supabaseUrl } from "./clients.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export type Caller = {
  /** auth.users.id ของผู้เรียก — ส่งเป็น actor_user_id ให้ api.svc_* */
  userId: string;
  /** ระดับการยืนยันตัวตนของเซสชันนี้ — ส่งเป็น actor_aal ให้ api.svc_* (ข้อ 9.2) */
  aal: "aal1" | "aal2";
  /** token ดิบ ใช้สร้าง callerClient เพื่อเรียก RPC ในบริบทผู้ใช้ */
  jwt: string;
};

/** ดึง Bearer token ออกจากส่วนหัว */
function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/** ถอด payload ของ JWT ที่ "ผ่านการ verify แล้ว" เพื่ออ่าน claim ที่ getUser ไม่คืนมา */
function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * คืนผู้เรียกเมื่อ JWT เป็นของ "ผู้ใช้จริง" เท่านั้น
 * คืน null เมื่อ: ไม่มีส่วนหัว · token เสีย/หมดอายุ · บัญชีถูก ban ·
 * หรือ token เป็น anon/service key (role ไม่ใช่ authenticated) ซึ่งไม่ใช่ผู้ใช้
 */
export async function verifyCaller(req: Request): Promise<Caller | null> {
  const jwt = bearer(req);
  if (!jwt) return null;

  const payload = decodePayload(jwt);
  // anon key และ service_role key ก็เป็น JWT ที่ถูกต้อง แต่ไม่ใช่ผู้ใช้ — ตัดทิ้งก่อนยิง GoTrue
  if (!payload || payload["role"] !== "authenticated") return null;

  const client = createClient(supabaseUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;

  const aalClaim = payload["aal"];
  const aal: "aal1" | "aal2" = aalClaim === "aal2" ? "aal2" : "aal1";

  return { userId: data.user.id, aal, jwt };
}

/** ข้อความเดียวที่ใช้เมื่อไม่มีผู้เรียกที่ยืนยันตัวตน */
export const NO_CALLER_MESSAGE =
  "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง";
