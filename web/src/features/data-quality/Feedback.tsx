"use client";

import type { ActionState } from "./types";

/* กล่องผลลัพธ์ของฟอร์ม — ใช้ตัวเดียวกันทุกฟอร์มในหน้านี้

   ข้อความที่เข้ามาผ่าน toThaiMessage แล้วทั้งหมด จึงปลอดภัยที่จะแสดง
   (ไม่มีชื่อตาราง ชื่อ constraint หรือค่า PII หลุดขึ้นจอ · web/src/lib/errors.ts) */

export function Feedback({ state }: { state: ActionState }) {
  if (!state.title) return null;
  return (
    <div className={`alert ${state.ok ? "alert--success" : "alert--danger"}`} role="status">
      <span aria-hidden="true">{state.ok ? "✓" : "!"}</span>
      <div>
        <p className="alert__title">{state.title}</p>
        {state.detail ? <p>{state.detail}</p> : null}
      </div>
    </div>
  );
}
