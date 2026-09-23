import { RpcError } from "@/lib/db";

/* แปลงข้อผิดพลาดจากฐานข้อมูลเป็นข้อความบนหน้าจอ

   ฐานข้อมูลเป็นผู้ตัดสินเสมอ และข้อความส่วนใหญ่เป็นภาษาไทยอยู่แล้ว
   (app.api_invalid / app.api_denied ใน supabase/migrations/0011_api.sql)
   ที่นี่จึงทำแค่สองอย่าง: แปลรหัส JCRM-Txx ที่เป็นภาษาอังกฤษ และหาว่าข้อความนั้นควรไปอยู่ที่ช่องไหน

   หมายเหตุ: web/src/lib/errors.ts ยังไม่มีในแอปตอนเขียนไฟล์นี้
   ถ้าไฟล์ส่วนกลางนั้นพร้อมเมื่อไร ให้ย้ายตารางด้านล่างไปที่นั่นแล้วลบไฟล์นี้ */

/** รหัสการเปลี่ยนสถานะจาก app.transition_denied (0010_security.sql) ที่หน้านี้พบได้ */
const TRANSITION_TH: Record<string, string> = {
  T00: "เซสชันนี้ไม่ผูกกับพนักงานที่ใช้งานอยู่",
  T02: "ลูกค้ารายนี้ไม่อยู่ในสถานะที่ใช้งานได้",
  T26: "ลูกค้ารายนี้ยังไม่ได้ผูกกับสาขานี้ ต้องผูกผ่านการรับลูกค้า",
};

const GENERIC = "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";

/** ข้อความที่จะแสดงให้ผู้ใช้เห็น */
export function captureErrorMessage(error: unknown): string {
  const raw = error instanceof RpcError ? error.message : error instanceof Error ? error.message : "";
  const text = raw.trim();
  if (!text) return GENERIC;

  const transition = /^JCRM-(T\d{2})$/.exec(text);
  if (transition) {
    const code = transition[1] ?? "";
    return TRANSITION_TH[code] ?? GENERIC;
  }

  /* ข้อความที่ไม่ใช่ภาษาไทยมักเป็นข้อผิดพลาดระดับโครงสร้าง (เช่น ต่อฐานข้อมูลไม่ได้)
     ซึ่งไม่ควรเอาไปแสดงดิบ ๆ ให้พนักงานหน้าร้านอ่าน */
  return /[฀-๿]/.test(text) ? text : GENERIC;
}

/** ช่องที่ควรแสดงข้อความนี้ (sitemap-screen-specs ข้อ 7.8 "ข้อความจาก RPC ที่ช่องนั้น") */
export function captureErrorField(message: string): string | null {
  const pairs: Array<[RegExp, string]> = [
    [/ต้องกรอกชื่อ หรือชื่อเล่น/, "first_name"],
    [/ต้องเลือกช่องทางแรกที่ติดต่อ|เลือกช่องทางที่ติดต่อมา/, "channel_code"],
    [/ต้องเลือกความสนใจ|เลือกความสนใจ/, "interest_code"],
    [/แจ้งประกาศความเป็นส่วนตัว/, "privacy"],
    [/ต้องกรอกเบอร์โทร|ต้องมีช่องทางติดต่ออย่างน้อย/, "phone"],
    [/ช่องทางติดต่อไม่ถูกต้อง: PHONE/, "phone"],
    [/ช่องทางติดต่อไม่ถูกต้อง: LINE_ID/, "line_id"],
    [/ช่องทางติดต่อไม่ถูกต้อง: EMAIL/, "email"],
    [/อายุ 20 ปีขึ้นไป/, "age_ok"],
    [/ไม่มีสิทธิ์บันทึกความยินยอม/, "marketing"],
    [/ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้|เลือกสาขา/, "branch_id"],
    [/ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่/, "override_reason"],
    [/บัตรประชาชน/, "note"],
  ];
  for (const [pattern, field] of pairs) {
    if (pattern.test(message)) return field;
  }
  return null;
}
