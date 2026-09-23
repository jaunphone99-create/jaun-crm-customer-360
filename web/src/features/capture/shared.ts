/* ตัวช่วยเล็ก ๆ ที่ทั้งฝั่งหน้าจอและ Server Action ใช้ร่วมกัน

   สำคัญ: ที่นี่ไม่ normalize และไม่ปิดบังข้อมูลส่วนบุคคล
   ค่าที่พิมพ์ลงฟอร์มถูกส่งดิบ ๆ ให้ฐานข้อมูล (app.normalize_contact) เป็นผู้จัดการ (CANONICAL ข้อ 6.4)
   ฟังก์ชันด้านล่างมีไว้แค่ "เทียบว่าเปลี่ยนไปหรือยัง" กับ "เตือนรูปแบบเบอร์" เท่านั้น */

export function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/** เบอร์ถูกต้องตาม CANONICAL ข้อ 6.4 — มือถือ 10 หลัก 06/08/09 · เบอร์บ้าน 9 หลัก 02–07 */
export function isThaiPhoneShape(value: string): boolean {
  const d = digitsOf(value);
  return /^0[689]\d{8}$/.test(d) || /^0[2-7]\d{7}$/.test(d);
}

/** กรอกเบอร์ครบแล้วหรือยัง — ใช้สั่งตรวจซ้ำอัตโนมัติ (sitemap-screen-specs ข้อ 7.5) */
export function isPhoneComplete(value: string): boolean {
  const d = digitsOf(value);
  return (/^0[689]/.test(d) && d.length === 10) || (/^0[2-7]/.test(d) && d.length === 9);
}

function looseNormalize(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "");
}

/** มีตัวระบุเต็มอย่างน้อย 1 อย่างหรือยัง (เงื่อนไขของ api.find_customer_candidates) */
export function hasIdentifier(parts: { phone: string; lineId: string; email: string }): boolean {
  return Boolean(digitsOf(parts.phone) || looseNormalize(parts.lineId) || looseNormalize(parts.email));
}

/** กุญแจบอกว่า "ผลตรวจซ้ำชุดนี้ตรงกับสิ่งที่กรอกอยู่ตอนนี้หรือไม่"
    รวมสาขาและชื่อด้วย เพราะกฎคะแนน 70 และ 40 ใช้ทั้งสองอย่าง (CANONICAL ข้อ 6.5) */
export function identityKey(parts: {
  phone: string;
  lineId: string;
  email: string;
  branchId: string;
  firstName: string;
  lastName: string;
}): string {
  return [
    digitsOf(parts.phone),
    looseNormalize(parts.lineId),
    looseNormalize(parts.email),
    parts.branchId,
    `${parts.firstName.trim()} ${parts.lastName.trim()}`.trim().toLowerCase(),
  ].join("|");
}
