import type { KpiPeriod, KpiScope } from "./types";

/* รูปร่างของสิ่งที่ api.get_dashboard_charts คืนมา

   ทุกฟิลด์ที่ลงท้ายด้วย `_display` คือข้อความที่ฐานข้อมูลปัดและจัดรูปแบบมาแล้วตาม
   CANONICAL ข้อ 1.3 — หน้าจอมีหน้าที่วางลงไปเฉย ๆ ห้ามปัดซ้ำ (ข้อ 20.15)
   ส่วน `share` / `pct` เป็นสัดส่วน 0–1 ที่ฐานข้อมูลคิดให้แล้ว มีไว้ให้ "วาดความยาว"
   เท่านั้น ห้ามเอาไปทำเป็นข้อความร้อยละเอง เพราะจะปัดคนละแบบกับ `_display`

   `value` / `lead_value` เผื่อเป็น string เพราะ numeric ของ Postgres มาเป็น string
   ผ่าน PostgREST — หน้าจอไม่อ่านสองตัวนี้เพื่อแสดงผล ใช้แค่เช็กว่ามีข้อมูลหรือไม่ */

export type ChartNum = number | string;

/** ขั้นของ Funnel — RPC เรียงมาแล้ว (ลูกค้าเข้าร้าน → Leads → Opportunities → ปิดการขาย) */
export type FunnelStage = {
  code: string;
  label_th: string;
  /** ชื่อ CSS custom property ของสีแท่ง เช่น "--chart-1" (ข้อ 15) */
  chart_token: string;
  value: ChartNum;
  display: string;
  /** สัดส่วน 0–1 เทียบ **ขั้นแรก** — ใช้กำหนดความกว้างแท่งได้ทันที */
  share: number;
  /** "28.5%" ที่ฐานข้อมูลปัดแล้ว */
  share_display: string;
};

/** ส่วนแบ่งของช่องทางหนึ่งในโดนัท — RPC เรียงตาม sort_order ของ ref.channels มาแล้ว */
export type ChannelSegment = {
  code: string;
  label_th: string;
  chart_token: string;
  value: ChartNum;
  display: string;
  /** สัดส่วน 0–1 ของยอดรวม — ใช้กำหนดความยาวส่วนโค้ง */
  pct: number;
  pct_display: string;
};

/* total เป็น null และ segments ว่าง เมื่อขอบเขตของผู้ใช้เป็น TEAM/OWN (scope.partial = true)
   เพราะ "ลูกค้าไม่ซ้ำ" นับตามผู้รับผิดชอบไม่ได้ (ข้อ 12.4) — ไม่ใช่กรณีข้อมูลหาย */
export type ChannelBreakdown = {
  total: ChartNum | null;
  total_display: string | null;
  segments: ChannelSegment[];
};

/** เหตุผลที่ไม่สำเร็จ — 5 อันดับแรก + "_OTHERS" เรียงมากไปน้อยมาแล้ว ห้ามเรียงใหม่ */
export type LostReason = {
  code: string;
  label_th: string;
  value: ChartNum;
  display: string;
  /* จำนวนในกองนั้นที่ปิดไม่สำเร็จตั้งแต่ยังเป็น Lead (crm.leads.status = 'LOST')
     ส่วนที่เหลือ (value − lead_value) คือโอกาสขายที่ปิดไม่สำเร็จ
     ทั้งสองส่วน "ปิดแล้ว" ไม่ใช่รายการที่ยังเปิดค้างอยู่ให้ตามต่อ — อย่าเขียนป้ายว่า "ยังเป็น Lead" */
  lead_value: ChartNum;
  lead_display: string;
  /** สัดส่วน 0–1 ของยอดรวมทุกเหตุผล */
  pct: number;
  pct_display: string;
};

export type DashboardChartsResult = {
  ok: boolean;
  /** เวลาอ้างอิงของตัวเลขชุดนี้ = app.clock() (ข้อ 1.2) */
  clock: string;
  preset: string;
  period: KpiPeriod;
  branch_ids: string[];
  scope: KpiScope;
  funnel: FunnelStage[];
  channels: ChannelBreakdown;
  lost_reasons: LostReason[];
};
