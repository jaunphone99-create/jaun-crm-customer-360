import Link from "next/link";

import { roleLabel } from "@/lib/labels";

/* การ์ด "ไม่มีสิทธิ์เข้าหน้านี้" (C-STATE-NOACCESS-PAGE)

   ข้อความใช้ตรงตัวตาม design-system — ห้ามแต่งใหม่ เพราะผู้ใช้จะเจอข้อความนี้ซ้ำหลายหน้า
   และต้องไม่บอกว่าข้างในมีข้อมูลอะไร บอกแค่ว่าใครเปิดได้และของคุณคือบทบาทอะไร
   (docs/06-ux/design-system.md · docs/07-api/core-flow-contract.md ข้อ 7.9) */

export function NotAuthorized({
  title = "ไม่มีสิทธิ์เข้าหน้านี้",
  allowedRoles,
  myRoles,
  detail,
}: {
  title?: string;
  allowedRoles?: string[];
  myRoles?: string[];
  detail?: string;
}) {
  return (
    <div className="card" role="alert" style={{ maxWidth: "56ch" }}>
      <h1 className="card__title">{title}</h1>

      {allowedRoles?.length ? (
        <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
          หน้านี้เปิดได้สำหรับ: {allowedRoles.map(roleLabel).join(" · ")}
        </p>
      ) : null}

      {myRoles !== undefined ? (
        <p className="t-sm">บทบาทของคุณ: {myRoles.length ? myRoles.map(roleLabel).join(" · ") : "ไม่มีบทบาท"}</p>
      ) : null}

      {detail ? (
        <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
          {detail}
        </p>
      ) : null}

      <p style={{ marginTop: "var(--space-4)" }}>
        <Link className="btn btn--secondary" href="/dashboard">
          กลับหน้าแรก
        </Link>
      </p>
    </div>
  );
}
