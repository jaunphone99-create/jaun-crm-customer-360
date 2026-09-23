/* รูปร่างข้อมูลของหน้า 03 · ลูกค้า

   ไฟล์นี้ไม่ import อะไรที่เป็น server-only เพราะทั้งหน้าฝั่งเซิร์ฟเวอร์และแผงค้นหาฝั่ง client
   ใช้ชนิดเดียวกัน — ตารางเดียวกันถูกใช้ซ้ำทั้งสองทาง จะได้ไม่มีตารางสองชุดที่ค่อย ๆ เพี้ยนจากกัน */

/** ป้ายเสริมของ CANONICAL ข้อ 3.5 — key เป็นชื่อภายในเพราะ CANONICAL ไม่ได้ตั้งรหัสไว้ */
export type BadgeKey = "vip" | "followingUp" | "newCustomer" | "notContacted";

/** ช่วงเวลา "ติดต่อล่าสุด" ที่ prototype เปิดใช้ (CANONICAL ข้อ 12.0 · sitemap ข้อ 6.7) */
export type Preset = "TODAY" | "LAST_30_DAYS";

/** หนึ่งแถวของตาราง — เบอร์เป็นค่าปิดบังเท่านั้น ไม่มีช่องให้ค่าเต็มเล็ดลอดมา (D33) */
export type CustomerRow = {
  id: string;
  customer_no: string;
  display_name: string | null;
  lifecycle_stage: string;
  last_channel_code: string | null;
  last_branch_id: string | null;
  last_activity_at: string | null;
  /** `crm.customer_contacts.value_masked` ของเบอร์หลักที่ใช้งานอยู่ · ไม่มี → null */
  phone_masked: string | null;
  badges: BadgeKey[];
};

/** ตัวกรองที่อ่านจาก query string ของหน้า — แชร์ลิงก์แล้วได้หน้าเดิม (sitemap ข้อ 6.7) */
export type CustomerFilters = {
  /** รหัสสาขาที่เลือก · null = ทุกสาขาที่สิทธิ์อนุญาต */
  branchCode: string | null;
  stages: string[];
  badges: BadgeKey[];
  channels: string[];
  preset: Preset;
  page: number;
};

export type CustomerListResult = {
  rows: CustomerRow[];
  /** ยอดรวมของคิวรีเดียวกัน · null = ฐานข้อมูลไม่ได้คืนยอดรวมมา → แถบท้ายตารางแสดง "–" */
  total: number | null;
  /** ลำดับของแถวแรกในหน้า (1-based) ใช้กับ showing() */
  from: number;
  pageSize: number;
  /** จำนวนแถวที่หน้าต่าง range ของคิวรีหลักคืนมา ก่อนถูกตัดด้วยตัวกรองที่ทำต่อในโค้ด
      ใช้ตัดสินว่ามีหน้าถัดไปไหมเมื่อยังไม่รู้ยอดรวม — ถ้าใช้ rows.length แทน
      หน้าที่ถูกตัดจนเหลือไม่เต็ม 20 แถวจะทำให้ปุ่มหน้าถัดไปหายไปทั้งที่ยังมีข้อมูลต่อ */
  windowSize: number;
};

/** สิ่งที่หน้าตารางต้องใช้แปลรหัสเป็นข้อความไทย — ส่งมาจากเซิร์ฟเวอร์ครั้งเดียว */
export type CustomerRefs = {
  branchNames: Record<string, string>;
  channelLabels: Record<string, string>;
};

/** ผลค้นหาจาก api.search_customers · กลุ่มอื่นเป็นตัวเลขอ่านอย่างเดียว (Phase 2) */
export type SearchState = {
  status: "idle" | "ok" | "invalid" | "error";
  term: string;
  message: string | null;
  rows: CustomerRow[];
  otherGroups: { leads: number; opportunities: number; quotations: number; transactions: number };
};

export const SEARCH_IDLE: SearchState = {
  status: "idle",
  term: "",
  message: null,
  rows: [],
  otherGroups: { leads: 0, opportunities: 0, quotations: 0, transactions: 0 },
};
