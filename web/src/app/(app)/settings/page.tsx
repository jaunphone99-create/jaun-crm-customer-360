import type { Metadata } from "next";
import Link from "next/link";

import { CATALOG, GROUPS, specOf } from "@/features/settings/catalog";
import { IntegrationPanel } from "@/features/settings/IntegrationPanel";
import {
  loadBranches,
  loadIntegrationLogs,
  loadSettings,
  loadSourceSystems,
  loadStaffNames,
} from "@/features/settings/queries";
import { SettingsGroup, type GroupRow } from "@/features/settings/SettingsGroup";
import { SystemJobs } from "@/features/settings/SystemJobs";
import {
  MFA_REQUIRED_TEXT,
  type BranchRow,
  type IntegrationLogRow,
  type SettingRow,
  type SettingsTab,
  type SourceSystemRow,
} from "@/features/settings/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";

import "@/app/generated/page-settings.css";

/* หน้า 18 · ตั้งค่าระบบ · Integration

   เกณฑ์ที่เจ้าของโครงการตั้งไว้รอบนี้คือ "Settings ต้องเปลี่ยน behavior ของระบบจริง ไม่ใช่แค่เก็บค่า"
   หน้านี้จึงถูกออกแบบรอบสามข้อนี้ ไม่ใช่รอบ "ตารางคีย์-ค่า":

   1. ทุกแถวมีคอลัมน์ "มีผลกับ" ที่เขียนเป็นภาษาคน + บรรทัดว่าของจริงบังคับใช้ที่ไหน
      และมีป้าย "มีผลจริง / มีผลบางส่วน / ยังไม่มีผล" ที่ยอมสารภาพเมื่อระบบยังไม่ได้อ่านค่านั้นไปใช้
   2. ค่าที่ "มีผลรอบถัดไป" ต้องบอกว่ารอบถัดไปคือเมื่อไร → ตารางเวลางานระบบอยู่ในแท็บเชิงเทคนิค
   3. ค่าที่แก้แล้วเห็นผลทันทีถูกเขียนไว้ชัดว่าไปดูผลได้ที่หน้าไหน (ศูนย์คุณภาพข้อมูล · Customer 360)

   เรื่องสิทธิ์: `can()` ที่นี่ใช้เพื่อ "ไม่เสนอสิ่งที่ทำไม่ได้" เท่านั้น
   ผู้ปฏิเสธจริงคือ api.get_settings / api.update_setting / api.list_integration_logs
   ซึ่งตรวจ editable_by และ MFA เองที่ฐานข้อมูล (0011_api.sql) — หน้าจอไม่ได้ตัดสินแทน

   สถานะของหน้าอยู่ใน query string ทั้งหมด (tab · edit · system · status) จึงแชร์ลิงก์กันดูได้ */

