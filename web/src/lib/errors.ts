/* แปลง "คำปฏิเสธ" ของฐานข้อมูลให้เป็นข้อความที่พนักงานหน้าร้านอ่านแล้วรู้ว่าต้องทำอะไรต่อ

   ฐานข้อมูลปฏิเสธคำสั่งได้หลายทาง และแต่ละทางส่งของมาไม่เหมือนกัน:

   1. app.transition_denied(code)  — ERRCODE 42501 · MESSAGE 'JCRM-Tnn' · DETAIL อังกฤษ · HINT ไทย
                                     (rls-spec ข้อ 7.4 · 7.5 — "UI แสดง HINT")
   2. app.api_denied(msg)          — ERRCODE 42501 · MESSAGE ไทย
   3. app.api_invalid(msg, state)  — ERRCODE 22023 (ค่าเริ่มต้น) หรือ P0001 · MESSAGE ไทย
   4. trigger ธุรกิจ (0009)        — 23514 / 23503 · MESSAGE ไทยที่บางครั้งมีชื่อตารางติดมา · HINT ไทยสะอาด
   5. PostgreSQL เอง               — 42501 (GRANT/RLS) · 23505 ซ้ำ · 23514 CHECK · 23503 FK · 23502 NOT NULL …
                                     ข้อความเป็นอังกฤษและมีชื่อตาราง ชื่อคอลัมน์ หรือค่าจริง (เบอร์โทร!) ติดมาด้วย
   6. ต่อฐานข้อมูลไม่ได้เลย        — ไม่มี SQLSTATE มีแต่ fetch failed / ECONNREFUSED

   กติกาของไฟล์นี้
   - `title` กับ `detail` แสดงบนหน้าจอได้เสมอ: ภาษาไทย สุภาพ สั้น และบอกทางออก
   - ห้ามให้ชื่อตาราง ชื่อคอลัมน์ ชื่อ constraint หรือค่า PII หลุดขึ้นจอ — ของพวกนี้อยู่ใน `log` เท่านั้น
   - ข้อความที่ฐานข้อมูลเขียนมาเป็นภาษาไทยอยู่แล้ว ใช้ตามนั้น ไม่แปลซ้ำ ไม่เขียนใหม่
   - ห้ามโทษผู้ใช้ ทุกข้อความต้องจบด้วย "แล้วต้องทำอะไรต่อ"

   ไฟล์นี้ไม่ import อะไรจาก @/lib/db หรือ @/lib/env เพราะสองไฟล์นั้นเป็น server-only
   หน้าจอฝั่ง client ต้องเรียกใช้ได้ด้วย จึงอ่านรูปร่างของ error แบบ duck typing แทน */

/** ผลลัพธ์สำหรับแสดงผล — `title` และ `detail` ปลอดภัยที่จะแสดง · `log` ห้ามแสดง */
export type ThaiMessage = {
  /** พาดหัวภาษาไทย — บอกว่าเกิดอะไรขึ้น */
  title: string;
  /** บรรทัดรอง — บอกว่าต้องทำอะไรต่อ (ปลอดภัยที่จะแสดงเสมอ) */
  detail?: string;
  /** ลองกดใหม่แล้วมีโอกาสสำเร็จหรือไม่ */
  canRetry: boolean;
  /** ข้อความดิบของฐานข้อมูลไว้เขียน log — **ห้ามแสดงบนหน้าจอ** อาจมีชื่อตารางหรือค่า PII */
  log: string;
};

/** คำอธิบายของรหัส JCRM-Tnn — `why` = ทำไมทำไม่ได้ · `next` = ต้องทำอะไรก่อน */
export type TransitionMessage = { why: string; next: string };

/* =====================================================================================
   รหัส transition (rls-spec §7.4 ตาราง JCRM-Tnn · supabase/migrations/0010_security.sql)
   `why` ต้องตรงกับ HINT ภาษาไทยของ app.transition_denied ทุกตัวอักษร — ห้ามเขียนใหม่เอง
   `next` เป็นคำแนะนำของหน้าจอ ที่เอกสารไม่ได้กำหนดข้อความไว้
   ===================================================================================== */
