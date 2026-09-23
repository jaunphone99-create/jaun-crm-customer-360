"use client";

import { useActionState } from "react";

import { decideNotDuplicate, mergeDuplicate } from "./actions";
import { FixDisclosure } from "./Disclosure";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState } from "./types";

/* การตัดสินคู่ลูกค้าที่อาจซ้ำ (CANONICAL ข้อ 6.7 · 12.3)

   ทั้งสองฟอร์มเรียก RPC คนละตัวโดยตั้งใจ: api.merge_customers กับ api.decide_duplicate
   RPC ตัวหลังรับสถานะ NOT_DUPLICATE อย่างเดียว การรวมจึงเข้าทางนั้นไม่ได้แม้จะแก้ค่าในฟอร์มเอง

   ทั้งคู่ต้องมี customer.merge ซึ่งบังคับยืนยันตัวตนสองขั้นตอน และผู้ตัดสินต้องไม่ใช่ผู้สร้างรายการ —
   ฐานข้อมูลตรวจทั้งสองข้อเองทุกครั้ง ปุ่มที่ปิดไว้เป็นเรื่องของการไม่หลอกให้ผู้ใช้กรอกฟอร์มเปล่า ๆ */

/** ช่องที่เลือกได้ว่าจะเก็บค่าของรายไหนไว้ — ช่องที่ค่าตรงกันอยู่แล้วส่งมาด้วย แต่ไม่ต้องให้เลือก */
export type MergeField = {
  key: "first_name" | "last_name" | "nickname" | "province_code";
  label: string;
  newerValue: string;
  existingValue: string;
};

export type MergeSide = { id: string; customerNo: string; name: string };

export function MergeForm({
  decisionId,
  newer,
  existing,
  fields,
  blockedReason,
}: {
  decisionId: string;
  newer: MergeSide;
  existing: MergeSide;
  fields: MergeField[];
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mergeDuplicate, INITIAL_ACTION);
  const id = decisionId.slice(0, 8);

  return (
    <FixDisclosure
      label="รวมลูกค้า"
      title={`รวม ${newer.customerNo} กับ ${existing.customerNo}`}
      blockedReason={blockedReason}
      variant="danger"
    >
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="decision_id" value={decisionId} />
        <input type="hidden" name="newer_id" value={newer.id} />
        <input type="hidden" name="existing_id" value={existing.id} />
        <Feedback state={state} />

        {/* ผลที่ตามมา — ต้องอ่านได้ครบก่อนกดยืนยัน (ข้อกำหนดของงานนี้ ข้อ 4) */}
        <div className="alert" role="note">
          <span aria-hidden="true">i</span>
          <div>
            <p className="alert__title">รวมแล้วย้อนกลับไม่ได้ใน V1</p>
            <p className="t-sm">
              ช่องทางติดต่อ · การให้บริการ · การติดต่อ · Lead · โอกาสขาย · ใบเสนอราคา · งาน · เลขธุรกรรม · โน้ต ·
              ความยินยอม · Tag · สาขาที่เชื่อม จะย้ายไปอยู่กับลูกค้าที่เก็บไว้ทั้งหมด
            </p>
            <p className="t-sm">
              สาขาแรก · ช่องทางแรก · แหล่งที่มา · วันที่รู้จักครั้งแรก มาจากรายที่รู้จักก่อนเสมอ ไม่ใช่ตัวเลือกในฟอร์มนี้
            </p>
            <p className="t-sm">
              ลูกค้าที่ถูกรวมจะเปลี่ยนสถานะเป็น “รวมแล้ว” และการเปิดเลขเดิมจะพามาที่ลูกค้าที่เก็บไว้
            </p>
          </div>
        </div>

        <fieldset className="fieldset">
          <legend>เก็บเลขลูกค้าของรายไหนไว้</legend>
          <div className="checkbox-group">
            <label className="checkbox">
              <input type="radio" name="survivor" value="EXISTING" defaultChecked required />
              <span className="checkbox__text">
                {existing.customerNo} · {existing.name} (ลูกค้าที่มีอยู่เดิม)
              </span>
            </label>
            <label className="checkbox">
              <input type="radio" name="survivor" value="NEWER" />
              <span className="checkbox__text">
                {newer.customerNo} · {newer.name} (ลูกค้าที่สร้างใหม่)
              </span>
            </label>
          </div>
        </fieldset>

        {fields.map((f) => {
          const same = f.newerValue === f.existingValue;
          if (same) {
            return (
              <p className="t-sm" key={f.key}>
                <span className="t-muted">{f.label}: </span>
                {f.newerValue || "–"} <span className="t-muted">(เหมือนกันทั้งสองราย)</span>
              </p>
            );
          }
          return (
            <fieldset className="fieldset" key={f.key}>
              <legend>เก็บ{f.label}ของรายไหน</legend>
              <div className="checkbox-group checkbox-group--inline">
                <label className="checkbox">
                  <input type="radio" name={`pick_${f.key}`} value="EXISTING" defaultChecked />
                  <span className="checkbox__text">
                    {f.existingValue || "–"} ({existing.customerNo})
                  </span>
                </label>
                <label className="checkbox">
                  <input type="radio" name={`pick_${f.key}`} value="NEWER" />
                  <span className="checkbox__text">
                    {f.newerValue || "–"} ({newer.customerNo})
                  </span>
                </label>
              </div>
            </fieldset>
          );
        })}

        <div className="field">
          <label className="label" htmlFor={`merge-reason-${id}`}>
            เหตุผลที่รวม
          </label>
          <textarea
            className="input textarea"
            id={`merge-reason-${id}`}
            name="reason"
            rows={2}
            maxLength={500}
            required
          />
          <p className="help">เหตุผลถูกบันทึกลงประวัติการรวม · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
        </div>

        <label className="checkbox">
          <input type="checkbox" name="ack" />
          <span className="checkbox__text">ฉันเข้าใจว่าการรวมลูกค้าย้อนกลับไม่ได้</span>
        </label>

        <div className="row">
          <button type="submit" className="btn btn--danger btn--sm" disabled={pending}>
            {pending ? "กำลังรวม…" : "รวมลูกค้า"}
          </button>
        </div>
      </form>
    </FixDisclosure>
  );
}

export function NotDuplicateForm({
  decisionId,
  blockedReason,
}: {
  decisionId: string;
  blockedReason: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideNotDuplicate, INITIAL_ACTION);
  const id = decisionId.slice(0, 8);

  return (
    <FixDisclosure label="ยืนยันว่าคนละคน" title="ยืนยันว่าเป็นคนละคน" blockedReason={blockedReason}>
      <form action={action} className="stack" noValidate>
        <input type="hidden" name="decision_id" value={decisionId} />
        <Feedback state={state} />
        <p className="t-sm">สถานะของรายการจะเป็น “ยืนยันคนละคน” และจะไม่ถูกนับเป็นลูกค้าอาจซ้ำอีก</p>
        <div className="field">
          <label className="label" htmlFor={`nd-note-${id}`}>
            หมายเหตุ
          </label>
          <textarea className="input textarea" id={`nd-note-${id}`} name="note" rows={2} maxLength={500} required />
          <p className="help">อธิบายว่าอะไรทำให้มั่นใจว่าเป็นคนละคน · อย่าใส่ข้อมูลส่วนบุคคลของลูกค้า</p>
        </div>
        <div className="row">
          <button type="submit" className="btn btn--secondary btn--sm" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "ยืนยันว่าคนละคน"}
          </button>
        </div>
      </form>
    </FixDisclosure>
  );
}
