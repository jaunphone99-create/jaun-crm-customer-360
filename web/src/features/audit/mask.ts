/* ทำภาพแถว before/after ให้ปลอดภัยก่อนส่งข้ามไปฝั่งเบราว์เซอร์

   ทำไมต้องมีไฟล์นี้
   audit.log_row_change() เก็บคอลัมน์ที่ COMMENT ขึ้นต้นด้วย "[pii]" เป็น {"masked": …, "sha256": …}
   (0008_audit.sql ส่วนที่ 1 · 6) ตัว sha256 เป็น sha256 ของค่าดิบล้วน ๆ ไม่มี salt
   เบอร์มือถือไทยมีความเป็นไปได้ราวสิบล้านเลขหมาย การไล่แฮชทั้งช่วงใช้เวลาไม่กี่วินาทีบนเครื่องทั่วไป
   เพราะฉะนั้น "ค่าปิดบัง + hash" ที่ส่งคู่กันไปถึงเบราว์เซอร์ = ส่งเบอร์เต็มไปนั่นเอง
   หน้าจอต้องการแค่ masked เพื่อตอบคำถามว่า "ช่องนี้เปลี่ยนจากอะไรเป็นอะไร" hash จึงถูกตัดทิ้งที่เซิร์ฟเวอร์

   กติกาเพิ่มเติม: ตัดคีย์ที่ชื่อบอกว่าเป็นค่าแฮช/ความลับทิ้งทั้งตระกูล (…_hash · token · secret · password)
   เผื่อมีตารางใหม่เพิ่มคอลัมน์ทำนองนี้ในอนาคตโดยที่หน้านี้ไม่ได้ถูกแก้ตาม
   ค่าที่ถูกตัดจะไม่หายเงียบ ๆ — แทนด้วย HIDDEN_TEXT ให้คนตรวจสอบเห็นว่า "มีช่องนี้อยู่แต่ไม่แสดง" */

/** ข้อความแทนค่าที่จงใจไม่ส่งออกจากเซิร์ฟเวอร์ */
export const HIDDEN_TEXT = "[ไม่แสดงค่า]";

/** ชื่อคีย์ที่ห้ามส่งออกไม่ว่าอยู่ชั้นไหนของ jsonb */
function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "sha256" ||
    k.endsWith("_hash") ||
    k.endsWith("_hashes") ||
    k.includes("password") ||
    k.includes("secret") ||
    k.includes("token")
  );
}

/** ค่าที่หน้าจอแสดงได้: ข้อความบรรทัดเดียว หรือ null เมื่อไม่มีค่า */
export type SafeValue = string | null;

function isPiiPair(v: Record<string, unknown>): boolean {
  return "masked" in v && "sha256" in v;
}

/** แปลงค่าหนึ่งช่องของ jsonb เป็นข้อความที่แสดงได้ โดยตัดของที่ห้ามส่งออกทิ้งก่อน */
export function safeValue(value: unknown): SafeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const parts = value.map((v) => safeValue(v) ?? "");
    return parts.length ? parts.join(" · ") : null;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    /* คอลัมน์ pii มาเป็น {"masked","sha256"} เสมอ — เอาเฉพาะ masked ไปแสดง
       ค่าที่ app.anonymize_customer แทนไว้จะเป็น "[ANONYMIZED]" ซึ่งก็อยู่ใน masked เช่นกัน */
    if (isPiiPair(obj)) {
      const masked = obj.masked;
      return typeof masked === "string" || typeof masked === "number" ? String(masked) : HIDDEN_TEXT;
    }
    const entries = Object.entries(obj)
      .filter(([k]) => !isSecretKey(k))
      .map(([k, v]) => `${k}: ${safeValue(v) ?? "–"}`);
    return entries.length ? entries.join(" · ") : null;
  }

  return null;
}

/** หนึ่งบรรทัดของตาราง "ก่อน → หลัง" */
export type FieldChange = {
  field: string;
  before: SafeValue;
  after: SafeValue;
  /** อยู่ใน changed_fields ที่ฐานข้อมูลคำนวณให้หรือไม่ (ไฮไลต์ตาม sitemap ข้อ 19.4) */
  changed: boolean;
};

/**
 * รวมภาพแถวก่อน/หลังเป็นตารางช่อง
 *
 * ตั้งใจไม่ตัดสินเองว่า "ช่องไหนเปลี่ยน" ด้วยการเทียบค่าสองฝั่ง — ใช้ changed_fields ที่ trigger
 * คำนวณไว้ตอนเกิดเหตุเท่านั้น เพราะค่าที่เรามองเห็นเป็นค่าปิดบังแล้ว การเทียบซ้ำที่นี่จะบอกว่า
 * "081-XXX-1234 → 081-XXX-1234 ไม่เปลี่ยน" ทั้งที่เลขสี่ตัวกลางเปลี่ยนไปจริง
 */
export function fieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  changedFields: string[] | null
): FieldChange[] {
  const changed = new Set(changedFields ?? []);
  const keys = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  return [...keys]
    .sort()
    .map((field) => {
      const hidden = isSecretKey(field);
      return {
        field,
        before: hidden ? HIDDEN_TEXT : safeValue(before?.[field]),
        after: hidden ? HIDDEN_TEXT : safeValue(after?.[field]),
        changed: changed.has(field),
      };
    });
}
