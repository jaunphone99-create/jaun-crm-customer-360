import type { Metadata } from "next";
import Link from "next/link";

import { AuditTable } from "@/features/audit/AuditTable";
import { EntityHistoryPanel } from "@/features/audit/EntityHistoryPanel";
import { EMPTY_FILTER, FilterBar, type FilterValues } from "@/features/audit/FilterBar";
import {
  loadActorOptions,
  loadBranchNames,
  loadEntityHistory,
  searchAccessLog,
  searchAudit,
  searchSecurityLog,
  type AuditResult,
  type AuditRow,
  type SecurityResult,
} from "@/features/audit/queries";
import { SecurityPanel } from "@/features/audit/SecurityPanel";
import { MFA_REQUIRED_TEXT, viewFor, type AuditTab } from "@/features/audit/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";
import { addDays, dayKey } from "@/lib/format/date";

/* หน้า 16 · ประวัติการใช้งาน (sitemap-screen-specs ข้อ 19 · CANONICAL ข้อ 9.5)

   หน้านี้เป็น "หลักฐาน" ไม่ใช่รายงาน จึงยึดสามข้อตลอดทั้งไฟล์:

   1. ฐานข้อมูลเป็นผู้ตัดสินว่าใครเห็นอะไร — api.search_audit ต้องมี audit.read ·
      api.search_security_log ต้องมี security_log.read · can() ที่นี่ใช้เลือกว่าจะ "วาดแท็บไหน"
      เท่านั้น ต่อให้พิมพ์ ?tab=business เข้ามาตรง ๆ RPC ก็ปฏิเสธเองอยู่ดี
      ผลข้างเคียงที่ต้องการ: SYSTEM_ADMIN เห็นเฉพาะบันทึกความปลอดภัย ไม่เห็นรายการของลูกค้า (ข้อ 14.1)

   2. ไม่แต่งข้อมูลให้ครบ — เหตุการณ์ที่ RPC ที่มีอยู่อ่านไม่ได้ (การเปิดเผยช่องทางติดต่อ และ
      การผูกลูกค้าเข้าสาขา ซึ่งอยู่ใน audit.access_logs) จะถูกบอกตรง ๆ ว่าอ่านไม่ได้และอยู่ตารางไหน
      ตารางว่างในหน้าหลักฐานอ่านได้ว่า "ไม่มีเหตุการณ์" ซึ่งเป็นคำตอบที่ผิดและอันตราย

   3. สถานะของหน้าอยู่ใน query string ทั้งหมด (tab · view · from · to · actor · action ·
      entity · ref · row · hist) — สิ่งที่คนหนึ่งเห็นต้องสร้างซ้ำได้จาก URL เดียวที่ส่งต่อกันได้
      หน้านี้จึงไม่มีโค้ดฝั่งเบราว์เซอร์เลย

   การเปิดหน้านี้ไม่สร้างประวัติการเข้าถึงเพิ่ม (ข้อ 19.5) — RPC ทั้งสามตัวเป็น STABLE ไม่เขียน log */

export const metadata: Metadata = { title: "ประวัติการใช้งาน" };
export const dynamic = "force-dynamic";

/** บทบาทที่เปิดหน้านี้ได้ (sitemap ข้อ 19.2) — ใช้เฉพาะในการ์ด "ไม่มีสิทธิ์" */
const ALLOWED_ROLES = ["EXECUTIVE", "BUSINESS_ADMIN", "SYSTEM_ADMIN"];

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/* ค่าจากช่อง datetime-local เป็น "YYYY-MM-DDTHH:mm" ที่ไม่มีเขตเวลา
   ถ้าส่งดิบ ๆ ให้ฐานข้อมูล Postgres จะตีความด้วย TimeZone ของ session ซึ่งไม่รับประกันว่าเป็น +07
   ผลคือช่วงที่ค้นเลื่อนไปเจ็ดชั่วโมงโดยไม่มีใครเห็น — จึงตรึงเป็น Asia/Bangkok ตรงนี้ (ข้อ 1.2) */
