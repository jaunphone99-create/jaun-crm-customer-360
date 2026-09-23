import type { Metadata } from "next";
import Link from "next/link";

import "@/app/generated/page-quick-capture.css";

import { QuickCaptureForm } from "@/features/capture/QuickCaptureForm";
import { loadCaptureRefs } from "@/features/capture/refs";
import type { BranchOption, CaptureContext, OpenVisit } from "@/features/capture/types";
import { can, requireAccess, type Access } from "@/lib/access";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "เพิ่มลูกค้า" };

/* หน้า 04 · เพิ่มลูกค้า (Quick Capture)

   mode=customer (ค่าเริ่มต้น) สร้างลูกค้าอย่างเดียว · mode=visit สร้าง/ผูกลูกค้าและเปิดการรับลูกค้า
   ?visit=<visit_no|uuid> มาจากหน้ารับลูกค้าเข้าร้าน เมื่อมี visit ที่เปิดอยู่แต่ยังไม่ระบุตัวลูกค้า
   (CANONICAL ข้อ 6.2 · 19.3 ข้อ 2 · sitemap-screen-specs ข้อ 7.2)

   ฉบับประกาศความเป็นส่วนตัวที่จะถูกบันทึกมาจาก app.settings['pdpa.current_notice_version']
   ซึ่งพนักงานหน้าร้านอ่านไม่ได้ (api.get_settings ต้องมี settings.business/system)
   จึงแสดงค่าตามที่ CANONICAL ข้อ 10.2 และ migration 0011 กำหนดไว้ เพื่อบอกผู้ใช้ว่ากำลังแจ้งฉบับไหน */
const NOTICE_VERSION = "PN-2026-01";

/** สาขาที่ผู้ใช้มีสิทธิ์นี้อยู่จริง — สิทธิ์ระดับองค์กรจะไม่ผูกกับสาขา (branch_id = null) */
function branchesWith(access: Access, permission: string): BranchOption[] {
  const grants = access.permissions.filter((p) => p.permission_code === permission && p.effective_now);
  if (grants.length === 0) return [];
  if (grants.some((p) => p.branch_id == null)) return access.branches;
  const ids = new Set(grants.map((p) => p.branch_id));
  return access.branches.filter((b) => ids.has(b.branch_id));
}

type VisitRow = {
  id: string;
  visit_no: string;
  branch_id: string;
  channel_code: string;
  interest_code: string | null;
  source_code: string | null;
  status: string;
  customer_id: string | null;
};

async function findOpenVisit(param: string): Promise<VisitRow | null> {
  const db = await getDb();
  const base = db
    .schema("crm")
    .from("visits")
    .select("id,visit_no,branch_id,channel_code,interest_code,source_code,status,customer_id");
  const query = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(param)
    ? base.eq("id", param)
    : base.eq("visit_no", param.toUpperCase());
  const { data, error } = await query.limit(1);
  if (error) return null;
  return (data?.[0] as VisitRow | undefined) ?? null;
}

export default async function QuickCapturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const access = await requireAccess();

  const branches = branchesWith(access, "customer.create");
  if (branches.length === 0) {
    return (
      <div className="card stack-2">
        <h1 className="page__title">ไม่มีสิทธิ์เข้าหน้านี้</h1>
        <p className="t-sm t-muted">ไม่มีสาขาที่คุณสร้างลูกค้าได้ (customer.create)</p>
        <p>
          <Link className="btn btn--secondary" href="/dashboard">
            กลับหน้าหลัก
          </Link>
        </p>
      </div>
    );
  }

  const one = (name: string): string => {
    const value = params[name];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };

  const visitParam = one("visit");
  const wantsVisitMode = one("mode") === "visit" || visitParam !== "";
  const canCreateVisit = can(access, "visit.create");

  let notice: string | null = null;
  let mode: CaptureContext["mode"] = "customer";
  if (wantsVisitMode) {
    if (canCreateVisit) {
      mode = "visit";
    } else {
      notice = "บทบาทของคุณเพิ่มลูกค้าได้อย่างเดียว ไม่เปิดการรับลูกค้า";
    }
  }

  /* สาขาที่เลือกได้ต้องสร้างลูกค้า "และ" เปิดการรับลูกค้าได้ทั้งคู่เมื่ออยู่ในโหมดรับลูกค้า */
  let usableBranches = branches;
  if (mode === "visit") {
    const visitBranchIds = new Set(branchesWith(access, "visit.create").map((b) => b.branch_id));
    usableBranches = branches.filter((b) => visitBranchIds.has(b.branch_id));
    if (usableBranches.length === 0) {
      usableBranches = branches;
      mode = "customer";
      notice = "บทบาทของคุณเพิ่มลูกค้าได้อย่างเดียว ไม่เปิดการรับลูกค้า";
    }
  }

  let visit: OpenVisit | null = null;
  if (visitParam && mode === "visit") {
    const row = await findOpenVisit(visitParam);
    const usable =
      row !== null &&
      row.customer_id === null &&
      (row.status === "WAITING" || row.status === "IN_SERVICE") &&
      usableBranches.some((b) => b.branch_id === row.branch_id);

    if (!usable) {
      return (
        <div className="card stack-2">
          <h1 className="page__title">ไม่พบการรับลูกค้าที่ระบุ</h1>
          <p className="t-sm t-muted">
            ต้องเป็นการรับลูกค้าที่ยังเปิดอยู่ในสาขาที่คุณรับคิวได้ และยังไม่ได้ระบุตัวลูกค้า
          </p>
          <p>
            <Link className="btn btn--secondary" href="/reception">
              กลับหน้ารับลูกค้าเข้าร้าน
            </Link>
          </p>
        </div>
      );
    }

    visit = {
      id: row.id,
      visit_no: row.visit_no,
      branch_id: row.branch_id,
      channel_code: row.channel_code,
      interest_code: row.interest_code,
      source_code: row.source_code,
    };
    usableBranches = usableBranches.filter((b) => b.branch_id === row.branch_id);
  }

  const refs = await loadCaptureRefs();

  const ctx: CaptureContext = {
    mode,
    visit,
    branches: usableBranches,
    canConsent: can(access, "customer.consent.manage"),
    canReception: can(access, "visit.read"),
    notice,
    noticeVersion: NOTICE_VERSION,
  };

  return <QuickCaptureForm ctx={ctx} refs={refs} />;
}
