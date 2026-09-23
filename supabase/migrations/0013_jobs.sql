-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0013 : งานตามเวลา (job) — ปิด visit ค้าง · หมดอายุใบเสนอราคา/ไฟล์ส่งออก · แจ้งเตือน · ระยะเก็บข้อมูล
-- target        : Supabase PostgreSQL 17 (ทดสอบบน PGlite 0.4.1 = PG 17.5 ผ่าน tools/db/run.mjs)
--
-- ค่าอ้างอิงทั้งหมดมาจาก docs/00-brief/CANONICAL.md (v2.2) เท่านั้น
--   ข้อ 1.2   app.clock() · ขอบวัน Asia/Bangkok
--   ข้อ 4.1   app.job_close_stale_visits 00:05 → COMPLETED + UNRECORDED + ended_at 23:59:59 + closed_by_system
--   ข้อ 4.6   app.job_expire_quotations 00:00 วันถัดจาก valid_until
--   ข้อ 8.2   app.job_expire_exports → GENERATED/DOWNLOADED ที่เกิน export.link_ttl_hours เป็น EXPIRED (download_count คงไว้)
--   ข้อ 9.5   actor ของงานระบบ: actor_type SYSTEM · actor_label 'SYSTEM:{job}'
--   ข้อ 9.6   รายชื่องานและตารางเวลา (ไฟล์ *_cron.sql แยกต่างหาก)
--   ข้อ 10.3  ระยะเก็บข้อมูล · ข้อ 19.4 ข้อ 1 app.job_retention เป็น SECURITY INVOKER + SET LOCAL ROLE audit_retention
--   ข้อ 11.1  รายการแจ้งเตือน · dedupe_key = '{code}:{entity_id}:{level}:{วันที่ของจุดยึด}' · เวลาทำการ · การยกระดับ
--   ข้อ 11.2  app.settings ที่ใช้
--
-- กติกาของไฟล์นี้:
--   · ทุกฟังก์ชันอยู่ใน schema app · **ไม่ GRANT ให้ authenticated** (cron เรียกในฐานะ postgres · ข้อ 9.6)
--   · ทุกงานรับ p_as_of เพื่อให้ทดสอบซ้ำได้และรันย้อนหลังได้ (idempotent ผ่าน dedupe_key)
--   · อ้างชื่อเต็ม schema.object เสมอ · ทุกฟังก์ชัน SET search_path = '' (ยกเว้นที่ระบุ)
--   · ไม่มี BEGIN/COMMIT ในไฟล์
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 1 — helper ของค่าตั้งและการแสดงวันเวลา (CANONICAL ข้อ 11.2 · 19.5 ข้อ 4)
-- =====================================================================================

CREATE FUNCTION app.setting_int_at(p_key text, p_index integer, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT CASE WHEN jsonb_typeof(s.value -> p_index) = 'number'
                                 THEN (s.value ->> p_index)::integer END
                       FROM app.settings s WHERE s.key = p_key), p_default)
$$;

COMMENT ON FUNCTION app.setting_int_at(text, integer, integer) IS
'อ่านสมาชิกของค่าตั้งแบบ array ใน app.settings (ข้อ 11.2) เช่น escalation.overdue_hours = [24,48] · sla.opportunity_stale_days = [7,14] · '
'ไม่มีคีย์/ไม่ใช่ตัวเลข → p_default · ภายใน ไม่ GRANT';

CREATE FUNCTION app.setting_time(p_key text, p_default time)
RETURNS time
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT CASE WHEN jsonb_typeof(s.value) = 'string' THEN (s.value #>> '{}')::time END
                       FROM app.settings s WHERE s.key = p_key), p_default)
$$;

COMMENT ON FUNCTION app.setting_time(text, time) IS
'อ่านค่าตั้งแบบเวลา "HH:MM" จาก app.settings (ข้อ 11.2) เช่น notify.duplicate_digest_time · notify.data_missing_time · ภายใน ไม่ GRANT';

