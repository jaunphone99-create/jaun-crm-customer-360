import type { BadgeKey, Preset } from "./types";

/* ป้ายไทยของหน้า 03 — ลอกจาก CANONICAL ข้อ 3.4 · 3.5 · 12.0 ตรงตัว

   ทำไมถึงเก็บไว้ในโค้ด ไม่ได้อ่านจากฐานข้อมูล:
   ป้ายของ lifecycle_stage และป้ายเสริมเป็น ENUM/ธงในฐานข้อมูล ซึ่ง CANONICAL ข้อ 4 ระบุว่า
   "ป้ายไทยของ ENUM ไม่เก็บในฐานข้อมูล" — api.get_kpis ก็คืน group_label เป็น NULL ด้วยเหตุผลเดียวกัน
   ที่นี่จึงเป็นที่เดียวที่แปลรหัสเป็นข้อความ และต้องแก้ตาม CANONICAL เสมอ */

export const LIFECYCLE_ORDER = ["REPEAT", "CUSTOMER", "OPPORTUNITY", "LEAD", "LOST", "IDENTIFIED"] as const;

export const LIFECYCLE_LABEL: Record<string, string> = {
  REPEAT: "ลูกค้าซื้อซ้ำ",
  CUSTOMER: "ลูกค้าปัจจุบัน",
  OPPORTUNITY: "มีโอกาสซื้อ",
  LEAD: "สนใจซื้อ",
  LOST: "ไม่สำเร็จ",
  IDENTIFIED: "รู้จักแล้ว",
};

/** สีป้ายตาม design-system ข้อ 15 (ผ่าน prototype/assets/data.js) */
export const LIFECYCLE_TONE: Record<string, string> = {
  REPEAT: "badge--success",
  CUSTOMER: "badge--success",
  OPPORTUNITY: "badge--warning",
  LEAD: "badge--info",
  LOST: "badge--danger",
  IDENTIFIED: "badge--neutral",
};

/** เรียงตามลำดับของ CANONICAL ข้อ 3.5 — ลำดับนี้คือลำดับที่แสดงบนหน้าจอด้วย */
export const BADGE_ORDER: BadgeKey[] = ["vip", "followingUp", "newCustomer", "notContacted"];

export const BADGE_LABEL: Record<BadgeKey, string> = {
  vip: "VIP",
  followingUp: "ติดตามอยู่",
  newCustomer: "ลูกค้าใหม่",
  notContacted: "ยังไม่ได้ติดต่อ",
};

export const BADGE_TONE: Record<BadgeKey, string> = {
  vip: "badge--navy",
  followingUp: "badge--warning",
  newCustomer: "badge--info",
  notContacted: "badge--danger",
};

/** แสดงได้สูงสุด 3 ป้าย เกินนั้นรวมเป็น +N (CANONICAL ข้อ 3.5) */
export const BADGE_MAX = 3;

/** ช่วงเวลาที่เปิดใช้จริง — prototype เปิดเฉพาะสองค่านี้ (CANONICAL ข้อ 12.0 บรรทัดท้าย) */
export const PRESET_LABEL: Record<Preset, string> = {
  TODAY: "วันนี้",
  LAST_30_DAYS: "30 วันล่าสุด",
};

/** อักษรย่อของ avatar (C-AVATAR · design-system ข้อ 7.5) — ข้ามสระหน้า เ แ โ ใ ไ */
export function initials(name: string | null): string {
  const words = String(name ?? "")
    .replace(/^คุณ/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const out = words
    .map((w) => {
      for (const ch of w) {
        if (!"เแโใไ".includes(ch)) return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
      }
      return "";
    })
    .join("");
  return out || "?";
}

/** ชื่อที่แสดง — "คุณ" เติมที่หน้าจอเท่านั้น ไม่เก็บในคอลัมน์ชื่อ (CANONICAL ข้อ 3.5 บรรทัดท้าย) */
export function polite(name: string | null): string | null {
  if (!name) return null;
  return name.startsWith("คุณ") ? name : `คุณ${name}`;
}
