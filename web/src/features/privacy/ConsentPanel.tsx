import Link from "next/link";

import { dateTime } from "@/lib/format/date";
import { DASH } from "@/lib/format/number";

import { ConsentStatusBadge, DefList } from "./Bits";
import { ConsentForm, LegalHoldForm } from "./ConsentForms";
import type { ButtonState } from "./scope";
import {
  CONSENT_VIA_LABEL,
  RECORD_STATUS_LABEL,
  purposeLabel,
  type ConsentPurpose,
  type ConsentRow,
  type CurrentConsent,
  type CustomerBrief,
  type StaffBrief,
} from "./types";

/* แท็บ "ความยินยอม" ของหน้า 17

   ค้นลูกค้าด้วยรหัสลูกค้าแบบตรงทั้งค่า แล้วดูความยินยอมของรายนั้น
   ไม่มีการไล่ดูความยินยอมของทั้งฐาน เพราะความยินยอมเป็นข้อมูลส่วนบุคคล
   การเปิดดูจึงต้องมีคนที่ตั้งใจจะดูรายนั้นจริง ๆ (ข้อ 10.2 · หลักเปิดเผยเท่าที่จำเป็น)

   ตัวเลขสรุปความยินยอมการตลาดยังไม่มีในหน้านี้ เพราะยังไม่มี RPC ที่คืนตัวเลขนั้น
   และการนับเองที่หน้าจอคือการคิด KPI ซ้ำ ซึ่งกติกาของโครงการห้ามไว้ (ดู blockers) */

type Props = {
  /** คำค้นที่ผู้ใช้พิมพ์ — ว่าง = ยังไม่ได้ค้น */
  query: string;
  /** รูปแบบรหัสลูกค้าไม่ถูกต้อง */
  invalidFormat: boolean;
  customer: CustomerBrief | null;
  current: CurrentConsent[];
  history: ConsentRow[];
  purposes: ConsentPurpose[];
  staff: Map<string, StaffBrief>;
  noticeVersion: string | null;
  /** ใครเป็นผู้ตั้ง legal hold ไว้ (จาก audit) — null = ไม่มีหรือดูไม่ได้ */
  holdBy: string | null;
  consent: ButtonState;
  manage: ButtonState;
  /** มีสิทธิ์เปิดหน้าข้อมูลลูกค้าไหม — ใช้ตัดสินว่าจะวางลิงก์ไป Customer 360 หรือไม่ */
  canOpenCustomer: boolean;
};

export function ConsentPanel(props: Props) {
  const { query, invalidFormat, customer, noticeVersion } = props;

  return (
    <div className="tabpanel stack">
      {/* ฟอร์ม GET ธรรมดา — คำค้นไปอยู่ใน query string จึงกดย้อนกลับและแชร์ลิงก์ได้ */}
      <form className="filter-bar filter-bar--panel" role="search" aria-label="ค้นหาความยินยอมด้วยรหัสลูกค้า">
        <input type="hidden" name="tab" value="consent" />
        <div className="field field--inline">
          <label className="label" htmlFor="pv-cus">
            รหัสลูกค้า
          </label>
          <input
            className="input"
            id="pv-cus"
            name="cus"
            type="text"
            autoComplete="off"
            placeholder="CUS-YYYY-NNNNNN"
            defaultValue={query}
            aria-invalid={invalidFormat ? true : undefined}
          />
        </div>
        <button type="submit" className="btn btn--primary">
          ค้นหา
        </button>
        {query ? (
          <Link className="btn btn--ghost" href={{ pathname: "/privacy", query: { tab: "consent" } }}>
            ล้างคำค้น
          </Link>
        ) : null}
      </form>

      <p className="help">
        ความยินยอมเป็นแบบ append-only (ถอน = แถวใหม่สถานะ “ถอนแล้ว”) · สถานะปัจจุบัน = แถวล่าสุดต่อวัตถุประสงค์
        ซึ่งฐานข้อมูลเป็นผู้ชี้ให้ · ฉบับประกาศความเป็นส่วนตัวปัจจุบัน {noticeVersion ?? DASH}
      </p>

      {invalidFormat ? (
        <p className="error-text" role="alert">
          รูปแบบรหัสลูกค้าคือ CUS-YYYY-NNNNNN
        </p>
      ) : null}

      {query && !invalidFormat && !customer ? (
        <div className="state">
          <p className="state__title">ไม่พบลูกค้ารหัส {query}</p>
          <p className="state__text">รหัสอาจไม่ถูกต้อง หรืออยู่นอกขอบเขตที่คุณดูได้</p>
        </div>
      ) : null}

      {customer ? <CustomerConsents {...props} customer={customer} /> : null}
    </div>
  );
}

