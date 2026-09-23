import type { Metadata } from "next";
import Link from "next/link";

import { ConsentPanel } from "@/features/privacy/ConsentPanel";
import { CreateDsrForm } from "@/features/privacy/DsrForms";
import { DsrPanel } from "@/features/privacy/DsrPanel";
import { LegalHoldPanel, type HoldSetter } from "@/features/privacy/LegalHoldPanel";
import {
  legalHoldSetter,
  loadConsentHistory,
  loadConsentPurposes,
  loadCurrentConsents,
  loadCustomerByNo,
  loadCustomersByIds,
  loadDsrList,
  loadEntityHistory,
  loadLegalHolds,
  loadPdpaSettings,
  loadStaffByIds,
} from "@/features/privacy/queries";
import { permissionState } from "@/features/privacy/scope";
import {
  CUSTOMER_NO_PATTERN,
  DSR_STATUSES,
  DSR_STATUS_LABEL,
  OPEN_DSR_STATUSES,
  type AuditEntry,
  type ConsentPurpose,
  type ConsentRow,
  type CurrentConsent,
  type CustomerBrief,
  type DsrRow,
  type PrivacyTab,
  type StaffBrief,
} from "@/features/privacy/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";
import { DASH, int } from "@/lib/format/number";

/* หน้า 17 · PDPA — ความยินยอมและคำขอเจ้าของข้อมูล (ข้อ 10)

   หน้านี้เปลี่ยนสิ่งที่ย้อนกลับไม่ได้ (ทำข้อมูลนิรนาม) จึงยึดกติกาสามข้อตลอดทั้งไฟล์:

   1. **ฐานข้อมูลเป็นผู้ปฏิเสธจริงเสมอ** — api.update_dsr · api.anonymize_customer ·
      api.set_legal_hold · api.record_consent ตรวจสิทธิ์ MFA ลำดับสถานะ และ 2-person control เอง
      โค้ดที่นี่แค่ทำให้หน้าจอไม่เสนอสิ่งที่ทำไม่ได้ ไม่ใช่ตัดสินสิทธิ์แทน

   2. **ไม่มีตัวเลขไหนถูกคิดที่หน้าจอ** — จำนวนคำขอที่ยังเปิดอยู่บนแท็บนับจากแถวที่ RPC คืนมา
      ซึ่งเป็นการนับรายการที่แสดงอยู่ตรงหน้า ไม่ใช่ KPI · สถิติความยินยอมการตลาดยังไม่มี RPC
      จึงไม่แสดงเลย แทนที่จะนับเองแล้วอ้างว่าเป็นตัวเลขของระบบ

   3. **เปิดเผย PII เท่าที่จำเป็น** — ช่องทางติดต่อของผู้ยื่นคำขอแสดงเฉพาะค่าปิดบังที่ฐานข้อมูลเก็บ
      และเนื้อในของแพ็กเกจข้อมูล DSR ไม่ถูกนำขึ้นจอ

   สถานะของหน้าอยู่ใน query string ทั้งหมด (tab · status · dsr · panel) ยกเว้นรหัสลูกค้าที่ค้น
   ซึ่งอยู่ใน query string ด้วยเพราะเป็นรหัส ไม่ใช่ชื่อคน */

