import "server-only";

import { getDb, rpc } from "@/lib/db";

import {
  ISSUE_CODES,
  type BranchRow,
  type CountRow,
  type CustomerBrief,
  type DuplicateDetail,
  type IssueCode,
  type IssueListResult,
  type LeadBrief,
  type OpportunityBrief,
  type PhoneBrief,
  type RefOption,
  type StaffOption,
  type Summary,
  type TaskBrief,
  type VisitBrief,
} from "./types";

/* การอ่านข้อมูลของหน้า 12 · ศูนย์คุณภาพข้อมูล

   กติกาที่ห้ามพลาด
   - **ตัวเลขทุกตัวมาจาก RPC** · หน้าจอไม่บวก ไม่ลบ ไม่นับความยาวของ array ที่กำลังแสดง
     api.list_data_quality_issues คืน counts (ต่อชนิดต่อสาขา) และ total (ของชนิดที่ถาม) มาให้แล้ว
   - เบอร์ที่ส่งไปหน้าจอต้องเป็น value_masked เท่านั้น · ค่าเต็มมีทางเดียวคือ api.reveal_contact
     ซึ่งหน้านี้ไม่มีปุ่มนั้น (ข้อ 6.9 · ข้อกำหนดของงานนี้ ข้อ 4)
   - สิทธิ์ตัดสินที่ RLS · ที่นี่ไม่เติมเงื่อนไขสาขาเพื่อ "กันไว้ก่อน" เพราะจะกลายเป็นกติกาซ้อนกันสองชุด
   - dev-api ยังไม่รองรับ select แบบฝังตาราง จึงอ่านแยกแล้วต่อกันในโค้ด */

/**
 * สรุปของทั้งหน้า — ถาม api.list_data_quality_issues หนึ่งครั้งต่อหนึ่งชนิดปัญหา
 *
 * ทำไมถึงยิงเก้าครั้งแทนที่จะยิงครั้งเดียวแล้วนับเอง: ครั้งเดียวคืน counts แยกรายสาขา
 * การรวมเป็นยอดต่อชนิดจึงต้อง "บวกเลขที่ RPC คืนมา" ซึ่งเป็นการคำนวณตัวเลขที่ฝั่งหน้าจอ
 * และเป็นสิ่งที่ข้อกำหนดของงานนี้ห้ามไว้ตรง ๆ · การถามแยกชนิดทำให้ทุกยอดเป็นค่าที่ฐานข้อมูลนับเอง
 * (total ของแต่ละครั้ง) และได้แถวของชนิดนั้นมาพร้อมกันโดยไม่ต้องเรียกซ้ำตอนเปิดรายละเอียด
 */
export async function loadSummary(branchIds: string[] | null): Promise<Summary> {
  const results = await Promise.all(
    ISSUE_CODES.map((code) =>
      rpc<IssueListResult>("list_data_quality_issues", {
        p_issue_code: code,
        p_branch_ids: branchIds && branchIds.length > 0 ? branchIds : null,
      })
    )
  );

  const byCode = {} as Summary["byCode"];
  ISSUE_CODES.forEach((code, i) => {
    const r = results[i];
    byCode[code] = { total: Number(r?.total ?? 0), rows: r?.rows ?? [] };
  });

  /* counts ไม่ขึ้นกับ p_issue_code (ดูคำอธิบายของ RPC) จึงเก็บชุดเดียวจากคำตอบแรกก็พอ */
  const first = results[0];
  return {
    byCode,
    counts: (first?.counts ?? []) as CountRow[],
    branchIds: first?.branch_ids ?? [],
  };
}

/** จำนวนของชนิดหนึ่งแยกรายสาขา เรียงตามรหัสสาขา — ค่าดิบจาก RPC ทั้งหมด */
export function countsOf(counts: CountRow[], code: IssueCode): CountRow[] {
  return counts
    .filter((c) => c.issue_code === code)
    .slice()
    .sort((a, b) => (a.branch_code ?? "").localeCompare(b.branch_code ?? ""));
}