CREATE FUNCTION app.fmt_date_th(p_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_ts IS NULL THEN NULL ELSE
        extract(day FROM (p_ts AT TIME ZONE 'Asia/Bangkok'))::integer::text || ' '
        || (ARRAY['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'])
             [extract(month FROM (p_ts AT TIME ZONE 'Asia/Bangkok'))::integer] || ' '
        || (extract(year FROM (p_ts AT TIME ZONE 'Asia/Bangkok'))::integer + 543)::text
    END
$$;

CREATE FUNCTION app.fmt_datetime_th(p_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_ts IS NULL THEN NULL
                ELSE app.fmt_date_th(p_ts) || ' ' || to_char(p_ts AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') END
$$;

CREATE FUNCTION app.fmt_time_th(p_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_ts IS NULL THEN NULL
                ELSE to_char(p_ts AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') || ' น.' END
$$;

COMMENT ON FUNCTION app.fmt_date_th(timestamptz)     IS 'วันที่แบบ พ.ศ. ย่อ ''10 ก.ย. 2569'' (ข้อ 1.2)';
COMMENT ON FUNCTION app.fmt_datetime_th(timestamptz) IS 'วันและเวลา ''10 ก.ย. 2569 15:00'' · ไม่มี "น." เมื่อมีวันที่ (ข้อ 19.5 ข้อ 4)';
COMMENT ON FUNCTION app.fmt_time_th(timestamptz)     IS 'เวลาเดี่ยว ''10:12 น.'' (ข้อ 1.2 · 19.5 ข้อ 4)';

CREATE FUNCTION app.nr_join(VARIADIC p_parts text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT nullif(array_to_string(ARRAY(SELECT x FROM unnest(p_parts) x
                                         WHERE nullif(btrim(x), '') IS NOT NULL), ' · '), '')
$$;

COMMENT ON FUNCTION app.nr_join(text[]) IS
'ต่อชิ้นส่วนข้อความของ notifications.body ด้วย " · " และตัดชิ้นที่ว่าง (แม่แบบข้อ 11.1) · ภายใน ไม่ GRANT';

CREATE FUNCTION app.nr_customer_label(p_customer_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN c.display_name IS NULL THEN NULL ELSE 'คุณ' || c.display_name END
    FROM crm.customers c WHERE c.id = p_customer_id
$$;

CREATE FUNCTION app.nr_staff_label(p_staff_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.display_name FROM core.staff_profiles s WHERE s.id = p_staff_id
$$;

COMMENT ON FUNCTION app.nr_customer_label(uuid) IS
'"คุณ" + customers.display_name สำหรับ notifications.body (ข้อ 3.5 · 11.1) · ลูกค้า ANONYMIZED ได้ชื่อ "ลูกค้านิรนาม CUS-…" ตามข้อ 10.4 · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.nr_staff_label(uuid) IS 'ชื่อที่แสดงของพนักงานสำหรับ body ({ผู้รับผิดชอบ} · {ผู้กระทำ} ของข้อ 11.1) · ภายใน ไม่ GRANT';

CREATE FUNCTION app.dq_label_th(p_issue_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE p_issue_code
        WHEN 'DUPLICATE_SUSPECTED'     THEN 'ลูกค้าอาจซ้ำ'
        WHEN 'MISSING_PHONE'           THEN 'ไม่มีเบอร์โทร'
        WHEN 'INVALID_PHONE'           THEN 'เบอร์ไม่ถูกต้อง'
        WHEN 'LEAD_WITHOUT_OWNER'      THEN 'Lead ไม่มีผู้รับผิดชอบ'
        WHEN 'LEAD_WITHOUT_OUTCOME'    THEN 'Lead ค้างไม่มีผล'
        WHEN 'OVERDUE_FOLLOWUP'        THEN 'ติดตามเกินกำหนด'
        WHEN 'INCOMPLETE_CUSTOMER'     THEN 'ข้อมูลลูกค้าไม่ครบ'
        WHEN 'WON_WITHOUT_TRANSACTION' THEN 'ปิดขายแต่ไม่มีเลขธุรกรรม'
        WHEN 'VISIT_UNRECORDED'        THEN 'ไม่ได้บันทึกผลการให้บริการ'
        ELSE p_issue_code
    END
$$;

COMMENT ON FUNCTION app.dq_label_th(text) IS
'ป้ายไทยของ issue_code ในศูนย์คุณภาพข้อมูล (CANONICAL ข้อ 12.3) · ใช้ประกอบ body ของ DATA_MISSING · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 2 — เวลาทำการ (CANONICAL ข้อ 11.1 · 11.2 business_hours)
-- คีย์รหัสสาขาทับค่า default · ยังไม่มีวันหยุด · ช่วง [เปิด, ปิด) ทุกวัน
-- =====================================================================================

CREATE FUNCTION app.business_window(p_branch_id uuid, p_date date)
RETURNS TABLE (open_ts timestamptz, close_ts timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ((p_date + (x.h ->> 0)::time)::timestamp AT TIME ZONE 'Asia/Bangkok'),
           ((p_date + (x.h ->> 1)::time)::timestamp AT TIME ZONE 'Asia/Bangkok')
    FROM (SELECT coalesce(s.value -> b.code, s.value -> 'default') AS h
            FROM app.settings s
            LEFT JOIN core.branches b ON b.id = p_branch_id
           WHERE s.key = 'business_hours') x
    WHERE x.h IS NOT NULL
      AND jsonb_typeof(x.h) = 'array'
$$;

CREATE FUNCTION app.in_business_hours(p_branch_id uuid, p_ts timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM app.business_window(p_branch_id, app.bangkok_date(p_ts)) w
                    WHERE p_ts >= w.open_ts AND p_ts < w.close_ts)
$$;

CREATE FUNCTION app.business_minutes_between(p_branch_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(sum(extract(epoch FROM (least(w.close_ts, p_to) - greatest(w.open_ts, p_from))) / 60), 0)
    FROM generate_series(app.bangkok_date(p_from)::timestamp,
                         app.bangkok_date(p_to)::timestamp, interval '1 day') AS d(day)
    CROSS JOIN LATERAL app.business_window(p_branch_id, d.day::date) w
    WHERE p_to > p_from
      AND least(w.close_ts, p_to) > greatest(w.open_ts, p_from)
$$;

COMMENT ON FUNCTION app.business_window(uuid, date) IS
'ช่วงเวลาทำการ [เปิด, ปิด) ของสาขาในวันหนึ่ง (ข้อ 11.1 · 11.2) · อ่าน app.settings[business_hours] โดยคีย์รหัสสาขา (core.branches.code) ทับค่า default · '
'ยังไม่มีวันหยุด [รอยืนยัน Q4] · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.in_business_hours(uuid, timestamptz) IS
'เวลานี้อยู่ในเวลาทำการของสาขาหรือไม่ (ข้อ 11.1) · ใช้กับ LEAD_UNASSIGNED · LEAD_NOT_CONTACTED · VISITOR_WAITING_LONG (ส่งเฉพาะในเวลาทำการ) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.business_minutes_between(uuid, timestamptz, timestamptz) IS
'จำนวนนาทีเวลาทำการสะสมระหว่างสองเวลา (ข้อ 11.1 "นับเฉพาะนาทีในเวลาทำการ") · ใช้กับ LEAD_UNASSIGNED และ LEAD_NOT_CONTACTED · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 3 — การหาผู้รับแจ้งเตือน (CANONICAL ข้อ 11.1 · 7.1 · 8.0)
-- ความมีผลของ assignment/สมาชิกทีมใช้ now() (นาฬิกาการตัดสินสิทธิ์ · ข้อ 1.2)
-- =====================================================================================

CREATE FUNCTION app.r_team_leader(p_owner_staff_id uuid, p_branch_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT DISTINCT ld.staff_id
    FROM core.team_members m
    JOIN core.teams t          ON t.id = m.team_id AND t.branch_id = p_branch_id
    JOIN core.team_members ld  ON ld.team_id = t.id AND ld.is_leader
    JOIN core.staff_profiles s ON s.id = ld.staff_id AND s.status = 'ACTIVE'
    WHERE m.staff_id = p_owner_staff_id
      AND m.valid_from  <= now() AND (m.valid_to  IS NULL OR now() < m.valid_to)
      AND ld.valid_from <= now() AND (ld.valid_to IS NULL OR now() < ld.valid_to)
      AND ld.staff_id <> p_owner_staff_id
$$;

CREATE FUNCTION app.r_branch_managers(p_branch_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT DISTINCT a.staff_id
    FROM core.staff_role_assignments a
    JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
    WHERE a.branch_id = p_branch_id
      AND a.role_code = 'BRANCH_MANAGER'
      AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)
$$;

CREATE FUNCTION app.r_sv_bm(p_branch_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT DISTINCT a.staff_id
    FROM core.staff_role_assignments a
    JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
    WHERE a.branch_id = p_branch_id
      AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)
      AND (a.role_code = 'BRANCH_MANAGER'
        OR (a.role_code = 'SUPERVISOR' AND EXISTS (
              SELECT 1 FROM core.team_members ld
              JOIN core.teams t ON t.id = ld.team_id
              WHERE ld.staff_id = a.staff_id AND ld.is_leader AND t.branch_id = p_branch_id
                AND ld.valid_from <= now() AND (ld.valid_to IS NULL OR now() < ld.valid_to))))
$$;

CREATE FUNCTION app.r_org_role(p_role_code text, p_organization_id uuid DEFAULT NULL)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT DISTINCT a.staff_id
    FROM core.staff_role_assignments a
    JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
    WHERE a.role_code = p_role_code
      AND a.branch_id IS NULL
      AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)
      AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
$$;

COMMENT ON FUNCTION app.r_team_leader(uuid, uuid)    IS 'R_TEAM_LEADER (ข้อ 11.1): หัวหน้าทีมปัจจุบันของ owner ในสาขาของรายการ · ตัด owner ออก (การยกระดับไม่ส่งกลับไปที่ owner) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.r_branch_managers(uuid)      IS 'R_BRANCH_MANAGERS (ข้อ 11.1): BRANCH_MANAGER ที่ ACTIVE และ assignment ยังมีผลของสาขานั้น · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.r_sv_bm(uuid)                IS 'R_SV_BM (ข้อ 11.1): BRANCH_MANAGER ของสาขา ∪ SUPERVISOR ของสาขาที่เป็นหัวหน้าทีมอย่างน้อย 1 ทีมในสาขานั้น (ข้อ 7.1) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.r_org_role(text, uuid)       IS 'พนักงาน ACTIVE ที่ถือบทบาทระดับองค์กร (BUSINESS_ADMIN · EXECUTIVE · MARKETING) · ใช้หาผู้รับ R_BA (ข้อ 11.1) · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 4 — app.job_close_stale_visits (CANONICAL ข้อ 4.1 · 11.1 VISIT_OUTCOME_MISSING ระดับ 1)
-- รัน 00:05 Asia/Bangkok: visit ที่ยังไม่ปิดของวันธุรกิจก่อนหน้า → COMPLETED + UNRECORDED
-- ended_at = 23:59:59 ของวันธุรกิจนั้น · closed_by_system = true · แล้วสรุปสิ้นวันให้ผู้จัดการสาขา
-- =====================================================================================

CREATE FUNCTION app.job_close_stale_visits(p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_as_of   timestamptz := coalesce(p_as_of, app.clock());
    v_today   date        := app.bangkok_date(coalesce(p_as_of, app.clock()));
    v_pt      text        := current_setting('app.actor_type', true);
    v_pl      text        := current_setting('app.actor_label', true);
    v_closed  bigint      := 0;
    v_notes   bigint      := 0;
    r         record;
    v_rcp     uuid;
BEGIN
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'SYSTEM:close_stale_visits', true);

    FOR r IN
        WITH upd AS (
            UPDATE crm.visits v
               SET status           = 'COMPLETED',
                   outcome_code     = 'UNRECORDED',
                   closed_by_system = true,
                   ended_at         = app.bkk_ts(app.bangkok_date(v.started_at) + 1) - interval '1 second'
             WHERE v.status IN ('WAITING', 'IN_SERVICE')
               AND app.bangkok_date(v.started_at) < v_today
            RETURNING v.id, v.branch_id, app.bangkok_date(v.started_at) AS biz_day
        )
        SELECT u.branch_id, u.biz_day, b.name_th AS branch_name, b.code AS branch_code, count(*) AS n
        FROM upd u JOIN core.branches b ON b.id = u.branch_id
        GROUP BY 1, 2, 3, 4
    LOOP
        v_closed := v_closed + r.n;
        FOR v_rcp IN SELECT * FROM app.r_branch_managers(r.branch_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'VISIT_OUTCOME_MISSING', 'BRANCH', r.branch_id, r.branch_code,
                app.nr_join(r.branch_name,
                            'สรุปวันที่ ' || app.fmt_date_th(app.bkk_ts(r.biz_day)),
                            'ระบบปิดเป็น "ไม่ได้บันทึกผล" ' || r.n::text || ' รายการ'),
                1, r.biz_day);
            v_notes := v_notes + 1;
        END LOOP;
    END LOOP;

    PERFORM set_config('app.actor_type',  coalesce(v_pt, ''), true);
    PERFORM set_config('app.actor_label', coalesce(v_pl, ''), true);
    RETURN jsonb_build_object('ok', true, 'job', 'close_stale_visits', 'as_of', v_as_of,
                              'visits_closed', v_closed, 'notifications', v_notes);
END;
$$;

COMMENT ON FUNCTION app.job_close_stale_visits(timestamptz) IS
'งาน 00:05 Asia/Bangkok (CANONICAL ข้อ 4.1 · 9.6): ปิด visit ที่ยังเปิด (WAITING/IN_SERVICE) ของวันธุรกิจก่อนหน้าเป็น COMPLETED + '
'outcome UNRECORDED · ended_at = 23:59:59 ของวันธุรกิจนั้น · closed_by_system = true · แล้วส่ง VISIT_OUTCOME_MISSING ระดับ 1 '
'(สรุปต่อสาขาต่อวันธุรกิจ) ถึง BRANCH_MANAGER ของสาขา · dedupe_key = VISIT_OUTCOME_MISSING:{branch_id}:1:{วันธุรกิจ} (ข้อ 11.1) · '
'actor = SYSTEM:close_stale_visits (ข้อ 9.5) · รันซ้ำได้ (idempotent) · ไม่ GRANT ให้ authenticated';


-- =====================================================================================
-- ส่วนที่ 5 — app.job_expire_quotations (CANONICAL ข้อ 4.6 · 9.6)
-- =====================================================================================

CREATE FUNCTION app.job_expire_quotations(p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_as_of timestamptz := coalesce(p_as_of, app.clock());
    v_pt    text        := current_setting('app.actor_type', true);
    v_pl    text        := current_setting('app.actor_label', true);
    v_n     bigint      := 0;
BEGIN
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'SYSTEM:expire_quotations', true);

    WITH upd AS (
        UPDATE crm.quotations q
           SET status = 'EXPIRED'
         WHERE q.status = 'SENT'
           AND q.valid_until < app.bangkok_date(v_as_of)
        RETURNING q.id
    )
    SELECT count(*) INTO v_n FROM upd;

    PERFORM set_config('app.actor_type',  coalesce(v_pt, ''), true);
    PERFORM set_config('app.actor_label', coalesce(v_pl, ''), true);
    RETURN jsonb_build_object('ok', true, 'job', 'expire_quotations', 'as_of', v_as_of, 'expired', v_n);
END;
$$;

COMMENT ON FUNCTION app.job_expire_quotations(timestamptz) IS
'งาน 00:10 Asia/Bangkok (CANONICAL ข้อ 4.6 · 9.6): ใบเสนอราคา SENT ที่ valid_until ผ่านไปแล้ว (valid_until < วันธุรกิจของ p_as_of) → EXPIRED · '
'ไม่แตะ ACCEPTED/REJECTED · actor = SYSTEM:expire_quotations (ข้อ 9.5) · รันซ้ำได้ · ไม่ GRANT ให้ authenticated';


-- =====================================================================================
-- ส่วนที่ 6 — app.job_expire_exports (CANONICAL ข้อ 8.2 · 9.6 · 10.3)
-- =====================================================================================

CREATE FUNCTION app.job_expire_exports(p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_as_of timestamptz := coalesce(p_as_of, app.clock());
    v_ttl   integer     := app.setting_int('export.link_ttl_hours', 24);
    v_pt    text        := current_setting('app.actor_type', true);
    v_pl    text        := current_setting('app.actor_label', true);
    v_n     bigint      := 0;
BEGIN
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'SYSTEM:expire_exports', true);

    WITH upd AS (
        UPDATE audit.export_requests e
           SET status     = 'EXPIRED',
               expired_at = v_as_of
         WHERE e.status IN ('GENERATED', 'DOWNLOADED')
           AND e.generated_at IS NOT NULL
           AND e.generated_at + make_interval(hours => v_ttl) <= v_as_of
        RETURNING e.id
    )
    SELECT count(*) INTO v_n FROM upd;

    PERFORM set_config('app.actor_type',  coalesce(v_pt, ''), true);
    PERFORM set_config('app.actor_label', coalesce(v_pl, ''), true);
    RETURN jsonb_build_object('ok', true, 'job', 'expire_exports', 'as_of', v_as_of, 'expired', v_n);
END;
$$;

COMMENT ON FUNCTION app.job_expire_exports(timestamptz) IS
'งานทุกชั่วโมงนาทีที่ 15 (CANONICAL ข้อ 8.2 · 9.6): คำขอส่งออกสถานะ GENERATED/DOWNLOADED ที่สร้างไฟล์เกิน '
'app.settings[export.link_ttl_hours] (24 ชม.) → EXPIRED + expired_at · **ไม่แตะ download_count และไม่ตั้ง file_deleted_at** '
'(Edge Function cron-export-cleanup อ่าน api.svc_expired_export_files() แล้วลบไฟล์และตั้ง file_deleted_at) · '
'actor = SYSTEM:expire_exports (ข้อ 9.5) · รันซ้ำได้ · ไม่ GRANT ให้ authenticated';


-- =====================================================================================
-- ส่วนที่ 7 — app.job_notifications (CANONICAL ข้อ 11.1 · 9.6)
-- รันทุก 5 นาที · สร้างเฉพาะรหัสที่เกิดจากงานตามเวลา (รหัสที่เกิดทันทีอยู่ใน trigger/RPC ของ 0009 · 0011)
-- ทุกแถวสร้างผ่าน app.emit_notification → INSERT … ON CONFLICT (recipient_staff_id, dedupe_key) DO NOTHING
-- จุดยึดของ dedupe_key ไม่ใช่วันที่งานรัน จึงรันซ้ำหรือรันย้อนหลังได้ผลเดิม (ข้อ 11.1)
-- =====================================================================================

CREATE FUNCTION app.job_notifications(p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_as_of  timestamptz := coalesce(p_as_of, app.clock());
    v_today  date        := app.bangkok_date(coalesce(p_as_of, app.clock()));
    v_time   time        := (coalesce(p_as_of, app.clock()) AT TIME ZONE 'Asia/Bangkok')::time;
    v_pt     text        := current_setting('app.actor_type', true);
    v_pl     text        := current_setting('app.actor_label', true);
    v_h1     integer     := app.setting_int_at('escalation.overdue_hours', 0, 24);
    v_h2     integer     := app.setting_int_at('escalation.overdue_hours', 1, 48);
    v_st0    integer     := app.setting_int_at('sla.opportunity_stale_days', 0, 7);
    v_st1    integer     := app.setting_int_at('sla.opportunity_stale_days', 1, 14);
    v_unas   integer     := app.setting_int('sla.lead_unassigned_min', 15);
    v_notc   integer     := app.setting_int('sla.lead_not_contacted_min', 30);
    v_wait   integer     := app.setting_int('sla.visitor_waiting_min', 15);
    v_serv   integer     := app.setting_int('sla.visit_in_service_min', 60);
    v_dupt   time        := app.setting_time('notify.duplicate_digest_time', '18:00');
    v_dmt    time        := app.setting_time('notify.data_missing_time', '09:00');
    v_n      bigint      := 0;
    r        record;
    v_rcp    uuid;
    v_code   text;
    v_body   text;
BEGIN
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'SYSTEM:notifications', true);

    -- ---------------------------------------------------------------- 3.1 FOLLOWUP_DUE
    FOR r IN
        SELECT t.id, t.task_no, t.title, t.due_at, t.remind_at, t.owner_staff_id, t.customer_id
        FROM crm.tasks t
        WHERE t.task_type_code = 'FOLLOW_UP'
          AND t.status IN ('OPEN', 'IN_PROGRESS')
          AND t.owner_staff_id IS NOT NULL
          AND t.remind_at IS NOT NULL
          AND t.remind_at <= v_as_of
          AND t.due_at    >  v_as_of
    LOOP
        PERFORM app.emit_notification(
            r.owner_staff_id, 'FOLLOWUP_DUE', 'TASK', r.id, r.task_no,
            app.nr_join(app.nr_customer_label(r.customer_id), r.title,
                        'ครบกำหนด ' || app.fmt_datetime_th(r.due_at)),
            0, app.bangkok_date(r.remind_at));
        v_n := v_n + 1;
    END LOOP;

    -- ------------------------------------------- 3.2 FOLLOWUP_OVERDUE · 3.3 TASK_OVERDUE
    FOR r IN
        SELECT t.id, t.task_no, t.title, t.due_at, t.owner_staff_id, t.customer_id, t.branch_id,
               t.task_type_code
        FROM crm.tasks t
        WHERE t.status IN ('OPEN', 'IN_PROGRESS')
          AND t.due_at < v_as_of
    LOOP
        v_code := CASE WHEN r.task_type_code = 'FOLLOW_UP' THEN 'FOLLOWUP_OVERDUE' ELSE 'TASK_OVERDUE' END;
        v_body := app.nr_join(app.nr_customer_label(r.customer_id), r.title,
                              'ครบกำหนด ' || app.fmt_datetime_th(r.due_at));

        -- ระดับ 0 · owner (owner ว่าง → ข้ามระดับนี้)
        IF r.owner_staff_id IS NOT NULL THEN
            PERFORM app.emit_notification(r.owner_staff_id, v_code, 'TASK', r.id, r.task_no,
                                          v_body, 0, app.bangkok_date(r.due_at));
            v_n := v_n + 1;
        END IF;

        -- ระดับ 1 · หัวหน้าทีมของ owner (+h1) — ทั้ง FOLLOWUP_OVERDUE และ TASK_OVERDUE
        IF r.owner_staff_id IS NOT NULL AND r.due_at + make_interval(hours => v_h1) < v_as_of THEN
            FOR v_rcp IN SELECT * FROM app.r_team_leader(r.owner_staff_id, r.branch_id) LOOP
                PERFORM app.emit_notification(
                    v_rcp, v_code, 'TASK', r.id, r.task_no,
                    app.nr_join(v_body, 'ผู้รับผิดชอบ ' || coalesce(app.nr_staff_label(r.owner_staff_id),
                                                                    'ไม่มีผู้รับผิดชอบ')),
                    1, app.bangkok_date(r.due_at + make_interval(hours => v_h1)));
                v_n := v_n + 1;
            END LOOP;
        END IF;

        -- ระดับ 2 · ผู้จัดการสาขา (+h2) — เฉพาะ FOLLOWUP_OVERDUE (ข้อ 11.1 TASK_OVERDUE ไม่มีระดับ 2)
        IF r.task_type_code = 'FOLLOW_UP' AND r.due_at + make_interval(hours => v_h2) < v_as_of THEN
            FOR v_rcp IN SELECT * FROM app.r_branch_managers(r.branch_id) LOOP
                CONTINUE WHEN v_rcp IS NOT DISTINCT FROM r.owner_staff_id;   -- ไม่ส่งกลับไปที่ owner
                PERFORM app.emit_notification(
                    v_rcp, v_code, 'TASK', r.id, r.task_no,
                    app.nr_join(v_body, 'ผู้รับผิดชอบ ' || coalesce(app.nr_staff_label(r.owner_staff_id),
                                                                    'ไม่มีผู้รับผิดชอบ')),
                    2, app.bangkok_date(r.due_at + make_interval(hours => v_h2)));
                v_n := v_n + 1;
            END LOOP;
        END IF;
    END LOOP;

    -- ------------------------------------------------------------ 3.4 LEAD_UNASSIGNED
    FOR r IN
        SELECT l.id, l.lead_no, l.branch_id, l.customer_id, l.channel_code,
               coalesce((SELECT max(oc.changed_at) FROM crm.ownership_changes oc
                          WHERE oc.entity_type = 'LEAD' AND oc.entity_id = l.id AND oc.to_staff_id IS NULL),
                        l.created_at) AS since_ts,
               ch.label_th AS channel_label
        FROM crm.leads l
        LEFT JOIN ref.channels ch ON ch.code = l.channel_code
        WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
          AND l.owner_staff_id IS NULL
    LOOP
        CONTINUE WHEN NOT app.in_business_hours(r.branch_id, v_as_of);
        CONTINUE WHEN app.business_minutes_between(r.branch_id, r.since_ts, v_as_of) <= v_unas;
        FOR v_rcp IN SELECT * FROM app.r_sv_bm(r.branch_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'LEAD_UNASSIGNED', 'LEAD', r.id, r.lead_no,
                app.nr_join(app.nr_customer_label(r.customer_id), r.lead_no, r.channel_label,
                            'ไม่มีผู้รับผิดชอบตั้งแต่ ' || app.fmt_datetime_th(r.since_ts)),
                0, app.bangkok_date(r.since_ts));
            v_n := v_n + 1;
        END LOOP;
    END LOOP;

    -- -------------------------------------------------------- 3.5 LEAD_NOT_CONTACTED
    FOR r IN
        SELECT l.id, l.lead_no, l.branch_id, l.customer_id, l.owner_staff_id, l.created_at,
               ch.label_th AS channel_label
        FROM crm.leads l
        LEFT JOIN ref.channels ch ON ch.code = l.channel_code
        WHERE l.status = 'NEW'
          AND l.owner_staff_id IS NOT NULL
    LOOP
        CONTINUE WHEN NOT app.in_business_hours(r.branch_id, v_as_of);
        CONTINUE WHEN app.business_minutes_between(r.branch_id, r.created_at, v_as_of) <= v_notc;
        v_body := app.nr_join(app.nr_customer_label(r.customer_id), r.lead_no, r.channel_label,
                              'สร้างเมื่อ ' || app.fmt_datetime_th(r.created_at));
        PERFORM app.emit_notification(r.owner_staff_id, 'LEAD_NOT_CONTACTED', 'LEAD', r.id, r.lead_no,
                                      v_body, 0, app.bangkok_date(r.created_at));
        v_n := v_n + 1;
        FOR v_rcp IN SELECT * FROM app.r_team_leader(r.owner_staff_id, r.branch_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'LEAD_NOT_CONTACTED', 'LEAD', r.id, r.lead_no,
                app.nr_join(v_body, 'ผู้รับผิดชอบ ' || coalesce(app.nr_staff_label(r.owner_staff_id), '')),
                0, app.bangkok_date(r.created_at));
            v_n := v_n + 1;
        END LOOP;
    END LOOP;

    -- ------------------------------------------------------- 3.7 OPPORTUNITY_STALE
    FOR r IN
        SELECT o.id, o.opportunity_no, o.branch_id, o.customer_id, o.owner_staff_id,
               greatest(o.created_at,
                        coalesce((SELECT max(i.occurred_at) FROM crm.interactions i
                                   WHERE i.opportunity_id = o.id), o.created_at),
                        coalesce((SELECT max(h.changed_at) FROM crm.opportunity_stage_history h
                                   WHERE h.opportunity_id = o.id), o.created_at)) AS last_ts
        FROM crm.opportunities o
        WHERE o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
    LOOP
        v_body := app.nr_join(app.nr_customer_label(r.customer_id), r.opportunity_no,
                              'ไม่มีความเคลื่อนไหวตั้งแต่ ' || app.fmt_datetime_th(r.last_ts));
        IF r.owner_staff_id IS NOT NULL AND r.last_ts + make_interval(days => v_st0) < v_as_of THEN
            PERFORM app.emit_notification(r.owner_staff_id, 'OPPORTUNITY_STALE', 'OPPORTUNITY', r.id,
                                          r.opportunity_no, v_body, 0,
                                          app.bangkok_date(r.last_ts + make_interval(days => v_st0)));
            v_n := v_n + 1;
        END IF;
        IF r.last_ts + make_interval(days => v_st1) < v_as_of THEN
            FOR v_rcp IN SELECT * FROM app.r_branch_managers(r.branch_id) LOOP
                CONTINUE WHEN v_rcp IS NOT DISTINCT FROM r.owner_staff_id;
                PERFORM app.emit_notification(
                    v_rcp, 'OPPORTUNITY_STALE', 'OPPORTUNITY', r.id, r.opportunity_no,
                    app.nr_join(v_body, 'ผู้รับผิดชอบ ' || coalesce(app.nr_staff_label(r.owner_staff_id),
                                                                    'ไม่มีผู้รับผิดชอบ')),
                    1, app.bangkok_date(r.last_ts + make_interval(days => v_st1)));
                v_n := v_n + 1;
            END LOOP;
        END IF;
    END LOOP;

    -- ------------------------------------- 3.8 DUPLICATE_SUSPECTED (สรุปรายวัน 18:00)
    IF v_time >= v_dupt THEN
        FOR r IN
            SELECT c.first_branch_id AS branch_id, b.name_th AS branch_name, b.code AS branch_code,
                   count(*) AS n
            FROM crm.duplicate_decisions d
            JOIN crm.customers c ON c.id = d.customer_id
            JOIN core.branches b ON b.id = c.first_branch_id
            WHERE d.status = 'PENDING'
              AND app.bangkok_date(d.created_at) = v_today
            GROUP BY 1, 2, 3
        LOOP
            FOR v_rcp IN SELECT * FROM app.r_sv_bm(r.branch_id) LOOP
                PERFORM app.emit_notification(
                    v_rcp, 'DUPLICATE_SUSPECTED', 'BRANCH', r.branch_id, r.branch_code,
                    app.nr_join(r.branch_name, 'ลูกค้าอาจซ้ำรายการใหม่วันนี้ ' || r.n::text || ' รายการ'),
                    0, v_today);
                v_n := v_n + 1;
            END LOOP;
        END LOOP;
    END IF;

    -- ------------------------------------------------------ 3.9 VISITOR_WAITING_LONG
    FOR r IN
        SELECT v.id, v.visit_no, v.branch_id, v.customer_id, v.queue_no, v.started_at,
               it.label_th AS interest_label
        FROM crm.visits v
        LEFT JOIN ref.interest_types it ON it.code = v.interest_code
        WHERE v.status = 'WAITING'
          AND v.started_at + make_interval(mins => v_wait) < v_as_of
    LOOP
        CONTINUE WHEN NOT app.in_business_hours(r.branch_id, v_as_of);
        FOR v_rcp IN SELECT * FROM app.r_sv_bm(r.branch_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'VISITOR_WAITING_LONG', 'VISIT', r.id, r.visit_no,
                app.nr_join(app.nr_customer_label(r.customer_id),
                            CASE WHEN r.queue_no IS NULL THEN r.visit_no
                                 ELSE 'คิว ' || lpad(r.queue_no::text, 3, '0') END,
                            r.interest_label,
                            'รอตั้งแต่ ' || app.fmt_time_th(r.started_at)),
                0, app.bangkok_date(r.started_at));
            v_n := v_n + 1;
        END LOOP;
    END LOOP;

    -- ------------------------------------------- 3.10 VISIT_OUTCOME_MISSING ระดับ 0
    FOR r IN
        SELECT v.id, v.visit_no, v.owner_staff_id, v.customer_id, v.queue_no, v.service_started_at
        FROM crm.visits v
        WHERE v.status = 'IN_SERVICE'
          AND v.owner_staff_id IS NOT NULL
          AND v.service_started_at IS NOT NULL
          AND v.service_started_at + make_interval(mins => v_serv) < v_as_of
    LOOP
        PERFORM app.emit_notification(
            r.owner_staff_id, 'VISIT_OUTCOME_MISSING', 'VISIT', r.id, r.visit_no,
            app.nr_join(app.nr_customer_label(r.customer_id),
                        CASE WHEN r.queue_no IS NULL THEN r.visit_no
                             ELSE 'คิว ' || lpad(r.queue_no::text, 3, '0') END,
                        'เริ่มให้บริการ ' || app.fmt_time_th(r.service_started_at)),
            0, app.bangkok_date(r.service_started_at));
        v_n := v_n + 1;
    END LOOP;

    -- ---------------------------------------------------------------- 3.11 DATA_MISSING
    IF v_time >= v_dmt THEN
        -- ระดับ 0 · รายวันถึงผู้ผูกรายการ (ไม่รวม DUPLICATE_SUSPECTED และ LEAD_WITHOUT_OWNER ที่ไม่มี owner)
        FOR r IN
            WITH per AS (
                SELECT q.owner_staff_id AS staff_id, q.issue_code, count(*) AS n
                FROM analytics.data_quality_issues q
                WHERE q.owner_staff_id IS NOT NULL
                  AND q.issue_code NOT IN ('DUPLICATE_SUSPECTED', 'LEAD_WITHOUT_OWNER')
                GROUP BY 1, 2
            )
            SELECT p.staff_id, s.staff_code, sum(p.n) AS total,
                   string_agg(app.dq_label_th(p.issue_code) || ' ' || p.n::text, ' · '
                              ORDER BY p.issue_code) AS detail
            FROM per p
            JOIN core.staff_profiles s ON s.id = p.staff_id AND s.status = 'ACTIVE'
            GROUP BY 1, 2
        LOOP
            PERFORM app.emit_notification(
                r.staff_id, 'DATA_MISSING', 'STAFF', r.staff_id, r.staff_code,
                app.nr_join('รายการคุณภาพข้อมูลที่ต้องแก้ ' || r.total::text || ' รายการ', r.detail),
                0, v_today);
            v_n := v_n + 1;
        END LOOP;

        -- ระดับ 1 · สรุปรายสัปดาห์ของผู้จัดการสาขา (วันจันทร์ 09:00)
        IF extract(isodow FROM v_today) = 1 THEN
            FOR r IN
                WITH per AS (
                    SELECT q.branch_id, q.issue_code, count(*) AS n
                    FROM analytics.data_quality_issues q
                    WHERE q.branch_id IS NOT NULL
                    GROUP BY 1, 2
                )
                SELECT p.branch_id, b.name_th AS branch_name, b.code AS branch_code, sum(p.n) AS total,
                       string_agg(app.dq_label_th(p.issue_code) || ' ' || p.n::text, ' · '
                                  ORDER BY p.issue_code) AS detail
                FROM per p
                JOIN core.branches b ON b.id = p.branch_id
                GROUP BY 1, 2, 3
            LOOP
                FOR v_rcp IN SELECT * FROM app.r_branch_managers(r.branch_id) LOOP
                    PERFORM app.emit_notification(
                        v_rcp, 'DATA_MISSING', 'BRANCH', r.branch_id, r.branch_code,
                        app.nr_join(r.branch_name,
                                    'รายการคุณภาพข้อมูลค้าง ' || r.total::text || ' รายการ', r.detail),
                        1, v_today);
                    v_n := v_n + 1;
                END LOOP;
            END LOOP;
        END IF;
    END IF;

    -- ---------------------------------------------------------------- 3.22 DSR_DUE_SOON
    FOR r IN
        SELECT d.id, d.request_no, d.request_type, d.status, d.organization_id,
               coalesce(d.extended_until, d.due_at) AS deadline
        FROM crm.data_subject_requests d
        WHERE d.status NOT IN ('COMPLETED', 'REJECTED')
    LOOP
        CONTINUE WHEN r.deadline IS NULL;
        CONTINUE WHEN r.deadline - interval '7 days' > v_as_of;
        FOR v_rcp IN SELECT * FROM app.r_org_role('BUSINESS_ADMIN', r.organization_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'DSR_DUE_SOON', 'DSR', r.id, r.request_no,
                app.nr_join(r.request_no, r.request_type::text, r.status::text,
                            'ครบกำหนด ' || app.fmt_datetime_th(r.deadline)),
                0, app.bangkok_date(r.deadline - interval '7 days'));
            v_n := v_n + 1;
        END LOOP;
    END LOOP;

    PERFORM set_config('app.actor_type',  coalesce(v_pt, ''), true);
    PERFORM set_config('app.actor_label', coalesce(v_pl, ''), true);
    RETURN jsonb_build_object('ok', true, 'job', 'notifications', 'as_of', v_as_of, 'emitted', v_n);
END;
$$;

COMMENT ON FUNCTION app.job_notifications(timestamptz) IS
$doc$งานทุก 5 นาที (CANONICAL ข้อ 9.6 · 11.1) สร้างการแจ้งเตือนที่เป็น "งานตามเวลา" ทั้งหมด:
  FOLLOWUP_DUE          ระดับ 0 · task FOLLOW_UP เปิดอยู่ที่ remind_at ≤ p_as_of < due_at · anchor = remind_at
  FOLLOWUP_OVERDUE      ระดับ 0 owner (anchor due_at) · 1 หัวหน้าทีมของ owner (+escalation.overdue_hours[0])
                        · 2 ผู้จัดการสาขา (+[1]) ตัด owner
  TASK_OVERDUE          ระดับ 0 owner · 1 หัวหน้าทีม (ไม่มีระดับ 2)
  LEAD_UNASSIGNED       ระดับ 0 · lead เปิดอยู่ไม่มี owner เกิน sla.lead_unassigned_min **นาทีเวลาทำการ**
                        และส่งเฉพาะในเวลาทำการ · ผู้รับ = SUPERVISOR (ที่เป็นหัวหน้าทีมในสาขา) + BRANCH_MANAGER
                        · anchor = เวลาที่เริ่มไม่มี owner (ownership_changes ล่าสุดที่ to_staff_id IS NULL มิฉะนั้น created_at)
  LEAD_NOT_CONTACTED    ระดับ 0 · lead NEW เกิน sla.lead_not_contacted_min นาทีเวลาทำการ · owner + หัวหน้าทีม · anchor = created_at
  OPPORTUNITY_STALE     ระดับ 0 owner (sla.opportunity_stale_days[0]) · 1 ผู้จัดการสาขา ([1]) ตัด owner
                        · ความเคลื่อนไหว = interaction ที่ผูก opportunity_id หรือการเปลี่ยนขั้น
  DUPLICATE_SUSPECTED   สรุปรายวันต่อสาขาเมื่อเวลาท้องถิ่น ≥ notify.duplicate_digest_time · anchor = วันที่ของสรุป
  VISITOR_WAITING_LONG  ระดับ 0 · visit WAITING เกิน sla.visitor_waiting_min **นาทีปฏิทิน** ส่งเฉพาะในเวลาทำการ · anchor = started_at
  VISIT_OUTCOME_MISSING ระดับ 0 · visit IN_SERVICE เกิน sla.visit_in_service_min → ผู้รับ visit · anchor = service_started_at
                        (ระดับ 1 สรุปสิ้นวันอยู่ใน app.job_close_stale_visits)
  DATA_MISSING          ระดับ 0 รายวันถึงผู้ผูกรายการคุณภาพข้อมูล · ระดับ 1 วันจันทร์ถึงผู้จัดการสาขา (notify.data_missing_time)
  DSR_DUE_SOON          ระดับ 0 · 7 วันก่อน coalesce(extended_until, due_at) → BUSINESS_ADMIN ขององค์กรนั้น
หมายเหตุผู้เขียน: เงื่อนไขเวลาทุกข้อใช้ p_as_of แต่รายการใน analytics.data_quality_issues (DATA_MISSING) คิดจาก app.clock()
ตามนิยามข้อ 12.3 · บน prod ทั้งสองค่าเท่ากับ now() จึงตรงกัน · ในการทดสอบให้ตั้ง app.settings[clock] ให้ตรงกับ p_as_of เมื่อต้องการตรวจ DATA_MISSING
actor = SYSTEM:notifications (ข้อ 9.5) · ทุกแถวผ่าน app.emit_notification (ON CONFLICT DO NOTHING) จึง idempotent ·
"ระดับที่ไม่มีผู้รับให้ข้าม" และ "การยกระดับไม่ส่งกลับไปที่ owner" ตามข้อ 11.1 · ไม่ GRANT ให้ authenticated$doc$;


-- =====================================================================================
-- ส่วนที่ 8 — app.job_retention (CANONICAL ข้อ 10.3 · 10.4 · 11.1 · 19.4 ข้อ 1)
-- SECURITY INVOKER: แจ้งเตือนล่วงหน้า → anonymize → SET LOCAL ROLE audit_retention → DELETE log
-- =====================================================================================

CREATE FUNCTION app.job_retention(p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_as_of   timestamptz := coalesce(p_as_of, app.clock());
    v_today   date        := app.bangkok_date(coalesce(p_as_of, app.clock()));
    v_pt      text        := current_setting('app.actor_type', true);
    v_pl      text        := current_setting('app.actor_label', true);
    v_pb      text        := current_setting('app.bulk', true);
    v_prole   text        := current_setting('role', true);
    v_upcoming bigint     := 0;
    v_anon     bigint     := 0;
    v_del_audit  bigint   := 0;
    v_del_access bigint   := 0;
    v_del_login  bigint   := 0;
    r         record;
    v_rcp     uuid;
BEGIN
    PERFORM set_config('app.actor_type',  'SYSTEM', true);
    PERFORM set_config('app.actor_label', 'SYSTEM:retention', true);

    -- 8.1 RETENTION_ANONYMIZE_UPCOMING · สรุปรายวันทั้งองค์กร (แจ้งล่วงหน้า 30 วัน · ข้อ 10.3 · 11.1)
    FOR r IN
        WITH due AS (
            SELECT c.id, c.organization_id,
                   CASE WHEN pe.last_purchase IS NOT NULL
                        THEN pe.last_purchase + interval '10 years'
                        ELSE c.last_activity_at + interval '24 months' END AS due_ts
            FROM crm.customers c
            LEFT JOIN LATERAL (SELECT max(x.purchased_at) AS last_purchase
                                 FROM analytics.purchase_events x
                                WHERE x.customer_id = c.id) pe ON true
            WHERE c.record_status = 'ACTIVE' AND NOT c.legal_hold
        )
        SELECT d.organization_id, o.code AS org_code, count(*) AS n, min(d.due_ts) AS first_due
        FROM due d JOIN core.organizations o ON o.id = d.organization_id
        WHERE d.due_ts IS NOT NULL
          AND d.due_ts >  v_as_of
          AND d.due_ts <= v_as_of + interval '30 days'
        GROUP BY 1, 2
    LOOP
        FOR v_rcp IN SELECT * FROM app.r_org_role('BUSINESS_ADMIN', r.organization_id) LOOP
            PERFORM app.emit_notification(
                v_rcp, 'RETENTION_ANONYMIZE_UPCOMING', 'ORGANIZATION', r.organization_id, r.org_code,
                app.nr_join('ลูกค้า ' || r.n::text || ' รายจะครบระยะเก็บข้อมูลภายใน 30 วัน',
                            'ครบเร็วสุด ' || app.fmt_date_th(r.first_due)),
                0, v_today);
        END LOOP;
        v_upcoming := v_upcoming + r.n;
    END LOOP;

    -- 8.2 anonymize ลูกค้าที่ครบระยะเก็บแล้ว (ข้อ 10.3 · 10.4 · ข้าม legal_hold)
    FOR r IN
        WITH due AS (
            SELECT c.id,
                   CASE WHEN pe.last_purchase IS NOT NULL
                        THEN pe.last_purchase + interval '10 years'
                        ELSE c.last_activity_at + interval '24 months' END AS due_ts
            FROM crm.customers c
            LEFT JOIN LATERAL (SELECT max(x.purchased_at) AS last_purchase
                                 FROM analytics.purchase_events x
                                WHERE x.customer_id = c.id) pe ON true
            WHERE c.record_status = 'ACTIVE' AND NOT c.legal_hold
        )
        SELECT d.id FROM due d WHERE d.due_ts IS NOT NULL AND d.due_ts <= v_as_of
        ORDER BY d.id
    LOOP
        PERFORM app.anonymize_customer(r.id, 'RETENTION');
        v_anon := v_anon + 1;
    END LOOP;
    -- app.anonymize_customer ตั้ง app.bulk = on ไว้ในทรานแซกชัน — คืนค่าเดิมเพื่อไม่ให้งานถัดไปถูกข้าม (ข้อ 19.1 ข้อ 11)
    PERFORM set_config('app.bulk', coalesce(v_pb, ''), true);

    -- 8.3 ลบ log ที่ครบระยะเก็บ (ข้อ 10.3) — ต้องเป็น role audit_retention (ข้อ 9.5 · 19.4 ข้อ 1)
    PERFORM set_config('role', 'audit_retention', true);
    WITH d AS (DELETE FROM audit.audit_logs   a WHERE a.occurred_at < v_as_of - interval '5 years' RETURNING 1)
    SELECT count(*) INTO v_del_audit FROM d;
    WITH d AS (DELETE FROM audit.access_logs  a WHERE a.occurred_at < v_as_of - interval '1 year'  RETURNING 1)
    SELECT count(*) INTO v_del_access FROM d;
    WITH d AS (DELETE FROM audit.login_events a WHERE a.occurred_at < v_as_of - interval '1 year'  RETURNING 1)
    SELECT count(*) INTO v_del_login FROM d;
    PERFORM set_config('role', coalesce(nullif(v_prole, ''), 'none'), true);

    PERFORM set_config('app.actor_type',  coalesce(v_pt, ''), true);
    PERFORM set_config('app.actor_label', coalesce(v_pl, ''), true);
    RETURN jsonb_build_object('ok', true, 'job', 'retention', 'as_of', v_as_of,
                              'upcoming', v_upcoming, 'anonymized', v_anon,
                              'deleted', jsonb_build_object('audit_logs', v_del_audit,
                                                            'access_logs', v_del_access,
                                                            'login_events', v_del_login));
END;
$$;

COMMENT ON FUNCTION app.job_retention(timestamptz) IS
$doc$งาน 02:00 Asia/Bangkok (CANONICAL ข้อ 9.6 · 10.3 · 19.4 ข้อ 1) · **SECURITY INVOKER** (cron รันในฐานะ postgres)
ลำดับงาน:
 1. RETENTION_ANONYMIZE_UPCOMING — สรุปรายวันทั้งองค์กรถึง BUSINESS_ADMIN ทุกคน เมื่อมีลูกค้าครบระยะเก็บภายใน 30 วัน
    (anchor = วันที่ของสรุป จึงแจ้งวันละครั้ง · ข้อ 11.1) · ต้องทำก่อนขั้นที่ 2 เพราะ app.anonymize_customer ตั้ง app.bulk = on
 2. anonymize ลูกค้าที่ครบระยะเก็บ: ไม่เคยซื้อ = last_activity_at + 24 เดือน · เคยซื้อ = เหตุการณ์การซื้อล่าสุด + 10 ปี
    (หมายเหตุผู้เขียน: "ธุรกรรมล่าสุด" ใช้ analytics.purchase_events = opportunity WON + transaction ref ที่นับเป็นการซื้อ)
    ข้ามลูกค้าที่ legal_hold (ข้อ 10.3) · เรียก app.anonymize_customer(id, 'RETENTION') → actor SYSTEM:retention (ข้อ 10.4)
 3. SET LOCAL ROLE audit_retention แล้ว DELETE: audit_logs > 5 ปี · access_logs และ login_events > 1 ปี (ข้อ 10.3)
    audit.deny_change อนุญาต DELETE เฉพาะ current_user = 'audit_retention' (ข้อ 9.5) · คืน role เดิมเมื่อจบ
ไม่ GRANT ให้ authenticated$doc$;
