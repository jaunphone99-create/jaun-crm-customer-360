"use client";

import { Fragment, useMemo, useState } from "react";

import { date as thaiDate, dayKey, time as thaiTime } from "@/lib/format/date";

import {
  DIRECTION_LABEL,
  VISIT_STATUS,
  type RefOption,
  type TimelineItem,
} from "./types";

/* ไทม์ไลน์การติดต่อ (C-TIMELINE)

   ป้ายช่องทางและประเภททั้งหมดมาจาก ref.channels / ref.interaction_types — ห้ามพิมพ์ไว้ในโค้ด
   เพราะ Master Data สองตารางนี้แก้ได้จากหน้าตั้งค่า ถ้า hardcode ไว้ป้ายจะเพี้ยนเงียบ ๆ

   ตัวกรองทำงานในเบราว์เซอร์ล้วน ไม่ยิงฐานข้อมูลใหม่ เพราะ api.get_customer_360
   เขียน audit CUSTOMER_VIEWED ทุกครั้งที่หน้าถูกโหลด — กรองแล้วโหลดใหม่จะได้ audit ปลอม ๆ เพิ่มทุกคลิก */

export function Timeline({
  items,
  channels,
  interactionTypes,
  visitOutcomes,
  staffNames,
  branchNames,
  limit,
  withFilters = false,
}: {
  items: TimelineItem[];
  channels: RefOption[];
  interactionTypes: RefOption[];
  visitOutcomes: RefOption[];
  staffNames: Record<string, string>;
  branchNames: Record<string, string>;
  /** ใช้ในแท็บ "ภาพรวม" ที่แสดงแค่ 3 รายการล่าสุด */
  limit?: number;
  withFilters?: boolean;
}) {
  const [pickedChannels, setPickedChannels] = useState<string[]>([]);
  const [pickedTypes, setPickedTypes] = useState<string[]>([]);

  const channelLabel = useMemo(
    () => Object.fromEntries(channels.map((c) => [c.code, c.label_th])),
    [channels]
  );
  const typeLabel = useMemo(
    () => Object.fromEntries(interactionTypes.map((t) => [t.code, t.label_th])),
    [interactionTypes]
  );
  const outcomeLabel = useMemo(
    () => Object.fromEntries(visitOutcomes.map((o) => [o.code, o.label_th])),
    [visitOutcomes]
  );

  const filtered = useMemo(() => {
    const rows = items.filter(
      (it) =>
        (pickedChannels.length === 0 || pickedChannels.includes(it.channelCode)) &&
        (pickedTypes.length === 0 || pickedTypes.includes(it.typeCode))
    );
    return limit ? rows.slice(0, limit) : rows;
  }, [items, pickedChannels, pickedTypes, limit]);

  const toggle = (list: string[], set: (v: string[]) => void, code: string) => {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  };

  const hasFilter = pickedChannels.length > 0 || pickedTypes.length > 0;

  let lastDay: string | null = null;

  return (
    <>
      {withFilters ? (
        <div className="c360-filters">
          <fieldset className="fieldset">
            <legend className="label">ช่องทาง</legend>
            <div className="chip-group">
              {channels.map((c) => (
                <label className="chip-option" key={c.code}>
                  <input
                    type="checkbox"
                    name="tl-ch"
                    value={c.code}
                    checked={pickedChannels.includes(c.code)}
                    onChange={() => toggle(pickedChannels, setPickedChannels, c.code)}
                  />
                  <span>{c.label_th}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="label">ประเภท</legend>
            <div className="chip-group">
              {interactionTypes.map((t) => (
                <label className="chip-option" key={t.code}>
                  <input
                    type="checkbox"
                    name="tl-type"
                    value={t.code}
                    checked={pickedTypes.includes(t.code)}
                    onChange={() => toggle(pickedTypes, setPickedTypes, t.code)}
                  />
                  <span>{t.label_th}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {hasFilter ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setPickedChannels([]);
                setPickedTypes([]);
              }}
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="state state--compact">
          <p className="state__title">
            {hasFilter ? "ไม่พบประวัติการติดต่อตามตัวกรอง" : "ยังไม่มีประวัติการติดต่อ"}
          </p>
        </div>
      ) : (
        <ol className="timeline" aria-label="ประวัติการติดต่อ">
          {filtered.map((it) => {
            const day = dayKey(it.at);
            const newDay = day !== lastDay;
            lastDay = day;
            const meta = [
              channelLabel[it.channelCode] ?? it.channelCode,
              it.direction ? DIRECTION_LABEL[it.direction] : null,
              it.branchId ? branchNames[it.branchId] : null,
            ].filter(Boolean);
            const owner = it.ownerStaffId ? staffNames[it.ownerStaffId] : null;
            const status = it.visitStatus ? VISIT_STATUS[it.visitStatus] : null;

            return (
              <Fragment key={it.key}>
                {newDay ? (
                  <li className="timeline__day" aria-hidden="true">
                    {thaiDate(it.at)}
                  </li>
                ) : null}
                <li className="timeline__item">
                  <span className="timeline__dot timeline__dot--ring" data-channel={it.channelCode} aria-hidden="true" />
                  <div>
                    <div className="timeline__head">
                      <span className="timeline__title">{typeLabel[it.typeCode] ?? it.typeCode}</span>
                      <time className="timeline__time" dateTime={it.at}>
                        {thaiTime(it.at, { suffix: false })}
                      </time>
                    </div>
                    <p className="timeline__meta">{meta.join(" · ")}</p>
                    {it.summary ? <p className="timeline__body">{it.summary}</p> : null}
                    {it.visitNo || status || it.visitOutcomeCode ? (
                      <div className="timeline__chips">
                        {it.visitNo ? <span className="chip">{it.visitNo}</span> : null}
                        {status ? (
                          <span className={`badge ${status.tone} badge--square`}>{status.label}</span>
                        ) : null}
                        {it.visitOutcomeCode ? (
                          <span className="chip">
                            {outcomeLabel[it.visitOutcomeCode] ?? it.visitOutcomeCode}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {owner ? <p className="timeline__meta">โดย {owner}</p> : null}
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </>
  );
}
