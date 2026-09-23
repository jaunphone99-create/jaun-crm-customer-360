import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <section className="stack" aria-labelledby="forgot-title">
      <div>
        <p className="t-sm t-muted">เข้าสู่ระบบไม่ได้</p>
        <h1 id="forgot-title">ลืมรหัสผ่าน</h1>
        <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
          กรอกอีเมลหรือรหัสพนักงานที่ใช้เข้าสู่ระบบ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลที่ลงทะเบียนไว้
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="t-xs t-muted">
        เพื่อความปลอดภัย ระบบตอบข้อความเดียวกันเสมอ ไม่ว่าข้อมูลที่กรอกจะตรงกับบัญชีในระบบหรือไม่
      </p>
    </section>
  );
}
