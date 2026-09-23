import "server-only";

import { getDb, rpc, RpcError } from "@/lib/db";

import type {
  Customer360,
  Customer360Data,
  HistoryEntry,
  NoteRow,
  RefOption,
  TimelineItem,
} from "./types";

/* เพดานของรายการที่หน้านี้ดึง — ต่ำกว่า max_rows = 200 ของ PostgREST เพื่อให้รู้ตัวว่าถูกตัด
   ลูกค้าที่มีประวัติยาวกว่านี้ต้องดูต่อในหน้าประวัติเต็ม (Phase 2) */
const TIMELINE_LIMIT = 100;
const NOTE_LIMIT = 50;

/* ข้อมูลของหน้า 05 · ข้อมูลลูกค้า (Customer 360)

   กติกาที่ห้ามพลาด
   - api.get_customer_360 เขียน audit CUSTOMER_VIEWED ทุกครั้งที่ถูกเรียก จึงเรียก "ครั้งเดียว"
     ต่อการเปิดหน้า · การสลับแท็บเป็นงานฝั่งเบราว์เซอร์ล้วน ไม่ยิงซ้ำ (sitemap-screen-specs ข้อ 8.9)
   - RPC รับ uuid แต่ URL เป็น customer_no จึงต้องแปลงก่อนด้วยการอ่าน crm.customers (RLS คุมอยู่)
   - "ไม่พบ" กับ "ไม่มีสิทธิ์" ต้องแยกจากกันไม่ได้ ทั้งฝั่งฐานข้อมูล (app.api_denied 'ไม่พบลูกค้ารายนี้')
     และฝั่งหน้าจอ เพราะการบอกว่า "มีแถวนี้อยู่แต่คุณดูไม่ได้" คือการรั่วข้อมูล (rls-spec F5)
   - dev-api ไม่รองรับ select แบบฝังตาราง จึงอ่านแยกแล้วต่อกันในโค้ด */

/** ผลของการเปิดหน้า — merged = ลูกค้าถูกรวมไปรายอื่นแล้ว (CANONICAL ข้อ 6.7) */
export type Customer360Result =
  | { status: "ok"; data: Customer360Data }
  | { status: "notfound" }
  | { status: "merged"; survivorNo: string };

type InteractionRow = {
  id: string;
  occurred_at: string;
  channel_code: string;
  direction: string | null;
  interaction_type_code: string;
  summary: string | null;
  visit_id: string | null;
  branch_id: string | null;
  owner_staff_id: string | null;
};

type VisitRow = {
  id: string;
  visit_no: string;
  status: string;
  channel_code: string;
  outcome_code: string | null;
  started_at: string;
  branch_id: string | null;
  owner_staff_id: string | null;
};

type CustomerRow = { id: string; customer_no: string; merged_into_id: string | null };

async function refRows(table: string): Promise<RefOption[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("ref")
    .from(table)
    .select("code,label_th")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw RpcError.from(`ref.${table}`, error);
  return (data ?? []) as RefOption[];
}

/** ป้ายไทยของรหัสเดียวใน ref — อ่านเฉพาะแถวที่ใช้จริง ไม่ดึงทั้งตารางมาเปล่า ๆ */
async function refLabel(table: string, code: string | null): Promise<string | null> {
  if (!code) return null;
  const db = await getDb();
  const { data } = await db.schema("ref").from(table).select("code,label_th").eq("code", code).limit(1);
  const rows = (data ?? []) as RefOption[];
  return rows[0]?.label_th ?? null;
}

/** รวม interaction กับ visit ให้เป็นเส้นเดียว เรียงใหม่ → เก่า

   visit หนึ่งครั้งมักมี interaction "ต้นราก" (is_visit_root) อยู่แล้ว ถ้าเอามารวมดื้อ ๆ
   เหตุการณ์เดียวจะขึ้นสองบรรทัด จึงแสดง visit เฉพาะครั้งที่ยังไม่มี interaction ของตัวเอง
   (เช่น "รับลูกค้าด่วน" ที่ยังไม่บันทึกอะไร) แล้วแปะเลข/สถานะ/ผลของ visit ไว้กับ interaction แทน

   visit ที่ถูกยกเลิก (สร้างผิด) ไม่แสดง และ interaction ของ visit นั้นก็ไม่แสดงด้วย
   (sitemap-screen-specs ข้อ 8.5 "interaction ของ visit ที่ยกเลิกไม่แสดง") */
