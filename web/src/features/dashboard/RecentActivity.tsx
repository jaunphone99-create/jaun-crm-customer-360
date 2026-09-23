import Link from "next/link";

import { initials, polite } from "@/features/customers/labels";
import { dateTime, dayKey, time } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";

import type { RecentActivityRow } from "./types";

/* กิจกรรมล่าสุด (W5 · CANONICAL ข้อ 13.5 · 14.7)
   โครง HTML เดียวกับ prototype/02-dashboard.html · activityList() — คลาส .dash-list ชุดเดิม

   ทำไมแถวเป็นลิงก์ทั้งแถว: หัวหน้าสาขาใช้วิดเจ็ตนี้เป็นทางลัดไปดูลูกค้าที่เพิ่งเข้ามา
   ถ้าลิงก์อยู่แค่ที่ชื่อ เป้าสัมผัสจะเล็กกว่า 44px บนแท็บเล็ตหน้าร้าน (ข้อ 15)

   ทำไมต้องรับ `clock` เข้ามา: การตัดสินว่า "วันนี้" ต้องเทียบกับนาฬิกาของฐานข้อมูล
   (app.clock() · ข้อ 1.2) ไม่ใช่ของเครื่องผู้ใช้ — เครื่องที่ตั้งเวลาเพี้ยนหรือเซิร์ฟเวอร์
   ที่รันด้วย UTC จะตัดวันคลาดไป 7 ชั่วโมง แล้วรายการเมื่อวานจะขึ้นเป็นเวลาเปล่า ๆ
   เหมือนเพิ่งเกิดขึ้นเมื่อครู่ ซึ่งอันตรายกว่าการแสดงวันที่ยาวไป */

export function RecentActivity({ rows, clock }: { rows: RecentActivityRow[]; clock: string }) {
  if (rows.length === 0) {
    return (
      <div className="state state--compact">
        <p className="state__title">ยังไม่มีกิจกรรมในช่วงนี้</p>
        <p className="state__text">เมื่อมีการติดต่อลูกค้าในขอบเขตของคุณ รายการจะขึ้นที่นี่เอง</p>
      </div>
    );
  }

  const today = dayKey(clock);

  return (
    <div className="dash-list">
      {rows.map((r) => {
        /* วันนี้แสดงเฉพาะเวลา · วันอื่นแสดงวันที่ + เวลา (prototype activityList) */
        const when = dayKey(r.last_activity_at) === today ? time(r.last_activity_at) : dateTime(r.last_activity_at);
        const name = polite(r.display_name) ?? DASH;
        /* ช่องทางหรือสาขาอาจว่างได้ (ลูกค้าที่สร้างไว้ก่อนมีกิจกรรมในสาขา) — ตัดตัวที่ว่างทิ้ง
           ไม่ใช่แสดง " · " ลอย ๆ ที่อ่านแล้วเหมือนข้อมูลหาย */
        const meta = [r.channel_label, r.branch_name].filter(Boolean).join(" · ");

        return (
          <Link className="dash-list__row" href={`/customers/${r.customer_no}`} key={r.id}>
            <span className="avatar avatar--sm" aria-hidden="true">
              {initials(r.display_name)}
            </span>
            <span className="dash-list__main">
              <span className="dash-list__title">{name}</span>
              <span className="dash-list__meta">{meta || DASH}</span>
            </span>
            <span className="dash-list__side">{when}</span>
          </Link>
        );
      })}
    </div>
  );
}
