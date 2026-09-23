import { cache } from "react";
import "server-only";

import { getDb, rpc } from "@/lib/db";
import type { Access } from "@/lib/access";

import type {
  BadgeKey,
  CustomerFilters,
  CustomerListResult,
  CustomerRefs,
  CustomerRow,
  Preset,
} from "./types";

/* ข้อมูลของหน้า 03 · ลูกค้า

   กติกาที่ห้ามพลาด
   - เบอร์ที่ส่งไปหน้าจอต้องเป็น value_masked เท่านั้น · ค่าเต็มมีทางเดียวคือ api.reveal_contact
     ซึ่งหน้ารายการไม่มีปุ่มนั้น (D33 · sitemap-screen-specs ข้อ 6.5 · 6.9)
   - ขอบของช่วง "ติดต่อล่าสุด" ต้องถามฐานข้อมูล ไม่ใช่คำนวณจากนาฬิกาของเครื่องผู้ใช้
     เพราะ app.clock() บน dev/staging ถูกตรึงไว้และขอบวันใช้เวลาไทย (CANONICAL ข้อ 1.2)
     api.get_kpis คืน period ของ preset มาให้อยู่แล้ว จึงใช้ค่านั้นแทนการคิดวันเอง
   - สิทธิ์ตัดสินที่ RLS · ที่นี่ไม่เติมเงื่อนไขสาขาเพื่อ "กันไว้ก่อน" เพราะจะกลายเป็นกติกาซ้อนกันสองชุด
   - dev-api ยังไม่รองรับ select แบบฝังตาราง จึงอ่านแยกแล้วต่อกันในโค้ด */

/** 20 แถวต่อหน้า (C-PAGINATION · sitemap-screen-specs ข้อ 6.5) */
export const PAGE_SIZE = 20;

/** คอลัมน์ที่ column grant อนุญาตและหน้านี้ใช้จริง — ห้าม select=* (security-design ข้อ 8.3) */
const CUSTOMER_COLUMNS =
  "id,customer_no,display_name,lifecycle_stage,record_status,last_channel_code,last_branch_id,last_activity_at,first_seen_at,has_open_followup,has_new_lead";

type RawCustomer = {
  id: string;
  customer_no: string;
  display_name: string | null;
  lifecycle_stage: string;
  record_status: string;
  last_channel_code: string | null;
  last_branch_id: string | null;
  last_activity_at: string | null;
  first_seen_at: string;
  has_open_followup: boolean;
  has_new_lead: boolean;
};

type KpiResult = { clock: string; period: { start: string; end: string } };

/** ขอบของช่วงเวลา · newSince = ขอบล่างของ "30 วันล่าสุด" ที่ใช้ตัดสินป้าย "ลูกค้าใหม่" */
export type Period = { start: string; end: string; newSince: string; clock: string };

/* ขอบช่วงเวลาของ preset หนึ่ง ๆ — ถามครั้งเดียวต่อ request ต่อ preset
   React cache() กันไม่ให้ยิงซ้ำเมื่อหลายส่วนของหน้าต้องการค่าเดียวกัน
   (get_kpis คำนวณ KPI ทั้งชุด การเรียกซ้ำจึงแพงโดยไม่จำเป็น) */
const periodOf = cache(async (preset: Preset): Promise<KpiResult> => rpc<KpiResult>("get_kpis", { p_preset: preset }));

/** ถามขอบช่วงเวลาจากฐานข้อมูล — preset อื่นต้องถามซ้ำเพราะป้าย "ลูกค้าใหม่" ผูกกับ 30 วันเสมอ */
export async function loadPeriod(preset: Preset): Promise<Period> {
  if (preset === "LAST_30_DAYS") {
    const k = await periodOf("LAST_30_DAYS");
    return { start: k.period.start, end: k.period.end, newSince: k.period.start, clock: k.clock };
  }
  const [selected, last30] = await Promise.all([periodOf(preset), periodOf("LAST_30_DAYS")]);
  return {
    start: selected.period.start,
    end: selected.period.end,
    newSince: last30.period.start,
    clock: selected.clock,
  };
}

