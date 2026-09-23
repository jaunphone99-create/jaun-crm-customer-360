import Link from "next/link";

import { dateTime } from "@/lib/format/date";
import { DASH, int } from "@/lib/format/number";

import { DIRECTION_LABEL, type IntegrationLogRow, type SourceSystemRow } from "./types";

/* แท็บ Integration — ระบบต้นทาง + บันทึกการเชื่อมต่อ (ข้อ 9.6)

   รายการบันทึกมาจาก api.list_integration_logs ซึ่งบังคับสิทธิ์ integration.manage เองที่ฐานข้อมูล
   หน้าจอไม่ได้กรองอะไรเพิ่มนอกจากตัวกรองที่ส่งเป็นพารามิเตอร์ให้ RPC กรองให้

   V1 ยังไม่เชื่อมระบบภายนอกจริง (ข้อ 13.14) — ตารางว่างจึงเป็นสถานะปกติ ไม่ใช่อาการพัง
   ข้อความสถานะว่างต้องบอกแบบนั้นให้ชัด ไม่งั้นผู้ดูแลจะไล่หาสาเหตุที่ไม่มีอยู่ */

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: "badge--success",
  FAILED: "badge--danger",
  PENDING: "badge--warning",
  SKIPPED: "badge--neutral",
};

export function IntegrationPanel({
  systems,
  logs,
  filter,
  query,
}: {
  systems: SourceSystemRow[];
  logs: IntegrationLogRow[];
  filter: { system: string; status: string };
  query: Record<string, string>;
}) {
  return (
    <>
      <section className="card card--flush st-group" aria-labelledby="set-src">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="set-src">
              ระบบต้นทาง
            </h2>
            <p className="card__subtitle">
              ref.source_systems (ข้อ 5.7) · V1 ผูกเลขธุรกรรมด้วยมือเท่านั้น การเชื่อมต่ออัตโนมัติอยู่ใน Phase 4
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table--compact">
            <caption className="sr-only">ระบบต้นทาง</caption>
            <thead>
              <tr>
                <th scope="col">ระบบต้นทาง</th>
                <th scope="col">รหัส</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {systems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="is-null">
                    อ่านรายการระบบต้นทางไม่ได้
                  </td>
                </tr>
              ) : (
                systems.map((s) => (
                  <tr key={s.code}>
                    <th scope="row" style={{ fontWeight: "var(--fw-regular)" }}>
                      {s.label_th}
                    </th>
                    <td>
                      <span className="st-key">{s.code}</span>
                    </td>
                    <td>
                      <span className={`badge ${s.is_active ? "badge--success" : "badge--neutral"} badge--square`}>
                        {s.is_active ? "เปิดใช้งาน" : "ปิดอยู่"}
                      </span>
                      {s.is_system ? <span className="cell-sub">ระบบกำหนด แก้ไม่ได้</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card--flush st-group" aria-labelledby="set-ilog">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="set-ilog">
              บันทึกการเชื่อมต่อ
            </h2>
            <p className="card__subtitle">
              audit.integration_logs · เรียงจากใหม่ไปเก่า สูงสุด 200 รายการ (api.list_integration_logs)
            </p>
          </div>
        </div>

        {/* ฟอร์ม GET ธรรมดา — ตัวกรองจึงอยู่ใน query string และแชร์ลิงก์ได้โดยไม่ต้องใช้ JavaScript */}
        <form className="filter-bar filter-bar--panel" role="group" aria-label="ตัวกรองบันทึกการเชื่อมต่อ">
          <input type="hidden" name="tab" value="integration" />
          <div className="field">
            <label className="label" htmlFor="ilog-system">
              ระบบต้นทาง
            </label>
            <select className="select" id="ilog-system" name="system" defaultValue={filter.system}>
              <option value="">ทุกระบบ</option>
              {systems.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label_th}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="ilog-status">
              ผล
            </label>
            <select className="select" id="ilog-status" name="status" defaultValue={filter.status}>
              <option value="">ทุกผล</option>
              {Object.keys(STATUS_BADGE).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--secondary">
            กรอง
          </button>
          {filter.system || filter.status ? (
            <Link className="filter-bar__clear" href={{ pathname: "/settings", query: { ...query, tab: "integration" } }}>
              ล้างตัวกรอง
            </Link>
          ) : null}
        </form>

        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">บันทึกการเชื่อมต่อระบบภายนอก</caption>
            <thead>
              <tr>
                <th scope="col">เวลา</th>
                <th scope="col">ระบบต้นทาง</th>
                <th scope="col">ทิศทาง · การกระทำ</th>
                <th scope="col">ผล</th>
                <th scope="col">อ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "var(--space-5)", color: "var(--text-secondary)" }}>
                    ยังไม่มีบันทึกการเชื่อมต่อ — V1 ยังไม่ได้เชื่อมระบบภายนอกแบบอัตโนมัติ (ข้อ 13.14)
                    {filter.system || filter.status ? " หรือไม่มีรายการที่ตรงตัวกรอง" : ""}
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="st-value">{dateTime(l.occurred_at)}</td>
                    <td>{l.source_system_code ?? DASH}</td>
                    <td>
                      {l.direction ? (DIRECTION_LABEL[l.direction] ?? l.direction) : DASH}
                      <span className="cell-sub">{l.operation ?? DASH}</span>
                    </td>
                    <td>
                      <span className={`badge ${l.status ? (STATUS_BADGE[l.status] ?? "badge--neutral") : "badge--neutral"} badge--square`}>
                        {l.status ?? DASH}
                      </span>
                      {l.http_status !== null ? <span className="cell-sub st-value">HTTP {l.http_status}</span> : null}
                      {l.error_message ? <span className="cell-sub warning-text">{l.error_message}</span> : null}
                    </td>
                    <td>
                      <span className="st-key">{l.external_ref ?? DASH}</span>
                      <span className="cell-sub">{l.actor_label ?? DASH}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {logs.length > 0 ? (
          <div className="card__footer">
            <p className="t-sm t-muted">แสดง {int(logs.length)} รายการล่าสุด (RPC คืนได้สูงสุด 200)</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
