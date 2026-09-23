import { DASH, deltaDir, moneyTable } from "@/lib/format/number";

import { compareText } from "./period";
import { groupKeysOf, rowOf } from "./queries";
import type { KpiResult, KpiRow } from "./types";

/* ตาราง "ผลงานรายสาขา" (W4 · sitemap-screen-specs ข้อ 5.5 · CANONICAL ข้อ 13.2)

   ทุกช่องมาจาก api.get_kpis(p_group_by = 'BRANCH') แถวละสาขา
   ส่วนแถว "รวม" **ไม่ได้บวกจากแถวข้างบน** แต่มาจากผลของ p_group_by = 'NONE' ซึ่งเป็นคนละคำสั่ง
   เหตุผลที่ห้ามบวกเอง: ลูกค้าหนึ่งคนที่ไปสองสาขานับเป็น "ลูกค้าไม่ซ้ำ" ของทั้งสองสาขา
   แต่รวมทั้งองค์กรต้องนับครั้งเดียว — บวกคอลัมน์ตรง ๆ จะได้ยอดรวมที่สูงเกินจริง
   และ Conversion เป็นอัตรา บวกกันไม่ได้อยู่แล้ว (ข้อ 12.4)

   เงินในช่องตารางไม่มี ฿ เพราะหัวคอลัมน์มี "(บาท)" อยู่แล้ว (ข้อ 1.3) จึงใช้ moneyTable
   กับค่าดิบจาก RPC — ตัวเลขและการปัดเป็นชุดเดียวกับ app.fmt_money ทุกหลัก
   (web/scripts/check-format.mjs เป็นผู้ตรวจว่าสองฝั่งยังเท่ากัน) */

const METRICS = ["UNIQUE_CUSTOMERS", "LEADS", "OPPORTUNITIES", "SALES", "CONV_LEAD_TO_SALE", "SALES_AMOUNT"];

function Text({ row }: { row: KpiRow | null }) {
  const v = row?.display ?? DASH;
  return v === DASH ? <span className="is-null">{DASH}</span> : <>{v}</>;
}

function Money({ row }: { row: KpiRow | null }) {
  if (!row || row.value === null) return <span className="is-null">{DASH}</span>;
  return <>{moneyTable(row.value)}</>;
}

function Change({ row, note }: { row: KpiRow | null; note: string }) {
  const text = row?.change_display;
  if (!text || text === DASH) return <span className="is-null">{DASH}</span>;
  return (
    <span className={`delta delta--${deltaDir(text)}`} title={note}>
      {text}
    </span>
  );
}

/** แถวที่ทุกตัวเลขเป็นศูนย์หรือว่าง ไม่ต้องแสดง (sitemap ข้อ 5.5 W4 — เช่น หน่วยออนไลน์ที่ยังไม่มีข้อมูล) */
function isEmptyGroup(byBranch: KpiResult, key: string): boolean {
  return METRICS.every((code) => {
    const row = rowOf(byBranch, code, key);
    return !row || row.value === null || Number(row.value) === 0;
  });
}

export function BranchTable({ byBranch, total }: { byBranch: KpiResult; total: KpiResult }) {
  const note = compareText(byBranch);
  const keys = groupKeysOf(byBranch).filter((k) => !isEmptyGroup(byBranch, k));

  if (keys.length === 0) {
    return <p className="t-sm t-muted">ยังไม่มีตัวเลขของสาขาใดในช่วงนี้</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table table--compact table--sticky-first">
        <caption className="sr-only">ผลงานรายสาขา</caption>
        <thead>
          <tr>
            <th scope="col">สาขา</th>
            <th scope="col">ลูกค้าไม่ซ้ำ</th>
            <th scope="col">Leads</th>
            <th scope="col">Opportunities</th>
            <th scope="col">Sales</th>
            <th scope="col">Conversion (Lead → ขาย)</th>
            <th scope="col">ยอดขาย (บาท)</th>
            <th scope="col" title="ยอดขายเทียบช่วงก่อนหน้า">
              เปลี่ยน
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key}>
              <th scope="row" className="nowrap">
                {rowOf(byBranch, "UNIQUE_CUSTOMERS", key)?.group_label ?? DASH}
              </th>
              <td className="num">
                <Text row={rowOf(byBranch, "UNIQUE_CUSTOMERS", key)} />
              </td>
              <td className="num">
                <Text row={rowOf(byBranch, "LEADS", key)} />
              </td>
              <td className="num">
                <Text row={rowOf(byBranch, "OPPORTUNITIES", key)} />
              </td>
              <td className="num">
                <Text row={rowOf(byBranch, "SALES", key)} />
              </td>
              <td className="num">
                <Text row={rowOf(byBranch, "CONV_LEAD_TO_SALE", key)} />
              </td>
              <td className="num">
                <Money row={rowOf(byBranch, "SALES_AMOUNT", key)} />
              </td>
              <td>
                <Change row={rowOf(byBranch, "SALES_AMOUNT", key)} note={note} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="is-total">
            <th scope="row" className="nowrap">
              รวม
            </th>
            <td className="num">
              <Text row={rowOf(total, "UNIQUE_CUSTOMERS")} />
            </td>
            <td className="num">
              <Text row={rowOf(total, "LEADS")} />
            </td>
            <td className="num">
              <Text row={rowOf(total, "OPPORTUNITIES")} />
            </td>
            <td className="num">
              <Text row={rowOf(total, "SALES")} />
            </td>
            <td className="num">
              <Text row={rowOf(total, "CONV_LEAD_TO_SALE")} />
            </td>
            <td className="num">
              <Money row={rowOf(total, "SALES_AMOUNT")} />
            </td>
            <td>
              <Change row={rowOf(total, "SALES_AMOUNT")} note={note} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
