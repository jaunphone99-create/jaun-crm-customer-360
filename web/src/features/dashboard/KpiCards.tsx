import { time } from "@/lib/format/date";
import { DASH, deltaDir } from "@/lib/format/number";

import { clockText, compareText, periodText } from "./period";
import { PRESET_LABEL } from "./labels";
import { rowOf } from "./queries";
import type { KpiResult, KpiRow, Preset } from "./types";

/* การ์ด KPI (C-KPI · C-KPI-TARGET) — โครงเดียวกับ prototype/assets/app.js (ui.kpiCard)

   กติกาเดียวของไฟล์นี้: **ไม่มีเลขคณิตเลยแม้แต่ตัวเดียว**
   ค่าที่แสดงคือ row.display · ป้ายเปลี่ยนแปลงคือ row.change_display · ผ่านเป้าคือ row.target_met
   ทั้งสามค่าฐานข้อมูลปัดและจัดรูปแบบมาแล้วตาม CANONICAL ข้อ 1.3 ที่เดียว
   ถ้าหน้าจอปัดซ้ำ ตัวเลขบนจอกับตัวเลขในรายงาน/ไฟล์ส่งออกจะต่างกันในหลักสุดท้ายโดยไม่มีใครสังเกต

   KPI ที่ฐานข้อมูลคืน NULL (เช่น KPI ที่ไม่ผูกพนักงานเมื่อขอบเขตเป็น TEAM/OWN · ข้อ 12.4)
   มาเป็น display = "–" อยู่แล้ว การ์ดจึงแสดง "–" ตามนั้น ไม่ใช่ซ่อนการ์ดหรือเดาเป็น 0 */

function Delta({ row, note }: { row: KpiRow | null; note: string }) {
  const text = row?.change_display;
  if (!text || text === DASH) return null;
  return (
    <span className={`delta delta--${deltaDir(text)}`} data-tooltip={note} title={note} tabIndex={0}>
      {text}
    </span>
  );
}

function TargetBadge({ row }: { row: KpiRow | null }) {
  if (!row || row.target_met === null) return null;
  return (
    <span className={`target target--${row.target_met ? "pass" : "fail"}`}>
      {row.target_met ? "ผ่าน" : "ต่ำกว่าเป้า"}
    </span>
  );
}

