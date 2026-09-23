import type { Metadata } from "next";
import Link from "next/link";

import "@/app/generated/page-data-quality.css";

import { loadDetailContext } from "@/features/data-quality/context";
import { FilterBar } from "@/features/data-quality/FilterBar";
import { IssueDetail } from "@/features/data-quality/IssueDetail";
import { IssueSummary } from "@/features/data-quality/IssueSummary";
import {
  ISSUE_CONDITION,
  ISSUE_EXTRA_RULE,
  ISSUE_FIX_PERMISSION,
  ISSUE_LABEL,
} from "@/features/data-quality/labels";
import { loadBranches, loadSummary } from "@/features/data-quality/queries";
import { ROWS_SHOWN, isIssueCode, type BranchRow, type IssueCode, type Summary } from "@/features/data-quality/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess, type Access } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";
import { int } from "@/lib/format/number";

/* หน้า 12 · ศูนย์คุณภาพข้อมูล — วัดว่าข้อมูลถูกบันทึกครบ และพาไปแก้ทีละรายการ (CANONICAL ข้อ 12.3)

   กติกาที่ทั้งหน้ายึด

   1. **ตัวเลขทุกตัวมาจากฐานข้อมูล** — การ์ดสรุปใช้ total ของ api.list_data_quality_issues
      รายสาขาใช้ counts ของ RPC เดียวกัน · หน้าจอไม่บวก ไม่ลบ ไม่นับจากความยาวของรายการที่แสดงอยู่
   2. **แก้แล้วต้องอ่านค่าใหม่** — ทุก Server Action จบด้วย revalidatePath("/data-quality")
      หน้าเป็น force-dynamic จึงถาม RPC ใหม่ทุกครั้งหลังแก้ ตัวเลขที่เห็นคือตัวเลขที่ฐานข้อมูลนับใหม่จริง
   3. **สิทธิ์ตัดสินที่ฐานข้อมูล** — can() ที่นี่ใช้แค่ซ่อนปุ่มและกันไม่ให้หน้าจอเสนอสิ่งที่ทำไม่ได้

   สถานะของหน้าอยู่ใน query string ทั้งหมด (issue · branch) จึงแชร์ลิงก์ให้ดูด้วยกันได้ */

export const metadata: Metadata = { title: "ศูนย์คุณภาพข้อมูล" };
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"];

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
      <Link className="btn btn--secondary" href="/data-quality">
        ลองอีกครั้ง
      </Link>
    </div>
  );
}

