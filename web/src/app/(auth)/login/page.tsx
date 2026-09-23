import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DevLoginForm, PasswordLoginForm } from "@/features/auth/LoginForms";
import { listDevStaff } from "@/features/auth/actions";
import { getAccess, homePath } from "@/lib/access";
import { DB_DRIVER } from "@/lib/env";

import "@/app/generated/page-login.css";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  /* เข้าสู่ระบบอยู่แล้วก็ไม่ต้องให้กรอกซ้ำ */
  const access = await getAccess().catch(() => null);
  if (access) redirect(homePath(access));

  const devStaff = DB_DRIVER === "dev" ? await listDevStaff() : [];

  return (
    <div className="login">
      <aside className="login__brand" aria-label="JAUN CRM">
        <div className="login__logo">
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          <div>
            <p className="login__name">
              JAUN <span>CRM</span>
            </p>
            <p className="login__sub">CUSTOMER 360</p>
          </div>
        </div>
        <p className="login__tagline">
          เชื่อมโยงทุกลูกค้า
          <br />
          สู่การเติบโตอย่างยั่งยืน
        </p>
        <span className="login__rule" aria-hidden="true" />
        <p className="login__foot">CUSTOMER TODAY · A BRIGHTER TOMORROW</p>
      </aside>

      <main className="login__panel" id="main">
        <div className="login__card">
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
        </div>
      </main>
    </div>
  );
}
