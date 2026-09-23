import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/features/auth/actions";
import { MfaVerifyForm } from "@/features/auth/MfaForms";
import { mfaReason, nextPathAfterSignIn, requiresMfa } from "@/features/auth/rules";
import { getAccess } from "@/lib/access";
import { DB_DRIVER } from "@/lib/env";
import { roleLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "ยืนยันตัวตนสองขั้นตอน" };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const access = await getAccess().catch(() => null);
  if (!access) redirect("/login");

  /* ยืนยันแล้ว (aal2) ก็ไม่ต้องยืนยันซ้ำ */
  if (access.aal === "aal2") redirect(nextPathAfterSignIn(access));

  const roles = [...new Set(access.roles.filter((r) => r.requires_mfa).map((r) => roleLabel(r.role_code)))];

  return (
    <section className="stack" aria-labelledby="mfa-title">
      <div>
        <p className="t-sm t-muted" id="mfa-who">
          {access.staff.display_name} · {access.staff.staff_code}
        </p>
        <h1 id="mfa-title">ยืนยันตัวตนสองขั้นตอน</h1>
        <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
          กรอกรหัส 6 หลักจากแอป Authenticator ที่ลงทะเบียนไว้
        </p>
      </div>

      {requiresMfa(access) ? <div className="alert">{mfaReason(roles)}</div> : null}

      {DB_DRIVER === "dev" ? (
        <div className="alert alert--warning" role="note">
          <span aria-hidden="true">!</span>
          <div>
            <p className="alert__title">โหมดพัฒนา</p>
            <p>
              ฐานข้อมูลทดลองไม่มีที่เก็บ TOTP จริง จึงรับรหัสตัวเลข 6 หลักใดก็ได้เพื่อยกเซสชันเป็น aal2 ·
              สิทธิ์ที่ได้กลับมาเป็นของจริงทั้งหมด เพราะ <code>api.get_my_access()</code> อ่านระดับการยืนยันจาก token
            </p>
          </div>
        </div>
      ) : null}

      <MfaVerifyForm />

      <form action={signOut}>
        <button type="submit" className="btn btn--ghost btn--block">
          ใช้บัญชีอื่น
        </button>
      </form>

      <p className="help">
        ถ้ายังไม่เคยลงทะเบียน MFA ให้{" "}
        <Link className="link-btn" href="/login/mfa/enroll">
          ลงทะเบียน TOTP ก่อนใช้งาน
        </Link>{" "}
        · ถ้าเปลี่ยนเครื่องหรือทำอุปกรณ์หาย ติดต่อผู้ดูแลข้อมูลธุรกิจเพื่อรีเซ็ต MFA
      </p>
    </section>
  );
}
