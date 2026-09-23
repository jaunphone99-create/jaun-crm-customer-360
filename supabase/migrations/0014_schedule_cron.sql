-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0014 : ตารางเวลาของงานระบบ (pg_cron) — **Supabase เท่านั้น**
--
-- ไฟล์นี้ลงท้ายด้วย _cron.sql ตาม CANONICAL ข้อ 9.6 → tools/db/run.mjs (PGlite) **ข้ามไฟล์นี้**
-- เพราะ pg_cron มีเฉพาะบน Supabase · เนื้อหาในไฟล์นี้ต้องมีแต่การตั้งตารางเวลาเท่านั้น
-- ห้ามสร้าง/แก้ตาราง ฟังก์ชัน หรือสิทธิ์ ในไฟล์นี้ (ตรรกะทั้งหมดอยู่ใน 0013_jobs.sql)
--
-- ตารางเวลา (CANONICAL ข้อ 9.6) · เวลาที่ระบุเป็น Asia/Bangkok · pg_cron ใช้ **UTC** (Asia/Bangkok = UTC+7)
--   app.job_close_stale_visits   00:05 น.            → '5 17 * * *'
--   app.job_expire_quotations    00:10 น.            → '10 17 * * *'
--   app.job_retention            02:00 น.            → '0 19 * * *'
--   app.job_expire_exports       ทุกชั่วโมง นาทีที่ 15 → '15 * * * *'
--   app.job_notifications        ทุก 5 นาที          → '*/5 * * * *'
--
-- pg_cron รันในฐานข้อมูลในฐานะ `postgres` (ข้อ 9.6) · งานทุกตัวรับ p_as_of ได้ แต่ตารางเวลาเรียกโดยไม่ส่ง
-- ค่า → ใช้ app.clock() ซึ่งบน prod เท่ากับ now() (ข้อ 1.2)
-- การลบไฟล์ใน Storage ทำโดย Edge Function `cron-export-cleanup` ที่อ่าน api.svc_expired_export_files()
-- **[รอยืนยัน — หรือใช้ scheduler ภายนอกเรียก Edge Function แทน pg_cron ตามข้อ 1]**
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ถอนตารางเดิมก่อนตั้งใหม่ เพื่อให้ migration รันซ้ำได้ (cron.schedule ชื่อเดิมจะ "แทนที่" อยู่แล้ว
-- แต่ถอนก่อนทำให้พฤติกรรมชัดเจนและไม่พึ่งเวอร์ชันของ pg_cron)
DO $$
DECLARE
    v_job text;
BEGIN
    FOREACH v_job IN ARRAY ARRAY['jaun_close_stale_visits', 'jaun_expire_quotations',
                                 'jaun_retention', 'jaun_expire_exports', 'jaun_notifications'] LOOP
        IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_job) THEN
            PERFORM cron.unschedule(v_job);
        END IF;
    END LOOP;
END;
$$;

-- 00:05 Asia/Bangkok — ปิด visit ค้างของวันธุรกิจก่อนหน้า + สรุป VISIT_OUTCOME_MISSING ให้ผู้จัดการสาขา (ข้อ 4.1)
SELECT cron.schedule('jaun_close_stale_visits', '5 17 * * *',
                     $$SELECT app.job_close_stale_visits();$$);

-- 00:10 Asia/Bangkok — ใบเสนอราคาที่พ้น valid_until → EXPIRED (ข้อ 4.6)
SELECT cron.schedule('jaun_expire_quotations', '10 17 * * *',
                     $$SELECT app.job_expire_quotations();$$);

-- 02:00 Asia/Bangkok — ระยะเก็บข้อมูล: แจ้งล่วงหน้า · anonymize · ลบ log (ข้อ 10.3 · 19.4 ข้อ 1)
SELECT cron.schedule('jaun_retention', '0 19 * * *',
                     $$SELECT app.job_retention();$$);

-- ทุกชั่วโมง นาทีที่ 15 — คำขอส่งออกที่ไฟล์เกินอายุ → EXPIRED (ข้อ 8.2)
SELECT cron.schedule('jaun_expire_exports', '15 * * * *',
                     $$SELECT app.job_expire_exports();$$);

-- ทุก 5 นาที — การแจ้งเตือนที่เป็นงานตามเวลา (ข้อ 11.1)
SELECT cron.schedule('jaun_notifications', '*/5 * * * *',
                     $$SELECT app.job_notifications();$$);