/** สาขาทั้งหมดที่อ่านได้ — ใช้แปลง branch_id เป็นชื่อที่คนอ่านรู้เรื่อง */
export async function loadBranches(): Promise<BranchRow[]> {
  const db = await getDb();
  const { data, error } = await db.schema("core").from("branches").select("id,code,name_th").order("code");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    branch_id: String(b.id),
    code: String(b.code),
    name_th: String(b.name_th),
  }));
}

/** ชื่อพนักงานของ id ที่กำลังจะแสดง — ตารางเล็ก อ่านเฉพาะคนที่โผล่บนจอ */
export async function loadStaffNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("core")
    .from("staff_profiles")
    .select("id,display_name,nickname")
    .in("id", unique);
  for (const s of (data ?? []) as { id: string; display_name: string | null; nickname: string | null }[]) {
    out.set(String(s.id), s.nickname ?? s.display_name ?? "–");
  }
  return out;
}

/* ห้าม select=* (security-design ข้อ 8.3) · เขียนเป็นข้อความเดียวเพื่อให้ชนิดของผลลัพธ์ถูกอนุมานได้ */
const CUSTOMER_COLUMNS =
  "id,customer_no,display_name,first_name,last_name,nickname,province_code,customer_type,first_branch_id,first_channel_code,first_seen_at,owner_staff_id";

/** ลูกค้าของแถวที่กำลังแสดง — RLS ตัดคนที่ผู้ใช้อ่านไม่ได้ออกให้เอง แถวนั้นจะไม่มีชื่อแสดง */
export async function loadCustomers(ids: string[]): Promise<Map<string, CustomerBrief>> {
  const out = new Map<string, CustomerBrief>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db.schema("crm").from("customers").select(CUSTOMER_COLUMNS).in("id", unique);
  for (const c of (data ?? []) as CustomerBrief[]) out.set(String(c.id), c);
  return out;
}

