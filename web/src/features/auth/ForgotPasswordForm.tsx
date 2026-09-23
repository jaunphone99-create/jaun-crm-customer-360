"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SuccessAlert } from "./AuthUi";
import { requestPasswordReset, type FormState } from "./actions";

/* ลืมรหัสผ่าน — ข้อความตอบกลับเหมือนกันเสมอ ไม่ว่าจะมีบัญชีนั้นจริงหรือไม่ (CANONICAL ข้อ 9.2)
   ข้อความตรงกับ dialog "ลืมรหัสผ่าน" ใน prototype/01-login.html */

const initial: FormState = { ok: false, message: null };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.ok) {
    return (
      <>
        <SuccessAlert title="ส่งคำขอแล้ว">
          <p>
            ถ้าข้อมูลตรงกับบัญชีที่เปิดใช้งานอยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลที่ลงทะเบียนไว้ ลิงก์มีอายุ 1 ชั่วโมง ·
            เมื่อตั้งรหัสผ่านใหม่แล้ว ทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ
          </p>
        </SuccessAlert>
        <Link className="btn btn--outline btn--block" href="/login">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </>
    );
  }

  return (
    <form id="login-form" className="stack" action={action} noValidate>
      <div className="field">
        <label className="label" htmlFor="forgot-id">
          อีเมล หรือ รหัสพนักงาน (ST-NNNN)
        </label>
        <input
          className="input input--lg"
          id="forgot-id"
          name="loginId"
          type="text"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="name@example.com หรือ ST-0045"
          required
        />
      </div>

      <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending}>
        {pending ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
      </button>

      <Link className="btn btn--ghost btn--block" href="/login">
        กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </form>
  );
}
