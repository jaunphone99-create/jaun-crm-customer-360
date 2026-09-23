import type { ReactNode } from "react";

import "@/app/generated/page-login.css";

/* โครงหน้าจอของทุกหน้าในกลุ่มยืนยันตัวตน (เข้าสู่ระบบ · MFA · ตั้งรหัสผ่าน · ลืมรหัสผ่าน)
   ลอกโครงมาจาก prototype/01-login.html ตรง ๆ — ไม่มีเมนู ไม่มีแถบบน เพราะยังไม่รู้ว่าเป็นใคร */

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <a className="skip-link" href="#main">
        ข้ามไปยังเนื้อหาหลัก
      </a>

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
        <div className="login__card">{children}</div>
      </main>
    </div>
  );
}
