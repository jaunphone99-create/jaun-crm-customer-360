import Link from "next/link";
import { Fragment } from "react";

import { dateTime } from "@/lib/format/date";
import { DASH, showing } from "@/lib/format/number";

import { EntryDetail } from "./EntryDetail";
import type { AuditRow } from "./queries";

/* ตารางประวัติการใช้งานธุรกิจ (sitemap-screen-specs ข้อ 19.3 · 19.4)

   คอลัมน์ตามที่อนุมัติไว้: เวลา · ผู้กระทำ · การกระทำ · รายการ · รายละเอียด · แหล่ง
   บนแท็บเล็ตซ่อนคอลัมน์ "แหล่ง" ด้วย .col-hide-tablet เพราะทุกแถวของ api.search_audit
   มาจาก audit.audit_logs แหล่งเดียวอยู่แล้ว (access_logs ยังไม่มี RPC ให้อ่าน)

   การกางแถวใช้ query string ?row=<id> ไม่ใช่ state ฝั่งเบราว์เซอร์ — หน้านี้เป็นหลักฐาน
   สิ่งที่เห็นบนจอจึงต้องสร้างซ้ำได้จาก URL เดียว */

const COLUMNS = 6;

/** สรุปหนึ่งบรรทัดว่าแถวนี้เกิดอะไรขึ้น — ใช้ค่าที่ฐานข้อมูลบันทึกไว้เท่านั้น ไม่แต่งเรื่องเพิ่ม */
function summaryOf(row: AuditRow): string | null {
  if (row.reason) return row.reason;
  if (row.changedFields.length) return `เปลี่ยน ${row.changedFields.join(" · ")}`;
  return null;
}

export function AuditTable({
  rows,
  branchNames,
  query,
  expandedId,
  truncated,
}: {
  rows: AuditRow[];
  branchNames: Record<string, string>;
  query: Record<string, string>;
  expandedId: number | null;
  truncated: boolean;
}) {
  return (
    <div className="card card--flush">
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">ประวัติการใช้งานธุรกิจ</caption>
          <thead>
            <tr>
              <th scope="col">เวลา</th>
              <th scope="col">ผู้กระทำ</th>
              <th scope="col">การกระทำ</th>
              <th scope="col">รายการ</th>
              <th scope="col">รายละเอียด</th>
              <th scope="col" className="col-hide-tablet">
                สาขา
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = r.id === expandedId;
              const summary = summaryOf(r);
              const branch = r.branchId ? (branchNames[r.branchId] ?? r.branchId) : null;
              const toggleQuery = open ? query : { ...query, row: String(r.id) };
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td className="nowrap num">{dateTime(r.occurredAt)}</td>
                    <td>
                      {r.actorStaffCode ? (
                        <span className="nowrap">
                          {r.actorStaffCode}
                          {r.actorLabel ? ` ${r.actorLabel}` : ""}
                        </span>
                      ) : (
                        <span className="is-null">{DASH}</span>
                      )}
                    </td>
                    <td>
                      <Link
                        className="code"
                        href={{ pathname: "/audit", query: toggleQuery }}
                        aria-expanded={open}
                        aria-label={`${open ? "ย่อ" : "กาง"}รายละเอียดของ ${r.action}`}
                      >
                        {r.action}
                      </Link>
                    </td>
                    <td>
                      {r.entityRef ? (
                        <span className="nowrap">{r.entityRef}</span>
                      ) : (
                        <span className="is-null">{DASH}</span>
                      )}
                    </td>
                    <td>{summary ?? <span className="is-null">{DASH}</span>}</td>
                    <td className="col-hide-tablet">
                      {branch ?? <span className="is-null">{DASH}</span>}
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={COLUMNS} style={{ background: "var(--surface-raised)" }}>
                        <EntryDetail row={r} branchNames={branchNames} query={query} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS}>
                  <div className="state">
                    <p className="state__title">ไม่พบประวัติตามเงื่อนไข</p>
                    <p className="state__text">
                      ลองขยายช่วงเวลา หรือเปลี่ยนมุมมอง · ถ้าเหตุการณ์ที่มองหาเป็นการเข้าถึงข้อมูลลูกค้า
                      ให้อ่านหมายเหตุใต้ตาราง
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>{showing(rows.length, rows.length, { unit: "รายการ" })}</span>
        {truncated ? (
          <span className="t-sm t-muted">
            ผลถูกตัดที่เพดาน 200 แถวของ RPC — ระบุช่วงเวลาให้แคบลงเพื่อให้เห็นครบ
          </span>
        ) : null}
      </div>
    </div>
  );
}
