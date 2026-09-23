import { clockText, compareText, periodText } from "./period";
import type { KpiResult } from "./types";

/* แถบบอก "ที่มาและเวลาอ้างอิง" ของตัวเลขทั้งหน้า

   ทำไมต้องมี: ตัวเลข KPI ถูกคัดลอกไปใส่สไลด์ประชุมเสมอ ถ้าไม่บอกว่าเป็นช่วงไหนและ ณ เวลาใด
   คนอ่านจะเทียบกับตัวเลขที่จำได้จากสัปดาห์ก่อนแล้วสรุปผิด — เวลาที่แสดงคือ app.clock()
   ของฐานข้อมูล ไม่ใช่นาฬิกาเครื่องผู้ใช้ (CANONICAL ข้อ 1.2)

   บรรทัด "ขอบเขตบางส่วน" แสดงเมื่อ RPC บอกว่ามีสาขาที่ผู้ใช้เห็นได้แค่ทีม/ของตัวเอง
   ซึ่งทำให้ KPI ที่ไม่มีการผูกพนักงานคืน NULL และการ์ดขึ้น "–" (ข้อ 12.4)
   ถ้าไม่อธิบาย ผู้ใช้จะคิดว่าระบบพังหรือข้อมูลหาย */

export function SourceBar({ result, scopeLabel }: { result: KpiResult; scopeLabel: string }) {
  return (
    <div className="state-bar" role="note" style={{ marginBottom: "var(--space-4)" }}>
      <div>
        <p>
          ตัวเลขทุกตัวมาจาก <span className="code">api.get_kpis</span> · ขอบเขต {scopeLabel} · {periodText(result)}{" "}
          · {compareText(result)}
        </p>
        <p className="t-sm">ข้อมูล {clockText(result)}</p>
        {result.scope.partial ? (
          <p className="t-sm">
            สิทธิ์ของคุณเห็นบางสาขาเฉพาะงานของทีม/ของตัวเอง ตัวเลขที่นับไม่ได้ตามผู้รับผิดชอบจึงแสดงเป็น “–”
          </p>
        ) : null}
      </div>
    </div>
  );
}
