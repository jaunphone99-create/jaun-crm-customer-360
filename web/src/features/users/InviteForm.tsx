"use client";

import { useActionState } from "react";

import { inviteStaff } from "./actions";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState, type AssignOption } from "./types";

/* เพิ่มผู้ใช้งาน (Edge Function `invite-staff`)

   สองเรื่องที่หน้าจอต้องทำให้ถูกตั้งแต่ต้น ไม่ใช่รอให้ฐานข้อมูลปฏิเสธ:

   1. สาขาถูก "ล็อก" ไม่ใช่ปล่อยให้เลือกอิสระ (ข้อ 20.2)
      ผู้จัดการสาขาที่ดูแลสาขาเดียวจะเห็นชื่อสาขาเป็นข้อความ ไม่ใช่ช่องเลือก —
      ตัวเลือกบทบาททุกตัวผูกสาขามาแล้วจากฝั่งเซิร์ฟเวอร์ จึงเชิญข้ามสาขาไม่ได้ตั้งแต่ในฟอร์ม

   2. บทบาทที่เลือกได้มาจาก api.can_assign_role ทุกตัว (ข้อ 7.2)
      ถ้าฐานข้อมูลไม่อนุมัติคู่ (บทบาท × สาขา) ไหน คู่นั้นจะไม่ปรากฏในตัวเลือกเลย

   ต่อให้มีคนแก้ค่าในฟอร์มเอง app.assign_role_denial ก็ยังปฏิเสธที่ฐานข้อมูลอยู่ดี */

function optionValue(o: AssignOption): string {
  return `${o.role_code}|${o.branch_id ?? ""}`;
}

export function InviteForm({
  options,
  roleLabels,
  lockedBranchLabel,
  blockedReason,
  systemOnly,
}: {
  options: AssignOption[];
  roleLabels: Record<string, string>;
  /** ชื่อสาขาที่ถูกล็อกให้ (ผู้จัดการสาขาที่ดูแลสาขาเดียว) — null = ไม่ต้องแสดงบรรทัดสาขา */
  lockedBranchLabel: string | null;
  blockedReason?: string | null;
  /** ผู้ดูแลระบบ (IT) เชิญได้แต่ยังมอบบทบาทไม่ได้ ต้องยื่นคำขอหลังเชิญ (ข้อ 19.3 ข้อ 6) */
  systemOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteStaff, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="inv-display-name">
            ชื่อ
          </label>
          <input
            className="input"
            id="inv-display-name"
            name="display_name"
            type="text"
            maxLength={100}
            placeholder="เช่น คุณเมย์"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="inv-nickname">
            ชื่อเล่น
          </label>
          <input className="input" id="inv-nickname" name="nickname" type="text" maxLength={50} />
        </div>
        <div className="field">
          <label className="label" htmlFor="inv-email">
            อีเมล
          </label>
          <input
            className="input"
            id="inv-email"
            name="email"
            type="email"
            maxLength={120}
            placeholder="name@example.com"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="inv-phone">
            เบอร์โทร
          </label>
          <input className="input" id="inv-phone" name="phone" type="tel" inputMode="tel" />
        </div>
        <div className="field">
          <label className="label" htmlFor="inv-employee-code">
            รหัสพนักงาน (HR)
          </label>
          <input className="input" id="inv-employee-code" name="employee_code" type="text" maxLength={30} required />
          <p className="help">ห้ามซ้ำกับบัญชีที่ยังไม่ปิดใช้งาน</p>
        </div>

        {systemOnly ? (
          <div className="field span-all">
            <span className="label">บทบาท</span>
            <p className="alert" role="note">
              <span>
                บัญชีสายผู้ดูแลระบบ (IT) ต้องยื่นคำขอบทบาทหลังเชิญที่แท็บ “คำขอมอบบทบาท” ·
                บัญชีจะยังไม่มีบทบาทจนกว่าผู้บริหารจะอนุมัติ (ข้อ 19.3 ข้อ 6)
              </span>
            </p>
          </div>
        ) : (
          <div className="field span-all">
            <label className="label" htmlFor="inv-assign">
              บทบาท
            </label>
            <select className="select" id="inv-assign" name="assign" defaultValue="" required>
              <option value="" disabled>
                เลือกบทบาท
              </option>
              {options.map((o) => (
                <option key={optionValue(o)} value={optionValue(o)}>
                  {(roleLabels[o.role_code] ?? o.role_code) + (o.branch_label ? ` @ ${o.branch_label}` : " @ องค์กร")}
                </option>
              ))}
            </select>
            <p className="help">แสดงเฉพาะบทบาทที่ฐานข้อมูลยืนยันแล้วว่าคุณมอบได้ (api.can_assign_role)</p>
          </div>
        )}

        {lockedBranchLabel ? (
          <div className="field span-all">
            <span className="label">สาขา</span>
            <p className="t-sm">
              {lockedBranchLabel} <span className="t-muted">(ระบบล็อกสาขาที่คุณเป็นผู้จัดการ · เชิญข้ามสาขาไม่ได้)</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="row">
        <button type="submit" className="btn btn--accent" disabled={pending || blocked} aria-disabled={blocked}>
          ส่งคำเชิญ
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>

      <p className="help">
        คำเชิญมีอายุ 24 ชั่วโมง · บัญชีเป็น “รอเปิดใช้งาน” จนพนักงานตั้งรหัสผ่านครั้งแรก
        (และลงทะเบียน MFA สำหรับบทบาทที่ต้องใช้) · บทบาทมีผลเมื่อบัญชีเปิดใช้งาน · ระบบไม่มีการสมัครใช้งานเอง
      </p>
    </form>
  );
}
