/* ตัวแปรสภาพแวดล้อมทั้งหมดที่แอปใช้ — อ่านผ่านไฟล์นี้ที่เดียว
   ถ้าค่าที่จำเป็นหาย ให้ล้มตั้งแต่ตอนบูตพร้อมบอกชื่อตัวแปร ไม่ใช่ไปพังกลางหน้าจอผู้ใช้ */

export type Env = "dev" | "staging" | "prod";
export type DbDriver = "supabase" | "dev";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`ไม่ได้ตั้งค่าตัวแปรสภาพแวดล้อม ${name} — ดู web/.env.example`);
  }
  return v;
}

const rawEnv = (process.env.JCRM_ENV ?? "dev").toLowerCase();
if (!["dev", "staging", "prod"].includes(rawEnv)) {
  throw new Error(`JCRM_ENV ต้องเป็น dev · staging · prod (ได้ "${rawEnv}")`);
}
export const JCRM_ENV = rawEnv as Env;

const rawDriver = (process.env.JCRM_DB_DRIVER ?? (JCRM_ENV === "dev" ? "dev" : "supabase")).toLowerCase();
if (!["supabase", "dev"].includes(rawDriver)) {
  throw new Error(`JCRM_DB_DRIVER ต้องเป็น supabase หรือ dev (ได้ "${rawDriver}")`);
}

export const DB_DRIVER = rawDriver as DbDriver;

/* กันพลาดที่แพงที่สุด: ตัวต่อฐานข้อมูลปลอมหลุดขึ้น staging/production

   ตรวจตอน "ใช้งานจริงครั้งแรก" ไม่ใช่ตอน import — เพราะ next build ตั้ง NODE_ENV=production
   ถ้าโยนตั้งแต่ import นักพัฒนาจะ build ในเครื่องไม่ได้เลย ทั้งที่ยังไม่มีใครเรียกฐานข้อมูล
   ผลของการตรวจเหมือนเดิมทุกอย่าง: ถ้าหลุดขึ้นของจริง คำขอแรกจะล้มทันทีพร้อมข้อความชัดเจน */
export function assertDriverSafe(): void {
  if (DB_DRIVER !== "dev") return;
  if (JCRM_ENV !== "dev") throw new Error("JCRM_DB_DRIVER=dev ใช้ได้เฉพาะ JCRM_ENV=dev เท่านั้น");
  if (process.env.NODE_ENV === "production") throw new Error("JCRM_DB_DRIVER=dev ใช้กับ NODE_ENV=production ไม่ได้");
}

/** ที่อยู่ของ dev-api (tools/db/dev-api.mjs) — ใช้เฉพาะตอนพัฒนา */
export const DEV_API_URL =
  DB_DRIVER === "dev" ? (process.env.JCRM_DEV_API_URL ?? "http://127.0.0.1:54329") : null;

/** ค่าของ Supabase — บังคับมีเมื่อใช้ตัวต่อจริงเท่านั้น (อ่านตอนใช้ ไม่ใช่ตอน import) */
export function supabaseConfig(): { url: string; publishableKey: string } | null {
  if (DB_DRIVER !== "supabase") return null;
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

/** ชื่อแอปที่แสดงบนหน้าจอ */
export const APP_NAME = "JAUN CRM";

/** ป้ายเตือนมุมจอเมื่อไม่ได้อยู่บน production */
export const ENV_BADGE: string | null =
  JCRM_ENV === "prod" ? null : JCRM_ENV === "staging" ? "STAGING" : "DEV";
