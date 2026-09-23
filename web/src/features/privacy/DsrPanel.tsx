import Link from "next/link";

import { date, dateTime } from "@/lib/format/date";
import { DASH, showing } from "@/lib/format/number";

import { ActionRow, DefList, DsrStatusBadge } from "./Bits";
import {
  AnonymizeForm,
  ExtendDsrForm,
  PackageForm,
  RejectDsrForm,
  StatusStepForm,
  VerifyDsrForm,
} from "./DsrForms";
import type { ButtonState } from "./scope";
import {
  DSR_TYPE_LABEL,
  DSR_VERIFICATION_LABEL,
  OPEN_DSR_STATUSES,
  TWO_PERSON_TEXT,
  type AuditEntry,
  type CustomerBrief,
  type DsrRow,
  type StaffBrief,
} from "./types";

/* แท็บ "คำขอเจ้าของข้อมูล" ของหน้า 17

   ตารางและรายละเอียดอยู่หน้าเดียวกัน และคำขอที่เปิดอยู่ถูกเลือกผ่าน ?dsr=<เลขคำขอ>
   จึงแชร์ลิงก์ให้เพื่อนร่วมงานเปิดคำขอเดียวกันได้ โดยไม่ต้องมี state ฝั่ง client

   หน้าจอไม่ "คิด" อะไรแทนฐานข้อมูลเลย: สถานะ · วันครบกำหนด · ผู้ยืนยันตัวตน
   มาจาก api.list_dsr ทั้งหมด ส่วนปุ่มที่กดไม่ได้ก็บอกเหตุผลเดียวกับที่ฐานข้อมูลจะตอบ */

type Props = {
  rows: DsrRow[];
  customers: Map<string, CustomerBrief>;
  staff: Map<string, StaffBrief>;
  selected: DsrRow | null;
  /** ร่องรอยการทำงานของคำขอที่เปิดอยู่ + ของลูกค้าที่ผูกไว้ (audit.audit_logs) */
  history: AuditEntry[];
  /** id ของผู้ใช้ปัจจุบัน — ใช้เทียบกับ verified_by เพื่ออธิบายกติกาผู้ยืนยัน ≠ ผู้ดำเนินการ */
  myStaffId: string;
  myLabel: string;
  manage: ButtonState;
  anonymize: ButtonState;
  baseQuery: Record<string, string>;
};

function staffLabel(id: string | null, staff: Map<string, StaffBrief>): string {
  if (!id) return DASH;
  const s = staff.get(id);
  return s ? `${s.display_name} · ${s.staff_code}` : DASH;
}

function customerLabel(id: string | null, customers: Map<string, CustomerBrief>): string {
  if (!id) return DASH;
  const c = customers.get(id);
  /* ลูกค้าที่ไม่อยู่ใน map = RLS ไม่ให้ผู้ใช้คนนี้เห็น — บอกตรง ๆ ดีกว่าโชว์ uuid เปล่า */
  return c ? `${c.display_name} · ${c.customer_no}` : "ไม่มีสิทธิ์ดูลูกค้ารายนี้";
}

