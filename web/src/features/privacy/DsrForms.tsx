"use client";

import { useActionState, useState } from "react";

import { anonymizeCustomer, buildDsrPackage, createDsr, extendDsr, updateDsr } from "./actions";
import { DefList } from "./Bits";
import { Feedback } from "./Feedback";
import {
  DSR_TYPES,
  DSR_TYPE_LABEL,
  DSR_VERIFICATION_LABEL,
  DSR_VERIFICATION_METHODS,
  INITIAL_ACTION,
  type ActionState,
  type DsrStatus,
} from "./types";

/* ฟอร์มของหน้า 17 · คำขอเจ้าของข้อมูล

   ทุกฟอร์มเป็น <form action={serverAction}> ธรรมดา ไม่มี state ฝั่ง client ที่ตัดสินสิทธิ์
   ปุ่มที่ "กดไม่ได้" จะมาพร้อมเหตุผลเสมอ เพราะปุ่มเทาที่ไม่บอกอะไรเลยทำให้ผู้ใช้เดาว่าระบบพัง

   ข้อความบนปุ่มเขียนเป็นสิ่งที่จะเกิดขึ้นจริง ("ยืนยันตัวตนผู้ยื่นคำขอ") ไม่ใช่ "บันทึก"
   เพราะแต่ละขั้นของคำขอ PDPA มีผลทางกฎหมายต่างกัน */

function SubmitRow({
  label,
  pending,
  blockedReason,
  variant = "btn--primary",
}: {
  label: string;
  pending: boolean;
  blockedReason?: string | null;
  variant?: string;
}) {
  const blocked = Boolean(blockedReason);
  return (
    <div className="row">
      <button type="submit" className={`btn ${variant}`} disabled={pending || blocked} aria-disabled={blocked}>
        {label}
      </button>
      {blockedReason ? <span className="help">{blockedReason}</span> : null}
    </div>
  );
}

/* --------------------------------------------------------------------- รับคำขอ */

