import { dateTime } from "@/lib/format/date";
import { DASH, showing } from "@/lib/format/number";

import type { SecurityResult } from "./queries";

/* แท็บ "บันทึกความปลอดภัย" (sitemap-screen-specs ข้อ 19.2 · 19.4)

   api.search_security_log คืนสองก้อนแยกกัน และตั้งใจไม่เหมือนแท็บธุรกิจ:
     login_events  — เหตุการณ์เข้าสู่ระบบทั้งหมด (audit.login_events)
     audit_entries — เฉพาะ action ROLE_* · STAFF_* · MFA_* · PERMISSION_CHANGED ·
                     SETTINGS_UPDATED · INTEGRATION_UPDATED และตัดรายการที่เป็นลูกค้าออก

   ก้อน audit_entries ไม่มี before/after มาด้วย (RPC ไม่ได้ใส่ให้) จึงไม่มีแถวกางในแท็บนี้
   นี่คือความตั้งใจของฐานข้อมูล ไม่ใช่ของขาด — SYSTEM_ADMIN ดูแลระบบได้โดยไม่เห็นข้อมูลในรายการ (ข้อ 14.1)
   หน้าจอจึงไม่ไปหาทางเติมให้ครบ */

export function SecurityPanel({ data }: { data: SecurityResult }) {
  return (
    <div className="stack">
      <section className="card card--flush" aria-labelledby="au-sec-login">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="au-sec-login">
              เหตุการณ์เข้าสู่ระบบ
            </h2>
            <p className="card__subtitle">
              audit.login_events — รหัสผ่าน SSO MFA ต่ออายุเซสชัน และการล็อกบัญชี (ข้อ 9.2)
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">เหตุการณ์เข้าสู่ระบบ</caption>
            <thead>
              <tr>
                <th scope="col">เวลา</th>
                <th scope="col">เหตุการณ์</th>
                <th scope="col">วิธี</th>
                <th scope="col">ผล</th>
                <th scope="col" className="col-hide-tablet">
                  ระดับการยืนยันตัวตน
                </th>
                <th scope="col" className="col-hide-tablet">
                  ip · อุปกรณ์
                </th>
              </tr>
            </thead>
            <tbody>
              {data.logins.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap num">{dateTime(e.occurred_at)}</td>
                  <td>
                    <span className="code">{e.event_type}</span>
                  </td>
                  <td>{e.method ? <span className="code">{e.method}</span> : <span className="is-null">{DASH}</span>}</td>
                  <td>
                    <span className={`badge ${e.success ? "badge--success" : "badge--danger"} badge--square`}>
                      {e.success ? "สำเร็จ" : "ไม่สำเร็จ"}
                    </span>
                    {/* failure_reason เป็นสาเหตุภายในที่ผู้ดูแลต้องเห็นเพื่อแยกแยะ
                        ไม่ใช่ข้อความที่แสดงตอนผู้ใช้ล็อกอินผิด ซึ่งต้องเหมือนกันทุกกรณี (ข้อ 9.2) */}
                    {e.failure_reason ? <span className="cell-sub">{e.failure_reason}</span> : null}
                  </td>
                  <td className="col-hide-tablet">{e.aal ?? DASH}</td>
                  <td className="col-hide-tablet">
                    {e.ip ?? DASH} · {e.device_id ?? DASH}
                  </td>
                </tr>
              ))}
              {data.logins.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="state">
                      <p className="state__title">ไม่พบประวัติตามเงื่อนไข</p>
                      <p className="state__text">ไม่มีเหตุการณ์เข้าสู่ระบบในช่วงเวลาที่เลือก</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>{showing(data.logins.length, data.logins.length, { unit: "รายการ" })}</span>
        </div>
        <p className="help">ip และข้อมูลอุปกรณ์เป็นค่าที่อุปกรณ์รายงาน ไม่ใช่หลักฐาน</p>
      </section>

      <section className="card card--flush" aria-labelledby="au-sec-audit">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="au-sec-audit">
              การเปลี่ยนบทบาท ผู้ใช้ และค่าตั้ง
            </h2>
            <p className="card__subtitle">
              ROLE_* · STAFF_* · MFA_* · PERMISSION_CHANGED · SETTINGS_UPDATED · INTEGRATION_UPDATED
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">การเปลี่ยนบทบาท ผู้ใช้ และค่าตั้ง</caption>
            <thead>
              <tr>
                <th scope="col">เวลา</th>
                <th scope="col">ผู้กระทำ</th>
                <th scope="col">การกระทำ</th>
                <th scope="col">รายการ</th>
                <th scope="col">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap num">{dateTime(e.occurred_at)}</td>
                  <td>
                    {e.actor_staff_code ? (
                      <span className="nowrap">
                        {e.actor_staff_code}
                        {e.actor_label ? ` ${e.actor_label}` : ""}
                      </span>
                    ) : (
                      <span className="is-null">{DASH}</span>
                    )}
                  </td>
                  <td>
                    <span className="code">{e.action}</span>
                  </td>
                  <td>{e.entity_ref ?? <span className="is-null">{DASH}</span>}</td>
                  <td>
                    {e.reason ??
                      (e.changed_fields?.length ? `เปลี่ยน ${e.changed_fields.join(" · ")}` : null) ?? (
                        <span className="is-null">{DASH}</span>
                      )}
                  </td>
                </tr>
              ))}
              {data.entries.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="state">
                      <p className="state__title">ไม่พบประวัติตามเงื่อนไข</p>
                      <p className="state__text">ไม่มีการเปลี่ยนบทบาทหรือค่าตั้งในช่วงเวลาที่เลือก</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>{showing(data.entries.length, data.entries.length, { unit: "รายการ" })}</span>
          {data.truncated ? (
            <span className="t-sm t-muted">
              ผลถูกตัดที่เพดาน 200 แถวของ RPC — ระบุช่วงเวลาให้แคบลงเพื่อให้เห็นครบ
            </span>
          ) : null}
        </div>
        <p className="help">
          บันทึกความปลอดภัยไม่คืนประวัติการเข้าถึงข้อมูลลูกค้าและรายการที่เป็นลูกค้า และไม่คืนค่าก่อน/หลัง
          ของแต่ละช่อง — ฐานข้อมูลเป็นผู้ตัดออกให้เอง (ข้อ 9.5 · 14.1)
        </p>
      </section>
    </div>
  );
}
