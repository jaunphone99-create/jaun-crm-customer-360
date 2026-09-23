import type { Metadata } from "next";
import Link from "next/link";

import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { DeviceForm } from "@/features/users/DeviceForm";
import { InviteForm } from "@/features/users/InviteForm";
import {
  loadAssignOptions,
  loadBranches,
  loadGrantRequests,
  loadRoleCatalog,
  loadStaff,
} from "@/features/users/queries";
import { RequestsPanel } from "@/features/users/RequestsPanel";
import { permissionState, scopeBranchIds, topScope } from "@/features/users/scope";
import { StaffDetail } from "@/features/users/StaffDetail";
import { StaffTable, type StaffView } from "@/features/users/StaffTable";
import {
  MFA_REQUIRED_TEXT,
  type AssignOption,
  type BranchRow,
  type GrantRequestRow,
  type RoleCatalogRow,
  type StaffRow,
  type StaffStatus,
  type UsersTab,
} from "@/features/users/types";
import { can, needsMfaFor, requireAccess, type Access } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";
import { roleLabel, STAFF_STATUS_LABEL } from "@/lib/labels";

/* หน้า 13 · ผู้ใช้งานและสิทธิ์ — เชิญ · บทบาท · ปิดใช้งาน · อุปกรณ์

   หน้านี้เป็นหน้าเดียวของระบบที่เปลี่ยน "ใครเป็นใครและทำอะไรได้" จึงยึดกติกาสองข้อตลอดทั้งไฟล์:

   1. ฐานข้อมูลเป็นผู้ปฏิเสธจริงเสมอ — api.can_assign_role · app.staff_admin_denial · RLS
      โค้ดที่นี่แค่ทำให้หน้าจอไม่เสนอสิ่งที่ทำไม่ได้ ไม่ใช่ตัดสินสิทธิ์แทน
   2. สาขาของผู้จัดการสาขาถูก "ล็อก" ไม่ใช่ปล่อยให้เลือก (ข้อ 20.2) — ตัวเลือกบทบาททุกตัว
      ผูกสาขามาแล้วจากฝั่งเซิร์ฟเวอร์ตามคำตอบของ api.can_assign_role

   สถานะของหน้าอยู่ใน query string ทั้งหมด (tab · branch · status · staff · panel)
   จึงแชร์ลิงก์ให้ดูด้วยกันได้ และไม่ต้องมี state ฝั่ง client ที่หลุดจากสิทธิ์จริง
   ยกเว้นช่องค้นหาชื่อ ซึ่งตั้งใจไม่ลง URL เพราะเป็นชื่อคน */

export const metadata: Metadata = { title: "ผู้ใช้งานและสิทธิ์" };
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  "SUPERVISOR",
  "BRANCH_MANAGER",
  "OPERATIONS",
  "EXECUTIVE",
  "BUSINESS_ADMIN",
  "SYSTEM_ADMIN",
];

const STATUS_ORDER: StaffStatus[] = ["INVITED", "ACTIVE", "SUSPENDED", "DISABLED"];

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** ป้ายบทบาททั้งหมด — client component รับเป็นข้อมูล ไม่ใช่ฟังก์ชัน */
const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  [
    "STAFF",
    "SUPERVISOR",
    "BRANCH_MANAGER",
    "MARKETING",
    "OPERATIONS",
    "BUSINESS_ADMIN",
    "EXECUTIVE",
    "SYSTEM_ADMIN",
  ].map((code) => [code, roleLabel(code)])
);