function toTimestamptz(local: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return undefined;
  return `${local}:00+07:00`;
}

/** ช่วงเวลาสำเร็จรูป — ใช้นาฬิกาของเครื่องแอปเพียงเพื่อ "เติมช่องตัวกรอง" ให้เท่านั้น
    ค่าที่เติมแล้วยังแก้ได้ และผู้ตัดช่วงจริงคือฐานข้อมูลจากค่าที่เราส่งไปพร้อมเขตเวลา +07 */
function quickRanges(): { label: string; from: string; to: string }[] {
  const today = dayKey(new Date().toISOString());
  if (!today) return [];
  const end = `${today}T23:59`;
  return [
    { label: "7 วันล่าสุด", from: `${addDays(today, -6)}T00:00`, to: end },
    { label: "30 วันล่าสุด", from: `${addDays(today, -29)}T00:00`, to: end },
    { label: "90 วันล่าสุด", from: `${addDays(today, -89)}T00:00`, to: end },
    { label: "ไม่จำกัดช่วง", from: "", to: "" },
  ];
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

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  const canBusiness = can(access, "audit.read");
  const canSecurity = can(access, "security_log.read");

  if (!canBusiness && !canSecurity) {
    const mfa = needsMfaFor(access, "audit.read") || needsMfaFor(access, "security_log.read");
    return (
      <NotAuthorized
        allowedRoles={ALLOWED_ROLES}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={mfa ? MFA_REQUIRED_TEXT : undefined}
      />
    );
  }

  const sp = await searchParams;

  /* แท็บที่ขอมา ต้องเป็นแท็บที่ผู้ใช้เปิดได้จริง มิฉะนั้นตกไปแท็บที่เปิดได้
     SYSTEM_ADMIN ไม่มี audit.read จึงมาอยู่แท็บความปลอดภัยเสมอ (ข้อ 19.2) */
  const requested = one(sp.tab) === "security" ? "security" : "business";
  const tab: AuditTab = requested === "business" && !canBusiness ? "security" : requested === "security" && !canSecurity ? "business" : requested;

  const values: FilterValues = {
    view: one(sp.view) || EMPTY_FILTER.view,
    from: one(sp.from),
    to: one(sp.to),
    actor: one(sp.actor).toUpperCase(),
    action: one(sp.action),
    entity: one(sp.entity),
    ref: one(sp.ref).trim(),
  };

  const view = viewFor(values.view);
  const expandedId = /^\d+$/.test(one(sp.row)) ? Number(one(sp.row)) : null;
  const histParam = one(sp.hist);

  /* ตัวกรองที่ต้องติดไปกับทุกลิงก์ในหน้า เพื่อให้กางแถวหรือปิดแผงแล้วผลการค้นไม่หาย */
  const query: Record<string, string> = { tab };
  if (values.view !== "all") query.view = values.view;
  if (values.from) query.from = values.from;
  if (values.to) query.to = values.to;
  if (values.actor) query.actor = values.actor;
  if (values.action) query.action = values.action;
  if (values.entity) query.entity = values.entity;
  if (values.ref) query.ref = values.ref;

  const head = (
    <>
      <header className="page-header">
        <div className="page-header__main">
          <h1 className="page-header__title">ประวัติการใช้งาน</h1>
          <p className="page-header__lead">
            ค้นประวัติการกระทำทางธุรกิจและบันทึกความปลอดภัย · บันทึกเป็นแบบเพิ่มอย่างเดียว
            ไม่มีปุ่มแก้ ลบ หรือส่งออกในหน้านี้ (ข้อ 9.5)
          </p>
        </div>
      </header>
      <p className="state-bar show-mobile" role="note">
        หน้านี้ออกแบบไว้สำหรับคอมพิวเตอร์ — กรุณาใช้งานบนคอมพิวเตอร์เพื่อให้เห็นคอลัมน์ครบ
      </p>
    </>
  );

  const tabs = (
    <nav className="tabs" aria-label="ประเภทประวัติ">
      {(
        [
          { id: "business" as AuditTab, label: "ประวัติการใช้งานธุรกิจ", visible: canBusiness },
          { id: "security" as AuditTab, label: "บันทึกความปลอดภัย", visible: canSecurity },
        ] as const
      )
        .filter((t) => t.visible)
        .map((t) => {
          const isCurrent = t.id === tab;
          return (
            <Link
              key={t.id}
              className="tab"
              href={{ pathname: "/audit", query: { tab: t.id } }}
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

  /* SYSTEM_ADMIN เปิดหน้านี้ได้ แต่เห็นได้ครึ่งเดียวโดยออกแบบ — บอกให้ชัดว่าไม่ใช่ระบบพัง */
  const scopeNote =
    canSecurity && !canBusiness ? (
      <p className="state-bar" role="note">
        ผู้ดูแลระบบเห็นเฉพาะบันทึกความปลอดภัย: เหตุการณ์เข้าสู่ระบบ และการเปลี่ยนบทบาท ผู้ใช้ สิทธิ์
        และค่าตั้ง · ไม่เห็นประวัติการเข้าถึงและรายการของลูกค้า (ข้อ 9.5 · 14.1)
      </p>
    ) : null;

  const rangeInvalid = Boolean(values.from && values.to && values.to < values.from);

  /* ---------------- แท็บบันทึกความปลอดภัย ---------------- */
  if (tab === "security") {
    let data: SecurityResult | null = null;
    let error: unknown = null;
    if (!rangeInvalid) {
      try {
        data = await searchSecurityLog({ from: toTimestamptz(values.from), to: toTimestamptz(values.to) });
      } catch (e) {
        error = e;
      }
    }

    return (
      <>
        {head}
        {tabs}
        {scopeNote}
        <div className="tabpanel stack">
          <FilterBar tab="security" values={values} actors={[]} quickRanges={quickRanges()} />
          <p className="help">
            api.search_security_log รับเฉพาะช่วงเวลา — ไม่มีตัวกรองผู้กระทำหรือการกระทำในฝั่งฐานข้อมูล
            และหน้านี้จะไม่กรองซ้ำที่หน้าจอ เพราะจะเป็นการตัดแถวออกจากผลที่ถูกตัดมาแล้วที่ 200 แถว
          </p>
          {rangeInvalid ? (
            <div className="state state--error" role="alert">
              <p className="state__title">ช่วงเวลาไม่ถูกต้อง</p>
              <p className="state__text">เวลา “ถึง” ต้องไม่ก่อนเวลา “ตั้งแต่”</p>
            </div>
          ) : error ? (
            <ErrorCard error={error} />
          ) : data ? (
            <SecurityPanel data={data} />
          ) : null}
        </div>
      </>
    );
  }

  /* ---------------- แท็บประวัติการใช้งานธุรกิจ ---------------- */
  const [actors, branchNames] = await Promise.all([loadActorOptions(), loadBranchNames()]);
  const actorId = actors.find((a) => a.staffCode === values.actor)?.staffId;

  let result: AuditResult | null = null;
  let error: unknown = null;
  if (view.available && !rangeInvalid) {
    try {
      result =
        view.source === "access"
          ? /* มุมมองนี้อ่าน audit.access_logs ซึ่งเป็นการ "เข้าถึงข้อมูล" ไม่ใช่การ "แก้ข้อมูล"
               RPC คนละตัวจึงรับตัวกรองคนละชุด — ไม่มี entity_type/entity_ref แต่กรองสาขาได้ */
            await searchAccessLog(
              {
                from: toTimestamptz(values.from),
                to: toTimestamptz(values.to),
                actor_staff_id: actorId,
              },
              view.actions
            )
          : await searchAudit(
              {
                from: toTimestamptz(values.from),
                to: toTimestamptz(values.to),
                entity_type: values.entity || undefined,
                entity_ref: values.ref || undefined,
                actor_staff_id: actorId,
                /* ช่อง "การกระทำ" ใช้ได้ตอนอยู่มุมมอง "ทั้งหมด" — ถ้าเลือกมุมมองไว้ ชุด action ของมุมมองชนะ
                   เพื่อไม่ให้เกิดเงื่อนไขที่ขัดกันเองแล้วคืนศูนย์แถวโดยที่ผู้ใช้ไม่รู้ตัว */
                ...(view.actions.length === 0 && values.action ? { action: values.action } : {}),
              },
              view.actions
            );
    } catch (e) {
      error = e;
    }
  }

  /* แผงประวัติของรายการเดียว — เปิดจากปุ่มในแถวที่กางอยู่ */
  let history: { entityType: string; entityId: string; rows: AuditRow[]; error: unknown } | null = null;
  const histMatch = /^([A-Za-z0-9_.]+):([0-9a-fA-F-]{36})$/.exec(histParam);
  if (histMatch) {
    const entityType = histMatch[1]!;
    const entityId = histMatch[2]!;
    try {
      history = { entityType, entityId, rows: await loadEntityHistory(entityType, entityId), error: null };
    } catch (e) {
      history = { entityType, entityId, rows: [], error: e };
    }
  }

  return (
    <>
      {head}
      {tabs}
      <div className="tabpanel stack">
        <FilterBar tab="business" values={values} actors={actors} quickRanges={quickRanges()} />

        {history ? (
          <EntityHistoryPanel
            entityType={history.entityType}
            entityId={history.entityId}
            rows={history.rows}
            error={history.error}
            closeQuery={{ ...query, ...(expandedId ? { row: String(expandedId) } : {}) }}
          />
        ) : null}

        {rangeInvalid ? (
          <div className="state state--error" role="alert">
            <p className="state__title">ช่วงเวลาไม่ถูกต้อง</p>
            <p className="state__text">เวลา “ถึง” ต้องไม่ก่อนเวลา “ตั้งแต่”</p>
          </div>
        ) : !view.available ? (
          /* มุมมองที่ฐานข้อมูลยังไม่เปิดทางให้อ่าน — บอกความจริงแทนที่จะโชว์ตารางว่าง */
          <div className="state state--error" role="note">
            <p className="state__title">เหตุการณ์กลุ่มนี้ยังอ่านผ่านหน้าจอไม่ได้</p>
            <p className="state__text">{view.note}</p>
          </div>
        ) : error ? (
          <ErrorCard error={error} />
        ) : result ? (
          <>
            <AuditTable
              rows={result.rows}
              branchNames={branchNames}
              query={query}
              expandedId={expandedId}
              truncated={result.truncated}
            />
            <p className="help">{view.note}</p>
          </>
        ) : null}

        <p className="t-xs t-muted">
          ค่าของช่องที่เป็นข้อมูลส่วนบุคคลถูกปิดบังตั้งแต่ตอนบันทึกในฐานข้อมูล และเซิร์ฟเวอร์ตัดค่าแฮชทิ้ง
          ก่อนส่งมาที่เบราว์เซอร์เสมอ · api.search_audit ไม่รับตัวกรองสาขา คอลัมน์สาขาจึงมีไว้ดูอย่างเดียว ·
          มุมมอง “เปิดเผยช่องทางติดต่อ” และ “ผูกลูกค้าเข้าสาขา” อ่านจาก audit.access_logs ผ่าน
          api.search_access_log จึงไม่มีช่อง “ก่อน/หลัง” เพราะเป็นการเข้าถึงข้อมูล ไม่ใช่การแก้ข้อมูล
        </p>
      </div>
    </>
  );
}
