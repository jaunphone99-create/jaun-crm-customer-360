import Link from "next/link";

import { toThaiMessage } from "@/lib/errors";
import { dateTime } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";

import type { AuditRow } from "./queries";

/* แผง "ประวัติทั้งหมดของรายการเดียว" — api.get_entity_history

   ต่างจากตารางหลักตรงที่ไม่ถูกตัดด้วยตัวกรองของหน้า: ได้ทุกแถวของรายการนั้นเรียงใหม่→เก่า
   และสำหรับลูกค้า RPC ยังกวาดแถวลูก (ที่อ้าง customer_id ใน before/after) มาให้ด้วย
   จึงเป็นมุมมองที่ตอบคำถาม "รายการนี้ถูกแตะอะไรมาบ้าง" ได้ตรงกว่าการไล่ทีละ action

   ข้อควรรู้เรื่องสิทธิ์: RPC ตัวนี้ยอมให้ผู้มี customer.update ของลูกค้ารายนั้นอ่านได้ด้วย
   (ไม่ใช่เฉพาะ audit.read) การปิดบังค่าจึงต้องทำทุกแถวเหมือนกันหมด ไม่มีทางลัด */

export function EntityHistoryPanel({
  entityType,
  entityId,
  rows,
  error,
  closeQuery,
}: {
  entityType: string;
  entityId: string;
  rows: AuditRow[];
  error: unknown;
  closeQuery: Record<string, string>;
}) {
  const thai = error ? toThaiMessage(error) : null;

  return (
    <section className="card" aria-labelledby="au-hist-title" style={{ marginBottom: "var(--space-5)" }}>
      <div className="card__header">
        <div>
          <h2 className="card__title" id="au-hist-title">
            ประวัติทั้งหมดของรายการนี้
          </h2>
          <p className="card__subtitle">
            <span className="code">{entityType}</span> · <span className="code">{entityId}</span>
          </p>
        </div>
        <Link className="btn btn--ghost btn--sm" href={{ pathname: "/audit", query: closeQuery }}>
          ปิด
        </Link>
      </div>

      {thai ? (
        <div className="state state--error" role="alert">
          <p className="state__title">{thai.title}</p>
          {thai.detail ? <p className="state__text">{thai.detail}</p> : null}
        </div>
      ) : rows.length === 0 ? (
        <p className="t-sm t-muted">ไม่มีประวัติของรายการนี้</p>
      ) : (
        <ol className="timeline">
          {rows.map((r) => (
            <li className="timeline__item" key={r.id}>
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__body">
                <p className="timeline__head">
                  <span className="timeline__title code">{r.action}</span>
                  <span className="timeline__time">{dateTime(r.occurredAt)}</span>
                </p>
                <p className="timeline__meta">
                  {r.actorStaffCode ? `${r.actorStaffCode} ` : ""}
                  {r.actorLabel ?? DASH}
                  {r.changedFields.length ? ` · เปลี่ยน ${r.changedFields.join(" · ")}` : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
