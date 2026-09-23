import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listDevStaff } from "@/features/auth/actions";
import { DevLoginForm, PasswordLoginForm } from "@/features/auth/LoginForms";
import { isInvited, isUsable, nextPathAfterSignIn } from "@/features/auth/rules";
import { getAccess } from "@/lib/access";
import { DB_DRIVER } from "@/lib/env";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  /* เข้าสู่ระบบอยู่แล้วก็ไม่ต้องให้กรอกซ้ำ — แต่ต้องไปให้ถูกขั้น
     (ยังไม่ยืนยัน MFA → /login/mfa · ยังไม่เปิดใช้งานบัญชี → /set-password) */
  const access = await getAccess().catch(() => null);
  if (access && (isUsable(access) || isInvited(access))) redirect(nextPathAfterSignIn(access));

  const devStaff = DB_DRIVER === "dev" ? await listDevStaff() : [];

  return (
    <section className="stack" aria-labelledby="login-title">
      <div>
        <p className="t-sm t-muted">ยินดีต้อนรับ</p>
        <h1 id="login-title">เข้าสู่ระบบ JAUN CRM</h1>
      </div>

      {DB_DRIVER === "dev" ? (
        <>
          <div className="alert alert--warning" role="note">
            <span aria-hidden="true">!</span>
            <div>
              <p className="alert__title">โหมดพัฒนาในเครื่อง</p>
              <p>
                ต่อกับฐานข้อมูลทดลอง (PGlite) ที่ใช้ migration · RLS · RPC ชุดเดียวกับของจริง
                แต่ไม่ตรวจรหัสผ่าน — เลือกได้ว่าจะทดลองในฐานะใคร
              </p>
            </div>
          </div>
          <DevLoginForm staff={devStaff} />
        </>
      ) : (
        <PasswordLoginForm />
      )}
    </section>
  );
}