/** รับคำขอใหม่ (api.create_dsr) — ผูกลูกค้าหรือไม่ก็ได้ แต่คำขอลบต้องผูกก่อนจึงจะดำเนินการได้ */
export function CreateDsrForm({
  customerOptions,
  blockedReason,
}: {
  customerOptions: { customer_id: string; label: string }[];
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createDsr, INITIAL_ACTION);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="dsr-type">
            ประเภทคำขอ
          </label>
          <select className="select" id="dsr-type" name="request_type" defaultValue="" required>
            <option value="" disabled>
              เลือกประเภทคำขอ
            </option>
            {DSR_TYPES.map((t) => (
              <option key={t} value={t}>
                {DSR_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="dsr-customer">
            ลูกค้าที่เกี่ยวข้อง
          </label>
          <select className="select" id="dsr-customer" name="customer_id" defaultValue="">
            <option value="">ยังไม่ระบุ</option>
            {customerOptions.map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="help">คำขอลบและคำขอสำเนาต้องผูกลูกค้าก่อนจึงจะดำเนินการได้</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="dsr-requester">
            ชื่อผู้ยื่นคำขอ
          </label>
          <input className="input" id="dsr-requester" name="requester_name" type="text" maxLength={120} required />
        </div>

        <div className="field">
          <label className="label" htmlFor="dsr-contact">
            ช่องทางติดต่อผู้ยื่น
          </label>
          <input className="input" id="dsr-contact" name="requester_contact" type="text" maxLength={120} />
          <p className="help">เบอร์ อีเมล หรือ LINE ID · ระบบเก็บเฉพาะค่าปิดบัง ไม่เก็บค่าเต็ม</p>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="dsr-note">
          หมายเหตุ
        </label>
        <textarea className="textarea" id="dsr-note" name="note" rows={2} maxLength={1000} />
        <p className="pii-warn">อย่าใส่เลขบัตรประชาชนหรือค่าเต็มของช่องทางติดต่อ · ห้ามเก็บสำเนาบัตร</p>
      </div>

      <SubmitRow label="รับคำขอ" pending={pending} blockedReason={blockedReason} variant="btn--accent" />
    </form>
  );
}

/* ------------------------------------------------------------- ยืนยันตัวตนผู้ยื่น */

/**
 * ยืนยันตัวตนผู้ยื่นคำขอ (api.update_dsr → VERIFIED)
 *
 * ขั้นนี้คือจุดที่ฐานข้อมูลบันทึก verified_by = ผู้กด และค่านั้นถูกใช้ตรวจ 2-person control
 * ตอนทำข้อมูลนิรนามภายหลัง จึงมีคำเตือนตรงนี้ว่ากดแล้วคุณจะทำข้อมูลนิรนามของคำขอนี้เองไม่ได้
 */
export function VerifyDsrForm({ dsrId, blockedReason }: { dsrId: string; blockedReason?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateDsr, INITIAL_ACTION);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <input type="hidden" name="status" value="VERIFIED" />

      <div className="field">
        <label className="label" htmlFor={`verify-${dsrId}`}>
          วิธียืนยันตัวตน
        </label>
        <select className="select" id={`verify-${dsrId}`} name="verification_method" defaultValue="" required>
          <option value="" disabled>
            เลือกวิธียืนยันตัวตน
          </option>
          {DSR_VERIFICATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {DSR_VERIFICATION_LABEL[m]}
            </option>
          ))}
        </select>
        <p className="help">ห้ามเก็บสำเนาบัตรประชาชน — ระบบเก็บเฉพาะ “วิธี” ที่ใช้ยืนยัน</p>
      </div>

      <p className="state-bar" role="note">
        เมื่อกดแล้ว ระบบจะบันทึกว่าคุณคือผู้ยืนยันตัวตนของคำขอนี้ ·
        การทำข้อมูลนิรนามตามคำขอนี้จะต้องให้ผู้ดูแลข้อมูลธุรกิจอีกคนเป็นผู้ดำเนินการ (ข้อ 10.4 · Q26)
      </p>

      <SubmitRow label="ยืนยันตัวตนผู้ยื่นคำขอ" pending={pending} blockedReason={blockedReason} />
    </form>
  );
}

/* ----------------------------------------------------- เปลี่ยนสถานะแบบไม่มีเงื่อนไขเพิ่ม */

/** เริ่มดำเนินการ / ปิดคำขอว่าเสร็จสิ้น — ลำดับที่อนุญาตตัดสินที่ api.update_dsr */
export function StatusStepForm({
  dsrId,
  status,
  label,
  variant = "btn--primary",
  blockedReason,
}: {
  dsrId: string;
  status: DsrStatus;
  label: string;
  variant?: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateDsr, INITIAL_ACTION);

  return (
    <form action={action} className="stack">
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <input type="hidden" name="status" value={status} />
      <SubmitRow label={label} pending={pending} blockedReason={blockedReason} variant={variant} />
    </form>
  );
}

/** ปฏิเสธคำขอ — เหตุผลบังคับ เพราะผู้ยื่นมีสิทธิ์รู้ว่าถูกปฏิเสธด้วยเหตุใด */
export function RejectDsrForm({ dsrId, blockedReason }: { dsrId: string; blockedReason?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateDsr, INITIAL_ACTION);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <input type="hidden" name="status" value="REJECTED" />

      <div className="field">
        <label className="label" htmlFor={`reject-${dsrId}`}>
          เหตุผลที่ปฏิเสธ
        </label>
        <textarea className="textarea" id={`reject-${dsrId}`} name="note" rows={2} maxLength={500} required />
        <p className="pii-warn">อย่าใส่ข้อมูลส่วนบุคคลในเหตุผล</p>
      </div>

      <SubmitRow label="ปฏิเสธคำขอ" pending={pending} blockedReason={blockedReason} variant="btn--danger-outline" />
    </form>
  );
}

/* ------------------------------------------------------------------- ขยายเวลา */

/** ขยายเวลาดำเนินการพร้อมเหตุผล — กำหนดเดิมมาจาก due_at ที่ฐานข้อมูลคำนวณไว้ */
export function ExtendDsrForm({
  dsrId,
  currentStatus,
  minDate,
  blockedReason,
}: {
  dsrId: string;
  currentStatus: DsrStatus;
  /** วันครบกำหนดปัจจุบันในรูป YYYY-MM-DD — ใช้เป็นขอบล่างของช่องวันที่ */
  minDate: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(extendDsr, INITIAL_ACTION);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <input type="hidden" name="current_status" value={currentStatus} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor={`ext-${dsrId}`}>
            ขยายถึง
          </label>
          <input
            className="input"
            id={`ext-${dsrId}`}
            name="extended_until"
            type="date"
            min={minDate}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`extr-${dsrId}`}>
            เหตุผล
          </label>
          <textarea className="textarea" id={`extr-${dsrId}`} name="extension_reason" rows={2} maxLength={500} required />
        </div>
      </div>

      <SubmitRow label="ขยายเวลา" pending={pending} blockedReason={blockedReason} variant="btn--secondary" />
    </form>
  );
}

