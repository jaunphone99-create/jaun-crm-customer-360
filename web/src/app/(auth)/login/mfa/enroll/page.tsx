import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/features/auth/actions";
import { TotpEnrollForm } from "@/features/auth/MfaForms";
import { requiresMfa } from "@/features/auth/rules";
import { getAccess } from "@/lib/access";
import { DB_DRIVER } from "@/lib/env";
import { roleLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "ลงทะเบียนยืนยันตัวตนสองขั้นตอน" };
export const dynamic = "force-dynamic";

export default async function MfaEnrollPage() {
  const access = await getAccess().catch(() => null);
  if (!access) redirect("/login");

  const roles = [...new Set(access.roles.filter((r) => r.requires_mfa).map((r) => roleLabel(r.role_code)))];

  return (
    <section className="stack" aria-labelledby="enroll-title">
      <div>
        <p className="t-sm t-muted">
          {access.staff.display_name} · {access.staff.staff_code}
        </p>
        <h1 id="enroll-title">ลงทะเบียนยืนยันตัวตนสองขั้นตอน</h1>
        <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
          {requiresMfa(access)
            ? `บทบาท ${roles.join(" · ")} ต้องลงทะเบียน TOTP ก่อนจึงจะใช้งานระบบได้`
            : "เพิ่มการยืนยันสองขั้นตอนให้บัญชีของคุณ"}
        </p>
      </div>

      {DB_DRIVER === "dev" ? (
        <>
          <div className="alert alert--warning" role="note">
            <span aria-hidden="true">!</span>
            <div>
              <p className="alert__title">โหมดพัฒนายังลงทะเบียน TOTP จริงไม่ได้</p>
              <p>
                การลงทะเบียน TOTP เก็บอยู่ใน Supabase Auth ซึ่งฐานข้อมูลทดลองไม่มี ·
                ถ้าจะทดสอบทางเดินของ MFA ให้ใช้หน้ายืนยันตัวตนแทน
              </p>
            </div>
          </div>
          <Link className="btn btn--accent btn--lg btn--block" href="/login/mfa">
            ไปหน้ายืนยันตัวตนสองขั้นตอน
          </Link>
        </>
      ) : (
        <TotpEnrollForm />
      )}

      <form action={signOut}>
        <button type="submit" className="btn btn--ghost btn--block">
          ใช้บัญชีอื่น
        </button>
      </form>
    </section>
  );
}
