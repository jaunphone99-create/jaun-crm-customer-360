import type { Metadata } from "next";
import Link from "next/link";

import { requireAccess } from "@/lib/access";
import { roleLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "หน้าหลัก" };

export default async function DashboardPage() {
  const access = await requireAccess();

  return (
    <>
      <div className="page__head">
        <div>
          <h1>หน้าหลัก</h1>
          <p className="t-sm t-muted">
            {access.staff.display_name} · {access.roles.map((r) => roleLabel(r.role_code)).join(" · ") || "ไม่มีบทบาท"}
          </p>
        </div>
      </div>

      <div className="alert" role="note">
        <span aria-hidden="true">i</span>
        <div>
          <p className="alert__title">หน้านี้อยู่ในชุดที่ 2 ของแผน Phase 1</p>
          <p>
            ตอนนี้กำลังทำชุดที่ 1 (Core Flow หน้างาน) อยู่ — ไปที่{" "}
            <Link href="/reception">รับลูกค้าเข้าร้าน</Link> เพื่อทดลองงานจริง
          </p>
        </div>
      </div>
    </>
  );
}
