import Link from "next/link";

import type { AccessBranch } from "@/lib/access";

import { ISSUE_LABEL } from "./labels";
import { ISSUE_CODES, type IssueCode } from "./types";

/* แถบตัวกรอง (sitemap-screen-specs ข้อ 15)

   เป็น <form> ธรรมดาที่ส่งแบบ GET — ตัวกรองจึงไปอยู่ใน query string และแชร์ลิงก์ได้จริง
   ไม่ต้องใช้ JavaScript เลย ซึ่งสำคัญกับเครื่องหน้าร้านที่เครือข่ายไม่ดี

   เลือกได้เฉพาะสาขาในสิทธิ์ของผู้ใช้ · สาขาอื่นถือว่าไม่ได้เลือกแล้วปล่อยให้ RLS ตัดสินต่อ */

export function FilterBar({
  branches,
  issue,
  branchCode,
  isDefault,
}: {
  branches: AccessBranch[];
  issue: IssueCode | null;
  branchCode: string | null;
  isDefault: boolean;
}) {
  return (
    <form className="filter-bar filter-bar--panel" role="group" aria-label="ตัวกรองศูนย์คุณภาพข้อมูล">
      {branches.length > 1 ? (
        <div className="field field--inline">
          <label className="label" htmlFor="dq-branch">
            สาขา
          </label>
          <select className="select" id="dq-branch" name="branch" defaultValue={branchCode ?? ""}>
            <option value="">ทุกสาขาที่คุณดูได้</option>
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
        <label className="label" htmlFor="dq-issue">
          ชนิดปัญหา
        </label>
        <select className="select" id="dq-issue" name="issue" defaultValue={issue ?? ""}>
          <option value="">ยังไม่เลือก (ดูเฉพาะการ์ดสรุป)</option>
          {ISSUE_CODES.map((code) => (
            <option key={code} value={code}>
              {ISSUE_LABEL[code]}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn--secondary">
        ใช้ตัวกรอง
      </button>

      {isDefault ? null : (
        <div className="filter-bar__clear">
          <Link className="btn btn--ghost" href="/data-quality">
            ล้างตัวกรอง
          </Link>
        </div>
      )}
    </form>
  );
}
