import Link from "next/link";
import type { ReactNode } from "react";

import { date, dateTime } from "@/lib/format/date";
import { DASH, int, money, showing } from "@/lib/format/number";
import type { Access } from "@/lib/access";

import { MergeForm, NotDuplicateForm, type MergeField } from "./DuplicateForms";
import {
  AckVisitForm,
  AssignLeadForm,
  CloseLeadForm,
  CompleteCustomerForm,
  CompleteTaskForm,
  LinkTransactionForm,
  PhoneForm,
} from "./Forms";
import { ISSUE_FIX_PERMISSION, ISSUE_LABEL, LEAD_STATUS_LABEL } from "./labels";
import { duplicateDecisionState, rowActionState } from "./scope";
import { ROWS_SHOWN, type IssueCode } from "./types";
import type {
  CustomerBrief,
  DuplicateDetail,
  IssueRow,
  LeadBrief,
  OpportunityBrief,
  PhoneBrief,
  RefOption,
  StaffOption,
  TaskBrief,
  VisitBrief,
} from "./types";

/* รายละเอียดของชนิดปัญหาที่เลือก (sitemap-screen-specs ข้อ 15.5)

   แต่ละชนิดมีคอลัมน์และปุ่มของตัวเอง เพราะ "สิ่งที่ต้องดูก่อนแก้" ต่างกันจริง ๆ
   คู่ลูกค้าซ้ำต้องเห็นสองรายเทียบกัน · งานติดตามต้องเห็นกำหนดกับผู้รับผิดชอบ

   จำนวนที่แสดงท้ายตารางใช้ total ของ RPC เสมอ ไม่ใช่ความยาวของ array ที่แสดงอยู่
   เพราะหน้านี้ตัดให้เหลือ ROWS_SHOWN แถว ถ้านับจาก array ตัวเลขจะโกหกทันทีที่มีรายการเกินหน้า */

export type DetailContext = {
  access: Access;
  branchNames: Record<string, string>;
  customers: Map<string, CustomerBrief>;
  phones: Map<string, PhoneBrief[]>;
  staffNames: Map<string, string>;
  duplicates: Map<string, DuplicateDetail>;
  leads: Map<string, LeadBrief>;
  tasks: Map<string, TaskBrief>;
  opportunities: Map<string, OpportunityBrief>;
  visits: Map<string, VisitBrief>;
  channelLabels: Record<string, string>;
  provinceLabels: Record<string, string>;
  provinces: RefOption[];
  lostReasons: RefOption[];
  ownershipReasons: RefOption[];
  transactionTypes: RefOption[];
  assignCandidates: StaffOption[];
};

function staffName(ctx: DetailContext, id: string | null): string {
  if (!id) return DASH;
  return ctx.staffNames.get(id) ?? DASH;
}

function branchName(ctx: DetailContext, id: string | null): string {
  if (!id) return DASH;
  return ctx.branchNames[id] ?? DASH;
}

/** ชื่อลูกค้าพร้อมลิงก์ — ลูกค้าที่ RLS ไม่ให้อ่านจะไม่มีชื่อ แสดงเป็นขีดแทนที่จะทำให้แถวหาย */
function CustomerCell({ ctx, customerId }: { ctx: DetailContext; customerId: string | null }) {
  const c = customerId ? ctx.customers.get(customerId) : null;
  if (!c) {
    return (
      <span className="is-null">
        {DASH}
        <span className="cell-sub">อยู่นอกขอบเขตที่คุณเปิดดูได้</span>
      </span>
    );
  }
  return (
    <>
      <Link className="nowrap" href={`/customers/${c.customer_no}`}>
        {c.display_name ?? c.customer_no}
      </Link>
      <span className="cell-sub code">{c.customer_no}</span>
    </>
  );
}

