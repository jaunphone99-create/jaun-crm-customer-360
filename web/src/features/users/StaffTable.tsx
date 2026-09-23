"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { STAFF_STATUS_LABEL } from "@/lib/labels";

import type { StaffStatus } from "./types";

/* ตารางรายชื่อพนักงาน

   ช่องค้นหาเป็นการกรอง "ในรายการที่โหลดมาแล้ว" ไม่ใช่การค้นที่ฐานข้อมูล และตั้งใจไม่ลง URL
   (prototype หน้า 13 · คำค้นเป็นชื่อคนจึงไม่ควรติดไปกับลิงก์ที่แชร์กัน)
   ส่วนตัวกรองสาขา/สถานะอยู่ใน query string เพราะเป็นค่าที่แชร์ลิงก์แล้วมีประโยชน์ */

export type StaffView = {
  staffId: string;
  staffCode: string;
  displayName: string;
  nickname: string | null;
  email: string;
  status: StaffStatus;
  rolesText: string;
  branchText: string;
  teamsText: string;
};

const STATUS_VARIANT: Record<StaffStatus, string> = {
  ACTIVE: "badge--success",
  INVITED: "badge--warning",
  SUSPENDED: "badge--warning",
  DISABLED: "badge--neutral",
};

export function StaffTable({
  rows,
  total,
  selectedCode,
  query,
}: {
  rows: StaffView[];
  /** จำนวนบัญชีทั้งหมดที่ผู้ใช้เห็นได้ ก่อนตัวกรองของหน้านี้ */
  total: number;
  selectedCode: string | null;
  /** ตัวกรองปัจจุบัน — ใส่กลับไปในลิงก์เพื่อให้เลือกคนแล้วตัวกรองไม่หาย */
  query: Record<string, string>;
}) {
  const [term, setTerm] = useState("");

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.staffCode.toLowerCase().includes(q) ||
        (r.nickname ?? "").toLowerCase().includes(q)
    );
  }, [rows, term]);

  return (
    <>
      <div className="field" style={{ maxWidth: "36ch", marginBottom: "var(--space-3)" }}>
        <label className="label" htmlFor="u-q">
          ค้นหาชื่อหรือรหัสพนักงาน
        </label>
        <input
          className="input"
          id="u-q"
          type="search"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="เช่น คุณขวัญ หรือ ST-0045"
        />
        <p className="help">ค้นในรายการที่โหลดแล้วเท่านั้น · คำค้นไม่ลง URL</p>
      </div>

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">ผู้ใช้งานในขอบเขตของคุณ</caption>
            <thead>
              <tr>
                <th scope="col">รหัสพนักงาน</th>
                <th scope="col">ชื่อ</th>
                <th scope="col">บทบาท</th>
                <th scope="col">สาขา</th>
                <th scope="col">ทีม</th>
                <th scope="col">อีเมล</th>
                <th scope="col">สถานะ</th>
                <th scope="col">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "var(--space-5)", color: "var(--text-secondary)" }}>
                    ไม่พบผู้ใช้งานตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                shown.map((r) => (
                  <tr key={r.staffCode} aria-selected={r.staffCode === selectedCode || undefined}>
                    <td>{r.staffCode}</td>
                    <td>
                      {r.displayName}
                      {r.nickname ? <span className="cell-sub">{r.nickname}</span> : null}
                    </td>
                    <td>{r.rolesText}</td>
                    <td>{r.branchText}</td>
                    <td>{r.teamsText}</td>
                    <td>{r.email}</td>
                    <td>
                      <span className={`badge ${STATUS_VARIANT[r.status]}`}>{STAFF_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td>
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={{ pathname: "/users", query: { ...query, staff: r.staffCode } }}
                        scroll={false}
                      >
                        {r.staffCode === selectedCode ? "กำลังเปิดอยู่" : "เปิดดู"}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card__footer">
          <span className="t-sm t-muted">
            แสดง {shown.length} จาก {total} บัญชี
          </span>
        </div>
      </div>
    </>
  );
}
