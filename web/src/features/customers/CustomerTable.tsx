import Link from "next/link";
import type { ReactNode } from "react";

import { dateTime } from "@/lib/format/date";
import { DASH, int, showing } from "@/lib/format/number";

import {
  BADGE_LABEL,
  BADGE_MAX,
  BADGE_ORDER,
  BADGE_TONE,
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  initials,
  polite,
} from "./labels";
import type { CustomerRefs, CustomerRow } from "./types";

/* ตารางรายการลูกค้า (sitemap-screen-specs ข้อ 6.4 · 6.5)

   ใช้ทั้งฝั่งเซิร์ฟเวอร์ (รายการปกติ) และฝั่ง client (ผลค้นหา) จึงต้องไม่ import อะไรที่เป็น server-only
   บนจอแคบกว่า 768px ตารางถูกซ่อนแล้วแสดงเป็นการ์ดแทน — คลาส .data-table--cards ของ app.css เป็นผู้สลับ

   เบอร์ที่แสดงเป็นค่าปิดบังที่ฐานข้อมูลคำนวณมาแล้ว และหน้านี้ไม่มีปุ่มเปิดดูค่าเต็ม (D33) */

function Badges({ row }: { row: CustomerRow }) {
  const stage = LIFECYCLE_LABEL[row.lifecycle_stage];
  const picked = BADGE_ORDER.filter((b) => row.badges.includes(b));
  const shown = picked.slice(0, BADGE_MAX);
  const hidden = picked.slice(BADGE_MAX);

  if (!stage && shown.length === 0) return <span className="is-null">{DASH}</span>;

  return (
    <span className="badge-row">
      {stage ? (
        <span className={`badge badge--lifecycle ${LIFECYCLE_TONE[row.lifecycle_stage] ?? "badge--neutral"}`}>
          {stage}
        </span>
      ) : null}
      {shown.map((b) => (
        <span className={`badge badge--supp ${BADGE_TONE[b]}`} key={b}>
          {BADGE_LABEL[b]}
        </span>
      ))}
      {hidden.length ? (
        <span className="badge badge--more" aria-label={`ป้ายเพิ่มเติม: ${hidden.map((b) => BADGE_LABEL[b]).join(" · ")}`}>
          +{hidden.length}
        </span>
      ) : null}
    </span>
  );
}

function ChannelCell({ code, refs }: { code: string | null; refs: CustomerRefs }) {
  if (!code) return <span className="is-null">{DASH}</span>;
  return (
    <span className="row nowrap" style={{ gap: "var(--space-1)" }}>
      <span className="channel-dot has-channel" data-channel={code} aria-hidden="true" />
      {refs.channelLabels[code] ?? code}
    </span>
  );
}

export function CustomerTable({
  rows,
  refs,
  total,
  from,
  pagination,
  caption = "รายการลูกค้า",
}: {
  rows: CustomerRow[];
  refs: CustomerRefs;
  total: number | null;
  from: number;
  pagination?: ReactNode;
  caption?: string;
}) {
  return (
    <div className="card card--flush cust-table">
      <div className="data-table--cards">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="col-hide-tablet">
                  #
                </th>
                <th scope="col">รหัสลูกค้า</th>
                <th scope="col">ชื่อลูกค้า</th>
                <th scope="col">เบอร์โทร</th>
                <th scope="col" className="col-hide-tablet">
                  ช่องทางล่าสุด
                </th>
                <th scope="col">สถานะ</th>
                <th scope="col">สาขา</th>
                <th scope="col">ติดต่อล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="col-hide-tablet num">{int(from + i)}</td>
                  <td>
                    <Link className="nowrap" href={`/customers/${r.customer_no}`}>
                      {r.customer_no}
                    </Link>
                  </td>
                  <td>
                    <span className="cust-name">
                      <span className="avatar avatar--sm" aria-hidden="true">
                        {initials(r.display_name)}
                      </span>
                      {polite(r.display_name) ?? DASH}
                      {r.last_channel_code ? (
                        <span
                          className="cust-ch-tablet"
                          role="img"
                          aria-label={`ช่องทางล่าสุด ${refs.channelLabels[r.last_channel_code] ?? r.last_channel_code}`}
                        >
                          <span className="channel-dot has-channel" data-channel={r.last_channel_code} />
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {r.phone_masked ? (
                      <span className="num nowrap">{r.phone_masked}</span>
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>
                  <td className="col-hide-tablet">
                    <ChannelCell code={r.last_channel_code} refs={refs} />
                  </td>
                  <td>
                    <Badges row={r} />
                  </td>
                  <td>
                    {r.last_branch_id && refs.branchNames[r.last_branch_id] ? (
                      <span className="nowrap">{refs.branchNames[r.last_branch_id]}</span>
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>
                  <td>
                    {r.last_activity_at ? (
                      <span className="nowrap num">{dateTime(r.last_activity_at)}</span>
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* จอมือถือ: การ์ดแทนตาราง · ไม่มี checkbox เพราะการกระทำหลายรายการใช้บนเดสก์ท็อปเท่านั้น */}
        <div className="list-cards">
          {rows.map((r) => (
            <Link className="list-card" href={`/customers/${r.customer_no}`} key={r.id}>
              <span className="avatar avatar--sm" aria-hidden="true">
                {initials(r.display_name)}
              </span>
              <span className="list-card__main">
                <span className="list-card__title">{polite(r.display_name) ?? DASH}</span>
                <span className="list-card__meta">
                  {r.customer_no} · {r.phone_masked ?? DASH}
                </span>
                <span className="list-card__meta">
                  {(r.last_channel_code ? (refs.channelLabels[r.last_channel_code] ?? r.last_channel_code) : DASH) +
                    " · " +
                    (r.last_branch_id ? (refs.branchNames[r.last_branch_id] ?? DASH) : DASH) +
                    " · " +
                    dateTime(r.last_activity_at)}
                </span>
                <Badges row={r} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="pagination">
        <span>{showing(rows.length, total, { unit: "รายการ", from })}</span>
        {pagination}
      </div>
    </div>
  );
}