export const TRANSITION_MESSAGES: Readonly<Record<string, TransitionMessage>> = {
  T00: {
    why: "บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน",
    next: "เข้าสู่ระบบใหม่อีกครั้ง ถ้ายังเข้าไม่ได้ให้แจ้งผู้จัดการสาขาเพื่อเปิดใช้งานบัญชี",
  },
  T01: {
    why: "ข้อมูลนี้ระบบกำหนด แก้ไขเองไม่ได้",
    next: "ระบบจะอัปเดตค่านี้ให้เอง ถ้าค่าไม่ถูกต้องให้แจ้งผู้ดูแลระบบ",
  },
  T02: {
    why: "ลูกค้ารายนี้ถูกรวมหรือทำเป็นข้อมูลนิรนามแล้ว",
    next: "เปิดลูกค้ารายที่ถูกรวมไปแล้วแทน หรือค้นหาลูกค้าใหม่อีกครั้ง",
  },
  T10: {
    why: "ต้องมีสิทธิ์มอบหมายรายการนี้",
    next: "ให้หัวหน้าทีมหรือผู้จัดการสาขาเป็นผู้มอบหมายรายการนี้",
  },
  T11: {
    why: "ผู้รับผิดชอบใหม่อยู่นอกขอบเขตที่คุณมอบหมายได้",
    next: "เลือกผู้รับผิดชอบที่อยู่ในทีมหรือสาขาที่คุณดูแล",
  },
  T12: {
    why: "ผู้รับผิดชอบที่เลือกไม่ได้สังกัดสาขาของรายการ",
    next: "เลือกพนักงานที่มีบทบาทอยู่ในสาขาของรายการนี้",
  },
  T13: {
    why: 'เปลี่ยนผู้รับผิดชอบหรือสาขาด้วยปุ่ม "มอบหมาย" เท่านั้น',
    next: 'ปิดหน้าต่างนี้ แล้วกดปุ่ม "มอบหมาย" ที่รายการ',
  },
  T14: {
    why: "ข้อมูลช่องนี้เปลี่ยนไม่ได้หลังบันทึก",
    next: "ถ้าข้อมูลผิด ให้บันทึกเป็นรายการใหม่ หรือแจ้งผู้จัดการสาขา",
  },
  T15: {
    why: "ต้องมีสิทธิ์มอบหมายทั้งสาขาต้นทางและปลายทาง",
    next: "ให้ผู้จัดการที่ดูแลทั้งสองสาขาเป็นผู้ย้ายรายการนี้",
  },
  T16: {
    why: "ต้องเลือกผู้รับผิดชอบ",
    next: "เลือกผู้รับผิดชอบก่อนกดบันทึก",
  },
  T20: {
    why: "รับคิวแล้วจึงแก้ไขรายละเอียดอื่น",
    next: 'กด "รับคิว" ก่อน แล้วจึงแก้ไขรายละเอียดของรายการ',
  },
  T21: {
    why: "ปิดการให้บริการด้วยปุ่มบันทึกผล",
    next: 'ใช้ปุ่ม "บันทึกผล" เพื่อปิดการให้บริการรายการนี้',
  },
  T22: {
    why: "เกิน 15 นาที ต้องให้หัวหน้าทีมหรือผู้จัดการยกเลิก",
    next: "แจ้งหัวหน้าทีมหรือผู้จัดการสาขาให้ยกเลิกรายการนี้ให้",
  },
  T23: {
    why: "การให้บริการนี้ปิดแล้ว",
    next: "เปิดรายการใหม่สำหรับการให้บริการครั้งนี้ หรือแจ้งผู้จัดการสาขาถ้าต้องแก้ข้อมูลย้อนหลัง",
  },
  T24: {
    why: "ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนลูกค้าของรายการนี้",
    next: "แจ้งหัวหน้าทีมหรือผู้จัดการสาขาให้เปลี่ยนลูกค้าของรายการนี้ให้",
  },
  T25: {
    why: "ต้องให้หัวหน้าทีมหรือผู้จัดการเปลี่ยนผู้รับ",
    next: "แจ้งหัวหน้าทีมหรือผู้จัดการสาขาให้เปลี่ยนผู้รับของรายการนี้ให้",
  },
  T26: {
    why: "ลูกค้ารายนี้ยังไม่ผูกกับสาขาของรายการ · ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า",
    next: "ผูกลูกค้ากับสาขานี้ตอนรับลูกค้า หรือแจ้งผู้จัดการสาขาให้ผูกให้ก่อน",
  },
  T30: {
    why: 'ย้ายขั้นนี้ไม่ได้ (เสนอราคา/รอตัดสินใจต้องมีใบเสนอราคาที่ส่งแล้ว · ย้อนเป็น "สนใจ" ไม่ได้)',
    next: 'ส่งใบเสนอราคาก่อน แล้วจึงย้ายไปขั้น "เสนอราคา" หรือ "รอตัดสินใจ"',
  },
  T31: {
    why: "ต้องมีสิทธิ์ปิดรายการนี้",
    next: "ให้หัวหน้าทีมหรือผู้จัดการสาขาเป็นผู้ปิดรายการนี้",
  },
  T32: {
    why: "ต้องมีสิทธิ์เปิดรายการที่ปิดแล้ว",
    next: "แจ้งผู้จัดการสาขาเพื่อเปิดรายการที่ปิดแล้วนี้ใหม่",
  },
  T33: {
    why: "เปิดรายการใหม่ก่อนแก้ไข",
    next: "เปิดรายการที่ปิดแล้วก่อน จึงจะแก้ไขข้อมูลได้",
  },
  T40: {
    why: "เปลี่ยนสถานะนี้ไม่ได้",
    next: "เลือกสถานะถัดไปที่ระบบเปิดให้เลือกเท่านั้น",
  },
  T41: {
    why: 'ใช้ปุ่ม "แปลงเป็นโอกาสขาย"',
    next: 'กดปุ่ม "แปลงเป็นโอกาสขาย" ที่รายการนี้',
  },
  T42: {
    why: "ต้องมีสิทธิ์เปิด Lead ที่ปิดแล้ว",
    next: "แจ้งผู้จัดการสาขาเพื่อเปิดรายการที่ปิดแล้วนี้ใหม่",
  },
  T43: {
    why: "เปิด Lead ใหม่ก่อนแก้ไข",
    next: "เปิดรายการที่ปิดแล้วก่อน จึงจะแก้ไขข้อมูลได้",
  },
  T50: {
    why: "ส่งแล้ว แก้ได้เฉพาะสถานะ",
    next: "ถ้าต้องแก้รายละเอียด ให้ออกใบเสนอราคาฉบับใหม่แทน",
  },
  T51: {
    why: "เปลี่ยนสถานะใบเสนอราคานี้ไม่ได้",
    next: "เลือกสถานะถัดไปที่ระบบเปิดให้เลือกเท่านั้น",
  },
  T52: {
    why: "เลือกช่องทางที่ส่งใบเสนอราคา",
    next: "เลือกช่องทางที่ส่งใบเสนอราคาก่อนกดบันทึก",
  },
  T60: {
    why: "แก้ไขได้ภายใน 24 ชม. หลังบันทึก",
    next: "บันทึกเป็นรายการใหม่แทน หรือแจ้งผู้จัดการสาขาถ้าต้องแก้ข้อมูลย้อนหลัง",
  },
  T70: {
    why: "เปลี่ยนสถานะงานนี้ไม่ได้",
    next: "เลือกสถานะถัดไปที่ระบบเปิดให้เลือกเท่านั้น",
  },
  T80: {
    why: "สร้างรายการให้ผู้อื่นต้องมีสิทธิ์มอบหมาย",
    next: "สร้างเป็นรายการของตัวเองก่อน แล้วให้หัวหน้าทีมมอบหมายต่อ",
  },
  T81: {
    why: "สถานะเริ่มต้นไม่ถูกต้อง",
    next: "สร้างรายการด้วยสถานะเริ่มต้นที่ระบบกำหนดให้",
  },
  T90: {
    why: "ต้องมีสิทธิ์เปลี่ยนผู้ดูแลลูกค้า",
    next: "ให้หัวหน้าทีมหรือผู้จัดการสาขาเป็นผู้เปลี่ยนผู้ดูแลลูกค้ารายนี้",
  },
};

