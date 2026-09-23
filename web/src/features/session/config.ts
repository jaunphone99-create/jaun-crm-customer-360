import "server-only";

import { cache } from "react";

import { rpc } from "@/lib/db";

/* ค่าตั้งที่หน้าจอต้องใช้จริง (CANONICAL ข้อ 11.2)

   ทำไมไม่เรียก api.get_settings(): ฟังก์ชันนั้นต้องมีสิทธิ์ `settings.business` หรือ `settings.system`
   ซึ่งพนักงานหน้าเคาน์เตอร์ — คนที่ใช้หน้ารับลูกค้าและเครื่อง counter จริง — ไม่มี
   เดิมจึงต้องฝังตัวเลขไว้ในโค้ดหน้าจอ ผลคือ "แก้ค่าตั้งแล้วระบบไม่เปลี่ยนพฤติกรรม"

   `api.get_display_settings()` จึงถูกเพิ่มเข้ามาเพื่อปิดช่องนี้: อ่านอย่างเดียว
   คืนเฉพาะค่าที่ใช้ "แสดงผล" ไม่มีค่าที่ใช้ตัดสินสิทธิ์ จึงเปิดให้ทุกบัญชีที่ ACTIVE อ่านได้
   ขอบวันของป้าย "ลูกค้าใหม่" คิดมาจากฐานข้อมูลด้วย (derived.new_customer_since)
   เพราะเป็นการนับวันตามขอบเที่ยงคืน Asia/Bangkok ที่เบราว์เซอร์คิดเองไม่ได้ */

/** ค่าเริ่มต้นชุดเดียวกับที่ฐานข้อมูลตั้งไว้ (0001_foundation.sql) — ใช้เมื่ออ่านค่าจริงไม่ได้เท่านั้น */
export const DEFAULTS = {
  visitorWaitingMin: 15,
  visitInServiceMin: 60,
  newCustomerDays: 30,
  sharedCounterIdleMin: 10,
} as const;

export const DEFAULT_SHARED_COUNTER_IDLE_MIN = DEFAULTS.sharedCounterIdleMin;

export type DisplaySettings = {
  /** นาทีที่ถือว่า "รอนาน" ในคิวหน้าร้าน */
  visitorWaitingMin: number;
  /** นาทีที่ถือว่ารับบริการนานเกินปกติ */
  visitInServiceMin: number;
  /** จำนวนวันที่ยังติดป้าย "ลูกค้าใหม่" */
  newCustomerDays: number;
  /** นาทีที่ปล่อยให้เครื่อง counter ว่างได้ก่อนล็อกหน้าจอ */
  sharedCounterIdleMin: number;
  /** ฉบับประกาศความเป็นส่วนตัวที่ใช้อยู่ */
  pdpaNoticeVersion: string | null;
  /** ขอบล่างของป้าย "ลูกค้าใหม่" — ฐานข้อมูลคิดให้ตามขอบเที่ยงคืน Asia/Bangkok */
  newCustomerSince: string | null;
  /** เวลาอ้างอิงของฐานข้อมูลขณะอ่านค่า */
  clock: string | null;
  /** อ่านค่าจริงได้หรือไม่ — false = กำลังใช้ค่าเริ่มต้น */
  fromDatabase: boolean;
};

type Payload = {
  ok: boolean;
  clock?: string;
  settings?: Record<string, unknown>;
  derived?: { new_customer_since?: string };
};

/** แปลงค่า jsonb ที่อาจมาเป็น 10 หรือ "10" ให้เป็นจำนวนบวกที่ใช้ได้จริง */
function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const FALLBACK: DisplaySettings = {
  ...DEFAULTS,
  pdpaNoticeVersion: null,
  newCustomerSince: null,
  clock: null,
  fromDatabase: false,
};

/**
 * ค่าตั้งสำหรับแสดงผล — ยิงฐานข้อมูลครั้งเดียวต่อ request ต่อให้หลายหน้าส่วนถามซ้ำ
 * อ่านไม่ได้ก็ไม่ใช่เหตุให้หน้าพัง: ใช้ค่าเริ่มต้นชุดเดียวกับฐานข้อมูลแล้วทำงานต่อ
 */
export const displaySettings = cache(async (): Promise<DisplaySettings> => {
  try {
    const data = await rpc<Payload>("get_display_settings");
    const s = data?.settings ?? {};
    if (!data?.ok) return FALLBACK;
    return {
      visitorWaitingMin: positiveNumber(s["sla.visitor_waiting_min"], DEFAULTS.visitorWaitingMin),
      visitInServiceMin: positiveNumber(s["sla.visit_in_service_min"], DEFAULTS.visitInServiceMin),
      newCustomerDays: positiveNumber(s["badge.new_customer_days"], DEFAULTS.newCustomerDays),
      sharedCounterIdleMin: positiveNumber(s["session.shared_counter_idle_min"], DEFAULTS.sharedCounterIdleMin),
      pdpaNoticeVersion: typeof s["pdpa.current_notice_version"] === "string" ? s["pdpa.current_notice_version"] : null,
      newCustomerSince: data.derived?.new_customer_since ?? null,
      clock: data.clock ?? null,
      fromDatabase: true,
    };
  } catch {
    return FALLBACK;
  }
});

/** นาทีที่ปล่อยให้เครื่อง counter ว่างได้ก่อนล็อกหน้าจอ */
export async function sharedCounterIdleMinutes(): Promise<number> {
  return (await displaySettings()).sharedCounterIdleMin;
}
