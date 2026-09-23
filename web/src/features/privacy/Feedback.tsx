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

        {/* หมวดที่อยู่ในแพ็กเกจข้อมูล — ชื่อหมวดเท่านั้น ค่าข้างในไม่ขึ้นจอ
            เพราะแพ็กเกจของคำขอ ACCESS มีค่าเต็มของช่องทางติดต่อและที่อยู่อยู่ด้วย (ข้อ 6.4) */}
        {state.packageSections && state.packageSections.length > 0 ? (
          <p className="t-sm" style={{ marginTop: "var(--space-2)" }}>
            หมวดในแพ็กเกจ: {state.packageSections.map((s) => PACKAGE_SECTION_LABEL[s] ?? s).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** ชื่อหมวดที่ api.build_dsr_package คืนมา แปลเป็นไทยให้ผู้ปฏิบัติงานอ่านออก */
const PACKAGE_SECTION_LABEL: Record<string, string> = {
  customer: "ข้อมูลลูกค้า",
  contacts: "ช่องทางติดต่อ",
  addresses: "ที่อยู่",
  consents: "ความยินยอม",
  visits: "การเข้าร้าน",
  interactions: "การติดต่อ",
  leads: "ผู้สนใจ",
  opportunities: "โอกาสขาย",
  transactions: "ธุรกรรม",
  notes: "โน้ต",
};
