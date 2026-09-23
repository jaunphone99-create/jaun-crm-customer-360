import type { FunnelStage } from "./charts.types";

/* Funnel ลูกค้า (W1 · C-CHART-FUNNEL · sitemap-screen-specs ข้อ 5.5)
   โครงเดียวกับ JCRM.chart.funnel ใน prototype/assets/app.js — viewBox · ขนาด · ลำดับ element ตรงกัน

   กติกาข้อ 20.15: ตัวเลขและร้อยละทุกตัวบนกราฟนี้ **ไม่ได้คิดที่หน้าจอ**
   จำนวนคือ stage.display · ร้อยละคือ stage.share_display ซึ่ง api.get_dashboard_charts
   ปัดมาแล้วตาม CANONICAL ข้อ 1.3 ถ้าหน้าจอหาร value ของขั้นนี้ด้วยขั้นแรกแล้วปัดเอง
   เลขบนจอจะต่างจากรายงาน/ไฟล์ส่งออกในหลักสุดท้ายโดยไม่มีใครสังเกต

   เลขคณิตที่เหลือในไฟล์นี้เป็น "พิกัดบนผืน SVG" ล้วน ๆ (x · y · ความกว้างแท่ง)
   ไม่มีค่าไหนถูกนำไปแสดงเป็นตัวเลขให้ผู้ใช้อ่าน — ความกว้างแท่งใช้ stage.share
   ที่ฐานข้อมูลคิดมาแล้ว ไม่ใช่หา value ÷ value ของขั้นแรกเอง */

const W = 440;
const ROW_H = 52;
const LABEL_W = 150;
const VALUE_W = 90;
const BAR_MAX = W - LABEL_W - VALUE_W;
const BAR_H = ROW_H - 8;
const VALUE_X = W - VALUE_W + 12;
/** แท่งสั้นสุด 4px เพื่อให้ขั้นที่เป็นศูนย์ยังมีร่องรอยให้เห็นว่ามีขั้นนี้อยู่ */
const BAR_MIN = 4;

export function FunnelChart({ stages, id = "dash-funnel" }: { stages: FunnelStage[]; id?: string }) {
  const first = stages[0];

  /* ขั้นแรกเป็นศูนย์ = ช่วงนี้ยังไม่มีลูกค้าเข้าร้านเลย กราฟที่มีแต่แท่ง 4px สี่แท่ง
     อ่านแล้วเข้าใจผิดว่า "ระบบพัง" มากกว่าจะเข้าใจว่า "ยังไม่มีข้อมูล" (เทียบ prototype)
     Number() ตรงนี้เป็นการเช็กว่ามีข้อมูลหรือไม่ ไม่ใช่การคำนวณค่าที่จะแสดง */
  if (!first || Number(first.value) === 0) {
    return (
      <div className="state state--compact">
        <p className="state__title">ยังไม่มีข้อมูลในช่วงนี้</p>
        <p className="state__text">เมื่อมีลูกค้าเข้าร้านในช่วงเวลาที่เลือก Funnel จะขึ้นให้เอง</p>
      </div>
    );
  }

  const height = stages.length * ROW_H;
  const desc = stages.map((s) => `${s.label_th} ${s.display} ${s.share_display}`).join(" → ");

  return (
    <figure className="chart">
      <div className="chart__graphic">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
          <title id={`${id}-t`}>Funnel ลูกค้า</title>
          <desc id={`${id}-d`}>{`Funnel ลูกค้า ร้อยละเทียบกับ${first.label_th}: ${desc}`}</desc>
          {stages.map((stage, i) => {
            const y = i * ROW_H + 4;
            const barW = Math.max(BAR_MAX * stage.share, BAR_MIN);
            return (
              <g key={stage.code}>
                <text
                  x={0}
                  y={y + 27}
                  className="chart-text"
                  fontSize={14}
                  fontWeight={500}
                  fill="var(--text-primary)"
                >
                  {stage.label_th}
                </text>
                <rect
                  x={LABEL_W}
                  y={y}
                  width={barW}
                  height={BAR_H}
                  rx={4}
                  fill={`var(${stage.chart_token})`}
                  stroke="var(--chart-separator)"
                  strokeWidth={2}
                />
                <text
                  x={VALUE_X}
                  y={y + 20}
                  className="chart-text"
                  fontSize={16}
                  fontWeight={600}
                  fill="var(--text-heading)"
                >
                  {stage.display}
                </text>
                <text x={VALUE_X} y={y + 38} className="chart-text" fontSize={12} fill="var(--text-secondary)">
                  {stage.share_display}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* ต้องบอกฐานของร้อยละเสมอ ไม่งั้นคนอ่านจะเข้าใจว่าเทียบกับขั้นก่อนหน้า (ข้อ 1.3 v2.2) */}
      <figcaption className="chart__note">ร้อยละเทียบกับขั้นแรก ({first.label_th}) · นับตามช่วงเวลา</figcaption>
    </figure>
  );
}
