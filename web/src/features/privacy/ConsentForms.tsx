"use client";

import { useActionState, useState } from "react";

import { recordConsent, setLegalHold } from "./actions";
import { Feedback } from "./Feedback";
import {
  CONSENT_CAPTURE_VIA,
  CONSENT_CHANNELS,
  CONSENT_STATUSES,
  CONSENT_STATUS_LABEL,
  CONSENT_VIA_LABEL,
  INITIAL_ACTION,
  type ActionState,
  type ConsentPurpose,
} from "./types";

/* ฟอร์มความยินยอมและ legal hold ของหน้า 17

   ความยินยอมเป็น append-only: การถอนคือการบันทึกแถวใหม่ ไม่ใช่การแก้แถวเดิม
   ฟอร์มจึงไม่มีปุ่ม "แก้ไข" หรือ "ลบ" ให้เลือกเลย เพราะสิ่งที่ทำไม่ได้ ไม่ควรมีปุ่ม */

/**
 * บันทึกความยินยอม (api.record_consent)
 *
 * ช่องทางและธงอายุโผล่เฉพาะตอนเลือก MARKETING + ยินยอม เพราะเป็นเงื่อนไขที่ฐานข้อมูลบังคับ
 * เฉพาะกรณีนั้น (19.4 ข้อ 3) — การโชว์ทุกช่องตลอดเวลาทำให้ผู้ใช้ติ๊กธงอายุในกรณีที่ไม่เกี่ยวข้อง
 */
export function ConsentForm({
  customerId,
  purposes,
  noticeVersion,
  blockedReason,
}: {
  customerId: string;
  purposes: ConsentPurpose[];
  noticeVersion: string | null;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordConsent, INITIAL_ACTION);
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<string>("GRANTED");
  const marketingGrant = purpose === "MARKETING" && status === "GRANTED";
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="cs-purpose">
            วัตถุประสงค์
          </label>
          <select
            className="select"
            id="cs-purpose"
            name="purpose_code"
            value={purpose}
            onChange={(e) => setPurpose(e.currentTarget.value)}
            required
          >
            <option value="" disabled>
              เลือกวัตถุประสงค์
            </option>
            {purposes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label_th}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="cs-status">
            สถานะ
          </label>
          <select
            className="select"
            id="cs-status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value)}
          >
            {CONSENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONSENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="cs-via">
            วิธีที่ได้รับ
          </label>
          <select className="select" id="cs-via" name="captured_via" defaultValue="STAFF_FORM" required>
            {CONSENT_CAPTURE_VIA.map((v) => (
              <option key={v} value={v}>
                {CONSENT_VIA_LABEL[v]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="label">ฉบับประกาศความเป็นส่วนตัว</span>
          <p className="t-sm">
            {noticeVersion ?? "–"} <span className="t-muted">(ฐานข้อมูลเป็นผู้ประทับลงในแถว)</span>
          </p>
        </div>
      </div>

      {marketingGrant ? (
        <fieldset className="fieldset">
          <legend className="label">ช่องทางที่ยินยอมให้ติดต่อ</legend>
          <div className="checkbox-group checkbox-group--inline">
            {CONSENT_CHANNELS.map((ch) => (
              <label className="checkbox" key={ch}>
                <input type="checkbox" name="channels" value={ch} />
                <span className="checkbox__text">{ch}</span>
              </label>
            ))}
          </div>
          <label className="checkbox">
            <input type="checkbox" name="age_ack" />
            <span className="checkbox__text">
              ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม
            </span>
          </label>
          <p className="help">ฐานข้อมูลปฏิเสธการบันทึกความยินยอมการตลาดที่ไม่มีธงนี้</p>
        </fieldset>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="cs-evidence">
          หลักฐาน
        </label>
        <textarea className="textarea" id="cs-evidence" name="evidence" rows={2} maxLength={1000} />
        <p className="pii-warn">
          ระบุฉบับประกาศ ช่องทาง และข้อความหรือลิงก์ที่ส่ง · อย่าใส่ค่าเต็มของช่องทางติดต่อ · เว้นว่างได้ ระบบจะประกอบให้เอง
        </p>
      </div>

      <div className="row">
        <button type="submit" className="btn btn--accent" disabled={pending || blocked} aria-disabled={blocked}>
          บันทึกความยินยอม
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}

/**
 * ตั้ง/ยกเลิก legal hold (api.set_legal_hold · ข้อ 10.3)
 *
 * เหตุผลบังคับเพราะเป็นข้อมูลชิ้นเดียวที่ตอบได้ภายหลังว่าทำไมลูกค้ารายนี้ถึงลบไม่ได้
 * ฐานข้อมูลเอาเหตุผลไปใส่ app.audit_reason ให้เอง หน้าจอไม่ต้องเก็บซ้ำที่ไหน
 */
export function LegalHoldForm({
  customerId,
  customerNo,
  on,
  blockedReason,
}: {
  customerId: string;
  customerNo: string;
  /** สถานะปัจจุบันตามที่ฐานข้อมูลบอก — ปุ่มสลับไปตรงข้ามเสมอ */
  on: boolean;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setLegalHold, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);
  const next = !on;

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="legal_hold" value={next ? "on" : "off"} />

      <div className="field">
        <label className="label" htmlFor={`hold-${customerId}`}>
          เหตุผลของการ{next ? "ตั้ง" : "ยกเลิก"} legal hold
        </label>
        <textarea
          className="textarea"
          id={`hold-${customerId}`}
          name="reason"
          rows={2}
          maxLength={500}
          required
        />
        <p className="help">
          {next
            ? "ลูกค้าที่ติด legal hold จะถูกข้ามจากการทำข้อมูลนิรนามทั้งตามคำขอและตามระยะเวลาเก็บ"
            : "หลังยกเลิก ลูกค้ากลับเข้าเงื่อนไขการทำข้อมูลนิรนามตามปกติ"}
        </p>
      </div>

      <div className="row">
        <button type="submit" className="btn btn--secondary" disabled={pending || blocked} aria-disabled={blocked}>
          {next ? "ตั้ง legal hold" : "ยกเลิก legal hold"} · {customerNo}
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}
