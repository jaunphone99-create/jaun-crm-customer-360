import { int } from "@/lib/format/number";
import type { AccessBranch } from "@/lib/access";

import { BADGE_LABEL, BADGE_ORDER, LIFECYCLE_LABEL, LIFECYCLE_ORDER, PRESET_LABEL } from "./labels";
import { ClearFiltersLink } from "./States";
import type { CustomerFilters, Preset } from "./types";

/* แถบตัวกรอง (sitemap-screen-specs ข้อ 6.7)

   เป็น <form> ธรรมดาที่ส่งแบบ GET — ตัวกรองจึงไปอยู่ใน query string และแชร์ลิงก์ได้จริง
   ไม่ต้องใช้ JavaScript เลย ซึ่งสำคัญกับเครื่องหน้าร้านที่เครือข่ายไม่ดี
   ปุ่มเลื่อนหน้าอยู่นอกฟอร์มแต่ผูกกลับมาด้วย attribute form="cust-filters" จะได้พาตัวกรองไปด้วย

   ไม่มีตัวกรอง "สถานะระเบียน" ให้เลือก — record_status = ACTIVE เสมอ (ข้อ 6.7 บรรทัดสุดท้าย) */

export const FILTER_FORM_ID = "cust-filters";

function ddLabel(n: number): string {
  return n ? `เลือก ${int(n)}` : "ทั้งหมด";
}

export function FilterBar({
  branches,
  channels,
  filters,
  isDefault,
}: {
  branches: AccessBranch[];
  /** ช่องทางทั้งหมดเรียงตาม ref.channels.sort_order — หน้าอ่านมาให้แล้ว ไม่ยิงฐานข้อมูลซ้ำที่นี่ */
  channels: { code: string; label: string }[];
  filters: CustomerFilters;
  isDefault: boolean;
}) {
  const statusCount = filters.stages.length + filters.badges.length;
  const presets: Preset[] = ["TODAY", "LAST_30_DAYS"];

  return (
    <form className="filter-bar cust-filterbar is-open" id={FILTER_FORM_ID} role="group" aria-label="ตัวกรองรายการลูกค้า">
      {branches.length > 1 ? (
        <div className="field field--inline">
          <label className="label" htmlFor="cust-branch">
            สาขา
          </label>
          <select className="select" id="cust-branch" name="branch" defaultValue={filters.branchCode ?? ""}>
            <option value="">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.code}>
                {b.name_th}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="field field--inline">
          <span className="label">สาขา</span>
          <span className="t-sm">{branches[0]?.name_th ?? "–"}</span>
        </div>
      )}

      <div className="field field--inline">
        <span className="label" id="dd-status-label">
          สถานะ
        </span>
        <details className="cust-dd">
          <summary className="select" aria-labelledby="dd-status-label">
            {ddLabel(statusCount)}
          </summary>
          <div className="cust-dd__panel">
            <fieldset className="fieldset">
              <legend>สถานะลูกค้า</legend>
              <div className="checkbox-group">
                {LIFECYCLE_ORDER.map((code) => (
                  <label className="checkbox" key={code}>
                    <input type="checkbox" name="stage" value={code} defaultChecked={filters.stages.includes(code)} />
                    <span className="checkbox__text">{LIFECYCLE_LABEL[code]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="fieldset">
              <legend>ป้ายเสริม</legend>
              <div className="checkbox-group">
                {BADGE_ORDER.map((key) => (
                  <label className="checkbox" key={key}>
                    <input type="checkbox" name="badge" value={key} defaultChecked={filters.badges.includes(key)} />
                    <span className="checkbox__text">{BADGE_LABEL[key]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>
      </div>

      <div className="field field--inline">
        <span className="label" id="dd-channel-label">
          ช่องทางล่าสุด
        </span>
        <details className="cust-dd">
          <summary className="select" aria-labelledby="dd-channel-label">
            {ddLabel(filters.channels.length)}
          </summary>
          <div className="cust-dd__panel">
            <fieldset className="fieldset">
              <legend>ช่องทางล่าสุด</legend>
              <div className="checkbox-group">
                {channels.map((c) => (
                  <label className="checkbox" key={c.code}>
                    <input
                      type="checkbox"
                      name="channel"
                      value={c.code}
                      defaultChecked={filters.channels.includes(c.code)}
                    />
                    <span className="checkbox__text">{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>
      </div>

      <div className="field field--inline">
        <label className="label" htmlFor="cust-preset">
          ติดต่อล่าสุด
        </label>
        <select className="select" id="cust-preset" name="preset" defaultValue={filters.preset}>
          {presets.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn--secondary">
        ใช้ตัวกรอง
      </button>

      {isDefault ? null : (
        <div className="filter-bar__clear">
          <ClearFiltersLink />
        </div>
      )}
    </form>
  );
}