/* =====================================================================================
   ตัวช่วยอ่านรูปร่างของ error
   ===================================================================================== */

/** รูปร่างที่ทุกทางของฐานข้อมูลสรุปลงมาเหมือนกัน */
type Normalized = {
  message: string;
  code: string | null;
  detail: string | null;
  hint: string | null;
  source: string | null;
  cause: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number") return String(value);
  return null;
};

function normalize(error: unknown): Normalized {
  const empty: Normalized = { message: "", code: null, detail: null, hint: null, source: null, cause: null };
  if (error == null) return empty;
  if (typeof error === "string") return { ...empty, message: error.trim() };

  const rec = asRecord(error);
  if (!rec) return { ...empty, message: String(error) };

  /* PostgrestError ใช้ `details` · PostgreSQL/RpcError ใช้ `detail` · รับทั้งสองแบบ */
  const causeRec = asRecord(rec["cause"]);
  return {
    message: asText(rec["message"]) ?? "",
    code: asText(rec["code"]),
    detail: asText(rec["details"]) ?? asText(rec["detail"]),
    hint: asText(rec["hint"]),
    source: asText(rec["source"]),
    cause: causeRec ? (asText(causeRec["code"]) ?? asText(causeRec["message"])) : asText(rec["cause"]),
  };
}