/** ชื่อสาขาและช่องทาง — ตารางอ้างอิง อ่านได้ทุกบทบาท ใช้แปลรหัสบนตารางเท่านั้น */
export async function loadRefs(): Promise<CustomerRefs> {
  const supabase = await getDb();
  const [branchRes, channelRes] = await Promise.all([
    supabase.schema("core").from("branches").select("id,name_th"),
    supabase.schema("ref").from("channels").select("code,label_th").order("sort_order", { ascending: true }),
  ]);

  const branchNames: Record<string, string> = {};
  for (const b of (branchRes.data ?? []) as { id: string; name_th: string }[]) branchNames[b.id] = b.name_th;

  const channelLabels: Record<string, string> = {};
  for (const c of (channelRes.data ?? []) as { code: string; label_th: string }[]) channelLabels[c.code] = c.label_th;

  return { branchNames, channelLabels };
}

/** รหัสของ tag VIP — ป้าย VIP ไม่มีคอลัมน์แคช จึงต้องอ่านจาก crm.customer_tags (CANONICAL ข้อ 3.5) */
async function vipTagId(): Promise<string | null> {
  const supabase = await getDb();
  const { data } = await supabase.schema("crm").from("tags").select("id,code").eq("code", "VIP").limit(1);
  return ((data ?? []) as { id: string }[])[0]?.id ?? null;
}

/** ลูกค้าที่ติดป้าย VIP อยู่ — จำกัดที่ max_rows ของ PostgREST (200 แถว) */
async function vipCustomerIds(limitToIds?: string[]): Promise<Set<string>> {
  const tagId = await vipTagId();
  if (!tagId) return new Set();
  const supabase = await getDb();
  let q = supabase.schema("crm").from("customer_tags").select("customer_id").eq("tag_id", tagId);
  if (limitToIds) {
    if (limitToIds.length === 0) return new Set();
    q = q.in("customer_id", limitToIds);
  }
  const { data } = await q;
  return new Set(((data ?? []) as { customer_id: string }[]).map((r) => r.customer_id));
}

/** เบอร์หลักแบบปิดบังของลูกค้าชุดที่กำลังจะแสดง */
async function primaryPhones(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const supabase = await getDb();
  const { data } = await supabase
    .schema("crm")
    .from("customer_contacts")
    .select("customer_id,contact_type,value_masked,is_primary,is_active")
    .eq("contact_type", "PHONE")
    .eq("is_primary", true)
    .eq("is_active", true)
    .in("customer_id", ids);
  for (const c of (data ?? []) as { customer_id: string; value_masked: string | null }[]) {
    if (c.value_masked && !out.has(c.customer_id)) out.set(c.customer_id, c.value_masked);
  }
  return out;
}

/** เติมเบอร์ปิดบังและป้ายเสริมให้แถวที่จะแสดง — อ่านเฉพาะลูกค้าในหน้านี้ ไม่ใช่ทั้งฐาน */
async function decorate(raw: RawCustomer[], newSince: string): Promise<CustomerRow[]> {
  const ids = raw.map((r) => r.id);
  const [phones, vips] = await Promise.all([primaryPhones(ids), vipCustomerIds(ids)]);

  return raw.map((r) => {
    const badges: BadgeKey[] = [];
    if (vips.has(r.id)) badges.push("vip");
    if (r.has_open_followup) badges.push("followingUp");
    if (r.first_seen_at >= newSince) badges.push("newCustomer");
    if (r.has_new_lead) badges.push("notContacted");

    return {
      id: r.id,
      customer_no: r.customer_no,
      display_name: r.display_name,
      lifecycle_stage: r.lifecycle_stage,
      last_channel_code: r.last_channel_code,
      last_branch_id: r.last_branch_id,
      last_activity_at: r.last_activity_at,
      phone_masked: phones.get(r.id) ?? null,
      badges,
    };
  });
}

/* ตัวกรองที่แปลงเป็นเงื่อนไขของฐานข้อมูลได้ตรง ๆ

   ป้ายเสริมสามตัวมีคอลัมน์แคชรองรับ (has_open_followup · has_new_lead · first_seen_at)
   ตาม CANONICAL ข้อ 6.3 บรรทัดท้าย "ป้ายเสริมและตัวกรองหน้า 03 อ่านจากคอลัมน์เหล่านี้"
   ส่วน VIP ไม่มีคอลัมน์แคช จึงต้องแปลงเป็นรายการ id ก่อน */
