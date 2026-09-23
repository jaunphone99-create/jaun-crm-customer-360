import Link from "next/link";

import { int } from "@/lib/format/number";

import { ISSUE_LABEL, ISSUE_PHASE } from "./labels";
import { countsOf } from "./queries";
import { ISSUE_CODES, type CountRow, type IssueCode, type Summary } from "./types";

/* การ์ดสรุปต่อชนิดปัญหา (CANONICAL ข้อ 12.3 · 13.12)

   ตัวเลขบนการ์ดคือ total ที่ api.list_data_quality_issues นับมาให้ของชนิดนั้น
   บรรทัดรายสาขาคือ counts ที่ RPC เดียวกันคืนมา — แสดงเป็นรายสาขาเพราะ RPC คืนมาแบบนั้น
   **หน้านี้ไม่บวกเลขสองตัวใด ๆ เข้าด้วยกัน** ทั้งยอดรวมและยอดรายสาขาเป็นของที่ฐานข้อมูลนับเองทั้งคู่

   การ์ดเป็นลิงก์ที่ตั้ง ?issue= ให้ จึงแชร์ลิงก์ไปที่ชนิดปัญหาเดียวกันได้ */

function branchLine(rows: CountRow[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => `${r.branch_code ?? "–"} ${int(r.value)}`).join(" · ");
}

export function IssueSummary({
  summary,
  selected,
  query,
}: {
  summary: Summary;
  selected: IssueCode | null;
  /** ตัวกรองอื่นที่ต้องติดไปกับลิงก์ เพื่อให้กดการ์ดแล้วสาขาที่เลือกไว้ไม่หาย */
  query: Record<string, string>;
}) {
  return (
    <div className="kpi-grid dq-kpis">
      {ISSUE_CODES.map((code) => {
        const total = summary.byCode[code].total;
        const perBranch = countsOf(summary.counts, code);
        const isSelected = code === selected;
        const next = { ...query };
        /* กดการ์ดที่เปิดอยู่ = ปิดรายละเอียด */
        if (isSelected) delete next.issue;
        else next.issue = code;

        return (
          <Link
            className="kpi-card"
            key={code}
            href={{ pathname: "/data-quality", query: next }}
            aria-current={isSelected ? "true" : undefined}
            style={isSelected ? { borderColor: "var(--navy-900)" } : undefined}
          >
            <div className="kpi-card__head">
              <span className="kpi-card__label">{ISSUE_LABEL[code]}</span>
            </div>
            <div className={`kpi-card__value${total === 0 ? " dq-count-zero" : ""}`}>{int(total)}</div>
            {perBranch.length > 0 ? <div className="kpi-card__sub">{branchLine(perBranch)}</div> : null}
            <div className="kpi-card__foot">
              <span className="badge badge--neutral badge--square">Phase {ISSUE_PHASE[code]}</span>
              {total === 0 ? <span className="t-xs t-success">ไม่มีรายการ</span> : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
