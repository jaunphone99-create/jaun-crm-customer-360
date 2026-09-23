import "server-only";

import { getDb, rpc } from "@/lib/db";

import { fieldChanges, type FieldChange } from "./mask";
import {
  PURPOSE_LABELS,
  RPC_MAX_ROWS,
  type AccessEntry,
  type AccessFilter,
  type AuditEntry,
  type AuditFilter,
  type LoginEvent,
  type SecurityAuditEntry,
  type SecurityFilter,
} from "./types";

/* การอ่านข้อมูลของหน้า 16

   หน้านี้อ่านผ่าน RPC สี่ตัวเท่านั้น — api.search_audit · api.search_access_log ·
   api.search_security_log · api.get_entity_history — และไม่แตะตาราง audit.* ตรง ๆ เพราะ schema audit ไม่ได้ GRANT ให้
   authenticated อยู่แล้ว (0008_audit.sql) การตัดสินว่าใครเห็นอะไรจึงอยู่ที่ฐานข้อมูลล้วน

   ของสำคัญอีกอย่าง: ภาพแถว before/after ถูกแปลงเป็นข้อความที่ปลอดภัย "ที่เซิร์ฟเวอร์"
   ก่อนส่งข้ามไปฝั่งเบราว์เซอร์เสมอ (ดู mask.ts) — ชนิด AuditRow ด้านล่างจึงไม่มีช่อง before/after ดิบ
   เพื่อให้ลืมไม่ได้ ไม่ใช่แค่ "จำไว้ว่าอย่าส่ง" */

/** แถวที่พร้อมส่งให้หน้าจอ — ไม่มี jsonb ดิบติดไปด้วย */
export type AuditRow = {
  id: number;
  occurredAt: string;
  actorStaffId: string | null;
  actorStaffCode: string | null;
  actorLabel: string | null;
  actorRoles: string[];
  aal: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityRef: string | null;
  branchId: string | null;
  changedFields: string[];
  reason: string | null;
  changes: FieldChange[];
};

function toRow(e: AuditEntry): AuditRow {
  return {
    id: e.id,
    occurredAt: e.occurred_at,
    actorStaffId: e.actor_staff_id,
    actorStaffCode: e.actor_staff_code,
    actorLabel: e.actor_label,
    actorRoles: e.actor_roles ?? [],
    aal: e.aal,
    action: e.action,
    entityType: e.entity_type,
    entityId: e.entity_id,
    entityRef: e.entity_ref,
    branchId: e.branch_id,
    changedFields: e.changed_fields ?? [],
    reason: e.reason,
    changes: fieldChanges(e.before, e.after, e.changed_fields),
  };
}

/** ผลการค้น พร้อมธงบอกว่าชนเพดานของ RPC หรือยัง */
export type AuditResult = {
  rows: AuditRow[];
  /** มีคำค้นอย่างน้อยหนึ่งชุดที่คืนครบ 200 แถว = ยังมีของเก่ากว่านี้ที่ยังไม่ได้แสดง */
  truncated: boolean;
};

async function searchOnce(filter: AuditFilter): Promise<AuditEntry[]> {
  const data = await rpc<{ ok: boolean; entries: AuditEntry[] }>("search_audit", {
    p: { ...filter, limit: RPC_MAX_ROWS },
  });
  return data?.entries ?? [];
}

/**
 * ค้น audit ธุรกิจ
 *
 * api.search_audit รับ action ได้ทีละค่าเดียว (เทียบด้วย = ตรงตัว) แต่ "มุมมอง" ของหน้านี้
 * เช่น "รวมลูกค้า" กินหลาย action จึงยิงขนานทีละ action แล้วนำผลมาเรียงรวมกัน
 * การต่อผลลัพธ์แบบนี้ไม่ใช่การคิดตัวเลขเอง — ทุกแถวยังเป็นแถวที่ฐานข้อมูลคัดมาให้ทั้งดวง
 * และตัวกรองอื่น (ช่วงเวลา ผู้กระทำ ชนิดรายการ เลขอ้างอิง) ถูกส่งไปพร้อมกันทุกคำค้น
 */
