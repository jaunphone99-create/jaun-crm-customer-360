import type { Metadata } from "next";

import { QueueList } from "@/features/reception/QueueList";
import { ReceptionForm } from "@/features/reception/ReceptionForm";
import { date as thaiDate, time as thaiTime } from "@/lib/format/date";
import { DASH, int } from "@/lib/format/number";
import { loadReception } from "@/features/reception/queries";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess } from "@/lib/access";

import "@/app/generated/page-reception.css";

export const metadata: Metadata = { title: "รับลูกค้าเข้าร้าน" };
export const dynamic = "force-dynamic";

/* เกณฑ์ "รอนาน" ของคิวหน้าร้าน = sla.visitor_waiting_min (CANONICAL ข้อ 11.2)
   ค่าอยู่ใน app.settings แต่ api.get_settings เปิดให้เฉพาะผู้ดูแล — หน้าร้านอ่านไม่ได้
   จึงยึดค่าจาก CANONICAL ไว้ที่นี่ และเปลี่ยนเมื่อค่าตั้งเปลี่ยน */
const WAITING_LONG_MIN = 15;

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; flash?: string }>;
}) {
  const access = await requireAccess();

  /* กันคนที่เข้ามาตรง ๆ ด้วยลิงก์ — เมนูซ่อนไว้แล้วแต่ลิงก์ยังพิมพ์เองได้
     (ฐานข้อมูลไม่คืนข้อมูลให้อยู่แล้ว ที่นี่แค่ทำให้ข้อความอ่านรู้เรื่องแทนหน้าพัง) */
  if (!can(access, "visit.read")) {
    return (
      <NotAuthorized
        allowedRoles={["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS"]}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={
          needsMfaFor(access, "visit.read")
            ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน"
            : undefined
        }
      />
    );
  }
  if (access.branches.length === 0) {
    return (
      <NotAuthorized
        title="ยังไม่ได้ผูกกับสาขา"
        myRoles={access.roles.map((r) => r.role_code)}
        detail="บัญชีนี้ยังไม่มีสาขาที่รับผิดชอบ จึงยังเปิดหน้ารับลูกค้าไม่ได้ — ให้ผู้จัดการสาขากำหนดสาขาให้ก่อน"
      />
    );
  }

  const { branch: branchParam, flash } = await searchParams;
  const data = await loadReception(access, branchParam);

  const interestLabels = Object.fromEntries(data.interests.map((i) => [i.code, i.label_th]));
  const outcomeLabels = Object.fromEntries(data.outcomes.map((o) => [o.code, o.label_th]));

  return (
    <>
      <div className="page__head">
        <div>
          <h1>รับลูกค้าเข้าร้าน</h1>
          <p className="t-sm t-muted">
            {data.branch.name_th} · {thaiDate(data.now)} {thaiTime(data.now, { suffix: true })}
          </p>
        </div>

        {data.branches.length > 1 ? (
          <form className="row" style={{ gap: "var(--space-2)" }}>
            <label className="label" htmlFor="branch">
              สาขา
            </label>
            <select className="input" id="branch" name="branch" defaultValue={data.branch.code}>
              {data.branches.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name_th}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn--secondary btn--sm">
              เปลี่ยนสาขา
            </button>
          </form>
        ) : null}
      </div>

      {/* ข้อความยืนยันจากหน้า Quick Capture ที่พากลับมาที่นี่ (?flash=)
          ต้องเห็นจริง ไม่งั้นพนักงานไม่รู้ว่าบันทึกสำเร็จหรือไม่ แล้วจะกดซ้ำ */}
      {flash ? (
        <div className="alert alert--success" role="status" style={{ marginBottom: "var(--space-3)" }}>
          <span aria-hidden="true">✓</span>
          <div>
            <p className="alert__title">บันทึกแล้ว</p>
            <p>{flash}</p>
          </div>
        </div>
      ) : null}

      <div className="rc-chips" role="group" aria-label={`สรุปวันนี้ ${data.branch.name_th}`}>
        <span className="rc-chip">
          ลูกค้าเข้าร้าน (Walk-in) <strong>{int(data.kpis.walkIn)}</strong>
        </span>
        <span className="rc-chip">
          ผู้มาติดต่อ (Visitor) <strong>{int(data.kpis.visits)}</strong>
        </span>
        <span className="rc-chip">
          visit เปิดอยู่ <strong>{int(data.kpis.openVisits)}</strong>
        </span>
        <span className="rc-chip">
          บันทึกตัวตนได้ <strong>{data.kpis.captureRate ?? DASH}</strong>
        </span>
      </div>
      <p className="t-xs t-muted" style={{ marginTop: "var(--space-1)" }}>
        ตัวเลขทั้งหมดมาจาก <code>api.get_kpis</code> ตามขอบเขตสิทธิ์ของคุณ — หน้าจอไม่คำนวณเอง
      </p>

      <div className="rc-grid" style={{ marginTop: "var(--space-4)" }}>
        <ReceptionForm
          branchCode={data.branch.code}
          interests={data.interests}
          sources={data.sources}
          createState={
            can(access, "visit.create", data.branch.branch_id)
              ? "allowed"
              : needsMfaFor(access, "visit.create")
                ? "mfa"
                : "none"
          }
        />

        <QueueList
          visits={data.visits}
          now={data.now}
          staffNames={Object.fromEntries(data.staffNames)}
          customers={Object.fromEntries(data.customers)}
          interestLabels={interestLabels}
          outcomeLabels={outcomeLabels}
          outcomes={data.outcomes}
          myStaffId={access.staff.staff_id}
          waitingLongMinutes={WAITING_LONG_MIN}
        />
      </div>
    </>
  );
}
