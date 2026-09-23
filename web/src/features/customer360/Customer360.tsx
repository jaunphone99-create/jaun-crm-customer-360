"use client";

import Link from "next/link";
import { useState } from "react";

import { date as thaiDate, dateTime as thaiDateTime } from "@/lib/format/date";
import { DASH, int, moneyTable } from "@/lib/format/number";

import { ContactList } from "./ContactList";
import { Timeline } from "./Timeline";
import {
  CONSENT_CHANNEL_LABEL,
  CONSENT_STATUS,
  INTEREST_LEVEL,
  LIFECYCLE,
  SUPPLEMENTARY,
  SUPPLEMENTARY_MAX,
  type Customer360Access,
  type Customer360Data,
} from "./types";

/* หน้า 05 · ข้อมูลลูกค้า (Customer 360)

   ทั้งหน้าถูกวาดจากข้อมูลชุดเดียวที่ server ดึงมาให้แล้ว การสลับแท็บและการกรองไทม์ไลน์
   จึงไม่ยิงฐานข้อมูลใหม่ — เหตุผลไม่ใช่ความเร็ว แต่เพราะ api.get_customer_360 เขียน audit
   CUSTOMER_VIEWED ทุกครั้งที่ถูกเรียก ถ้าโหลดใหม่ทุกคลิก ประวัติการเข้าถึงจะเต็มไปด้วยรายการปลอม
   (sitemap-screen-specs ข้อ 8.9 "หนึ่งครั้งต่อการโหลด ไม่นับการสลับแท็บ")

   ชื่อ class ทั้งหมดมาจาก generated/app.css + generated/page-customer-360.css ซึ่งสร้างจาก prototype */

