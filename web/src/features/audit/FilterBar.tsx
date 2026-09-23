import Link from "next/link";

import type { ActorOption } from "./queries";
import {
  BUSINESS_ACTIONS,
  ENTITY_TYPES,
  VIEWS,
  isSecurityAction,
  type AuditTab,
} from "./types";

/* แถบตัวกรองของหน้า 16

   เป็นฟอร์ม GET ธรรมดาโดยตั้งใจ: เงื่อนไขการค้นจึงไปอยู่ใน query string ทั้งหมด
   คนตรวจสอบส่งลิงก์ผลการค้นให้กันดูได้ และหน้านี้ไม่ต้องมี state ฝั่งเบราว์เซอร์เลย
   (สำคัญกับหน้าที่เป็นหลักฐาน — สิ่งที่เห็นต้องสร้างซ้ำได้จาก URL เดียว)

   ช่องที่แสดงมีเฉพาะช่องที่ RPC กรองได้จริง ไล่มาจากตัว SQL ของ api.search_audit:
     from · to · action · entity_type · entity_ref · actor_staff_id
   ไม่มีช่อง "สาขา" เพราะ RPC ไม่รับ branch_id (คืน branch_id มาแสดงได้ แต่กรองไม่ได้)
   การแอบกรองสาขาที่ฝั่งแอปจะตัดแถวออกจากผลที่ถูกตัดมาแล้วที่ 200 แถว = ซ่อนหลักฐานเงียบ ๆ

   แท็บความปลอดภัยเหลือแค่ช่วงเวลา เพราะ api.search_security_log รับแค่ from/to/limit */

export type FilterValues = {
  view: string;
  from: string;
  to: string;
  actor: string;
  action: string;
  entity: string;
  ref: string;
};

export const EMPTY_FILTER: FilterValues = {
  view: "all",
  from: "",
  to: "",
  actor: "",
  action: "",
  entity: "",
  ref: "",
};

export function isFiltered(v: FilterValues): boolean {
  return (
    v.view !== "all" || Boolean(v.from || v.to || v.actor || v.action || v.entity || v.ref)
  );
}

export function FilterBar({
  tab,
  values,
  actors,
  quickRanges,
}: {
  tab: AuditTab;
  values: FilterValues;
  actors: ActorOption[];
  /** ช่วงเวลาสำเร็จรูป — คำนวณไว้ฝั่งเซิร์ฟเวอร์เพื่อให้ปุ่มเป็นลิงก์ธรรมดา ไม่ต้องใช้ JavaScript */
  quickRanges: { label: string; from: string; to: string }[];
}) {
  const business = tab === "business";
  const actions = business ? BUSINESS_ACTIONS : BUSINESS_ACTIONS.filter(isSecurityAction);
  const p = `${tab}-`;

  return (
    <form className="filter-bar filter-bar--panel" role="search" aria-label="ตัวกรองประวัติการใช้งาน">
      {/* แท็บติดไปกับฟอร์ม ไม่งั้นกดค้นแล้วเด้งกลับแท็บแรก */}
      <input type="hidden" name="tab" value={tab} />

      {business ? (
        <div className="field">
          <label className="label" htmlFor={`${p}view`}>
            มุมมอง
          </label>
          <select className="select" id={`${p}view`} name="view" defaultValue={values.view}>
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
                {v.available ? "" : " (ยังอ่านไม่ได้)"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor={`${p}from`}>
          ตั้งแต่
        </label>
        <input className="input" type="datetime-local" id={`${p}from`} name="from" defaultValue={values.from} />
      </div>

      <div className="field">
        <label className="label" htmlFor={`${p}to`}>
          ถึง
        </label>
        <input className="input" type="datetime-local" id={`${p}to`} name="to" defaultValue={values.to} />
      </div>

      {business && actors.length > 0 ? (
        <div className="field">
          <label className="label" htmlFor={`${p}actor`}>
            ผู้กระทำ
          </label>
          <select className="select" id={`${p}actor`} name="actor" defaultValue={values.actor}>
            <option value="">ทุกคน</option>
            {actors.map((a) => (
              <option key={a.staffId} value={a.staffCode}>
                {a.staffCode} {a.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {business ? (
        <>
          {/* มุมมองสำเร็จรูปคือชุด action อยู่แล้ว ถ้าเปิดช่องนี้ค้างไว้พร้อมกันจะได้เงื่อนไขที่ขัดกันเอง
              แล้วคืนศูนย์แถวโดยผู้ใช้ไม่รู้สาเหตุ — จึงปิดช่องไว้ตอนเลือกมุมมองอื่นที่ไม่ใช่ "ทั้งหมด" */}
          <div className="field">
            <label className="label" htmlFor={`${p}action`}>
              การกระทำ
            </label>
            <select
              className="select"
              id={`${p}action`}
              name="action"
              defaultValue={values.action}
              disabled={values.view !== "all"}
              aria-describedby={values.view !== "all" ? `${p}action-hint` : undefined}
            >
              <option value="">ทั้งหมด</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {values.view !== "all" ? (
              <p className="help" id={`${p}action-hint`}>
                มุมมองที่เลือกกำหนดชุดการกระทำให้แล้ว
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="label" htmlFor={`${p}entity`}>
              ชนิดรายการ
            </label>
            <select className="select" id={`${p}entity`} name="entity" defaultValue={values.entity}>
              <option value="">ทั้งหมด</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor={`${p}ref`}>
              เลขอ้างอิงรายการ
            </label>
            <input
              className="input"
              type="text"
              id={`${p}ref`}
              name="ref"
              defaultValue={values.ref}
              placeholder="ตรงทั้งค่า เช่น CUS-2026-000297"
              autoComplete="off"
            />
          </div>
        </>
      ) : null}

      <button type="submit" className="btn btn--primary">
        ค้นหา
      </button>

      {isFiltered(values) ? (
        <Link className="btn btn--ghost" href={{ pathname: "/audit", query: { tab } }}>
          ล้างตัวกรอง
        </Link>
      ) : null}

      {/* ช่วงเวลาที่ใช้บ่อย — เป็นลิงก์ที่เติม from/to ให้ โดยคงตัวกรองอื่นไว้ */}
      <span className="chip-group" style={{ marginInlineStart: "auto", alignSelf: "flex-end" }}>
        {quickRanges.map((r) => (
          <Link
            key={r.label}
            className="chip"
            href={{
              pathname: "/audit",
              query: {
                tab,
                ...(values.view !== "all" ? { view: values.view } : {}),
                ...(values.actor ? { actor: values.actor } : {}),
                ...(values.action ? { action: values.action } : {}),
                ...(values.entity ? { entity: values.entity } : {}),
                ...(values.ref ? { ref: values.ref } : {}),
                from: r.from,
                to: r.to,
              },
            }}
          >
            {r.label}
          </Link>
        ))}
      </span>
    </form>
  );
}