function buildTimeline(interactions: InteractionRow[], visits: VisitRow[]): TimelineItem[] {
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const cancelled = new Set(visits.filter((v) => v.status === "CANCELLED").map((v) => v.id));
  const coveredVisits = new Set(
    interactions.map((i) => i.visit_id).filter((id): id is string => Boolean(id))
  );

  const items: TimelineItem[] = [];

  for (const ix of interactions) {
    if (ix.visit_id && cancelled.has(ix.visit_id)) continue;
    const visit = ix.visit_id ? visitById.get(ix.visit_id) : undefined;
    items.push({
      key: `ix:${ix.id}`,
      at: ix.occurred_at,
      typeCode: ix.interaction_type_code,
      channelCode: ix.channel_code,
      direction: ix.direction,
      branchId: ix.branch_id,
      summary: ix.summary,
      ownerStaffId: ix.owner_staff_id,
      visitNo: visit?.visit_no ?? null,
      visitStatus: visit?.status ?? null,
      visitOutcomeCode: visit?.outcome_code ?? null,
    });
  }

  for (const v of visits) {
    if (v.status === "CANCELLED" || coveredVisits.has(v.id)) continue;
    items.push({
      key: `visit:${v.id}`,
      at: v.started_at,
      typeCode: "VISIT",
      channelCode: v.channel_code,
      direction: "INBOUND",
      branchId: v.branch_id,
      summary: null,
      ownerStaffId: v.owner_staff_id,
      visitNo: v.visit_no,
      visitStatus: v.status,
      visitOutcomeCode: v.outcome_code,
    });
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export async function loadCustomer360(customerNo: string): Promise<Customer360Result> {
  const db = await getDb();
  const crm = db.schema("crm");

  const { data: found } = await crm
    .from("customers")
    .select("id,customer_no,merged_into_id")
    .eq("customer_no", customerNo)
    .limit(1);

  const row = ((found ?? []) as CustomerRow[])[0];
  if (!row) return { status: "notfound" };

  /* ลูกค้าที่ถูกรวมไปแล้วไม่มีหน้าเป็นของตัวเอง — ต้องพาไปที่รายที่เหลืออยู่ (ข้อ 6.7)
     ถ้าอ่านรายปลายทางไม่ได้ (คนละขอบเขตสิทธิ์) ให้ตอบเหมือนไม่พบ ไม่ใช่พาไปหน้าพัง */
  if (row.merged_into_id) {
    const { data: survivor } = await crm
      .from("customers")
      .select("id,customer_no,merged_into_id")
      .eq("id", row.merged_into_id)
      .limit(1);
    const target = ((survivor ?? []) as CustomerRow[])[0];
    return target ? { status: "merged", survivorNo: target.customer_no } : { status: "notfound" };
  }

  let detail: Customer360;
  try {
    detail = await rpc<Customer360>("get_customer_360", { p_customer_id: row.id });
  } catch (error) {
    /* ฐานข้อมูลตอบ "ไม่พบลูกค้ารายนี้" ทั้งกรณีไม่มีแถวและกรณีสิทธิ์ไม่ถึง — หน้าจอก็ตอบแบบเดียวกัน */
    if (error instanceof RpcError) return { status: "notfound" };
    throw error;
  }
  if (!detail?.ok) return { status: "notfound" };

  /* PostgREST ตัดผลลัพธ์เงียบ ๆ ที่ max_rows = 200 (architecture §3.3)
     ถ้าไม่ขอ limit เอง หน้าจอจะเขียนว่า "ประวัติทุกสาขา" ทั้งที่ข้อมูลถูกตัดไปแล้วโดยไม่มีใครรู้
     จึงขอเกินมา 1 แถวเพื่อรู้ว่ายังมีต่อ แล้วบอกผู้ใช้ตามจริง */
  const [interactionsRes, visitsRes, notesRes, channels, interactionTypes, visitOutcomes, consentPurposes] =
    await Promise.all([
      crm
        .from("interactions")
        .select(
          "id,occurred_at,channel_code,direction,interaction_type_code,summary,visit_id,branch_id,owner_staff_id"
        )
        .eq("customer_id", row.id)
        .order("occurred_at", { ascending: false })
        .limit(TIMELINE_LIMIT + 1),
      crm
        .from("visits")
        .select("id,visit_no,status,channel_code,outcome_code,started_at,branch_id,owner_staff_id")
        .eq("customer_id", row.id)
        .order("started_at", { ascending: false })
        .limit(TIMELINE_LIMIT + 1),
      crm
        .from("customer_notes")
        .select("id,body,is_pinned,created_at,created_by")
        .eq("customer_id", row.id)
        .order("created_at", { ascending: false })
        .limit(NOTE_LIMIT + 1),
      refRows("channels"),
      refRows("interaction_types"),
      refRows("visit_outcomes"),
      refRows("consent_purposes"),
    ]);

  const rawInteractions = (interactionsRes.data ?? []) as InteractionRow[];
  const rawVisits = (visitsRes.data ?? []) as VisitRow[];
  const rawNotes = (notesRes.data ?? []) as NoteRow[];
  const timelineTruncated = rawInteractions.length > TIMELINE_LIMIT || rawVisits.length > TIMELINE_LIMIT;
  const notesTruncated = rawNotes.length > NOTE_LIMIT;
  const interactions = rawInteractions.slice(0, TIMELINE_LIMIT);
  const visits = rawVisits.slice(0, TIMELINE_LIMIT);
  const notes = rawNotes.slice(0, NOTE_LIMIT);
  const timeline = buildTimeline(interactions, visits);

  /* ชื่อคนและชื่อสาขาอ่านแยก เพราะ dev-api/PostgREST ไม่รองรับ embed
     แถวที่สิทธิ์ไม่ถึงจะไม่ถูกคืนมาเอง หน้าจอจึงต้องทนกับ "มี id แต่ไม่มีชื่อ" ได้ */
  const staffIds = [
    ...new Set(
      [
        detail.header.owner_staff_id,
        detail.next_followup?.owner_staff_id ?? null,
        ...notes.map((n) => n.created_by),
        ...timeline.map((t) => t.ownerStaffId),
      ].filter((v): v is string => Boolean(v))
    ),
  ];
  const branchIds = [
    ...new Set(
      [...detail.branches.map((b) => b.branch_id), ...timeline.map((t) => t.branchId)].filter(
        (v): v is string => Boolean(v)
      )
    ),
  ];

  const [staffRes, branchRes, provinceLabel, sourceLabel, history] = await Promise.all([
    staffIds.length
      ? db.schema("core").from("staff_profiles").select("id,display_name,nickname").in("id", staffIds)
      : Promise.resolve({ data: [] }),
    branchIds.length
      ? db.schema("core").from("branches").select("id,name_th").in("id", branchIds)
      : Promise.resolve({ data: [] }),
    refLabel("provinces", detail.header.province_code),
    refLabel("sources", detail.header.first_source_code),
    loadHistory(detail.tabs.can_view_history, row.id),
  ]);

  const staffNames: Record<string, string> = {};
  for (const s of (staffRes.data ?? []) as { id: string; display_name: string; nickname: string | null }[]) {
    staffNames[s.id] = s.nickname || s.display_name;
  }
  const branchNames: Record<string, string> = {};
  for (const b of (branchRes.data ?? []) as { id: string; name_th: string }[]) {
    branchNames[b.id] = b.name_th;
  }

  return {
    status: "ok",
    data: {
      detail,
      timeline,
      notes,
      timelineTruncated,
      notesTruncated,
      history,
      channels,
      interactionTypes,
      visitOutcomes,
      consentPurposes,
      provinceLabel,
      sourceLabel,
      staffNames,
      branchNames,
    },
  };
}

/** ประวัติการแก้ไข — เรียกเฉพาะเมื่อฐานข้อมูลบอกเองว่าดูได้ (tabs.can_view_history) */
async function loadHistory(canView: boolean, customerId: string): Promise<HistoryEntry[]> {
  if (!canView) return [];
  try {
    const result = await rpc<{ ok: boolean; entries: (HistoryEntry & { before?: unknown; after?: unknown })[] }>(
      "get_entity_history",
      { p_entity_type: "CUSTOMER", p_entity_id: customerId }
    );
    /* ตัด before/after ทิ้งที่เซิร์ฟเวอร์ ไม่ส่งข้ามไปฝั่งเบราว์เซอร์

       ภาพแถวก่อน/หลังใส่คอลัมน์ pii มาเป็น {"masked","sha256"} และ 0008_audit.sql บอกเองว่า
       hash ไม่มี salt ใช้เทียบค่าเท่ากันได้ จึง "อ่านได้เฉพาะผู้มี audit.read"
       แต่ api.get_entity_history ปล่อยผ่านให้ผู้มี customer.update ของลูกค้ารายนั้นด้วย
       หน้าจอนี้แสดงแค่ชื่อช่องที่เปลี่ยน การส่งก้อนเต็มไปกับ payload จึงเป็นการเปิดช่องเปล่า ๆ */
    return (result?.entries ?? []).map(({ before: _before, after: _after, ...entry }) => ({
      ...entry,
      before: null,
      after: null,
    }));
  } catch {
    /* แท็บเดียวที่อ่านไม่ได้ต้องไม่ทำให้ทั้งหน้าพัง — แสดงเป็นแท็บว่างแทน */
    return [];
  }
}
