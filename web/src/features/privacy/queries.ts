import "server-only";

import { getDb, rpc } from "@/lib/db";

import type {
  AuditEntry,
  ConsentPurpose,
  ConsentRow,
  CurrentConsent,
  CustomerBrief,
  DsrRow,
  StaffBrief,
} from "./types";

/* การอ่านข้อมูลของหน้า 17 · PDPA

   ทุกอย่างอ่านผ่าน RPC หรือตารางที่ RLS เปิดให้อ่านอยู่แล้ว — ไม่มีการเดาข้อมูลจากฝั่งแอป
   ฐานข้อมูลทดลองไม่รองรับ select แบบฝังตาราง จึง query แยกแล้วต่อกันในโค้ด

   ที่นี่ไม่มีการ "นับ" หรือ "รวม" ตัวเลขใด ๆ: ตัวเลขสรุปต้องมาจาก RPC เท่านั้น
   ถ้า RPC ยังไม่มี หน้าจอจะบอกตรง ๆ ว่ายังไม่มีตัวเลข ดีกว่าโชว์เลขที่แอปคิดเอง */

/* --------------------------------------------------------------- คำขอเจ้าของข้อมูล */

/** รายการคำขอในขอบเขตของผู้เรียก — api.list_dsr ตัดสินเองว่าใครเห็นของใคร (manage = ทั้งหมด · ผู้รับ = ของตน) */
export async function loadDsrList(status?: string | null): Promise<DsrRow[]> {
  const data = await rpc<{ ok: boolean; requests: DsrRow[] }>("list_dsr", {
    p: status ? { status } : {},
  });
  return data?.requests ?? [];
}

/* --------------------------------------------------------------------- ตารางอ้างอิง */

/**
 * ลูกค้าตาม id ที่ต้องแปลงเป็นชื่อ/รหัสบนหน้าจอ
 *
 * api.list_dsr คืนมาแค่ customer_id การแสดงเลข uuid ให้คนอ่านไม่มีประโยชน์
 * RLS ของ crm.customers เป็นผู้ตัดสินว่าผู้เรียกเห็นรายไหน — แถวที่หายไปคือแถวที่ไม่มีสิทธิ์เห็น
 */
export async function loadCustomersByIds(ids: string[]): Promise<CustomerBrief[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const db = await getDb();
  const { data, error } = await db
    .schema("crm")
    .from("customers")
    .select("id,customer_no,display_name,record_status,legal_hold")
    .in("id", unique);
  if (error) throw error;
  return (data ?? []).map(toCustomerBrief);
}

/** ลูกค้าหนึ่งรายจากรหัสลูกค้า — null = ไม่มีหรือไม่มีสิทธิ์เห็น (ไม่แยกสองกรณีออกจากกัน ข้อ 9.6 F5) */
export async function loadCustomerByNo(customerNo: string): Promise<CustomerBrief | null> {
  const db = await getDb();
  const { data, error } = await db
    .schema("crm")
    .from("customers")
    .select("id,customer_no,display_name,record_status,legal_hold")
    .eq("customer_no", customerNo)
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? toCustomerBrief(row) : null;
}

/**
 * ลูกค้าที่ถูกระงับการลบไว้ (legal hold · ข้อ 10.3)
 *
 * เป็น "รายการที่กรองแล้ว" ไม่ใช่ตัวเลขสรุป จึงอ่านจากตารางตรงได้
 * ยังไม่มี RPC ที่คืนรายการนี้ให้ และการให้ RLS เป็นผู้กรองคือคำตอบที่ตรงกับสิทธิ์จริงที่สุด
 */
export async function loadLegalHolds(limit = 50): Promise<CustomerBrief[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("crm")
    .from("customers")
    .select("id,customer_no,display_name,record_status,legal_hold")
    .is("legal_hold", true)
    .order("customer_no")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toCustomerBrief);
}

function toCustomerBrief(row: Record<string, unknown>): CustomerBrief {
  return {
    customer_id: String(row.id),
    customer_no: String(row.customer_no),
    display_name: String(row.display_name ?? ""),
    record_status: String(row.record_status ?? ""),
    legal_hold: Boolean(row.legal_hold),
  };
}