export async function searchAudit(filter: AuditFilter, actions: string[]): Promise<AuditResult> {
  const batches = actions.length
    ? await Promise.all(actions.map((action) => searchOnce({ ...filter, action })))
    : [await searchOnce(filter)];

  const truncated = batches.some((b) => b.length >= RPC_MAX_ROWS);

  /* ยิงหลายคำค้นแล้วอาจได้แถวเดียวกันซ้ำ (action ซ้ำข้ามมุมมอง) — ตัดด้วย id ของ audit_logs */
  const byId = new Map<number, AuditEntry>();
  for (const batch of batches) for (const e of batch) byId.set(e.id, e);

  /* เรียงใหม่→เก่าเหมือนที่ RPC เรียงมา (occurred_at DESC, id DESC)
     ใช้ Date.parse แทนการเทียบสตริง เพราะ timestamptz อาจมาคนละ offset แล้วการเทียบตัวอักษรจะสลับลำดับ */
  const rows = [...byId.values()]
    .sort((a, b) => {
      const ta = Date.parse(a.occurred_at);
      const tb = Date.parse(b.occurred_at);
      return ta === tb ? b.id - a.id : tb - ta;
    })
    .slice(0, RPC_MAX_ROWS)
    .map(toRow);

  return { rows, truncated };
}

/* การเข้าถึงข้อมูลลูกค้า (audit.access_logs) เป็นคนละตารางกับการแก้ข้อมูล (audit.audit_logs)
   สองเหตุการณ์ที่เจ้าของโครงการสั่งให้ย้อนดูได้ — เปิดเผยช่องทางติดต่อ และผูกลูกค้าเข้าสาขา —
   อยู่เฉพาะตารางนี้ จึงต้องมี api.search_access_log แยกต่างหาก
   แปลงเป็น AuditRow ชุดเดียวกันเพื่อให้ตารางบนหน้าจอมีที่เดียว ไม่ต้องมีตารางคู่ขนานที่ลืมแก้ */
function accessToRow(e: AccessEntry): AuditRow {
  /* บรรยายเป็นภาษาคนแทนที่จะโยนคอลัมน์ดิบให้ผู้ตรวจสอบตีความเอง */
  const parts: string[] = [];
  if (e.purpose) parts.push(`เหตุผล: ${PURPOSE_LABELS[e.purpose] ?? e.purpose}`);
  if (e.search_term_count > 0) parts.push(`คำค้น ${e.search_term_count} ชุด`);
  if (e.result_count !== null) parts.push(`พบ ${e.result_count} รายการ`);
  if (e.device_id) parts.push(`อุปกรณ์ ${e.device_id}`);

  return {
    id: e.id,
    occurredAt: e.occurred_at,
    actorStaffId: e.actor_staff_id,
    actorStaffCode: e.actor_staff_code,
    /* access_logs ไม่เก็บชื่อผู้กระทำไว้ในแถว (audit_logs เก็บ actor_label) — ปล่อยให้หน้าจอใช้รหัสแทน */
    actorLabel: null,
    actorRoles: e.actor_roles ?? [],
    aal: e.aal,
    action: e.action,
    /* ชี้ไปที่ลูกค้าเพื่อให้กดดู "ประวัติของรายการนี้" ต่อได้เหมือนแถวอื่น */
    entityType: e.customer_id ? "crm.customers" : null,
    entityId: e.customer_id,
    entityRef: null,
    branchId: e.branch_id,
    changedFields: [],
    reason: parts.length > 0 ? parts.join(" · ") : null,
    /* ไม่มี before/after เพราะเป็นการ "อ่าน" ไม่ใช่การ "แก้" */
    changes: [],
  };
}

