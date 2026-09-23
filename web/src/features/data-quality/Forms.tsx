"use client";

import { useActionState } from "react";

import {
  acknowledgeVisit,
  assignOwner,
  closeLeadLost,
  completeCustomer,
  completeTask,
  linkTransaction,
  savePhone,
} from "./actions";
import { FixDisclosure } from "./Disclosure";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState, type RefOption, type StaffOption } from "./types";

/* ฟอร์มแก้ปัญหาของแต่ละชนิด (CANONICAL ข้อ 12.3 คอลัมน์ "แก้โดย")

   ทุกฟอร์มมีรูปเดียวกัน: ฟอร์มธรรมดาที่ส่งไป Server Action → RPC หรือ RLS → revalidatePath
   ไม่มีตัวไหนแตะรายการหรือตัวนับฝั่ง client เอง เพราะตัวเลขที่ลดต้องเป็นตัวเลขที่ฐานข้อมูลนับใหม่จริง

   ฟอร์มไม่ได้ตรวจสิทธิ์ — ปุ่มที่ผู้ใช้กดไม่ได้ถูกตัดตั้งแต่ฝั่งเซิร์ฟเวอร์ผ่าน blockedReason
   และถึงส่งมาได้ ฐานข้อมูลก็ยังปฏิเสธอยู่ดี */

function SubmitRow({ label, pending, variant = "accent" }: { label: string; pending: boolean; variant?: string }) {
  return (
    <div className="row" style={{ marginTop: "var(--space-3)" }}>
      <button type="submit" className={`btn btn--${variant} btn--sm`} disabled={pending}>
        {pending ? "กำลังบันทึก…" : label}
      </button>
    </div>
  );
}

/* ----------------------------------------------------- VISIT_UNRECORDED */

export function AckVisitForm({ visitId, blockedReason }: { visitId: string; blockedReason: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acknowledgeVisit, INITIAL_ACTION);

  return (
    <FixDisclosure label="รับทราบ" title="รับทราบว่าไม่ได้บันทึกผลการให้บริการ" blockedReason={blockedReason}>
      <form action={action} noValidate>
        <input type="hidden" name="visit_id" value={visitId} />
        <Feedback state={state} />
        <p className="t-sm">
          ผลการให้บริการของรายการที่ข้ามวันแล้วแก้ไม่ได้ (ข้อ 4.1) การรับทราบจะบันทึกชื่อและเวลาของคุณไว้
          แล้วรายการนี้จะหลุดจากศูนย์คุณภาพข้อมูล
        </p>
        <SubmitRow label="รับทราบ" pending={pending} variant="primary" />
      </form>
    </FixDisclosure>
  );
}

/* --------------------------------------------------- LEAD_WITHOUT_OWNER */

