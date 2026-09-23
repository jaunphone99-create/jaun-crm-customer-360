import type { Metadata } from "next";
import { Suspense } from "react";

import "@/app/generated/page-dashboard.css";

import { BranchTable } from "@/features/dashboard/BranchTable";
import { DataQualityCards, OrgCards, StaffCards, TeamCards } from "@/features/dashboard/KpiCards";
import { Filters } from "@/features/dashboard/Filters";
import { FunnelChart } from "@/features/dashboard/FunnelChart";
import { SCOPE_ALL, SCOPE_MINE, SCOPE_TEAM } from "@/features/dashboard/labels";
import { LostReasonsChart } from "@/features/dashboard/LostReasonsChart";
import { periodText } from "@/features/dashboard/period";
import { RecentActivity } from "@/features/dashboard/RecentActivity";
import { SourceBar } from "@/features/dashboard/SourceBar";
import { SourceDonut } from "@/features/dashboard/SourceDonut";
import { KpiSkeleton, WidgetError, WidgetSkeleton } from "@/features/dashboard/States";
import { effectiveScope, layoutFor, loadCharts, loadKpis, loadRecentActivity } from "@/features/dashboard/queries";
import { PRESETS, type DashboardFilters, type DashboardLayout, type Preset } from "@/features/dashboard/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { rolesWithPermission } from "@/features/session/guard";
import { can, hasRole, needsMfaFor, requireAccess, type Access } from "@/lib/access";

/* หน้า 02 · หน้าหลัก — ตัวเลขตามบทบาท (CANONICAL ข้อ 14.7 · sitemap-screen-specs ข้อ 5)

   ข้อตกลงที่สำคัญที่สุดของหน้านี้: **หน้าจอไม่คิดเลขเอง**
   ทุกตัวเลข ทุกป้ายเปลี่ยนแปลง และทุกคำตัดสิน "ผ่าน/ต่ำกว่าเป้า" มาจาก api.get_kpis ตรง ๆ
   แม้แต่แถว "รวม" ของตารางสาขาก็เป็นคนละคำสั่ง (p_group_by = 'NONE') ไม่ใช่ผลบวกของแถวข้างบน
   เหตุผลเชิงธุรกิจอยู่ใน BranchTable.tsx — สรุปสั้น ๆ คือ "ลูกค้าไม่ซ้ำ" บวกข้ามสาขาไม่ได้

   ชุดการ์ดตัดสินจากขอบเขตของสิทธิ์ dashboard.view ที่ api.get_my_access() คืนมา
   ไม่ใช่จากชื่อบทบาท (เหตุผลอยู่ใน features/dashboard/queries.ts · layoutFor)

   SYSTEM_ADMIN ไม่มี dashboard.view (ข้อ 7) แต่ต้องเข้าหน้านี้ได้เพราะเป็นหน้าแรกของทุกคน
   (features/session/routes.ts ตั้ง permission = null ไว้ตั้งใจ) — จึงต้องได้การ์ด "ไม่มีสิทธิ์"
   ไม่ใช่หน้าพังหรือข้อความ error ของฐานข้อมูล

   กราฟสามตัว (Funnel · โดนัทแหล่งที่มา · เหตุผลที่ไม่สำเร็จ) มาจาก api.get_dashboard_charts
   ซึ่งคืนทั้งตัวเลข ข้อความร้อยละที่ปัดแล้ว และสัดส่วน 0–1 สำหรับวาดความยาวแท่ง
   หน้านี้และคอมโพเนนต์กราฟจึงไม่มีการหาร ปัด หรือรวมค่าใด ๆ เลย (ข้อ 20.15)

   ยังไม่ได้ทำในชุดนี้: งานวันนี้ · ผลงานรายพนักงาน (ข้อ 13.6 — BRANCH_MANAGER ยังเห็นตารางสาขา
   แทนตารางพนักงาน) — ดูเหตุผลในรายงานส่งมอบ (ต้องการ api.get_report และหน้า Phase 2) */

