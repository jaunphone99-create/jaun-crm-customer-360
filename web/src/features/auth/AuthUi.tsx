"use client";

import { useEffect, useRef } from "react";

/* ชิ้นส่วนหน้าจอที่ทุกหน้าในกลุ่ม (auth) ใช้ร่วมกัน
   ชื่อ class ทั้งหมดมาจาก generated/app.css และ generated/page-login.css (ต้นทาง = prototype) */

export function ErrorAlert({
  id,
  title = "เข้าสู่ระบบไม่สำเร็จ",
  message,
}: {
  id?: string;
  title?: string;
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div className="alert alert--danger" role="alert" id={id}>
      <span aria-hidden="true">!</span>
      <div>
        <p className="alert__title">{title}</p>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function SuccessAlert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="alert alert--success" role="status">
      <span aria-hidden="true">✓</span>
      <div>
        <p className="alert__title">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** ช่องรหัส 6 หลัก — โฟกัสให้เองเมื่อเปิดหน้า
    ข้อความผิดพลาดแสดงที่ alert ด้านบนที่เดียว ช่องนี้แค่ชี้ไปหามันด้วย aria-describedby
    (ไม่พิมพ์ข้อความเดียวกันซ้ำสองที่ให้ผู้ใช้อ่าน) */
export function OtpField({
  id = "otp",
  invalid = false,
  describedBy,
}: {
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        รหัสยืนยัน 6 หลัก
      </label>
      <input
        ref={ref}
        className="input input--lg otp-input"
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        required
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={invalid ? describedBy : undefined}
      />
    </div>
  );
}
