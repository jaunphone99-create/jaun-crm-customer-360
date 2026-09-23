import "server-only";

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { assertDriverSafe, DB_DRIVER, DEV_API_URL, supabaseConfig } from "@/lib/env";
import { readDevSession } from "@/lib/session";

/* ทางเข้าฐานข้อมูลทางเดียวของทั้งแอป

   ไม่ว่าจะเป็นเครื่องนักพัฒนาหรือของจริง โค้ดข้างบนเขียนเหมือนกันทุกบรรทัด:
   supabase.schema('crm').from('visits')… หรือ supabase.schema('api').rpc(…)
   ต่างกันแค่ปลายทางและวิธีบอกว่า "ใครเรียก" ซึ่งถูกขังไว้ในไฟล์นี้ไฟล์เดียว
   (Identity Contract IC-1 · IC-5 — เปลี่ยนไปใช้ Login กลางภายหลังโดยไม่ต้องแตะ RLS หรือหน้าจอ)

   สิทธิ์ยังตัดสินที่ฐานข้อมูลด้วย RLS เสมอ ทั้งสองทาง */

export class RpcError extends Error {
  readonly code: string | null;
  readonly detail: string | null;
  readonly hint: string | null;
  readonly source: string;

  constructor(source: string, message: string, opts: { code?: string | null; detail?: string | null; hint?: string | null } = {}) {
    super(message);
    this.name = "RpcError";
    this.source = source;
    this.code = opts.code ?? null;
    this.detail = opts.detail ?? null;
    this.hint = opts.hint ?? null;
  }

  static from(source: string, error: PostgrestError): RpcError {
    return new RpcError(source, error.message, { code: error.code, detail: error.details, hint: error.hint });
  }
}

/** ไคลเอนต์ของ request ปัจจุบัน — ต่อครั้งเดียวต่อ request */
export const getDb = cache(async (): Promise<SupabaseClient> => {
  assertDriverSafe();

  if (DB_DRIVER === "dev") {
    const session = await readDevSession();
    const token = session ? `dev:${session.staffCode}:${session.aal}` : "dev-anon";
    return createClient(DEV_API_URL ?? "", "dev-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }

  const config = supabaseConfig();
  if (!config) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* Server Component เขียน cookie ไม่ได้ — proxy.ts เป็นผู้ต่ออายุเซสชัน */
        }
      },
    },
  }) as unknown as SupabaseClient;
});

/** เรียกฟังก์ชันใน schema `api` */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getDb();
  const { data, error } = await supabase.schema("api").rpc(name, args);
  if (error) throw RpcError.from(`api.${name}`, error);
  return data as T;
}
