"use client";

import { useActionState } from "react";

import { decideRoleGrant, requestRoleGrant } from "./actions";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, REQUEST_ONLY_ROLES, type ActionState } from "./types";

/* คำขอมอบ/ถอนบทบาทสูง (CANONICAL ข้อ 7.2)

   บทบาทผู้ดูแลระบบ (IT) · ผู้บริหาร · ผู้ดูแลข้อมูลธุรกิจ มอบตรงไม่ได้ ต้องยื่นคำขอแล้วให้ผู้บริหารอนุมัติ
   ฐานข้อมูลบังคับเองว่าผู้ตัดสินต้องไม่ใช่ผู้ยื่น ผู้รับ หรือบัญชีที่มีรหัสพนักงานเดียวกับผู้รับ */

export function RequestGrantForm({
  targets,
  roleLabels,
  blockedReason,
}: {
  targets: { staff_id: string; label: string }[];
  roleLabels: Record<string, string>;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestRoleGrant, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="rg-target">
            ผู้รับ
          </label>
          <select className="select" id="rg-target" name="staff_id" defaultValue="" required>
            <option value="" disabled>
              เลือกบัญชี
            </option>
            {targets.map((t) => (
              <option key={t.staff_id} value={t.staff_id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="rg-role">
            บทบาท
          </label>
          <select className="select" id="rg-role" name="role_code" defaultValue="" required>
            <option value="" disabled>
              เลือกบทบาท
            </option>
            {REQUEST_ONLY_ROLES.map((code) => (
              <option key={code} value={code}>
                {roleLabels[code] ?? code}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="rg-type">
            ชนิดคำขอ
          </label>
          <select className="select" id="rg-type" name="request_type" defaultValue="GRANT">
            <option value="GRANT">มอบบทบาท</option>
            <option value="REVOKE">ถอนบทบาท</option>
          </select>
        </div>

        <div className="field span-all">
          <label className="label" htmlFor="rg-reason">
            เหตุผลของคำขอ
          </label>
          <textarea className="input textarea" id="rg-reason" name="reason" rows={2} maxLength={500} required />
          <p className="help">เหตุผลถูกบันทึกลงประวัติ · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn btn--secondary" disabled={pending || blocked} aria-disabled={blocked}>
          ยื่นคำขอบทบาท
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}

export function DecideForm({
  requestId,
  requestNo,
  blockedReason,
}: {
  requestId: string;
  requestNo: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideRoleGrant, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="request_id" value={requestId} />
      <Feedback state={state} />
      <div className="row">
        <label className="sr-only" htmlFor={`note-${requestId}`}>
          บันทึกการตัดสินคำขอ {requestNo}
        </label>
        <input
          className="input"
          id={`note-${requestId}`}
          name="note"
          type="text"
          maxLength={500}
          placeholder="บันทึกการตัดสิน (ถ้ามี)"
          style={{ maxWidth: "32ch" }}
        />
        {/* ค่าของปุ่มที่กดถูกส่งไปกับฟอร์มโดยเบราว์เซอร์เอง — เชื่อถือได้กว่า state ฝั่ง client */}
        <button
          type="submit"
          name="decision"
          value="REJECT"
          className="btn btn--danger-outline btn--sm"
          disabled={pending || blocked}
          aria-disabled={blocked}
        >
          ไม่อนุมัติ
        </button>
        <button
          type="submit"
          name="decision"
          value="APPROVE"
          className="btn btn--primary btn--sm"
          disabled={pending || blocked}
          aria-disabled={blocked}
        >
          อนุมัติ
        </button>
      </div>
      {blockedReason ? <p className="help">{blockedReason}</p> : null}
    </form>
  );
}