function CustomerConsents({
  customer,
  current,
  history,
  purposes,
  staff,
  noticeVersion,
  holdBy,
  consent,
  manage,
  canOpenCustomer,
}: Props & { customer: CustomerBrief }) {
  const anonymized = customer.record_status === "ANONYMIZED";

  return (
    <div className="stack">
      <section className="card stack" aria-label="ความยินยอมของลูกค้า">
        <div className="card__header">
          <div>
            <h2 className="card__title">
              {customer.display_name} · <span className="code">{customer.customer_no}</span>
            </h2>
            <p className="card__subtitle">
              สถานะแถว: {RECORD_STATUS_LABEL[customer.record_status] ?? customer.record_status}
              {customer.legal_hold ? " · ระงับการลบตามกฎหมาย" : ""}
            </p>
          </div>
          {canOpenCustomer ? (
            <Link className="btn btn--ghost btn--sm" href={`/customers/${customer.customer_no}`}>
              เปิดข้อมูลลูกค้า
            </Link>
          ) : null}
        </div>

        <section aria-label="สถานะความยินยอมปัจจุบัน" className="stack">
          <h3 className="section__title">สถานะปัจจุบัน</h3>
          {current.length === 0 ? (
            <p className="help">ยังไม่มีความยินยอมของลูกค้ารายนี้</p>
          ) : (
            <div className="table-wrap">
              <table className="table table--compact">
                <caption className="sr-only">สถานะความยินยอมปัจจุบัน</caption>
                <thead>
                  <tr>
                    <th scope="col">วัตถุประสงค์</th>
                    <th scope="col">สถานะ</th>
                    <th scope="col">ช่องทาง</th>
                    <th scope="col">ฉบับประกาศ</th>
                    <th scope="col">บันทึกเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((c) => (
                    <tr key={c.purpose_code}>
                      <td>{purposeLabel(c.purpose_code, purposes)}</td>
                      <td>
                        <ConsentStatusBadge status={c.status} />
                      </td>
                      <td>{c.channels && c.channels.length > 0 ? c.channels.join(" · ") : DASH}</td>
                      <td>{c.notice_version ?? DASH}</td>
                      <td className="nowrap">{c.captured_at ? dateTime(c.captured_at) : DASH}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="ประวัติความยินยอม" className="stack">
          <h3 className="section__title">ประวัติ (แก้ไขหรือลบไม่ได้)</h3>
          {history.length === 0 ? (
            <p className="help">ยังไม่มีประวัติความยินยอมที่คุณดูได้</p>
          ) : (
            <div className="table-wrap">
              <table className="table table--compact">
                <caption className="sr-only">ประวัติความยินยอม</caption>
                <thead>
                  <tr>
                    <th scope="col">วัตถุประสงค์</th>
                    <th scope="col">สถานะ</th>
                    <th scope="col">ช่องทาง</th>
                    <th scope="col">ฉบับประกาศ</th>
                    <th scope="col">บันทึกเมื่อ</th>
                    <th scope="col">วิธีได้รับ</th>
                    <th scope="col">ผู้บันทึก</th>
                    <th scope="col">หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => (
                    <tr key={c.consent_id}>
                      <td>{purposeLabel(c.purpose_code, purposes)}</td>
                      <td>
                        <ConsentStatusBadge status={c.status} />
                      </td>
                      <td>{c.channels.length > 0 ? c.channels.join(" · ") : DASH}</td>
                      <td>{c.notice_version ?? DASH}</td>
                      <td className="nowrap">{dateTime(c.captured_at)}</td>
                      <td>{CONSENT_VIA_LABEL[c.captured_via] ?? c.captured_via}</td>
                      <td>
                        {c.captured_by
                          ? (staff.get(c.captured_by)?.display_name ?? DASH)
                          : DASH}
                      </td>
                      <td>{c.evidence ?? DASH}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      {/* บันทึกความยินยอมได้เฉพาะลูกค้าที่ยังเป็นแถวปกติ — api.record_consent ปฏิเสธแถว ANONYMIZED/MERGED อยู่แล้ว */}
      {consent.visible ? (
        <section className="card stack" aria-labelledby="pv-consent-form">
          <div className="card__header">
            <div>
              <h2 className="card__title" id="pv-consent-form">
                บันทึกความยินยอม
              </h2>
              <p className="card__subtitle">บันทึกเป็นแถวใหม่เสมอ · แถวเดิมยังอยู่ครบเพื่อใช้พิสูจน์ย้อนหลัง</p>
            </div>
          </div>
          <ConsentForm
            customerId={customer.customer_id}
            purposes={purposes}
            noticeVersion={noticeVersion}
            blockedReason={consent.reason ?? (anonymized ? "ลูกค้ารายนี้ทำข้อมูลนิรนามแล้ว" : null)}
          />
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="pv-hold">
        <div className="card__header">
          <div>
            <h2 className="card__title" id="pv-hold">
              Legal hold
            </h2>
            <p className="card__subtitle">ระงับการลบตามกฎหมาย (ข้อ 10.3)</p>
          </div>
        </div>

        <DefList
          items={[
            {
              term: "สถานะ",
              value: customer.legal_hold ? (
                <span className="badge badge--warning badge--square">อยู่ระหว่างระงับการลบตามกฎหมาย</span>
              ) : (
                DASH
              ),
            },
            { term: "ผู้ตั้งล่าสุด", value: holdBy ?? DASH },
          ]}
        />

        {manage.visible ? (
          <LegalHoldForm
            customerId={customer.customer_id}
            customerNo={customer.customer_no}
            on={customer.legal_hold}
            blockedReason={manage.reason}
          />
        ) : null}
      </section>
    </div>
  );
}
