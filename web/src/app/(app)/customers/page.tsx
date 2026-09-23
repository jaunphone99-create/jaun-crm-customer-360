import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import "@/app/generated/page-customers.css";

import { CustomerTable } from "@/features/customers/CustomerTable";
import { FILTER_FORM_ID, FilterBar } from "@/features/customers/FilterBar";
import { Pagination } from "@/features/customers/Pagination";
import { SearchPanel } from "@/features/customers/SearchPanel";
import { ClearFiltersLink, ResultsSkeleton, StateCard } from "@/features/customers/States";
import { BADGE_ORDER, LIFECYCLE_ORDER } from "@/features/customers/labels";
import { hasActiveFilters, loadCustomers, loadPeriod, loadRefs } from "@/features/customers/queries";
import type { BadgeKey, CustomerFilters, CustomerRefs, Preset } from "@/features/customers/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess, type Access } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";

/* หน้า 03 · ลูกค้า — รายการลูกค้าที่ค้นและกรองได้

   ค่าเริ่มต้นของหน้ามาจาก CANONICAL ข้อ 13.8: ติดต่อใน 30 วันล่าสุด · เรียงกิจกรรมล่าสุดก่อน · 20 แถวต่อหน้า
   ตัวกรองอยู่ใน query string จึงแชร์ลิงก์ได้ · คำค้นไม่อยู่ใน URL เพราะเป็น PII ได้ (ข้อ 6.9)

   ขอบเขต Phase 1 (ข้อ 20.3 · 20.9): ไม่มีปุ่มของ Lead · โอกาสขาย · งานติดตาม
   และยังไม่มีปุ่ม "ขอส่งออก" กับ "เพิ่ม Tag หลายรายการ" เพราะทั้งสองเป็นการเขียนข้อมูล
   ที่ต้องมีหน้า 15 และกล่องโต้ตอบของมันก่อน */

export const metadata: Metadata = { title: "ลูกค้า" };
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"];

type SearchParams = Record<string, string | string[] | undefined>;

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => v !== "");
}

/** อ่านตัวกรองจาก query string — ค่าที่ไม่รู้จักถูกทิ้ง ไม่ใช่ทำให้หน้าพัง */
function parseFilters(sp: SearchParams, access: Access): CustomerFilters {
  const branchCodes = new Set(access.branches.map((b) => b.code));
  const branchParam = typeof sp.branch === "string" ? sp.branch : "";
  const stages = asList(sp.stage).filter((s) => (LIFECYCLE_ORDER as readonly string[]).includes(s));
  const badges = asList(sp.badge).filter((b): b is BadgeKey => (BADGE_ORDER as string[]).includes(b));
  const page = Number(typeof sp.page === "string" ? sp.page : "1");

  return {
    /* เลือกสาขาได้เฉพาะสาขาในสิทธิ์ของผู้ใช้ — สาขาอื่นถือว่าไม่ได้เลือก แล้วปล่อยให้ RLS ตัดสินต่อ */
    branchCode: branchCodes.has(branchParam) && access.branches.length > 1 ? branchParam : null,
    stages,
    badges,
    channels: asList(sp.channel),
    preset: (typeof sp.preset === "string" && sp.preset === "TODAY" ? "TODAY" : "LAST_30_DAYS") as Preset,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  };
}

/** C-STATE-ERROR — ห้ามแสดงข้อความดิบของฐานข้อมูล (อาจมีชื่อตารางหรือค่า PII) */
function ErrorState({ error, retryInForm }: { error: unknown; retryInForm: boolean }) {
  const thai = toThaiMessage(error);
  return (
    <StateCard
      kind="error"
      title="โหลดข้อมูลไม่สำเร็จ"
      text={thai.detail ?? thai.title}
      action={
        retryInForm ? (
          <button type="submit" form={FILTER_FORM_ID} className="btn btn--secondary">
            ลองอีกครั้ง
          </button>
        ) : (
          <Link className="btn btn--secondary" href="/customers">
            ลองอีกครั้ง
          </Link>
        )
      }
    />
  );
}

