import "server-only";

import { cache } from "react";

import { loadRefs } from "@/features/customers/queries";
import { getDb, rpc, RpcError } from "@/lib/db";
import type { Access, Scope } from "@/lib/access";

import type { DashboardChartsResult } from "./charts.types";
import type { DashboardLayout, KpiResult, KpiRow, Preset, RecentActivityRow } from "./types";

/* การอ่านตัวเลขของหน้า 02

   ตัวเลขทุกตัวของหน้านี้มาจาก SECURITY DEFINER สองตัวใน supabase/migrations/0012_analytics.sql:
   api.get_kpis (การ์ด · ตารางสาขา) และ api.get_dashboard_charts (Funnel · โดนัท · เหตุผลที่ไม่สำเร็จ)
   ทั้งคู่เรียก app.require_permission('dashboard.view') เองเป็นบรรทัดแรก และตัดขอบเขตสาขา
   ด้วย app.kpi_scope — หน้าจอจึงไม่ต้อง (และไม่ควร) กรองสาขาซ้ำ
   ส่งสาขาที่ไม่มีสิทธิ์ไป ฐานข้อมูลตัดทิ้งเงียบ ๆ ให้เอง (ข้อ 9.4.1)

   ข้อยกเว้นเดียวคือ loadRecentActivity ที่อ่าน crm.customers ตรง ๆ เพราะเป็นรายการลูกค้า
   ไม่ใช่ KPI — ไม่มีตัวเลขให้คำนวณ และ RLS ตอบเรื่องสิทธิ์ได้ครบอยู่แล้ว

   ห้ามเพิ่มฟังก์ชันที่ "รวม" · "หาร" · "ปัด" ค่าของ KPI ในไฟล์นี้ (ข้อ 20.15)
   ตัวเลขรวมทุกตัวมีแถวของมันเองที่ p_group_by = 'NONE' อยู่แล้ว (ข้อ 12.4)
   และร้อยละทุกตัวมาพร้อมข้อความที่ปัดแล้ว (`*_display`) จาก get_dashboard_charts */

export type GroupBy = "NONE" | "BRANCH" | "TEAM" | "STAFF" | "CHANNEL" | "STATUS";

/* เรียก api.get_kpis หนึ่งครั้ง — ทุกการ์ด/ตารางของหน้านี้มาจากฟังก์ชันนี้เท่านั้น

   รับสาขาเป็นสตริง ("" = ทุกสาขาในสิทธิ์ · "uuid" = สาขาเดียว) ไม่ใช่ array ตั้งใจ:
   cache() ของ React เทียบอาร์กิวเมนต์ด้วย === ถ้าส่ง array เข้ามา ทุกครั้งจะเป็นคนละ reference
   แล้วตารางสาขากับการ์ด KPI จะยิงคำสั่งเดียวกันซ้ำสองรอบต่อการโหลดหนึ่งครั้ง */
export const loadKpis = cache(
  async (preset: Preset, branchKey: string, groupBy: GroupBy = "NONE"): Promise<KpiResult> =>
    rpc<KpiResult>("get_kpis", {
      p_preset: preset,
      p_branch_ids: branchKey === "" ? null : [branchKey],
      p_group_by: groupBy,
    })
);

/** หาแถวของ KPI หนึ่งตัว — `group_key` null = แถวรวมของทั้งขอบเขต */
export function rowOf(result: KpiResult, code: string, groupKey: string | null = null): KpiRow | null {
  return result.rows.find((r) => r.code === code && r.group_key === groupKey) ?? null;
}

/** รหัสสาขาที่มีข้อมูลใน p_group_by = 'BRANCH' เรียงตามลำดับที่ RPC คืนมา */
export function groupKeysOf(result: KpiResult): string[] {
  const seen = new Set<string>();
  for (const r of result.rows) {
    if (r.group_key !== null) seen.add(r.group_key);
  }
  return [...seen];
}

