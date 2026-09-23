import "server-only";

import { cache } from "react";

import { rpc } from "@/lib/db";
import type { Access, Scope } from "@/lib/access";

import type { DashboardLayout, KpiResult, KpiRow, Preset } from "./types";

/* การอ่านตัวเลขของหน้า 02

   ทั้งหน้ามีแหล่งข้อมูลเดียวคือ api.get_kpis (supabase/migrations/0012_analytics.sql)
   ซึ่งเป็น SECURITY DEFINER ที่เรียก app.require_permission('dashboard.view') เองเป็นบรรทัดแรก
   และตัดขอบเขตสาขาด้วย app.kpi_scope — หน้าจอจึงไม่ต้อง (และไม่ควร) กรองสาขาซ้ำ
   ส่งสาขาที่ไม่มีสิทธิ์ไป ฐานข้อมูลตัดทิ้งเงียบ ๆ ให้เอง (ข้อ 9.4.1)

   ห้ามเพิ่มฟังก์ชันที่ "รวม" หรือ "หาร" ค่าจากหลายแถวในไฟล์นี้
   ตัวเลขรวมทุกตัวมีแถวของมันเองที่ p_group_by = 'NONE' อยู่แล้ว (ข้อ 12.4) */

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
