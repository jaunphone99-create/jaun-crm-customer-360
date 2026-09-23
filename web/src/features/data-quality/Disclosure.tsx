"use client";

import type { ReactNode } from "react";

/* ปุ่ม "แก้รายการนี้" ที่กางฟอร์มออกมาในที่เดิม

   ใช้ <details> แทนกล่องโต้ตอบแบบ prototype ด้วยเหตุผลเดียวกับตัวกรองของหน้า 03:
   เครื่องหน้าร้านเครือข่ายไม่ดี และฟอร์มที่กางในที่เดิมทำงานได้แม้ JavaScript ยังโหลดไม่เสร็จ
   ผู้ใช้ยังเห็นแถวที่กำลังแก้อยู่ตรงหน้า ไม่ใช่กล่องลอยที่บังข้อมูลที่ต้องอ่านประกอบ

   ปุ่มที่กดไม่ได้จะไม่กลายเป็น <details> — วาดเป็นปุ่มที่กดไม่ได้พร้อมเหตุผลแทน
   เพื่อไม่ให้ผู้ใช้กางฟอร์มยาว ๆ แล้วไปโดนปฏิเสธตอนกดบันทึก */

export function FixDisclosure({
  label,
  title,
  blockedReason,
  variant = "secondary",
  children,
}: {
  label: string;
  title: string;
  blockedReason?: string | null;
  variant?: "secondary" | "accent" | "primary" | "danger";
  children: ReactNode;
}) {
  if (blockedReason) {
    return (
      <div className="stack-2">
        <button type="button" className={`btn btn--${variant} btn--sm`} disabled aria-disabled="true">
          {label}
        </button>
        <span className="help">{blockedReason}</span>
      </div>
    );
  }

  return (
    <details className="stack-2">
      <summary className={`btn btn--${variant} btn--sm`} style={{ listStyle: "none", cursor: "pointer" }}>
        {label}
      </summary>
      {/* ฟอร์มที่กางในช่องตารางจะแคบตามความกว้างของคอลัมน์ · กำหนดความกว้างขั้นต่ำไว้
          เพื่อให้ยังกรอกได้จริง แล้วให้ .table-wrap เลื่อนแนวนอนแทนการบีบฟอร์มจนใช้ไม่ได้ */}
      <div
        className="card"
        style={{
          marginTop: "var(--space-3)",
          background: "var(--surface-subtle)",
          minWidth: "min(34rem, 72vw)",
        }}
        role="group"
        aria-label={title}
      >
        <p className="t-sm t-medium t-heading" style={{ marginBottom: "var(--space-3)" }}>
          {title}
        </p>
        {children}
      </div>
    </details>
  );
}