export const metadata: Metadata = { title: "PDPA: ความยินยอมและคำขอเจ้าของข้อมูล" };
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "BUSINESS_ADMIN"];

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function ErrorCard({ error }: { error: unknown }) {
  const thai = toThaiMessage(error);
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{thai.title}</p>
      {thai.detail ? <p className="state__text">{thai.detail}</p> : null}
    </div>
  );
}

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  /* api.list_dsr เปิดให้ทั้ง dsr.manage และ dsr.create — ประตูหน้าจอจึงใช้เกณฑ์เดียวกัน
     ผู้ที่ไม่มีทั้งสองอย่างจะถูกฐานข้อมูลปฏิเสธอยู่แล้ว ที่นี่แค่ทำให้ได้ข้อความที่อ่านรู้เรื่อง */
  const canManage = can(access, "dsr.manage");
  const canCreate = can(access, "dsr.create");
  if (!canManage && !canCreate) {
    const mfa = needsMfaFor(access, "dsr.manage") || needsMfaFor(access, "dsr.create");
    return (
      <NotAuthorized
        allowedRoles={ALLOWED_ROLES}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={mfa ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" : undefined}
      />
    );
  }

  const sp = await searchParams;
  const statusFilter = (DSR_STATUSES as readonly string[]).includes(one(sp.status)) ? one(sp.status) : "";
  const selectedNo = one(sp.dsr);
  const newPanel = one(sp.panel) === "new";
  const consentQueryRaw = one(sp.cus).trim().toUpperCase();

  const manage = permissionState(access, "dsr.manage");
  const create = permissionState(access, "dsr.create");
  const anonymize = permissionState(access, "customer.anonymize");
  const consentPerm = permissionState(access, "customer.consent.manage");
  const myLabel = `${access.staff.display_name} · ${access.staff.staff_code}`;

  const settings = await loadPdpaSettings();

  const head = (
    <header className="page-header">
      <div className="page-header__main">
        <h1 className="page-header__title">PDPA: ความยินยอมและคำขอเจ้าของข้อมูล</h1>
        <p className="page-header__lead">
          ดำเนินการคำขอของเจ้าของข้อมูล ดูและบันทึกความยินยอมแบบ append-only และดูว่าลูกค้ารายใดถูกระงับการลบไว้ (ข้อ 10)
        </p>
        <p className="page-header__meta">
          <span className="chip">ฉบับประกาศความเป็นส่วนตัวปัจจุบัน {settings.noticeVersion ?? DASH}</span>
          {settings.anonymizePerDay !== null ? (
            <span className="chip">เพดานทำข้อมูลนิรนาม {int(settings.anonymizePerDay)} รายต่อวัน</span>
          ) : null}
        </p>
      </div>
    </header>
  );

  /* -------------------------------------------------------------------- โหลดข้อมูล */

  let dsrs: DsrRow[] = [];
  let customers: CustomerBrief[] = [];
  let staff: StaffBrief[] = [];
  let purposes: ConsentPurpose[] = [];
  try {
    dsrs = await loadDsrList(statusFilter || null);
    const customerIds = dsrs.map((d) => d.customer_id).filter((x): x is string => x !== null);
    const staffIds = dsrs.flatMap((d) => [d.received_by, d.verified_by]).filter((x): x is string => x !== null);
    [customers, staff, purposes] = await Promise.all([
      loadCustomersByIds(customerIds),
      loadStaffByIds(staffIds),
      loadConsentPurposes(),
    ]);
  } catch (e) {
    return (
      <>
        {head}
        <ErrorCard error={e} />
      </>
    );
  }

  const customerMap = new Map(customers.map((c) => [c.customer_id, c]));
  const staffMap = new Map(staff.map((s) => [s.staff_id, s]));

  const tabs: { id: PrivacyTab; label: string; count?: number }[] = [
    /* นับแถวที่กำลังแสดงอยู่ตรงหน้า ไม่ใช่ตัวเลขสรุปของระบบ — จึงไม่ขัดกับกติกา "ห้ามคิด KPI เอง" */
    { id: "dsr", label: "คำขอเจ้าของข้อมูล", count: dsrs.filter((d) => OPEN_DSR_STATUSES.includes(d.status)).length },
    { id: "consent", label: "ความยินยอม" },
    { id: "hold", label: "ระงับการลบตามกฎหมาย" },
  ];
  const requestedTab = one(sp.tab) as PrivacyTab;
  const tab: PrivacyTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "dsr";

  const baseQuery: Record<string, string> = {};
  if (tab !== "dsr") baseQuery.tab = tab;
  if (statusFilter) baseQuery.status = statusFilter;

  const selected = selectedNo ? (dsrs.find((d) => d.request_no === selectedNo) ?? null) : null;

  /* ร่องรอยของคำขอที่เปิดอยู่ + ของลูกค้าที่ผูกไว้ — รวมกันเพื่อให้เห็นทั้ง
     "ใครยืนยันตัวตน" (อยู่ที่ DSR) และ "ใครทำข้อมูลนิรนาม" (อยู่ที่ CUSTOMER) ในที่เดียว */
  let history: AuditEntry[] = [];
  if (selected) {
    const parts = await Promise.all([
      loadEntityHistory("DSR", selected.dsr_id),
      selected.customer_id ? loadEntityHistory("CUSTOMER", selected.customer_id) : Promise.resolve([]),
    ]);
    /* ทั้งสองคำถามคืนแถวเดียวกันได้ เพราะ api.get_entity_history ของ CUSTOMER
       จับแถวที่อ้าง customer_id ไว้ใน after/before ด้วย — ตัดซ้ำด้วย id ของแถว audit */
    history = [...new Map([...parts[0], ...parts[1]].map((e) => [e.id, e])).values()].sort((a, b) =>
      a.occurred_at < b.occurred_at ? 1 : -1
    );
  }

  const tabNav = (
    <nav className="tabs" aria-label="ส่วนของหน้า PDPA">
      {tabs.map((t) => {
        const isCurrent = t.id === tab;
        const query: Record<string, string> = {};
        if (statusFilter && t.id === "dsr") query.status = statusFilter;
        if (t.id !== "dsr") query.tab = t.id;
        return (
          <Link
            key={t.id}
            className="tab"
            href={{ pathname: "/privacy", query }}
            aria-current={isCurrent ? "page" : undefined}
            style={
              isCurrent
                ? {
                    color: "var(--text-heading)",
                    fontWeight: "var(--fw-medium)",
                    borderBottomColor: "var(--navy-900)",
                  }
                : undefined
            }
          >
            {t.label}
            {t.count ? <span className="tab__count">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {head}

      <p className="state-bar" role="note">
        ส่วนนี้เป็นการทำงานตามที่ระบบออกแบบไว้ ไม่ใช่คำแนะนำทางกฎหมาย · ข้อความและระยะเวลาทั้งหมดรอการยืนยันจากผู้ดูแลข้อมูลส่วนบุคคล
      </p>

      {tabNav}

      {tab === "dsr" ? (
        <>
          <form className="filter-bar filter-bar--panel" role="group" aria-label="ตัวกรองคำขอ">
            <div className="field field--inline">
              <label className="label" htmlFor="pv-status">
                สถานะ
              </label>
              <select className="select" id="pv-status" name="status" defaultValue={statusFilter}>
                <option value="">ทั้งหมด</option>
                {DSR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DSR_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn--secondary">
              ใช้ตัวกรอง
            </button>
            {statusFilter ? (
              <Link className="btn btn--ghost" href="/privacy">
                ล้างตัวกรอง
              </Link>
            ) : null}
            {create.visible ? (
              <span style={{ marginInlineStart: "auto" }}>
                <Link className="btn btn--accent" href={{ pathname: "/privacy", query: { ...baseQuery, panel: "new" } }}>
                  + รับคำขอ
                </Link>
              </span>
            ) : null}
          </form>

          {newPanel ? (
            <section className="card" aria-labelledby="pv-new" style={{ marginBottom: "var(--space-5)" }}>
              <div className="card__header">
                <div>
                  <h2 className="card__title" id="pv-new">
                    รับคำขอของเจ้าของข้อมูล
                  </h2>
                  <p className="card__subtitle">
                    กำหนดเสร็จ = วันที่รับ + 30 วัน (ฐานข้อมูลคำนวณให้) · ห้ามเก็บสำเนาบัตรประชาชน
                  </p>
                </div>
                <Link className="btn btn--ghost btn--sm" href={{ pathname: "/privacy", query: baseQuery }}>
                  ปิด
                </Link>
              </div>
              {/* ตัวเลือกลูกค้าในฟอร์มมีเฉพาะรายที่ปรากฏในคำขอที่เห็นอยู่แล้ว
                  คำขอของลูกค้ารายใหม่ให้รับโดยไม่ผูกลูกค้าก่อน แล้วผูกภายหลังจากหน้าข้อมูลลูกค้า
                  เพราะหน้านี้ไม่ควรกลายเป็นช่องค้นหาลูกค้าอีกช่องหนึ่ง (ข้อ 9.6) */}
              <CreateDsrForm
                customerOptions={customers.map((c) => ({
                  customer_id: c.customer_id,
                  label: `${c.display_name} · ${c.customer_no}`,
                }))}
                blockedReason={create.reason}
              />
            </section>
          ) : null}

          <DsrPanel
            rows={dsrs}
            customers={customerMap}
            staff={staffMap}
            selected={selected}
            history={history}
            myStaffId={access.staff.staff_id}
            myLabel={myLabel}
            manage={manage}
            anonymize={anonymize}
            baseQuery={baseQuery}
          />

          {selectedNo && !selected ? (
            <p className="state-bar" role="note" style={{ marginTop: "var(--space-4)" }}>
              ไม่พบคำขอ {selectedNo} ในขอบเขตที่คุณดูได้
            </p>
          ) : null}
        </>
      ) : null}

      {tab === "consent" ? (
        <ConsentTab
          query={consentQueryRaw}
          purposes={purposes}
          noticeVersion={settings.noticeVersion}
          consent={consentPerm}
          manage={manage}
          canOpenCustomer={can(access, "customer.read")}
        />
      ) : null}

      {tab === "hold" ? <HoldTab canSeeHistory={can(access, "audit.read")} /> : null}
    </>
  );
}

/* --------------------------------------------------------------------- แท็บความยินยอม */

async function ConsentTab({
  query,
  purposes,
  noticeVersion,
  consent,
  manage,
  canOpenCustomer,
}: {
  query: string;
  purposes: ConsentPurpose[];
  noticeVersion: string | null;
  consent: ReturnType<typeof permissionState>;
  manage: ReturnType<typeof permissionState>;
  canOpenCustomer: boolean;
}) {
  const invalidFormat = query !== "" && !CUSTOMER_NO_PATTERN.test(query);

  let customer: CustomerBrief | null = null;
  let current: CurrentConsent[] = [];
  let history: ConsentRow[] = [];
  let staffMap = new Map<string, StaffBrief>();
  let holdBy: string | null = null;

  if (query && !invalidFormat) {
    try {
      customer = await loadCustomerByNo(query);
      if (customer) {
        const [c360, hist, auditEntries] = await Promise.all([
          loadCurrentConsents(customer.customer_id),
          loadConsentHistory(customer.customer_id),
          loadEntityHistory("CUSTOMER", customer.customer_id),
        ]);
        /* ค่า legal_hold ที่ใช้ตัดสินปุ่มมาจาก api.get_customer_360 เสมอ
           เพราะเป็นค่าเดียวกับที่ api.anonymize_customer จะเห็นตอนถูกกด */
        customer = { ...customer, legal_hold: c360.legalHold, record_status: c360.recordStatus };
        current = c360.current;
        history = hist;
        staffMap = new Map(
          (await loadStaffByIds(hist.map((h) => h.captured_by).filter((x): x is string => x !== null))).map((s) => [
            s.staff_id,
            s,
          ])
        );
        const setter = legalHoldSetter(auditEntries);
        holdBy = setter.actor ? `${setter.actor}${setter.reason ? ` · ${setter.reason}` : ""}` : null;
      }
    } catch (e) {
      return <ErrorCard error={e} />;
    }
  }

  return (
    <ConsentPanel
      query={query}
      invalidFormat={invalidFormat}
      customer={customer}
      current={current}
      history={history}
      purposes={purposes}
      staff={staffMap}
      noticeVersion={noticeVersion}
      holdBy={holdBy}
      consent={consent}
      manage={manage}
      canOpenCustomer={canOpenCustomer}
    />
  );
}

/* -------------------------------------------------------------- แท็บระงับการลบ */

async function HoldTab({ canSeeHistory }: { canSeeHistory: boolean }) {
  let rows: CustomerBrief[] = [];
  try {
    rows = await loadLegalHolds();
  } catch (e) {
    return <ErrorCard error={e} />;
  }

  /* ถาม audit ทีละรายเพราะไม่มี RPC ที่คืน "ใครตั้ง hold" มาพร้อมรายการ
     จำนวนรายมีเพดานอยู่แล้วจาก loadLegalHolds จึงไม่กลายเป็นคำถามจำนวนไม่จำกัด */
  const setters = new Map<string, HoldSetter>();
  if (canSeeHistory) {
    const histories = await Promise.all(rows.map((c) => loadEntityHistory("CUSTOMER", c.customer_id)));
    rows.forEach((c, i) => setters.set(c.customer_id, legalHoldSetter(histories[i] ?? [])));
  }

  return <LegalHoldPanel rows={rows} setters={setters} canSeeHistory={canSeeHistory} />;
}