function Footer({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="t-sm t-muted" style={{ marginTop: "var(--space-3)" }}>
      {showing(shown, total, { unit: "รายการ" })}
      {shown < total ? " · แก้รายการที่แสดงอยู่แล้วรายการถัดไปจะขึ้นมาแทน" : ""}
    </p>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="table table--compact">
        <thead>
          <tr>
            {head.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------- DUPLICATE_SUSPECTED */

function customerSummary(ctx: DetailContext, c: CustomerBrief | null, title: string) {
  const phones = c ? (ctx.phones.get(c.id) ?? []) : [];
  const phone = phones.find((p) => p.is_primary) ?? phones[0];
  return (
    <div className="dq-side">
      <span className="dq-side__label">{title}</span>
      {c ? (
        <>
          <div>
            <Link className="t-medium" href={`/customers/${c.customer_no}`}>
              {c.display_name ?? c.customer_no}
            </Link>
            <span className="cell-sub code">{c.customer_no}</span>
          </div>
          <dl className="dq-dl">
            {/* เบอร์แสดงเป็นค่าปิดบังเสมอ · ค่าเต็มมีทางเดียวคือ api.reveal_contact ซึ่งหน้านี้ไม่มีปุ่ม */}
            <dt>เบอร์ (ปิดบัง)</dt>
            <dd>{phone?.masked ?? DASH}</dd>
            <dt>สาขาแรก</dt>
            <dd>{branchName(ctx, c.first_branch_id)}</dd>
            <dt>รู้จักครั้งแรก</dt>
            <dd>{c.first_seen_at ? dateTime(c.first_seen_at) : DASH}</dd>
            <dt>ผู้ดูแล</dt>
            <dd>{staffName(ctx, c.owner_staff_id)}</dd>
          </dl>
        </>
      ) : (
        <p className="t-sm is-null">{DASH} อยู่นอกขอบเขตที่คุณเปิดดูได้</p>
      )}
    </div>
  );
}

function DuplicateSection({ ctx, rows, total }: { ctx: DetailContext; rows: IssueRow[]; total: number }) {
  const shown = rows.slice(0, ROWS_SHOWN);

  return (
    <div className="stack">
      {shown.map((row) => {
        const d = ctx.duplicates.get(row.entity_id);
        if (!d) {
          return (
            <p className="state-bar" role="note" key={row.entity_id}>
              รายการนี้อยู่นอกขอบเขตที่คุณเปิดดูรายละเอียดได้
            </p>
          );
        }
        const state = duplicateDecisionState(ctx.access, d.created_by);
        const canSeeBoth = d.newer !== null && d.existing !== null;
        const fields: MergeField[] = canSeeBoth
          ? [
              { key: "first_name", label: "ชื่อ", newerValue: d.newer?.first_name ?? "", existingValue: d.existing?.first_name ?? "" },
              { key: "last_name", label: "นามสกุล", newerValue: d.newer?.last_name ?? "", existingValue: d.existing?.last_name ?? "" },
              { key: "nickname", label: "ชื่อเล่น", newerValue: d.newer?.nickname ?? "", existingValue: d.existing?.nickname ?? "" },
              {
                key: "province_code",
                label: "จังหวัด",
                newerValue: d.newer?.province_code ? (ctx.provinceLabels[d.newer.province_code] ?? d.newer.province_code) : "",
                existingValue: d.existing?.province_code
                  ? (ctx.provinceLabels[d.existing.province_code] ?? d.existing.province_code)
                  : "",
              },
            ]
          : [];

        return (
          <article className="card" key={d.decision_id} aria-label={`คู่ลูกค้าที่อาจซ้ำ ${d.newer?.customer_no ?? ""}`}>
            <div className="dq-pair">
              {customerSummary(ctx, d.newer, "ลูกค้าที่สร้างใหม่")}
              <div className="dq-mid">
                <span className="t-xs t-muted">คะแนนความคล้าย</span>
                <span className="dq-score">{d.score === null ? DASH : int(d.score)}</span>
                <span>{d.matched_rules.length > 0 ? d.matched_rules.join(" · ") : DASH}</span>
                <span className="t-xs">
                  สร้างโดย {staffName(ctx, d.created_by)} · {d.created_at ? date(d.created_at) : DASH}
                </span>
              </div>
              {customerSummary(ctx, d.existing, "ลูกค้าที่มีอยู่เดิม")}
            </div>

            {/* ไม่ใช้ .dq-actions ของ prototype เพราะที่นั่นปุ่มเปิดกล่องโต้ตอบ
                ส่วนที่นี่ฟอร์มกางในที่เดิม การวางเรียงลงมาจึงอ่านง่ายกว่าเรียงชิดขวา */}
            <div className="stack" style={{ marginTop: "var(--space-4)" }}>
              {state.visible && canSeeBoth && d.newer && d.existing ? (
                <>
                  <NotDuplicateForm decisionId={d.decision_id} blockedReason={state.reason} />
                  <MergeForm
                    decisionId={d.decision_id}
                    newer={{
                      id: d.newer.id,
                      customerNo: d.newer.customer_no,
                      name: d.newer.display_name ?? d.newer.customer_no,
                    }}
                    existing={{
                      id: d.existing.id,
                      customerNo: d.existing.customer_no,
                      name: d.existing.display_name ?? d.existing.customer_no,
                    }}
                    fields={fields}
                    blockedReason={state.reason}
                  />
                </>
              ) : (
                <p className="t-sm t-muted">
                  {state.visible
                    ? "ต้องเปิดดูลูกค้าได้ทั้งสองรายจึงจะตัดสินได้"
                    : "บทบาทของคุณดูรายการนี้ได้ แต่ไม่มีสิทธิ์รวมลูกค้าหรือยืนยันว่าคนละคน"}
                </p>
              )}
            </div>
          </article>
        );
      })}
      <Footer shown={shown.length} total={total} />
    </div>
  );
}

/* ------------------------------------------------------------- ตารางอื่น ๆ */

function PhoneSection({
  ctx,
  rows,
  total,
  mode,
}: {
  ctx: DetailContext;
  rows: IssueRow[];
  total: number;
  mode: "MISSING" | "INVALID";
}) {
  const shown = rows.slice(0, ROWS_SHOWN);
  const permission = ISSUE_FIX_PERMISSION[mode === "MISSING" ? "MISSING_PHONE" : "INVALID_PHONE"];

  return (
    <>
      <Table head={["ลูกค้า", mode === "MISSING" ? "ช่องทางแรก" : "เบอร์ปิดบัง", "สาขาแรก", "ผู้ดูแล", "การกระทำ"]}>
        {shown.map((row) => {
          const c = row.customer_id ? ctx.customers.get(row.customer_id) : null;
          const phones = row.customer_id ? (ctx.phones.get(row.customer_id) ?? []) : [];
          const invalid = phones.find((p) => !p.is_valid) ?? null;
          const state = rowActionState(ctx.access, permission, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              <td>
                {mode === "MISSING"
                  ? c?.first_channel_code
                    ? (ctx.channelLabels[c.first_channel_code] ?? c.first_channel_code)
                    : DASH
                  : (invalid?.masked ?? DASH)}
              </td>
              <td>{branchName(ctx, row.branch_id)}</td>
              <td>{staffName(ctx, row.owner_staff_id)}</td>
              <td>
                {state.visible && row.customer_id ? (
                  <PhoneForm
                    customerId={row.customer_id}
                    contactId={mode === "INVALID" ? (invalid?.contact_id ?? null) : null}
                    currentMasked={mode === "INVALID" ? (invalid?.masked ?? null) : null}
                    blockedReason={state.reason}
                  />
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

function IncompleteSection({ ctx, rows, total }: { ctx: DetailContext; rows: IssueRow[]; total: number }) {
  const shown = rows.slice(0, ROWS_SHOWN);
  return (
    <>
      <Table head={["ลูกค้า", "ช่องที่ขาด", "สาขาแรก", "ผู้ดูแล", "การกระทำ"]}>
        {shown.map((row) => {
          const state = rowActionState(ctx.access, ISSUE_FIX_PERMISSION.INCOMPLETE_CUSTOMER, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              {/* เงื่อนไขของข้อ 12.3 บังคับให้ขาดครบทั้งสามอย่างพร้อมกัน จึงเขียนคงที่ได้ */}
              <td>นามสกุล · จังหวัด · ความสนใจ</td>
              <td>{branchName(ctx, row.branch_id)}</td>
              <td>{staffName(ctx, row.owner_staff_id)}</td>
              <td>
                {state.visible && row.customer_id ? (
                  <CompleteCustomerForm
                    customerId={row.customer_id}
                    provinces={ctx.provinces}
                    blockedReason={state.reason}
                  />
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

function LeadSection({
  ctx,
  rows,
  total,
  mode,
}: {
  ctx: DetailContext;
  rows: IssueRow[];
  total: number;
  mode: "OWNER" | "OUTCOME";
}) {
  const shown = rows.slice(0, ROWS_SHOWN);
  const permission = ISSUE_FIX_PERMISSION[mode === "OWNER" ? "LEAD_WITHOUT_OWNER" : "LEAD_WITHOUT_OUTCOME"];

  return (
    <>
      <Table head={["เลข Lead", "ลูกค้า", "สถานะ", "สร้างเมื่อ", mode === "OWNER" ? "ช่องทาง" : "ผู้รับผิดชอบ", "การกระทำ"]}>
        {shown.map((row) => {
          const lead = ctx.leads.get(row.entity_id) ?? null;
          const state = rowActionState(ctx.access, permission, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td className="code">{lead?.lead_no ?? DASH}</td>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              <td>{lead ? (LEAD_STATUS_LABEL[lead.status] ?? lead.status) : DASH}</td>
              <td>{row.detected_at ? date(row.detected_at) : DASH}</td>
              <td>
                {mode === "OWNER"
                  ? lead?.channel_code
                    ? (ctx.channelLabels[lead.channel_code] ?? lead.channel_code)
                    : DASH
                  : staffName(ctx, lead?.owner_staff_id ?? null)}
              </td>
              <td>
                {state.visible ? (
                  mode === "OWNER" ? (
                    <AssignLeadForm
                      leadId={row.entity_id}
                      candidates={ctx.assignCandidates}
                      reasons={ctx.ownershipReasons}
                      blockedReason={state.reason}
                    />
                  ) : (
                    <CloseLeadForm
                      leadId={row.entity_id}
                      lostReasons={ctx.lostReasons}
                      blockedReason={state.reason}
                    />
                  )
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

function TaskSection({ ctx, rows, total }: { ctx: DetailContext; rows: IssueRow[]; total: number }) {
  const shown = rows.slice(0, ROWS_SHOWN);
  return (
    <>
      <Table head={["ชื่องาน", "ลูกค้า", "ครบกำหนด", "ผู้รับผิดชอบ", "การกระทำ"]}>
        {shown.map((row) => {
          const task = ctx.tasks.get(row.entity_id) ?? null;
          const state = rowActionState(ctx.access, ISSUE_FIX_PERMISSION.OVERDUE_FOLLOWUP, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td>
                <span className="t-medium">{task?.title ?? DASH}</span>
                <span className="cell-sub code">{task?.task_no ?? DASH}</span>
              </td>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              <td>{task?.due_at ? dateTime(task.due_at) : DASH}</td>
              <td>{staffName(ctx, row.owner_staff_id)}</td>
              <td>
                {state.visible ? <CompleteTaskForm taskId={row.entity_id} blockedReason={state.reason} /> : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

function OpportunitySection({ ctx, rows, total }: { ctx: DetailContext; rows: IssueRow[]; total: number }) {
  const shown = rows.slice(0, ROWS_SHOWN);
  return (
    <>
      <Table head={["เลขโอกาสขาย", "ลูกค้า", "ปิดการขายเมื่อ", "ยอด", "การกระทำ"]}>
        {shown.map((row) => {
          const opp = ctx.opportunities.get(row.entity_id) ?? null;
          const amount = opp === null ? null : opp.won_amount;
          const state = rowActionState(ctx.access, ISSUE_FIX_PERMISSION.WON_WITHOUT_TRANSACTION, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td className="code">{opp?.opportunity_no ?? DASH}</td>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              <td>{opp?.won_at ? dateTime(opp.won_at) : DASH}</td>
              <td className="num">{amount === null ? DASH : money(amount)}</td>
              <td>
                {state.visible && opp && row.customer_id && row.branch_id ? (
                  <LinkTransactionForm
                    opportunityId={opp.id}
                    customerId={row.customer_id}
                    branchId={row.branch_id}
                    transactionTypes={ctx.transactionTypes}
                    blockedReason={state.reason}
                  />
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

function VisitSection({ ctx, rows, total }: { ctx: DetailContext; rows: IssueRow[]; total: number }) {
  const shown = rows.slice(0, ROWS_SHOWN);
  return (
    <>
      <Table head={["เลขการให้บริการ", "ลูกค้า", "สาขา", "วันที่", "ผู้รับ", "การกระทำ"]}>
        {shown.map((row) => {
          const visit = ctx.visits.get(row.entity_id) ?? null;
          const state = rowActionState(ctx.access, ISSUE_FIX_PERMISSION.VISIT_UNRECORDED, row.branch_id);
          return (
            <tr key={row.entity_id}>
              <td className="code">{visit?.visit_no ?? DASH}</td>
              <td>
                <CustomerCell ctx={ctx} customerId={row.customer_id} />
              </td>
              <td>{branchName(ctx, row.branch_id)}</td>
              <td>{row.detected_at ? dateTime(row.detected_at) : DASH}</td>
              <td>{staffName(ctx, row.owner_staff_id)}</td>
              <td>
                {state.visible ? <AckVisitForm visitId={row.entity_id} blockedReason={state.reason} /> : null}
              </td>
            </tr>
          );
        })}
      </Table>
      <Footer shown={shown.length} total={total} />
    </>
  );
}

/* ------------------------------------------------------------------ ทางเข้า */

export function IssueDetail({
  ctx,
  code,
  rows,
  total,
}: {
  ctx: DetailContext;
  code: IssueCode;
  rows: IssueRow[];
  total: number;
}) {
  if (total === 0 || rows.length === 0) {
    return (
      <div className="state state--compact">
        <p className="state__title">ไม่มีรายการ</p>
        <p className="state__text">ไม่มี{ISSUE_LABEL[code]}ในขอบเขตที่คุณดูได้</p>
      </div>
    );
  }

  switch (code) {
    case "DUPLICATE_SUSPECTED":
      return <DuplicateSection ctx={ctx} rows={rows} total={total} />;
    case "MISSING_PHONE":
      return <PhoneSection ctx={ctx} rows={rows} total={total} mode="MISSING" />;
    case "INVALID_PHONE":
      return <PhoneSection ctx={ctx} rows={rows} total={total} mode="INVALID" />;
    case "INCOMPLETE_CUSTOMER":
      return <IncompleteSection ctx={ctx} rows={rows} total={total} />;
    case "LEAD_WITHOUT_OWNER":
      return <LeadSection ctx={ctx} rows={rows} total={total} mode="OWNER" />;
    case "LEAD_WITHOUT_OUTCOME":
      return <LeadSection ctx={ctx} rows={rows} total={total} mode="OUTCOME" />;
    case "OVERDUE_FOLLOWUP":
      return <TaskSection ctx={ctx} rows={rows} total={total} />;
    case "WON_WITHOUT_TRANSACTION":
      return <OpportunitySection ctx={ctx} rows={rows} total={total} />;
    case "VISIT_UNRECORDED":
      return <VisitSection ctx={ctx} rows={rows} total={total} />;
  }
}
