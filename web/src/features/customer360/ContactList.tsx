"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { revealContact } from "./actions";
import {
  CONTACT_TYPE_LABEL,
  INITIAL_REVEAL,
  type Customer360Contact,
  type RevealPurpose,
} from "./types";

/* ช่องทางติดต่อ (C-CONTACT · design-system ข้อ 7.9)

   ค่าที่ส่งมากับหน้าคือค่าปิดบังล้วน ๆ — ค่าเต็มมาทีหลังเมื่อผู้ใช้กดขอเท่านั้น
   และอยู่ใน state ชั่วคราวของคอมโพเนนต์นี้เท่านั้น ไม่เขียนลง storage ไม่ลง URL ไม่ log
   (CANONICAL ข้อ 6.4 · design-system ข้อ 7.9 บรรทัด "ห้าม")

   ปุ่มต่อชนิด: PHONE = แสดง · โทร · คัดลอก · LINE_ID = แสดง LINE ID · คัดลอก
   ที่เหลือ = แสดง · คัดลอก · LINE_USER_ID ไม่มีปุ่มเพราะไม่ใช่ค่าที่มนุษย์ใช้ติดต่อ */

type ActionKind = { purpose: RevealPurpose; label: string };

const VIEW: ActionKind = { purpose: "VIEW", label: "แสดง" };
const CALL: ActionKind = { purpose: "CALL", label: "โทร" };
const COPY: ActionKind = { purpose: "COPY", label: "คัดลอก" };
const LINE_VIEW: ActionKind = { purpose: "VIEW", label: "แสดง LINE ID" };

function actionsFor(type: string): ActionKind[] {
  if (type === "LINE_USER_ID") return [];
  if (type === "PHONE") return [VIEW, CALL, COPY];
  if (type === "LINE_ID") return [LINE_VIEW, COPY];
  return [VIEW, COPY];
}

export function ContactList({
  contacts,
  canReveal,
  revealNeedsMfa,
}: {
  contacts: Customer360Contact[];
  canReveal: boolean;
  revealNeedsMfa: boolean;
}) {
  const [state, action, pending] = useActionState(revealContact, INITIAL_REVEAL);
  const [shown, setShown] = useState<{ contactId: string; value: string } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const handled = useRef(0);

  /* ผลลัพธ์แต่ละครั้งทำอะไรไม่เหมือนกัน: "แสดง" วางค่าไว้บนจอ · "โทร" เปิด tel: โดยไม่วางค่าบนจอ
     · "คัดลอก" ส่งเข้าคลิปบอร์ดแล้วบอกว่าคัดลอกแล้ว — ทั้งหมดจับที่ nonce เพื่อให้ทำงานครั้งเดียวต่อคำตอบ */
  useEffect(() => {
    if (state.nonce === 0 || state.nonce === handled.current) return;
    handled.current = state.nonce;

    if (state.error || !state.value || !state.contactId) {
      setShown(null);
      setNotice(state.error);
      return;
    }

    const value = state.value;
    if (state.purpose === "CALL") {
      setNotice("กำลังเปิดแอปโทรออก");
      window.location.href = `tel:${value.replace(/[^\d+]/g, "")}`;
      return;
    }
    if (state.purpose === "COPY") {
      setNotice("คัดลอกแล้ว");
      void navigator.clipboard?.writeText(value).catch(() => setNotice("คัดลอกไม่สำเร็จ"));
      return;
    }
    /* แสดงค่า PHONE/LINE ID ชั่วคราว โดยบันทึกวัตถุประสงค์ VIEW ตรงกับการกระทำ */
    setNotice(null);
    setShown({ contactId: state.contactId, value });
    setSeconds(state.autoHideSeconds);
  }, [state]);

  /* นับถอยหลังแล้วซ่อนคืนเอง — ค่าเต็มไม่ควรค้างอยู่บนจอที่เดินออกจากโต๊ะไปแล้ว */
  useEffect(() => {
    if (!shown || seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [shown, seconds]);

  useEffect(() => {
    if (shown && seconds <= 0) setShown(null);
  }, [shown, seconds]);

  if (contacts.length === 0) {
    return <p className="t-sm t-muted">ยังไม่มีช่องทางติดต่อ</p>;
  }

  return (
    <>
      <div className="contact-list">
        {contacts.map((c) => {
          const revealed = shown?.contactId === c.contact_id;
          const kinds = actionsFor(c.contact_type);
          return (
            <div className="contact-row" key={c.contact_id} data-revealed={revealed ? "true" : "false"}>
              <span className="contact-row__text">
                <span className="contact-row__type">
                  {CONTACT_TYPE_LABEL[c.contact_type] ?? c.contact_type}
                  {c.is_primary ? " · หลัก" : ""}
                  {c.is_active ? "" : " · ปิดใช้งาน"}
                </span>
                <span className="contact-row__value">
                  {revealed ? shown.value : (c.value_masked ?? "–")}
                </span>
                {c.is_valid ? null : (
                  <span className="badge badge--warning badge--square">เบอร์ไม่ถูกต้อง</span>
                )}
              </span>

              {revealed ? (
                <span className="contact-row__timer">แสดงอยู่ · ซ่อนใน {seconds} วินาที</span>
              ) : null}

              {canReveal && kinds.length > 0 ? (
                <span className="contact-row__actions">
                  {revealed ? (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShown(null)}>
                      ซ่อน
                    </button>
                  ) : (
                    kinds.map((k) => (
                      <form action={action} key={k.purpose}>
                        <input type="hidden" name="contact_id" value={c.contact_id} />
                        <input type="hidden" name="purpose" value={k.purpose} />
                        <button type="submit" className="btn btn--ghost btn--sm" disabled={pending}>
                          {k.label}
                        </button>
                      </form>
                    ))
                  )}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {notice ? (
        <p className={state.error ? "error-text" : "t-xs t-muted"} role="status">
          {notice}
        </p>
      ) : null}

      {canReveal ? (
        <p className="t-xs t-muted">การเปิดดู โทร หรือคัดลอก จะถูกบันทึกในประวัติการเข้าถึง</p>
      ) : (
        <p className="t-xs t-muted">
          {revealNeedsMfa
            ? "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อนจึงจะเปิดดูข้อมูลติดต่อได้"
            : "บทบาทของคุณดูได้เฉพาะค่าที่ปิดบัง"}
        </p>
      )}
    </>
  );
}