const SCOPE_RANK: Record<Scope, number> = { OWN: 1, TEAM: 2, BRANCH: 3, ORGANIZATION: 4, SYSTEM: 5 };

/** ขอบเขตสูงสุดของสิทธิ์หนึ่งตัวที่ใช้ได้ "ตอนนี้" — null = ไม่มีสิทธิ์นั้น */
export function effectiveScope(access: Access, permission: string): Scope | null {
  let best: Scope | null = null;
  for (const p of access.permissions) {
    if (p.permission_code !== permission || !p.effective_now) continue;
    if (!best || SCOPE_RANK[p.scope] > SCOPE_RANK[best]) best = p.scope;
  }
  return best;
}

/* ชุดการ์ดของหน้าตัดสินจาก "ขอบเขตของสิทธิ์" ไม่ใช่จากชื่อบทบาท (sitemap ข้อ 5.2)

   ตั้งใจไม่เขียนเป็น if (role === 'STAFF') เพราะบทบาทกับขอบเขตไม่ได้ผูกกันตายตัว:
   องค์กรมอบ dashboard.view scope BRANCH ให้บทบาทใหม่เมื่อไรก็ได้ผ่านหน้า 13
   ถ้าหน้าจออ่านชื่อบทบาท คนนั้นจะเห็นการ์ดชุด "ของฉัน" ทั้งที่ฐานข้อมูลคืนตัวเลขทั้งสาขามาให้แล้ว */
export function layoutFor(scope: Scope | null): DashboardLayout {
  if (scope === "OWN") return "staff";
  if (scope === "TEAM") return "team";
  return "org";
}

/* เรียก api.get_dashboard_charts หนึ่งครั้ง — Funnel · โดนัทแหล่งที่มา · เหตุผลที่ไม่สำเร็จ

   ต้องส่งพารามิเตอร์ "ชุดเดียวกับ" loadKpis เสมอ (preset เดียวกัน · branchKey เดียวกัน)
   ไม่งั้นการ์ด KPI กับกราฟบนหน้าจอเดียวกันจะเป็นคนละขอบเขต แล้วผู้ใช้จะอ่านว่า
   "ลูกค้าไม่ซ้ำ 1,284" แต่กลางโดนัทขึ้นเลขอื่น ซึ่งดูเหมือนระบบคำนวณผิด

   ยิงแยกจาก get_kpis ตั้งใจ เพื่อให้กราฟล่มแล้วการ์ด KPI ยังอยู่ (sitemap ข้อ 5.7)
   รับ branchKey เป็นสตริงด้วยเหตุผลเดียวกับ loadKpis (cache() เทียบด้วย ===) */
export const loadCharts = cache(
  async (preset: Preset, branchKey: string): Promise<DashboardChartsResult> =>
    rpc<DashboardChartsResult>("get_dashboard_charts", {
      p_preset: preset,
      p_branch_ids: branchKey === "" ? null : [branchKey],
    })
);

/** 5 แถวตาม prototype — ยาวกว่านี้วิดเจ็ตจะสูงกว่าตารางสาขาที่อยู่ข้าง ๆ (ข้อ 13.5) */
const RECENT_ACTIVITY_LIMIT = 5;

/* คอลัมน์ที่วิดเจ็ต "กิจกรรมล่าสุด" ใช้จริง — ห้ามเติมคอลัมน์ช่องทางติดต่อเข้ามา
   (เหตุผลอยู่ที่ RecentActivityRow ใน types.ts) · ห้าม select=* ตาม security-design ข้อ 8.3 */
const RECENT_COLUMNS = "id,customer_no,display_name,last_channel_code,last_branch_id,last_activity_at";

type RawRecent = {
  id: string;
  customer_no: string;
  display_name: string | null;
  last_channel_code: string | null;
  last_branch_id: string | null;
  last_activity_at: string | null;
};

