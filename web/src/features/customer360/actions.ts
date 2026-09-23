"use server";

import { rpc } from "@/lib/db";
import { toThaiMessage } from "@/lib/errors";

import { INITIAL_REVEAL, type RevealPurpose, type RevealState } from "./types";

/* การเขียนอย่างเดียวของหน้า 05 คือ "ขอดูค่าเต็มของช่องทางติดต่อ"

   ค่าเต็มของเบอร์/อีเมล/LINE ออกจากฐานข้อมูลได้ทางเดียวคือ api.reveal_contact ซึ่ง
   บันทึก access log CONTACT_REVEALED และนับเพดานต่อชั่วโมงไว้ด้วย (CANONICAL ข้อ 6.4 · D33)
   ค่าเต็มจึงเดินทางมาถึงเบราว์เซอร์ "เฉพาะตอนที่ผู้ใช้กดขอ" เท่านั้น — หน้าแรกที่โหลดมามีแต่ค่าปิดบัง
   และค่าที่ได้ไม่ถูกเก็บถาวร หน้าจอซ่อนคืนเองเมื่อครบเวลา */

/* ไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async — ชนิดและค่าเริ่มต้นจึงอยู่ที่ ./types */
const PURPOSES: readonly RevealPurpose[] = ["VIEW", "CALL", "COPY", "LINE_OPEN"];

type RevealResult = {
  ok: boolean;
  code?: string;
  contact_id?: string;
  contact_type?: string;
  value_raw?: string | null;
  value_normalized?: string | null;
  auto_hide_seconds?: number;
};

export async function revealContact(prev: RevealState, formData: FormData): Promise<RevealState> {
  const contactId = String(formData.get("contact_id") ?? "");
  const raw = String(formData.get("purpose") ?? "");
  const purpose = (PURPOSES as readonly string[]).includes(raw) ? (raw as RevealPurpose) : ("VIEW" as const);
  const next = prev.nonce + 1;

  if (!contactId) {
    return { ...INITIAL_REVEAL, nonce: next, error: "ไม่พบช่องทางติดต่อนี้" };
  }

  let result: RevealResult;
  try {
    result = await rpc<RevealResult>("reveal_contact", { p_contact_id: contactId, p_purpose: purpose });
  } catch (error) {
    const message = toThaiMessage(error);
    return { ...INITIAL_REVEAL, nonce: next, error: message.title };
  }

  /* เกินเพดานต่อชั่วโมงคืน ok:false โดยไม่ raise (ตัวนับและการแจ้งเตือนต้องถูก commit)
     ค่าจึงยังปิดบังอยู่ และผู้ใช้ต้องรู้ว่าเพราะอะไร ไม่ใช่เห็นปุ่มที่กดแล้วเงียบ */
  if (!result?.ok) {
    return {
      ...INITIAL_REVEAL,
      nonce: next,
      error:
        result?.code === "REVEAL_LIMIT_EXCEEDED"
          ? "เปิดดูข้อมูลติดต่อครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณารอสักครู่"
          : "เปิดดูข้อมูลติดต่อไม่สำเร็จ",
    };
  }

  return {
    contactId,
    purpose,
    value: result.value_raw ?? result.value_normalized ?? null,
    autoHideSeconds: result.auto_hide_seconds ?? 30,
    error: null,
    nonce: next,
  };
}
