import Link from "next/link";

import { dateTime } from "@/lib/format/date";
import { DASH, int } from "@/lib/format/number";
import { roleLabel } from "@/lib/labels";

import { LIVE_BADGE, LIVE_LABEL, type GroupSpec, type SettingSpec } from "./catalog";
import { SettingEditForm } from "./SettingEditForm";
import type { BranchRow, SettingRow } from "./types";
import { asHours, asLimits, displayValue } from "./value";

/* ตารางค่าตั้งหนึ่งกลุ่ม

   คอลัมน์ "มีผลกับ" คือหัวใจของเกณฑ์ที่เจ้าของโครงการตั้งไว้ในรอบนี้
   ("Settings ต้องเปลี่ยน behavior ของระบบจริง ไม่ใช่แค่เก็บค่า")
   จึงเขียนคู่กันสองบรรทัดเสมอ: เปลี่ยนแล้วอะไรเปลี่ยน + ของจริงบังคับใช้ที่ไหน
   และมีป้ายบอกตรง ๆ เมื่อค่านั้นยังไม่มีใครอ่านไปใช้ ("ยังไม่มีผล")

   แถวที่ผู้ใช้แก้ไม่ได้ไม่ถูกซ่อน แต่แสดงแบบอ่านอย่างเดียวพร้อมเหตุผล
   เพราะ api.get_settings() คืนเฉพาะคีย์ที่ผู้เรียกแก้ได้ ผู้ดูแลจึงไม่มีทางรู้เลยว่า
   ค่าที่เห็นบนหน้าจออื่นมาจากคีย์ไหน ถ้าหน้านี้ซ่อนคีย์ที่ตัวเองแก้ไม่ได้ไปด้วย */

export type GroupRow = {
  spec: SettingSpec;
  /** null = ฐานข้อมูลไม่ได้คืนคีย์นี้มา (ผู้ใช้ไม่มีสิทธิ์แก้ จึงไม่ได้สิทธิ์ดูค่าด้วย) */
  row: SettingRow | null;
  /** เหตุผลที่แก้ไม่ได้ — null = แก้ได้ */
  lockReason: string | null;
};

export function SettingsGroup({
  group,
  rows,
  editingKey,
  query,
  branches,
  staffNames,
}: {
  group: GroupSpec;
  rows: GroupRow[];
  editingKey: string | null;
  query: Record<string, string>;
  branches: BranchRow[];
  staffNames: Map<string, string>;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="card card--flush st-group" aria-labelledby={`set-g-${group.id}`}>
      <div className="card__header">
        <div>
          <h2 className="card__title" id={`set-g-${group.id}`}>
            {group.title}
          </h2>
          <p className="card__subtitle">{group.subtitle}</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">ค่าตั้งกลุ่ม{group.title}</caption>
          <thead>
            <tr>
              <th scope="col">หัวข้อ</th>
              <th scope="col">ค่าปัจจุบัน</th>
              <th scope="col">มีผลกับ</th>
              <th scope="col">ปรับล่าสุด</th>
              <th scope="col">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ spec, row, lockReason }) => {
              const editing = editingKey === spec.key;
              const editQuery = { ...query, edit: spec.key };
              const updatedBy = row?.updated_by ? (staffNames.get(row.updated_by) ?? DASH) : null;

              return [
                <tr key={spec.key} aria-selected={editing || undefined}>
                  <th scope="row" style={{ fontWeight: "var(--fw-regular)" }}>
                    {spec.label}
                    <span className="cell-sub st-key">{spec.key}</span>
                  </th>

                  <td>
                    {row ? (
                      <ValueCell spec={spec} value={row.value} branches={branches} />
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>

                  <td style={{ maxWidth: "46ch" }}>
                    <span className={`badge ${LIVE_BADGE[spec.live]} badge--square`}>{LIVE_LABEL[spec.live]}</span>{" "}
                    {spec.effect}
                    <span className="cell-sub">บังคับใช้ที่ {spec.enforcedAt}</span>
                    {spec.gap ? <span className="cell-sub warning-text">ข้อจำกัด: {spec.gap}</span> : null}
                  </td>

                  <td>
                    {row?.updated_at ? (
                      <>
                        {updatedBy ?? "ค่าตั้งต้นของระบบ"}
                        <span className="cell-sub">{dateTime(row.updated_at)}</span>
                      </>
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>

                  <td>
                    {lockReason ? (
                      <span className="help">{lockReason}</span>
                    ) : editing ? (
                      <span className="help">กำลังแก้ไข</span>
                    ) : (
                      <Link className="btn btn--secondary btn--sm" href={{ pathname: "/settings", query: editQuery }}>
                        แก้ไข
                      </Link>
                    )}
                  </td>
                </tr>,

                editing && row && !lockReason ? (
                  <tr key={`${spec.key}-edit`}>
                    <td colSpan={5} style={{ background: "var(--surface-raised)" }}>
                      <div className="stack" style={{ padding: "var(--space-2) 0" }}>
                        <p className="t-sm t-muted">
                          แก้ “{spec.label}” — {spec.effect}
                        </p>
                        <SettingEditForm spec={spec} value={row.value} branches={branches} query={query} />
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** ค่าปัจจุบันในคอลัมน์ "ค่า" — ค่าที่เป็นอ็อบเจกต์กางให้อ่านได้ ไม่โยน JSON ดิบใส่หน้าผู้ใช้ */
function ValueCell({ spec, value, branches }: { spec: SettingSpec; value: unknown; branches: BranchRow[] }) {
  if (spec.kind === "hours") {
    const hours = asHours(value);
    const def = hours.default;
    const overrides = Object.keys(hours).filter((k) => k !== "default");
    return (
      <>
        <span className="st-value">{def ? `ทุกสาขา ${def[0]}–${def[1]} น.` : DASH}</span>
        {overrides.length === 0 ? (
          <span className="cell-sub">ไม่มีค่าเฉพาะสาขา</span>
        ) : (
          overrides.map((code) => (
            <span className="cell-sub st-value" key={code}>
              {branches.find((b) => b.code === code)?.name_th ?? code} {hours[code]![0]}–{hours[code]![1]} น.
            </span>
          ))
        )}
      </>
    );
  }

  if (spec.kind === "limits") {
    const limits = asLimits(value);
    const roles = Object.keys(limits).sort();
    if (roles.length === 0) return <span className="is-null">{DASH}</span>;
    return (
      <>
        {roles.map((role) => {
          const row = limits[role]!;
          return (
            <span className="cell-sub st-value" key={role}>
              {roleLabel(role)} · {int(row.max_rows)} แถว/ครั้ง · {int(row.per_day)} ครั้ง/วัน ·{" "}
              {row.approver_role ? `อนุมัติโดย ${roleLabel(row.approver_role)}` : "ไม่ต้องอนุมัติ"}
            </span>
          );
        })}
      </>
    );
  }

  return <span className="st-value">{displayValue(spec, value)}</span>;
}
