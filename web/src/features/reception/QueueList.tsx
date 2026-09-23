"use client";

import { useActionState } from "react";

import { claimVisit, closeVisit, type ActionState } from "./actions";
import { minutesBetween, time as thaiTime } from "@/lib/format/date";
import { DASH, int } from "@/lib/format/number";
import type { RefItem, VisitRow, VisitStatus } from "./queries";

/* การ์ดขวา: คิววันนี้

   แถวหนึ่ง = visit หนึ่งรายการ ทั้งที่ยังรอ กำลังให้บริการ และที่ปิดแล้ว
   ปุ่มที่กดได้ขึ้นกับสถานะ — แต่การปฏิเสธจริงเกิดที่ฐานข้อมูล ไม่ใช่ที่นี่ */

const initial: ActionState = { ok: false, message: null };

const STATUS_LABEL: Record<VisitStatus, string> = {
  WAITING: "รอคิว",
  IN_SERVICE: "กำลังให้บริการ",
  COMPLETED: "เสร็จแล้ว",
  LEFT: "ออกก่อนรับบริการ",
  CANCELLED: "ยกเลิก",
};

const STATUS_TONE: Record<VisitStatus, string> = {
  WAITING: "badge--warning",
  IN_SERVICE: "badge--info",
  COMPLETED: "badge--success",
  LEFT: "badge--neutral",
  CANCELLED: "badge--neutral",
};

/** ผลที่พนักงานเลือกเองได้ — LEFT_BEFORE_SERVICE กับ UNRECORDED ระบบเป็นผู้ใส่ (ข้อ 4.2) */
const SELECTABLE_OUTCOMES = ["PURCHASED", "FOLLOW_UP", "NOT_YET", "NOT_INTERESTED", "SERVICE_DONE"];

function ClaimButton({ visitId, disabled }: { visitId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(claimVisit, initial);
  return (
    <form action={action}>
      <input type="hidden" name="visitId" value={visitId} />
      <button type="submit" className="btn btn--secondary btn--sm" disabled={disabled || pending}>
        {pending ? "กำลังรับ…" : "รับคิว"}
      </button>
      {state.message && !state.ok ? <p className="error-text">{state.message}</p> : null}
    </form>
  );
}

function RecordOutcome({ visitId, outcomes }: { visitId: string; outcomes: RefItem[] }) {
  const [state, action, pending] = useActionState(closeVisit, initial);
  const choices = outcomes.filter((o) => SELECTABLE_OUTCOMES.includes(o.code));

  return (
    <details className="rc-record">
      <summary className="btn btn--secondary btn--sm">บันทึกผล</summary>
      <form action={action} className="stack" style={{ marginTop: "var(--space-2)" }}>
        <input type="hidden" name="visitId" value={visitId} />
        <div className="field">
          <label className="label" htmlFor={`outcome-${visitId}`}>
            ผลของการให้บริการ
          </label>
          <select className="input" id={`outcome-${visitId}`} name="outcome_code" defaultValue="" required>
            <option value="" disabled>
              เลือกผล
            </option>
            {choices.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label_th}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn--accent btn--sm" disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึกและปิดคิว"}
        </button>
        {state.message && !state.ok ? <p className="error-text">{state.message}</p> : null}
      </form>
    </details>
  );
}

export function QueueList({
  visits,
  now,
  staffNames,
  customers,
  interestLabels,
  outcomeLabels,
  outcomes,
  myStaffId,
  waitingLongMinutes,
}: {
  visits: VisitRow[];
  now: string;
  staffNames: Record<string, string>;
  customers: Record<string, { customer_no: string; display_name: string | null }>;
  interestLabels: Record<string, string>;
  outcomeLabels: Record<string, string>;
  outcomes: RefItem[];
  myStaffId: string;
  waitingLongMinutes: number;
}) {
  const isOpen = (v: VisitRow) => v.status === "WAITING" || v.status === "IN_SERVICE";
  const open = visits.filter(isOpen);

  if (visits.length === 0) {
    return (
      <section className="card rc-queue-col" aria-labelledby="rc-queue-title">
        <div className="rc-card-head">
          <h2 className="card__title" id="rc-queue-title">
            คิววันนี้ (0)
          </h2>
        </div>
        <p className="t-sm t-muted">ยังไม่มีคิววันนี้</p>
      </section>
    );
  }

  return (
    <section className="card rc-queue-col" aria-labelledby="rc-queue-title">
      <div className="rc-card-head">
        <h2 className="card__title" id="rc-queue-title">
          คิววันนี้ ({int(open.length)})
        </h2>
        <span className="t-xs t-muted">รวมที่ปิดแล้ว {int(visits.length - open.length)} รายการ</span>
      </div>

      <ol className="queue-list" aria-label="คิววันนี้">
        {visits.map((v) => {
          const waited = v.status === "WAITING" ? minutesBetween(v.started_at, now) : null;
          const isLong = waited !== null && waited > waitingLongMinutes;
          const customer = v.customer_id ? customers[v.customer_id] : undefined;
          const owner = v.owner_staff_id ? staffNames[v.owner_staff_id] : undefined;

          const meta: string[] = [`เข้าคิว ${thaiTime(v.started_at)}`];
          if (waited !== null) meta.push(`รอ ${int(waited)} นาที`);
          if (v.owner_staff_id) meta.push(`ผู้รับ ${owner ?? DASH}`);
          meta.push(
            v.customer_id
              ? `ลูกค้า: ${customer?.display_name ?? `ระบุแล้ว (ชื่อ ${DASH})`}`
              : "ยังไม่ระบุลูกค้า"
          );
          if (v.outcome_code) meta.push(`ผล: ${outcomeLabels[v.outcome_code] ?? v.outcome_code}`);

          const mine = v.owner_staff_id === myStaffId;

          return (
            <li className="queue-item" data-status={v.status} key={v.id} {...(isLong ? { "data-waiting-long": "true" } : {})}>
              <span className="queue-item__no">
                <span className="sr-only">คิว</span>
                {v.queue_no ?? DASH}
              </span>

              <div>
                <div className="row" style={{ gap: "var(--space-2)" }}>
                  <span className={`badge ${STATUS_TONE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                  <span className="queue-item__title">
                    {v.interest_code ? (interestLabels[v.interest_code] ?? v.interest_code) : DASH}
                  </span>
                  {v.party_size > 1 ? <span className="badge badge--neutral badge--square">{int(v.party_size)} คน</span> : null}
                  {isLong ? <span className="badge badge--warning badge--square">รอนาน</span> : null}
                </div>
                <p className="queue-item__meta">{meta.join(" · ")}</p>
              </div>

              <div className="queue-item__actions">
                {v.status === "WAITING" ? <ClaimButton visitId={v.id} disabled={false} /> : null}
                {v.status === "IN_SERVICE" && mine ? <RecordOutcome visitId={v.id} outcomes={outcomes} /> : null}
                {v.status === "IN_SERVICE" && !mine ? (
                  <span className="t-xs t-muted">บันทึกผลได้เฉพาะคิวที่คุณรับ</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