/** แถวตารางที่พร้อมแสดง — แปลง branch_id เป็นชื่อสาขาให้เรียบร้อยก่อนส่งข้ามไปฝั่ง client */
function toView(staff: StaffRow, branchNames: Record<string, string>): StaffView {
  const roles = staff.roles.map((r) => roleLabel(r.role_code));
  const branches = staff.roles.map((r) => (r.branch_id ? (branchNames[r.branch_id] ?? r.branch_id) : "องค์กร"));
  return {
    staffId: staff.staff_id,
    staffCode: staff.staff_code,
    displayName: staff.display_name,
    nickname: staff.nickname,
    email: staff.email,
    status: staff.status,
    rolesText: roles.length ? [...new Set(roles)].join(" · ") : "–",
    branchText: branches.length ? [...new Set(branches)].join(" · ") : "–",
    teamsText: staff.teams.length
      ? staff.teams.map((t) => `${t.code}${t.is_leader ? " (หัวหน้า)" : ""}`).join(" · ")
      : "–",
  };
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

type Loaded = {
  staff: StaffRow[];
  branches: BranchRow[];
  catalog: RoleCatalogRow[];
  requests: GrantRequestRow[];
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  /* กันคนที่พิมพ์ลิงก์เข้ามาตรง ๆ — ฐานข้อมูลไม่คืนข้อมูลให้อยู่แล้ว
     ที่นี่แค่ทำให้ได้ข้อความที่อ่านรู้เรื่องแทนหน้าว่างที่ดูเหมือนระบบพัง */
  if (!can(access, "user.read")) {
    return (
      <NotAuthorized
        allowedRoles={ALLOWED_ROLES}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={needsMfaFor(access, "user.read") ? MFA_REQUIRED_TEXT : undefined}
      />
    );
  }

  const sp = await searchParams;
  const branchFilter = one(sp.branch);
  const statusFilter = (STATUS_ORDER as string[]).includes(one(sp.status)) ? one(sp.status) : "";
  const selectedCode = one(sp.staff);
  const invitePanel = one(sp.panel) === "invite";

  const head = (
    <header className="page-header">
      <div className="page-header__main">
        <h1 className="page-header__title">ผู้ใช้งานและสิทธิ์</h1>
        <p className="page-header__lead">
          ดูรายชื่อผู้ใช้ เชิญพนักงาน มอบ/ถอนบทบาท ปิดใช้งานบัญชี และลงทะเบียนอุปกรณ์ counter (ข้อ 7)
        </p>
      </div>
    </header>
  );

  let data: Loaded;
  try {
    const [staff, branches, catalog, requests] = await Promise.all([
      loadStaff(statusFilter || null),
      loadBranches(),
      loadRoleCatalog(),
      /* คำขอบทบาทเป็นข้อมูลเสริมของหน้า — ถ้าบทบาทนี้ดูไม่ได้ ก็ไม่ควรทำให้รายชื่อพนักงานทั้งหน้าล่มไปด้วย */
      loadGrantRequests().catch(() => [] as GrantRequestRow[]),
    ]);
    data = { staff, branches, catalog, requests };
  } catch (e) {
    return (
      <>
        {head}
        <ErrorCard error={e} />
      </>
    );
  }

  const branchNames: Record<string, string> = Object.fromEntries(
    data.branches.map((b) => [b.branch_id, b.name_th])
  );
  const branchByCode = new Map(data.branches.map((b) => [b.code, b]));

  /* ตัวกรองสาขาทำที่ฝั่งแอปโดยตั้งใจ: api.list_staff กรองตามสถานะให้ได้อย่างเดียว
     และรายชื่อที่ RPC คืนมาคือขอบเขตที่ผู้ใช้เห็นได้จริงอยู่แล้ว การกรองซ้ำที่นี่จึงตัดได้เฉพาะ "ให้แคบลง" */
  const allowedBranchCodes = new Set(access.branches.map((b) => b.code));
  const pickedBranch = allowedBranchCodes.has(branchFilter) ? branchByCode.get(branchFilter) : undefined;
  const visibleStaff = pickedBranch
    ? data.staff.filter((s) => s.roles.some((r) => r.branch_id === pickedBranch.branch_id))
    : data.staff;

  /* แท็บที่เปิดให้เห็น — แท็บอุปกรณ์มีความหมายเฉพาะคนที่แก้ผู้ใช้ในสาขาได้ (api.register_device ใช้สิทธิ์เดียวกัน) */
  const deviceBranches = data.branches.filter((b) =>
    scopeBranchIds(access, "user.update").includes(b.branch_id)
  );
  const tabs: { id: UsersTab; label: string; count?: number }[] = [
    { id: "users", label: "ผู้ใช้งาน" },
    { id: "requests", label: "คำขอมอบบทบาท", count: data.requests.filter((q) => q.status === "REQUESTED").length },
  ];
  if (deviceBranches.length > 0) tabs.push({ id: "devices", label: "อุปกรณ์" });

  const requestedTab = one(sp.tab) as UsersTab;
  const tab: UsersTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "users";

  /* ตัวกรองที่ต้องติดไปกับทุกลิงก์ในหน้า เพื่อให้กดเปิดคนแล้วตัวกรองไม่หาย */
  const baseQuery: Record<string, string> = {};
  if (tab !== "users") baseQuery.tab = tab;
  if (pickedBranch) baseQuery.branch = pickedBranch.code;
  if (statusFilter) baseQuery.status = statusFilter;

  const selected = selectedCode ? (data.staff.find((s) => s.staff_code === selectedCode) ?? null) : null;

  /* สาขาที่ใช้มอบบทบาทได้จริง — ผู้จัดการสาขาจะเหลือสาขาเดียว จึง "ล็อก" ได้ตั้งแต่ในฟอร์ม */
  const assignBranchIds = scopeBranchIds(access, "role.assign");
  const assignBranches = data.branches.filter((b) => assignBranchIds.includes(b.branch_id));
  const inviteScope = topScope(access, "user.invite");
  const inviteState = permissionState(access, "user.invite");
  const systemOnlyInvite = inviteScope === "SYSTEM";
  const lockedBranch =
    !systemOnlyInvite && inviteScope !== "ORGANIZATION" && assignBranches.length === 1 ? assignBranches[0] : null;

  /* ถามฐานข้อมูลเรื่องบทบาทเฉพาะตอนที่จะใช้จริง — ไม่ยิง can_assign_role ทุกครั้งที่โหลดหน้า */
  let inviteOptions: AssignOption[] = [];
  if (invitePanel && inviteState.allowed && !systemOnlyInvite) {
    inviteOptions = await loadAssignOptions(null, assignBranches, data.catalog);
  }
  let detailOptions: AssignOption[] = [];
  if (selected) {
    /* ตัดบทบาทที่บัญชีนี้ถืออยู่แล้วออก — api.assign_role ไม่ได้ห้ามซ้ำ แต่การมอบซ้ำได้แถวใหม่ที่ไม่มีความหมาย
       และทำให้รายการบทบาทอ่านยากขึ้นเปล่า ๆ */
    const held = new Set(selected.roles.map((r) => `${r.role_code}|${r.branch_id ?? ""}`));
    const options = await loadAssignOptions(selected.staff_id, assignBranches, data.catalog);
    detailOptions = options.filter((o) => !held.has(`${o.role_code}|${o.branch_id ?? ""}`));
  }

  const tabNav = (
    <nav className="tabs" aria-label="ส่วนของหน้าผู้ใช้งานและสิทธิ์">
      {tabs.map((t) => {
        const isCurrent = t.id === tab;
        const query = { ...baseQuery };
        delete query.tab;
        if (t.id !== "users") query.tab = t.id;
        return (
          <Link
            key={t.id}
            className="tab"
            href={{ pathname: "/users", query }}
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
      {tabNav}

      {tab === "users" ? (
        <div className="tabpanel">
          {/* ฟอร์ม GET ธรรมดา — ตัวกรองจึงไปอยู่ใน query string และแชร์ลิงก์ได้ โดยไม่ต้องใช้ JavaScript
              การส่งฟอร์มล้าง ?staff= และ ?panel= ทิ้งโดยตั้งใจ: เปลี่ยนเงื่อนไขแล้วเริ่มดูรายการใหม่ */}
          <form className="filter-bar filter-bar--panel" role="group" aria-label="ตัวกรองผู้ใช้งาน">
            {/* เลือกได้เฉพาะสาขาในสิทธิ์ของผู้ใช้ — สาขาเดียวก็ไม่ต้องมีช่องเลือกให้สับสน */}
            {access.branches.length > 1 ? (
              <div className="field field--inline">
                <label className="label" htmlFor="u-branch">
                  สาขา
                </label>
                <select className="select" id="u-branch" name="branch" defaultValue={pickedBranch?.code ?? ""}>
                  <option value="">ทุกสาขา</option>
                  {access.branches.map((b) => (
                    <option key={b.branch_id} value={b.code}>
                      {b.name_th}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field field--inline">
                <span className="label">สาขา</span>
                <span className="t-sm">{access.branches[0]?.name_th ?? "–"}</span>
              </div>
            )}

            <div className="field field--inline">
              <label className="label" htmlFor="u-status">
                สถานะ
              </label>
              <select className="select" id="u-status" name="status" defaultValue={statusFilter}>
                <option value="">ทั้งหมด</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAFF_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn--secondary">
              ใช้ตัวกรอง
            </button>

            {pickedBranch || statusFilter ? (
              <Link className="btn btn--ghost" href="/users">
                ล้างตัวกรอง
              </Link>
            ) : null}

            {inviteState.visible ? (
              <span style={{ marginInlineStart: "auto" }}>
                <Link
                  className="btn btn--accent"
                  href={{ pathname: "/users", query: { ...baseQuery, panel: "invite" } }}
                >
                  + เพิ่มผู้ใช้งาน
                </Link>
              </span>
            ) : null}
          </form>

          {invitePanel ? (
            <section className="card" aria-labelledby="u-invite-title" style={{ marginBottom: "var(--space-5)" }}>
              <div className="card__header">
                <div>
                  <h2 className="card__title" id="u-invite-title">
                    เพิ่มผู้ใช้งาน
                  </h2>
                  <p className="card__subtitle">
                    ระบบไม่มีการสมัครใช้งานเอง — บัญชีเกิดจากคำเชิญเท่านั้น (ข้อ 7.3)
                  </p>
                </div>
                <Link className="btn btn--ghost btn--sm" href={{ pathname: "/users", query: baseQuery }}>
                  ปิด
                </Link>
              </div>
              <InviteForm
                options={inviteOptions}
                roleLabels={ROLE_LABELS}
                lockedBranchLabel={lockedBranch?.name_th ?? null}
                blockedReason={inviteState.reason}
                systemOnly={systemOnlyInvite}
              />
            </section>
          ) : null}

          <StaffTable
            rows={visibleStaff.map((s) => toView(s, branchNames))}
            total={data.staff.length}
            selectedCode={selected?.staff_code ?? null}
            query={baseQuery}
          />

          {selectedCode && !selected ? (
            <p className="state-bar" role="note" style={{ marginTop: "var(--space-4)" }}>
              ไม่พบบัญชี {selectedCode} ในขอบเขตที่คุณดูได้
            </p>
          ) : null}

          {selected ? (
            <StaffDetail
              access={access}
              staff={selected}
              branchNames={branchNames}
              assignOptions={detailOptions}
              closeHref={{ pathname: "/users", query: baseQuery }}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "requests" ? (
        <div className="tabpanel">
          <RequestsPanel access={access} requests={data.requests} staff={data.staff} />
        </div>
      ) : null}

      {tab === "devices" ? (
        <div className="tabpanel">
          <DevicesPanel access={access} branches={deviceBranches} />
        </div>
      ) : null}
    </>
  );
}

function DevicesPanel({ access, branches }: { access: Access; branches: BranchRow[] }) {
  const state = permissionState(access, "user.update");
  const first = branches[0];

  return (
    <div className="stack">
      <p className="state-bar" role="note">
        อุปกรณ์ counter ที่ใช้ร่วมกัน: ไม่มีการใช้งานตามเวลาที่ตั้งไว้จะล็อกหน้าจอและต้องยืนยันตัวตนใหม่ ·
        หน้าเข้าสู่ระบบซ่อน “จดจำฉันไว้” บนเครื่องแบบนี้ (ข้อ 9.2)
      </p>

      <section className="card" aria-labelledby="u-device-title">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="u-device-title">
              ลงทะเบียนอุปกรณ์
            </h2>
            <p className="card__subtitle">ลงทะเบียนเครื่องหน้าเคาน์เตอร์ของสาขาที่คุณดูแล (api.register_device)</p>
          </div>
        </div>
        <DeviceForm
          branches={branches}
          defaultDeviceId={first ? `${first.code}-COUNTER-1` : ""}
          blockedReason={state.reason}
        />
      </section>

      <p className="help">
        รายการอุปกรณ์ที่ลงทะเบียนไว้ยังไม่แสดงในหน้านี้ เพราะตาราง core.devices ไม่ได้เปิดให้บทบาทหน้าร้านอ่าน —
        การเดารายการจากฝั่งแอปจะเป็นการแสดงข้อมูลที่ฐานข้อมูลไม่ได้รับรอง
      </p>
    </div>
  );
}