/** เบอร์แบบปิดบังของลูกค้าชุดที่กำลังแสดง — column grant ไม่มี value_raw ให้อยู่แล้ว */
export async function loadPhones(customerIds: string[]): Promise<Map<string, PhoneBrief[]>> {
  const out = new Map<string, PhoneBrief[]>();
  const unique = [...new Set(customerIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("customer_contacts")
    .select("id,customer_id,contact_type,value_masked,is_primary,is_valid,is_active")
    .eq("contact_type", "PHONE")
    .eq("is_active", true)
    .in("customer_id", unique);
  for (const c of (data ?? []) as {
    id: string;
    customer_id: string;
    value_masked: string | null;
    is_primary: boolean;
    is_valid: boolean;
  }[]) {
    const list = out.get(String(c.customer_id)) ?? [];
    list.push({
      contact_id: String(c.id),
      masked: c.value_masked,
      is_valid: Boolean(c.is_valid),
      is_primary: Boolean(c.is_primary),
    });
    out.set(String(c.customer_id), list);
  }
  return out;
}

type RawDecision = {
  id: string;
  customer_id: string;
  candidate_customer_id: string;
  score: number | null;
  matched_rules: string[] | null;
  override_reason_code: string | null;
  created_by: string | null;
  created_at: string | null;
};

/** คู่ลูกค้าที่อาจซ้ำ พร้อมข้อมูลของทั้งสองฝั่งที่ต้องเอาไปเทียบกันก่อนกดรวม (ข้อ 6.7) */
export async function loadDuplicateDetails(decisionIds: string[]): Promise<Map<string, DuplicateDetail>> {
  const out = new Map<string, DuplicateDetail>();
  const unique = [...new Set(decisionIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("duplicate_decisions")
    .select("id,customer_id,candidate_customer_id,score,matched_rules,override_reason_code,created_by,created_at")
    .in("id", unique);
  const rows = (data ?? []) as RawDecision[];

  const customers = await loadCustomers(rows.flatMap((d) => [d.customer_id, d.candidate_customer_id]));
  for (const d of rows) {
    out.set(String(d.id), {
      decision_id: String(d.id),
      score: d.score === null ? null : Number(d.score),
      matched_rules: d.matched_rules ?? [],
      override_reason_code: d.override_reason_code,
      created_by: d.created_by,
      created_at: d.created_at,
      newer: customers.get(String(d.customer_id)) ?? null,
      existing: customers.get(String(d.candidate_customer_id)) ?? null,
    });
  }
  return out;
}

export async function loadLeads(ids: string[]): Promise<Map<string, LeadBrief>> {
  const out = new Map<string, LeadBrief>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("leads")
    .select("id,lead_no,customer_id,branch_id,owner_staff_id,status,channel_code,created_at")
    .in("id", unique);
  for (const l of (data ?? []) as LeadBrief[]) out.set(String(l.id), l);
  return out;
}

export async function loadTasks(ids: string[]): Promise<Map<string, TaskBrief>> {
  const out = new Map<string, TaskBrief>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("tasks")
    .select("id,task_no,title,customer_id,branch_id,owner_staff_id,status,due_at,is_next_action")
    .in("id", unique);
  for (const t of (data ?? []) as TaskBrief[]) out.set(String(t.id), t);
  return out;
}

export async function loadOpportunities(ids: string[]): Promise<Map<string, OpportunityBrief>> {
  const out = new Map<string, OpportunityBrief>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("opportunities")
    .select("id,opportunity_no,customer_id,branch_id,owner_staff_id,won_at,won_amount")
    .in("id", unique);
  for (const o of (data ?? []) as OpportunityBrief[]) out.set(String(o.id), o);
  return out;
}

export async function loadVisits(ids: string[]): Promise<Map<string, VisitBrief>> {
  const out = new Map<string, VisitBrief>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const db = await getDb();
  const { data } = await db
    .schema("crm")
    .from("visits")
    .select("id,visit_no,customer_id,branch_id,owner_staff_id,started_at")
    .in("id", unique);
  for (const v of (data ?? []) as VisitBrief[]) out.set(String(v.id), v);
  return out;
}

/** ตารางอ้างอิงหนึ่งตัว — เรียงตาม sort_order ของฐานข้อมูล ไม่ใช่ลำดับที่โค้ดคิดเอง */
async function loadRef(table: string): Promise<RefOption[]> {
  const db = await getDb();
  const { data } = await db
    .schema("ref")
    .from(table)
    .select("code,label_th,is_active,sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((r) => ({ code: String(r.code), label: String(r.label_th) }));
}

export const loadChannels = () => loadRef("channels");
export const loadProvinces = () => loadRef("provinces");
export const loadLostReasons = () => loadRef("lost_reasons");
export const loadOwnershipReasons = () => loadRef("ownership_change_reasons");

/** ประเภทธุรกรรมที่นับเป็นการซื้อ — ผูกเลขธุรกรรมแล้วจึงจะทำให้ปัญหาหลุดจริง (ข้อ 3.1) */
export async function loadTransactionTypes(): Promise<RefOption[]> {
  const db = await getDb();
  const { data } = await db
    .schema("ref")
    .from("transaction_types")
    .select("code,label_th,is_active,counts_as_purchase,sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((r) => ({ code: String(r.code), label: String(r.label_th) }));
}

type StaffRpcRow = {
  staff_id: string;
  staff_code: string;
  display_name: string;
  status: string;
  roles: { branch_id: string | null }[];
};

/**
 * ผู้รับผิดชอบที่เลือกได้ในกล่องมอบหมาย
 *
 * ถาม api.list_staff เพราะไม่มี RPC ที่ตอบว่า "ใครรับงานสาขานี้ได้" โดยตรง
 * และ core.staff_role_assignments ไม่ได้เปิดให้อ่านตรง ๆ
 * บทบาทที่ไม่มีสิทธิ์อ่านรายชื่อพนักงานจะได้รายการว่าง แล้วฟอร์มจะเหลือเฉพาะ "รับเอง"
 * ตัวตัดสินจริงยังเป็น app.staff_has_branch_assignment ใน api.assign_owner เสมอ
 */
export async function loadAssignCandidates(branchId: string | null): Promise<StaffOption[]> {
  const data = await rpc<{ ok: boolean; staff: StaffRpcRow[] }>("list_staff", { p: { status: "ACTIVE" } }).catch(
    () => null
  );
  const rows = data?.staff ?? [];
  return rows
    .filter((s) => (branchId === null ? true : s.roles?.some((r) => r.branch_id === branchId)))
    .map((s) => ({ staff_id: s.staff_id, label: `${s.display_name} · ${s.staff_code}` }));
}
