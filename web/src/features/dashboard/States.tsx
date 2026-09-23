import Link from "next/link";

import { toThaiMessage } from "@/lib/errors";

import { FILTER_FORM_ID } from "./Filters";

/* สถานะของหน้า 02 (sitemap-screen-specs ข้อ 5.7)

   "ผิดพลาดเฉพาะวิดเจ็ต" เป็นข้อกำหนดจริงของหน้านี้: ถ้าตาราง Branch Performance ล่ม
   การ์ด KPI ต้องยังอยู่ หน้าจึงหุ้มแต่ละส่วนด้วย Suspense/try แยกกัน ไม่ใช่ก้อนเดียว */

/** C-STATE-LOADING — โครงร่างขนาดเท่าการ์ดจริง 6 ใบ ไม่ใช่ข้อความ "กำลังโหลด" ลอย ๆ */
export function KpiSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="kpi-grid dash-kpis" aria-busy="true">
      <span className="sr-only">กำลังโหลดตัวเลข…</span>
      {Array.from({ length: cards }, (_, i) => (
        <span className="skeleton" key={i} style={{ height: "128px" }} />
      ))}
    </div>
  );
}

export function WidgetSkeleton({ height = "220px" }: { height?: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">กำลังโหลด…</span>
      <span className="skeleton" style={{ height }} />
    </div>
  );
}

/* C-STATE-ERROR — ห้ามแสดงข้อความดิบของฐานข้อมูล (อาจมีชื่อตารางหรือค่า PII)
   ปุ่ม "ลองอีกครั้ง" ส่งฟอร์มตัวกรองซ้ำ จะได้คงช่วงเวลา/สาขาที่ผู้ใช้เลือกไว้
   ชุด "พนักงาน" ที่มีสาขาเดียวไม่มีฟอร์มนั้น จึงถอยไปใช้ลิงก์กลับหน้าเดิมแทน */
export function WidgetError({
  error,
  title = "โหลดตัวเลขไม่สำเร็จ",
  hasFilterForm,
}: {
  error: unknown;
  title?: string;
  hasFilterForm: boolean;
}) {
  const thai = toThaiMessage(error);
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{title}</p>
      <p className="state__text">{thai.detail ?? thai.title}</p>
      {!thai.canRetry ? null : hasFilterForm ? (
        <button type="submit" form={FILTER_FORM_ID} className="btn btn--secondary">
          ลองอีกครั้ง
        </button>
      ) : (
        <Link className="btn btn--secondary" href="/dashboard">
          ลองอีกครั้ง
        </Link>
      )}
    </div>
  );
}
