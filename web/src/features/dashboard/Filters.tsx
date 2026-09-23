import type { AccessBranch } from "@/lib/access";

import { PRESET_LABEL } from "./labels";
import { PRESETS, type DashboardFilters } from "./types";

/* ตัวเลือกช่วงเวลาและสาขา (sitemap-screen-specs ข้อ 5.6)

   เป็น <form> GET ธรรมดาเหมือนแถบตัวกรองของหน้า 03 — ค่าที่เลือกจึงไปอยู่ใน query string
   ผลคือลิงก์ที่ส่งต่อให้คนอื่นได้ และหน้าใช้งานได้โดยไม่ต้องรอ JavaScript
   (prototype ใช้ popover ปฏิทิน ซึ่งต้องมี JS — ของจริงเลือก select ที่แชร์ลิงก์ได้แทน)

   รายการสาขาแสดงเฉพาะสาขาในสิทธิ์ของผู้ใช้ และถึงจะแก้ URL ใส่สาขาอื่น
   api.get_kpis ก็ตัดสาขานอกสิทธิ์ทิ้งเองอยู่แล้ว (ข้อ 9.4.1) — ที่นี่เป็นความสะดวก ไม่ใช่ด่าน */

export const FILTER_FORM_ID = "dash-filters";

export function Filters({
  branches,
  filters,
  showPreset,
}: {
  branches: AccessBranch[];
  filters: DashboardFilters;
  /** ชุด "พนักงาน" ไม่มีตัวเลือกช่วงเวลา เพราะช่วงตายตัวอยู่ในป้ายการ์ดแล้ว (ข้อ 14.7) */
  showPreset: boolean;
}) {
  if (!showPreset && branches.length <= 1) return null;

  return (
    <form className="filter-bar is-open" id={FILTER_FORM_ID} role="group" aria-label="ช่วงเวลาและสาขาของตัวเลข">
      {showPreset ? (
        <div className="field field--inline">
          <label className="label" htmlFor="dash-preset">
            ช่วงเวลา
          </label>
          <select className="select" id="dash-preset" name="preset" defaultValue={filters.preset}>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {branches.length > 1 ? (
        <div className="field field--inline">
          <label className="label" htmlFor="dash-branch">
            สาขา
          </label>
          <select className="select" id="dash-branch" name="branch" defaultValue={filters.branchCode ?? ""}>
            <option value="">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.code}>
                {b.name_th}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button type="submit" className="btn btn--secondary">
        ดูตัวเลข
      </button>
    </form>
  );
}