export function DsrPanel(props: Props) {
  const { rows, customers, staff, selected, baseQuery } = props;

  return (
    <div className="tabpanel stack">
      <p className="state-bar" role="note">
        ดำเนินการภายใน 30 วันนับจากวันรับคำขอ (ขยายเวลาได้พร้อมเหตุผล) · ห้ามเก็บสำเนาบัตรประชาชน ·
        ช่องทางติดต่อของผู้ยื่นถูกเก็บแบบปิดบัง (ข้อ 10.4)
      </p>

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">คำขอเจ้าของข้อมูล</caption>
            <thead>
              <tr>
                <th scope="col">เลขคำขอ</th>
                <th scope="col">ประเภท</th>
                <th scope="col">ลูกค้า</th>
                <th scope="col">ผู้ยื่นคำขอ</th>
                <th scope="col">ช่องทางติดต่อผู้ยื่น</th>
                <th scope="col">รับเมื่อ</th>
                <th scope="col">ครบกำหนด</th>
                <th scope="col">สถานะ</th>
                <th scope="col">ผู้รับคำขอ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-empty-cell">
                    <div className="state">
                      <p className="state__title">ยังไม่มีคำขอของเจ้าของข้อมูล</p>
                      <p className="state__text">
                        กด “รับคำขอ” ด้านบนเพื่อบันทึกคำขอที่ได้รับจากหน้าร้านหรือช่องทางอื่น
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isSelected = selected?.dsr_id === r.dsr_id;
                  return (
                    <tr key={r.dsr_id} aria-selected={isSelected ? true : undefined}>
                      <td>
                        <Link
                          className="link-btn"
                          href={{ pathname: "/privacy", query: { ...baseQuery, dsr: r.request_no ?? r.dsr_id } }}
                        >
                          <span className="code">{r.request_no ?? DASH}</span>
                        </Link>
                      </td>
                      <td>
                        <span className="badge badge--neutral badge--square">
                          {DSR_TYPE_LABEL[r.request_type] ?? r.request_type}
                        </span>
                      </td>
                      <td>{customerLabel(r.customer_id, customers)}</td>
                      <td>{r.requester_name}</td>
                      <td>{r.requester_contact_masked ?? DASH}</td>
                      <td className="nowrap">{dateTime(r.received_at)}</td>
                      <td className="nowrap">
                        {date(r.due_at)}
                        {r.extended_until ? (
                          <span className="t-sm t-muted"> · ขยายถึง {date(r.extended_until)}</span>
                        ) : null}
                      </td>
                      <td>
                        <DsrStatusBadge status={r.status} />
                      </td>
                      <td>{staffLabel(r.received_by, staff)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div className="card__footer">
            <span className="pagination__label">{showing(rows.length, rows.length, { unit: "คำขอ" })}</span>
          </div>
        ) : null}
      </div>

      {selected ? <DsrDetail {...props} selected={selected} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- รายละเอียดคำขอ */

function DsrDetail({
  selected,
  customers,
  staff,
  history,
  myStaffId,
  myLabel,
  manage,
  anonymize,
  baseQuery,
}: Props & { selected: DsrRow }) {
  const customer = selected.customer_id ? (customers.get(selected.customer_id) ?? null) : null;
  const isOpen = OPEN_DSR_STATUSES.includes(selected.status);
  const verified = selected.verified_by !== null;

  /* เงื่อนไขทุกข้อด้านล่างเป็นสำเนาของสิ่งที่ api.anonymize_customer ตรวจอยู่แล้ว
     มีไว้เพื่อบอกผู้ใช้ล่วงหน้าว่าทำไมยังกดไม่ได้ · ไม่ใช่เพื่อแทนการตรวจของฐานข้อมูล */
  const anonymizeReason = (() => {
    if (!selected.customer_id || !customer) return "คำขอนี้ยังไม่ผูกกับลูกค้าที่คุณเห็นได้";
    if (customer.record_status === "ANONYMIZED") return "ลูกค้ารายนี้ทำข้อมูลนิรนามแล้ว";
    if (customer.legal_hold) return "ลูกค้ารายนี้ติด legal hold (ข้อ 10.3)";
    if (!verified) return "ต้องยืนยันตัวตนผู้ยื่นคำขอก่อน";
    if (selected.verified_by === myStaffId) return TWO_PERSON_TEXT;
    return null;
  })();

  const packageReason = (() => {
    if (selected.request_type !== "ACCESS" && selected.request_type !== "PORTABILITY") {
      return "สร้างแพ็กเกจได้เฉพาะคำขอขอดู/ขอสำเนา และขอโอนย้ายข้อมูล";
    }
    if (!selected.customer_id) return "คำขอนี้ยังไม่ผูกกับลูกค้า";
    if (!verified) return "ต้องยืนยันตัวตนผู้ยื่นคำขอก่อน";
    return null;
  })();

  return (
    <section className="card stack" aria-labelledby="pv-dsr-detail">
      <div className="card__header">
        <div>
          <h2 className="card__title" id="pv-dsr-detail">
            คำขอ {selected.request_no ?? DASH}
          </h2>
          <p className="card__subtitle">
            {DSR_TYPE_LABEL[selected.request_type] ?? selected.request_type} · <DsrStatusBadge status={selected.status} />
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" href={{ pathname: "/privacy", query: baseQuery }}>
          ปิด
        </Link>
      </div>

      <DefList
        items={[
          { term: "ลูกค้า", value: customerLabel(selected.customer_id, customers) },
          { term: "ผู้ยื่นคำขอ", value: selected.requester_name },
          { term: "ช่องทางติดต่อผู้ยื่น", value: selected.requester_contact_masked ?? DASH },
          {
            term: "รับเมื่อ · ผู้รับคำขอ",
            value: `${dateTime(selected.received_at)} · ${staffLabel(selected.received_by, staff)}`,
          },
          {
            term: "ครบกำหนด",
            value: selected.extended_until
              ? `${date(selected.due_at)} · ขยายถึง ${date(selected.extended_until)}`
              : date(selected.due_at),
          },
          {
            term: "วิธียืนยันตัวตน",
            value: selected.verification_method
              ? (DSR_VERIFICATION_LABEL[selected.verification_method] ?? selected.verification_method)
              : DASH,
          },
          { term: "ผู้ยืนยันตัวตน", value: staffLabel(selected.verified_by, staff) },
          { term: "เสร็จสิ้นเมื่อ", value: selected.completed_at ? dateTime(selected.completed_at) : DASH },
          { term: "หมายเหตุ", value: selected.note ?? DASH },
        ]}
      />

      {/* ข้อ 20.4 · Q26 — สองคนคนละบทบาท ต้องอ่านออกจากหน้าจอโดยไม่ต้องเปิด audit */}
      <div className={`state-bar ${selected.verified_by === myStaffId ? "state-bar--mfa" : ""}`} role="note">
        {verified
          ? selected.verified_by === myStaffId
            ? `คุณ (${myLabel}) เป็นผู้ยืนยันตัวตนของคำขอนี้ — การทำข้อมูลนิรนามต้องให้ผู้ดูแลข้อมูลธุรกิจอีกคนเป็นผู้ดำเนินการ (ข้อ 10.4 · Q26)`
            : `ผู้ยืนยันตัวตนคือ ${staffLabel(selected.verified_by, staff)} — คุณ (${myLabel}) จึงเป็นผู้ดำเนินการได้`
          : "ยังไม่มีผู้ยืนยันตัวตน — ขั้นตอนที่มีผลกับข้อมูลลูกค้าทั้งหมดถูกปิดไว้จนกว่าจะยืนยันตัวตนผู้ยื่นคำขอ"}
      </div>

      {manage.visible && isOpen ? (
        <section aria-label="ขั้นตอนดำเนินการ" className="stack">
          <h3 className="section__title">ดำเนินการ</h3>

          <ActionRow>
            {selected.status === "RECEIVED" ? (
              <VerifyDsrForm dsrId={selected.dsr_id} blockedReason={manage.reason} />
            ) : null}

            {selected.status === "VERIFIED" ? (
              <StatusStepForm
                dsrId={selected.dsr_id}
                status="IN_PROGRESS"
                label="เริ่มดำเนินการ"
                blockedReason={manage.reason}
              />
            ) : null}

            <StatusStepForm
              dsrId={selected.dsr_id}
              status="COMPLETED"
              label="ปิดคำขอว่าเสร็จสิ้น"
              blockedReason={manage.reason ?? (selected.status === "RECEIVED" ? "ต้องยืนยันตัวตนผู้ยื่นคำขอก่อน" : null)}
            />
          </ActionRow>

          <ExtendDsrForm
            dsrId={selected.dsr_id}
            currentStatus={selected.status}
            minDate={(selected.extended_until ?? selected.due_at).slice(0, 10)}
            blockedReason={manage.reason}
          />

          {selected.request_type === "ACCESS" || selected.request_type === "PORTABILITY" ? (
            <PackageForm dsrId={selected.dsr_id} blockedReason={manage.reason ?? packageReason} />
          ) : null}

          {selected.request_type === "DELETION" && anonymize.visible && customer ? (
            <AnonymizeForm
              dsrId={selected.dsr_id}
              customerId={customer.customer_id}
              customerNo={customer.customer_no}
              verifierLabel={staffLabel(selected.verified_by, staff)}
              operatorLabel={myLabel}
              blockedReason={anonymize.reason ?? anonymizeReason}
            />
          ) : null}

          <RejectDsrForm dsrId={selected.dsr_id} blockedReason={manage.reason} />
        </section>
      ) : null}

      <HistoryList entries={history} />
    </section>
  );
}

/* ------------------------------------------------------------- ร่องรอยการทำงาน */

/** ใครทำอะไรกับคำขอนี้และกับลูกค้าที่ผูกไว้ — มาจาก audit.audit_logs ไม่ใช่จากสถานะปัจจุบัน */
function HistoryList({ entries }: { entries: AuditEntry[] }) {
  return (
    <section aria-label="ร่องรอยการทำงาน" className="stack">
      <h3 className="section__title">ร่องรอยการทำงาน</h3>
      {entries.length === 0 ? (
        <p className="help">
          ยังไม่มีร่องรอยที่คุณดูได้ · การดูร่องรอยทั้งหมดต้องมีสิทธิ์อ่านประวัติการแก้ไข
        </p>
      ) : (
        <ul className="timeline">
          {entries.map((e) => (
            <li className="timeline__item" key={e.id}>
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__body">
                <p className="timeline__title">{AUDIT_LABEL[e.action] ?? e.action}</p>
                <p className="timeline__meta">
                  {dateTime(e.occurred_at)} · {e.actor_label ?? e.actor_staff_code ?? DASH}
                  {e.reason ? ` · ${e.reason}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** ชื่อ action ของ audit ที่หน้านี้พบได้ — ชื่ออื่นแสดงดิบไว้ ดีกว่าแปลผิด */
const AUDIT_LABEL: Record<string, string> = {
  DSR_CREATED: "รับคำขอ",
  DSR_UPDATED: "แก้ไขคำขอ",
  DSR_COMPLETED: "ปิดคำขอว่าเสร็จสิ้น",
  DSR_PACKAGE_BUILT: "สร้างแพ็กเกจข้อมูล",
  CUSTOMER_ANONYMIZED: "ทำข้อมูลนิรนาม",
  CUSTOMER_UPDATED: "แก้ไขข้อมูลลูกค้า",
  CONSENT_RECORDED: "บันทึกความยินยอม",
};
