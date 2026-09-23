/* แปลง error ของ PostgREST / GoTrue ให้เป็นข้อความไทยที่ "ปลอดภัยที่จะแสดง"

   ทำไมต้องกรอง: ข้อความที่ RPC ของเราเขียนเอง (app.api_denied · app.api_invalid) เป็นภาษาไทย
   และตั้งใจให้ผู้ใช้อ่าน — ส่งต่อได้ · แต่ข้อความที่ PostgreSQL เขียนเองเป็นภาษาอังกฤษและ
   มีชื่อตาราง ชื่อคอลัมน์ ชื่อ constraint หรือแม้แต่ "ค่าจริง" (เบอร์โทร อีเมล) ติดมาด้วย
   ของพวกนั้นห้ามออกจาก Edge Function เด็ดขาด (กติกาข้อ 4 · ข้อ 9.5)

   เกณฑ์ที่ใช้ตัดสิน (ตรงกับแนวคิดของ web/src/lib/errors.ts):
   1. ข้อความที่ "ปลอดภัย" ต้องมีอักษรไทยอย่างน้อยหนึ่งตัว — ข้อความของ PostgreSQL เป็นอังกฤษล้วน
   2. ต้องไม่เข้าลายของข้อความภายในฐานข้อมูล (duplicate key · violates · relation "…" …)
   3. app.transition_denied ใส่รหัส JCRM-Tnn ไว้ที่ MESSAGE และคำอธิบายไทยไว้ที่ HINT → ใช้ HINT ก่อน
   ไม่ผ่านเกณฑ์ = ใช้ข้อความกลาง และเก็บของจริงไว้ใน log ฝั่งเซิร์ฟเวอร์เท่านั้น */

/** ข้อความกลางเมื่อเราไม่มั่นใจว่าข้อความจากฐานข้อมูลปลอดภัยพอจะแสดง */
export const GENERIC_MESSAGE =
  "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบพร้อมเวลาที่ทำรายการ";

const THAI = /[฀-๿]/;

/** ลายของข้อความที่ PostgreSQL/PostgREST เขียนเอง — มีชื่อโครงสร้างหรือค่าจริงติดมา */
const INTERNAL = new RegExp(
  [
    "duplicate key",
    "violates",
    "relation \"",
    "column \"",
    "constraint \"",
    "permission denied for",
    "invalid input syntax",
    "function .* does not exist",
    "could not find the function",
    "SQLSTATE",
    "syntax error",
    "null value in column",
  ].join("|"),
  "i",
);

function isSafeToShow(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t === "" || t.length > 300) return false;
  if (!THAI.test(t)) return false;
  if (INTERNAL.test(t)) return false;
  return true;
}

/** รูปร่างของ error ที่ supabase-js คืนมาจาก .rpc() (PostgrestError) */
type MaybePgError = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

/** ข้อความที่แสดงได้ — ถ้าไม่ปลอดภัยให้ใช้ `fallback` */
export function safeMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as MaybePgError;
  // HINT ก่อน MESSAGE เพราะ app.transition_denied เก็บคำอธิบายไทยไว้ที่ HINT (rls-spec ข้อ 7.4)
  if (isSafeToShow(e.hint)) return (e.hint as string).trim();
  if (isSafeToShow(e.message)) return (e.message as string).trim();
  return fallback;
}

/** ข้อความสำหรับ log ฝั่งเซิร์ฟเวอร์เท่านั้น — **ห้ามส่งออกไปกับคำตอบ** */
export function logLine(error: unknown): string {
  if (!error) return "unknown error";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object") {
    const e = error as MaybePgError;
    const code = typeof e.code === "string" ? e.code : "-";
    const msg = typeof e.message === "string" ? e.message : "-";
    const det = typeof e.details === "string" ? e.details : "-";
    return `code=${code} message=${msg} details=${det}`;
  }
  return String(error);
}

/** บันทึก log โดยไม่ให้ body ของผู้ใช้หรือ secret หลุดลง log (ข้อ 9.8 · observability) */
export function logFailure(
  fn: string,
  step: string,
  reqId: string,
  error: unknown,
): void {
  console.error(`[${fn}] step=${step} request_id=${reqId} ${logLine(error)}`);
}
