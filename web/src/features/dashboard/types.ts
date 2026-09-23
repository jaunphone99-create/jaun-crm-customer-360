/* รูปร่างของสิ่งที่ api.get_kpis คืนมา (supabase/migrations/0012_analytics.sql · app.kpi_row)

   จงใจไม่ทำ type ให้ `code` เป็น union ของรหัส KPI ทั้ง 33 ตัว:
   ถ้าฐานข้อมูลเพิ่ม KPI ใหม่ หน้าจอควรเงียบ ๆ ไม่แสดงตัวที่ไม่รู้จัก
   ไม่ใช่ทำให้ tsc พังจนแก้ migration แล้วต้องตามแก้หน้าจอทุกหน้า

   `value` เป็น number | string เพราะ numeric ของ Postgres มาเป็น string ผ่าน PostgREST
   หน้าจอไม่ควรอ่าน `value` เพื่อแสดงผลอยู่แล้ว — ใช้ `display` ที่ฐานข้อมูลจัดรูปแบบมาให้ */

export type KpiKind = "COUNT" | "MONEY" | "RATE" | "MINUTES";

export type KpiRow = {
  code: string;
  /** null = แถวรวมของทั้งขอบเขต (p_group_by = NONE) · มีค่า = uuid ของสาขา/พนักงาน/ช่องทาง */
  group_key: string | null;
  group_label: string | null;
  kind: KpiKind;
  value: number | string | null;
  numerator: number | string | null;
  denominator: number | string | null;
  prev_value: number | string | null;
  /** ข้อความที่ฐานข้อมูลจัดรูปแบบแล้ว ("3,125" · "฿3,332,700" · "24.1%" · "–") — ใช้ตัวนี้เสมอ */
  display: string | null;
  /** ป้ายเปลี่ยนแปลงที่ฐานข้อมูลคิดแล้ว ("+12%" · "+2.1 pp" · "–") */
  change_display: string | null;
  /** ผ่านเป้าหรือไม่ — ฐานข้อมูลเทียบด้วยค่าที่ยังไม่ปัด (ข้อ 1.3) · null = เทียบไม่ได้ */
  target_met: boolean | null;
  extra: Record<string, unknown> | null;
};

export type KpiPeriod = {
  start: string;
  end: string;
  cmp_start: string;
  cmp_end: string;
};

export type KpiScope = {
  branch: string[];
  team: string[];
  own: string[];
  /** true = มีสาขาที่เป็น TEAM/OWN → KPI ที่ไม่ผูกพนักงานคืน NULL (ข้อ 12.4) */
  partial: boolean;
};

export type KpiResult = {
  ok: boolean;
  preset: string;
  group_by: string;
  /** เวลาอ้างอิงของตัวเลขชุดนี้ = app.clock() (ข้อ 1.2) — ห้ามใช้นาฬิกาของเครื่องผู้ใช้แทน */
  clock: string;
  period: KpiPeriod;
  branch_ids: string[];
  scope: KpiScope;
  rows: KpiRow[];
};

/** ช่วงเวลาที่ app.kpi_period รองรับ (CANONICAL ข้อ 12.0) — CUSTOM ต้องมีช่องวันที่จึงยังไม่เปิด */
export const PRESETS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "THIS_WEEK",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_QUARTER",
] as const;

export type Preset = (typeof PRESETS)[number];

/** ชุดการ์ด/วิดเจ็ตของหน้า — ตัดสินจาก scope ของสิทธิ์ dashboard.view (sitemap ข้อ 5.2) */
export type DashboardLayout = "org" | "team" | "staff";

export type DashboardFilters = {
  preset: Preset;
  /** null = ทุกสาขาในสิทธิ์ · มีค่า = รหัสสาขาเดียวที่ผู้ใช้เลือก */
  branchCode: string | null;
};

/* แถวของวิดเจ็ต "กิจกรรมล่าสุด" (W5 · ข้อ 13.5 · 14.7)

   วิดเจ็ตนี้ไม่มี RPC ของตัวเอง — อ่าน crm.customers ตรงผ่าน PostgREST แล้วให้ RLS
   เป็นผู้ตัดสินว่าใครเห็นแถวไหน (เหตุผลเต็มอยู่ใน queries.ts · loadRecentActivity)

   จงใจไม่มีช่องทางติดต่อ (เบอร์ · อีเมล · LINE ID) แม้แต่ฟิลด์เดียว:
   หน้าหลักเป็นหน้าที่เปิดค้างไว้บนจอหน้าร้าน การมีเบอร์ลูกค้าอยู่บนนั้นคือการเปิดเผย
   โดยไม่มีใครกดดู ซึ่งขัดหลัก "เห็นค่าเต็มต้องผ่าน api.reveal_contact และถูกบันทึก" (D33)
   ชื่อลูกค้ายังต้องมี เพราะเป็นสิ่งเดียวที่ทำให้คนอ่านรู้ว่าแถวนี้คือใคร */
export type RecentActivityRow = {
  id: string;
  customer_no: string;
  display_name: string | null;
  /** ป้ายไทยของช่องทางล่าสุด — แปลจาก ref.channels แล้ว · null = ยังไม่มีช่องทาง */
  channel_label: string | null;
  /** ชื่อสาขาของกิจกรรมล่าสุด (last_branch_id) ไม่ใช่สาขาที่ลูกค้าผูกอยู่ (ข้อ 14.9) */
  branch_name: string | null;
  last_activity_at: string | null;
};