/* --------------------------------------------------------------- แพ็กเกจข้อมูล */

/** สร้างแพ็กเกจข้อมูลของคำขอ ACCESS/PORTABILITY — เนื้อในไม่ขึ้นจอ แสดงเฉพาะชื่อหมวด */
export function PackageForm({ dsrId, blockedReason }: { dsrId: string; blockedReason?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(buildDsrPackage, INITIAL_ACTION);

  return (
    <form action={action} className="stack">
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <SubmitRow label="สร้างแพ็กเกจข้อมูล" pending={pending} blockedReason={blockedReason} />
      <p className="help">
        แพ็กเกจเป็นข้อมูลของลูกค้ารายเดียว ไม่ผ่านเพดานการส่งออก · ระบบบันทึกการสร้างไว้ในร่องรอยการทำงาน
      </p>
    </form>
  );
}

/* ------------------------------------------------------------- ทำข้อมูลนิรนาม */

/**
 * ทำข้อมูลนิรนามตามคำขอลบ (api.anonymize_customer · ย้อนกลับไม่ได้)
 *
 * ต้องพิมพ์รหัสลูกค้าให้ตรงก่อนปุ่มจะกดได้ — กันมือลั่นเท่านั้น ไม่ใช่การตรวจสิทธิ์
 * เงื่อนไข 2-person control และ legal hold ตรวจที่ฐานข้อมูลทุกครั้งที่กด
 */
export function AnonymizeForm({
  dsrId,
  customerId,
  customerNo,
  verifierLabel,
  operatorLabel,
  blockedReason,
}: {
  dsrId: string;
  customerId: string;
  customerNo: string;
  /** ชื่อผู้ยืนยันตัวตนของคำขอนี้ตามที่ฐานข้อมูลบันทึกไว้ */
  verifierLabel: string;
  /** ชื่อผู้ที่กำลังจะดำเนินการ = ผู้ใช้ปัจจุบัน */
  operatorLabel: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(anonymizeCustomer, INITIAL_ACTION);
  const [typed, setTyped] = useState("");
  const matched = typed.trim() === customerNo;

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="dsr_id" value={dsrId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="customer_no" value={customerNo} />

      <div className="alert alert--danger" role="note">
        <span aria-hidden="true">!</span>
        <div>
          <p className="alert__title">ผลกระทบ (ย้อนกลับไม่ได้)</p>
          <ul>
            <li>ชื่อลูกค้าเปลี่ยนเป็น “ลูกค้านิรนาม {customerNo}”</li>
            <li>ลบช่องทางติดต่อและที่อยู่ทั้งหมด</li>
            <li>ล้างโน้ต สรุปการติดต่อ IMEI และข้อความที่อ้างถึงลูกค้ารายนี้</li>
            <li>ตัวเลข KPI ย้อนหลังไม่เปลี่ยน</li>
          </ul>
        </div>
      </div>

      {/* ข้อ 20.4 · Q26 — หน้าจอต้องบอกได้ว่าใครยืนยันและใครดำเนินการ ก่อนที่จะกด ไม่ใช่รู้ทีหลัง */}
      <DefList
        items={[
          { term: "ผู้ยืนยันตัวตน", value: verifierLabel },
          { term: "ผู้ดำเนินการ (คุณ)", value: operatorLabel },
        ]}
      />

      <div className="field">
        <label className="label" htmlFor={`anon-${dsrId}`}>
          พิมพ์ {customerNo} เพื่อยืนยัน
        </label>
        <input
          className="input"
          id={`anon-${dsrId}`}
          name="confirm"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
        />
      </div>

      <label className="checkbox">
        <input type="checkbox" name="ack" />
        <span className="checkbox__text">ฉันเข้าใจว่าย้อนกลับไม่ได้</span>
      </label>

      <SubmitRow
        label="ทำข้อมูลนิรนาม"
        pending={pending}
        blockedReason={blockedReason ?? (matched ? null : `พิมพ์ ${customerNo} ให้ตรงก่อน`)}
        variant="btn--danger"
      />
    </form>
  );
}
