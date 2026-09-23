import "server-only";

import { getDb, rpc } from "@/lib/db";
import type { Access, AccessBranch } from "@/lib/access";

/* ข้อมูลของหน้า "รับลูกค้าเข้าร้าน"

   กติกาที่ห้ามพลาด
   - "วันนี้" ต้องถามจากฐานข้อมูล ไม่ใช่จากนาฬิกาของเครื่องผู้ใช้
     เพราะ app.clock() บน dev/staging ถูกตรึงไว้ (CANONICAL ข้อ 1.2) และขอบวันใช้เวลาไทย
   - ตัวเลขสรุปมาจาก api.get_kpis เท่านั้น แอปไม่คิดเอง (ข้อ 20.7 ข้อ 5)
   - dev-api ยังไม่รองรับ select แบบฝังตาราง จึงอ่านแยกแล้วต่อกันในโค้ด
     ซึ่งได้ผลเหมือนกันกับ PostgREST จริง และอ่านง่ายกว่าด้วย */

export type VisitStatus = "WAITING" | "IN_SERVICE" | "COMPLETED" | "LEFT" | "CANCELLED";

export type VisitRow = {
  id: string;
  visit_no: string;
  queue_no: number | null;
  status: VisitStatus;
  channel_code: string;
  interest_code: string | null;
  source_code: string | null;
  party_size: number;
  started_at: string;
  service_started_at: string | null;
  ended_at: string | null;
  owner_staff_id: string | null;
  customer_id: string | null;
  outcome_code: string | null;
};

export type RefItem = { code: string; label_th: string };

export type ReceptionData = {
  branch: AccessBranch;
  branches: AccessBranch[];
  /** เวลาอ้างอิงของระบบ ณ ตอนนี้ (app.clock) */
  now: string;
  /** ขอบวันนี้ตามเวลาไทย มาจาก api.get_kpis */
  period: { start: string; end: string };
  visits: VisitRow[];
  staffNames: Map<string, string>;
  customers: Map<string, { customer_no: string; display_name: string | null }>;
  interests: RefItem[];
  sources: RefItem[];
  channels: RefItem[];
  outcomes: RefItem[];
  kpis: { walkIn: number | null; visits: number | null; openVisits: number | null; captureRate: string | null };
};

type KpiRow = { code: string; value: number | string | null; display: string | null };
type KpiResult = {
  ok: boolean;
  rows: KpiRow[];
  clock: string;
  period: { start: string; end: string };
};

const asNumber = (row: KpiRow | undefined): number | null =>
  row && typeof row.value === "number" ? row.value : null;

export async function loadReception(access: Access, branchCode?: string): Promise<ReceptionData> {
  const branches = access.branches;
  const branch = branches.find((b) => b.code === branchCode) ?? branches[0];
  if (!branch) throw new Error("บัญชีนี้ยังไม่ได้ผูกกับสาขาใด");

  const kpis = await rpc<KpiResult>("get_kpis", {
    p_preset: "TODAY",
    p_branch_ids: [branch.branch_id],
  });

  const supabase = await getDb();
  const crm = supabase.schema("crm");
  const ref = supabase.schema("ref");

  const [visitsRes, interestsRes, sourcesRes, channelsRes, outcomesRes] = await Promise.all([
    crm
      .from("visits")
      .select(
        "id,visit_no,queue_no,status,channel_code,interest_code,source_code,party_size,started_at,service_started_at,ended_at,owner_staff_id,customer_id,outcome_code"
      )
      .eq("branch_id", branch.branch_id)
      .gte("started_at", kpis.period.start)
      .lt("started_at", kpis.period.end)
      .order("queue_no", { ascending: true })
      .order("started_at", { ascending: true }),
    ref.from("interest_types").select("code,label_th").eq("is_active", true),
    ref.from("sources").select("code,label_th").eq("is_active", true),
    ref.from("channels").select("code,label_th").eq("is_active", true),
    ref.from("visit_outcomes").select("code,label_th").eq("is_active", true),
  ]);

  if (visitsRes.error) throw visitsRes.error;

  const visits = (visitsRes.data ?? []) as VisitRow[];

  /* ชื่อผู้รับและชื่อลูกค้าอ่านแยก — ตัวไหนที่สิทธิ์ไม่ถึง ฐานข้อมูลจะไม่คืนมาเอง
     หน้าจอจึงต้องรับมือกับกรณี "มี id แต่ไม่มีชื่อ" ได้ ไม่ใช่พังทั้งหน้า */
  const staffIds = [...new Set(visits.map((v) => v.owner_staff_id).filter((v): v is string => Boolean(v)))];
  const customerIds = [...new Set(visits.map((v) => v.customer_id).filter((v): v is string => Boolean(v)))];

  const [staffRes, customerRes] = await Promise.all([
    staffIds.length
      ? supabase.schema("core").from("staff_profiles").select("id,display_name,nickname").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? crm.from("customers").select("id,customer_no,display_name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const staffNames = new Map<string, string>();
  for (const s of (staffRes.data ?? []) as { id: string; display_name: string; nickname: string | null }[]) {
    staffNames.set(s.id, s.nickname || s.display_name);
  }

  const customers = new Map<string, { customer_no: string; display_name: string | null }>();
  for (const c of (customerRes.data ?? []) as { id: string; customer_no: string; display_name: string | null }[]) {
    customers.set(c.id, { customer_no: c.customer_no, display_name: c.display_name });
  }

  const byCode = (rows: { code: string; value: number | string | null; display: string | null }[], code: string) =>
    rows.find((r) => r.code === code);

  return {
    branch,
    branches,
    now: kpis.clock,
    period: kpis.period,
    visits,
    staffNames,
    customers,
    interests: (interestsRes.data ?? []) as RefItem[],
    sources: (sourcesRes.data ?? []) as RefItem[],
    channels: (channelsRes.data ?? []) as RefItem[],
    outcomes: (outcomesRes.data ?? []) as RefItem[],
    kpis: {
      walkIn: asNumber(byCode(kpis.rows, "WALKIN_VISITS")),
      visits: asNumber(byCode(kpis.rows, "VISITS")),
      openVisits: asNumber(byCode(kpis.rows, "OPEN_VISITS")),
      captureRate: byCode(kpis.rows, "CAPTURE_RATE")?.display ?? null,
    },
  };
}