/* กิจกรรมล่าสุด — ลูกค้าที่ถูกติดต่อล่าสุด 5 ราย

   ไม่มี RPC สำหรับวิดเจ็ตนี้และไม่ควรมี: มันไม่ใช่ KPI ไม่มีตัวเลขให้คำนวณหรือปัด
   มีแต่ "แถวของลูกค้าที่คุณมองเห็นอยู่แล้ว เรียงตามเวลา" ซึ่ง RLS ของ crm.customers
   ตอบได้ตรง ๆ — STAFF เห็นเฉพาะลูกค้าที่ตัวเองดูแล · BM เห็นทั้งสาขา · MARKETING เห็น 0 แถว
   ถ้าห่อด้วย SECURITY DEFINER จะต้องเขียนกติกาสิทธิ์ซ้ำอีกชุดในฟังก์ชัน แล้วสองชุดนั้น
   จะค่อย ๆ เพี้ยนจากกัน

   เรียงด้วย nullsFirst: false เพราะ DESC ของ Postgres วาง NULL ไว้หน้าสุด —
   ถ้าไม่สั่ง วิดเจ็ตจะเต็มไปด้วยลูกค้าที่ "ยังไม่เคยถูกติดต่อ" ซึ่งตรงข้ามกับชื่อวิดเจ็ต

   branchKey ที่ส่งเข้ามาคือสาขาที่ผู้ใช้เลือกบนตัวกรองของหน้า กรองด้วย last_branch_id
   (ไม่ใช่ crm.customer_branches แบบหน้า 03) เพราะคอลัมน์ "สาขา" ที่วิดเจ็ตนี้แสดงคือ
   สาขาของกิจกรรมล่าสุด — กรองด้วยตารางอื่นแล้วแถวที่ได้จะขึ้นชื่อสาขาอื่นกับที่กรองไว้ */
export const loadRecentActivity = cache(async (branchKey: string): Promise<RecentActivityRow[]> => {
  const supabase = await getDb();

  let q = supabase.schema("crm").from("customers").select(RECENT_COLUMNS).eq("record_status", "ACTIVE");
  if (branchKey !== "") q = q.eq("last_branch_id", branchKey);

  const res = await q
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("customer_no", { ascending: false })
    .limit(RECENT_ACTIVITY_LIMIT);
  if (res.error) throw RpcError.from("crm.customers", res.error);

  /* ลูกค้าที่ยังไม่เคยถูกติดต่อไม่ใช่ "กิจกรรม" จึงต้องไม่อยู่ในรายการนี้
     ตัดที่นี่แทนที่จะใส่เงื่อนไข not.is.null ในคิวรี เพราะ dev-api ยังไม่รองรับตัวดำเนินการ not
     การเรียงแบบ nullslast ดันแถวเหล่านั้นไปท้ายสุดอยู่แล้ว จะเหลือมาก็ต่อเมื่อ
     ขอบเขตของผู้ใช้มีลูกค้าที่มีกิจกรรมไม่ถึง 5 ราย */
  const raw = ((res.data ?? []) as RawRecent[]).filter((r) => r.last_activity_at !== null);
  if (raw.length === 0) return [];

  /* ชื่อสาขา/ช่องทางอ่านจากตารางอ้างอิงกลางตัวเดิมที่หน้า 03 ใช้ ไม่ทำ mapping ซ้ำที่นี่
     (dev-api ไม่รองรับ select แบบฝังตาราง จึงต้องอ่านแยกแล้วต่อกันในโค้ดอยู่ดี) */
  const refs = await loadRefs();

  return raw.map((r) => ({
    id: r.id,
    customer_no: r.customer_no,
    display_name: r.display_name,
    channel_label: r.last_channel_code ? (refs.channelLabels[r.last_channel_code] ?? r.last_channel_code) : null,
    branch_name: r.last_branch_id ? (refs.branchNames[r.last_branch_id] ?? null) : null,
    last_activity_at: r.last_activity_at,
  }));
});