/** พนักงานที่ต้องแปลง uuid เป็นชื่อ — ผู้รับคำขอ · ผู้ยืนยันตัวตน · ผู้บันทึกความยินยอม */
export async function loadStaffByIds(ids: string[]): Promise<StaffBrief[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const db = await getDb();
  const { data, error } = await db
    .schema("core")
    .from("staff_profiles")
    .select("id,staff_code,display_name")
    .in("id", unique);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    staff_id: String(s.id),
    staff_code: String(s.staff_code),
    display_name: String(s.display_name ?? ""),
  }));
}

/** วัตถุประสงค์ความยินยอมที่ยังใช้งาน — ref.consent_purposes เป็นแหล่งเดียว ห้ามฮาร์ดโค้ดในหน้าจอ */
export async function loadConsentPurposes(): Promise<ConsentPurpose[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("ref")
    .from("consent_purposes")
    .select("code,label_th,sort_order,is_active")
    .is("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    code: String(p.code),
    label_th: String(p.label_th ?? p.code),
    sort_order: Number(p.sort_order ?? 0),
  }));
}

/**
 * ประวัติความยินยอมทั้งหมดของลูกค้ารายเดียว (append-only · แก้หรือลบไม่ได้)
 *
 * api.get_customer_360 คืนเฉพาะ "สถานะปัจจุบัน" (view crm.customer_consent_current)
 * หน้านี้ต้องแสดงประวัติเต็มเพราะการพิสูจน์ความยินยอมคือการชี้ไปที่แถวที่บันทึกไว้ตอนนั้น
 */
export async function loadConsentHistory(customerId: string): Promise<ConsentRow[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("crm")
    .from("customer_consents")
    .select("id,purpose_code,status,channels,notice_version,captured_via,captured_by,captured_at,evidence")
    .eq("customer_id", customerId)
    .order("captured_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    consent_id: String(c.id),
    purpose_code: String(c.purpose_code),
    status: c.status === "WITHDRAWN" ? "WITHDRAWN" : "GRANTED",
    channels: Array.isArray(c.channels) ? c.channels.map(String) : [],
    notice_version: c.notice_version === null ? null : String(c.notice_version),
    captured_via: String(c.captured_via) as ConsentRow["captured_via"],
    captured_by: c.captured_by === null ? null : String(c.captured_by),
    captured_at: String(c.captured_at),
    evidence: c.evidence === null ? null : String(c.evidence),
  }));
}

/* --------------------------------------------------------------------- ค่าตั้งระบบ */

/** ค่าตั้งของ PDPA ที่หน้านี้ต้องแสดง — null = ผู้เรียกไม่มีสิทธิ์อ่านค่าตั้ง (ไม่ใช่ข้อผิดพลาดของหน้า) */
export type PdpaSettings = { noticeVersion: string | null; anonymizePerDay: number | null };

export async function loadPdpaSettings(): Promise<PdpaSettings> {
  /* ฉบับประกาศความเป็นส่วนตัวเป็นค่าที่ "ทุกคนที่ใช้หน้านี้ต้องเห็น" รวมถึงพนักงานที่รับคำขอหน้าร้าน
     ซึ่งไม่มี settings.business จึงเรียกประตูสำหรับแสดงผลก่อน แล้วค่อยถอยไปใช้ประตูของผู้ดูแลค่าตั้ง
     ทั้งสองทางห่อ try/catch ไว้ เพราะการไม่รู้เลขฉบับประกาศไม่ควรทำให้หน้าทั้งหน้าล่ม */
  let noticeVersion: string | null = null;
  try {
    const display = await rpc<{ ok: boolean; settings?: Record<string, unknown> }>("get_display_settings");
    const v = display?.settings?.["pdpa.current_notice_version"];
    if (typeof v === "string") noticeVersion = v;
  } catch {
    /* ฐานข้อมูลที่ยังไม่มีประตูนี้ — ใช้ api.get_settings แทนด้านล่าง */
  }

  let anonymizePerDay: number | null = null;
  try {
    const data = await rpc<{ ok: boolean; settings: { key: string; value: unknown }[] }>("get_settings");
    const rows = data?.settings ?? [];
    const pick = (key: string) => rows.find((s) => s.key === key)?.value;
    const notice = pick("pdpa.current_notice_version");
    const perDay = pick("dsr.anonymize_per_day");
    if (noticeVersion === null && typeof notice === "string") noticeVersion = notice;
    if (typeof perDay === "number") anonymizePerDay = perDay;
  } catch {
    /* api.get_settings เปิดเฉพาะผู้มี settings.business/system — ผู้รับคำขอหน้าร้านไม่มี
       เพดานทำข้อมูลนิรนามจึงไม่แสดงให้เขา ซึ่งถูกต้อง เพราะเขาทำข้อมูลนิรนามไม่ได้อยู่แล้ว */
  }

  return { noticeVersion, anonymizePerDay };
}