export function AssignLeadForm({
  leadId,
  candidates,
  reasons,
  blockedReason,
}: {
  leadId: string;
  candidates: StaffOption[];
  reasons: RefOption[];
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(assignOwner, INITIAL_ACTION);

  return (
    <FixDisclosure label="มอบหมาย" title="มอบหมายผู้รับผิดชอบ Lead" blockedReason={blockedReason}>
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="entity_type" value="LEAD" />
        <input type="hidden" name="entity_id" value={leadId} />
        <Feedback state={state} />

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor={`assign-to-${leadId}`}>
              ผู้รับผิดชอบใหม่
            </label>
            <select className="select" id={`assign-to-${leadId}`} name="to_staff_id" defaultValue="" required>
              <option value="" disabled>
                เลือกผู้รับผิดชอบ
              </option>
              {candidates.map((c) => (
                <option key={c.staff_id} value={c.staff_id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="help">ผู้รับผิดชอบต้องมีบทบาทในสาขาของรายการ ฐานข้อมูลตรวจให้อีกชั้น</p>
          </div>

          <div className="field">
            <label className="label" htmlFor={`assign-reason-${leadId}`}>
              เหตุผล
            </label>
            <select className="select" id={`assign-reason-${leadId}`} name="reason_code" defaultValue="" required>
              <option value="" disabled>
                เลือกเหตุผล
              </option>
              {/* ย้ายสาขาเป็นคนละเรื่องกับการมอบหมาย · RPC ปฏิเสธถ้าใช้เหตุผลนี้โดยไม่เปลี่ยนสาขา */}
              {reasons
                .filter((r) => r.code !== "BRANCH_TRANSFER")
                .map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="field span-all">
            <label className="label" htmlFor={`assign-note-${leadId}`}>
              หมายเหตุ
            </label>
            <input className="input" id={`assign-note-${leadId}`} name="note" type="text" maxLength={200} />
            <p className="help">หมายเหตุถูกบันทึกลงประวัติ · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
          </div>
        </div>

        <SubmitRow label="มอบหมาย" pending={pending} />
      </form>
    </FixDisclosure>
  );
}

/* ------------------------------------- MISSING_PHONE · INVALID_PHONE */

export function PhoneForm({
  customerId,
  contactId,
  currentMasked,
  blockedReason,
}: {
  customerId: string;
  contactId: string | null;
  currentMasked: string | null;
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePhone, INITIAL_ACTION);
  const isNew = contactId === null;

  return (
    <FixDisclosure
      label={isNew ? "เพิ่มเบอร์" : "แก้เบอร์"}
      title={isNew ? "เพิ่มเบอร์โทรศัพท์" : "แก้เบอร์โทรศัพท์"}
      blockedReason={blockedReason}
    >
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="customer_id" value={customerId} />
        {contactId ? <input type="hidden" name="contact_id" value={contactId} /> : null}
        <Feedback state={state} />

        {currentMasked ? <p className="t-sm">เบอร์ปัจจุบัน (ปิดบัง): {currentMasked}</p> : null}

        <div className="field">
          <label className="label" htmlFor={`phone-${customerId}`}>
            {isNew ? "เบอร์โทรศัพท์" : "เบอร์โทรศัพท์ใหม่"}
          </label>
          <input
            className="input"
            id={`phone-${customerId}`}
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={20}
            placeholder="08X-XXX-XXXX"
            required
          />
          <p className="help">ระบบจัดรูปแบบและปิดบังให้เอง · หน้าจอแสดงเฉพาะค่าปิดบัง</p>
        </div>

        <SubmitRow label="บันทึก" pending={pending} />
      </form>
    </FixDisclosure>
  );
}

/* ------------------------------------------------- INCOMPLETE_CUSTOMER */

export function CompleteCustomerForm({
  customerId,
  provinces,
  blockedReason,
}: {
  customerId: string;
  provinces: RefOption[];
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(completeCustomer, INITIAL_ACTION);

  return (
    <FixDisclosure label="เติมข้อมูล" title="เติมข้อมูลลูกค้า" blockedReason={blockedReason}>
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="customer_id" value={customerId} />
        <Feedback state={state} />

        <p className="t-sm">
          รายการนี้ขาดนามสกุล ขาดจังหวัด และยังไม่มีความสนใจที่บันทึกไว้ · เติมอย่างน้อยหนึ่งช่องก็พ้นเงื่อนไข
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor={`last-${customerId}`}>
              นามสกุล
            </label>
            <input className="input" id={`last-${customerId}`} name="last_name" type="text" maxLength={100} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`prov-${customerId}`}>
              จังหวัด
            </label>
            <select className="select" id={`prov-${customerId}`} name="province_code" defaultValue="">
              <option value="">ไม่ระบุ</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="help">ความสนใจบันทึกผ่าน Lead หรือโอกาสขายของลูกค้า ไม่ได้อยู่ในฟอร์มนี้</p>
        <SubmitRow label="บันทึก" pending={pending} />
      </form>
    </FixDisclosure>
  );
}

/* ----------------------------------------------- LEAD_WITHOUT_OUTCOME */

export function CloseLeadForm({
  leadId,
  lostReasons,
  blockedReason,
}: {
  leadId: string;
  lostReasons: RefOption[];
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(closeLeadLost, INITIAL_ACTION);

  return (
    <FixDisclosure label="ปิดว่าไม่สำเร็จ" title="ปิด Lead ที่ค้าง" blockedReason={blockedReason}>
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="lead_id" value={leadId} />
        <Feedback state={state} />

        <p className="t-sm">
          Lead ที่ยังคุยต่อได้ ให้ไปแปลงเป็นโอกาสขายจากหน้าลูกค้าแทน · ปิดที่นี่เมื่อแน่ใจว่าไม่ไปต่อแล้ว
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor={`lost-${leadId}`}>
              เหตุผลที่ไม่สำเร็จ
            </label>
            <select className="select" id={`lost-${leadId}`} name="lost_reason_code" defaultValue="" required>
              <option value="" disabled>
                เลือกเหตุผล
              </option>
              {lostReasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`lostnote-${leadId}`}>
              หมายเหตุ
            </label>
            <input className="input" id={`lostnote-${leadId}`} name="lost_note" type="text" maxLength={200} />
            <p className="help">เหตุผล “อื่น ๆ” ต้องระบุหมายเหตุ · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
          </div>
        </div>

        <SubmitRow label="ปิด Lead" pending={pending} variant="danger" />
      </form>
    </FixDisclosure>
  );
}

/* --------------------------------------------------- OVERDUE_FOLLOWUP */

export function CompleteTaskForm({ taskId, blockedReason }: { taskId: string; blockedReason: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(completeTask, INITIAL_ACTION);

  return (
    <FixDisclosure label="ปิดงาน" title="ปิดงานติดตามที่เลยกำหนด" blockedReason={blockedReason}>
      <form action={action} noValidate>
        <input type="hidden" name="task_id" value={taskId} />
        <Feedback state={state} />
        <p className="t-sm">ปิดงานเมื่อได้ติดตามลูกค้าเรียบร้อยแล้ว · ระบบบันทึกเวลาที่ทำเสร็จให้เอง</p>
        <SubmitRow label="ปิดงาน" pending={pending} />
      </form>
    </FixDisclosure>
  );
}

/* --------------------------------------------- WON_WITHOUT_TRANSACTION */

export function LinkTransactionForm({
  opportunityId,
  customerId,
  branchId,
  transactionTypes,
  blockedReason,
}: {
  opportunityId: string;
  customerId: string;
  branchId: string;
  transactionTypes: RefOption[];
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(linkTransaction, INITIAL_ACTION);

  return (
    <FixDisclosure label="ผูกเลขธุรกรรม" title="ผูกเลขธุรกรรมกับโอกาสขาย" blockedReason={blockedReason}>
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="customer_id" value={customerId} />
        <input type="hidden" name="branch_id" value={branchId} />
        <Feedback state={state} />

        <p className="t-sm">
          V1 ผูกด้วยมือและเพิ่มได้อย่างเดียว · ระบบต้นทางบันทึกเป็น “บันทึกด้วยมือ” เสมอ
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor={`ttype-${opportunityId}`}>
              ประเภทธุรกรรม
            </label>
            <select className="select" id={`ttype-${opportunityId}`} name="transaction_type_code" defaultValue="" required>
              <option value="" disabled>
                เลือกประเภท
              </option>
              {transactionTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`extno-${opportunityId}`}>
              เลขธุรกรรม
            </label>
            <input
              className="input"
              id={`extno-${opportunityId}`}
              name="external_no"
              type="text"
              maxLength={60}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`tat-${opportunityId}`}>
              วันเวลาที่ทำธุรกรรม
            </label>
            <input className="input" id={`tat-${opportunityId}`} name="transacted_at" type="datetime-local" required />
            <p className="help">เป็นเวลาไทย (Asia/Bangkok)</p>
          </div>
          <div className="field">
            <label className="label" htmlFor={`amt-${opportunityId}`}>
              ยอด (บาท)
            </label>
            <input className="input" id={`amt-${opportunityId}`} name="amount" type="number" min={0} step="0.01" />
          </div>
        </div>

        <SubmitRow label="บันทึก" pending={pending} />
      </form>
    </FixDisclosure>
  );
}
