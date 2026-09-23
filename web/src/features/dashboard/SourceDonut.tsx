import type { ChannelBreakdown, ChannelSegment } from "./charts.types";

/* แหล่งที่มาลูกค้า (W2 · C-CHART-DONUT · sitemap-screen-specs ข้อ 5.5 · CANONICAL ข้อ 13.3)
   โครงเดียวกับ JCRM.chart.donut ใน prototype/assets/app.js — R 84 · วงหนา 32 · stroke-dasharray

   กติกาข้อ 20.15: ร้อยละทุกตัวคือ segment.pct_display ที่ฐานข้อมูลปัดมาแล้ว
   ส่วน segment.pct (0–1) ใช้เฉพาะความยาวส่วนโค้ง — หน้าจอไม่เคยหาร value ด้วย total
   และเลขกลางวงคือ channels.total_display ซึ่งตรงกับการ์ด "ลูกค้าไม่ซ้ำ" เป๊ะ
   ที่ตรงได้เพราะฐานข้อมูลจัดลูกค้าหนึ่งคนไว้ช่องทางเดียว (crm.customers.first_channel_code)
   ผลรวมของทุกส่วนจึงเท่ากับจำนวนลูกค้าไม่ซ้ำพอดี — ถึงอย่างนั้นก็ยังต้องใช้ total_display
   ที่ RPC ส่งมา ห้ามบวก segment เองที่หน้าจอ (ข้อ 20.15)

   ทำไมต้องมีตารางข้างกราฟ: สีอย่างเดียวสื่อความหมายไม่ได้ (ข้อ 15) คนตาบอดสี
   และคนที่พิมพ์หน้าจอเป็นขาวดำต้องอ่านชื่อช่องทางกับตัวเลขได้ตรง ๆ */

const R = 84;
const RING = 32;
const CENTER = 100;
/** เส้นรอบวงของวงกลมรัศมี R — ฐานของ stroke-dasharray ทั้งหมด (พิกัด SVG ล้วน) */
const CIRCUMFERENCE = 2 * Math.PI * R;
/** ขอบในและขอบนอกของวง เผื่อ 1px ให้เส้นคั่นยาวพ้นวงทั้งสองด้าน */
const R_INNER = R - RING / 2 - 1;
const R_OUTER = R + RING / 2 + 1;

type Arc = { seg: ChannelSegment; dashArray: string; dashOffset: number; angle: number };

/* แปลงส่วนแบ่งเป็นตำแหน่งบนวง — สะสม pct ที่ฐานข้อมูลคิดมาแล้ว ไม่ใช่สะสม value แล้วหารเอง
   ค่าที่ได้เป็นพิกัดวาดทั้งหมด ไม่มีตัวไหนถูกแสดงเป็นตัวเลขให้ผู้ใช้อ่าน */
function arcsOf(segments: ChannelSegment[]): Arc[] {
  const arcs: Arc[] = [];
  /** ความยาวส่วนโค้งที่วาดไปแล้ว (หน่วยเดียวกับเส้นรอบวง) → จุดเริ่มของส่วนถัดไป */
  let drawn = 0;
  /** สัดส่วนรอบวงที่ผ่านไปแล้ว 0–1 → มุมของเส้นคั่น 2px ระหว่างส่วน (ข้อ 15) */
  let turned = 0;
  for (const seg of segments) {
    const len = CIRCUMFERENCE * seg.pct;
    arcs.push({
      seg,
      dashArray: `${len} ${CIRCUMFERENCE - len}`,
      dashOffset: -drawn,
      angle: -Math.PI / 2 + 2 * Math.PI * turned,
    });
    drawn = drawn + len;
    turned = turned + seg.pct;
  }
  return arcs;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="state state--compact">
      <p className="state__title">{title}</p>
      <p className="state__text">{text}</p>
    </div>
  );
}

