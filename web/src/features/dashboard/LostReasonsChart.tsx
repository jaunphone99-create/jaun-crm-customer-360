import type { LostReason } from "./charts.types";

/* เหตุผลที่ไม่สำเร็จ (W3 · C-CHART-HBAR · sitemap-screen-specs ข้อ 5.5 · CANONICAL ข้อ 13.4)
   โครงเดียวกับ JCRM.chart.hbar ใน prototype/assets/app.js — แท่งแนวนอนสีเดียว --chart-lost

   ลำดับแถวเป็นของฐานข้อมูล: 5 อันดับแรกเรียงมากไปน้อย แล้วปิดท้ายด้วย "อื่น ๆ" (_OTHERS)
   ซึ่งอาจไม่ใช่แถวที่น้อยที่สุด — ถ้าหน้าจอเรียงใหม่ตามค่า "อื่น ๆ" จะเด้งไปกลางตาราง
   แล้วคนอ่านจะนับเป็นเหตุผลอันดับต้น ๆ ทั้งที่มันคือกองรวมของที่เหลือ จึง **ห้ามเรียงใหม่**

   ความยาวแท่ง = pct ของแถวนั้นเทียบเต็มความกว้าง (สเกล 0–100%) ไม่ใช่เทียบแถวที่ยาวสุด
   เหตุผลสองชั้น: (1) เทียบแถวแรกต้องหาร pct ด้วย pct ซึ่งคือการคำนวณที่หน้าจอ (ข้อ 20.15)
   (2) สเกล 0–100% อ่านแล้วตอบคำถามจริงของผู้ใช้ได้ทันทีว่า "เหตุผลนี้กินสัดส่วนเท่าไรของทั้งหมด"

   ตัวเลขทุกตัวที่พิมพ์ออกจอเป็น display / pct_display / lead_display จากฐานข้อมูลตรง ๆ */

const W = 440;
const ROW_H = 44;
const LABEL_W = 150;
const VALUE_W = 96;
const BAR_MAX = W - LABEL_W - VALUE_W;
const VALUE_X = W - VALUE_W + 10;
/** แท่งสั้นสุด 2px เพื่อให้เหตุผลที่สัดส่วนน้อยมากยังมองเห็นว่ามีแท่งอยู่ */
const BAR_MIN = 2;

export function LostReasonsChart({
  reasons,
  id = "dash-lost",
}: {
  reasons: LostReason[];
  id?: string;
}) {
  if (reasons.length === 0) {
    return (
      <div className="state state--compact">
        <p className="state__title">ยังไม่มีข้อมูลในช่วงนี้</p>
        <p className="state__text">ช่วงเวลาที่เลือกยังไม่มีรายการที่ปิดแบบไม่สำเร็จ</p>
      </div>
    );
  }

  const height = reasons.length * ROW_H;
  const desc = reasons.map((r) => `${r.label_th} ${r.display} ${r.pct_display}`).join(" · ");

  return (
    <figure className="chart">
      <div className="chart__graphic">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
          <title id={`${id}-t`}>เหตุผลที่ไม่สำเร็จ</title>
          <desc id={`${id}-d`}>{`เหตุผลที่ไม่สำเร็จ เรียงจากมากไปน้อย: ${desc}`}</desc>
          {reasons.map((reason, i) => {
            const y = i * ROW_H;
            const barW = Math.max(BAR_MAX * reason.pct, BAR_MIN);
            return (
              <g key={reason.code}>
                <text x={0} y={y + 18} className="chart-text" fontSize={13} fill="var(--text-primary)">
                  {reason.label_th}
                </text>
                {/* แยกให้เห็นว่ากองนั้นเสียไปตั้งแต่ยังเป็น Lead กี่ราย (ที่เหลือคือโอกาสขายที่ปิดไม่สำเร็จ)
                    เพราะสองกลุ่มนี้แก้คนละทาง: เสียที่ขั้น Lead คือแพ้ตั้งแต่ยังไม่ได้เสนอราคา
                    ส่วนเสียที่ขั้นโอกาสขายคือเสนอไปแล้วแต่ปิดไม่ได้ — ทั้งคู่ปิดแล้ว ไม่ใช่งานที่ยังตามต่อได้ */}
                <text x={0} y={y + 33} className="chart-text" fontSize={11} fill="var(--text-secondary)">
                  {`ปิดที่ขั้น Lead ${reason.lead_display}`}
                </text>
                <rect
                  x={LABEL_W}
                  y={y + 13}
                  width={barW}
                  height={16}
                  rx={3}
                  fill="var(--chart-lost)"
                />
                <text
                  x={VALUE_X}
                  y={y + 18}
                  className="chart-text"
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--text-heading)"
                >
                  {reason.display}
                </text>
                <text x={VALUE_X} y={y + 33} className="chart-text" fontSize={11} fill="var(--text-secondary)">
                  {reason.pct_display}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="chart__note">ความยาวแท่ง = สัดส่วนของเหตุผลนั้นเทียบกับรายการที่ไม่สำเร็จทั้งหมดในช่วงเวลาที่เลือก</figcaption>
    </figure>
  );
}