/** ส่วนรายละเอียด — แยกออกมาเพราะต้องอ่านตารางเพิ่มเฉพาะชนิดที่เลือกเท่านั้น */
async function Detail({
  access,
  code,
  summary,
  branchNames,
  branchId,
}: {
  access: Access;
  code: IssueCode;
  summary: Summary;
  branchNames: Record<string, string>;
  branchId: string | null;
}) {
  const { total, rows } = summary.byCode[code];
  /* อ่านรายละเอียดเฉพาะแถวที่จะแสดงจริง — ไม่ใช่ทั้งชุดที่ RPC คืนมา */
  const shown = rows.slice(0, ROWS_SHOWN);
  const ctx = await loadDetailContext(access, code, shown, branchNames, branchId);

  return (
    <section className="card card--flush section" aria-labelledby="dq-detail-title">
      <div className="card__header dq-detail-head">
        <div>
          <h2 className="card__title" id="dq-detail-title">
            {ISSUE_LABEL[code]} ({int(total)})
          </h2>
          <p className="card__subtitle">
            {ISSUE_CONDITION[code]} · แก้ด้วยสิทธิ์ <span className="code">{ISSUE_FIX_PERMISSION[code]}</span>
            {ISSUE_EXTRA_RULE[code] ? ` · ${ISSUE_EXTRA_RULE[code]}` : ""}
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" href="/data-quality">
          ปิดรายละเอียด
        </Link>
      </div>
      <div className="stack" style={{ padding: "var(--space-4)" }}>
        <IssueDetail ctx={ctx} code={code} rows={shown} total={total} />
      </div>
    </section>
  );
}

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();

  /* กันคนที่พิมพ์ลิงก์เข้ามาตรง ๆ — ฐานข้อมูลไม่คืนข้อมูลให้อยู่แล้ว
     ที่นี่แค่ทำให้ได้ข้อความที่อ่านรู้เรื่องแทนหน้าว่างที่ดูเหมือนระบบพัง */
  if (!can(access, "data_quality.view")) {
    return (
      <NotAuthorized
        allowedRoles={ALLOWED_ROLES}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={needsMfaFor(access, "data_quality.view") ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" : undefined}
      />
    );
  }

  const sp = await searchParams;
  const issueParam = one(sp.issue);
  const issue: IssueCode | null = isIssueCode(issueParam) ? issueParam : null;

  /* เลือกได้เฉพาะสาขาในสิทธิ์ของผู้ใช้ · สาขาอื่นถือว่าไม่ได้เลือก แล้วปล่อยให้ RLS ตัดสินต่อ */
  const branchParam = one(sp.branch);
  const picked = access.branches.find((b) => b.code === branchParam) ?? null;

  const head = (
    <header className="page-header">
      <div className="page-header__main">
        <h1 className="page-header__title">ศูนย์คุณภาพข้อมูล</h1>
        <p className="page-header__lead">
          รายการที่ต้องแก้ไขตามขอบเขตของคุณ · ตัวเลขทุกตัวนับจากฐานข้อมูลโดยตรง แก้แล้วจะลดลงเองเมื่อโหลดใหม่
        </p>
      </div>
    </header>
  );

  let summary: Summary;
  let branches: BranchRow[];
  try {
    [summary, branches] = await Promise.all([
      loadSummary(picked ? [picked.branch_id] : null),
      loadBranches(),
    ]);
  } catch (e) {
    return (
      <>
        {head}
        <ErrorCard error={e} />
      </>
    );
  }

  const branchNames: Record<string, string> = Object.fromEntries(branches.map((b) => [b.branch_id, b.name_th]));

  /* ตัวกรองที่ต้องติดไปกับลิงก์ของการ์ด เพื่อให้กดเลือกชนิดแล้วสาขาที่เลือกไว้ไม่หาย */
  const query: Record<string, string> = {};
  if (picked) query.branch = picked.code;
  if (issue) query.issue = issue;

  /* ขอบเขตที่ฐานข้อมูลบอกว่าคำขอนี้ครอบคลุม — บอกผู้ใช้ตรง ๆ ว่ากำลังดูของกี่สาขา */
  const scopeText = picked
    ? `ขอบเขต: ${picked.name_th}`
    : `ขอบเขต: ทุกสาขาที่คุณดูได้ (${int(summary.branchIds.length)} สาขา)`;

  return (
    <>
      {head}

      <section className="section" aria-labelledby="dq-summary-title">
        <h2 className="section__title" id="dq-summary-title">
          จำนวนรายการต่อชนิดปัญหา
        </h2>
        <p className="t-sm t-muted" style={{ marginBottom: "var(--space-3)" }}>
          <span className="chip">{scopeText}</span>
        </p>
        <IssueSummary summary={summary} selected={issue} query={query} />
        <p className="t-xs t-muted" style={{ marginTop: "var(--space-2)" }}>
          รายการระดับลูกค้าผูกสาขาด้วยสาขาแรกของลูกค้า · &ldquo;ไม่ได้บันทึกผลการให้บริการ&rdquo; นับเฉพาะช่วงวันที่ตั้งไว้ใน
          ค่าตั้งของระบบ · กดการ์ดเพื่อดูและแก้รายการของชนิดนั้น
        </p>
      </section>

      <FilterBar
        branches={access.branches}
        issue={issue}
        branchCode={picked?.code ?? null}
        isDefault={!picked && !issue}
      />

      {issue ? (
        <Detail
          access={access}
          code={issue}
          summary={summary}
          branchNames={branchNames}
          branchId={picked?.branch_id ?? null}
        />
      ) : (
        <p className="state-bar" role="note">
          เลือกชนิดปัญหาจากการ์ดด้านบนหรือจากตัวกรอง เพื่อดูรายการและปุ่มแก้ของชนิดนั้น
        </p>
      )}
    </>
  );
}