export const metadata: Metadata = { title: "ตั้งค่าระบบ" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  const mayBusiness = can(access, "settings.business");
  const maySystem = can(access, "settings.system");
  const mayIntegration = can(access, "integration.manage");

  /* กันคนที่พิมพ์ลิงก์เข้ามาตรง ๆ — ฐานข้อมูลไม่คืนค่าตั้งให้อยู่แล้ว
     ที่นี่แค่ทำให้ได้ข้อความที่อ่านรู้เรื่องแทนหน้าว่างที่ดูเหมือนระบบพัง */
  if (!mayBusiness && !maySystem && !mayIntegration) {
    const pendingMfa =
      needsMfaFor(access, "settings.business") ||
      needsMfaFor(access, "settings.system") ||
      needsMfaFor(access, "integration.manage");
    return (
      <NotAuthorized
        title="ไม่มีสิทธิ์เข้าหน้าตั้งค่าระบบ"
        allowedRoles={["BUSINESS_ADMIN", "SYSTEM_ADMIN"]}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={pendingMfa ? MFA_REQUIRED_TEXT : "ถ้าคิดว่าควรเข้าได้ ให้แจ้งผู้ดูแลระบบเพื่อขอสิทธิ์"}
      />
    );
  }

  const sp = await searchParams;
  const editingKey = one(sp.edit) || null;
  const filterSystem = one(sp.system);
  const filterStatus = one(sp.status);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "business", label: "เกณฑ์ธุรกิจ" },
    { id: "system", label: "เชิงเทคนิค" },
  ];
  if (mayIntegration) tabs.push({ id: "integration", label: "Integration" });

  const requested = one(sp.tab) as SettingsTab;
  const tab: SettingsTab = tabs.some((t) => t.id === requested) ? requested : mayBusiness ? "business" : "system";

  /* ตัวกรองที่ต้องติดไปกับทุกลิงก์ในหน้า เพื่อให้ปิดฟอร์มแล้วยังอยู่แท็บเดิม */
  const baseQuery: Record<string, string> = {};
  if (tab !== "business") baseQuery.tab = tab;
  if (tab === "integration") {
    if (filterSystem) baseQuery.system = filterSystem;
    if (filterStatus) baseQuery.status = filterStatus;
  }

  /* --------------------------------------------------------------- อ่านข้อมูล */

  let settings: SettingRow[] = [];
  let settingsError: string | null = null;
  if (mayBusiness || maySystem) {
    try {
      settings = await loadSettings();
    } catch (e) {
      const thai = toThaiMessage(e);
      settingsError = thai.detail ? `${thai.title} · ${thai.detail}` : thai.title;
    }
  }
  const byKey = new Map(settings.map((s) => [s.key, s]));

  let branches: BranchRow[] = [];
  if (tab !== "integration") branches = await loadBranches();

  const staffNames = await loadStaffNames(settings.map((s) => s.updated_by ?? "").filter((v) => v !== ""));

  let logs: IntegrationLogRow[] = [];
  let systems: SourceSystemRow[] = [];
  let logsError: string | null = null;
  if (tab === "integration" && mayIntegration) {
    systems = await loadSourceSystems();
    try {
      logs = await loadIntegrationLogs({ sourceSystemCode: filterSystem || null, status: filterStatus || null });
    } catch (e) {
      const thai = toThaiMessage(e);
      logsError = thai.detail ? `${thai.title} · ${thai.detail}` : thai.title;
    }
  }

  /* ------------------------------------------------------- ประกอบแถวของตาราง */

  /**
   * แถวของกลุ่มหนึ่ง
   *
   * api.get_settings() คืนเฉพาะคีย์ที่ผู้เรียก "แก้ได้" เท่านั้น คีย์ที่ไม่ได้คืนมาจึงไม่ได้แปลว่าไม่มีอยู่
   * แต่แปลว่าผู้ใช้คนนี้ไม่มีสิทธิ์แก้ (และไม่มีสิทธิ์ดูค่าด้วย) — แสดงแถวไว้พร้อมเหตุผล
   * ดีกว่าซ่อนทิ้ง เพราะผู้ดูแลต้องรู้ว่าค่าที่คุมพฤติกรรมของระบบมีอะไรบ้าง และใครเป็นคนแก้ได้
   */
  function rowsOf(groupId: string): GroupRow[] {
    return CATALOG.filter((spec) => spec.group === groupId).map((spec) => {
      const row = byKey.get(spec.key) ?? null;
      if (row) return { spec, row, lockReason: null };

      const group = GROUPS.find((g) => g.id === spec.group);
      const needsSystem = group?.tab === "system";
      const hasPermission = needsSystem ? maySystem : mayBusiness;
      const lockReason = hasPermission
        ? "ฐานข้อมูลยังไม่มีคีย์นี้ — แจ้งผู้ดูแลระบบ"
        : needsSystem
          ? "อ่านและแก้ได้เฉพาะผู้มีสิทธิ์ settings.system (ผู้ดูแลระบบ)"
          : "อ่านและแก้ได้เฉพาะผู้มีสิทธิ์ settings.business (ผู้ดูแลข้อมูลธุรกิจ)";
      return { spec, row: null, lockReason };
    });
  }

  const editingSpec = editingKey ? specOf(editingKey) : null;

  /* --------------------------------------------------------------- หน้าจอ */

  const head = (
    <header className="page-header">
      <div className="page-header__main">
        <h1 className="page-header__title">ตั้งค่าระบบ</h1>
        <p className="page-header__lead">
          ค่าเหล่านี้คุมพฤติกรรมจริงของระบบ — เวลาที่เริ่มเตือน เกณฑ์ที่ทำให้รายการขึ้นศูนย์คุณภาพข้อมูล
          เพดานที่ทำให้ฐานข้อมูลปฏิเสธคำสั่ง และ “วันนี้” ของรายงาน (ข้อ 11.2)
        </p>
        <p className="page-header__lead">
          ทุกครั้งที่บันทึก ฐานข้อมูลจะตรวจสิทธิ์ตาม <span className="code">editable_by</span> แล้วเขียนประวัติ
          <span className="code"> SETTINGS_UPDATED</span> ให้เอง — ย้อนดูได้ที่หน้าประวัติการใช้งาน
        </p>
      </div>
    </header>
  );

  const tabNav = (
    <nav className="tabs" aria-label="ส่วนของหน้าตั้งค่าระบบ">
      {tabs.map((t) => {
        const isCurrent = t.id === tab;
        const query: Record<string, string> = {};
        if (t.id !== "business") query.tab = t.id;
        return (
          <Link
            key={t.id}
            className="tab"
            href={{ pathname: "/settings", query }}
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
          </Link>
        );
      })}
    </nav>
  );

  const legend = (
    <div className="card section" role="note">
      <p className="t-sm">
        <span className="badge badge--success badge--square">มีผลจริง</span> ระบบอ่านค่านี้ไปใช้จริงทุกจุด ·{" "}
        <span className="badge badge--warning badge--square">มีผลบางส่วน</span> ยังมีหน้าจอหรือบริการที่ฝังค่าไว้ในโค้ด ·{" "}
        <span className="badge badge--neutral badge--square">ยังไม่มีผล</span> ยังไม่มีใครอ่านค่านี้ไปใช้ —
        แก้แล้วพฤติกรรมของระบบจะยังไม่เปลี่ยน
      </p>
      <p className="t-sm t-muted" style={{ marginTop: "var(--space-2)" }}>
        คอลัมน์ “มีผลกับ” บอกว่าเปลี่ยนแล้วอะไรเปลี่ยน และบรรทัดรองบอกว่าของจริงบังคับใช้ที่ไหน
        ค่าที่บังคับใช้ในงานตามเวลาจะเห็นผลรอบถัดไปตามตารางในแท็บ “เชิงเทคนิค”
      </p>
    </div>
  );

  return (
    <>
      {head}
      {tabNav}

      {settingsError && tab !== "integration" ? (
        <div className="alert alert--danger section" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <p className="alert__title">อ่านค่าตั้งจากฐานข้อมูลไม่ได้</p>
            <p className="t-sm">{settingsError}</p>
          </div>
        </div>
      ) : null}

      {editingSpec && editingSpec.live === "pending" ? (
        <div className="alert alert--warning section" role="note">
          <span aria-hidden="true">!</span>
          <div>
            <p className="alert__title">ค่านี้แก้ได้ แต่ยังไม่มีผลกับระบบ</p>
            <p className="t-sm">{editingSpec.gap ?? editingSpec.enforcedAt}</p>
          </div>
        </div>
      ) : null}

      {tab === "business" ? (
        <div className="tabpanel st-tabpanel">
          {legend}
          {GROUPS.filter((g) => g.tab === "business").map((g) => (
            <SettingsGroup
              key={g.id}
              group={g}
              rows={rowsOf(g.id)}
              editingKey={editingKey}
              query={baseQuery}
              branches={branches}
              staffNames={staffNames}
            />
          ))}
        </div>
      ) : null}

      {tab === "system" ? (
        <div className="tabpanel st-tabpanel">
          {legend}
          {GROUPS.filter((g) => g.tab === "system").map((g) => (
            <SettingsGroup
              key={g.id}
              group={g}
              rows={rowsOf(g.id)}
              editingKey={editingKey}
              query={baseQuery}
              branches={branches}
              staffNames={staffNames}
            />
          ))}
          <SystemJobs />
        </div>
      ) : null}

      {tab === "integration" ? (
        <div className="tabpanel st-tabpanel">
          {logsError ? (
            <div className="alert alert--danger section" role="alert">
              <span aria-hidden="true">!</span>
              <div>
                <p className="alert__title">อ่านบันทึกการเชื่อมต่อไม่ได้</p>
                <p className="t-sm">{logsError}</p>
              </div>
            </div>
          ) : null}
          <IntegrationPanel
            systems={systems}
            logs={logs}
            filter={{ system: filterSystem, status: filterStatus }}
            query={{}}
          />
        </div>
      ) : null}
    </>
  );
}
