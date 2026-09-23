"use client";

import { useActionState, useState } from "react";

import { ErrorAlert } from "./AuthUi";
import { setPassword, type FormState } from "./actions";

/* หน้า "ตั้งรหัสผ่านครั้งแรก / รับคำเชิญ" และ "ตั้งรหัสผ่านใหม่จากลิงก์รีเซ็ต"
   token จากลิงก์อีเมลเดินทางในช่องซ่อน ไม่ค้างอยู่บน URL หลังกดส่ง (ข้อ 9.2) */

const initial: FormState = { ok: false, message: null };

/** ความยาวขั้นต่ำตาม CANONICAL ข้อ 9.2 — ฝั่ง server ตรวจซ้ำเสมอ */
const MIN_PASSWORD = 12;

export function SetPasswordForm({
  tokenHash,
  tokenType,
  mode,
}: {
  tokenHash: string;
  tokenType: string;
  /** "dev" = ฐานข้อมูลทดลองไม่มีที่เก็บรหัสผ่าน ทำได้แค่เปิดใช้งานบัญชี */
  mode: "supabase" | "dev";
}) {
  const [state, action, pending] = useActionState(setPassword, initial);
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  if (mode === "dev") {
    return (
      <>
        <div className="alert alert--warning" role="note">
          <span aria-hidden="true">!</span>
          <div>
            <p className="alert__title">โหมดพัฒนา</p>
            <p>
              ฐานข้อมูลทดลองไม่มี Supabase Auth จึงตั้งรหัสผ่านจริงไม่ได้ · ปุ่มด้านล่างเรียก
              <code> api.activate_self() </code> ตัวจริง เพื่อทดสอบขั้นตอน &quot;เปิดใช้งานบัญชีด้วยตนเอง&quot;
              รวมถึงกติกาคำเชิญหมดอายุและบทบาทที่ต้องลงทะเบียน MFA ก่อน
            </p>
          </div>
        </div>
        <ErrorAlert title="เปิดใช้งานบัญชีไม่สำเร็จ" message={state.message} />
        <form className="stack" action={action}>
          <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending}>
            {pending ? "กำลังเปิดใช้งาน…" : "เปิดใช้งานบัญชี (โหมดพัฒนา)"}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <ErrorAlert title="ตั้งรหัสผ่านไม่สำเร็จ" message={state.message} />

      <form id="login-form" className="stack" action={action} noValidate>
        <input type="hidden" name="tokenHash" value={tokenHash} />
        <input type="hidden" name="tokenType" value={tokenType} />

        <div className={`field${tooShort ? " field--error" : ""}`}>
          <label className="label" htmlFor="new-password">
            รหัสผ่านใหม่
          </label>
          <div className="password-field">
            <input
              className="input input--lg"
              id="new-password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              aria-describedby="password-help"
              required
            />
            <button
              type="button"
              className="password-field__toggle"
              aria-controls="new-password"
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            </button>
          </div>
          <p className="help" id="password-help">
            อย่างน้อย {MIN_PASSWORD} ตัวอักษร · ห้ามใช้รหัสผ่านที่เคยใช้กับบริการอื่น
          </p>
          {tooShort ? <p className="error-text">รหัสผ่านต้องยาวอย่างน้อย {MIN_PASSWORD} ตัวอักษร</p> : null}
        </div>

        <div className={`field${mismatch ? " field--error" : ""}`}>
          <label className="label" htmlFor="confirm-password">
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            className="input input--lg"
            id="confirm-password"
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {mismatch ? <p className="error-text">รหัสผ่านทั้งสองช่องไม่ตรงกัน</p> : null}
        </div>

        <button
          type="submit"
          className="btn btn--accent btn--lg btn--block"
          disabled={pending || password.length < MIN_PASSWORD || password !== confirm}
        >
          {pending ? "กำลังบันทึก…" : "ตั้งรหัสผ่านและเข้าใช้งาน"}
        </button>
      </form>

      <p className="help">
        เมื่อตั้งรหัสผ่านใหม่แล้ว ทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ ·
        ถ้าบทบาทของคุณต้องยืนยันสองขั้นตอน ระบบจะให้ลงทะเบียน TOTP ต่อทันที
      </p>
    </>
  );
}