export function KpiCard({
  label,
  row,
  period,
  compare,
  sub,
  showTarget = false,
}: {
  label: string;
  row: KpiRow | null;
  /** ข้อความช่วงเวลาใต้ป้าย ("30 วันล่าสุด" หรือ "ณ 11 ก.ย. 2569 10:24 น.") */
  period: string;
  /** ข้อความบอกว่าป้ายเปลี่ยนแปลงเทียบกับช่วงไหน — ไว้ใน tooltip ไม่ใช่บนการ์ด */
  compare: string;
  /** บรรทัดรอง เช่น มูลค่ารวมของโอกาสขายที่ดูแล */
  sub?: string | null;
  showTarget?: boolean;
}) {
  const display = row?.display ?? DASH;
  const isNull = display === DASH;

  return (
    <div
      className="kpi-card"
      role="group"
      aria-label={`${label} ${period} ${display}${row?.change_display && row.change_display !== DASH ? ` เปลี่ยนแปลง ${row.change_display}` : ""}`}
    >
      <div className="kpi-card__head">
        <span className="kpi-card__label">{label}</span>
      </div>
      <div className="kpi-card__period">{period}</div>
      <div className={`kpi-card__value${isNull ? " is-null" : ""}`}>{display}</div>
      {sub ? <div className="kpi-card__sub">{sub}</div> : null}
      <div className="kpi-card__foot">
        <Delta row={row} note={compare} />
        {showTarget ? <TargetBadge row={row} /> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------
   ชุดการ์ดตามบทบาท (CANONICAL ข้อ 14.7 · sitemap-screen-specs ข้อ 5.5)
   ป้ายการ์ดใช้ถ้อยคำของข้อ 14.7 ซึ่งสั้นกว่าชื่อ KPI กลางในบางตัว (เช่น "ปิดการขาย")
   --------------------------------------------------------------------------------- */

/** ชุด "องค์กร"/"สาขา" — K1 มาจากการเรียก preset TODAY แยกอีกครั้ง (ข้อ 14.7 K1) */
export function OrgCards({ current, today }: { current: KpiResult; today: KpiResult }) {
  const p = periodText(current);
  const cmp = compareText(current);
  const todayPeriod = `${PRESET_LABEL.TODAY} ถึง ${time(today.clock)}`;

  return (
    <div className="kpi-grid dash-kpis">
      <KpiCard
        label="ลูกค้าไม่ซ้ำวันนี้"
        row={rowOf(today, "UNIQUE_CUSTOMERS")}
        period={todayPeriod}
        compare={compareText(today)}
      />
      <KpiCard label="ลูกค้าไม่ซ้ำ" row={rowOf(current, "UNIQUE_CUSTOMERS")} period={p} compare={cmp} />
      <KpiCard label="Leads" row={rowOf(current, "LEADS")} period={p} compare={cmp} />
      <KpiCard label="Opportunities" row={rowOf(current, "OPPORTUNITIES")} period={p} compare={cmp} />
      <KpiCard label="ปิดการขาย" row={rowOf(current, "SALES")} period={p} compare={cmp} />
      <KpiCard
        label="Conversion (Lead → ขาย)"
        row={rowOf(current, "CONV_LEAD_TO_SALE")}
        period={p}
        compare={cmp}
      />
    </div>
  );
}

/** ชุด "ทีม" (SUPERVISOR · sitemap ข้อ 5.5) — K6 เป็นค่า ณ เวลาอ้างอิง ไม่ใช่ตามช่วง */
export function TeamCards({ current }: { current: KpiResult }) {
  const p = periodText(current);
  const cmp = compareText(current);
  const now = clockText(current);

  return (
    <div className="kpi-grid dash-kpis">
      <KpiCard label="Leads" row={rowOf(current, "LEADS")} period={p} compare={cmp} />
      <KpiCard label="Opportunities" row={rowOf(current, "OPPORTUNITIES")} period={p} compare={cmp} />
      <KpiCard label="ปิดการขาย" row={rowOf(current, "SALES")} period={p} compare={cmp} />
      <KpiCard label="ยอดขาย" row={rowOf(current, "SALES_AMOUNT")} period={p} compare={cmp} />
      <KpiCard
        label="Conversion (Lead → ขาย)"
        row={rowOf(current, "CONV_LEAD_TO_SALE")}
        period={p}
        compare={cmp}
      />
      <KpiCard label="งานเกินกำหนดของทีม" row={rowOf(current, "TASKS_OVERDUE")} period={now} compare={cmp} />
    </div>
  );
}

/* ชุด "พนักงาน" (STAFF · ข้อ 14.7)
   K1–K4 เป็นค่า "ณ ตอนนี้" · K5–K6 เป็นช่วง 30 วันล่าสุด — ช่วงตายตัวอยู่ในป้ายการ์ดเอง
   หน้านี้จึงไม่แสดงตัวเลือกช่วงเวลาให้ STAFF (sitemap ข้อ 5.5 หมายเหตุผู้เขียน) */
export function StaffCards({ current }: { current: KpiResult }) {
  const now = clockText(current);
  const cmp = compareText(current);
  const pipeline = rowOf(current, "OPEN_PIPELINE_AMOUNT");

  return (
    <div className="kpi-grid dash-kpis">
      <KpiCard label="งานวันนี้" row={rowOf(current, "TASKS_TODAY")} period={now} compare={cmp} />
      <KpiCard label="เกินกำหนด" row={rowOf(current, "TASKS_OVERDUE")} period={now} compare={cmp} />
      <KpiCard label="Lead ที่ดูแล (เปิดอยู่)" row={rowOf(current, "OPEN_LEADS")} period={now} compare={cmp} />
      <KpiCard
        label="โอกาสขายที่ดูแล"
        row={rowOf(current, "OPEN_OPPORTUNITIES")}
        period={now}
        compare={cmp}
        sub={pipeline?.display ?? null}
      />
      <KpiCard
        label="ปิดการขาย 30 วัน"
        row={rowOf(current, "SALES")}
        period={PRESET_LABEL.LAST_30_DAYS}
        compare={cmp}
      />
      <KpiCard
        label="ยอดขาย 30 วัน"
        row={rowOf(current, "SALES_AMOUNT")}
        period={PRESET_LABEL.LAST_30_DAYS}
        compare={cmp}
      />
    </div>
  );
}

/* แถวคุณภาพข้อมูล (BUSINESS_ADMIN เท่านั้น · ข้อ 14.7 · W6)
   ป้าย "ผ่าน/ต่ำกว่าเป้า" มาจาก target_met ของ RPC ซึ่งเทียบด้วยค่าที่ยังไม่ปัดให้แล้ว
   ตัวเลขเป้า (≥ 95% · < 2%) ไม่ได้อยู่ในผลของ RPC จึงไม่แสดงบนการ์ด — ดูที่หน้า 12 แทน */
const DQ_CARDS: { code: string; label: string }[] = [
  { code: "CAPTURE_RATE", label: "อัตราบันทึกตัวตนลูกค้า" },
  { code: "OUTCOME_COMPLETION", label: "บันทึกผลการให้บริการครบ" },
  { code: "FOLLOWUP_COMPLETION", label: "ติดตามตรงเวลา" },
  { code: "DUPLICATE_RATE", label: "อัตราข้อมูลซ้ำ" },
  { code: "MISSING_REQUIRED_RATE", label: "ข้อมูลจำเป็นไม่ครบ" },
];

export function DataQualityCards({ current }: { current: KpiResult }) {
  const p = periodText(current);
  const cmp = compareText(current);

  return (
    <div className="kpi-grid dash-kpis">
      {DQ_CARDS.map((c) => (
        <KpiCard key={c.code} label={c.label} row={rowOf(current, c.code)} period={p} compare={cmp} showTarget />
      ))}
    </div>
  );
}