async function Results({
  access,
  filters,
  refs,
  canCreate,
}: {
  access: Access;
  filters: CustomerFilters;
  refs: CustomerRefs;
  canCreate: boolean;
}) {
  try {
    const period = await loadPeriod(filters.preset);
    const list = await loadCustomers(access, filters, period);

    if (list.rows.length === 0) {
      return hasActiveFilters(filters) || filters.page > 1 ? (
        <StateCard kind="noresult" title="ไม่พบลูกค้าตามเงื่อนไข" action={<ClearFiltersLink />} />
      ) : (
        <StateCard
          kind="empty"
          title="ยังไม่มีลูกค้าในสาขาของคุณ"
          action={
            canCreate ? (
              <Link className="btn btn--accent" href="/customers/new">
                + เพิ่มลูกค้า
              </Link>
            ) : undefined
          }
        />
      );
    }

    return (
      <CustomerTable
        rows={list.rows}
        refs={refs}
        total={list.total}
        from={list.from}
        pagination={
          <Pagination
            page={filters.page}
            total={list.total}
            pageSize={list.pageSize}
            shown={list.windowSize}
          />
        }
      />
    );
  } catch (e) {
    return <ErrorState error={e} retryInForm />;
  }
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  /* กันคนที่พิมพ์ลิงก์เข้ามาตรง ๆ — ฐานข้อมูลไม่คืนข้อมูลให้อยู่แล้ว
     ที่นี่แค่ทำให้ได้ข้อความที่อ่านรู้เรื่องแทนตารางว่างที่ดูเหมือนระบบพัง */
  if (!can(access, "customer.read")) {
    return (
      <NotAuthorized
        allowedRoles={ALLOWED_ROLES}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={needsMfaFor(access, "customer.read") ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" : undefined}
      />
    );
  }

  const sp = await searchParams;
  const filters = parseFilters(sp, access);
  const canCreate = can(access, "customer.create");
  /* "+ รับลูกค้า" พาไปหน้า 04 mode=visit ซึ่งต้องสร้าง/ผูกลูกค้าด้วยเสมอ
     sitemap ข้อ 6.6 จึงกำหนดสิทธิ์ไว้สองตัว — ถ้าเช็กแค่ visit.create ปุ่มจะพาไปเจอ
     "ไม่มีสิทธิ์เข้าหน้านี้" ของหน้า 04 แทนที่จะไม่โผล่ตั้งแต่แรก */
  const canReceive = can(access, "visit.create") && canCreate;

  const head = (
    <header className="page-header">
      <div className="page-header__main">
        <h1 className="page-header__title">ลูกค้า</h1>
        <p className="page-header__lead">ค้นหาและจัดการข้อมูลลูกค้าที่คุณเข้าถึงได้</p>
      </div>
      {canCreate || canReceive ? (
        <div className="page-header__actions cust-actions hide-mobile">
          {canCreate ? (
            <Link className={`btn ${canReceive ? "btn--secondary" : "btn--accent"}`} href="/customers/new">
              + เพิ่มลูกค้า
            </Link>
          ) : null}
          {canReceive ? (
            <Link className="btn btn--accent hide-tablet" href={{ pathname: "/customers/new", query: { mode: "visit" } }}>
              + รับลูกค้า
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );

  let refs: CustomerRefs;
  try {
    refs = await loadRefs();
  } catch (e) {
    return (
      <>
        {head}
        <ErrorState error={e} retryInForm={false} />
      </>
    );
  }

  const channels = Object.entries(refs.channelLabels).map(([code, label]) => ({ code, label }));

  return (
    <>
      {head}
      <SearchPanel refs={refs} preset={filters.preset}>
        <FilterBar
          branches={access.branches}
          channels={channels}
          filters={filters}
          isDefault={!hasActiveFilters(filters)}
        />
        {/* key ผูกกับตัวกรอง เพื่อให้เปลี่ยนตัวกรองแล้วเห็นโครงร่างกำลังโหลดใหม่ ไม่ใช่ค้างที่ผลเก่า */}
        <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton />}>
          <Results access={access} filters={filters} refs={refs} canCreate={canCreate} />
        </Suspense>
      </SearchPanel>
    </>
  );
}
