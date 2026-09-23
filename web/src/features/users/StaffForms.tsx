"use client";

import { useActionState } from "react";

import { assignRole, disableStaff, resetMfa, revokeRole, updateStaffProfile } from "./actions";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState, type AssignOption } from "./types";

/* ฟอร์มจัดการบัญชีรายคน

   ทุกฟอร์มเป็น <form action={serverAction}> ตรง ๆ — ทำงานได้แม้ JavaScript ยังโหลดไม่เสร็จ
   ซึ่งสำคัญกับเครื่องหน้าร้านที่เครือข่ายไม่ดี · useActionState มีไว้แสดงผลลัพธ์เท่านั้น

   ปุ่มที่ติดเงื่อนไข MFA ถูกส่ง blockedReason เข้ามา แล้ววาดแบบกดไม่ได้พร้อมเหตุผล
   ไม่ใช่ซ่อนทิ้ง เพราะผู้ใช้ต้องรู้ว่าต้องทำอะไรก่อนถึงจะทำรายการนี้ได้ */

type Blocked = { blockedReason?: string | null };

function ReasonField({ id, label, rows = 2 }: { id: string; label: string; rows?: number }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea className="input textarea" id={id} name="reason" rows={rows} maxLength={500} required />
      <p className="help">เหตุผลถูกบันทึกลงประวัติการใช้งาน · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
    </div>
  );
}

/** ป้ายบทบาท + สาขาในตัวเลือก — ค่า value เป็นคู่ "บทบาท|สาขา" เพื่อไม่ให้จับคู่ผิดกันเอง */
function optionValue(o: AssignOption): string {
  return `${o.role_code}|${o.branch_id ?? ""}`;
}

