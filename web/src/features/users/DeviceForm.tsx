"use client";

import { useActionState } from "react";

import { registerDevice } from "./actions";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState, type BranchRow } from "./types";

/* ลงทะเบียนอุปกรณ์ counter ที่ใช้ร่วมกัน (api.register_device)

   เครื่องที่ทำเครื่องหมายว่า "ใช้ร่วมกัน" จะถูกล็อกหน้าจอเมื่อไม่มีการใช้งานตามเวลาที่ตั้งไว้
   และกลับมาใช้งานต้องยืนยันตัวตนใหม่ · หน้าเข้าสู่ระบบซ่อน “จดจำฉันไว้” บนเครื่องแบบนี้ (ข้อ 9.2)

   หน้านี้ไม่แสดงรายการอุปกรณ์ที่ลงทะเบียนไว้ เพราะ core.devices ไม่เปิดให้บทบาทหน้าร้านอ่าน
   การเดารายการจากฝั่งแอปจะเป็นการแสดงข้อมูลที่ฐานข้อมูลไม่ได้รับรอง */

export function DeviceForm({
  branches,
  defaultDeviceId,
  blockedReason,
}: {
  /** เฉพาะสาขาที่ผู้ใช้มีสิทธิ์แก้ผู้ใช้ระดับสาขาอยู่จริง */
  branches: BranchRow[];
  /** รหัสตั้งต้นที่อ่านง่าย เช่น JP1-COUNTER-1 */
  defaultDeviceId: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerDevice, INITIAL_ACTION);
  const blocked = Boolean(blockedReason);
  const only = branches.length === 1 ? branches[0] : null;

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="dev-id">
            รหัสอุปกรณ์
          </label>
          <input
            className="input"
            id="dev-id"
            name="device_id"
            type="text"
            maxLength={64}
            defaultValue={defaultDeviceId}
            required
          />
          <p className="help">ตั้งให้ตรงกับเครื่องจริง เช่น เคาน์เตอร์ที่ 1 ของสาขา</p>
        </div>

        {only ? (
          <div className="field">
            <span className="label">สาขา</span>
            <p className="t-sm">
              {only.name_th} <span className="t-muted">(ล็อกตามสาขาที่คุณดูแล)</span>
            </p>
            <input type="hidden" name="branch_id" value={only.branch_id} />
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor="dev-branch">
              สาขา
            </label>
            <select className="select" id="dev-branch" name="branch_id" defaultValue="" required>
              <option value="" disabled>
                เลือกสาขา
              </option>
              {branches.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {b.name_th}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <label className="checkbox">
        <input type="checkbox" name="is_shared_counter" defaultChecked />
        <span className="checkbox__text">เป็นอุปกรณ์ counter ที่ใช้ร่วมกัน</span>
      </label>

      <div className="row">
        <button type="submit" className="btn btn--secondary" disabled={pending || blocked} aria-disabled={blocked}>
          ลงทะเบียนอุปกรณ์
        </button>
        {blockedReason ? <span className="help">{blockedReason}</span> : null}
      </div>
    </form>
  );
}
