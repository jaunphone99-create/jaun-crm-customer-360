import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/features/shell/Icon";

/* สถานะร่วมของหน้า (core-flow-contract ข้อ 7.9 · C-STATE-*)

   ข้อความใช้ตรงตัวตามเอกสาร เพราะผู้ใช้จะเจอข้อความชุดนี้ซ้ำในทุกหน้า
   ถ้าแต่ละหน้าคิดคำเอง ผู้ใช้จะเดาไม่ออกว่า "ไม่พบ" กับ "ไม่มีสิทธิ์" ต่างกันตรงไหน */

export function StateCard({
  kind = "empty",
  title,
  text,
  action,
}: {
  kind?: "empty" | "noresult" | "error";
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`state${kind === "error" ? " state--error" : ""}`} {...(kind === "error" ? { role: "alert" } : {})}>
      <span className="state__icon">
        <Icon name="users" />
      </span>
      <p className="state__title">{title}</p>
      {text ? <p className="state__text">{text}</p> : null}
      {action}
    </div>
  );
}

/** C-STATE-LOADING — โครงร่างขนาดเท่าของจริง ไม่ใช่ข้อความ "กำลังโหลด" ลอย ๆ */
export function ResultsSkeleton() {
  return (
    <div className="card card--flush" aria-busy="true">
      <div className="state state--compact" style={{ alignItems: "stretch" }}>
        <span className="sr-only">กำลังโหลด…</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <span className="skeleton" key={i} style={{ height: "40px", width: i === 0 ? "100%" : "92%" }} />
        ))}
      </div>
    </div>
  );
}

/** ปุ่ม "ล้างตัวกรอง" — กลับไปหน้าเดิมแบบไม่มี query string คือค่าเริ่มต้นของหน้า */
export function ClearFiltersLink() {
  return (
    <Link className="btn btn--ghost" href="/customers">
      ล้างตัวกรอง
    </Link>
  );
}
