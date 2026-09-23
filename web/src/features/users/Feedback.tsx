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

        {/* ลิงก์คำเชิญ — แสดงครั้งเดียวตรงนี้ ผู้เชิญต้องคัดลอกส่งให้พนักงานเอง
            จนกว่าจะตั้งค่าอีเมลขาออกของ Supabase เสร็จ (ดู environment-setup.md) */}
        {state.inviteUrl ? (
          <div className="stack" style={{ marginTop: "var(--space-2)", gap: "var(--space-1)" }}>
            <p className="t-sm">
              <strong>ส่งลิงก์นี้ให้พนักงานเอง</strong> — ระบบยังไม่ได้ตั้งค่าอีเมลขาออก
            </p>
            <input className="input" readOnly value={state.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
            <p className="t-xs t-muted">ลิงก์นี้เปิดได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง · อย่าส่งต่อให้คนอื่น</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