export function AssignRoleForm({
  staffId,
  options,
  roleLabels,
  blockedReason,
}: {
  staffId: string;
  options: AssignOption[];
  roleLabels: Record<string, string>;
  /** เหตุผลที่กดไม่ได้ (เช่น ยังไม่ได้ยืนยัน MFA) */
} & Blocked) {
  const [state, action, pending] = useActionState<ActionState, FormData>(assignRole, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  /* ติดเงื่อนไข MFA: ต้องเห็นปุ่มแบบกดไม่ได้พร้อมเหตุผล ไม่ใช่เห็นข้อความว่า "ไม่มีบทบาทให้มอบ"
     ซึ่งจะทำให้เข้าใจผิดว่าเป็นเรื่องเพดานบทบาท ทั้งที่แค่ยังไม่ได้ยืนยันตัวตน */
  if (blocked) {
    return (
      <div className="stack">
        <button type="button" className="btn btn--accent" disabled aria-disabled="true">
          มอบบทบาท
        </button>
        <p className="help" role="note">
          {blockedReason}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="staff_id" value={staffId} />
      <Feedback state={state} />

      {options.length === 0 ? (
        <p className="help">
          ไม่มีบทบาทที่คุณมอบให้บัญชีนี้ได้ — มอบบทบาทที่ระดับเท่ากับหรือสูงกว่าของตนไม่ได้ (ข้อ 7.2)
          และบทบาทผู้บริหาร · ผู้ดูแลข้อมูลธุรกิจ · ผู้ดูแลระบบ ต้องยื่นคำขอที่แท็บ “คำขอมอบบทบาท”
        </p>
      ) : (
        <>
          <div className="field">
            <label className="label" htmlFor="assign-role">
              บทบาท
            </label>
            <select className="select" id="assign-role" name="assign" defaultValue="" required>
              <option value="" disabled>
                เลือกบทบาท
              </option>
              {options.map((o) => (
                <option key={optionValue(o)} value={optionValue(o)}>
                  {(roleLabels[o.role_code] ?? o.role_code) + (o.branch_label ? ` @ ${o.branch_label}` : " @ องค์กร")}
                </option>
              ))}
            </select>
            <p className="help">แสดงเฉพาะบทบาทที่ฐานข้อมูลยืนยันแล้วว่าคุณมอบให้บัญชีนี้ได้ (api.can_assign_role)</p>
          </div>

          <ReasonField id="assign-reason" label="เหตุผลของการมอบบทบาท" />

          <div className="row">
            <button type="submit" className="btn btn--accent" disabled={pending}>
              มอบบทบาท
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export function RevokeRoleForm({
  assignmentId,
  roleText,
  blockedReason,
}: { assignmentId: string; roleText: string } & Blocked) {
  const [state, action, pending] = useActionState<ActionState, FormData>(revokeRole, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <Feedback state={state} />
      <div className="row">
        <label className="sr-only" htmlFor={`revoke-${assignmentId}`}>
          เหตุผลของการถอนบทบาท {roleText}
        </label>
        <input
          className="input"
          id={`revoke-${assignmentId}`}
          name="reason"
          type="text"
          maxLength={500}
          placeholder="เหตุผลของการถอนบทบาท"
          required
          style={{ maxWidth: "36ch" }}
        />
        <button
          type="submit"
          className="btn btn--danger-outline btn--sm"
          disabled={pending || blocked}
          aria-disabled={blocked}
        >
          ถอนบทบาท
        </button>
      </div>
      {blockedReason ? <p className="help">{blockedReason}</p> : null}
    </form>
  );
}

export function ProfileForm({
  staff,
  canEditEmail,
  blockedReason,
}: {
  staff: {
    staff_id: string;
    display_name: string;
    nickname: string | null;
    phone: string | null;
    employee_code: string | null;
    email: string;
  };
  canEditEmail: boolean;
} & Blocked) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStaffProfile, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="staff_id" value={staff.staff_id} />
      <Feedback state={state} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="p-display-name">
            ชื่อ
          </label>
          <input
            className="input"
            id="p-display-name"
            name="display_name"
            type="text"
            maxLength={100}
            defaultValue={staff.display_name}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="p-nickname">
            ชื่อเล่น
          </label>
          <input
            className="input"
            id="p-nickname"
            name="nickname"
            type="text"
            maxLength={50}
            defaultValue={staff.nickname ?? ""}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="p-phone">
            เบอร์โทร
          </label>
          <input
            className="input"
            id="p-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={staff.phone ?? ""}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="p-employee-code">
            รหัสพนักงาน (HR)
          </label>
          <input
            className="input"
            id="p-employee-code"
            name="employee_code"
            type="text"
            maxLength={30}
            defaultValue={staff.employee_code ?? ""}
            required
          />
        </div>

        {canEditEmail ? (
          <div className="field span-all">
            <label className="label" htmlFor="p-email">
              อีเมล
            </label>
            <input className="input" id="p-email" name="email" type="email" maxLength={120} defaultValue={staff.email} />
            <p className="help">ระบบจะแจ้งไปที่อีเมลเดิมทุกครั้งที่เปลี่ยน</p>
          </div>
        ) : (
          <div className="field span-all">
            <span className="label">อีเมล</span>
            <p className="t-sm">{staff.email}</p>
            <p className="help">ผู้จัดการสาขาเปลี่ยนอีเมลไม่ได้ (ข้อ 7.3 ข้อ 5)</p>
          </div>
        )}
      </div>

      <div className="row">
        <button type="submit" className="btn btn--secondary" disabled={pending || blocked} aria-disabled={blocked}>
          บันทึกโปรไฟล์
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}

export function DisableForm({
  staffId,
  staffLabel,
  blockedReason,
}: { staffId: string; staffLabel: string } & Blocked) {
  const [state, action, pending] = useActionState<ActionState, FormData>(disableStaff, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="staff_id" value={staffId} />
      <Feedback state={state} />

      <div className="alert alert--danger" role="note">
        <span aria-hidden="true">!</span>
        <div>
          <p className="alert__title">ผลกระทบของการปิดใช้งาน {staffLabel}</p>
          <ul>
            <li>เข้าสู่ระบบไม่ได้ทันทีและถูกออกจากทุกอุปกรณ์</li>
            <li>บทบาททั้งหมดสิ้นสุดวันนี้</li>
            <li>โอกาสขายที่เปิดอยู่ย้ายให้ผู้จัดการสาขาของรายการนั้น</li>
            <li>Lead และงานที่เปิดอยู่จะไม่มีผู้รับผิดชอบ</li>
            <li>เปิดใช้งานใหม่ต้องมอบบทบาทใหม่ · ห้ามลบบัญชี</li>
          </ul>
        </div>
      </div>

      <ReasonField id="disable-reason" label="เหตุผลการปิดใช้งาน" />

      <label className="checkbox">
        <input type="checkbox" name="ack" required />
        <span className="checkbox__text">ฉันเข้าใจผลกระทบ</span>
      </label>

      <div className="row">
        <button type="submit" className="btn btn--danger" disabled={pending || blocked} aria-disabled={blocked}>
          ปิดใช้งานผู้ใช้
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}

export function ResetMfaForm({ staffId, blockedReason }: { staffId: string } & Blocked) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resetMfa, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <input type="hidden" name="staff_id" value={staffId} />
      <Feedback state={state} />
      <ReasonField id="mfa-reason" label="เหตุผลของการรีเซ็ต MFA" />
      <div className="row">
        <button type="submit" className="btn btn--secondary" disabled={pending || blocked} aria-disabled={blocked}>
          รีเซ็ตการยืนยันตัวตนสองขั้นตอน
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
      <p className="help">ผู้ใช้ต้องลงทะเบียน TOTP ใหม่ในการเข้าสู่ระบบครั้งถัดไป · ระบบแจ้งไปที่อีเมลเดิมเสมอ</p>
    </form>
  );
}
