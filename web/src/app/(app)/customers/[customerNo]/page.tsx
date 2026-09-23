import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Customer360 } from "@/features/customer360/Customer360";
import { loadCustomer360 } from "@/features/customer360/queries";
import type { Customer360Access } from "@/features/customer360/types";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { can, needsMfaFor, requireAccess } from "@/lib/access";

import "@/app/generated/page-customer-360.css";

export const metadata: Metadata = { title: "ข้อมูลลูกค้า" };
export const dynamic = "force-dynamic";

export default async function Customer360Page({
  params,
  searchParams,
}: {
  params: Promise<{ customerNo: string }>;
  searchParams: Promise<{ merged?: string }>;
}) {
  const access = await requireAccess();

  /* กันคนที่พิมพ์ลิงก์เข้ามาตรง ๆ — ฐานข้อมูลไม่คืนข้อมูลให้อยู่แล้ว
     ที่นี่แค่ทำให้ข้อความอ่านรู้เรื่องแทนที่จะเป็นการ์ด "ไม่พบข้อมูล" ที่ชวนสับสน */
  if (!can(access, "customer.read")) {
    return (
      <NotAuthorized
        allowedRoles={["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"]}
        myRoles={access.roles.map((r) => r.role_code)}
        detail={needsMfaFor(access, "customer.read") ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" : undefined}
      />
    );
  }

  const { customerNo: rawNo } = await params;
  const { merged } = await searchParams;
  /* ลิงก์ที่พิมพ์เองอาจมี % ค้างอยู่จนถอดรหัสไม่ได้ — ปล่อยให้ error หลุดไปจะกลายเป็นหน้า 500
     ทั้งที่ความจริงคือ "หาไม่เจอ" จึงใช้ค่าดิบต่อแล้วให้ฐานข้อมูลตอบว่าไม่พบเอง */
  let customerNo = rawNo;
  try {
    customerNo = decodeURIComponent(rawNo);
  } catch {
    customerNo = rawNo;
  }

  const result = await loadCustomer360(customerNo);

  /* ลูกค้าที่ถูกรวมไปแล้วไม่มีหน้าเป็นของตัวเอง — พาไปที่รายที่เหลืออยู่แล้วบอกว่ามาจากเลขไหน
     (CANONICAL ข้อ 6.7 · sitemap-screen-specs ข้อ 8.3) */
  if (result.status === "merged") {
    redirect(`/customers/${encodeURIComponent(result.survivorNo)}?merged=${encodeURIComponent(customerNo)}` as Route);
  }

  /* "ไม่มีแถวนี้" กับ "มีแต่คุณไม่มีสิทธิ์" ต้องแยกจากกันไม่ได้ ไม่งั้นหน้าจอกลายเป็นเครื่องมือ
     ยืนยันว่าลูกค้าคนหนึ่งมีอยู่ในระบบหรือไม่ (rls-spec F5 · ฐานข้อมูลก็ตอบข้อความเดียวกัน) */
  if (result.status === "notfound") {
    return (
      <div className="state state--card" role="alert">
        <p className="state__title">ไม่พบข้อมูล หรือคุณไม่มีสิทธิ์ดูรายการนี้</p>
        <p className="state__text">ตรวจรหัสลูกค้าอีกครั้ง หรือกลับไปค้นหาจากรายการลูกค้า</p>
        <p>
          <Link className="btn btn--secondary" href="/customers">
            ไปที่รายการลูกค้า
          </Link>
        </p>
      </div>
    );
  }

  /* ใช้ซ่อน/ปิดปุ่มเท่านั้น — ข้อมูลถูกจำกัดโดย RLS และ RPC อยู่แล้ว (CANONICAL ข้อ 9.6) */
  const c360Access: Customer360Access = {
    canReveal: can(access, "customer.pii.reveal"),
    revealNeedsMfa: needsMfaFor(access, "customer.pii.reveal"),
    canUpdate: can(access, "customer.update"),
    canMerge: can(access, "customer.merge"),
    mergeNeedsMfa: needsMfaFor(access, "customer.merge"),
  };

  return <Customer360 data={result.data} access={c360Access} mergedFrom={merged} />;
}