function applyColumnFilters<T>(query: T, filters: CustomerFilters, newSince: string): T {
  /* เชนของ postgrest-js คืนตัวเองทุกครั้ง — cast เพื่อไม่ต้องประกาศชนิดยาวเหยียดของ builder */
  let q = query as unknown as {
    eq: (c: string, v: unknown) => typeof q;
    in: (c: string, v: unknown[]) => typeof q;
    gte: (c: string, v: unknown) => typeof q;
  };
  if (filters.stages.length) q = q.in("lifecycle_stage", filters.stages);
  if (filters.channels.length) q = q.in("last_channel_code", filters.channels);
  if (filters.badges.includes("followingUp")) q = q.eq("has_open_followup", true);
  if (filters.badges.includes("notContacted")) q = q.eq("has_new_lead", true);
  if (filters.badges.includes("newCustomer")) q = q.gte("first_seen_at", newSince);
  return q as unknown as T;
}

/** ตัวกรองที่ไม่ใช่ค่าเริ่มต้น — ใช้เลือกว่าจะบอกผู้ใช้ว่า "ยังไม่มีลูกค้า" หรือ "ไม่พบตามเงื่อนไข" */
export function hasActiveFilters(filters: CustomerFilters): boolean {
  return (
    filters.stages.length > 0 ||
    filters.badges.length > 0 ||
    filters.channels.length > 0 ||
    filters.preset !== "LAST_30_DAYS" ||
    filters.branchCode !== null
  );
}

/**
 * รายการลูกค้าตามตัวกรอง
 *
 * ค่าเริ่มต้นของหน้า (CANONICAL ข้อ 13.8): record_status = ACTIVE · ติดต่อใน 30 วันล่าสุด ·
 * เรียง `last_activity_at DESC, customer_no DESC` · 20 แถวต่อหน้า
 */
