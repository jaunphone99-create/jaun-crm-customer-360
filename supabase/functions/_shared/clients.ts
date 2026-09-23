/* ตัวสร้าง Supabase client สามแบบที่ Edge Function ใช้ — แยกให้ชัดว่าตัวไหนถือสิทธิ์อะไร

   1. serviceClient()  — service_role · เรียกได้เฉพาะ api.svc_* และ Auth/Storage admin API (ข้อ 9.8)
   2. callerClient(jwt)— JWT ของผู้เรียก · ใช้ตรวจสิทธิ์ "ในบริบทผู้ใช้" ก่อนแตะ service_role
   3. anonClient()     — anon key ล้วน · ใช้เฉพาะ password grant และส่งอีเมลรีเซ็ตรหัสผ่าน

   กติกา
   - service_role key อ่านจาก Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') เท่านั้น
     ห้าม hardcode · ห้าม log · ห้ามส่งกลับไปกับคำตอบ
   - Edge Function ไม่มี connection string ฐานข้อมูล · แตะฐานข้อมูลผ่าน PostgREST เท่านั้น (ข้อ 9.8)
   - ทุก client ปิด persistSession/autoRefreshToken เพราะ Edge Function ไม่มีที่เก็บเซสชัน */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** อ่าน secret ที่จำเป็น — โยน Error ที่บอกเฉพาะ "ชื่อ" secret ไม่เคยบอกค่า */
export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing secret: ${name}`);
  return value;
}

/** URL ของโปรเจกต์ (Supabase ใส่ให้อัตโนมัติทั้งบนของจริงและ supabase functions serve) */
export function supabaseUrl(): string {
  return requiredEnv("SUPABASE_URL");
}

/** anon key (Supabase ใส่ให้อัตโนมัติ) */
export function anonKey(): string {
  return requiredEnv("SUPABASE_ANON_KEY");
}

const NO_SESSION = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** client สิทธิ์ service_role — สำหรับ api.svc_* และ auth.admin เท่านั้น */
export function serviceClient(): SupabaseClient {
  return createClient(supabaseUrl(), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), NO_SESSION);
}

/** client ที่ถือ JWT ของผู้เรียก — RPC ทุกตัวที่เรียกผ่านตัวนี้ถูกตัดสินสิทธิ์ด้วย RLS/DEFINER ตามผู้ใช้จริง */
export function callerClient(jwt: string): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    ...NO_SESSION,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** client anon ล้วน — ใช้ทำ password grant และ resetPasswordForEmail (ไม่มีสิทธิ์อ่านข้อมูลใด ๆ) */
export function anonClient(): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), NO_SESSION);
}

/** ฐาน URL ของเว็บแอป ใช้ประกอบลิงก์คำเชิญ/รีเซ็ตรหัส · ตั้งเป็น secret ชื่อ APP_BASE_URL */
export function appBaseUrl(): string {
  return requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
}

/** ปลายทางหลังผู้ใช้กดลิงก์ในอีเมล — Route Handler /auth/confirm รับ token_hash แล้วพาไปต่อ */
export function confirmUrl(next: string): string {
  return `${appBaseUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}
