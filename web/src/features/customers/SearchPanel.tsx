"use client";

import { useActionState, useState, type ReactNode } from "react";

import { int } from "@/lib/format/number";

import { searchCustomers } from "./actions";
import { CustomerTable } from "./CustomerTable";
import { ResultsSkeleton, StateCard } from "./States";
import { SEARCH_IDLE, type CustomerRefs, type Preset } from "./types";

/* ช่องค้นหาในหน้า (C-SEARCH แบบฝังหน้า · sitemap-screen-specs ข้อ 6.5)

   คำค้นไม่ไปอยู่ใน URL (ข้อ 6.9) จึงส่งด้วย Server Action แทนการนำทาง
   ตอนยังไม่ได้ค้น หน้าจะแสดง children ซึ่งเป็นรายการที่เซิร์ฟเวอร์เรนเดอร์มาแล้ว
   ตอนมีผลค้นหา รายการปกติถูกซ่อนทั้งก้อน — รวมถึงแถบตัวกรอง เพราะตัวกรองไม่มีผลกับผลค้นหา
   (ข้อ 6.5: "เมื่อมีคำค้น ตัวกรองวันที่ถูกปิดชั่วคราว") */

const PLACEHOLDER = "ค้นหาชื่อ เบอร์ LINE Customer ID IMEI";
const HELP =
  "ชื่อพิมพ์อย่างน้อย 3 ตัวอักษร · เบอร์โทร อีเมล LINE ID IMEI และเลขธุรกรรมต้องพิมพ์ครบทั้งค่า · กด Enter หรือปุ่มค้นหา";

export function SearchPanel({
  refs,
  preset,
  children,
}: {
  refs: CustomerRefs;
  preset: Preset;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(searchCustomers, SEARCH_IDLE);
  const [term, setTerm] = useState("");
  const [cleared, setCleared] = useState(false);
  const shown = cleared ? SEARCH_IDLE : state;
  /* คำค้นสั้นเกินไปยังไม่ถือว่าค้น — รายการเดิมต้องอยู่ต่อ ไม่ใช่หายไปพร้อมข้อความเตือน */
  const searching = pending || shown.status === "ok" || shown.status === "error";

  const submit = (formData: FormData) => {
    setCleared(false);
    dispatch(formData);
  };

  const groups = shown.otherGroups;
  const otherTotal = groups.leads + groups.opportunities + groups.quotations + groups.transactions;

  return (
    <>
      <form className="cust-search" role="search" action={submit} noValidate>
        <label className="sr-only" htmlFor="cust-q">
          ค้นหาลูกค้า
        </label>
        <input
          className="input"
          id="cust-q"
          name="term"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          aria-describedby="cust-q-help"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <input type="hidden" name="preset" value={preset} />
        <button type="submit" className="btn btn--secondary" disabled={pending}>
          {pending ? "กำลังค้นหา…" : "ค้นหา"}
        </button>
        {shown.status === "idle" ? null : (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setTerm("");
              setCleared(true);
            }}
          >
            ล้างคำค้น
          </button>
        )}
      </form>

      <p className={shown.status === "invalid" ? "error-text" : "help"} id="cust-q-help" aria-live="polite">
        {shown.status === "invalid" && shown.message ? shown.message : HELP}
      </p>

      {pending ? <ResultsSkeleton /> : null}

      {!pending && shown.status === "error" ? (
        <StateCard kind="error" title="ค้นหาไม่สำเร็จ" text={shown.message ?? undefined} />
      ) : null}

      {!pending && shown.status === "ok" ? (
        <>
          {otherTotal > 0 ? (
            <div className="cust-groups" aria-label="ผลค้นหากลุ่มอื่น">
              <span className="t-muted">กลุ่มอื่น:</span>
              <span className="chip">Lead ({int(groups.leads)})</span>
              <span className="chip">โอกาสขาย ({int(groups.opportunities)})</span>
              <span className="chip">ใบเสนอราคา ({int(groups.quotations)})</span>
              <span className="chip">ธุรกรรม ({int(groups.transactions)})</span>
              <span className="badge badge--neutral badge--square">เปิดใช้ใน Phase 2</span>
            </div>
          ) : null}

          {shown.rows.length === 0 ? (
            <StateCard
              kind="noresult"
              title={`ไม่พบผลลัพธ์สำหรับ “${shown.term}”`}
              text="เบอร์โทร อีเมล LINE ID IMEI และเลขธุรกรรมต้องพิมพ์ครบทั้งค่า"
            />
          ) : (
            <CustomerTable
              rows={shown.rows}
              refs={refs}
              total={shown.rows.length}
              from={1}
              caption={`ผลการค้นหาลูกค้า ${shown.term}`}
            />
          )}
        </>
      ) : null}

      {/* รายการปกติยังถูกเรนเดอร์ไว้ แต่ซ่อนระหว่างที่แสดงผลค้นหา จะได้กลับมาได้ทันทีที่ล้างคำค้น */}
      <div hidden={searching}>{children}</div>
    </>
  );
}
