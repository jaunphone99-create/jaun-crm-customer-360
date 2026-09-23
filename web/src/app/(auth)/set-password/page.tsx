import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetPasswordForm } from "@/features/auth/SetPasswordForm";
import { isInvited } from "@/features/auth/rules";
import { getAccess } from "@/lib/access";
import { DB_DRIVER } from "@/lib/env";
import { dateTime } from "@/lib/format/date";

export const metadata: Metadata = { title: "ตั้งรหัสผ่าน" };
export const dynamic = "force-dynamic";

/* ตั้งรหัสผ่านครั้งแรก (รับคำเชิญ) และตั้งรหัสผ่านใหม่จากลิงก์รีเซ็ต

   ผู้ใช้มาถึงหน้านี้ได้สองทาง
   1. กดลิงก์ในอีเมล → มี token_hash ติดมากับ URL · แลกเป็นเซสชันใน Server Action (เขียน cookie ได้)
   2. เข้าสู่ระบบแล้วแต่บัญชียังเป็น INVITED → ตั้งรหัสผ่านแล้วเรียก api.activate_self() */

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string): string => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  const tokenHash = pick("token_hash");
  const tokenType = pick("type") || "invite";

  const access = await getAccess().catch(() => null);

  /* ไม่มีทั้งลิงก์และเซสชัน = ไม่รู้ว่าเป็นใคร ให้กลับไปเริ่มที่หน้าเข้าสู่ระบบ */
  if (!tokenHash && !access) redirect("/login");

  const invited = access ? isInvited(access) : true;
  const expiresAt = access?.staff.invite_expires_at ?? null;

  return (
    <section className="stack" aria-labelledby="set-password-title">
      <div>
        <p className="t-sm t-muted">{invited ? "รับคำเชิญเข้าใช้งาน" : "ตั้งรหัสผ่านใหม่"}</p>
        <h1 id="set-password-title">{invited ? "ตั้งรหัสผ่านครั้งแรก" : "ตั้งรหัสผ่านใหม่"}</h1>
        {access ? (
          <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
            {access.staff.display_name} · {access.staff.staff_code}
          </p>
        ) : null}
      </div>

      {invited && expiresAt ? (
        <div className="alert" role="note">
          <span aria-hidden="true">i</span>
          <div>
            <p className="alert__title">คำเชิญมีอายุจำกัด</p>
            <p>
              คำเชิญนี้หมดอายุ {dateTime(expiresAt, { suffix: true })} · ถ้าหมดอายุแล้วให้ขอคำเชิญใหม่จากผู้จัดการสาขาหรือผู้ดูแลข้อมูลธุรกิจ
            </p>
          </div>
        </div>
      ) : null}

      <SetPasswordForm tokenHash={tokenHash} tokenType={tokenType} mode={DB_DRIVER === "dev" ? "dev" : "supabase"} />
    </section>
  );
}