/** บรรทัดเดียวสำหรับ log — รวมทุกอย่างที่ช่วยไล่ปัญหาได้ **ห้ามแสดงบนหน้าจอ** */
export function toLogLine(error: unknown): string {
  const e = normalize(error);
  const parts = [
    e.source ? `source=${e.source}` : null,
    e.code ? `code=${e.code}` : null,
    e.message ? `message=${e.message}` : null,
    e.detail ? `detail=${e.detail}` : null,
    e.hint ? `hint=${e.hint}` : null,
    e.cause ? `cause=${e.cause}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : String(error);
}

/* ---- ตัวกรองข้อความก่อนขึ้นจอ ------------------------------------------------- */

const THAI = /[฀-๿]/;

/** สิ่งที่บอกว่าข้อความนี้เป็นภาษาของระบบ ไม่ใช่ภาษาของพนักงานหน้าร้าน */
const TECHNICAL = [
  /\b(app|api|core|crm|ref|audit|analytics|jobs|auth|public)\.[a-z_]+/i, // ชื่อ schema.table / schema.function
  /\bp_[a-z_]+/, //                                                        ชื่อพารามิเตอร์ของ RPC
  /\b[0-9a-f]{8}\b/i, //                                                   uuid หรือชิ้นส่วนของ uuid
  /[\w.+-]+@[\w-]+\.[\w.-]+/, //                                           อีเมล
  /\d{9,}/, //                                                             เบอร์โทร · เลขบัตร · คีย์ยาว ๆ
  /"[A-Za-z_][A-Za-z0-9_.$]*"/, //                                         identifier ที่ PostgreSQL ครอบด้วยเครื่องหมายคำพูด
  //                                                                       (คำพูดที่ครอบข้อความไทยไม่เข้าเงื่อนไขนี้ เพราะเป็นข้อความของ UI)
  /\b(relation|column|constraint|schema|table|function|policy|row-level|violates|denied|null value|does not exist|invalid input)\b/i,
] as const;

const looksTechnical = (text: string): boolean => TECHNICAL.some((re) => re.test(text));

/** ตัดสิ่งที่ผู้ใช้ไม่ต้องอ่านออก: อ้างอิงข้อในเอกสาร และป้าย [รอยืนยัน] */
const tidy = (text: string): string =>
  text
    .replace(/\s*\(\s*ข้อ[^()]*\)/g, "")
    .replace(/\s*\[\s*รอยืนยัน[^\]]*\]/g, "")
    .replace(/\s*·\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** ข้อความไทยที่ฐานข้อมูลเขียนมาเอง และปลอดภัยพอจะแสดงตามนั้น */
function thaiFromDb(e: Normalized): string | null {
  for (const raw of [e.hint, e.message]) {
    if (raw === null || !THAI.test(raw)) continue;
    const text = tidy(raw);
    if (text !== "" && !looksTechnical(text)) return text;
  }
  return null;
}

/* ---- ต่อฐานข้อมูลไม่ได้ -------------------------------------------------------- */

const OFFLINE_TEXT =
  /fetch failed|failed to fetch|networkerror|network request failed|socket hang up|other side closed|terminated|econnrefused|econnreset|enotfound|etimedout|eai_again|und_err_|connection refused|connection reset|could not connect|server closed the connection|the database system is|load balancer/i;

/** SQLSTATE ที่แปลว่าต่อไม่ติดหรือระบบไม่พร้อม (class 08 · 57Pxx · 53xxx) */
const OFFLINE_SQLSTATE = /^(08|53|57P)/;

const IS_DEV = process.env.NODE_ENV !== "production";

/** คำแนะนำท้ายข้อความเมื่อต่อฐานข้อมูลไม่ได้ — โหมดพัฒนาบอกคำสั่งที่ต้องสั่งจริง */
const OFFLINE_NEXT = IS_DEV
  ? "โหมดพัฒนา: ฐานข้อมูลทดลองยังไม่ได้เปิด สั่ง npm run dev:db ที่รากโครงการ แล้วโหลดหน้านี้ใหม่"
  : "ระบบกำลังเชื่อมต่อใหม่ กรุณาลองอีกครั้งในอีกสักครู่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ";

function isOffline(error: unknown, e: Normalized): boolean {
  if (e.code !== null && OFFLINE_SQLSTATE.test(e.code)) return true;
  const blob = [e.message, e.detail, e.cause].filter((t): t is string => t !== null).join(" ");
  if (blob !== "" && OFFLINE_TEXT.test(blob)) return true;
  /* fetch ของ Node โยน TypeError เปล่า ๆ พร้อมรหัสจริงใน cause */
  if (error instanceof TypeError && !THAI.test(e.message)) return true;
  /* supabase-js ห่อความผิดพลาดของ fetch มาเป็น PostgrestError ที่ไม่มี SQLSTATE */
  return e.code === null && e.message !== "" && !THAI.test(e.message) && /fetch|network|connect/i.test(e.message);
}

/* ---- รูปแบบข้อความเฉพาะที่ฐานข้อมูลใช้ประจำ ------------------------------------ */

/** app.require_permission: 'ไม่มีสิทธิ์ <code> (ตรวจ MFA และบทบาทของคุณ)' — มีรหัสสิทธิ์ปนมา */
const PERMISSION_PATTERN = /^ไม่มีสิทธิ์\s+\S+\s*\(ตรวจ MFA/;

/** ทุกข้อความที่บอกว่าเซสชันนี้ยังไม่ได้ยืนยันตัวตนสองขั้นตอน */
const MFA_PATTERN = /MFA|สองขั้นตอน/i;

/** constraint ที่ผู้ใช้หน้าร้านมีโอกาสชนจริง (supabase/migrations/0004 · 0005) */
const UNIQUE_MESSAGES: ReadonlyArray<readonly [RegExp, ThaiMessage]> = [
  [
    /customer_contacts_value_active/i,
    {
      title: "ช่องทางติดต่อนี้มีลูกค้ารายอื่นใช้อยู่แล้ว",
      detail: "ค้นหาลูกค้าเดิมด้วยเบอร์โทร LINE ID หรืออีเมลนี้ แล้วเปิดรายการเดิมแทนการสร้างลูกค้าใหม่",
      canRetry: false,
      log: "",
    },
  ],
  [
    /customer_contacts_primary_active/i,
    {
      title: "ลูกค้ารายนี้มีช่องทางติดต่อหลักอยู่แล้ว",
      detail: "ยกเลิกช่องทางหลักเดิมก่อน หรือเลือกช่องทางอื่นเป็นช่องทางหลักแทน",
      canRetry: false,
      log: "",
    },
  ],
  [
    /customer_addresses_primary_active/i,
    {
      title: "ลูกค้ารายนี้มีที่อยู่หลักอยู่แล้ว",
      detail: "ยกเลิกที่อยู่หลักเดิมก่อน หรือเลือกที่อยู่อื่นเป็นที่อยู่หลักแทน",
      canRetry: false,
      log: "",
    },
  ],
  [
    /visits_queue_no_day/i,
    {
      title: "เลขคิวนี้เพิ่งถูกใช้พร้อมกันพอดี",
      detail: "กดบันทึกอีกครั้ง ระบบจะออกเลขคิวใหม่ให้เอง",
      canRetry: true,
      log: "",
    },
  ],
  [
    /interactions_visit_root/i,
    {
      title: "การให้บริการนี้มีบันทึกการติดต่อเริ่มต้นอยู่แล้ว",
      detail: "แก้ไขบันทึกเดิมของการให้บริการนี้แทนการเพิ่มรายการใหม่",
      canRetry: false,
      log: "",
    },
  ],
  [
    /customer_tags_uq/i,
    {
      title: "ป้ายนี้ติดกับลูกค้ารายนี้อยู่แล้ว",
      detail: "เลือกป้ายอื่น หรือปิดหน้าต่างนี้ได้เลย",
      canRetry: false,
      log: "",
    },
  ],
  [
    /duplicate_decisions_customer_uq/i,
    {
      title: "ลูกค้ารายนี้มีผลตัดสินรายการซ้ำอยู่แล้ว",
      detail: "เปิดผลตัดสินเดิมของลูกค้ารายนี้ดูก่อน ถ้าต้องแก้ไขให้แจ้งผู้จัดการสาขา",
      canRetry: false,
      log: "",
    },
  ],
];

/* ---- แผนที่ SQLSTATE → ข้อความไทย ---------------------------------------------- */

type Plain = { title: string; detail: string; canRetry: boolean };

const BY_SQLSTATE: Readonly<Record<string, Plain>> = {
  /* สิทธิ์และขอบเขต */
  "42501": {
    title: "คุณไม่มีสิทธิ์ทำรายการนี้",
    detail: "รายการนี้อาจอยู่นอกสาขาหรือทีมที่คุณดูแล ถ้าคิดว่าควรทำได้ ให้แจ้งผู้จัดการสาขา",
    canRetry: false,
  },
  /* ข้อมูลไม่ครบหรือไม่ตรงกติกา */
  "22023": {
    title: "ข้อมูลที่กรอกยังไม่ครบหรือไม่ถูกต้อง",
    detail: "ตรวจช่องที่ระบบทำเครื่องหมายไว้ แล้วกดบันทึกอีกครั้ง",
    canRetry: false,
  },
  "22P02": {
    title: "รูปแบบข้อมูลที่กรอกไม่ถูกต้อง",
    detail: "ตรวจตัวเลข วันที่ และตัวเลือกในแบบฟอร์ม แล้วกดบันทึกอีกครั้ง",
    canRetry: false,
  },
  P0001: {
    title: "บันทึกรายการนี้ไม่ได้",
    detail: "ตรวจข้อมูลในแบบฟอร์มอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้จัดการสาขา",
    canRetry: false,
  },
  P0002: {
    title: "ไม่พบรายการที่ต้องการ",
    detail: "รายการอาจถูกย้ายหรือเปลี่ยนไปแล้ว โหลดหน้านี้ใหม่อีกครั้ง",
    canRetry: true,
  },
  "23502": {
    title: "ยังกรอกข้อมูลไม่ครบ",
    detail: "กรอกช่องที่จำเป็นให้ครบ แล้วกดบันทึกอีกครั้ง",
    canRetry: false,
  },
  "23503": {
    title: "รายการที่อ้างถึงไม่มีอยู่ในระบบแล้ว",
    detail: "โหลดหน้านี้ใหม่แล้วเลือกรายการอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้จัดการสาขา",
    canRetry: false,
  },
  "23505": {
    title: "ข้อมูลนี้มีอยู่ในระบบแล้ว",
    detail: "ค้นหารายการเดิมก่อน ถ้าไม่พบให้แจ้งผู้ดูแลระบบ",
    canRetry: false,
  },
  "23514": {
    title: "ข้อมูลที่กรอกไม่ตรงกับกติกาของระบบ",
    detail: "ตรวจข้อมูลในแบบฟอร์มอีกครั้ง แล้วกดบันทึกใหม่",
    canRetry: false,
  },
  /* ชนกันชั่วคราว — ลองใหม่ได้ */
  "40001": {
    title: "มีคนอื่นกำลังแก้ไขรายการนี้พร้อมกัน",
    detail: "รอสักครู่แล้วกดบันทึกอีกครั้ง",
    canRetry: true,
  },
  "40P01": {
    title: "มีคนอื่นกำลังแก้ไขรายการนี้พร้อมกัน",
    detail: "รอสักครู่แล้วกดบันทึกอีกครั้ง",
    canRetry: true,
  },
  "55P03": {
    title: "รายการนี้กำลังถูกแก้ไขอยู่",
    detail: "รอสักครู่แล้วลองใหม่อีกครั้ง",
    canRetry: true,
  },
  "57014": {
    title: "ระบบใช้เวลานานเกินไป",
    detail: "ลดช่วงวันที่หรือเงื่อนไขการค้นหาลง แล้วลองใหม่อีกครั้ง",
    canRetry: true,
  },
  "25006": {
    title: "ตอนนี้ระบบเปิดให้อ่านอย่างเดียว",
    detail: "รอสักครู่แล้วลองบันทึกใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ",
    canRetry: true,
  },
  /* ฝั่งแอปเรียกผิด — ผู้ใช้ทำอะไรไม่ได้ */
  "42703": { title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา", canRetry: false },
  "42883": { title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา", canRetry: false },
  "42P01": { title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา", canRetry: false },
};

/** รหัสของ PostgREST เอง (ไม่ใช่ SQLSTATE) */
const BY_PGRST: Readonly<Record<string, Plain>> = {
  PGRST116: {
    title: "ไม่พบรายการที่ต้องการ",
    detail: "รายการอาจถูกย้าย ปิด หรืออยู่นอกสาขาที่คุณดูแล ลองค้นหาใหม่อีกครั้ง",
    canRetry: false,
  },
  PGRST301: {
    title: "เซสชันหมดอายุแล้ว",
    detail: "เข้าสู่ระบบใหม่อีกครั้ง แล้วทำรายการต่อได้เลย",
    canRetry: false,
  },
  PGRST202: { title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา", canRetry: false },
  PGRST204: { title: "ระบบขัดข้อง", detail: "แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา", canRetry: false },
};

/* =====================================================================================
   ตัวแปลงหลัก
   ===================================================================================== */

/** ดึงรหัส JCRM-Tnn ออกจาก error ถ้ามี */
export function transitionCodeOf(error: unknown): string | null {
  const e = normalize(error);
  const found = /\bJCRM-(T\d{2})\b/.exec(`${e.message} ${e.detail ?? ""} ${e.hint ?? ""}`);
  return found?.[1] ?? null;
}

/** คำอธิบายของรหัส transition — คืน null ถ้าเป็นรหัสที่ยังไม่รู้จัก */
export function transitionMessage(code: string): TransitionMessage | null {
  return TRANSITION_MESSAGES[code.replace(/^JCRM-/, "").toUpperCase()] ?? null;
}

/**
 * แปลงความผิดพลาดใด ๆ ให้เป็นข้อความไทยที่แสดงบนหน้าจอได้ทันที
 *
 * `title` และ `detail` ปลอดภัยเสมอ · `log` ไว้เขียน log เท่านั้น ห้ามแสดง
 */
export function toThaiMessage(error: unknown): ThaiMessage {
  const e = normalize(error);
  const log = toLogLine(error);
  const done = (m: Plain): ThaiMessage => ({ title: m.title, detail: m.detail, canRetry: m.canRetry, log });

  /* 0. ไม่มี error จริง ๆ */
  if (error == null) {
    return done({
      title: "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ",
      detail: "ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ",
      canRetry: true,
    });
  }

  /* 1. ยังไม่ได้ตั้งค่าสภาพแวดล้อม (env.ts · db/index.ts โยนมาเอง) */
  if (/ไม่ได้ตั้งค่า/.test(e.message)) {
    return done({
      title: "ระบบยังตั้งค่าไม่ครบ",
      detail: IS_DEV ? "ตรวจไฟล์ web/.env.local ตาม web/.env.example แล้วเริ่มเซิร์ฟเวอร์ใหม่" : "แจ้งผู้ดูแลระบบ",
      canRetry: false,
    });
  }

  /* 2. ต่อฐานข้อมูลไม่ได้ — ต้องตรวจก่อน SQLSTATE เพราะไม่มี SQLSTATE ให้ตรวจ */
  if (isOffline(error, e)) {
    return done({ title: "ตอนนี้ต่อฐานข้อมูลไม่ได้", detail: OFFLINE_NEXT, canRetry: true });
  }

  /* 3. รหัส transition (JCRM-Tnn) — เอกสารกำหนดให้ UI แสดง HINT ภาษาไทย */
  const code = transitionCodeOf(error);
  if (code !== null) {
    const known = TRANSITION_MESSAGES[code];
    const why = (e.hint !== null && THAI.test(e.hint) ? tidy(e.hint) : null) ?? known?.why ?? "ทำรายการนี้ไม่ได้";
    return {
      title: why,
      detail: known?.next ?? "ถ้าจำเป็นต้องทำรายการนี้ ให้แจ้งหัวหน้าทีมหรือผู้จัดการสาขา",
      canRetry: false,
      log,
    };
  }

  /* 4. "ไม่มีสิทธิ์ … (ต้อง … MFA)" — เป็นได้ทั้งบทบาทไม่ถึงและยังไม่ยืนยัน MFA
        ข้อความดิบมีรหัสสิทธิ์ปนมาด้วย จึงเขียนใหม่ให้ครอบทั้งสองกรณีอย่างตรงไปตรงมา */
  if (PERMISSION_PATTERN.test(e.message) || (/ไม่มีสิทธิ์/.test(e.message) && MFA_PATTERN.test(e.message))) {
    return done({
      title: "คุณยังไม่มีสิทธิ์ทำรายการนี้",
      detail:
        "ถ้าบทบาทของคุณต้องยืนยันตัวตนสองขั้นตอน (MFA) ให้ยืนยันก่อน · ถ้ายืนยันแล้วยังทำไม่ได้ ให้แจ้งผู้จัดการสาขา",
      canRetry: false,
    });
  }

  /* 5. เรื่อง MFA ล้วน ๆ — ห้ามบอกว่า "ไม่มีสิทธิ์" ต้องบอกว่าให้ยืนยันตัวตนก่อน
        แยกสองกรณี: ยังไม่ได้ลงทะเบียน TOTP กับ ลงทะเบียนแล้วแต่เซสชันนี้ยังไม่ได้ยืนยัน */
  if (MFA_PATTERN.test(`${e.message} ${e.hint ?? ""}`)) {
    const needsEnrol = /ลงทะเบียน/.test(`${e.message} ${e.hint ?? ""}`);
    return done({
      title: needsEnrol ? "ต้องลงทะเบียนยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" : "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน",
      detail: needsEnrol
        ? "ลงทะเบียนยืนยันตัวตนสองขั้นตอนในหน้าเข้าสู่ระบบ แล้วเข้าใช้งานใหม่อีกครั้ง"
        : "ยืนยันตัวตนสองขั้นตอนในเซสชันนี้ แล้วทำรายการนี้อีกครั้ง",
      canRetry: false,
    });
  }

  /* 6. ยังไม่ได้เข้าสู่ระบบ / เซสชันหมดอายุ — PostgreSQL ตอบเป็นอังกฤษล้วน */
  if (e.code === "42501" && /permission denied for schema/i.test(e.message)) {
    return done({
      title: "เซสชันหมดอายุแล้ว",
      detail: "เข้าสู่ระบบใหม่อีกครั้ง แล้วทำรายการต่อได้เลย",
      canRetry: false,
    });
  }

  /* 7. ข้อมูลซ้ำที่ผู้ใช้หน้าร้านชนบ่อย — ข้อความดิบมีค่าจริง (เบอร์โทร) ห้ามแสดง */
  if (e.code === "23505") {
    const blob = `${e.message} ${e.detail ?? ""}`;
    for (const [pattern, ready] of UNIQUE_MESSAGES) {
      if (pattern.test(blob)) return { ...ready, log };
    }
  }

  /* 8. ข้อความไทยที่ฐานข้อมูลเขียนมาเอง — ใช้ตามนั้น เติมแค่คำแนะนำ */
  const thai = thaiFromDb(e);
  if (thai !== null) {
    const byCode = e.code !== null ? BY_SQLSTATE[e.code] : undefined;
    return {
      title: thai,
      detail: byCode?.detail ?? "ตรวจข้อมูลอีกครั้ง ถ้ายังไม่ได้ให้แจ้งหัวหน้าทีมหรือผู้จัดการสาขา",
      canRetry: byCode?.canRetry ?? false,
      log,
    };
  }

  /* 9. เหลือแต่ข้อความอังกฤษของฐานข้อมูล — ตอบตาม SQLSTATE เท่านั้น */
  if (e.code !== null) {
    const byPgrst = BY_PGRST[e.code];
    if (byPgrst) return done(byPgrst);
    const bySqlstate = BY_SQLSTATE[e.code];
    if (bySqlstate) return done(bySqlstate);
  }

  /* 10. ไม่รู้จักเลย */
  return done({
    title: "ทำรายการนี้ไม่สำเร็จ",
    detail: "ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบพร้อมเวลาที่พบปัญหา",
    canRetry: true,
  });
}