/* ------------------------------------------------------------------- ร่องรอยการทำงาน */

/**
 * ประวัติการแก้ไขของ entity หนึ่งตัว (api.get_entity_history)
 *
 * ใช้ตอบคำถาม "ใครยืนยัน ใครดำเนินการ เมื่อไร" ด้วยของจริงจาก audit.audit_logs
 * ไม่ใช่จากสิ่งที่หน้าจอเดาเอาเองจากสถานะปัจจุบันของแถว
 */
export async function loadEntityHistory(entityType: string, entityId: string): Promise<AuditEntry[]> {
  try {
    const data = await rpc<{ ok: boolean; entries: AuditEntry[] }>("get_entity_history", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    return data?.entries ?? [];
  } catch {
    /* ผู้ที่ไม่มี audit.read จะถูกปฏิเสธที่ฐานข้อมูล — หน้าจอแสดงว่า "ดูร่องรอยไม่ได้" แทนที่จะพัง */
    return [];
  }
}

/**
 * ใครเป็นผู้ตั้ง legal hold ครั้งล่าสุด
 *
 * ตอบจาก audit.audit_logs ไม่ใช่จาก crm.customers.updated_by เพราะคอลัมน์นั้นถูกทับ
 * ด้วยการแก้ไขอะไรก็ได้ครั้งหลังสุด การเอามาตอบคำถามนี้จะได้ชื่อผิดคนโดยไม่มีใครสังเกต
 */
export function legalHoldSetter(entries: AuditEntry[]): {
  actor: string | null;
  at: string | null;
  reason: string | null;
} {
  const hit = entries.find(
    (e) => (e.changed_fields ?? []).includes("legal_hold") && e.after?.legal_hold === true
  );
  if (!hit) return { actor: null, at: null, reason: null };
  return {
    actor: hit.actor_label ?? hit.actor_staff_code ?? null,
    at: hit.occurred_at,
    reason: hit.reason,
  };
}

/* ------------------------------------------------------ ความยินยอมสถานะปัจจุบัน */

export type Customer360Consents = {
  current: CurrentConsent[];
  /** legal_hold ที่ api.get_customer_360 ยืนยัน — ใช้ค่านี้แทนค่าที่อ่านจากตารางตรง ๆ */
  legalHold: boolean;
  displayName: string;
  recordStatus: string;
};

/**
 * สถานะความยินยอมปัจจุบันของลูกค้าหนึ่งราย (api.get_customer_360)
 *
 * ใช้ RPC ตัวนี้แทนการเลือกแถวล่าสุดเองจากประวัติ เพราะ "แถวล่าสุดต่อวัตถุประสงค์"
 * ถูกนิยามไว้แล้วที่ view crm.customer_consent_current — ถ้าหน้าจอเลือกเอง
 * นิยามจะมีสองที่และวันหนึ่งจะไม่ตรงกัน
 *
 * RPC ตัวนี้ยังบันทึก CUSTOMER_VIEWED ลง access log ด้วย ซึ่งถูกต้องแล้ว:
 * การเปิดดูความยินยอมของลูกค้าคือการเปิดดูข้อมูลส่วนบุคคล และต้องตรวจสอบย้อนหลังได้
 */
export async function loadCurrentConsents(customerId: string): Promise<Customer360Consents> {
  const data = await rpc<{
    ok: boolean;
    header?: { display_name?: string; legal_hold?: boolean; record_status?: string };
    consents?: CurrentConsent[];
  }>("get_customer_360", { p_customer_id: customerId });
  return {
    current: data?.consents ?? [],
    legalHold: Boolean(data?.header?.legal_hold),
    displayName: String(data?.header?.display_name ?? ""),
    recordStatus: String(data?.header?.record_status ?? ""),
  };
}
