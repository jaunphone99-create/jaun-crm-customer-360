import Link from "next/link";

import { dateTime } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";
import { roleLabel } from "@/lib/labels";

import { HIDDEN_TEXT } from "./mask";
import type { AuditRow } from "./queries";

/* รายละเอียดของหนึ่งแถว — กางอยู่ใต้แถวในตารางเดียวกัน ไม่ใช่ drawer

   ที่เลือกแบบกางในตารางเพราะหน้านี้ไม่มี JavaScript ฝั่งเบราว์เซอร์เลย (สถานะอยู่ใน URL ทั้งหมด)
   ผลพลอยได้คือคนตรวจสอบก๊อปลิงก์ของ "แถวนี้ที่กางอยู่" ส่งต่อได้ทันที

   ค่าก่อน/หลังที่เห็นตรงนี้เป็นค่าปิดบังจาก mask.ts มาแล้ว — คอลัมน์ PII ถูกแทนด้วย masked
   และ sha256 ถูกตัดทิ้งตั้งแต่ฝั่งเซิร์ฟเวอร์ (hash ไม่มี salt เบอร์ไทยไล่ย้อนได้ในไม่กี่วินาที) */

const DL_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  gap: "var(--space-2) var(--space-4)",
  margin: 0,
  fontSize: "var(--fs-sm)",
};

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-secondary)" }}>{term}</dt>
      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{children}</dd>
    </>
  );
}

/** ลิงก์ไปดูประวัติทั้งหมดของรายการนี้ได้ก็ต่อเมื่อ entity_id เป็น uuid
    เพราะ api.get_entity_history รับ p_entity_id uuid — entity_id ของ audit_logs เป็น text
    ที่บางแถวเก็บเป็นรหัส เช่น "role_code:permission_code" ซึ่งส่งไปแล้วฐานข้อมูลจะฟ้องชนิดข้อมูล */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canOpenHistory(row: AuditRow): boolean {
  return Boolean(row.entityType && row.entityId && UUID.test(row.entityId));
}

export function EntryDetail({
  row,
  branchNames,
  query,
}: {
  row: AuditRow;
  branchNames: Record<string, string>;
  /** ตัวกรองที่ใช้อยู่ ต้องติดไปกับลิงก์ทุกอันในแผงนี้ ไม่งั้นปิดแล้วผลการค้นหาย */
  query: Record<string, string>;
}) {
  const changed = row.changes.filter((c) => c.changed);
  const rest = row.changes.filter((c) => !c.changed);
  const branch = row.branchId ? (branchNames[row.branchId] ?? row.branchId) : null;

  return (
    <div className="stack" style={{ padding: "var(--space-4)" }}>
      <dl style={DL_STYLE}>
        <Row term="เวลา">{dateTime(row.occurredAt, { suffix: true })}</Row>
        <Row term="ผู้กระทำ">
          {row.actorStaffCode ? `${row.actorStaffCode} ` : ""}
          {row.actorLabel ?? DASH}
        </Row>
        <Row term="บทบาทขณะทำ">
          {row.actorRoles.length ? row.actorRoles.map(roleLabel).join(" · ") : DASH}
        </Row>
        <Row term="ระดับการยืนยันตัวตน">{row.aal ?? DASH}</Row>
        <Row term="การกระทำ">
          <span className="code">{row.action}</span>
        </Row>
        <Row term="ชนิด / เลขอ้างอิงรายการ">
          <span className="code">{row.entityType ?? DASH}</span> · {row.entityRef ?? DASH}
        </Row>
        <Row term="สาขา">{branch ?? DASH}</Row>
        <Row term="ช่องที่เปลี่ยน">
          {row.changedFields.length ? (
            <span className="code">{row.changedFields.join(" · ")}</span>
          ) : (
            DASH
          )}
        </Row>
        <Row term="เหตุผล">{row.reason ?? DASH}</Row>
      </dl>

      <section aria-label="ค่าก่อนและหลัง">
        <h3 className="section__title">ก่อน → หลัง</h3>
        {row.changes.length === 0 ? (
          <p className="t-sm t-muted">
            แถวนี้ไม่มีภาพก่อน/หลัง — เป็นเหตุการณ์ที่ RPC บันทึกเชิงความหมาย ไม่ได้มาจากการแก้แถวในตาราง
          </p>
        ) : (
          <>
            <ChangeTable rows={changed.length ? changed : rest} highlight={changed.length > 0} />
            {changed.length > 0 && rest.length > 0 ? (
              <details style={{ marginTop: "var(--space-3)" }}>
                <summary className="t-sm">ดูช่องที่เหลือทั้งแถว ({rest.length} ช่อง)</summary>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <ChangeTable rows={rest} highlight={false} />
                </div>
              </details>
            ) : null}
          </>
        )}
        <p className="help">
          ค่าของช่องที่เป็นข้อมูลส่วนบุคคลถูกฐานข้อมูลปิดบังไว้ตั้งแต่ตอนบันทึก และหน้านี้แสดงเฉพาะค่าปิดบัง ·
          ลูกค้าที่ถูกทำนิรนามแล้วจะขึ้นเป็น [ANONYMIZED] · ช่องที่ขึ้น {HIDDEN_TEXT} คือช่องที่ตั้งใจไม่ส่งออกจากเซิร์ฟเวอร์
        </p>
      </section>

      <p className="row" style={{ gap: "var(--space-2)" }}>
        {canOpenHistory(row) ? (
          <Link
            className="btn btn--secondary btn--sm"
            href={{
              pathname: "/audit",
              query: { ...query, hist: `${row.entityType}:${row.entityId}`, row: String(row.id) },
            }}
          >
            ดูประวัติทั้งหมดของรายการนี้
          </Link>
        ) : null}
        {row.entityRef ? (
          <Link
            className="btn btn--ghost btn--sm"
            href={{ pathname: "/audit", query: { tab: "business", ref: row.entityRef } }}
          >
            ค้นด้วยเลขอ้างอิงนี้
          </Link>
        ) : null}
        <Link className="btn btn--ghost btn--sm" href={{ pathname: "/audit", query }}>
          ปิด
        </Link>
      </p>
    </div>
  );
}

function ChangeTable({
  rows,
  highlight,
}: {
  rows: { field: string; before: string | null; after: string | null; changed: boolean }[];
  highlight: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="table table--compact">
        <caption className="sr-only">ช่องที่เปลี่ยน ค่าก่อนและหลัง</caption>
        <thead>
          <tr>
            <th scope="col">ชื่อช่อง</th>
            <th scope="col">ก่อน</th>
            <th scope="col">หลัง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.field}>
              <th scope="row" className="code">
                {c.field}
              </th>
              <td style={highlight && c.changed ? { background: "var(--warning-bg)" } : undefined}>
                {c.before ?? <span className="is-null">{DASH}</span>}
              </td>
              <td style={highlight && c.changed ? { background: "var(--warning-bg)" } : undefined}>
                {c.after ?? <span className="is-null">{DASH}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
