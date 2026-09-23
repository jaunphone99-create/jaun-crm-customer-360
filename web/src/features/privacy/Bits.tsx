import type { ReactNode } from "react";

import { DASH } from "@/lib/format/number";

import {
  CONSENT_STATUS_LABEL,
  DSR_STATUS_LABEL,
  type ConsentStatus,
  type DsrStatus,
} from "./types";

/* ชิ้นส่วนเล็ก ๆ ที่ใช้ซ้ำทั้งหน้า 17

   prototype/17-privacy.html มี <style> เฉพาะหน้า (.pv-dl · .pv-hold · .pv-steps) ซึ่งยังไม่ได้ถูก
   คัดลอกมาที่ @/app/generated/page-privacy.css จึงเขียน layout สองสามจุดด้วย inline style ไปก่อน
   ค่าทุกตัวอ้างตัวแปร --space-* ของระบบ ไม่มีสีหรือระยะที่คิดขึ้นเอง

   ไฟล์นี้ไม่มี "use client" และไม่มี hook — ใช้ได้ทั้งใน Server Component และใน client form */

/** คู่ "หัวข้อ · ค่า" แบบสองคอลัมน์ — แทน .pv-dl ของ prototype */
export function DefList({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl
      className="form-static"
      style={{
        display: "grid",
        gridTemplateColumns: "max-content minmax(0, 1fr)",
        gap: "var(--space-2) var(--space-4)",
        margin: 0,
      }}
    >
      {items.map((it) => (
        <div key={it.term} style={{ display: "contents" }}>
          <dt className="t-muted">{it.term}</dt>
          <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{it.value ?? DASH}</dd>
        </div>
      ))}
    </dl>
  );
}

/** แถวปุ่มดำเนินการ — แทน .pv-steps ของ prototype */
export function ActionRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "flex-start" }}>
      {children}
    </div>
  );
}

export function DsrStatusBadge({ status }: { status: DsrStatus }) {
  const tone =
    status === "COMPLETED" ? "badge--success" : status === "REJECTED" ? "badge--neutral" : "badge--info";
  return <span className={`badge ${tone} badge--square`}>{DSR_STATUS_LABEL[status] ?? status}</span>;
}

export function ConsentStatusBadge({ status }: { status: ConsentStatus }) {
  return (
    <span className={`badge ${status === "GRANTED" ? "badge--success" : "badge--neutral"} badge--square`}>
      {CONSENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* หมายเหตุที่ตั้งใจไม่ทำ — ป้าย "เกินกำหนด / ใกล้ครบกำหนด"

   prototype มีป้ายนี้ และเงื่อนไข DSR_DUE_SOON (ข้อ 11.1) ก็มีจริง
   แต่การจะบอกว่า "เกินกำหนด" ต้องรู้ว่า "วันนี้" ของธุรกิจคือวันไหน ซึ่งคือ app.clock()
   ตอนนี้ยังไม่มี RPC ไหนคืนเวลาปัจจุบันของฐานข้อมูลออกมาให้หน้าจอใช้ และ
   web/src/lib/format/date.ts ห้ามไว้ชัดเจนว่าห้ามหยิบนาฬิกาของเครื่องผู้ใช้มาใช้เอง

   หน้าจอจึงแสดงวันครบกำหนดตรง ๆ แทนที่จะเดาสถานะจากนาฬิกาที่ไม่ใช่ของฐานข้อมูล
   ผู้ใช้ยังได้รับแจ้งเตือน DSR_DUE_SOON จากฝั่งฐานข้อมูลตามปกติ (ดู blockers ของงานนี้) */