/** ค้น audit.access_logs — ยิงทีละ action เหมือน searchAudit เพราะ RPC เทียบ action ตรงตัว */
export async function searchAccessLog(filter: AccessFilter, actions: string[]): Promise<AuditResult> {
  const call = async (f: AccessFilter) => {
    const data = await rpc<{ ok: boolean; entries: AccessEntry[] }>("search_access_log", {
      p: { ...f, limit: RPC_MAX_ROWS },
    });
    return data?.entries ?? [];
  };

  const batches = actions.length
    ? await Promise.all(actions.map((action) => call({ ...filter, action })))
    : [await call(filter)];

  const byId = new Map<number, AccessEntry>();
  for (const batch of batches) for (const e of batch) byId.set(e.id, e);

  const rows = [...byId.values()]
    .sort((a, b) => {
      const ta = Date.parse(a.occurred_at);
      const tb = Date.parse(b.occurred_at);
      return ta === tb ? b.id - a.id : tb - ta;
    })
    .slice(0, RPC_MAX_ROWS)
    .map(accessToRow);

  return { rows, truncated: batches.some((b) => b.length >= RPC_MAX_ROWS) };
}

export type SecurityResult = {
  logins: LoginEvent[];
  entries: SecurityAuditEntry[];
  truncated: boolean;
};

/** log เข้าสู่ระบบ + audit ของบทบาท/ผู้ใช้/ตั้งค่า — RPC รับแค่ช่วงเวลา ไม่มีตัวกรองอื่น */
export async function searchSecurityLog(filter: SecurityFilter): Promise<SecurityResult> {
  const data = await rpc<{ ok: boolean; login_events: LoginEvent[]; audit_entries: SecurityAuditEntry[] }>(
    "search_security_log",
    { p: { ...filter, limit: RPC_MAX_ROWS } }
  );
  const logins = data?.login_events ?? [];
  const entries = data?.audit_entries ?? [];
  return { logins, entries, truncated: logins.length >= RPC_MAX_ROWS || entries.length >= RPC_MAX_ROWS };
}

/** ประวัติทั้งหมดของรายการเดียว (api.get_entity_history)
    RPC ตัวนี้ผ่อนให้ผู้มี customer.update ของลูกค้ารายนั้นอ่านได้ด้วย ไม่ใช่เฉพาะ audit.read
    การปิดบังค่าจึงสำคัญไม่น้อยกว่าในตารางหลัก — ใช้ทางเดียวกันผ่าน toRow() */
export async function loadEntityHistory(entityType: string, entityId: string): Promise<AuditRow[]> {
  const data = await rpc<{ ok: boolean; entries: AuditEntry[] }>("get_entity_history", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  return (data?.entries ?? []).map(toRow);
}

export type ActorOption = { staffId: string; staffCode: string; displayName: string };

/** ตัวเลือกช่อง "ผู้กระทำ" — api.search_audit กรองด้วย actor_staff_id (uuid) ไม่ใช่รหัส ST-NNNN
    จึงต้องมีตารางแปลงรหัส→uuid · api.list_staff คืนเฉพาะคนที่ผู้เรียกเห็นได้อยู่แล้ว
    ถ้าอ่านไม่ได้ (บทบาทที่มี audit.read แต่ไม่มี user.read) ให้คืนรายการว่างแล้วซ่อนช่องนี้ไป
    ดีกว่าปล่อยช่องที่กรอกแล้วไม่มีผล */
export async function loadActorOptions(): Promise<ActorOption[]> {
  try {
    const data = await rpc<{ ok: boolean; staff: { staff_id: string; staff_code: string; display_name: string }[] }>(
      "list_staff",
      { p: {} }
    );
    return (data?.staff ?? [])
      .map((s) => ({ staffId: s.staff_id, staffCode: s.staff_code, displayName: s.display_name }))
      .sort((a, b) => a.staffCode.localeCompare(b.staffCode));
  } catch {
    return [];
  }
}

/** ชื่อสาขาไว้แปลง branch_id ของแถว — เป็นข้อมูลประกอบ อ่านไม่ได้ก็แสดงเป็น "–" ได้ */
export async function loadBranchNames(): Promise<Record<string, string>> {
  try {
    const db = await getDb();
    const { data, error } = await db.schema("core").from("branches").select("id,name_th").order("code");
    if (error || !data) return {};
    return Object.fromEntries(data.map((b) => [String(b.id), String(b.name_th)]));
  } catch {
    return {};
  }
}
