/* ตารางเวลางานระบบ (อ่านอย่างเดียว)

   ทำไมต้องมีในหน้าตั้งค่า: ค่าตั้งกลุ่ม SLA และการแจ้งเตือนส่วนใหญ่ "ไม่ได้มีผลทันที"
   แต่มีผลรอบถัดไปของงานตามเวลา ผู้ดูแลที่เพิ่งแก้ค่าจึงต้องรู้ว่าอีกนานแค่ไหนจึงจะเห็นผล
   ถ้าไม่บอกไว้ จะกลายเป็น "แก้แล้วไม่เห็นอะไรเปลี่ยน" ทั้งที่ระบบทำงานถูกต้อง

   ค่าคัดจาก supabase/migrations/0014_schedule_cron.sql ตรงตัว (เวลา Asia/Bangkok → cron UTC)
   ตารางนี้ตั้งใน migration เท่านั้น แก้จากหน้าจอไม่ได้ (ข้อ 9.6) */

const JOBS: { job: string; when: string; cron: string; does: string }[] = [
  {
    job: "app.job_notifications",
    when: "ทุก 5 นาที",
    cron: "*/5 * * * *",
    does: "สร้างการแจ้งเตือนตามเวลา — ใช้ค่าตั้งกลุ่ม SLA · เวลาทำการ · การแจ้งเตือนสรุปประจำวัน",
  },
  {
    job: "app.job_expire_exports",
    when: "ทุกชั่วโมง นาทีที่ 15",
    cron: "15 * * * *",
    does: "คำขอส่งออกที่ไฟล์เกินอายุ → หมดอายุ (ใช้ export.link_ttl_hours)",
  },
  {
    job: "app.job_close_stale_visits",
    when: "00:05 น. ทุกวัน",
    cron: "5 17 * * *",
    does: "ปิด visit ค้างของวันก่อนหน้า แล้วสรุป “ไม่ได้บันทึกผล” ให้ผู้จัดการสาขา",
  },
  {
    job: "app.job_expire_quotations",
    when: "00:10 น. ทุกวัน",
    cron: "10 17 * * *",
    does: "ใบเสนอราคาที่พ้นวันใช้ได้ → หมดอายุ (วันใช้ได้มาจาก quotation.valid_days)",
  },
  {
    job: "app.job_retention",
    when: "02:00 น. ทุกวัน",
    cron: "0 19 * * *",
    does: "ระยะเก็บข้อมูล: แจ้งล่วงหน้า · ทำข้อมูลนิรนาม · ลบ log ที่ครบกำหนด (ข้อ 10.3)",
  },
];

export function SystemJobs() {
  return (
    <section className="card card--flush st-group" aria-labelledby="set-jobs">
      <div className="card__header">
        <div>
          <h2 className="card__title" id="set-jobs">
            ตารางเวลางานระบบ (อ่านอย่างเดียว)
          </h2>
          <p className="card__subtitle">
            ค่าตั้งที่ “มีผลรอบถัดไป” จะเห็นผลตามตารางนี้ · pg_cron รันในฐานข้อมูล ตั้งใน migration เท่านั้น (ข้อ 9.6)
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table table--compact">
          <caption className="sr-only">ตารางเวลางานระบบ</caption>
          <thead>
            <tr>
              <th scope="col">งาน</th>
              <th scope="col">เวลา (Asia/Bangkok)</th>
              <th scope="col">cron (UTC)</th>
              <th scope="col">หน้าที่</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((j) => (
              <tr key={j.job}>
                <th scope="row" style={{ fontWeight: "var(--fw-regular)" }}>
                  <span className="st-key">{j.job}</span>
                </th>
                <td>{j.when}</td>
                <td>
                  <span className="st-key">{j.cron}</span>
                </td>
                <td>{j.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