export const metadata: Metadata = { title: "หน้าหลัก" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function isPreset(v: string): v is Preset {
  return (PRESETS as readonly string[]).includes(v);
}

/** อ่านตัวเลือกจาก query string — ค่าที่ไม่รู้จักถูกทิ้ง ไม่ใช่ทำให้หน้าพัง */
function parseFilters(sp: SearchParams, access: Access, layout: DashboardLayout): DashboardFilters {
  const presetParam = typeof sp.preset === "string" ? sp.preset : "";
  const branchParam = typeof sp.branch === "string" ? sp.branch : "";
  const branchCodes = new Set(access.branches.map((b) => b.code));

  return {
    /* ชุด "พนักงาน" ตรึงที่ 30 วันล่าสุดเสมอ เพราะป้ายการ์ดเขียนช่วงไว้ในตัวแล้ว (ข้อ 14.7) */
    preset: layout !== "staff" && isPreset(presetParam) ? presetParam : "LAST_30_DAYS",
    /* เลือกได้เฉพาะสาขาในสิทธิ์ · สาขาอื่นถือว่าไม่ได้เลือก แล้วปล่อยให้ RPC ตัดสินต่อ (ข้อ 9.4.1) */
    branchCode: branchCodes.has(branchParam) && access.branches.length > 1 ? branchParam : null,
  };
}

/** ป้ายขอบเขตในบรรทัดรองของหัวหน้า (sitemap ข้อ 5.5) */
function scopeLabel(access: Access, filters: DashboardFilters, layout: DashboardLayout): string {
  if (layout === "staff") return SCOPE_MINE;
  if (layout === "team") return SCOPE_TEAM;

  const picked = access.branches.find((b) => b.code === filters.branchCode);
  if (picked) return picked.name_th;
  if (access.branches.length === 1) return access.branches[0]?.name_th ?? SCOPE_ALL;

  /* ORGANIZATION = ทั้งองค์กรจริง ๆ · หลายสาขาแต่ไม่ครบองค์กรต้องบอกให้ชัดว่ามีสาขาไหนบ้าง
     ไม่งั้น OPERATIONS ที่เห็น 4 จาก 5 สาขาจะอ่านตัวเลขว่าเป็นของทั้งบริษัท */
  const isOrg = access.permissions.some(
    (p) => p.permission_code === "dashboard.view" && p.effective_now && p.scope === "ORGANIZATION"
  );
  if (isOrg) return SCOPE_ALL;
  return `ทุกสาขาในสิทธิ์ของคุณ (${access.branches.map((b) => b.name_th).join(" · ")})`;
}

/* ---------------------------------------------------------------------------------
   ส่วนของหน้า — แต่ละส่วนยิง RPC เองและจับ error เอง
   sitemap ข้อ 5.7 กำหนดว่า "ผิดพลาดเฉพาะวิดเจ็ต · ส่วนอื่นยังแสดง"
   --------------------------------------------------------------------------------- */

/** สิ่งที่ทุกส่วนต้องรู้เหมือนกัน — ตัวเลือกของผู้ใช้ และมีฟอร์มตัวกรองให้กด "ลองอีกครั้ง" หรือไม่ */
type SectionProps = { filters: DashboardFilters; branchKey: string; hasFilterForm: boolean };

async function CardsSection({
  layout,
  filters,
  branchKey,
  scopeText,
  hasFilterForm,
}: {
  layout: DashboardLayout;
  filters: DashboardFilters;
  branchKey: string;
  scopeText: string;
  hasFilterForm: boolean;
}) {
  try {
    const current = await loadKpis(filters.preset, branchKey);

    if (layout === "staff") {
      return (
        <>
          <SourceBar result={current} scopeLabel={scopeText} />
          <StaffCards current={current} />
        </>
      );
    }
    if (layout === "team") {
      return (
        <>
          <SourceBar result={current} scopeLabel={scopeText} />
          <TeamCards current={current} />
        </>
      );
    }

    /* K1 "ลูกค้าไม่ซ้ำวันนี้" ผูกกับวันนี้เสมอ ไม่ว่าผู้ใช้เลือกช่วงไหน (ข้อ 14.7 · K1)
       เลือก "วันนี้" อยู่แล้วก็ใช้ผลเดิม — loadKpis ถูก cache ไว้จึงไม่ยิงซ้ำ */
    const today = await loadKpis("TODAY", branchKey);
    return (
      <>
        <SourceBar result={current} scopeLabel={scopeText} />
        <OrgCards current={current} today={today} />
      </>
    );
  } catch (e) {
    return <WidgetError error={e} hasFilterForm={hasFilterForm} />;
  }
}

async function BranchSection({
  filters,
  branchKey,
  hasFilterForm,
}: {
  filters: DashboardFilters;
  branchKey: string;
  hasFilterForm: boolean;
}) {
  try {
    const [byBranch, total] = await Promise.all([
      loadKpis(filters.preset, branchKey, "BRANCH"),
      loadKpis(filters.preset, branchKey),
    ]);
    return <BranchTable byBranch={byBranch} total={total} />;
  } catch (e) {
    return <WidgetError error={e} title="โหลดผลงานรายสาขาไม่สำเร็จ" hasFilterForm={hasFilterForm} />;
  }
}

async function DataQualitySection({
  filters,
  branchKey,
  hasFilterForm,
}: {
  filters: DashboardFilters;
  branchKey: string;
  hasFilterForm: boolean;
}) {
  try {
    const current = await loadKpis(filters.preset, branchKey);
    return <DataQualityCards current={current} />;
  } catch (e) {
    return <WidgetError error={e} title="โหลดคุณภาพข้อมูลไม่สำเร็จ" hasFilterForm={hasFilterForm} />;
  }
}

/* กล่องวิดเจ็ต — ใช้ชื่อคลาสเดิมของ prototype (card · dash-card)
   ระยะห่างมาจาก .dash-row ใน @/app/generated/page-dashboard.css (คัดจาก prototype/02-dashboard.html)
   จึงไม่ต้องใส่ margin เองซ้ำ — ใส่ซ้ำแล้วระยะจะไม่ตรงกับหน้าที่อนุมัติไว้

   className มีไว้รับ hide-tablet เท่านั้น (ข้อ 14.4) ไม่ใช่ช่องให้แต่งหน้าตารายวิดเจ็ต */
function Widget({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card dash-card${className ? ` ${className}` : ""}`} aria-label={title}>
      <div className="card__header">
        <div className="grow">
          <h2 className="card__title">{title}</h2>
          {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ป้ายหัวกราฟทั้งสามใบ — ข้อความคัดจาก prototype/02-dashboard.html (ข้อ 14.7)
   เก็บไว้ที่เดียวเพราะทั้งตอนกำลังโหลด ตอนสำเร็จ และตอนพังต้องใช้ชื่อเดียวกัน
   ไม่งั้นหัวการ์ดจะกระโดดเปลี่ยนชื่อระหว่างโหลด */
const CHART_TITLES = {
  funnel: "Funnel ลูกค้า",
  donut: "แหล่งที่มาลูกค้า",
  lost: "เหตุผลที่ไม่สำเร็จ",
} as const;

/* กราฟสามใบของชุดองค์กร (ข้อ 14.7)

   ทั้งสามใบมาจาก RPC ตัวเดียว จึงอยู่ในส่วนเดียวกัน — พังพร้อมกันเสมอโดยธรรมชาติ
   แต่แยกจากการ์ด KPI อย่างเด็ดขาดตาม sitemap ข้อ 5.7

   โดนัทกับแท่งเหตุผลใส่ hide-tablet เพราะแท็บเล็ตแสดงแค่การ์ด KPI + Funnel (ข้อ 14.4)
   ส่วนสถานะ "ข้อมูลไม่พอแสดง" ของโดนัทเมื่อขอบเขตเป็นทีม/ของตัวเอง (channels.total = null)
   เป็นหน้าที่ของ SourceDonut เอง ไม่ใช่ให้หน้านี้ซ่อนวิดเจ็ตทิ้ง */
async function ChartsSection({ filters, branchKey, hasFilterForm }: SectionProps) {
  let charts;
  try {
    charts = await loadCharts(filters.preset, branchKey);
  } catch (e) {
    return (
      <div className="dash-row">
        <Widget title="กราฟภาพรวม">
          <WidgetError error={e} title="โหลดกราฟไม่สำเร็จ" hasFilterForm={hasFilterForm} />
        </Widget>
      </div>
    );
  }

  const sub = periodText(charts);
  return (
    <div className="dash-row dash-row--3">
      <Widget title={CHART_TITLES.funnel} subtitle={sub}>
        <FunnelChart stages={charts.funnel} />
      </Widget>
      <Widget title={CHART_TITLES.donut} subtitle={sub} className="hide-tablet">
        <SourceDonut channels={charts.channels} />
      </Widget>
      <Widget title={CHART_TITLES.lost} subtitle={`${sub} · 5 อันดับ + อื่น ๆ`} className="hide-tablet">
        <LostReasonsChart reasons={charts.lost_reasons} />
      </Widget>
    </div>
  );
}

/* กิจกรรมล่าสุด (ข้อ 13.5 · 14.7)

   เวลาอ้างอิงที่ใช้ตัดสินว่า "วันนี้" มาจาก app.clock() ของ api.get_kpis ชุดเดียวกับการ์ด
   loadKpis ถูก cache() ไว้ จึงเป็นผลเดิมที่การ์ดโหลดไปแล้ว ไม่ได้ยิงคำสั่งเพิ่ม */
async function RecentActivitySection({ filters, branchKey, hasFilterForm }: SectionProps) {
  try {
    const [rows, kpis] = await Promise.all([
      loadRecentActivity(branchKey),
      loadKpis(filters.preset, branchKey),
    ]);
    return <RecentActivity rows={rows} clock={kpis.clock} />;
  } catch (e) {
    return <WidgetError error={e} title="โหลดกิจกรรมล่าสุดไม่สำเร็จ" hasFilterForm={hasFilterForm} />;
  }
}

/* ---------------------------------------------------------------------------------
   หน้า
   --------------------------------------------------------------------------------- */

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const scope = effectiveScope(access, "dashboard.view");

  /* ไม่มีสิทธิ์ดูตัวเลข — ยังเข้าหน้าได้ แต่เห็นการ์ดอธิบายแทนตัวเลข
     ถ้าปล่อยให้เรียก RPC ไปก่อน ผู้ใช้จะเจอข้อความปฏิเสธของฐานข้อมูลซึ่งไม่ได้บอกว่าต้องทำอะไรต่อ */
  if (!scope) {
    return (
      <NotAuthorized
        title="หน้านี้ยังไม่มีตัวเลขสำหรับบทบาทของคุณ"
        allowedRoles={await rolesWithPermission(["dashboard.view"])}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={
          needsMfaFor(access, "dashboard.view")
            ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อนจึงจะเห็นตัวเลขภาพรวม"
            : "บทบาทผู้ดูแลระบบดูแลบัญชีและค่าตั้งระบบ ไม่ได้เปิดข้อมูลลูกค้าและตัวเลขธุรกิจให้"
        }
      />
    );
  }

  const layout = layoutFor(scope);
  const filters = parseFilters(await searchParams, access, layout);
  const scopeText = scopeLabel(access, filters, layout);

  /* branchKey "" = ทุกสาขาในสิทธิ์ (RPC ตัดสินเอง) · ไม่ใช่ "ทุกสาขาในองค์กร" */
  const branchKey = access.branches.find((b) => b.code === filters.branchCode)?.branch_id ?? "";

  const showPreset = layout !== "staff";
  const hasFilterForm = showPreset || access.branches.length > 1;

  /* ตารางรายสาขาให้ประโยชน์เมื่อเทียบกันได้หลายสาขาเท่านั้น
     เลือกสาขาเดียวแล้วตารางจะเหลือแถวเดียวที่ซ้ำกับการ์ดด้านบนพอดี จึงไม่แสดง */
  const showBranchTable = layout === "org" && !filters.branchCode && access.branches.length > 1;

  /* แถวคุณภาพข้อมูลเป็นของ BUSINESS_ADMIN ตามข้อ 14.7 (ผู้ดูแลข้อมูลธุรกิจเป็นเจ้าของเป้าหมายชุดนี้)
     เช็ก data_quality.view ด้วย เพราะการ์ดเหล่านี้ชี้ไปที่งานในหน้า 12 */
  const showDataQuality = hasRole(access, "BUSINESS_ADMIN") && can(access, "data_quality.view");

  /* กราฟสามใบเป็นของชุด "องค์กร/สาขา" เท่านั้น (ข้อ 14.7: SUPERVISOR · STAFF ไม่มี Funnel/โดนัท/เหตุผล)
     ตัดสินจาก layout ซึ่งมาจากขอบเขตของสิทธิ์ dashboard.view ไม่ใช่ชื่อบทบาท — กลไกเดียวกับการ์ด */
  const showCharts = layout === "org";

  /* กิจกรรมล่าสุดเป็นรายชื่อลูกค้า ไม่ใช่ตัวเลขรวม จึงต้องมีสิทธิ์อ่านลูกค้าจริง ๆ
     นี่คือเหตุผลที่ข้อ 14.7 เขียนว่า "ซ่อนสำหรับ MARKETING": MARKETING มี dashboard.view
     และ report.view แต่ไม่มี customer.read (RLS คืน 0 แถวให้อยู่แล้ว)
     ผูกกับสิทธิ์แทนชื่อบทบาท เพราะถ้าวันหนึ่งองค์กรให้ customer.read กับ MARKETING
     วิดเจ็ตควรโผล่มาเอง ไม่ใช่ต้องตามแก้เงื่อนไขในโค้ด */
  const showRecentActivity = layout === "org" && can(access, "customer.read");

  const sectionProps = { filters, branchKey, hasFilterForm };

  /* ยิง RPC ของการ์ดกับของกราฟออกไปพร้อมกันตั้งแต่ก่อนเริ่มวาด แต่ไม่ await รวมกันที่นี่
     เพราะสองส่วนนี้ต้อง "ล้มแยกกัน" ตาม sitemap ข้อ 5.7 — กราฟล่มแล้วการ์ด KPI ต้องยังอยู่
     ทั้งคู่ถูก cache() ไว้ ส่วนที่เป็นเจ้าของจึงได้ promise ตัวเดียวกันนี้ไป await แล้วจับ error เอง
     .catch ที่ต่อท้ายไม่ได้กลืน error ของใคร มีหน้าที่เดียวคือกัน Node ขึ้น unhandledRejection
     ระหว่างรอให้ Suspense เดินมาถึงส่วนนั้น */
  void Promise.all([
    loadKpis(filters.preset, branchKey).catch(() => null),
    showCharts ? loadCharts(filters.preset, branchKey).catch(() => null) : null,
  ]);

  return (
    <>
      <header className="page-header">
        <div className="page-header__main">
          <h1 className="page-header__title">สวัสดี {access.staff.display_name}</h1>
          <p className="page-header__lead">ภาพรวม{scopeText}</p>
        </div>
      </header>

      <Filters branches={access.branches} filters={filters} showPreset={showPreset} />

      {/* key ผูกกับตัวเลือก เพื่อให้เปลี่ยนช่วง/สาขาแล้วเห็นโครงร่างกำลังโหลดใหม่ ไม่ใช่ค้างที่ตัวเลขเก่า */}
      <Suspense key={`cards:${filters.preset}:${branchKey}`} fallback={<KpiSkeleton />}>
        <CardsSection
          layout={layout}
          filters={filters}
          branchKey={branchKey}
          scopeText={scopeText}
          hasFilterForm={hasFilterForm}
        />
      </Suspense>

      {showCharts ? (
        <Suspense
          key={`charts:${filters.preset}:${branchKey}`}
          fallback={
            <div className="dash-row dash-row--3">
              <Widget title={CHART_TITLES.funnel}>
                <WidgetSkeleton />
              </Widget>
              <Widget title={CHART_TITLES.donut} className="hide-tablet">
                <WidgetSkeleton />
              </Widget>
              <Widget title={CHART_TITLES.lost} className="hide-tablet">
                <WidgetSkeleton />
              </Widget>
            </div>
          }
        >
          <ChartsSection {...sectionProps} />
        </Suspense>
      ) : null}

      {/* ตารางสาขา + กิจกรรมล่าสุด อยู่แถวเดียวกันตาม prototype · ทั้งแถวซ่อนบนแท็บเล็ต (ข้อ 14.4)
          มีทั้งคู่จึงใช้ dash-row--main-side (ตารางกว้าง · รายการ 360px) เหลือใบเดียวก็เต็มแถวไปเลย */}
      {showBranchTable || showRecentActivity ? (
        <div className={`dash-row hide-tablet${showBranchTable && showRecentActivity ? " dash-row--main-side" : ""}`}>
          {showBranchTable ? (
            <Widget title="ผลงานรายสาขา" subtitle="เปลี่ยน = ยอดขายเทียบช่วงก่อนหน้า">
              <Suspense key={`branch:${filters.preset}`} fallback={<WidgetSkeleton />}>
                <BranchSection filters={filters} branchKey={branchKey} hasFilterForm={hasFilterForm} />
              </Suspense>
            </Widget>
          ) : null}
          {showRecentActivity ? (
            <Widget title="กิจกรรมล่าสุด" subtitle="เรียงตามเวลาติดต่อล่าสุด">
              <Suspense key={`activity:${filters.preset}:${branchKey}`} fallback={<WidgetSkeleton height="260px" />}>
                <RecentActivitySection {...sectionProps} />
              </Suspense>
            </Widget>
          ) : null}
        </div>
      ) : null}

      {/* แท็บเล็ตแสดงเฉพาะการ์ด KPI + Funnel (ข้อ 14.4) แถวคุณภาพข้อมูลจึงต้องซ่อนด้วย
          เหมือนที่ prototype ห่อไว้ใน .hide-tablet — ไม่ใช่แค่กราฟสองใบขวามือ */}
      {showDataQuality ? (
        <div className="dash-row hide-tablet">
          <Widget title="คุณภาพข้อมูล" subtitle="เทียบเป้าหมายตามข้อ 12.3 — ฐานข้อมูลเป็นผู้ตัดสินว่าผ่านหรือไม่">
            <Suspense key={`dq:${filters.preset}:${branchKey}`} fallback={<KpiSkeleton cards={5} />}>
              <DataQualitySection filters={filters} branchKey={branchKey} hasFilterForm={hasFilterForm} />
            </Suspense>
          </Widget>
        </div>
      ) : null}
    </>
  );
}
