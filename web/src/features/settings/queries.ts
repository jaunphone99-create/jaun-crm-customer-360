import "server-only";

import { getDb, rpc } from "@/lib/db";

import type { BranchRow, IntegrationLogRow, SettingRow, SourceSystemRow } from "./types";

/* การอ่านข้อมูลของหน้า 18

   `api.get_settings()` คืนเฉพาะคีย์ที่ "ผู้เรียกแก้ได้" เท่านั้น (0011_api.sql)
   → ผู้ดูแลข้อมูลธุรกิจไม่เห็น env/clock · ผู้ดูแลระบบไม่เห็นเกณฑ์ธุรกิจ
   หน้าจอจึงต้องไม่ถือว่า "คีย์ที่ไม่ได้คืนมา = ไม่มีอยู่" แต่ถือว่า "ไม่มีสิทธิ์แก้/ไม่มีสิทธิ์ดูค่า"
   แล้วแสดงแถวนั้นแบบอ่านอย่างเดียวพร้อมเหตุผล (ข้อกำหนดของงานนี้ ข้อ 2)

   ฐานข้อมูลทดลองไม่รองรับ select แบบฝังตาราง จึง query แยกแล้วต่อกันในโค้ด
   (core.branches · core.staff_profiles · ref.source_systems เป็นตารางอ้างอิงเล็ก ๆ) */

type SettingsResult = { ok: boolean; settings: SettingRow[] };

/** ค่าตั้งที่ผู้เรียกแก้ได้ — โยนต่อเมื่ออ่านไม่ได้ ให้หน้าจอเป็นผู้ตัดสินใจว่าจะแสดงอะไรแทน */
export async function loadSettings(): Promise<SettingRow[]> {
  const data = await rpc<SettingsResult>("get_settings");
  return data?.settings ?? [];
}

/** ชื่อพนักงานสำหรับคอลัมน์ "ปรับล่าสุด" — updated_by เป็น uuid ดิบ ต้องแปลงเองเพราะ RPC ไม่ได้ join ให้ */
export async function loadStaffNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v) => v))];
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const { data, error } = await db
    .schema("core")
    .from("staff_profiles")
    .select("id,staff_code,display_name")
    .in("id", unique);
  /* อ่านชื่อไม่ได้ไม่ใช่เหตุให้ทั้งหน้าพัง — คอลัมน์จะแสดงเป็น – แทน */
  if (error || !data) return new Map();
  return new Map(
    (data as { id: string; staff_code: string; display_name: string }[]).map((s) => [
      String(s.id),
      `${s.display_name} · ${s.staff_code}`,
    ])
  );
}

/** สาขา — ใช้ตั้งเวลาทำการเฉพาะสาขา และแปลงรหัสสาขาในค่า business_hours เป็นชื่อที่คนอ่านรู้เรื่อง */
export async function loadBranches(): Promise<BranchRow[]> {
  const db = await getDb();
  const { data, error } = await db.schema("core").from("branches").select("id,code,name_th").order("code");
  if (error || !data) return [];
  return (data as { id: string; code: string; name_th: string }[]).map((b) => ({
    branch_id: String(b.id),
    code: String(b.code),
    name_th: String(b.name_th),
  }));
}

/** ระบบต้นทางของแท็บ Integration (ข้อ 5.7) */
export async function loadSourceSystems(): Promise<SourceSystemRow[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("ref")
    .from("source_systems")
    .select("code,label_th,is_active,is_system")
    .order("sort_order");
  if (error || !data) return [];
  return (data as { code: string; label_th: string; is_active: boolean; is_system: boolean }[]).map((s) => ({
    code: String(s.code),
    label_th: String(s.label_th),
    is_active: Boolean(s.is_active),
    is_system: Boolean(s.is_system),
  }));
}

type IntegrationResult = { ok: boolean; entries: IntegrationLogRow[] };

/**
 * บันทึกการเชื่อมต่อระบบภายนอก (api.list_integration_logs)
 *
 * RPC บังคับสิทธิ์ `integration.manage` เอง — เรียกโดยไม่มีสิทธิ์จะถูกปฏิเสธที่ฐานข้อมูล
 * ผู้เรียกจึงไม่ต้องกรองก่อน แต่หน้าจอเลือกไม่เรียกเลยเมื่อรู้ว่าไม่มีสิทธิ์ เพื่อไม่ให้เกิด error ที่ไม่จำเป็น
 */
export async function loadIntegrationLogs(filter: {
  sourceSystemCode?: string | null;
  status?: string | null;
}): Promise<IntegrationLogRow[]> {
  const p: Record<string, unknown> = { limit: 200 };
  if (filter.sourceSystemCode) p.source_system_code = filter.sourceSystemCode;
  if (filter.status) p.status = filter.status;
  const data = await rpc<IntegrationResult>("list_integration_logs", { p });
  return data?.entries ?? [];
}