export async function loadCustomers(
  access: Access,
  filters: CustomerFilters,
  period: Period
): Promise<CustomerListResult> {
  const supabase = await getDb();
  const crm = supabase.schema("crm");
  const from = (filters.page - 1) * PAGE_SIZE;

  /* VIP ต้องแปลงเป็นรายการ id ก่อนเสมอ เพราะไม่มีคอลัมน์ให้กรองตรง ๆ
     เพดาน 200 แถวของ PostgREST จึงเป็นเพดานของตัวกรองนี้ด้วย (ดู assumptions) */
  const vipIds = filters.badges.includes("vip") ? [...(await vipCustomerIds())] : null;
  if (vipIds !== null && vipIds.length === 0) {
    return { rows: [], total: 0, from: from + 1, pageSize: PAGE_SIZE, windowSize: 0 };
  }

  const branch = filters.branchCode
    ? access.branches.find((b) => b.code === filters.branchCode)
    : undefined;

  if (branch) {
    /* เลือกสาขาเจาะจง: ขอบเขตและช่วงวันที่อ่านจาก crm.customer_branches
       (ลูกค้าที่ "เชื่อมกับสาขานี้" ไม่ใช่ลูกค้าที่กิจกรรมล่าสุดอยู่สาขานี้ · CANONICAL ข้อ 14.9)
       คอลัมน์ "สาขา" บนตารางยังแสดง last_branch_id เสมอ จึงอาจต่างจากสาขาที่กรอง */
    const linkRes = await crm
      .from("customer_branches")
      .select("customer_id,last_activity_at", { count: "exact" })
      .eq("branch_id", branch.branch_id)
      .gte("last_activity_at", period.start)
      .lt("last_activity_at", period.end)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    if (linkRes.error) throw linkRes.error;

    /* จำนวน id ที่หน้าต่างนี้คืนมา "ก่อน" ถูกตัดด้วยตัวกรองอื่น — เป็นตัวเดียวที่บอกได้ว่ายังมีหน้าถัดไป
       เมื่อยอดรวมเป็น null ถ้าใช้จำนวนแถวที่เหลือหลังกรอง ปุ่มเลื่อนหน้าจะหายไปทั้งที่ยังมีข้อมูลต่อ */
    const linkRows = ((linkRes.data ?? []) as { customer_id: string }[]).length;
    let ids = ((linkRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id);
    if (vipIds) ids = ids.filter((id) => vipIds.includes(id));
    if (ids.length === 0) {
      return {
        rows: [],
        total: linkRes.count ?? null,
        from: from + 1,
        pageSize: PAGE_SIZE,
        windowSize: linkRows,
      };
    }

    let q = crm.from("customers").select(CUSTOMER_COLUMNS).eq("record_status", "ACTIVE").in("id", ids);
    q = applyColumnFilters(q, filters, period.newSince);
    const res = await q
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .order("customer_no", { ascending: false });
    if (res.error) throw res.error;

    const raw = (res.data ?? []) as RawCustomer[];
    /* ยอดรวมของสาขาใช้ได้เฉพาะตอนไม่มีตัวกรองอื่นซ้อน — ถ้ามี ยอดรวมที่แท้จริงยังไม่รู้ ให้แสดง "–" */
    const extraFilters =
      filters.stages.length > 0 || filters.channels.length > 0 || filters.badges.length > 0;
    return {
      rows: await decorate(raw, period.newSince),
      total: extraFilters ? null : (linkRes.count ?? null),
      from: from + 1,
      pageSize: PAGE_SIZE,
      windowSize: linkRows,
    };
  }

  /* ทุกสาขาที่สิทธิ์อนุญาต: RLS จำกัดขอบเขตให้อยู่แล้ว จึงกรองด้วย customers.last_activity_at ตรง ๆ */
  let q = crm
    .from("customers")
    .select(CUSTOMER_COLUMNS, { count: "exact" })
    .eq("record_status", "ACTIVE")
    .gte("last_activity_at", period.start)
    .lt("last_activity_at", period.end);
  if (vipIds) q = q.in("id", vipIds);
  q = applyColumnFilters(q, filters, period.newSince);

  const res = await q
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("customer_no", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (res.error) throw res.error;

  return {
    rows: await decorate((res.data ?? []) as RawCustomer[], period.newSince),
    total: res.count ?? null,
    from: from + 1,
    pageSize: PAGE_SIZE,
    /* ทางนี้ฐานข้อมูลกรองครบในคิวรีเดียว หน้าต่างจึงเท่ากับจำนวนแถวที่ได้ */
    windowSize: (res.data ?? []).length,
  };
}

type SearchResponse = {
  ok: boolean;
  code?: string;
  count?: number;
  groups: {
    customers?: { customer_id: string }[];
    leads?: unknown[];
    opportunities?: unknown[];
    quotations?: unknown[];
    transactions?: unknown[];
  };
};

/**
 * ค้นหาลูกค้าผ่าน `api.search_customers` — ตรงทั้งค่าสำหรับเบอร์/อีเมล/LINE/IMEI
 * และ trigram สำหรับชื่อ · RPC เป็นผู้บันทึก `CUSTOMER_SEARCH` และคุมอัตราเอง (CANONICAL ข้อ 6.5)
 */
export async function searchCustomerRows(term: string, period: Period) {
  const found = await rpc<SearchResponse>("search_customers", { p_term: term });
  if (!found.ok) {
    return {
      ok: false as const,
      rows: [] as CustomerRow[],
      otherGroups: { leads: 0, opportunities: 0, quotations: 0, transactions: 0 },
      code: found.code ?? null,
    };
  }

  const ids = (found.groups.customers ?? []).map((c) => c.customer_id);
  let rows: CustomerRow[] = [];

  if (ids.length > 0) {
    /* การ์ดที่ RPC คืนมาไม่มีสาขาและป้ายเสริม — อ่านแถวเต็มจากตารางเดิมเพื่อให้ตารางหน้าตาเหมือนกัน
       ทุก id ที่ RPC คืนมาคือรายการที่ผู้เรียกอ่านได้อยู่แล้ว RLS จึงไม่ตัดอะไรเพิ่ม */
    const supabase = await getDb();
    const res = await supabase
      .schema("crm")
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq("record_status", "ACTIVE")
      .in("id", ids)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .order("customer_no", { ascending: false });
    if (res.error) throw res.error;
    rows = await decorate((res.data ?? []) as RawCustomer[], period.newSince);
  }

  return {
    ok: true as const,
    rows,
    otherGroups: {
      leads: (found.groups.leads ?? []).length,
      opportunities: (found.groups.opportunities ?? []).length,
      quotations: (found.groups.quotations ?? []).length,
      transactions: (found.groups.transactions ?? []).length,
    },
    code: null,
  };
}
