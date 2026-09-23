import Link from "next/link";

import { dateTime } from "@/lib/format/date";
import { DASH, showing } from "@/lib/format/number";

import { RECORD_STATUS_LABEL, type CustomerBrief } from "./types";

/* แท็บ "ระงับการลบตามกฎหมาย" ของหน้า 17

   รายการนี้มาจาก crm.customers ที่ legal_hold เป็นจริง โดย RLS เป็นผู้กรองว่าใครเห็นรายไหน
   ไม่ใช่ตัวเลขสรุป จึงไม่ต้องผ่าน RPC ของ KPI — และไม่มีการนับอะไรที่หน้าจอ

   "ใครตั้งไว้ เมื่อไร เพราะอะไร" ดึงจาก audit.audit_logs ของลูกค้าแต่ละราย
   ไม่ใช่จาก crm.customers.updated_by เพราะคอลัมน์นั้นถูกทับด้วยการแก้ไขอะไรก็ได้ครั้งล่าสุด */

export type HoldSetter = {
  /** ผู้ตั้งล่าสุด ตามที่ audit บันทึกไว้ */
  actor: string | null;
  at: string | null;
  reason: string | null;
};

export function LegalHoldPanel({
  rows,
  setters,
  canSeeHistory,
}: {
  rows: CustomerBrief[];
  /** customer_id → ผู้ตั้งล่าสุด */
  setters: Map<string, HoldSetter>;
  canSeeHistory: boolean;
}) {
  return (
    <div className="tabpanel stack">
      <p className="state-bar" role="note">
        ลูกค้าที่ติด legal hold จะถูกข้ามจากการทำข้อมูลนิรนาม ทั้งตามคำขอของเจ้าของข้อมูลและตามระยะเวลาเก็บ (ข้อ 10.3) ·
        ตั้งและยกเลิกได้ที่แท็บความยินยอม โดยค้นหาลูกค้ารายนั้น
      </p>

      {!canSeeHistory ? (
        <p className="help">
          คุณไม่มีสิทธิ์อ่านประวัติการแก้ไข จึงไม่เห็นว่าใครเป็นผู้ตั้งไว้ — ช่อง “ผู้ตั้งล่าสุด” จะว่าง
        </p>
      ) : null}

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">ลูกค้าที่ถูกระงับการลบตามกฎหมาย</caption>
            <thead>
              <tr>
                <th scope="col">รหัสลูกค้า</th>
                <th scope="col">ชื่อ</th>
                <th scope="col">สถานะแถว</th>
                <th scope="col">ผู้ตั้งล่าสุด</th>
                <th scope="col">ตั้งเมื่อ</th>
                <th scope="col">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty-cell">
                    <div className="state">
                      <p className="state__title">ไม่มีลูกค้าที่ถูกระงับการลบไว้</p>
                      <p className="state__text">
                        ตั้ง legal hold ได้ที่แท็บความยินยอม เมื่อมีเหตุทางกฎหมายที่ต้องเก็บข้อมูลไว้ก่อน
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const s = setters.get(c.customer_id);
                  return (
                    <tr key={c.customer_id}>
                      <td>
                        <Link className="nowrap" href={`/customers/${c.customer_no}`}>
                          <span className="code">{c.customer_no}</span>
                        </Link>
                      </td>
                      <td>{c.display_name}</td>
                      <td>{RECORD_STATUS_LABEL[c.record_status] ?? c.record_status}</td>
                      <td>{s?.actor ?? DASH}</td>
                      <td className="nowrap">{s?.at ? dateTime(s.at) : DASH}</td>
                      <td>{s?.reason ?? DASH}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div className="card__footer">
            <span className="pagination__label">{showing(rows.length, rows.length, { unit: "ราย" })}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