export function SourceDonut({
  channels,
  id = "dash-donut",
}: {
  channels: ChannelBreakdown;
  id?: string;
}) {
  /* ขอบเขต TEAM/OWN (scope.partial) ทำให้ฐานข้อมูลคืน total = null และ segments ว่าง
     ต้องบอกตรง ๆ ว่า "ข้อมูลไม่พอแสดง" ไม่ใช่วาดวงเปล่าหรือหารศูนย์
     ผู้ใช้จะได้ไม่คิดว่าช่วงนี้ไม่มีลูกค้าเลย (ข้อ 12.4) */
  if (channels.total === null || channels.total_display === null) {
    return (
      <EmptyState
        title="ข้อมูลไม่พอแสดง"
        text="สิทธิ์ของคุณเห็นลูกค้าเฉพาะงานของทีม/ของตัวเอง จึงนับลูกค้าไม่ซ้ำแยกตามช่องทางไม่ได้"
      />
    );
  }

  /* แสดงเฉพาะช่องทางที่มีลูกค้าจริง (ข้อ 13.3 · D3 เหมือน prototype)
     ช่องทางที่เป็นศูนย์ถ้าวาดจะได้ส่วนโค้งยาวศูนย์ที่มองไม่เห็น แต่กินที่ในตารางและ legend */
  const segments = channels.segments.filter((s) => Number(s.value) > 0);
  if (segments.length === 0) {
    return (
      <EmptyState title="ยังไม่มีข้อมูลในช่วงนี้" text="เมื่อมีลูกค้าเข้ามาในช่วงเวลาที่เลือก กราฟจะขึ้นให้เอง" />
    );
  }

  const arcs = arcsOf(segments);
  const desc = segments.map((s) => `${s.label_th} ${s.display} ${s.pct_display}`).join(" · ");

  return (
    <figure className="chart">
      <div className="chart__row">
        <div className="chart__donut chart__graphic">
          <svg viewBox="0 0 200 200" role="img" aria-labelledby={`${id}-t ${id}-d`}>
            <title id={`${id}-t`}>แหล่งที่มาลูกค้า</title>
            <desc id={`${id}-d`}>{`แหล่งที่มาลูกค้า ลูกค้าไม่ซ้ำ ${channels.total_display}: ${desc}`}</desc>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={R}
              fill="none"
              stroke="var(--chart-track)"
              strokeWidth={RING}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.seg.code}
                cx={CENTER}
                cy={CENTER}
                r={R}
                fill="none"
                stroke={`var(${arc.seg.chart_token})`}
                strokeWidth={RING}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
            ))}
            {arcs.length > 1
              ? arcs.map((arc) => (
                  <line
                    key={`sep-${arc.seg.code}`}
                    x1={CENTER + R_INNER * Math.cos(arc.angle)}
                    y1={CENTER + R_INNER * Math.sin(arc.angle)}
                    x2={CENTER + R_OUTER * Math.cos(arc.angle)}
                    y2={CENTER + R_OUTER * Math.sin(arc.angle)}
                    stroke="var(--chart-separator)"
                    strokeWidth={2}
                  />
                ))
              : null}
            <text
              x={CENTER}
              y={CENTER}
              textAnchor="middle"
              className="chart-text"
              fontSize={28}
              fontWeight={600}
              fill="var(--text-heading)"
            >
              {channels.total_display}
            </text>
            <text
              x={CENTER}
              y={124}
              textAnchor="middle"
              className="chart-text"
              fontSize={13}
              fill="var(--text-secondary)"
            >
              ลูกค้าไม่ซ้ำ
            </text>
          </svg>
        </div>
        <div className="table-wrap" style={{ flex: "1 1 200px", minWidth: 0 }}>
          <table className="table table--compact">
            <caption className="sr-only">แหล่งที่มาลูกค้าแยกตามช่องทาง</caption>
            <thead>
              <tr>
                <th scope="col">ช่องทาง</th>
                <th scope="col">จำนวน</th>
                <th scope="col">ร้อยละ</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg) => (
                <tr key={seg.code}>
                  <th scope="row" className="nowrap">
                    <span
                      className="legend-item__swatch"
                      style={{ background: `var(${seg.chart_token})`, display: "inline-block", marginInlineEnd: "6px" }}
                      aria-hidden="true"
                    />
                    {seg.label_th}
                  </th>
                  <td className="num">{seg.display}</td>
                  <td className="num">{seg.pct_display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </figure>
  );
}