/** อักษรย่อบนวงกลม (C-AVATAR · design-system ข้อ 7.5) — ข้ามสระหน้า เ แ โ ใ ไ */
function initials(name: string): string {
  const words = name.replace(/^คุณ/, "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const out = words
    .map((w) => {
      for (const ch of w) {
        if (!"เแโใไ".includes(ch)) return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
      }
      return "";
    })
    .join("");
  return out || "?";
}

type TabId = "overview" | "history" | "notes" | "audit";

/* แท็บที่ยังเปิดไม่ได้ใน Phase 1 — แสดงไว้ให้เห็นว่ามีและกำลังจะมา ดีกว่าซ่อนจนพนักงานคิดว่าไม่มี
   Lead · โอกาสขาย · ใบเสนอราคา · งานติดตาม อยู่ Phase 2 ทั้งชุด (CANONICAL ข้อ 20.3 · 20.12)
   "การซื้อและบริการ" กับ "เอกสาร" พึ่งโอกาสขาย/ใบเสนอราคาเป็นแหล่งข้อมูลหลัก จึงรอไปด้วยกัน */
const PHASE2_TABS = ["การซื้อและบริการ", "งานและโอกาสขาย", "เอกสาร"];

export function Customer360({
  data,
  access,
  mergedFrom,
}: {
  data: Customer360Data;
  access: Customer360Access;
  /** เปิดมาจาก customer_no ที่ถูกรวมเข้ากับรายนี้ (CANONICAL ข้อ 6.7) */
  mergedFrom?: string;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  const { detail, timeline, notes, history, staffNames, branchNames, timelineTruncated, notesTruncated } = data;
  const h = detail.header;
  const anonymized = h.record_status === "ANONYMIZED";
  /* ลูกค้าที่ยังไม่รู้ชื่อมีได้จริง (Capture First) — อย่าเติมคำว่า "คุณ" หน้ารหัสลูกค้า
     เพราะจะได้ "คุณCUS-2026-000123" ซึ่งอ่านแล้วเหมือนระบบพัง */
  const displayName = h.display_name ?? null;
  const fullName = anonymized
    ? `ลูกค้านิรนาม ${h.customer_no}`
    : displayName
      ? `คุณ${displayName}`
      : `ลูกค้า ${h.customer_no} (ยังไม่ระบุชื่อ)`;

  const lifecycle = h.lifecycle_stage ? LIFECYCLE[h.lifecycle_stage] : null;
  const badges = SUPPLEMENTARY.filter((b) => h.badges?.[b.key]);
  const shownBadges = badges.slice(0, SUPPLEMENTARY_MAX);
  const hiddenBadges = badges.slice(SUPPLEMENTARY_MAX);

  const pinned = detail.pinned_notes[0] ?? null;
  const followup = detail.next_followup;
  const ownerName = h.owner_staff_id ? (staffNames[h.owner_staff_id] ?? h.owner_display_name) : null;

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: "overview", label: "ภาพรวม" },
    { id: "history", label: "ประวัติการติดต่อ", count: timeline.length },
    { id: "notes", label: "โน้ต", count: notes.length },
  ];
  if (detail.tabs.can_view_history) tabs.push({ id: "audit", label: "ประวัติการแก้ไข" });

  return (
    <>
      <Link className="c360-back" href="/customers">
        ← ลูกค้า
      </Link>

      {mergedFrom ? (
        <div className="alert" role="status" style={{ marginBottom: "var(--space-3)" }}>
          <div>ลูกค้า {mergedFrom} ถูกรวมเข้ากับ {h.customer_no}</div>
        </div>
      ) : null}

      {anonymized ? (
        <div className="state-bar state-bar--locked" role="status" style={{ marginBottom: "var(--space-3)" }}>
          ข้อมูลส่วนบุคคลของลูกค้ารายนี้ถูกทำให้เป็นนิรนามแล้ว
        </div>
      ) : null}

      {h.legal_hold ? (
        <div className="state-bar state-bar--locked" role="status" style={{ marginBottom: "var(--space-3)" }}>
          ลูกค้ารายนี้อยู่ระหว่างระงับการลบตามกฎหมาย
        </div>
      ) : null}

      <header className="card c360-head">
        <span className="avatar avatar--lg" aria-hidden="true">
          {initials(fullName)}
        </span>
        <div className="c360-head__main">
          <span className="code">{h.customer_no}</span>
          <h1 className="c360-head__name">{fullName}</h1>
          <span className="badge-row">
            {lifecycle ? (
              <span className={`badge ${lifecycle.tone} badge--lifecycle`}>{lifecycle.label}</span>
            ) : null}
            {shownBadges.map((b) => (
              <span
                key={b.key}
                className={`badge ${b.tone} badge--supp${b.key === "vip" ? " badge--vip" : ""}`}
              >
                {b.label}
              </span>
            ))}
            {hiddenBadges.length ? (
              <span className="badge badge--more" aria-label={`ป้ายเพิ่มเติม: ${hiddenBadges.map((b) => b.label).join(" · ")}`}>
                +{hiddenBadges.length}
              </span>
            ) : null}
          </span>
        </div>

        {/* "รวมลูกค้าซ้ำ" แสดงเฉพาะผู้ที่มีสิทธิ์จริง แต่ Phase 1 ยังไม่มีขั้นตอนรวม จึงปิดพร้อมบอกเหตุผล
            ปุ่มที่กดแล้วไม่เกิดอะไรทำให้คนเลิกเชื่อหน้าจอ — บอกตรง ๆ ว่ายังไม่เปิดดีกว่า */}
        {access.canMerge || access.mergeNeedsMfa ? (
          <div className="c360-head__actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled
              title={
                access.canMerge
                  ? "ขั้นตอนรวมลูกค้าเปิดใช้ใน Phase 2"
                  : "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน"
              }
            >
              รวมลูกค้าซ้ำ
            </button>
          </div>
        ) : null}
      </header>

      <div className="c360-layout">
        <aside className="card c360-side" aria-label="ข้อมูลลูกค้า">
          <section aria-labelledby="c360-contacts">
            <h2 id="c360-contacts">ช่องทางติดต่อ</h2>
            {anonymized ? (
              <p className="t-sm t-muted">ไม่มีช่องทางติดต่อ</p>
            ) : (
              <ContactList
                contacts={detail.contacts}
                canReveal={access.canReveal}
                revealNeedsMfa={access.revealNeedsMfa}
              />
            )}
          </section>

          <dl className="c360-dl">
            <div>
              <dt>จังหวัด</dt>
              <dd>{data.provinceLabel ?? DASH}</dd>
            </div>
            <div>
              <dt>แหล่งที่มา</dt>
              <dd>{data.sourceLabel ? `รู้จักร้านจาก${data.sourceLabel}` : DASH}</dd>
            </div>
            <div>
              <dt>อายุลูกค้า</dt>
              <dd>
                {detail.counters.months_as_customer == null
                  ? DASH
                  : `เป็นลูกค้ามา ${int(detail.counters.months_as_customer)} เดือน`}
              </dd>
            </div>
            {detail.addresses.length ? (
              <div>
                <dt>ที่อยู่</dt>
                <dd>
                  {detail.addresses.map((a) => (
                    <span key={a.address_id} style={{ display: "block" }}>
                      {a.value_masked ?? DASH}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Tag</dt>
              <dd>
                {detail.tags.length ? (
                  <span className="c360-tags">
                    {detail.tags.map((t) => (
                      <span className="chip c360-tag" key={t.code}>
                        {t.label_th}
                      </span>
                    ))}
                  </span>
                ) : (
                  DASH
                )}
              </dd>
            </div>
            <div>
              <dt>สาขาที่เคยใช้บริการ</dt>
              <dd>{detail.branches.length ? detail.branches.map((b) => b.name_th).join(" · ") : DASH}</dd>
            </div>
            <div>
              <dt>ผู้ดูแล</dt>
              <dd>{ownerName ?? DASH}</dd>
            </div>
            <div>
              <dt>โน้ตที่ปักหมุด</dt>
              <dd>
                {pinned ? (
                  <>
                    {pinned.body}
                    <span className="cell-sub t-xs t-muted" style={{ display: "block" }}>
                      {[pinned.created_by ? staffNames[pinned.created_by] : null, thaiDate(pinned.created_at)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : (
                  "ยังไม่มีโน้ตที่ปักหมุด"
                )}
              </dd>
            </div>
            <div>
              <dt>นัดติดตามถัดไป</dt>
              <dd>
                {followup ? (
                  <>
                    {[
                      thaiDateTime(followup.next_action_at),
                      followup.next_action,
                      followup.owner_staff_id ? staffNames[followup.owner_staff_id] : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    <span className="badge badge--neutral badge--square" style={{ marginInlineStart: "var(--space-1)" }}>
                      เปิดใช้ใน Phase 2
                    </span>
                  </>
                ) : (
                  "ยังไม่มีนัดติดตาม"
                )}
              </dd>
            </div>
          </dl>
        </aside>

        <div className="c360-main">
          <div className="c360-stats" role="group" aria-label="ตัวเลขสรุป">
            <Stat value={int(detail.counters.interaction_count)} unit="ครั้ง" label="จำนวนการติดต่อ" />
            <Stat value={int(detail.counters.walk_in_count)} unit="ครั้ง" label="จำนวนครั้งเข้าร้าน" />
            <Stat value={int(detail.counters.purchase_count)} unit="ครั้ง" label="จำนวนการซื้อ" />
            <Stat value={moneyTable(detail.counters.purchase_amount)} label="ยอดซื้อสะสม (บาท)" />
          </div>
          <p className="t-xs t-muted" style={{ marginTop: "var(--space-1)" }}>
            ตัวเลขทั้งสี่ช่องมาจาก <code>api.get_customer_360</code> — หน้าจอไม่คำนวณเอง
          </p>

          <div className="tabs" role="tablist" aria-label="ข้อมูลลูกค้า" style={{ marginTop: "var(--space-4)" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tab"
                role="tab"
                id={`c360-tab-${t.id}`}
                aria-controls={`c360-panel-${t.id}`}
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count === undefined ? null : <span className="tab__count">{int(t.count)}</span>}
              </button>
            ))}
            {PHASE2_TABS.map((label) => (
              <button key={label} type="button" className="tab" disabled aria-disabled="true" title="เปิดใช้ใน Phase 2">
                {label}
                <span className="tab__count">Phase 2</span>
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="tabpanel" role="tabpanel" id="c360-panel-overview" aria-labelledby="c360-tab-overview">
              <div className="c360-grid">
                <section className="card c360-block">
                  <div className="row-between" style={{ marginBottom: "var(--space-2)" }}>
                    <h3>ไทม์ไลน์ล่าสุด</h3>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab("history")}>
                      ดูทั้งหมด
                    </button>
                  </div>
                  <Timeline
                    items={timeline}
                    limit={3}
                    channels={data.channels}
                    interactionTypes={data.interactionTypes}
                    visitOutcomes={data.visitOutcomes}
                    staffNames={staffNames}
                    branchNames={branchNames}
                  />
                </section>

                <section className="card c360-block">
                  <div className="row-between" style={{ marginBottom: "var(--space-2)" }}>
                    <h3>สินค้าที่สนใจ</h3>
                    <span className="badge badge--neutral badge--square">Phase 2</span>
                  </div>
                  {detail.interests.length ? (
                    <div className="c360-list">
                      {detail.interests.map((p, i) => {
                        const level = p.interest_level ? INTEREST_LEVEL[p.interest_level] : null;
                        return (
                          <div className="c360-item" key={`${p.entity_ref ?? "x"}-${i}`}>
                            <div className="c360-item__head">
                              <span className="c360-item__title">{p.product_model ?? DASH}</span>
                              {level ? (
                                <span className={`badge ${level.tone} badge--square`}>{level.label}</span>
                              ) : null}
                            </div>
                            {p.entity_ref ? <span className="c360-item__meta code">{p.entity_ref}</span> : null}
                          </div>
                        );
                      })}
                      <p className="t-xs t-muted">
                        มาจาก Lead และโอกาสขายที่เปิดอยู่ · หน้าจอของทั้งสองอย่างเปิดใช้ใน Phase 2
                      </p>
                    </div>
                  ) : (
                    <p className="t-sm t-muted">ยังไม่มีสินค้าที่สนใจ</p>
                  )}
                </section>

                <section className="card c360-block">
                  <h3>ความยินยอม</h3>
                  {detail.consents.length ? (
                    <div className="c360-list">
                      {detail.consents.map((c) => {
                        const status = CONSENT_STATUS[c.status];
                        const purpose = data.consentPurposes.find((p) => p.code === c.purpose_code);
                        const meta = [
                          thaiDate(c.captured_at),
                          c.notice_version,
                          c.channels?.length
                            ? c.channels.map((ch) => CONSENT_CHANNEL_LABEL[ch] ?? ch).join(" · ")
                            : null,
                        ].filter(Boolean);
                        return (
                          <div className="c360-item" key={c.purpose_code}>
                            <div className="c360-item__head">
                              <span className="c360-item__title">{purpose?.label_th ?? c.purpose_code}</span>
                              {status ? (
                                <span className={`badge ${status.tone} badge--square`}>{status.label}</span>
                              ) : null}
                            </div>
                            <span className="c360-item__meta">{meta.join(" · ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="t-sm t-muted">ยังไม่มีบันทึกความยินยอม</p>
                  )}
                </section>

                <section className="card c360-block">
                  <h3>สาขาที่เกี่ยวข้อง</h3>
                  {detail.branches.length ? (
                    <div className="c360-list">
                      {detail.branches.map((b) => (
                        <div className="c360-item" key={b.branch_id}>
                          <div className="c360-item__head">
                            <span className="c360-item__title">{b.name_th}</span>
                            <span className="chip">{b.code}</span>
                          </div>
                          <span className="c360-item__meta">
                            {[
                              b.first_linked_at ? `เริ่มใช้บริการ ${thaiDate(b.first_linked_at)}` : null,
                              b.last_activity_at ? `ล่าสุด ${thaiDate(b.last_activity_at)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="t-sm t-muted">ยังไม่มีสาขาที่ผูกไว้</p>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {tab === "history" ? (
            <div className="tabpanel" role="tabpanel" id="c360-panel-history" aria-labelledby="c360-tab-history">
              <Timeline
                items={timeline}
                withFilters
                channels={data.channels}
                interactionTypes={data.interactionTypes}
                visitOutcomes={data.visitOutcomes}
                staffNames={staffNames}
                branchNames={branchNames}
              />
              <p className="t-xs t-muted" style={{ marginTop: "var(--space-2)" }}>
                {timelineTruncated
                  ? "แสดงเฉพาะรายการล่าสุด — ลูกค้ารายนี้มีประวัติยาวกว่าที่หน้านี้ดึงมา (ดูย้อนหลังทั้งหมดได้ใน Phase 2)"
                  : "ประวัติจากทุกสาขาของลูกค้ารายนี้ (อ่านอย่างเดียว) · interaction ของ visit ที่ยกเลิกไม่แสดง"}
              </p>
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="tabpanel" role="tabpanel" id="c360-panel-notes" aria-labelledby="c360-tab-notes">
              {notesTruncated ? (
                <p className="help">แสดงเฉพาะโน้ตล่าสุด — ลูกค้ารายนี้มีโน้ตมากกว่าที่หน้านี้ดึงมา</p>
              ) : null}
              {notes.length ? (
                notes.map((n) => (
                  <article className="c360-note" data-pinned={n.is_pinned} key={n.id}>
                    <div className="row-between">
                      <div className="badge-row">
                        {n.is_pinned ? <span className="badge badge--info badge--square">ปักหมุด</span> : null}
                        <span className="t-xs t-muted">
                          {[n.created_by ? staffNames[n.created_by] : null, thaiDate(n.created_at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>
                    <p className="t-sm" style={{ marginTop: "var(--space-1)", whiteSpace: "pre-wrap" }}>
                      {n.body}
                    </p>
                  </article>
                ))
              ) : (
                <div className="state state--compact">
                  <p className="state__title">ยังไม่มีโน้ต</p>
                </div>
              )}
              <p className="t-xs t-muted" style={{ marginTop: "var(--space-2)" }}>
                ไม่มีการลบโน้ต · แก้ไขได้ภายใน 24 ชั่วโมงหลังบันทึก (CANONICAL ข้อ 6.9)
              </p>
            </div>
          ) : null}

          {tab === "audit" ? (
            <div className="tabpanel" role="tabpanel" id="c360-panel-audit" aria-labelledby="c360-tab-audit">
              {history.length ? (
                <div className="table-wrap">
                  <table className="table table--compact">
                    <caption className="sr-only">ประวัติการแก้ไข</caption>
                    <thead>
                      <tr>
                        <th scope="col">เวลา</th>
                        <th scope="col">ผู้กระทำ</th>
                        <th scope="col">action</th>
                        <th scope="col">ช่องที่เปลี่ยน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((e) => (
                        <tr key={e.id}>
                          <td>{thaiDateTime(e.occurred_at)}</td>
                          <td>{[e.actor_staff_code, e.actor_label].filter(Boolean).join(" ") || DASH}</td>
                          <td>
                            <span className="code">{e.action}</span>
                          </td>
                          <td>{e.changed_fields?.length ? e.changed_fields.join(" · ") : DASH}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="state state--compact">
                  <p className="state__title">ยังไม่มีประวัติการแก้ไข</p>
                </div>
              )}
              <p className="t-xs t-muted" style={{ marginTop: "var(--space-2)" }}>
                ค่าก่อน/หลังที่ฐานข้อมูลคืนมาเป็นค่าปิดบังแล้ว — หน้าจอแสดงเฉพาะชื่อช่องที่เปลี่ยน
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="c360-stat">
      <span className="c360-stat__value">
        {value}
        {unit && value !== DASH ? <small>{unit}</small> : null}
      </span>
      <span className="c360-stat__label">{label}</span>
    </div>
  );
}
