import type { Access } from "@/lib/access";
import { dateTime } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";
import { roleLabel } from "@/lib/labels";

import { DecideForm, RequestGrantForm } from "./RequestForms";
import { permissionState } from "./scope";
import { GRANT_STATUS_LABEL, GRANT_TYPE_LABEL, type GrantRequestRow, type StaffRow } from "./types";

/* แท็บ “คำขอมอบบทบาท”

   ผู้ดูแลระบบ (IT) ยื่นคำขอ · ผู้บริหารอนุมัติ · ผู้ดูแลข้อมูลธุรกิจเห็นเพื่ออ่าน (ข้อ 7.2)
   api.list_role_grant_requests เป็นผู้ตัดสินว่าใครเห็นคำขอไหน — หน้านี้ไม่กรองซ้ำ */

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ["SYSTEM_ADMIN", "EXECUTIVE", "BUSINESS_ADMIN"].map((code) => [code, roleLabel(code)])
);

const STATUS_VARIANT: Record<string, string> = {
  REQUESTED: "badge--warning",
  APPROVED: "badge--success",
  REJECTED: "badge--neutral",
};

export function RequestsPanel({
  access,
  requests,
  staff,
}: {
  access: Access;
  requests: GrantRequestRow[];
  /** บัญชีที่ผู้ใช้เห็นอยู่แล้ว — ใช้เป็นตัวเลือก “ผู้รับ” ของคำขอ */
  staff: StaffRow[];
}) {
  const decide = permissionState(access, "role.decide");
  const request = permissionState(access, "role.request");

  const targets = staff
    .filter((s) => s.staff_id !== access.staff.staff_id)
    .map((s) => ({ staff_id: s.staff_id, label: `${s.display_name} · ${s.staff_code}` }));

  /** เหตุผลที่ตัดสินคำขอนี้ไม่ได้ — null = ตัดสินได้ · undefined = ไม่ต้องแสดงปุ่มเลย */
  function decideReason(q: GrantRequestRow): string | null | undefined {
    if (!decide.visible) return undefined;
    if (q.status !== "REQUESTED") return undefined;
    if (q.requested_by === access.staff.staff_id || q.target_staff_id === access.staff.staff_id) {
      return "ผู้ตัดสินต้องไม่ใช่ผู้ยื่นหรือผู้รับ";
    }
    return decide.reason;
  }

  return (
    <div className="stack">
      <p className="state-bar" role="note">
        บทบาทผู้ดูแลระบบ (IT) · ผู้บริหาร · ผู้ดูแลข้อมูลธุรกิจ มอบตรงไม่ได้ — ต้องยื่นคำขอแล้วให้ผู้บริหารอนุมัติ
        (ข้อ 7.2) · ลบคำขอไม่ได้
      </p>

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">คำขอมอบบทบาท</caption>
            <thead>
              <tr>
                <th scope="col">เลขคำขอ</th>
                <th scope="col">ชนิด</th>
                <th scope="col">บทบาท</th>
                <th scope="col">ผู้รับ</th>
                <th scope="col">ยื่นเมื่อ</th>
                <th scope="col">สถานะ</th>
                <th scope="col">การตัดสิน</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "var(--space-5)", color: "var(--text-secondary)" }}>
                    ไม่มีคำขอที่รอดำเนินการ
                  </td>
                </tr>
              ) : (
                requests.map((q) => {
                  const reason = decideReason(q);
                  return (
                    <tr key={q.request_id}>
                      <td>{q.request_no ?? DASH}</td>
                      <td>{GRANT_TYPE_LABEL[q.request_type] ?? q.request_type}</td>
                      <td>{roleLabel(q.role_code)}</td>
                      <td>
                        {q.target_display_name ?? DASH}
                        {q.target_staff_code ? <span className="cell-sub">{q.target_staff_code}</span> : null}
                      </td>
                      <td>{dateTime(q.requested_at)}</td>
                      <td>
                        <span className={`badge ${STATUS_VARIANT[q.status] ?? "badge--neutral"}`}>
                          {GRANT_STATUS_LABEL[q.status] ?? q.status}
                        </span>
                      </td>
                      <td>
                        {reason === undefined ? (
                          q.decided_at ? (
                            <span className="t-xs t-muted">{dateTime(q.decided_at)}</span>
                          ) : (
                            DASH
                          )
                        ) : (
                          <DecideForm
                            requestId={q.request_id}
                            requestNo={q.request_no ?? q.request_id}
                            blockedReason={reason}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {request.visible ? (
        <section className="card" aria-labelledby="rg-new-title">
          <div className="card__header">
            <div>
              <h2 className="card__title" id="rg-new-title">
                ยื่นคำขอบทบาท
              </h2>
              <p className="card__subtitle">ใช้กับบทบาท ผู้ดูแลระบบ (IT) · ผู้บริหาร · ผู้ดูแลข้อมูลธุรกิจ เท่านั้น</p>
            </div>
          </div>
          <RequestGrantForm targets={targets} roleLabels={ROLE_LABELS} blockedReason={request.reason} />
        </section>
      ) : null}
    </div>
  );
}
