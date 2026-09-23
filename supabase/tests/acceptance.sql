-- =====================================================================================
-- supabase/tests/acceptance.sql — ตรวจ "ทุกตัวเลขที่พิมพ์" ใน CANONICAL ข้อ 13.1–13.12 · 13.14 · 14.7
-- และคำถาม Acceptance 11 ข้อของ A44 · B27  ทั้งหมดคำนวณจากแถวจริงผ่าน api.get_kpis / api.get_report
-- ต้องรันคู่กับ supabase/seed.sql:  node tools/db/run.mjs --seed --test acceptance
-- run.mjs ครอบไฟล์ด้วย BEGIN … ROLLBACK · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์
--
-- "ตอนนี้" = 11 ก.ย. 2569 10:24 น. · P (LAST_30_DAYS) = [13 ส.ค. 2569, 12 ก.ย. 2569)
-- =====================================================================================

-- ===== P0: helper =====
CREATE FUNCTION test.acc_call(p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$ DECLARE v jsonb; BEGIN EXECUTE p_sql INTO v; RETURN v; END; $$;

CREATE FUNCTION test.acc_get(p jsonb, p_code text, p_field text, p_gk text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT x ->> p_field
    FROM jsonb_array_elements(p -> 'rows') x
    WHERE x ->> 'code' = p_code
      AND ((p_gk IS NULL AND (x -> 'group_key') = 'null'::jsonb)
        OR (p_gk IS NOT NULL AND x ->> 'group_key' = p_gk))
    LIMIT 1
$$;
CREATE FUNCTION test.acc_num(p jsonb, p_code text, p_gk text DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT test.acc_get(p, p_code, 'value', p_gk)::numeric $$;
CREATE FUNCTION test.branch(p_code text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT b.id FROM core.branches b WHERE b.code = p_code $$;
CREATE FUNCTION test.staff(p_code text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT s.id FROM core.staff_profiles s WHERE s.staff_code = p_code $$;
CREATE FUNCTION test.cust(p_no text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT c.id FROM crm.customers c WHERE c.customer_no = p_no $$;
/** ตรวจค่า display + change_display ของ KPI หนึ่งตัวพร้อมกัน */
CREATE FUNCTION test.acc_kpi(p jsonb, p_code text, p_display text, p_change text DEFAULT NULL,
                             p_gk text DEFAULT NULL, p_label text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq(test.acc_get(p, p_code, 'display', p_gk), p_display,
                           coalesce(nullif(p_label, ''), p_code) || ' display');
    IF p_change IS NOT NULL THEN
        PERFORM test.assert_eq(test.acc_get(p, p_code, 'change_display', p_gk), p_change,
                               coalesce(nullif(p_label, ''), p_code) || ' change');
    END IF;
END; $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test TO anon, authenticated, service_role;

CREATE TABLE test.acc (k text PRIMARY KEY, v jsonb);
GRANT SELECT, INSERT ON test.acc TO authenticated, service_role;

-- ===== F0: นาฬิกาอ้างอิงและประชากร (ข้อ 13.0) =====
SELECT test.assert_eq(app.clock(), '2026-09-11T10:24:00+07:00'::timestamptz, 'F01 app.clock() = 11 ก.ย. 2569 10:24');
SELECT test.assert_eq((SELECT value #>> '{}' FROM app.settings WHERE key = 'env'), 'dev', 'F02 app.settings env = dev');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers WHERE record_status = 'ACTIVE'), 14962::bigint,
                      'F03 ลูกค้า ACTIVE 14,962 ราย (ข้อ 13.0 ข้อ 3)');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers WHERE record_status = 'MERGED'), 16::bigint,
                      'F04 ลูกค้า MERGED 16 ราย');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers WHERE customer_no LIKE 'CUS-2025-%'), 8126::bigint,
                      'F05 ลูกค้านำเข้าก่อนปี 2026 8,126 ราย');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers WHERE customer_no LIKE 'CUS-2025-%' AND created_via = 'IMPORT'),
                      8126::bigint, 'F06 ลูกค้านำเข้าทุกรายมี created_via = IMPORT');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers WHERE customer_no LIKE 'CUS-2026-%'), 6852::bigint,
                      'F07 เลขลูกค้าปี 2026 ถึง CUS-2026-006852');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers
                        WHERE customer_no BETWEEN 'CUS-2026-006044' AND 'CUS-2026-006852'
                          AND first_seen_at >= '2026-08-13 00:00+07' AND first_seen_at < '2026-09-12 00:00+07'),
                      809::bigint, 'F08 CUS-2026-006044…006852 คือลูกค้าใหม่ใน P ทั้ง 809 เลข');
SELECT test.assert_eq((SELECT count(*) FROM crm.customers
                        WHERE first_seen_at >= '2026-08-13 00:00+07' AND first_seen_at < '2026-09-12 00:00+07'
                          AND customer_no NOT BETWEEN 'CUS-2026-006044' AND 'CUS-2026-006852'),
                      0::bigint, 'F09 ไม่มีลูกค้าใหม่ใน P นอกช่วงเลขที่กำหนด');
-- running numbers (ข้อ 13.0 ข้อ 8)
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'CUS:2026'), 6852::bigint, 'F10 CUS:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'CUS:2025'), 8126::bigint, 'F11 CUS:2025');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'LD:2026'), 7545::bigint, 'F12 LD:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'OP:2026'), 3121::bigint, 'F13 OP:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'QT:2026'), 1772::bigint, 'F14 QT:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'TK:2026'), 12660::bigint, 'F15 TK:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'EX:2026'), 31::bigint, 'F16 EX:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'MG:2026'), 16::bigint, 'F17 MG:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'RG:2026'), 3::bigint, 'F18 RG:2026');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'ST'), 51::bigint, 'F19 ST');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'VISIT:JP1:20260911'), 7::bigint, 'F20 VISIT:JP1:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'VISIT:JP2:20260911'), 4::bigint, 'F21 VISIT:JP2:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'VISIT:JP3:20260911'), 4::bigint, 'F22 VISIT:JP3:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'VISIT:JP4:20260911'), 2::bigint, 'F23 VISIT:JP4:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'QUEUE:JP1:20260911'), 4::bigint, 'F24 QUEUE:JP1:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'QUEUE:JP2:20260911'), 2::bigint, 'F25 QUEUE:JP2:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'QUEUE:JP3:20260911'), 2::bigint, 'F26 QUEUE:JP3:20260911');
SELECT test.assert_eq((SELECT last_value FROM app.running_numbers WHERE scope_key = 'QUEUE:JP4:20260911'), 1::bigint, 'F27 QUEUE:JP4:20260911');
WITH vday AS (
  SELECT b.code AS bcode, to_char(app.bangkok_date(v.started_at), 'YYYYMMDD') AS d,
         count(*) AS n, count(*) FILTER (WHERE v.channel_code = 'WALK_IN') AS q
  FROM crm.visits v JOIN core.branches b ON b.id = v.branch_id GROUP BY 1, 2)
SELECT test.assert_eq((SELECT count(*) FROM vday
                        WHERE coalesce((SELECT r.last_value FROM app.running_numbers r
                                         WHERE r.scope_key = 'VISIT:' || vday.bcode || ':' || vday.d), -1) <> vday.n),
                      0::bigint, 'F28 ทุกคู่ (สาขา, วัน) มีตัวนับ VISIT เท่ากับจำนวน visit ของวันนั้น');
WITH vday AS (
  SELECT b.code AS bcode, to_char(app.bangkok_date(v.started_at), 'YYYYMMDD') AS d,
         count(*) FILTER (WHERE v.channel_code = 'WALK_IN') AS q
  FROM crm.visits v JOIN core.branches b ON b.id = v.branch_id GROUP BY 1, 2 HAVING count(*) FILTER (WHERE v.channel_code = 'WALK_IN') > 0)
SELECT test.assert_eq((SELECT count(*) FROM vday
                        WHERE coalesce((SELECT r.last_value FROM app.running_numbers r
                                         WHERE r.scope_key = 'QUEUE:' || vday.bcode || ':' || vday.d), -1) <> vday.q),
                      0::bigint, 'F29 ทุกคู่ (สาขา, วัน) ที่มี walk-in มีตัวนับ QUEUE เท่ากับเลขคิวสูงสุด');
WITH seqn AS (
  SELECT v.visit_no, v.queue_no, b.code AS bcode, app.bangkok_date(v.started_at) AS d,
         row_number() OVER (PARTITION BY v.branch_id, app.bangkok_date(v.started_at) ORDER BY v.started_at, v.id) AS rn,
         row_number() OVER (PARTITION BY v.branch_id, app.bangkok_date(v.started_at), (v.channel_code = 'WALK_IN')
                            ORDER BY v.started_at, v.id) AS qn,
         v.channel_code
  FROM crm.visits v JOIN core.branches b ON b.id = v.branch_id)
SELECT test.assert_eq((SELECT count(*) FROM seqn
                        WHERE seqn.visit_no <> 'V-' || seqn.bcode || '-' || to_char(seqn.d, 'YYMMDD') || '-' || lpad(seqn.rn::text, 3, '0')
                           OR (seqn.channel_code = 'WALK_IN' AND seqn.queue_no <> seqn.qn)
                           OR (seqn.channel_code <> 'WALK_IN' AND seqn.queue_no IS NOT NULL)),
                      0::bigint, 'F30 เลข visit และเลขคิวเรียงตาม started_at ของสาขา/วัน (ข้อ 4.1)');
-- opportunity WON ทุกใบมี transaction ref ยกเว้น 12 ใบของ WON_WITHOUT_TRANSACTION (ข้อ 13.0 ข้อ 6)
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.stage = 'WON'
                        AND NOT EXISTS (SELECT 1 FROM crm.transaction_refs t WHERE t.opportunity_id = o.id)),
                      12::bigint, 'F31 opportunity WON ที่ไม่มี transaction ref มี 12 ใบ');
SELECT test.assert_eq((SELECT count(*) FROM crm.transaction_refs t WHERE t.opportunity_id IS NULL), 0::bigint,
                      'F32 ไม่มี transaction ref ที่ไม่ผูก opportunity');
SELECT test.assert_eq((SELECT count(*) FROM crm.transaction_refs t WHERE t.source_system_code <> 'MANUAL'), 0::bigint,
                      'F33 transaction ref ทุกแถวมาจากระบบ MANUAL');
-- invariant ข้อ 3.2: ไม่มีกิจกรรมก่อน first_seen_at
SELECT test.assert_eq((SELECT count(*) FROM crm.customers c
                        WHERE EXISTS (SELECT 1 FROM analytics.customer_activity a
                                       WHERE a.customer_id = c.id AND a.occurred_at < c.first_seen_at)),
                      0::bigint, 'F34 invariant ข้อ 3.2 — ไม่มีกิจกรรมก่อน first_seen_at');

-- =====================================================================================
-- A. ทั้งองค์กร (ข้อ 13.1) — จ๋าอั๋น (EXECUTIVE · ทุกสาขา) · preset LAST_30_DAYS
-- =====================================================================================
SELECT test.login_as('ja@example.com', 'aal2');
INSERT INTO test.acc VALUES ('org', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
INSERT INTO test.acc VALUES ('org_branch', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'BRANCH')$$));
INSERT INTO test.acc VALUES ('org_today', test.acc_call($$SELECT api.get_kpis('TODAY', NULL, NULL, NULL, 'NONE')$$));
INSERT INTO test.acc VALUES ('org_today_branch', test.acc_call($$SELECT api.get_kpis('TODAY', NULL, NULL, NULL, 'BRANCH')$$));
INSERT INTO test.acc VALUES ('rep_channels', test.acc_call($$SELECT api.get_report('CHANNELS', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$));
INSERT INTO test.acc VALUES ('rep_lost', test.acc_call($$SELECT api.get_report('LOST_REASONS', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$));
INSERT INTO test.acc VALUES ('rep_dq', test.acc_call($$SELECT api.get_report('DATA_QUALITY', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$));
INSERT INTO test.acc VALUES ('rep_overview', test.acc_call($$SELECT api.get_report('OVERVIEW', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$));
SELECT test.logout();

SELECT test.assert_eq((SELECT v ->> 'ok' FROM test.acc WHERE k = 'org'), 'true', 'A00 api.get_kpis ตอบ ok');
SELECT test.assert_eq((SELECT (v #>> '{period,start}')::timestamptz FROM test.acc WHERE k = 'org'),
                      '2026-08-13T00:00:00+07:00'::timestamptz, 'A00a ขอบล่างของ P');
SELECT test.assert_eq((SELECT (v #>> '{period,end}')::timestamptz FROM test.acc WHERE k = 'org'),
                      '2026-09-12T00:00:00+07:00'::timestamptz, 'A00b ขอบบนของ P');
SELECT test.assert_eq((SELECT (v #>> '{period,cmp_start}')::timestamptz FROM test.acc WHERE k = 'org'),
                      '2026-07-14T00:00:00+07:00'::timestamptz, 'A00c ขอบล่างของช่วงก่อนหน้า');

SELECT test.acc_kpi(v, 'VISITS',              '3,125', '+12%', NULL, 'A01 VISITS')              FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'WALKIN_VISITS',       '2,525', NULL,   NULL, 'A02 WALKIN_VISITS')       FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'IDENTIFIED_VISITS',   '2,719', NULL,   NULL, 'A03 IDENTIFIED_VISITS')   FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS',    '1,284', '+12%', NULL, 'A04 UNIQUE_CUSTOMERS')    FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'NEW_CUSTOMERS',       '809',   NULL,   NULL, 'A05 NEW_CUSTOMERS')       FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'RETURNING_CUSTOMERS', '475',   NULL,   NULL, 'A06 RETURNING_CUSTOMERS') FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LEADS',               '892',   '+8%',  NULL, 'A07 LEADS')               FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'OPPORTUNITIES',       '368',   '+14%', NULL, 'A08 OPPORTUNITIES')       FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'SALES',               '215',   '+18%', NULL, 'A09 SALES')               FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿3,332,700',  '+9%',  NULL, 'A10 SALES_AMOUNT')        FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LOST_OPPORTUNITIES',  '153',   NULL,   NULL, 'A11 LOST_OPPORTUNITIES')  FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LOST_LEADS',          '143',   NULL,   NULL, 'A12 LOST_LEADS')          FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LOST_TOTAL',          '296',   NULL,   NULL, 'A13 LOST_TOTAL')          FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'BUYERS',              '209',   NULL,   NULL, 'A14 BUYERS')              FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'REPEAT_BUYERS',       '41',    NULL,   NULL, 'A15 REPEAT_BUYERS')       FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LEAD_RATE',           '28.5%', NULL,   NULL, 'A16 LEAD_RATE')           FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'OPPORTUNITY_RATE',    '41.3%', NULL,   NULL, 'A17 OPPORTUNITY_RATE')    FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'CLOSE_RATE',          '58.4%', NULL,   NULL, 'A18 CLOSE_RATE')          FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LOST_RATE',           '41.6%', NULL,   NULL, 'A19 LOST_RATE')           FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'CONV_LEAD_TO_SALE',   '24.1%', '+2.1 pp', NULL, 'A20 CONV_LEAD_TO_SALE') FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'CONV_VISIT_TO_SALE',  '6.9%',  NULL,   NULL, 'A21 CONV_VISIT_TO_SALE')  FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'WALKIN_CONVERSION',   '6.3%',  NULL,   NULL, 'A22 WALKIN_CONVERSION')   FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'REPEAT_RATE',         '19.6%', NULL,   NULL, 'A23 REPEAT_RATE')         FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'LEAD_RESPONSE_MIN',   '18 นาที', NULL, NULL, 'A24 LEAD_RESPONSE_MIN')   FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'CAPTURE_RATE',        '87.0%', NULL,   NULL, 'A25 CAPTURE_RATE')        FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'OUTCOME_COMPLETION',  '95.4%', NULL,   NULL, 'A26 OUTCOME_COMPLETION')  FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'FOLLOWUP_COMPLETION', '85.0%', NULL,   NULL, 'A27 FOLLOWUP_COMPLETION') FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'DUPLICATE_RATE',      '0.1%',  NULL,   NULL, 'A28 DUPLICATE_RATE')      FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'MISSING_REQUIRED_RATE','0.4%', NULL,   NULL, 'A29 MISSING_REQUIRED_RATE') FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'OPEN_FOLLOWUP_CUSTOMERS', '117', NULL, NULL, 'A30 OPEN_FOLLOWUP_CUSTOMERS') FROM test.acc WHERE k = 'org';
SELECT test.acc_kpi(v, 'OPEN_VISITS',         '4',     NULL,   NULL, 'A31 visit ที่ยังไม่ปิด')   FROM test.acc WHERE k = 'org';
-- ตัวตั้ง/ตัวหารที่พิมพ์ในข้อ 13.1
SELECT test.assert_eq(test.acc_get(v, 'WALKIN_CONVERSION', 'numerator'), '158', 'A32 WALKIN_CONVERSION ตัวตั้ง 158') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'WALKIN_CONVERSION', 'denominator'), '2525', 'A33 WALKIN_CONVERSION ตัวหาร 2,525') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'REPEAT_RATE', 'numerator'), '41', 'A34 REPEAT_RATE ตัวตั้ง 41') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'REPEAT_RATE', 'denominator'), '209', 'A35 REPEAT_RATE ตัวหาร 209') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'OUTCOME_COMPLETION', 'numerator'), '2977', 'A36 OUTCOME_COMPLETION ตัวตั้ง 2,977') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'OUTCOME_COMPLETION', 'denominator'), '3121', 'A37 OUTCOME_COMPLETION ตัวหาร 3,121') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'FOLLOWUP_COMPLETION', 'numerator'), '889', 'A38 FOLLOWUP_COMPLETION ตัวตั้ง 889') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'FOLLOWUP_COMPLETION', 'denominator'), '1046', 'A39 FOLLOWUP_COMPLETION ตัวหาร 1,046') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'DUPLICATE_RATE', 'numerator'), '16', 'A40 DUPLICATE_RATE ตัวตั้ง 16') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'DUPLICATE_RATE', 'denominator'), '14962', 'A41 DUPLICATE_RATE ตัวหาร 14,962') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'MISSING_REQUIRED_RATE', 'numerator'), '61', 'A42 MISSING_REQUIRED_RATE ตัวตั้ง 61') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'MISSING_REQUIRED_RATE', 'denominator'), '14962', 'A43 MISSING_REQUIRED_RATE ตัวหาร 14,962') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'LEAD_RESPONSE_MIN', 'numerator'), '214', 'A44 LEAD_RESPONSE_MIN ฐาน 214 lead') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'LEAD_RESPONSE_MIN', 'extra'), '{"not_contacted": 9}', 'A45 LEAD_RESPONSE_MIN ยังไม่ติดต่อ 9') FROM test.acc WHERE k = 'org';
-- เป้าหมาย (ข้อ 12.3)
SELECT test.assert_eq(test.acc_get(v, 'CAPTURE_RATE', 'target_met'), 'false', 'A46 CAPTURE_RATE ต่ำกว่าเป้า ≥ 95%') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'OUTCOME_COMPLETION', 'target_met'), 'true', 'A47 OUTCOME_COMPLETION ผ่านเป้า ≥ 95%') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'FOLLOWUP_COMPLETION', 'target_met'), 'false', 'A48 FOLLOWUP_COMPLETION ต่ำกว่าเป้า ≥ 90%') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'DUPLICATE_RATE', 'target_met'), 'true', 'A49 DUPLICATE_RATE ผ่านเป้า < 2%') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'MISSING_REQUIRED_RATE', 'target_met'), 'true', 'A50 MISSING_REQUIRED_RATE ผ่านเป้า < 2%') FROM test.acc WHERE k = 'org';
-- Funnel ของข้อ 13.1: Visitor 3,125 → Lead 892 (28.5%) → Opportunity 368 (11.8%) → Sale 215 (6.9%)
SELECT test.assert_eq(app.fmt_rate(app.kpi_rate(test.acc_num(v, 'OPPORTUNITIES'), test.acc_num(v, 'VISITS'))), '11.8%',
                      'A51 Funnel — Opportunity เทียบ Visitor 11.8%') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(app.fmt_rate(app.kpi_rate(test.acc_num(v, 'NEW_CUSTOMERS'), test.acc_num(v, 'UNIQUE_CUSTOMERS'))), '63.0%',
                      'A52 ลูกค้าใหม่ 63.0% ของลูกค้าไม่ซ้ำ') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(app.fmt_rate(app.kpi_rate(test.acc_num(v, 'RETURNING_CUSTOMERS'), test.acc_num(v, 'UNIQUE_CUSTOMERS'))), '37.0%',
                      'A53 ลูกค้าเก่า 37.0% ของลูกค้าไม่ซ้ำ') FROM test.acc WHERE k = 'org';

-- =====================================================================================
-- B. รายสาขา (ข้อ 13.2 · 13.2b) — จัดกลุ่ม BRANCH
-- =====================================================================================
CREATE FUNCTION test.acc_branch(p_bcode text, p_kpi text, p_display text, p_change text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'org_branch';
    PERFORM test.acc_kpi(v, p_kpi, p_display, p_change, test.branch(p_bcode)::text, 'B ' || p_bcode || ' ' || p_kpi);
END; $$;
SELECT test.acc_branch('JP1', 'VISITS', '1,008', '+12%');
SELECT test.acc_branch('JP1', 'WALKIN_VISITS', '812');
SELECT test.acc_branch('JP1', 'IDENTIFIED_VISITS', '891');
SELECT test.acc_branch('JP1', 'UNIQUE_CUSTOMERS', '412', '+12%');
SELECT test.acc_branch('JP1', 'NEW_CUSTOMERS', '262');
SELECT test.acc_branch('JP1', 'RETURNING_CUSTOMERS', '150');
SELECT test.acc_branch('JP1', 'LEADS', '298', '+8%');
SELECT test.acc_branch('JP1', 'OPPORTUNITIES', '120', '+14%');
SELECT test.acc_branch('JP1', 'SALES', '82', '+19%');
SELECT test.acc_branch('JP1', 'SALES_AMOUNT', '฿1,245,000', '+12%');
SELECT test.acc_branch('JP1', 'LOST_OPPORTUNITIES', '51');
SELECT test.acc_branch('JP1', 'LOST_LEADS', '45');
SELECT test.acc_branch('JP2', 'VISITS', '842', '+12%');
SELECT test.acc_branch('JP2', 'WALKIN_VISITS', '694');
SELECT test.acc_branch('JP2', 'IDENTIFIED_VISITS', '740');
SELECT test.acc_branch('JP2', 'UNIQUE_CUSTOMERS', '356', '+12%');
SELECT test.acc_branch('JP2', 'NEW_CUSTOMERS', '222');
SELECT test.acc_branch('JP2', 'RETURNING_CUSTOMERS', '134');
SELECT test.acc_branch('JP2', 'LEADS', '241', '+8%');
SELECT test.acc_branch('JP2', 'OPPORTUNITIES', '98', '+14%');
SELECT test.acc_branch('JP2', 'SALES', '61', '+17%');
SELECT test.acc_branch('JP2', 'SALES_AMOUNT', '฿906,500', '+8%');
SELECT test.acc_branch('JP2', 'LOST_OPPORTUNITIES', '40');
SELECT test.acc_branch('JP2', 'LOST_LEADS', '38');
SELECT test.acc_branch('JP3', 'VISITS', '694', '+12%');
SELECT test.acc_branch('JP3', 'WALKIN_VISITS', '521');
SELECT test.acc_branch('JP3', 'IDENTIFIED_VISITS', '596');
SELECT test.acc_branch('JP3', 'UNIQUE_CUSTOMERS', '280', '+12%');
SELECT test.acc_branch('JP3', 'NEW_CUSTOMERS', '176');
SELECT test.acc_branch('JP3', 'RETURNING_CUSTOMERS', '104');
SELECT test.acc_branch('JP3', 'LEADS', '187', '+8%');
SELECT test.acc_branch('JP3', 'OPPORTUNITIES', '86', '+13%');
SELECT test.acc_branch('JP3', 'SALES', '45', '+18%');
SELECT test.acc_branch('JP3', 'SALES_AMOUNT', '฿712,300', '+5%');
SELECT test.acc_branch('JP3', 'LOST_OPPORTUNITIES', '36');
SELECT test.acc_branch('JP3', 'LOST_LEADS', '33');
SELECT test.acc_branch('JP4', 'VISITS', '581', '+12%');
SELECT test.acc_branch('JP4', 'WALKIN_VISITS', '498');
SELECT test.acc_branch('JP4', 'IDENTIFIED_VISITS', '492');
SELECT test.acc_branch('JP4', 'UNIQUE_CUSTOMERS', '236', '+12%');
SELECT test.acc_branch('JP4', 'NEW_CUSTOMERS', '149');
SELECT test.acc_branch('JP4', 'RETURNING_CUSTOMERS', '87');
SELECT test.acc_branch('JP4', 'LEADS', '166', '+8%');
SELECT test.acc_branch('JP4', 'OPPORTUNITIES', '64', '+14%');
SELECT test.acc_branch('JP4', 'SALES', '27', '+17%');
SELECT test.acc_branch('JP4', 'SALES_AMOUNT', '฿468,900', '+11%');
SELECT test.acc_branch('JP4', 'LOST_OPPORTUNITIES', '26');
SELECT test.acc_branch('JP4', 'LOST_LEADS', '27');
-- ข้อ 13.2b: ค่าประกอบและอัตรารายสาขา
SELECT test.acc_branch('JP1', 'LEAD_RATE', '29.6%');   SELECT test.acc_branch('JP1', 'OPPORTUNITY_RATE', '40.3%');
SELECT test.acc_branch('JP1', 'CLOSE_RATE', '61.7%');  SELECT test.acc_branch('JP1', 'LOST_RATE', '38.3%');
SELECT test.acc_branch('JP1', 'CONV_LEAD_TO_SALE', '27.5%', '+2.5 pp');
SELECT test.acc_branch('JP1', 'CONV_VISIT_TO_SALE', '8.1%'); SELECT test.acc_branch('JP1', 'WALKIN_CONVERSION', '7.4%');
SELECT test.acc_branch('JP1', 'CAPTURE_RATE', '88.4%'); SELECT test.acc_branch('JP1', 'OUTCOME_COMPLETION', '95.6%');
SELECT test.acc_branch('JP1', 'FOLLOWUP_COMPLETION', '86.6%'); SELECT test.acc_branch('JP1', 'REPEAT_RATE', '20.0%');
SELECT test.acc_branch('JP1', 'BUYERS', '80'); SELECT test.acc_branch('JP1', 'REPEAT_BUYERS', '16');
SELECT test.acc_branch('JP2', 'LEAD_RATE', '28.6%');   SELECT test.acc_branch('JP2', 'OPPORTUNITY_RATE', '40.7%');
SELECT test.acc_branch('JP2', 'CLOSE_RATE', '60.4%');  SELECT test.acc_branch('JP2', 'LOST_RATE', '39.6%');
SELECT test.acc_branch('JP2', 'CONV_LEAD_TO_SALE', '25.3%', '+2.0 pp');
SELECT test.acc_branch('JP2', 'CONV_VISIT_TO_SALE', '7.2%'); SELECT test.acc_branch('JP2', 'WALKIN_CONVERSION', '6.6%');
SELECT test.acc_branch('JP2', 'CAPTURE_RATE', '87.9%'); SELECT test.acc_branch('JP2', 'OUTCOME_COMPLETION', '95.5%');
SELECT test.acc_branch('JP2', 'FOLLOWUP_COMPLETION', '84.8%'); SELECT test.acc_branch('JP2', 'REPEAT_RATE', '20.3%');
SELECT test.acc_branch('JP2', 'BUYERS', '59'); SELECT test.acc_branch('JP2', 'REPEAT_BUYERS', '12');
SELECT test.acc_branch('JP3', 'LEAD_RATE', '26.9%');   SELECT test.acc_branch('JP3', 'OPPORTUNITY_RATE', '46.0%');
SELECT test.acc_branch('JP3', 'CLOSE_RATE', '55.6%');  SELECT test.acc_branch('JP3', 'LOST_RATE', '44.4%');
SELECT test.acc_branch('JP3', 'CONV_LEAD_TO_SALE', '24.1%', '+2.1 pp');
SELECT test.acc_branch('JP3', 'CONV_VISIT_TO_SALE', '6.5%'); SELECT test.acc_branch('JP3', 'WALKIN_CONVERSION', '6.0%');
SELECT test.acc_branch('JP3', 'CAPTURE_RATE', '85.9%'); SELECT test.acc_branch('JP3', 'OUTCOME_COMPLETION', '95.1%');
SELECT test.acc_branch('JP3', 'FOLLOWUP_COMPLETION', '84.1%'); SELECT test.acc_branch('JP3', 'REPEAT_RATE', '18.2%');
SELECT test.acc_branch('JP3', 'BUYERS', '44'); SELECT test.acc_branch('JP3', 'REPEAT_BUYERS', '8');
SELECT test.acc_branch('JP4', 'LEAD_RATE', '28.6%');   SELECT test.acc_branch('JP4', 'OPPORTUNITY_RATE', '38.6%');
SELECT test.acc_branch('JP4', 'CLOSE_RATE', '50.9%');  SELECT test.acc_branch('JP4', 'LOST_RATE', '49.1%');
SELECT test.acc_branch('JP4', 'CONV_LEAD_TO_SALE', '16.3%', '+1.3 pp');
SELECT test.acc_branch('JP4', 'CONV_VISIT_TO_SALE', '4.6%'); SELECT test.acc_branch('JP4', 'WALKIN_CONVERSION', '4.2%');
SELECT test.acc_branch('JP4', 'CAPTURE_RATE', '84.7%'); SELECT test.acc_branch('JP4', 'OUTCOME_COMPLETION', '95.2%');
SELECT test.acc_branch('JP4', 'FOLLOWUP_COMPLETION', '83.1%'); SELECT test.acc_branch('JP4', 'REPEAT_RATE', '19.2%');
SELECT test.acc_branch('JP4', 'BUYERS', '26'); SELECT test.acc_branch('JP4', 'REPEAT_BUYERS', '5');
-- ค่าก่อนหน้ารายสาขา (ข้อ 13.2b ตารางที่สอง) อ่านจาก prev_value
CREATE FUNCTION test.acc_prev(p_bcode text, p_kpi text, p_expect text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'org_branch';
    PERFORM test.assert_eq(test.acc_get(v, p_kpi, 'prev_value', test.branch(p_bcode)::text), p_expect,
                           'B prev ' || p_bcode || ' ' || p_kpi);
END; $$;
SELECT test.acc_prev('JP1', 'VISITS', '900');  SELECT test.acc_prev('JP1', 'UNIQUE_CUSTOMERS', '368');
SELECT test.acc_prev('JP1', 'LEADS', '276');   SELECT test.acc_prev('JP1', 'OPPORTUNITIES', '105');
SELECT test.acc_prev('JP1', 'SALES', '69');    SELECT test.acc_prev('JP1', 'SALES_AMOUNT', '1111600.00');
SELECT test.acc_prev('JP2', 'VISITS', '752');  SELECT test.acc_prev('JP2', 'UNIQUE_CUSTOMERS', '318');
SELECT test.acc_prev('JP2', 'LEADS', '223');   SELECT test.acc_prev('JP2', 'OPPORTUNITIES', '86');
SELECT test.acc_prev('JP2', 'SALES', '52');    SELECT test.acc_prev('JP2', 'SALES_AMOUNT', '839350.00');
SELECT test.acc_prev('JP3', 'VISITS', '620');  SELECT test.acc_prev('JP3', 'UNIQUE_CUSTOMERS', '250');
SELECT test.acc_prev('JP3', 'LEADS', '173');   SELECT test.acc_prev('JP3', 'OPPORTUNITIES', '76');
SELECT test.acc_prev('JP3', 'SALES', '38');    SELECT test.acc_prev('JP3', 'SALES_AMOUNT', '678380.00');
SELECT test.acc_prev('JP4', 'VISITS', '518');  SELECT test.acc_prev('JP4', 'UNIQUE_CUSTOMERS', '210');
SELECT test.acc_prev('JP4', 'LEADS', '154');   SELECT test.acc_prev('JP4', 'OPPORTUNITIES', '56');
SELECT test.acc_prev('JP4', 'SALES', '23');    SELECT test.acc_prev('JP4', 'SALES_AMOUNT', '422430.00');
-- JPON ไม่มีรายการใน P (ข้อ 13.2)
SELECT test.acc_branch('JPON', 'VISITS', '0'); SELECT test.acc_branch('JPON', 'LEADS', '0');
SELECT test.acc_branch('JPON', 'SALES', '0');  SELECT test.acc_branch('JPON', 'UNIQUE_CUSTOMERS', '0');
-- ค่าประกอบที่พิมพ์ในข้อ 13.2b (ตัวตั้ง/ตัวหาร)
CREATE FUNCTION test.acc_bnum(p_bcode text, p_kpi text, p_field text, p_expect text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'org_branch';
    PERFORM test.assert_eq(test.acc_get(v, p_kpi, p_field, test.branch(p_bcode)::text), p_expect,
                           'B13.2b ' || p_bcode || ' ' || p_kpi || '.' || p_field);
END; $$;
SELECT test.acc_bnum('JP1', 'WALKIN_CONVERSION', 'numerator', '60');
SELECT test.acc_bnum('JP2', 'WALKIN_CONVERSION', 'numerator', '46');
SELECT test.acc_bnum('JP3', 'WALKIN_CONVERSION', 'numerator', '31');
SELECT test.acc_bnum('JP4', 'WALKIN_CONVERSION', 'numerator', '21');
SELECT test.acc_bnum('JP1', 'OUTCOME_COMPLETION', 'denominator', '1004');
SELECT test.acc_bnum('JP2', 'OUTCOME_COMPLETION', 'denominator', '842');
SELECT test.acc_bnum('JP3', 'OUTCOME_COMPLETION', 'denominator', '694');
SELECT test.acc_bnum('JP4', 'OUTCOME_COMPLETION', 'denominator', '581');
SELECT test.acc_bnum('JP1', 'OUTCOME_COMPLETION', 'numerator', '960');
SELECT test.acc_bnum('JP2', 'OUTCOME_COMPLETION', 'numerator', '804');
SELECT test.acc_bnum('JP3', 'OUTCOME_COMPLETION', 'numerator', '660');
SELECT test.acc_bnum('JP4', 'OUTCOME_COMPLETION', 'numerator', '553');
SELECT test.acc_bnum('JP1', 'FOLLOWUP_COMPLETION', 'denominator', '352');
SELECT test.acc_bnum('JP2', 'FOLLOWUP_COMPLETION', 'denominator', '290');
SELECT test.acc_bnum('JP3', 'FOLLOWUP_COMPLETION', 'denominator', '226');
SELECT test.acc_bnum('JP4', 'FOLLOWUP_COMPLETION', 'denominator', '178');
SELECT test.acc_bnum('JP1', 'FOLLOWUP_COMPLETION', 'numerator', '305');
SELECT test.acc_bnum('JP2', 'FOLLOWUP_COMPLETION', 'numerator', '246');
SELECT test.acc_bnum('JP3', 'FOLLOWUP_COMPLETION', 'numerator', '190');
SELECT test.acc_bnum('JP4', 'FOLLOWUP_COMPLETION', 'numerator', '148');
-- UNRECORDED รายสาขา (ข้อ 13.2b)
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP1')
                        AND v.outcome_code = 'UNRECORDED' AND v.started_at >= '2026-08-13 00:00+07' AND v.started_at < '2026-09-12 00:00+07'),
                      44::bigint, 'B13.2b UNRECORDED JP1 44');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP2')
                        AND v.outcome_code = 'UNRECORDED' AND v.started_at >= '2026-08-13 00:00+07' AND v.started_at < '2026-09-12 00:00+07'),
                      38::bigint, 'B13.2b UNRECORDED JP2 38');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP3')
                        AND v.outcome_code = 'UNRECORDED' AND v.started_at >= '2026-08-13 00:00+07' AND v.started_at < '2026-09-12 00:00+07'),
                      34::bigint, 'B13.2b UNRECORDED JP3 34');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP4')
                        AND v.outcome_code = 'UNRECORDED' AND v.started_at >= '2026-08-13 00:00+07' AND v.started_at < '2026-09-12 00:00+07'),
                      28::bigint, 'B13.2b UNRECORDED JP4 28');

-- =====================================================================================
-- C. แหล่งที่มาลูกค้า (ข้อ 13.3) — api.get_report('CHANNELS') → extra.channel_matrix
-- =====================================================================================
CREATE FUNCTION test.acc_chan(p_bcode text, p_chan text, p_expect bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'rep_channels';
    PERFORM test.assert_eq((SELECT (x ->> 'value')::bigint FROM jsonb_array_elements(v -> 'extra' -> 'channel_matrix') x
                             WHERE x ->> 'branch_code' = p_bcode AND x ->> 'channel_code' = p_chan),
                           p_expect, 'C13.3 ' || p_bcode || ' × ' || p_chan);
END; $$;
SELECT test.acc_chan('JP1', 'WALK_IN', 147); SELECT test.acc_chan('JP1', 'LINE', 116); SELECT test.acc_chan('JP1', 'FACEBOOK', 66);
SELECT test.acc_chan('JP1', 'INSTAGRAM', 33); SELECT test.acc_chan('JP1', 'TIKTOK', 29); SELECT test.acc_chan('JP1', 'PHONE', 21);
SELECT test.acc_chan('JP2', 'WALK_IN', 143); SELECT test.acc_chan('JP2', 'LINE', 93); SELECT test.acc_chan('JP2', 'FACEBOOK', 53);
SELECT test.acc_chan('JP2', 'INSTAGRAM', 27); SELECT test.acc_chan('JP2', 'TIKTOK', 23); SELECT test.acc_chan('JP2', 'PHONE', 17);
SELECT test.acc_chan('JP3', 'WALK_IN', 64); SELECT test.acc_chan('JP3', 'LINE', 95); SELECT test.acc_chan('JP3', 'FACEBOOK', 54);
SELECT test.acc_chan('JP3', 'INSTAGRAM', 27); SELECT test.acc_chan('JP3', 'TIKTOK', 24); SELECT test.acc_chan('JP3', 'PHONE', 16);
SELECT test.acc_chan('JP4', 'WALK_IN', 108); SELECT test.acc_chan('JP4', 'LINE', 56); SELECT test.acc_chan('JP4', 'FACEBOOK', 32);
SELECT test.acc_chan('JP4', 'INSTAGRAM', 16); SELECT test.acc_chan('JP4', 'TIKTOK', 14); SELECT test.acc_chan('JP4', 'PHONE', 10);
-- รวมทั้งองค์กรตามช่องทาง (จัดกลุ่ม CHANNEL) และ WEBSITE = 0
SELECT test.login_as('ja@example.com', 'aal2');
INSERT INTO test.acc VALUES ('org_chan', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'CHANNEL')$$));
SELECT test.logout();
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '462', NULL, 'WALK_IN',   'C13.3 รวม WALK_IN')   FROM test.acc WHERE k = 'org_chan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '360', NULL, 'LINE',      'C13.3 รวม LINE')      FROM test.acc WHERE k = 'org_chan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '205', NULL, 'FACEBOOK',  'C13.3 รวม FACEBOOK')  FROM test.acc WHERE k = 'org_chan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '103', NULL, 'INSTAGRAM', 'C13.3 รวม INSTAGRAM') FROM test.acc WHERE k = 'org_chan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '90',  NULL, 'TIKTOK',    'C13.3 รวม TIKTOK')    FROM test.acc WHERE k = 'org_chan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '64',  NULL, 'PHONE',     'C13.3 รวม PHONE')     FROM test.acc WHERE k = 'org_chan';
SELECT test.assert_eq((SELECT count(*) FROM crm.customers c
                        WHERE c.first_channel_code = 'WEBSITE' AND c.record_status = 'ACTIVE'), 0::bigint,
                      'C13.3 WEBSITE = 0 (ไม่แสดงบนกราฟ)');

-- =====================================================================================
-- D. เหตุผลที่ไม่สำเร็จ (ข้อ 13.4) — 5 อันดับ + "อื่น ๆ"
-- =====================================================================================
CREATE FUNCTION test.acc_lost(p_pos integer, p_code text, p_value bigint, p_lead bigint, p_pct text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; r jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'rep_lost';
    r := (v -> 'extra' -> 'lost_reasons') -> (p_pos - 1);
    PERFORM test.assert_eq(r ->> 'code', p_code, 'D13.4 อันดับ ' || p_pos || ' รหัส');
    PERFORM test.assert_eq((r ->> 'value')::bigint, p_value, 'D13.4 อันดับ ' || p_pos || ' จำนวน');
    PERFORM test.assert_eq((r ->> 'lead_value')::bigint, p_lead, 'D13.4 อันดับ ' || p_pos || ' ในนั้นเป็น Lead');
    PERFORM test.assert_eq(r ->> 'pct_display', p_pct, 'D13.4 อันดับ ' || p_pos || ' ร้อยละ');
END; $$;
SELECT test.acc_lost(1, 'PRICE', 83, 38, '28.0%');
SELECT test.acc_lost(2, 'COMPARING', 53, 27, '17.9%');
SELECT test.acc_lost(3, 'NOT_READY', 47, 26, '15.9%');
SELECT test.acc_lost(4, 'DOCUMENTS', 36, 14, '12.2%');
SELECT test.acc_lost(5, 'CHANGED_MIND', 30, 13, '10.1%');
SELECT test.acc_lost(6, '_OTHERS', 47, 25, '15.9%');
SELECT test.assert_eq((SELECT jsonb_array_length(v -> 'extra' -> 'lost_reasons') FROM test.acc WHERE k = 'rep_lost'), 6,
                      'D13.4 กราฟแสดง 5 อันดับ + อื่น ๆ');
-- รายละเอียดของกลุ่ม "อื่น ๆ" และการแบ่งรายสาขา (ข้อ 13.4)
CREATE FUNCTION test.acc_lostbr(p_reason text, p_bcode text, p_expect bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq((SELECT count(*) FROM (
        SELECT l.branch_id FROM crm.leads l WHERE l.status = 'LOST' AND l.lost_reason_code = p_reason
           AND l.closed_at >= '2026-08-13 00:00+07' AND l.closed_at < '2026-09-12 00:00+07'
        UNION ALL
        SELECT o.branch_id FROM crm.opportunities o WHERE o.stage = 'LOST' AND o.lost_reason_code = p_reason
           AND o.closed_at >= '2026-08-13 00:00+07' AND o.closed_at < '2026-09-12 00:00+07') z
        WHERE z.branch_id = test.branch(p_bcode)), p_expect, 'D13.4 ' || p_reason || ' × ' || p_bcode);
END; $$;
SELECT test.acc_lostbr('PRICE', 'JP1', 27); SELECT test.acc_lostbr('PRICE', 'JP2', 22);
SELECT test.acc_lostbr('PRICE', 'JP3', 19); SELECT test.acc_lostbr('PRICE', 'JP4', 15);
SELECT test.acc_lostbr('COMPARING', 'JP1', 17); SELECT test.acc_lostbr('COMPARING', 'JP2', 14);
SELECT test.acc_lostbr('COMPARING', 'JP3', 12); SELECT test.acc_lostbr('COMPARING', 'JP4', 10);
SELECT test.acc_lostbr('NOT_READY', 'JP1', 15); SELECT test.acc_lostbr('NOT_READY', 'JP2', 12);
SELECT test.acc_lostbr('NOT_READY', 'JP3', 11); SELECT test.acc_lostbr('NOT_READY', 'JP4', 9);
SELECT test.acc_lostbr('DOCUMENTS', 'JP1', 12); SELECT test.acc_lostbr('DOCUMENTS', 'JP2', 10);
SELECT test.acc_lostbr('DOCUMENTS', 'JP3', 8);  SELECT test.acc_lostbr('DOCUMENTS', 'JP4', 6);
SELECT test.acc_lostbr('CHANGED_MIND', 'JP1', 10); SELECT test.acc_lostbr('CHANGED_MIND', 'JP2', 8);
SELECT test.acc_lostbr('CHANGED_MIND', 'JP3', 7);  SELECT test.acc_lostbr('CHANGED_MIND', 'JP4', 5);
SELECT test.acc_lostbr('OUT_OF_STOCK', 'JP1', 6); SELECT test.acc_lostbr('OUT_OF_STOCK', 'JP2', 5);
SELECT test.acc_lostbr('OUT_OF_STOCK', 'JP3', 4); SELECT test.acc_lostbr('OUT_OF_STOCK', 'JP4', 3);
SELECT test.acc_lostbr('FINANCE_REJECTED', 'JP1', 4); SELECT test.acc_lostbr('FINANCE_REJECTED', 'JP2', 3);
SELECT test.acc_lostbr('FINANCE_REJECTED', 'JP3', 3); SELECT test.acc_lostbr('FINANCE_REJECTED', 'JP4', 1);
SELECT test.acc_lostbr('COMPETITOR', 'JP1', 3); SELECT test.acc_lostbr('COMPETITOR', 'JP2', 2);
SELECT test.acc_lostbr('COMPETITOR', 'JP3', 2); SELECT test.acc_lostbr('COMPETITOR', 'JP4', 2);
SELECT test.acc_lostbr('UNREACHABLE', 'JP1', 1); SELECT test.acc_lostbr('UNREACHABLE', 'JP2', 1);
SELECT test.acc_lostbr('UNREACHABLE', 'JP3', 2); SELECT test.acc_lostbr('UNREACHABLE', 'JP4', 2);
SELECT test.acc_lostbr('PROMOTION', 'JP1', 1); SELECT test.acc_lostbr('PROMOTION', 'JP2', 1);
SELECT test.acc_lostbr('PROMOTION', 'JP3', 1); SELECT test.acc_lostbr('PROMOTION', 'JP4', 0);
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.status = 'LOST' AND l.lost_reason_code = 'UNREACHABLE'
                        AND l.closed_at >= '2026-08-13 00:00+07' AND l.closed_at < '2026-09-12 00:00+07'), 6::bigint,
                      'D13.4 UNREACHABLE เป็น Lead ทั้ง 6 รายการ');

-- =====================================================================================
-- E. พนักงานและทีม (ข้อ 13.5)
-- =====================================================================================
CREATE FUNCTION test.acc_staff(p_code text, p_name text, p_role text, p_branch text, p_status text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_id uuid; BEGIN
    v_id := test.staff(p_code);
    PERFORM test.assert_eq((SELECT s.display_name FROM core.staff_profiles s WHERE s.id = v_id), p_name, 'E13.5 ' || p_code || ' ชื่อ');
    PERFORM test.assert_eq((SELECT s.status::text FROM core.staff_profiles s WHERE s.id = v_id), p_status, 'E13.5 ' || p_code || ' สถานะ');
    IF p_role IS NOT NULL THEN
        PERFORM test.assert_true(EXISTS (SELECT 1 FROM core.staff_role_assignments a
                                          WHERE a.staff_id = v_id AND a.role_code = p_role
                                            AND a.branch_id IS NOT DISTINCT FROM CASE WHEN p_branch IS NULL THEN NULL ELSE test.branch(p_branch) END
                                            AND a.valid_to IS NULL),
                                 'E13.5 ' || p_code || ' บทบาท ' || p_role || coalesce(' @ ' || p_branch, ' @ องค์กร'));
    END IF;
END; $$;
SELECT test.acc_staff('ST-0001', 'จ๋าอั๋น', 'EXECUTIVE', NULL, 'ACTIVE');
SELECT test.acc_staff('ST-0002', 'คุณแพร', 'BUSINESS_ADMIN', NULL, 'ACTIVE');
SELECT test.acc_staff('ST-0003', 'คุณต้น', 'SYSTEM_ADMIN', NULL, 'ACTIVE');
SELECT test.acc_staff('ST-0010', 'คุณปุ๊ก', 'OPERATIONS', 'JP1', 'ACTIVE');
SELECT test.acc_staff('ST-0011', 'คุณมายด์', 'MARKETING', NULL, 'ACTIVE');
SELECT test.acc_staff('ST-0020', 'คุณเจ', 'BRANCH_MANAGER', 'JP1', 'ACTIVE');
SELECT test.acc_staff('ST-0021', 'คุณบอส', 'BRANCH_MANAGER', 'JP2', 'ACTIVE');
SELECT test.acc_staff('ST-0022', 'คุณหนึ่ง', 'BRANCH_MANAGER', 'JP3', 'ACTIVE');
SELECT test.acc_staff('ST-0023', 'คุณเบียร์', 'BRANCH_MANAGER', 'JP4', 'ACTIVE');
SELECT test.acc_staff('ST-0030', 'คุณนัท', 'SUPERVISOR', 'JP1', 'ACTIVE');
SELECT test.acc_staff('ST-0045', 'คุณขวัญ', 'STAFF', 'JP1', 'ACTIVE');
SELECT test.acc_staff('ST-0046', 'คุณคิม', 'STAFF', 'JP1', 'ACTIVE');
SELECT test.acc_staff('ST-0050', 'คุณฝน', 'STAFF', 'JPON', 'ACTIVE');
SELECT test.acc_staff('ST-0051', 'คุณโอ๊ต', NULL, NULL, 'INVITED');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_role_assignments a WHERE a.staff_id = test.staff('ST-0010') AND a.valid_to IS NULL),
                      4::bigint, 'E13.5 คุณปุ๊ก OPERATIONS ครบ 4 สาขา');
SELECT test.assert_true((SELECT m.is_leader FROM core.team_members m JOIN core.teams t ON t.id = m.team_id
                          WHERE t.code = 'JP1-SALES' AND m.staff_id = test.staff('ST-0030')), 'E13.5 คุณนัทเป็นหัวหน้าทีม JP1-SALES');
SELECT test.assert_eq((SELECT count(*) FROM core.team_members m JOIN core.teams t ON t.id = m.team_id WHERE t.code = 'JP1-SALES'),
                      3::bigint, 'E13.5 ทีม JP1-SALES มีสมาชิก 3 คน');
SELECT test.assert_eq((SELECT count(*) FROM core.team_members m JOIN core.teams t ON t.id = m.team_id
                        WHERE t.code IN ('JP2-SALES', 'JP3-SALES', 'JP4-SALES')), 0::bigint, 'E13.5 ทีม JP2–JP4 ไม่มีสมาชิก');
SELECT test.assert_eq((SELECT count(*) FROM core.team_members m JOIN core.teams t ON t.id = m.team_id
                        WHERE t.code = 'JPON-ADMIN' AND m.is_leader), 0::bigint, 'E13.5 ทีม JPON-ADMIN ไม่มีหัวหน้า');
SELECT test.assert_eq((SELECT count(*) FROM auth.mfa_factors f JOIN core.staff_profiles s ON s.user_id = f.user_id
                        JOIN core.staff_role_assignments a ON a.staff_id = s.id AND a.valid_to IS NULL
                        JOIN core.roles r ON r.code = a.role_code AND r.requires_mfa
                        WHERE f.status <> 'verified'), 0::bigint, 'E13.5 บัญชีที่ requires_mfa มี TOTP factor ที่ verified');
-- ลูกค้าของฉันล่าสุด (คุณขวัญ · 5 รายแรก เรียง last_activity_at DESC)
CREATE FUNCTION test.acc_recent(p_pos integer, p_no text, p_at timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT c.customer_no, c.last_activity_at INTO r FROM crm.customers c
    WHERE c.owner_staff_id = test.staff('ST-0045') AND c.record_status = 'ACTIVE'
    ORDER BY c.last_activity_at DESC NULLS LAST, c.customer_no DESC OFFSET (p_pos - 1) LIMIT 1;
    PERFORM test.assert_eq(r.customer_no, p_no, 'E13.5 ลูกค้าล่าสุดของคุณขวัญ อันดับ ' || p_pos);
    PERFORM test.assert_eq(r.last_activity_at, p_at, 'E13.5 เวลากิจกรรมล่าสุด อันดับ ' || p_pos);
END; $$;
SELECT test.acc_recent(1, 'CUS-2026-000297', '2026-09-11T10:24:00+07:00');
SELECT test.acc_recent(2, 'CUS-2026-006310', '2026-09-10T16:40:00+07:00');
SELECT test.acc_recent(3, 'CUS-2026-005412', '2026-09-10T14:05:00+07:00');
SELECT test.acc_recent(4, 'CUS-2026-006840', '2026-09-10T11:20:00+07:00');
SELECT test.acc_recent(5, 'CUS-2026-005980', '2026-09-09T15:10:00+07:00');
SELECT test.assert_true((SELECT c.last_activity_at < '2026-09-09T15:10:00+07:00'::timestamptz
                          FROM crm.customers c WHERE c.owner_staff_id = test.staff('ST-0045') AND c.record_status = 'ACTIVE'
                            AND c.last_activity_at IS NOT NULL
                          ORDER BY c.last_activity_at DESC NULLS LAST, c.customer_no DESC OFFSET 5 LIMIT 1),
                        'E13.5 ลูกค้ารายอื่นของคุณขวัญมีกิจกรรมก่อน 9 ก.ย. 15:10');
-- คุณฝน (JPON) เห็นหน้าว่าง
SELECT test.login_as('fon@example.com', 'aal1');
SELECT test.assert_eq(test.count_rows('SELECT id FROM crm.customers'), 0::bigint, 'E13.5 คุณฝนไม่เห็นลูกค้า (empty state)');
SELECT test.assert_eq(test.acc_num(test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$), 'VISITS'),
                      0::numeric, 'E13.5 KPI ของคุณฝนเป็น 0');
SELECT test.logout();

-- =====================================================================================
-- F. ตัวเลขรายพนักงาน JP1 และทีม (ข้อ 13.6 · 14.7)
-- =====================================================================================
SELECT test.login_as('kwan@example.com', 'aal1');
INSERT INTO test.acc VALUES ('kwan', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
SELECT test.logout();
SELECT test.login_as('kim@example.com', 'aal1');
INSERT INTO test.acc VALUES ('kim', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
SELECT test.logout();
SELECT test.login_as('nat@example.com', 'aal2');
INSERT INTO test.acc VALUES ('nat', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
SELECT test.logout();
SELECT test.login_as('jay@example.com', 'aal2');
INSERT INTO test.acc VALUES ('jay', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
INSERT INTO test.acc VALUES ('jay_status', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'STATUS')$$));
INSERT INTO test.acc VALUES ('jay_staff', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'STAFF')$$));
INSERT INTO test.acc VALUES ('jay_today', test.acc_call($$SELECT api.get_kpis('TODAY', NULL, NULL, NULL, 'NONE')$$));
SELECT test.logout();

SELECT test.acc_kpi(v, 'LEADS', '154', NULL, NULL, 'F13.6 ขวัญ Leads')                FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'OPPORTUNITIES', '63', NULL, NULL, 'F13.6 ขวัญ Opportunities') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'SALES', '44', NULL, NULL, 'F13.6 ขวัญ Sales')                 FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿668,400', NULL, NULL, 'F13.6 ขวัญ ยอดขาย')   FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'LOST_OPPORTUNITIES', '26', NULL, NULL, 'F13.6 ขวัญ Lost Opp') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'LOST_LEADS', '23', NULL, NULL, 'F13.6 ขวัญ Lost Lead')        FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'OPEN_LEADS', '30', NULL, NULL, 'F13.6 ขวัญ Lead เปิดอยู่')      FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '34', NULL, NULL, 'F13.6 ขวัญ Opp เปิดอยู่') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿731,600', NULL, NULL, 'F13.6 ขวัญ มูลค่า pipeline') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS', '4', NULL, NULL, 'F13.6 ขวัญ ปิดการขาย 7 วัน') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS_AMOUNT', '฿145,500', NULL, NULL, 'F13.6 ขวัญ ยอด 7 วัน') FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'TASKS_TODAY', '8', NULL, NULL, 'F13.6 ขวัญ งานวันนี้')          FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'TASKS_OVERDUE', '4', NULL, NULL, 'F13.6 ขวัญ งานเกินกำหนด')     FROM test.acc WHERE k = 'kwan';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '–', NULL, NULL, 'F13.6 ขวัญ KPI ที่ไม่ผูกพนักงาน = NULL') FROM test.acc WHERE k = 'kwan';
SELECT test.assert_true((SELECT test.acc_get(v, 'UNIQUE_CUSTOMERS', 'value') IS NULL FROM test.acc WHERE k = 'kwan'),
                        'F13.6 ขวัญ UNIQUE_CUSTOMERS เป็น NULL (ข้อ 12.4)');
SELECT test.acc_kpi(v, 'LEADS', '142', NULL, NULL, 'F13.6 คิม Leads')                  FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'OPPORTUNITIES', '57', NULL, NULL, 'F13.6 คิม Opportunities')   FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'SALES', '38', NULL, NULL, 'F13.6 คิม Sales')                   FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿576,600', NULL, NULL, 'F13.6 คิม ยอดขาย')     FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'LOST_OPPORTUNITIES', '25', NULL, NULL, 'F13.6 คิม Lost Opp')   FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'LOST_LEADS', '22', NULL, NULL, 'F13.6 คิม Lost Lead')          FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'OPEN_LEADS', '26', NULL, NULL, 'F13.6 คิม Lead เปิดอยู่')        FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '28', NULL, NULL, 'F13.6 คิม Opp เปิดอยู่') FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿595,500', NULL, NULL, 'F13.6 คิม มูลค่า pipeline') FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS', '4', NULL, NULL, 'F13.6 คิม ปิดการขาย 7 วัน') FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS_AMOUNT', '฿139,900', NULL, NULL, 'F13.6 คิม ยอด 7 วัน') FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'TASKS_TODAY', '6', NULL, NULL, 'F13.6 คิม งานวันนี้')           FROM test.acc WHERE k = 'kim';
SELECT test.acc_kpi(v, 'TASKS_OVERDUE', '3', NULL, NULL, 'F13.6 คิม งานเกินกำหนด')      FROM test.acc WHERE k = 'kim';
-- ทีม JP1-SALES (มุมมองของคุณนัท)
SELECT test.acc_kpi(v, 'LEADS', '296', NULL, NULL, 'F13.6 ทีม Leads')                  FROM test.acc WHERE k = 'nat';
SELECT test.acc_kpi(v, 'OPPORTUNITIES', '120', NULL, NULL, 'F13.6 ทีม Opportunities')  FROM test.acc WHERE k = 'nat';
SELECT test.acc_kpi(v, 'SALES', '82', NULL, NULL, 'F13.6 ทีม Sales')                   FROM test.acc WHERE k = 'nat';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿1,245,000', NULL, NULL, 'F13.6 ทีม ยอดขาย')   FROM test.acc WHERE k = 'nat';
SELECT test.acc_kpi(v, 'CONV_LEAD_TO_SALE', '27.7%', NULL, NULL, 'F13.6 ทีม Conversion') FROM test.acc WHERE k = 'nat';
SELECT test.acc_kpi(v, 'TASKS_OVERDUE', '7', NULL, NULL, 'F13.6 ทีม งานเกินกำหนด')      FROM test.acc WHERE k = 'nat';
SELECT test.assert_true((SELECT test.acc_get(v, 'UNIQUE_CUSTOMERS', 'value') IS NULL FROM test.acc WHERE k = 'nat'),
                        'F13.6 ทีม UNIQUE_CUSTOMERS เป็น NULL (ขอบเขต TEAM)');
-- ข้อ 13.6: lead เปิดอยู่ของ JP1 แยกสถานะ · lead ไม่มี owner 2 รายการ
SELECT test.acc_kpi(v, 'OPEN_LEADS', '14', NULL, 'NEW', 'F13.6 JP1 lead NEW')            FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_LEADS', '29', NULL, 'CONTACTED', 'F13.6 JP1 lead CONTACTED') FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_LEADS', '15', NULL, 'QUALIFIED', 'F13.6 JP1 lead QUALIFIED') FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_LEADS', '58', NULL, NULL, 'F13.6 JP1 lead เปิดอยู่รวม')       FROM test.acc WHERE k = 'jay';
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.branch_id = test.branch('JP1')
                        AND l.status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND l.owner_staff_id IS NULL), 2::bigint,
                      'F13.6 JP1 lead เปิดอยู่ที่ไม่มี owner 2 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.branch_id = test.branch('JP1')
                        AND l.created_at >= '2026-08-13 00:00+07' AND l.created_at < '2026-09-12 00:00+07'
                        AND l.owner_staff_id IS NULL), 2::bigint, 'F13.6 JP1 Leads ใน P ที่ไม่มี owner 2 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.branch_id = test.branch('JP1')
                        AND l.status = 'NEW' AND l.created_at < '2026-08-13 00:00+07'), 6::bigint,
                      'F13.6 JP1 lead NEW ที่สร้างก่อน P 6 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.branch_id = test.branch('JP1')
                        AND l.status = 'NEW' AND l.created_at >= '2026-08-28 10:24+07'), 8::bigint,
                      'F13.6 JP1 lead NEW ที่สร้างใน P หลัง 28 ส.ค. 10:24 จำนวน 8 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l JOIN ref.channels ch ON ch.code = l.channel_code
                        WHERE l.status = 'NEW' AND ch.is_live), 0::bigint,
                      'F13.6 lead ช่องทาง WALK_IN/PHONE ไม่เป็น NEW');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l
                        WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
                          AND l.owner_staff_id IN (test.staff('ST-0045'), test.staff('ST-0046'))
                          AND l.next_action_at < '2026-09-12 00:00+07'
                          AND l.next_action_at NOT IN ('2026-09-20 11:00+07')), 0::bigint,
                      'F13.6 next_action ของ lead เปิดอื่นของขวัญ/คิม ≥ 12 ก.ย.');

-- =====================================================================================
-- G. คุณสมชาย ใจดี — Customer 360 (ข้อ 13.7)
-- =====================================================================================
SELECT test.assert_eq((SELECT c.display_name FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'สมชาย ใจดี', 'G13.7 ชื่อ');
SELECT test.assert_eq((SELECT c.lifecycle_stage FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'REPEAT', 'G13.7 ป้าย ลูกค้าซื้อซ้ำ');
SELECT test.assert_eq((SELECT c.first_seen_at FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'),
                      '2026-01-11T13:15:00+07:00'::timestamptz, 'G13.7 รู้จักครั้งแรก 11 ม.ค. 2569 13:15');
SELECT test.assert_eq((SELECT c.first_channel_code FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'FACEBOOK', 'G13.7 ช่องทางแรก');
SELECT test.assert_eq((SELECT c.first_source_code FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'FACEBOOK_PAGE', 'G13.7 แหล่งที่มา');
SELECT test.assert_eq((SELECT b.code FROM crm.customers c JOIN core.branches b ON b.id = c.first_branch_id WHERE c.customer_no = 'CUS-2026-000297'),
                      'JP1', 'G13.7 สาขาแรก JP1');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.customers c JOIN core.staff_profiles s ON s.id = c.owner_staff_id
                        WHERE c.customer_no = 'CUS-2026-000297'), 'ST-0045', 'G13.7 ผู้ดูแลคุณขวัญ');
SELECT test.assert_eq((SELECT c.province_code FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'TH-10', 'G13.7 จังหวัด TH-10');
SELECT test.assert_eq((SELECT string_agg(t.code, ',' ORDER BY t.code) FROM crm.customer_tags ct
                        JOIN crm.tags t ON t.id = ct.tag_id WHERE ct.customer_id = test.cust('CUS-2026-000297')),
                      'INSTALLMENT,IPHONE_FAN,VIP', 'G13.7 tag VIP · INSTALLMENT · IPHONE_FAN');
SELECT test.assert_true((SELECT c.has_open_followup FROM crm.customers c WHERE c.customer_no = 'CUS-2026-000297'), 'G13.7 ป้าย ติดตามอยู่');
-- ตัวเลขสรุป (ข้อ 3.3 ข้อ 5)
SELECT test.assert_eq((app.customer_counters(test.cust('CUS-2026-000297')) ->> 'interaction_count')::bigint, 7::bigint, 'G13.7 ติดต่อ 7 ครั้ง');
SELECT test.assert_eq((app.customer_counters(test.cust('CUS-2026-000297')) ->> 'walk_in_count')::bigint, 3::bigint, 'G13.7 เข้าร้าน 3 ครั้ง');
SELECT test.assert_eq((app.customer_counters(test.cust('CUS-2026-000297')) ->> 'purchase_count')::bigint, 2::bigint, 'G13.7 ซื้อ 2 ครั้ง');
SELECT test.assert_eq((app.customer_counters(test.cust('CUS-2026-000297')) ->> 'purchase_amount')::numeric, 52800::numeric, 'G13.7 ยอดซื้อสะสม 52,800 บาท');
SELECT test.assert_eq((app.customer_counters(test.cust('CUS-2026-000297')) ->> 'months_as_customer')::integer, 8, 'G13.7 เป็นลูกค้ามา 8 เดือน');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.customer_id = test.cust('CUS-2026-000297')), 6::bigint, 'G13.7 visit 6 ครั้ง');
-- ช่องทางติดต่อและการปิดบัง (ข้อ 6.4)
SELECT test.assert_eq((SELECT cc.value_masked FROM crm.customer_contacts cc WHERE cc.customer_id = test.cust('CUS-2026-000297')
                        AND cc.contact_type = 'PHONE'), '081-XXX-5678', 'G13.7 เบอร์ 081-234-5678 → 081-XXX-5678');
SELECT test.assert_eq((SELECT cc.value_raw FROM crm.customer_contacts cc WHERE cc.customer_id = test.cust('CUS-2026-000297')
                        AND cc.contact_type = 'PHONE'), '081-234-5678', 'G13.7 เบอร์เต็ม 081-234-5678');
SELECT test.assert_eq((SELECT cc.value_masked FROM crm.customer_contacts cc WHERE cc.customer_id = test.cust('CUS-2026-000297')
                        AND cc.contact_type = 'LINE_ID'), 'so***', 'G13.7 LINE_ID somchai_j → so***');
SELECT test.assert_eq((SELECT cc.value_masked FROM crm.customer_contacts cc WHERE cc.customer_id = test.cust('CUS-2026-000297')
                        AND cc.contact_type = 'EMAIL'), 's***@example.com', 'G13.7 EMAIL → s***@example.com');
-- รายการที่ระบุชื่อ
SELECT test.assert_eq((SELECT l.status::text FROM crm.leads l WHERE l.lead_no = 'LD-2026-000312'), 'CONVERTED', 'G13.7 LD-2026-000312 CONVERTED');
SELECT test.assert_eq((SELECT l.channel_code FROM crm.leads l WHERE l.lead_no = 'LD-2026-000312'), 'FACEBOOK', 'G13.7 LD-2026-000312 ช่องทาง FACEBOOK');
SELECT test.assert_eq((SELECT o.opportunity_no FROM crm.leads l JOIN crm.opportunities o ON o.id = l.converted_opportunity_id
                        WHERE l.lead_no = 'LD-2026-000312'), 'OP-2026-000231', 'G13.7 LD-2026-000312 → OP-2026-000231');
SELECT test.assert_eq((SELECT o.won_at FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-000231'),
                      '2026-01-20T15:30:00+07:00'::timestamptz, 'G13.7 OP-2026-000231 WON 20 ม.ค. 15:30');
SELECT test.assert_eq((SELECT o.won_amount FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-000231'), 23900::numeric, 'G13.7 OP-2026-000231 ฿23,900');
SELECT test.assert_eq((SELECT o.origin_channel_code FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-000231'), 'FACEBOOK', 'G13.7 OP-2026-000231 origin FACEBOOK');
SELECT test.assert_eq((SELECT l.created_at FROM crm.leads l WHERE l.lead_no = 'LD-2026-006650'),
                      '2026-08-12T19:40:00+07:00'::timestamptz, 'G13.7 LD-2026-006650 สร้าง 12 ส.ค. 19:40');
SELECT test.assert_eq((SELECT l.channel_code FROM crm.leads l WHERE l.lead_no = 'LD-2026-006650'), 'LINE', 'G13.7 LD-2026-006650 ช่องทาง LINE');
SELECT test.assert_eq((SELECT o.opportunity_no FROM crm.leads l JOIN crm.opportunities o ON o.id = l.converted_opportunity_id
                        WHERE l.lead_no = 'LD-2026-006650'), 'OP-2026-002790', 'G13.7 LD-2026-006650 → OP-2026-002790');
SELECT test.assert_eq((SELECT o.created_at FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002790'),
                      '2026-08-15T11:05:00+07:00'::timestamptz, 'G13.7 OP-2026-002790 สร้าง 15 ส.ค. 11:05');
SELECT test.assert_eq((SELECT o.won_at FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002790'),
                      '2026-08-15T11:05:00+07:00'::timestamptz, 'G13.7 OP-2026-002790 WON 15 ส.ค. 11:05');
SELECT test.assert_eq((SELECT o.won_amount FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002790'), 28900::numeric, 'G13.7 OP-2026-002790 ฿28,900');
SELECT test.assert_eq((SELECT o.origin_channel_code FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002790'), 'LINE',
                      'G13.7 OP-2026-002790 origin LINE (ไม่อยู่ใน 158 ของ Walk-in)');
SELECT test.assert_eq((SELECT count(*) FROM crm.transaction_refs t JOIN crm.opportunities o ON o.id = t.opportunity_id
                        WHERE o.opportunity_no IN ('OP-2026-000231', 'OP-2026-002790') AND t.source_system_code = 'MANUAL'),
                      2::bigint, 'G13.7 opportunity ทั้งสองมี transaction ref SALE MANUAL');
SELECT test.assert_eq((SELECT o.stage::text FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'), 'FOLLOW_UP', 'G13.7 OP-2026-002998 รอตัดสินใจ');
SELECT test.assert_eq((SELECT o.created_at FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'),
                      '2026-09-01T14:00:00+07:00'::timestamptz, 'G13.7 OP-2026-002998 สร้าง 1 ก.ย. 14:00');
SELECT test.assert_eq((SELECT o.origin_channel_code FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'), 'LINE', 'G13.7 OP-2026-002998 origin LINE');
SELECT test.assert_eq((SELECT o.priority_code FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'), 'HIGH', 'G13.7 OP-2026-002998 ความสำคัญ HIGH');
SELECT test.assert_eq((SELECT o.expected_amount FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'), 45900::numeric, 'G13.7 OP-2026-002998 ฿45,900');
SELECT test.assert_eq((SELECT o.next_action_at FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'),
                      '2026-09-18T10:00:00+07:00'::timestamptz, 'G13.7 OP-2026-002998 next action 18 ก.ย. 10:00');
SELECT test.assert_eq((SELECT o.next_action_type_code FROM crm.opportunities o WHERE o.opportunity_no = 'OP-2026-002998'), 'CALL', 'G13.7 OP-2026-002998 next action CALL');
SELECT test.assert_eq((SELECT i.product_model FROM crm.opportunity_items i JOIN crm.opportunities o ON o.id = i.opportunity_id
                        WHERE o.opportunity_no = 'OP-2026-002998'), 'iPhone 17 Pro', 'G13.7 สินค้าที่สนใจ iPhone 17 Pro');
SELECT test.assert_eq((SELECT i.interest_level::text FROM crm.opportunity_items i JOIN crm.opportunities o ON o.id = i.opportunity_id
                        WHERE o.opportunity_no = 'OP-2026-002998'), 'HOT', 'G13.7 iPhone 17 Pro สนใจมาก (HOT)');
SELECT test.assert_eq((SELECT q.total_amount FROM crm.quotations q WHERE q.quotation_no = 'QT-2026-001702'), 49900::numeric, 'G13.7 QT-2026-001702 ฿49,900');
SELECT test.assert_eq((SELECT q.status::text FROM crm.quotations q WHERE q.quotation_no = 'QT-2026-001702'), 'EXPIRED', 'G13.7 QT-2026-001702 EXPIRED');
SELECT test.assert_eq((SELECT q.valid_until FROM crm.quotations q WHERE q.quotation_no = 'QT-2026-001702'), '2026-09-08'::date, 'G13.7 QT-2026-001702 valid_until 8 ก.ย.');
SELECT test.assert_eq((SELECT q.sent_channel_code FROM crm.quotations q WHERE q.quotation_no = 'QT-2026-001702'), 'LINE', 'G13.7 QT-2026-001702 ส่งทาง LINE');
SELECT test.assert_eq((SELECT o.opportunity_no FROM crm.quotations q JOIN crm.opportunities o ON o.id = q.opportunity_id
                        WHERE q.quotation_no = 'QT-2026-001702'), 'OP-2026-002998', 'G13.7 QT-2026-001702 ของ OP-2026-002998');
SELECT test.assert_eq((SELECT qi.product_model || ' ' || qi.variant FROM crm.quotation_items qi JOIN crm.quotations q ON q.id = qi.quotation_id
                        WHERE q.quotation_no = 'QT-2026-001702'), 'iPhone 17 Pro Max 256GB', 'G13.7 QT-2026-001702 iPhone 17 Pro Max 256GB');
SELECT test.assert_eq((SELECT l.status::text FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'), 'CONTACTED', 'G13.7 LD-2026-007460 CONTACTED');
SELECT test.assert_eq((SELECT l.created_at FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'),
                      '2026-09-08T16:10:00+07:00'::timestamptz, 'G13.7 LD-2026-007460 สร้าง 8 ก.ย. 16:10');
SELECT test.assert_eq((SELECT l.channel_code FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'), 'WALK_IN', 'G13.7 LD-2026-007460 ช่องทาง WALK_IN');
SELECT test.assert_eq((SELECT l.product_model FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'), 'iPad Air', 'G13.7 LD-2026-007460 iPad Air');
SELECT test.assert_eq((SELECT l.interest_level::text FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'), 'WARM', 'G13.7 LD-2026-007460 สนใจ (WARM)');
SELECT test.assert_eq((SELECT l.next_action_at FROM crm.leads l WHERE l.lead_no = 'LD-2026-007460'),
                      '2026-09-20T11:00:00+07:00'::timestamptz, 'G13.7 LD-2026-007460 next action 20 ก.ย. 11:00');
SELECT test.assert_eq((SELECT t.task_type_code FROM crm.tasks t WHERE t.task_no = 'TK-2026-012508'), 'CALL', 'G13.7 TK-2026-012508 CALL');
SELECT test.assert_eq((SELECT t.due_at FROM crm.tasks t WHERE t.task_no = 'TK-2026-012508'),
                      '2026-09-18T10:00:00+07:00'::timestamptz, 'G13.7 TK-2026-012508 due 18 ก.ย. 10:00');
SELECT test.assert_eq((SELECT t.created_at FROM crm.tasks t WHERE t.task_no = 'TK-2026-012508'),
                      '2026-09-08T16:40:00+07:00'::timestamptz, 'G13.7 TK-2026-012508 สร้าง 8 ก.ย. 16:40');
SELECT test.assert_true((SELECT t.is_next_action FROM crm.tasks t WHERE t.task_no = 'TK-2026-012508'), 'G13.7 TK-2026-012508 เป็น next action');
SELECT test.assert_eq((SELECT o.opportunity_no FROM crm.tasks t JOIN crm.opportunities o ON o.id = t.opportunity_id
                        WHERE t.task_no = 'TK-2026-012508'), 'OP-2026-002998', 'G13.7 TK-2026-012508 ของ OP-2026-002998');
SELECT test.assert_eq((SELECT count(*) FROM crm.tasks t JOIN crm.leads l ON l.id = t.lead_id
                        WHERE l.lead_no = 'LD-2026-007460' AND t.is_next_action AND t.task_type_code = 'FOLLOW_UP'
                          AND t.due_at = '2026-09-20T11:00:00+07:00'::timestamptz), 1::bigint,
                      'G13.7 งานติดตาม iPad Air (ที่มาของป้าย ติดตามอยู่)');
SELECT test.assert_eq((SELECT v.visit_no FROM crm.visits v WHERE v.customer_id = test.cust('CUS-2026-000297')
                        AND v.started_at = '2026-09-11T10:24:00+07:00'::timestamptz), 'V-JP1-260911-007', 'G13.7 visit 11 ก.ย. = V-JP1-260911-007');
SELECT test.assert_eq((SELECT v.visit_no FROM crm.visits v WHERE v.customer_id = test.cust('CUS-2026-000297')
                        AND v.started_at = '2026-09-08T16:10:00+07:00'::timestamptz), 'V-JP1-260908-017', 'G13.7 visit 8 ก.ย. = V-JP1-260908-017');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_consents cs WHERE cs.customer_id = test.cust('CUS-2026-000297')
                        AND cs.purpose_code = 'PRIVACY_NOTICE' AND cs.status = 'GRANTED' AND cs.notice_version = 'PN-2026-01'
                        AND cs.captured_via = 'LINK_SENT'), 1::bigint, 'G13.7 ความยินยอม PRIVACY_NOTICE (PN-2026-01 · LINK_SENT)');
SELECT test.assert_eq((SELECT count(*) FROM crm.customer_consents cs WHERE cs.customer_id = test.cust('CUS-2026-000297')
                        AND cs.purpose_code = 'MARKETING' AND cs.status = 'GRANTED' AND cs.channels = ARRAY['LINE']
                        AND cs.captured_via = 'STAFF_FORM'), 1::bigint, 'G13.7 ความยินยอม MARKETING ช่องทาง LINE (STAFF_FORM)');
SELECT test.assert_eq((SELECT n.body FROM crm.customer_notes n WHERE n.customer_id = test.cust('CUS-2026-000297') AND n.is_pinned),
                      'ชอบให้ติดต่อทาง LINE หลัง 18:00', 'G13.7 โน้ตที่ปักหมุด');

-- =====================================================================================
-- H. รายการลูกค้า (ข้อ 13.8) — อ่านผ่าน RLS ในฐานะคุณแพร (BUSINESS_ADMIN · ทั้งองค์กร)
-- =====================================================================================
CREATE TABLE test.list38 (pos bigint, customer_no text, display_name text, last_channel_code text,
                          branch_code text, last_activity_at timestamptz, lifecycle_stage text,
                          has_open_followup boolean, has_new_lead boolean, phone_masked text, badge_new boolean);
GRANT SELECT, INSERT ON test.list38 TO authenticated, service_role;
SELECT test.login_as('prae@example.com', 'aal2');
INSERT INTO test.list38
SELECT row_number() OVER (ORDER BY c.last_activity_at DESC, c.customer_no DESC) AS pos,
       c.customer_no, c.display_name, c.last_channel_code, b.code, c.last_activity_at,
       c.lifecycle_stage, c.has_open_followup, c.has_new_lead,
       (SELECT cc.value_masked FROM crm.customer_contacts cc WHERE cc.customer_id = c.id AND cc.contact_type = 'PHONE' AND cc.is_active LIMIT 1),
       c.first_seen_at >= '2026-08-13 00:00+07'::timestamptz
FROM crm.customers c LEFT JOIN core.branches b ON b.id = c.last_branch_id
WHERE c.record_status = 'ACTIVE'
  AND c.last_activity_at >= '2026-08-13 00:00+07' AND c.last_activity_at < '2026-09-12 00:00+07';
SELECT test.logout();
SELECT test.assert_eq((SELECT count(*) FROM test.list38), 1284::bigint,
                      'H13.8 ตัวกรอง "ติดต่อใน 30 วันล่าสุด" = 1,284 (อ่านผ่าน RLS)');
CREATE FUNCTION test.acc_list(p_pos bigint, p_no text, p_name text, p_phone text, p_masked text,
                              p_chan text, p_branch text, p_at timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT * INTO r FROM test.list38 WHERE pos = p_pos;
    PERFORM test.assert_eq(r.customer_no, p_no, 'H13.8 แถว ' || p_pos || ' customer_no');
    PERFORM test.assert_eq(r.display_name, p_name, 'H13.8 แถว ' || p_pos || ' ชื่อ');
    PERFORM test.assert_eq((SELECT cc.value_raw FROM crm.customer_contacts cc
                             WHERE cc.customer_id = test.cust(p_no) AND cc.contact_type = 'PHONE' AND cc.is_active LIMIT 1),
                           p_phone, 'H13.8 แถว ' || p_pos || ' เบอร์เต็ม');
    PERFORM test.assert_eq(r.phone_masked, p_masked, 'H13.8 แถว ' || p_pos || ' เบอร์ที่แสดง');
    PERFORM test.assert_eq(r.last_channel_code, p_chan, 'H13.8 แถว ' || p_pos || ' ช่องทางล่าสุด');
    PERFORM test.assert_eq(r.branch_code, p_branch, 'H13.8 แถว ' || p_pos || ' สาขา');
    PERFORM test.assert_eq(r.last_activity_at, p_at, 'H13.8 แถว ' || p_pos || ' ติดต่อล่าสุด');
END; $$;
SELECT test.acc_list(1, 'CUS-2026-000297', 'สมชาย ใจดี',     '081-234-5678', '081-XXX-5678', 'LINE',      'JP1', '2026-09-11T10:24:00+07:00');
SELECT test.acc_list(2, 'CUS-2026-006851', 'ณัฐชยา มากมี',    '095-123-4567', '095-XXX-4567', 'WALK_IN',   'JP2', '2026-09-11T10:20:00+07:00');
SELECT test.acc_list(3, 'CUS-2026-004127', 'กิตติพงษ์ กล้าหาญ', '090-987-6543', '090-XXX-6543', 'FACEBOOK',  'JP3', '2026-09-11T10:16:00+07:00');
SELECT test.acc_list(4, 'CUS-2026-006790', 'วิไลวรรณ สวยดี',   '098-765-4321', '098-XXX-4321', 'INSTAGRAM', 'JP1', '2026-09-11T10:11:00+07:00');
SELECT test.acc_list(5, 'CUS-2026-006774', 'ธนพล รุ่งเรือง',    '081-456-7890', '081-XXX-7890', 'TIKTOK',    'JP4', '2026-09-11T10:06:00+07:00');
-- ป้ายของแต่ละแถว (ข้อ 3.4 · 3.5)
SELECT test.assert_eq((SELECT lifecycle_stage FROM test.list38 WHERE pos = 1), 'REPEAT',      'H13.8 แถว 1 ป้าย ลูกค้าซื้อซ้ำ');
SELECT test.assert_true((SELECT has_open_followup FROM test.list38 WHERE pos = 1),            'H13.8 แถว 1 ป้าย ติดตามอยู่');
SELECT test.assert_eq((SELECT lifecycle_stage FROM test.list38 WHERE pos = 2), 'LEAD',        'H13.8 แถว 2 ป้าย สนใจซื้อ');
SELECT test.assert_true((SELECT badge_new FROM test.list38 WHERE pos = 2),                    'H13.8 แถว 2 ป้าย ลูกค้าใหม่');
SELECT test.assert_eq((SELECT lifecycle_stage FROM test.list38 WHERE pos = 3), 'OPPORTUNITY', 'H13.8 แถว 3 ป้าย มีโอกาสซื้อ');
SELECT test.assert_true((SELECT has_open_followup FROM test.list38 WHERE pos = 3),            'H13.8 แถว 3 ป้าย ติดตามอยู่');
SELECT test.assert_eq((SELECT lifecycle_stage FROM test.list38 WHERE pos = 4), 'LEAD',        'H13.8 แถว 4 ป้าย สนใจซื้อ');
SELECT test.assert_true((SELECT badge_new FROM test.list38 WHERE pos = 4),                    'H13.8 แถว 4 ป้าย ลูกค้าใหม่');
SELECT test.assert_eq((SELECT lifecycle_stage FROM test.list38 WHERE pos = 5), 'LEAD',        'H13.8 แถว 5 ป้าย สนใจซื้อ');
SELECT test.assert_true((SELECT badge_new FROM test.list38 WHERE pos = 5),                    'H13.8 แถว 5 ป้าย ลูกค้าใหม่');
SELECT test.assert_true((SELECT has_new_lead FROM test.list38 WHERE pos = 5),                 'H13.8 แถว 5 ป้าย ยังไม่ได้ติดต่อ');

-- =====================================================================================
-- I. Pipeline ของ JAUNPHONE 1 (ข้อ 13.9)
-- =====================================================================================
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '32', NULL, 'INTERESTED', 'I13.9 คอลัมน์ สนใจ')       FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '18', NULL, 'QUOTATION',  'I13.9 คอลัมน์ เสนอราคา')    FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '12', NULL, 'FOLLOW_UP',  'I13.9 คอลัมน์ รอตัดสินใจ')  FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿426,800', NULL, 'INTERESTED', 'I13.9 มูลค่า สนใจ')     FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿512,300', NULL, 'QUOTATION',  'I13.9 มูลค่า เสนอราคา')  FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿388,000', NULL, 'FOLLOW_UP',  'I13.9 มูลค่า รอตัดสินใจ') FROM test.acc WHERE k = 'jay_status';
SELECT test.acc_kpi(v, 'OPEN_OPPORTUNITIES', '62', NULL, NULL, 'I13.9 opportunity เปิดอยู่รวม')     FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'OPEN_PIPELINE_AMOUNT', '฿1,327,100', NULL, NULL, 'I13.9 มูลค่า pipeline รวม') FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS', '8', NULL, NULL, 'I13.9 ปิดการขายใน 7 วัน 8 รายการ')       FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'WON_LAST_7_DAYS_AMOUNT', '฿285,400', NULL, NULL, 'I13.9 ยอดปิดการขาย 7 วัน') FROM test.acc WHERE k = 'jay';
SELECT test.assert_eq((SELECT sum(o.won_amount) FROM crm.opportunities o WHERE o.branch_id = test.branch('JP1')
                        AND o.stage = 'WON' AND o.won_at >= '2026-08-13 00:00+07' AND o.won_at < '2026-09-05 00:00+07'),
                      959600::numeric, 'I13.9 อีก 74 รายการรวม ฿959,600');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.branch_id = test.branch('JP1')
                        AND o.stage = 'WON' AND o.won_at >= '2026-08-13 00:00+07' AND o.won_at < '2026-09-05 00:00+07'),
                      74::bigint, 'I13.9 ปิดการขายก่อน 5 ก.ย. 74 รายการ');
-- การ์ดตัวอย่าง (ลูกค้า · สินค้า · มูลค่า · วันที่ · owner · ความสำคัญ)
CREATE FUNCTION test.acc_card(p_no text, p_stage text, p_model text, p_amount numeric, p_next timestamptz,
                              p_owner text, p_prio text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT o.stage::text AS stage, o.expected_amount, o.next_action_at, o.priority_code,
           (SELECT s.staff_code FROM core.staff_profiles s WHERE s.id = o.owner_staff_id) AS own,
           (SELECT i.product_model FROM crm.opportunity_items i WHERE i.opportunity_id = o.id LIMIT 1) AS model
      INTO r FROM crm.opportunities o
     WHERE o.customer_id = test.cust(p_no) AND o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP');
    PERFORM test.assert_eq(r.stage, p_stage, 'I13.9 การ์ด ' || p_no || ' ขั้น');
    PERFORM test.assert_eq(r.model, p_model, 'I13.9 การ์ด ' || p_no || ' สินค้า');
    PERFORM test.assert_eq(r.expected_amount, p_amount, 'I13.9 การ์ด ' || p_no || ' มูลค่า');
    PERFORM test.assert_eq(r.next_action_at, p_next, 'I13.9 การ์ด ' || p_no || ' วันที่บนการ์ด');
    PERFORM test.assert_eq(r.own, p_owner, 'I13.9 การ์ด ' || p_no || ' owner');
    PERFORM test.assert_eq(r.priority_code, p_prio, 'I13.9 การ์ด ' || p_no || ' ความสำคัญ');
END; $$;
SELECT test.acc_card('CUS-2026-005980', 'INTERESTED', 'iPhone 17',           32900, '2026-09-11T10:30:00+07:00', 'ST-0045', 'HIGH');
SELECT test.acc_card('CUS-2026-006121', 'INTERESTED', 'iPad Air',            21900, '2026-09-12T11:00:00+07:00', 'ST-0046', 'NORMAL');
SELECT test.acc_card('CUS-2026-005412', 'QUOTATION',  'iPhone 17 Pro Max',   49900, '2026-09-10T15:00:00+07:00', 'ST-0045', 'HIGH');
SELECT test.acc_card('CUS-2026-004877', 'QUOTATION',  'iPhone 16',           29900, '2026-09-15T14:00:00+07:00', 'ST-0046', 'NORMAL');
SELECT test.acc_card('CUS-2026-000297', 'FOLLOW_UP',  'iPhone 17 Pro',       45900, '2026-09-18T10:00:00+07:00', 'ST-0045', 'HIGH');
SELECT test.acc_card('CUS-2026-003966', 'FOLLOW_UP',  'iPad Pro',            34900, '2026-09-17T13:00:00+07:00', 'ST-0046', 'NORMAL');
CREATE FUNCTION test.acc_wcard(p_no text, p_model text, p_amount numeric, p_won timestamptz, p_owner text, p_prio text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT o.won_amount, o.won_at, (SELECT s.staff_code FROM core.staff_profiles s WHERE s.id = o.owner_staff_id) AS own,
           (SELECT i.product_model FROM crm.opportunity_items i WHERE i.opportunity_id = o.id LIMIT 1) AS model
      INTO r FROM crm.opportunities o WHERE o.customer_id = test.cust(p_no) AND o.stage = 'WON';
    PERFORM test.assert_eq(r.model, p_model, 'I13.9 การ์ดปิดการขาย ' || p_no || ' สินค้า');
    PERFORM test.assert_eq(r.won_amount, p_amount, 'I13.9 การ์ดปิดการขาย ' || p_no || ' มูลค่า');
    PERFORM test.assert_eq(app.bangkok_date(r.won_at), app.bangkok_date(p_won), 'I13.9 การ์ดปิดการขาย ' || p_no || ' วันที่');
    PERFORM test.assert_eq(r.own, p_owner, 'I13.9 การ์ดปิดการขาย ' || p_no || ' owner');
END; $$;
SELECT test.acc_wcard('CUS-2026-006310', 'iPhone 16 128GB', 28900, '2026-09-10T16:40:00+07:00', 'ST-0045', 'NORMAL');
SELECT test.acc_wcard('CUS-2026-006455', 'iPhone 15',       25900, '2026-09-09T14:00:00+07:00', 'ST-0046', 'NORMAL');

-- =====================================================================================
-- J. งานของคุณขวัญ (ข้อ 13.10) — ทั้งหมด 12 = วันนี้ 8 + เกินกำหนด 4
-- =====================================================================================
CREATE TABLE test.kwan_tasks AS
SELECT row_number() OVER (ORDER BY t.due_at) AS pos, t.task_no, t.due_at, t.task_type_code,
       c.customer_no, c.display_name, t.title, t.priority_code,
       CASE WHEN t.due_at < '2026-09-11 00:00+07' THEN 'เกินกำหนด' ELSE 'วันนี้' END AS grp
FROM crm.tasks t LEFT JOIN crm.customers c ON c.id = t.customer_id
WHERE t.owner_staff_id = test.staff('ST-0045') AND t.status IN ('OPEN', 'IN_PROGRESS')
  AND t.due_at < '2026-09-12 00:00+07';
SELECT test.assert_eq((SELECT count(*) FROM test.kwan_tasks), 12::bigint, 'J13.10 งานของคุณขวัญทั้งหมด 12 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM test.kwan_tasks WHERE grp = 'วันนี้'), 8::bigint, 'J13.10 กลุ่มวันนี้ 8 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM test.kwan_tasks WHERE grp = 'เกินกำหนด'), 4::bigint, 'J13.10 กลุ่มเกินกำหนด 4 รายการ');
CREATE FUNCTION test.acc_task(p_pos bigint, p_grp text, p_due timestamptz, p_type text, p_no text, p_title text, p_prio text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT * INTO r FROM test.kwan_tasks WHERE pos = p_pos;
    PERFORM test.assert_eq(r.grp, p_grp, 'J13.10 งาน #' || p_pos || ' กลุ่ม');
    PERFORM test.assert_eq(r.due_at, p_due, 'J13.10 งาน #' || p_pos || ' due');
    PERFORM test.assert_eq(r.task_type_code, p_type, 'J13.10 งาน #' || p_pos || ' ประเภท');
    PERFORM test.assert_eq(r.customer_no, p_no, 'J13.10 งาน #' || p_pos || ' ลูกค้า');
    PERFORM test.assert_eq(r.title, p_title, 'J13.10 งาน #' || p_pos || ' ชื่องาน');
    PERFORM test.assert_eq(r.priority_code, p_prio, 'J13.10 งาน #' || p_pos || ' ความสำคัญ');
END; $$;
SELECT test.acc_task(1,  'เกินกำหนด', '2026-09-10T13:00:00+07:00', 'CALL',           'CUS-2025-007321', 'โทรยืนยันวันรับเครื่อง', 'NORMAL');
SELECT test.acc_task(2,  'เกินกำหนด', '2026-09-10T15:00:00+07:00', 'FOLLOW_UP',      'CUS-2026-005412', 'ติดตามใบเสนอราคา iPhone 17 Pro Max', 'HIGH');
SELECT test.acc_task(3,  'เกินกำหนด', '2026-09-10T17:30:00+07:00', 'FOLLOW_UP',      'CUS-2026-005733', 'ติดตามความสนใจ iPad', 'NORMAL');
SELECT test.acc_task(4,  'เกินกำหนด', '2026-09-10T19:00:00+07:00', 'FOLLOW_UP',      'CUS-2026-006002', 'ติดตามเรื่องเทิร์นเครื่อง', 'NORMAL');
SELECT test.acc_task(5,  'วันนี้',     '2026-09-11T10:00:00+07:00', 'CALL',           'CUS-2026-006310', 'โทรขอเลขใบเสร็จ POS', 'NORMAL');
SELECT test.acc_task(6,  'วันนี้',     '2026-09-11T10:30:00+07:00', 'SEND_QUOTATION', 'CUS-2026-005980', 'ส่งใบเสนอราคา iPhone 17', 'HIGH');
SELECT test.acc_task(7,  'วันนี้',     '2026-09-11T11:30:00+07:00', 'FOLLOW_UP',      'CUS-2026-006511', 'ติดตามการตัดสินใจ iPhone 16', 'NORMAL');
SELECT test.acc_task(8,  'วันนี้',     '2026-09-11T13:00:00+07:00', 'APPOINTMENT',    'CUS-2026-006840', 'นัดเข้าร้านดูเครื่อง', 'NORMAL');
SELECT test.acc_task(9,  'วันนี้',     '2026-09-11T14:30:00+07:00', 'DOCUMENT',       'CUS-2026-005412', 'เตรียมเอกสารผ่อน', 'NORMAL');
SELECT test.acc_task(10, 'วันนี้',     '2026-09-11T16:00:00+07:00', 'FOLLOW_UP',      'CUS-2026-006702', 'ติดตามราคา AirPods', 'LOW');
SELECT test.acc_task(11, 'วันนี้',     '2026-09-11T17:30:00+07:00', 'CALL',           'CUS-2025-007321', 'โทรแจ้งเครื่องพร้อมรับ', 'NORMAL');
SELECT test.acc_task(12, 'วันนี้',     '2026-09-11T19:00:00+07:00', 'FOLLOW_UP',      'CUS-2026-006598', 'ติดตามโปรโมชั่นผ่อน 0%', 'NORMAL');
SELECT test.assert_eq((SELECT count(DISTINCT c.owner_staff_id) FROM test.kwan_tasks k JOIN crm.customers c ON c.customer_no = k.customer_no),
                      1::bigint, 'J13.10 ลูกค้าทุกรายในตารางเป็นลูกค้าที่คุณขวัญดูแล');
SELECT test.assert_eq((SELECT count(*) FROM crm.tasks t WHERE t.owner_staff_id = test.staff('ST-0046')
                        AND t.status IN ('OPEN', 'IN_PROGRESS') AND t.due_at >= '2026-09-11 00:00+07' AND t.due_at < '2026-09-12 00:00+07'),
                      6::bigint, 'J13.10 งานวันนี้ของคุณคิม 6 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.tasks t WHERE t.owner_staff_id = test.staff('ST-0046')
                        AND t.status IN ('OPEN', 'IN_PROGRESS') AND t.due_at < '2026-09-11 00:00+07'), 3::bigint,
                      'J13.10 งานเกินกำหนดของคุณคิม 3 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.tasks t WHERE t.owner_staff_id = test.staff('ST-0046')
                        AND t.status IN ('OPEN', 'IN_PROGRESS') AND t.due_at < '2026-09-12 00:00+07'
                        AND t.task_type_code <> 'FOLLOW_UP'), 0::bigint, 'J13.10 งานของคุณคิมเป็น FOLLOW_UP ทั้งหมด');
SELECT test.assert_eq((SELECT count(*) FROM test.kwan_tasks WHERE task_no = 'TK-2026-012508'), 0::bigint,
                      'J13.10 งานของคุณสมชาย (18 ก.ย.) ไม่อยู่ในรายการวันนี้');

-- =====================================================================================
-- K. วันนี้ ณ 10:24 น. และคิวหน้าร้าน (ข้อ 13.11)
-- =====================================================================================
CREATE FUNCTION test.acc_today(p_bcode text, p_visits text, p_walkin text, p_id text, p_uniq text, p_open text, p_chg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; g text; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'org_today_branch';
    g := test.branch(p_bcode)::text;
    PERFORM test.acc_kpi(v, 'VISITS', p_visits, NULL, g, 'K13.11 ' || p_bcode || ' VISITS');
    PERFORM test.acc_kpi(v, 'WALKIN_VISITS', p_walkin, NULL, g, 'K13.11 ' || p_bcode || ' Walk-in');
    PERFORM test.acc_kpi(v, 'IDENTIFIED_VISITS', p_id, NULL, g, 'K13.11 ' || p_bcode || ' Identified');
    PERFORM test.acc_kpi(v, 'UNIQUE_CUSTOMERS', p_uniq, p_chg, g, 'K13.11 ' || p_bcode || ' ลูกค้าไม่ซ้ำวันนี้');
    PERFORM test.acc_kpi(v, 'OPEN_VISITS', p_open, NULL, g, 'K13.11 ' || p_bcode || ' visit เปิดอยู่');
END; $$;
SELECT test.acc_today('JP1', '7', '4', '4', '7', '4', '+17%');
SELECT test.acc_today('JP2', '4', '2', '4', '4', '0', '0%');
SELECT test.acc_today('JP3', '4', '2', '3', '3', '0', '+50%');
SELECT test.acc_today('JP4', '2', '1', '2', '2', '0', '0%');
SELECT test.acc_kpi(v, 'VISITS', '17', NULL, NULL, 'K13.11 รวม VISITS วันนี้')            FROM test.acc WHERE k = 'org_today';
SELECT test.acc_kpi(v, 'WALKIN_VISITS', '9', NULL, NULL, 'K13.11 รวม Walk-in วันนี้')      FROM test.acc WHERE k = 'org_today';
SELECT test.acc_kpi(v, 'IDENTIFIED_VISITS', '13', NULL, NULL, 'K13.11 รวม Identified วันนี้') FROM test.acc WHERE k = 'org_today';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '16', '+14%', NULL, 'K13.11 รวมลูกค้าไม่ซ้ำวันนี้') FROM test.acc WHERE k = 'org_today';
SELECT test.acc_kpi(v, 'OPEN_VISITS', '4', NULL, NULL, 'K13.11 รวม visit เปิดอยู่')         FROM test.acc WHERE k = 'org_today';
SELECT test.assert_eq((SELECT test.acc_get(v, 'UNIQUE_CUSTOMERS', 'prev_value') FROM test.acc WHERE k = 'org_today'), '14',
                      'K13.11 วันเดียวกันสัปดาห์ก่อน (ถึง 10:24) 14 ราย');
-- คิว JAUNPHONE 1
CREATE FUNCTION test.acc_queue(p_q integer, p_at timestamptz, p_status text, p_interest text, p_owner text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record; BEGIN
    SELECT v.started_at, v.status::text AS st, v.interest_code,
           (SELECT s.staff_code FROM core.staff_profiles s WHERE s.id = v.owner_staff_id) AS own
      INTO r FROM crm.visits v
     WHERE v.branch_id = test.branch('JP1') AND v.queue_no = p_q AND v.started_at >= '2026-09-11 00:00+07';
    PERFORM test.assert_eq(r.started_at, p_at, 'K13.11 คิว ' || lpad(p_q::text, 3, '0') || ' เข้าคิว');
    PERFORM test.assert_eq(r.st, p_status, 'K13.11 คิว ' || lpad(p_q::text, 3, '0') || ' สถานะ');
    PERFORM test.assert_eq(r.interest_code, p_interest, 'K13.11 คิว ' || lpad(p_q::text, 3, '0') || ' วัตถุประสงค์');
    PERFORM test.assert_eq(r.own, p_owner, 'K13.11 คิว ' || lpad(p_q::text, 3, '0') || ' ผู้รับ');
END; $$;
SELECT test.acc_queue(1, '2026-09-11T10:05:00+07:00', 'IN_SERVICE', 'BUY',      'ST-0045');
SELECT test.acc_queue(2, '2026-09-11T10:12:00+07:00', 'WAITING',    'TRADE_IN', NULL);
SELECT test.acc_queue(3, '2026-09-11T10:18:00+07:00', 'WAITING',    'REPAIR',   NULL);
SELECT test.acc_queue(4, '2026-09-11T10:21:00+07:00', 'WAITING',    'INQUIRY',  NULL);
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP1')
                        AND v.started_at >= '2026-09-11 00:00+07' AND v.channel_code <> 'WALK_IN'), 3::bigint,
                      'K13.11 visit ออนไลน์ JP1 วันนี้ 3 รายการ');
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.branch_id = test.branch('JP1')
                        AND v.started_at >= '2026-09-11 00:00+07' AND v.customer_id IS NULL), 3::bigint,
                      'K13.11 คิว 002–004 ไม่ระบุตัวตน');
SELECT test.assert_eq((SELECT count(*) FROM crm.interactions i WHERE i.branch_id = test.branch('JP1')
                        AND i.occurred_at >= '2026-09-11 00:00+07' AND i.direction = 'OUTBOUND' AND i.visit_id IS NULL),
                      3::bigint, 'K13.11 ลูกค้า JP1 อีก 3 รายที่มีเฉพาะ interaction OUTBOUND วันนี้');
SELECT test.assert_eq((SELECT count(DISTINCT a.customer_id) FROM analytics.customer_activity a
                        WHERE a.occurred_at >= '2026-09-11 10:06+07' AND a.occurred_at < '2026-09-12 00:00+07'
                          AND a.customer_id IS NOT NULL
                          AND a.customer_id NOT IN (test.cust('CUS-2026-000297'), test.cust('CUS-2026-006851'),
                                                    test.cust('CUS-2026-004127'), test.cust('CUS-2026-006790'),
                                                    test.cust('CUS-2026-006774'))), 0::bigint,
                      'K13.11 กิจกรรมวันนี้ของลูกค้าทุกรายที่ไม่อยู่ในข้อ 13.8 เกิดก่อน 10:06');

-- =====================================================================================
-- L. ศูนย์คุณภาพข้อมูล (ข้อ 13.12) — api.get_report('DATA_QUALITY') และ api.list_data_quality_issues
-- =====================================================================================
CREATE FUNCTION test.acc_dq(p_issue text, p_bcode text, p_expect bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; BEGIN
    SELECT a.v INTO v FROM test.acc a WHERE a.k = 'rep_dq';
    PERFORM test.assert_eq(coalesce((SELECT (x ->> 'value')::bigint FROM jsonb_array_elements(v -> 'extra' -> 'issues') x
                                      WHERE x ->> 'issue_code' = p_issue AND x ->> 'branch_code' = p_bcode), 0::bigint),
                           p_expect, 'L13.12 ' || p_issue || ' × ' || p_bcode);
END; $$;
SELECT test.acc_dq('DUPLICATE_SUSPECTED', 'JP1', 5); SELECT test.acc_dq('DUPLICATE_SUSPECTED', 'JP2', 4);
SELECT test.acc_dq('DUPLICATE_SUSPECTED', 'JP3', 4); SELECT test.acc_dq('DUPLICATE_SUSPECTED', 'JP4', 3);
SELECT test.acc_dq('MISSING_PHONE', 'JP1', 7); SELECT test.acc_dq('MISSING_PHONE', 'JP2', 6);
SELECT test.acc_dq('MISSING_PHONE', 'JP3', 5); SELECT test.acc_dq('MISSING_PHONE', 'JP4', 5);
SELECT test.acc_dq('INVALID_PHONE', 'JP1', 2); SELECT test.acc_dq('INVALID_PHONE', 'JP2', 2);
SELECT test.acc_dq('INVALID_PHONE', 'JP3', 1); SELECT test.acc_dq('INVALID_PHONE', 'JP4', 1);
SELECT test.acc_dq('LEAD_WITHOUT_OWNER', 'JP1', 2); SELECT test.acc_dq('LEAD_WITHOUT_OWNER', 'JP2', 2);
SELECT test.acc_dq('LEAD_WITHOUT_OWNER', 'JP3', 2); SELECT test.acc_dq('LEAD_WITHOUT_OWNER', 'JP4', 2);
SELECT test.acc_dq('LEAD_WITHOUT_OUTCOME', 'JP1', 6); SELECT test.acc_dq('LEAD_WITHOUT_OUTCOME', 'JP2', 5);
SELECT test.acc_dq('LEAD_WITHOUT_OUTCOME', 'JP3', 4); SELECT test.acc_dq('LEAD_WITHOUT_OUTCOME', 'JP4', 4);
SELECT test.acc_dq('OVERDUE_FOLLOWUP', 'JP1', 6); SELECT test.acc_dq('OVERDUE_FOLLOWUP', 'JP2', 9);
SELECT test.acc_dq('OVERDUE_FOLLOWUP', 'JP3', 8); SELECT test.acc_dq('OVERDUE_FOLLOWUP', 'JP4', 8);
SELECT test.acc_dq('INCOMPLETE_CUSTOMER', 'JP1', 13); SELECT test.acc_dq('INCOMPLETE_CUSTOMER', 'JP2', 11);
SELECT test.acc_dq('INCOMPLETE_CUSTOMER', 'JP3', 9);  SELECT test.acc_dq('INCOMPLETE_CUSTOMER', 'JP4', 9);
SELECT test.acc_dq('WON_WITHOUT_TRANSACTION', 'JP1', 4); SELECT test.acc_dq('WON_WITHOUT_TRANSACTION', 'JP2', 3);
SELECT test.acc_dq('WON_WITHOUT_TRANSACTION', 'JP3', 3); SELECT test.acc_dq('WON_WITHOUT_TRANSACTION', 'JP4', 2);
SELECT test.acc_dq('VISIT_UNRECORDED', 'JP1', 9); SELECT test.acc_dq('VISIT_UNRECORDED', 'JP2', 8);
SELECT test.acc_dq('VISIT_UNRECORDED', 'JP3', 7); SELECT test.acc_dq('VISIT_UNRECORDED', 'JP4', 5);
-- ข้อสังเกตของข้อ 13.12
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q JOIN crm.customers c ON c.id = q.customer_id
                        WHERE q.issue_code = 'MISSING_PHONE' AND c.created_via <> 'IMPORT'), 0::bigint,
                      'L13.12 ลูกค้า MISSING_PHONE 23 รายเป็นข้อมูลนำเข้าทั้งหมด');
SELECT test.assert_eq((SELECT count(DISTINCT q.customer_id) FROM analytics.data_quality_issues q
                        WHERE q.issue_code IN ('MISSING_PHONE', 'INCOMPLETE_CUSTOMER')), 61::bigint,
                      'L13.12 ลูกค้าไม่ซ้ำที่ติดธง 61 ราย');
SELECT test.assert_eq((SELECT count(*) FROM (SELECT q.customer_id FROM analytics.data_quality_issues q
                        WHERE q.issue_code IN ('MISSING_PHONE', 'INCOMPLETE_CUSTOMER')
                        GROUP BY q.customer_id HAVING count(*) = 2) z), 4::bigint,
                      'L13.12 ลูกค้า 4 รายติดทั้ง MISSING_PHONE และ INCOMPLETE_CUSTOMER');
SELECT test.assert_eq((SELECT count(DISTINCT q.customer_id) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'DUPLICATE_SUSPECTED'), 16::bigint,
                      'L13.12 DUPLICATE_SUSPECTED = ลูกค้า 16 รายไม่ซ้ำกัน');
SELECT test.assert_eq((SELECT count(*) FROM crm.duplicate_decisions d WHERE d.score < 70), 0::bigint,
                      'L13.12 ไม่มีคู่ที่คะแนนต่ำกว่า 70');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'OVERDUE_FOLLOWUP' AND q.branch_id = test.branch('JP1')
                          AND q.owner_staff_id = test.staff('ST-0045')), 3::bigint, 'L13.12 OVERDUE_FOLLOWUP JP1 ของคุณขวัญ 3');
SELECT test.assert_eq((SELECT count(*) FROM analytics.data_quality_issues q
                        WHERE q.issue_code = 'OVERDUE_FOLLOWUP' AND q.branch_id = test.branch('JP1')
                          AND q.owner_staff_id = test.staff('ST-0046')), 3::bigint, 'L13.12 OVERDUE_FOLLOWUP JP1 ของคุณคิม 3');
-- api.list_data_quality_issues ตามสิทธิ์ (ข้อ 9.6 · 12.3)
SELECT test.login_as('jay@example.com', 'aal2');
SELECT test.assert_eq((test.acc_call($$SELECT api.list_data_quality_issues('VISIT_UNRECORDED', NULL)$$) ->> 'total')::bigint,
                      9::bigint, 'L13.12 คุณเจเห็น VISIT_UNRECORDED ของ JP1 9 รายการ');
SELECT test.logout();
SELECT test.login_as('ja@example.com', 'aal2');
SELECT test.assert_eq((test.acc_call($$SELECT api.list_data_quality_issues('VISIT_UNRECORDED', NULL)$$) ->> 'total')::bigint,
                      29::bigint, 'L13.12 จ๋าอั๋นเห็น VISIT_UNRECORDED ทั้งองค์กร 29 รายการ');
SELECT test.logout();

-- =====================================================================================
-- M. ตัวอย่างอื่น (ข้อ 13.14)
-- =====================================================================================
-- กระดิ่ง (แจ้งเตือนที่ยังไม่อ่าน)
CREATE FUNCTION test.acc_bell(p_staff text, p_n bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq((SELECT count(*) FROM crm.notifications n
                             WHERE n.recipient_staff_id = test.staff(p_staff) AND n.read_at IS NULL),
                           p_n, 'M13.14 กระดิ่งของ ' || p_staff);
END; $$;
SELECT test.acc_bell('ST-0045', 6); SELECT test.acc_bell('ST-0046', 5); SELECT test.acc_bell('ST-0030', 3);
SELECT test.acc_bell('ST-0020', 4); SELECT test.acc_bell('ST-0002', 1); SELECT test.acc_bell('ST-0001', 1);
SELECT test.acc_bell('ST-0003', 0); SELECT test.acc_bell('ST-0010', 0); SELECT test.acc_bell('ST-0011', 0);
SELECT test.acc_bell('ST-0021', 0); SELECT test.acc_bell('ST-0022', 0); SELECT test.acc_bell('ST-0023', 0);
SELECT test.acc_bell('ST-0050', 0); SELECT test.acc_bell('ST-0051', 0);
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications WHERE read_at IS NULL), 20::bigint,
                      'M13.14 แจ้งเตือนที่ยังไม่อ่านทั้งหมด 20 แถว (snapshot)');
SELECT test.assert_eq((SELECT count(*) FROM crm.notifications), 20::bigint, 'M13.14 seed ใส่เฉพาะแจ้งเตือนของข้อ 13.14');
CREATE FUNCTION test.acc_bellcode(p_staff text, p_code text, p_n bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq((SELECT count(*) FROM crm.notifications n
                             WHERE n.recipient_staff_id = test.staff(p_staff) AND n.code = p_code AND n.read_at IS NULL),
                           p_n, 'M13.14 ' || p_staff || ' · ' || p_code);
END; $$;
SELECT test.acc_bellcode('ST-0045', 'FOLLOWUP_OVERDUE', 3);
SELECT test.acc_bellcode('ST-0045', 'TASK_OVERDUE', 2);
SELECT test.acc_bellcode('ST-0045', 'DATA_MISSING', 1);
SELECT test.acc_bellcode('ST-0046', 'LEAD_ASSIGNED', 1);
SELECT test.acc_bellcode('ST-0046', 'FOLLOWUP_OVERDUE', 3);
SELECT test.acc_bellcode('ST-0046', 'DATA_MISSING', 1);
SELECT test.acc_bellcode('ST-0030', 'LEAD_UNASSIGNED', 2);
SELECT test.acc_bellcode('ST-0030', 'DUPLICATE_SUSPECTED', 1);
SELECT test.acc_bellcode('ST-0020', 'LEAD_UNASSIGNED', 2);
SELECT test.acc_bellcode('ST-0020', 'DUPLICATE_SUSPECTED', 1);
SELECT test.acc_bellcode('ST-0020', 'VISIT_OUTCOME_MISSING', 1);
SELECT test.acc_bellcode('ST-0002', 'EXPORT_APPROVAL_REQUIRED', 1);
SELECT test.acc_bellcode('ST-0001', 'ROLE_GRANT_APPROVAL_REQUIRED', 1);
SELECT test.assert_eq((SELECT n.entity_ref FROM crm.notifications n WHERE n.code = 'LEAD_ASSIGNED'), 'LD-2026-007512',
                      'M13.14 LEAD_ASSIGNED ของ LD-2026-007512');
SELECT test.assert_eq((SELECT n.created_at FROM crm.notifications n WHERE n.code = 'LEAD_ASSIGNED'),
                      '2026-09-10T18:05:00+07:00'::timestamptz, 'M13.14 LEAD_ASSIGNED 10 ก.ย. 18:05');
SELECT test.assert_eq((SELECT DISTINCT n.created_at FROM crm.notifications n WHERE n.code = 'DATA_MISSING'),
                      '2026-09-11T09:00:00+07:00'::timestamptz, 'M13.14 DATA_MISSING 11 ก.ย. 09:00');
SELECT test.assert_eq((SELECT DISTINCT n.created_at FROM crm.notifications n WHERE n.code = 'DUPLICATE_SUSPECTED'),
                      '2026-09-10T18:00:00+07:00'::timestamptz, 'M13.14 สรุป DUPLICATE_SUSPECTED 10 ก.ย. 18:00');
-- การเปลี่ยนผู้รับผิดชอบ
SELECT test.assert_eq((SELECT o.reason_code FROM crm.ownership_changes o JOIN crm.leads l ON l.id = o.entity_id
                        WHERE l.lead_no = 'LD-2026-007512'), 'SHIFT_CHANGE', 'M13.14 การเปลี่ยนผู้รับผิดชอบ SHIFT_CHANGE');
SELECT test.assert_eq((SELECT o.changed_at FROM crm.ownership_changes o JOIN crm.leads l ON l.id = o.entity_id
                        WHERE l.lead_no = 'LD-2026-007512'), '2026-09-10T18:05:00+07:00'::timestamptz, 'M13.14 เปลี่ยน 10 ก.ย. 18:05');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.ownership_changes o JOIN core.staff_profiles s ON s.id = o.from_staff_id
                        JOIN crm.leads l ON l.id = o.entity_id WHERE l.lead_no = 'LD-2026-007512'), 'ST-0045', 'M13.14 จากคุณขวัญ');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.ownership_changes o JOIN core.staff_profiles s ON s.id = o.to_staff_id
                        JOIN crm.leads l ON l.id = o.entity_id WHERE l.lead_no = 'LD-2026-007512'), 'ST-0046', 'M13.14 เป็นคุณคิม');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.ownership_changes o JOIN core.staff_profiles s ON s.id = o.changed_by
                        JOIN crm.leads l ON l.id = o.entity_id WHERE l.lead_no = 'LD-2026-007512'), 'ST-0020', 'M13.14 โดยคุณเจ');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.leads l JOIN core.staff_profiles s ON s.id = l.owner_staff_id
                        WHERE l.lead_no = 'LD-2026-007512'), 'ST-0046', 'M13.14 owner ปัจจุบันของ LD-2026-007512 = คุณคิม');
-- คู่ซ้ำตัวอย่างแรกของหน้า 12
SELECT test.assert_eq((SELECT c2.customer_no FROM crm.duplicate_decisions d
                        JOIN crm.customers c2 ON c2.id = d.candidate_customer_id
                        WHERE d.customer_id = test.cust('CUS-2026-006633')), 'CUS-2026-002118',
                      'M13.14 CUS-2026-006633 ↔ CUS-2026-002118');
SELECT test.assert_eq((SELECT d.score FROM crm.duplicate_decisions d WHERE d.customer_id = test.cust('CUS-2026-006633')),
                      100, 'M13.14 คะแนน 100');
SELECT test.assert_eq((SELECT d.matched_rules[1] FROM crm.duplicate_decisions d WHERE d.customer_id = test.cust('CUS-2026-006633')),
                      'เบอร์โทรตรงกัน', 'M13.14 เหตุผลบนการ์ด "เบอร์โทรตรงกัน"');
SELECT test.assert_eq((SELECT d.status::text FROM crm.duplicate_decisions d WHERE d.customer_id = test.cust('CUS-2026-006633')),
                      'PENDING', 'M13.14 สถานะ PENDING');
SELECT test.assert_eq((SELECT d.override_reason_code FROM crm.duplicate_decisions d WHERE d.customer_id = test.cust('CUS-2026-006633')),
                      'FAMILY_SHARED_PHONE', 'M13.14 เหตุผล FAMILY_SHARED_PHONE');
SELECT test.assert_eq((SELECT s.staff_code FROM crm.duplicate_decisions d JOIN core.staff_profiles s ON s.id = d.created_by
                        WHERE d.customer_id = test.cust('CUS-2026-006633')), 'ST-0046', 'M13.14 สร้างโดยคุณคิม');
SELECT test.assert_eq((SELECT app.bangkok_date(d.created_at) FROM crm.duplicate_decisions d
                        WHERE d.customer_id = test.cust('CUS-2026-006633')), '2026-09-03'::date, 'M13.14 สร้าง 3 ก.ย. 2569');
SELECT test.assert_eq((SELECT string_agg(b.code, ',') FROM crm.customers c JOIN core.branches b ON b.id = c.first_branch_id
                        WHERE c.customer_no IN ('CUS-2026-006633', 'CUS-2026-002118')), 'JP1,JP1', 'M13.14 ทั้งสองรายสาขาแรก JP1');
SELECT test.assert_eq((SELECT count(DISTINCT cc.value_normalized) FROM crm.customer_contacts cc
                        WHERE cc.customer_id IN (test.cust('CUS-2026-006633'), test.cust('CUS-2026-002118'))
                          AND cc.contact_type = 'PHONE'), 1::bigint, 'M13.14 ทั้งสองรายใช้เบอร์เดียวกัน');
-- คำขอส่งออก
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000031'), 'REQUESTED', 'M13.14 EX-2026-000031 REQUESTED');
SELECT test.assert_eq((SELECT e.row_count FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000031'), 1850, 'M13.14 EX-2026-000031 1,850 แถว');
SELECT test.assert_eq((SELECT e.reason_code FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000031'), 'MARKETING_CAMPAIGN', 'M13.14 EX-2026-000031 MARKETING_CAMPAIGN');
SELECT test.assert_eq((SELECT e.requested_at FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000031'),
                      '2026-09-10T16:20:00+07:00'::timestamptz, 'M13.14 EX-2026-000031 10 ก.ย. 16:20');
SELECT test.assert_eq((SELECT s.staff_code FROM audit.export_requests e JOIN core.staff_profiles s ON s.id = e.requested_by
                        WHERE e.export_no = 'EX-2026-000031'), 'ST-0011', 'M13.14 EX-2026-000031 คุณมายด์');
SELECT test.assert_eq((SELECT e.status::text FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000030'), 'EXPIRED', 'M13.14 EX-2026-000030 EXPIRED');
SELECT test.assert_eq((SELECT e.row_count FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000030'), 412, 'M13.14 EX-2026-000030 412 แถว');
SELECT test.assert_eq((SELECT e.download_count FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000030'), 1, 'M13.14 EX-2026-000030 ดาวน์โหลด 1 ครั้ง');
SELECT test.assert_eq((SELECT app.bangkok_date(e.file_deleted_at) FROM audit.export_requests e WHERE e.export_no = 'EX-2026-000030'),
                      '2026-09-06'::date, 'M13.14 EX-2026-000030 ไฟล์ถูกลบ 6 ก.ย.');
SELECT test.assert_eq((SELECT count(*) FROM audit.export_requests), 2::bigint, 'M13.14 seed มีคำขอส่งออก 2 รายการ');
-- คำขอมอบบทบาท
SELECT test.assert_eq((SELECT r.role_code FROM core.role_grant_requests r WHERE r.request_no = 'RG-2026-0003'), 'SYSTEM_ADMIN', 'M13.14 RG-2026-0003 ขอ SYSTEM_ADMIN');
SELECT test.assert_eq((SELECT r.status FROM core.role_grant_requests r WHERE r.request_no = 'RG-2026-0003'), 'REQUESTED', 'M13.14 RG-2026-0003 รออนุมัติ');
SELECT test.assert_eq((SELECT r.requested_at FROM core.role_grant_requests r WHERE r.request_no = 'RG-2026-0003'),
                      '2026-09-11T09:12:00+07:00'::timestamptz, 'M13.14 RG-2026-0003 ยื่น 11 ก.ย. 09:12');
SELECT test.assert_eq((SELECT s.staff_code FROM core.role_grant_requests r JOIN core.staff_profiles s ON s.id = r.requested_by
                        WHERE r.request_no = 'RG-2026-0003'), 'ST-0003', 'M13.14 RG-2026-0003 ยื่นโดยคุณต้น');
SELECT test.assert_eq((SELECT s.staff_code FROM core.role_grant_requests r JOIN core.staff_profiles s ON s.id = r.target_staff_id
                        WHERE r.request_no = 'RG-2026-0003'), 'ST-0051', 'M13.14 RG-2026-0003 ให้คุณโอ๊ต');
-- Audit (หน้า 16)
CREATE FUNCTION test.acc_audit(p_at timestamptz, p_staff text, p_action text, p_ref text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq((SELECT count(*) FROM audit.audit_logs a
                             WHERE a.occurred_at = p_at AND a.actor_staff_code = p_staff
                               AND a.action = p_action AND a.entity_ref = p_ref), 1::bigint,
                           'M13.14 audit ' || p_action || ' · ' || p_ref);
END; $$;
SELECT test.acc_audit('2026-09-11T09:12:00+07:00', 'ST-0003', 'ROLE_GRANT_REQUESTED', 'RG-2026-0003');
SELECT test.acc_audit('2026-09-10T18:42:00+07:00', 'ST-0045', 'CUSTOMER_CONTACT_UPDATED', 'CUS-2025-007321');
SELECT test.acc_audit('2026-09-10T18:05:00+07:00', 'ST-0020', 'LEAD_ASSIGNED', 'LD-2026-007512');
SELECT test.acc_audit('2026-09-10T16:20:00+07:00', 'ST-0011', 'EXPORT_REQUESTED', 'EX-2026-000031');
SELECT test.assert_eq((SELECT count(*) FROM audit.access_logs a WHERE a.action = 'CONTACT_REVEALED'
                        AND a.occurred_at = '2026-09-11T10:20:00+07:00'::timestamptz
                        AND a.actor_staff_code = 'ST-0045' AND a.customer_id = test.cust('CUS-2026-000297')
                        AND a.purpose = 'CALL'), 1::bigint, 'M13.14 access log CONTACT_REVEALED 11 ก.ย. 10:20');
SELECT test.assert_eq((SELECT count(*) FROM audit.audit_logs), 4::bigint, 'M13.14 seed ใส่ audit เฉพาะ 4 แถวของข้อ 13.14');
SELECT test.assert_eq((SELECT count(*) FROM crm.data_subject_requests), 0::bigint, 'M13.14 คำขอเจ้าของข้อมูล — ไม่มี (empty state)');

-- =====================================================================================
-- N. Dashboard ตามบทบาท (ข้อ 14.7 · ช่วง "30 วันล่าสุด")
-- =====================================================================================
-- EXECUTIVE · BUSINESS_ADMIN · OPERATIONS · MARKETING เห็นตัวเลขชุดเดียวกับข้อ 13.1
CREATE FUNCTION test.acc_dash(p_email text, p_aal text, p_key text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v jsonb; t jsonb; BEGIN
    PERFORM test.login_as(p_email, p_aal);
    EXECUTE $q$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$q$ INTO v;
    EXECUTE $q$SELECT api.get_kpis('TODAY', NULL, NULL, NULL, 'NONE')$q$ INTO t;
    PERFORM test.logout();
    PERFORM test.acc_kpi(t, 'UNIQUE_CUSTOMERS', '16', '+14%', NULL, 'N14.7 ' || p_key || ' ลูกค้าไม่ซ้ำวันนี้');
    PERFORM test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '1,284', '+12%', NULL, 'N14.7 ' || p_key || ' ลูกค้าไม่ซ้ำ');
    PERFORM test.acc_kpi(v, 'LEADS', '892', '+8%', NULL, 'N14.7 ' || p_key || ' Leads');
    PERFORM test.acc_kpi(v, 'OPPORTUNITIES', '368', '+14%', NULL, 'N14.7 ' || p_key || ' Opportunities');
    PERFORM test.acc_kpi(v, 'SALES', '215', '+18%', NULL, 'N14.7 ' || p_key || ' ปิดการขาย');
    PERFORM test.acc_kpi(v, 'CONV_LEAD_TO_SALE', '24.1%', '+2.1 pp', NULL, 'N14.7 ' || p_key || ' Conversion');
END; $$;
SELECT test.acc_dash('ja@example.com',   'aal2', 'EXECUTIVE');
SELECT test.acc_dash('prae@example.com', 'aal2', 'BUSINESS_ADMIN');
SELECT test.acc_dash('puk@example.com',  'aal2', 'OPERATIONS');
SELECT test.acc_dash('mind@example.com', 'aal2', 'MARKETING');
-- BUSINESS_ADMIN เพิ่มแถวคุณภาพข้อมูล
SELECT test.login_as('prae@example.com', 'aal2');
INSERT INTO test.acc VALUES ('ba', test.acc_call($$SELECT api.get_kpis('LAST_30_DAYS', NULL, NULL, NULL, 'NONE')$$));
SELECT test.logout();
SELECT test.acc_kpi(v, 'CAPTURE_RATE', '87.0%', NULL, NULL, 'N14.7 BA Capture')             FROM test.acc WHERE k = 'ba';
SELECT test.acc_kpi(v, 'OUTCOME_COMPLETION', '95.4%', NULL, NULL, 'N14.7 BA Outcome')       FROM test.acc WHERE k = 'ba';
SELECT test.acc_kpi(v, 'FOLLOWUP_COMPLETION', '85.0%', NULL, NULL, 'N14.7 BA Follow-up')    FROM test.acc WHERE k = 'ba';
SELECT test.acc_kpi(v, 'DUPLICATE_RATE', '0.1%', NULL, NULL, 'N14.7 BA Duplicate')          FROM test.acc WHERE k = 'ba';
SELECT test.acc_kpi(v, 'MISSING_REQUIRED_RATE', '0.4%', NULL, NULL, 'N14.7 BA Missing')     FROM test.acc WHERE k = 'ba';
-- BRANCH_MANAGER คุณเจ (JP1)
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '7', '+17%', NULL, 'N14.7 BM ลูกค้าไม่ซ้ำวันนี้')  FROM test.acc WHERE k = 'jay_today';
SELECT test.acc_kpi(v, 'UNIQUE_CUSTOMERS', '412', '+12%', NULL, 'N14.7 BM ลูกค้าไม่ซ้ำ')      FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'LEADS', '298', '+8%', NULL, 'N14.7 BM Leads')                      FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'OPPORTUNITIES', '120', '+14%', NULL, 'N14.7 BM Opportunities')     FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'SALES', '82', '+19%', NULL, 'N14.7 BM ปิดการขาย')                   FROM test.acc WHERE k = 'jay';
SELECT test.acc_kpi(v, 'CONV_LEAD_TO_SALE', '27.5%', '+2.5 pp', NULL, 'N14.7 BM Conversion') FROM test.acc WHERE k = 'jay';
-- ผลงานรายพนักงานของคุณเจ (ข้อ 13.6 · ต้องมี report.staff_performance)
SELECT test.acc_kpi(v, 'LEADS', '154', NULL, test.staff('ST-0045')::text, 'N14.7 BM รายพนักงาน ขวัญ Leads') FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'LEADS', '142', NULL, test.staff('ST-0046')::text, 'N14.7 BM รายพนักงาน คิม Leads')  FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'SALES', '44',  NULL, test.staff('ST-0045')::text, 'N14.7 BM รายพนักงาน ขวัญ Sales') FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'SALES', '38',  NULL, test.staff('ST-0046')::text, 'N14.7 BM รายพนักงาน คิม Sales')  FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿668,400', NULL, test.staff('ST-0045')::text, 'N14.7 BM รายพนักงาน ขวัญ ยอดขาย') FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'SALES_AMOUNT', '฿576,600', NULL, test.staff('ST-0046')::text, 'N14.7 BM รายพนักงาน คิม ยอดขาย')  FROM test.acc WHERE k = 'jay_staff';
SELECT test.acc_kpi(v, 'LEADS', '2', NULL, NULL, 'N14.7 BM รายพนักงาน กลุ่มไม่มีผู้รับผิดชอบ') FROM test.acc WHERE k = 'jay_staff';

-- =====================================================================================
-- O. คำถาม Acceptance 11 ข้อของ A44 · B27 (ตอบจากฐานข้อมูลจริง)
-- =====================================================================================
SELECT test.assert_eq(test.acc_num(v, 'VISITS'), 17::numeric, 'O01 วันนี้มีคนเข้าร้านกี่คน — 17 การมาติดต่อ')
  FROM test.acc WHERE k = 'org_today';
SELECT test.assert_eq(test.acc_num(v, 'UNIQUE_CUSTOMERS'), 1284::numeric, 'O02 เดือนนี้มีลูกค้าไม่ซ้ำกี่คน — 1,284')
  FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_num(v, 'NEW_CUSTOMERS'), 809::numeric, 'O03 ลูกค้าใหม่กี่คน — 809') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_num(v, 'RETURNING_CUSTOMERS'), 475::numeric, 'O04 ลูกค้าเก่ากี่คน — 475') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(v -> 'extra' -> 'channel_matrix') x),
                      1284::numeric, 'O05 มาจากช่องทางใด — เมทริกซ์ช่องทาง × สาขา ครบ 1,284') FROM test.acc WHERE k = 'rep_channels';
SELECT test.assert_eq((SELECT count(DISTINCT l.interest_code) FROM crm.leads l
                        WHERE l.created_at >= '2026-08-13 00:00+07' AND l.created_at < '2026-09-12 00:00+07'), 5::bigint,
                      'O06 สนใจอะไร — lead ใน P ระบุ interest_code ครบทุกใบ (5 ชนิดที่สร้าง lead)');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l
                        WHERE l.created_at >= '2026-08-13 00:00+07' AND l.created_at < '2026-09-12 00:00+07'
                          AND l.interest_code IS NULL), 0::bigint, 'O06b lead ทุกใบมีความสนใจ');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l
                        WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND l.owner_staff_id IS NULL), 8::bigint,
                      'O07 ใครดูแล — lead เปิดอยู่ที่ยังไม่มีผู้ดูแลเหลือ 8 รายการ (ข้อ 13.12)');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o
                        WHERE o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP') AND o.owner_staff_id IS NULL), 0::bigint,
                      'O07b โอกาสขายที่เปิดอยู่มีผู้ดูแลครบทุกใบ');
SELECT test.assert_eq(test.acc_num(v, 'BUYERS'), 209::numeric, 'O08 ซื้อหรือไม่ซื้อ — ผู้ซื้อ 209 ราย') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_num(v, 'LOST_TOTAL'), 296::numeric, 'O08b ไม่สำเร็จรวม 296 รายการ') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.status = 'LOST' AND l.lost_reason_code IS NULL), 0::bigint,
                      'O09 ถ้าไม่ซื้อ เพราะอะไร — lead ที่ LOST มีเหตุผลครบทุกใบ');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.stage = 'LOST' AND o.lost_reason_code IS NULL), 0::bigint,
                      'O09b opportunity ที่ LOST มีเหตุผลครบทุกใบ');
SELECT test.assert_eq(test.acc_num(v, 'OPEN_FOLLOWUP_CUSTOMERS'), 117::numeric,
                      'O10 ใครต้องติดตามต่อ — ลูกค้าที่ต้องติดตาม 117 ราย') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq((SELECT count(*) FROM jsonb_array_elements(v -> 'rows') x
                        WHERE x ->> 'code' = 'CONV_LEAD_TO_SALE' AND (x -> 'group_key') <> 'null'::jsonb
                          AND x ->> 'display' IS NOT NULL), 5::bigint,
                      'O11 แต่ละสาขา Conversion เท่าไร — มีค่าให้ทุกสาขา (JP1–JP4 · JPON)') FROM test.acc WHERE k = 'org_branch';
SELECT test.assert_eq(test.acc_get(v, 'DUPLICATE_RATE', 'display'), '0.1%',
                      'O11b มีข้อมูลซ้ำเท่าไร — 0.1% (16 / 14,962)') FROM test.acc WHERE k = 'org';
SELECT test.assert_eq(test.acc_get(v, 'MISSING_REQUIRED_RATE', 'display'), '0.4%',
                      'O11c ข้อมูลไม่ครบเท่าไร — 0.4% (61 / 14,962)') FROM test.acc WHERE k = 'org';
-- รายงานหน้า 09: ทุกรหัสตอบได้ (ข้อ 12.0 · 14.8)
SELECT test.login_as('ja@example.com', 'aal2');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('OVERVIEW', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O12 รายงาน OVERVIEW');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('CUSTOMERS', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O13 รายงาน CUSTOMERS');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('SALES', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O14 รายงาน SALES');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('CHANNELS', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O15 รายงาน CHANNELS');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('STAFF', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O16 รายงาน STAFF');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('BRANCHES', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O17 รายงาน BRANCHES');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('LOST_REASONS', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O18 รายงาน LOST_REASONS');
SELECT test.assert_eq((test.acc_call($$SELECT api.get_report('DATA_QUALITY', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$) ->> 'ok')::boolean, true, 'O19 รายงาน DATA_QUALITY');
SELECT test.assert_eq((SELECT sum((x ->> 'value')::numeric) FROM jsonb_array_elements(
                        test.acc_call($$SELECT api.get_report('OVERVIEW', 'LAST_30_DAYS', NULL, NULL, NULL, '{}')$$)
                          -> 'extra' -> 'walkin_by_branch') x), 2525::numeric,
                      'O20 กราฟลูกค้าเข้าร้านแยกตามสาขา รวม 2,525 (ข้อ 13.2)');
SELECT test.logout();

-- =====================================================================================
-- P. ค่าประกอบที่พิมพ์ในวงเล็บของข้อ 13.1 · 13.2b · 13.0
-- =====================================================================================
-- ผู้ซื้อ 209 = ซื้อ 1 ครั้งใน P 203 ราย + 2 ครั้ง 6 ราย
CREATE TABLE test.buy AS
SELECT pe.customer_id, count(*) AS n FROM analytics.purchase_events pe
WHERE pe.purchased_at >= '2026-08-13 00:00+07' AND pe.purchased_at < '2026-09-12 00:00+07'
GROUP BY 1;
SELECT test.assert_eq((SELECT count(*) FROM test.buy), 209::bigint, 'P13.1 ผู้ซื้อ 209 ราย');
SELECT test.assert_eq((SELECT count(*) FROM test.buy WHERE n = 1), 203::bigint, 'P13.1 ซื้อ 1 ครั้งใน P 203 ราย');
SELECT test.assert_eq((SELECT count(*) FROM test.buy WHERE n = 2), 6::bigint, 'P13.1 ซื้อ 2 ครั้งใน P 6 ราย');
SELECT test.assert_eq((SELECT count(*) FROM test.buy b WHERE EXISTS (
                         SELECT 1 FROM analytics.purchase_events pe
                          WHERE pe.customer_id = b.customer_id AND pe.purchased_at < '2026-08-13 00:00+07')),
                      35::bigint, 'P13.1 ผู้ซื้อซ้ำที่เคยซื้อก่อน P 35 ราย');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.stage = 'WON'
                        AND o.won_at >= '2026-08-13 00:00+07' AND o.won_at < '2026-09-12 00:00+07'), 215::bigint,
                      'P13.1 เหตุการณ์การซื้อใน P = opportunity WON 215 ใบ');
-- FOLLOWUP_COMPLETION: ตัดออก 21 = เกินกำหนดที่ยังในระยะผ่อนผัน 12 + งานเปิดที่ due วันนี้ 9
CREATE TABLE test.fu AS
SELECT t.branch_id, t.owner_staff_id, t.status::text AS st, t.due_at, t.completed_at
FROM crm.tasks t
WHERE t.task_type_code = 'FOLLOW_UP' AND t.status <> 'CANCELLED'
  AND t.due_at >= '2026-08-13 00:00+07' AND t.due_at < '2026-09-12 00:00+07';
SELECT test.assert_eq((SELECT count(*) FROM test.fu), 1067::bigint, 'P13.2b งาน FOLLOW_UP ที่ due อยู่ใน P รวม 1,067');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE st <> 'DONE'
                        AND due_at < '2026-09-11 00:00+07' AND due_at + interval '24 hours' > '2026-09-11 10:24+07'),
                      12::bigint, 'P13.1 ตัดออก — เกินกำหนดที่ยังในระยะผ่อนผัน 12');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE st <> 'DONE'
                        AND due_at >= '2026-09-11 00:00+07' AND due_at < '2026-09-12 00:00+07'),
                      9::bigint, 'P13.1 ตัดออก — งาน FOLLOW_UP เปิดอยู่ที่ due วันนี้ 9');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE st = 'DONE' AND completed_at <= due_at + interval '24 hours'),
                      889::bigint, 'P13.2b ตรงเวลา 889');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE st = 'DONE' AND completed_at > due_at + interval '24 hours'),
                      138::bigint, 'P13.2b เสร็จช้า 138');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE st <> 'DONE'
                        AND due_at + interval '24 hours' <= '2026-09-11 10:24+07'), 19::bigint,
                      'P13.2b เปิดอยู่และพ้นระยะผ่อนผัน 19');
CREATE FUNCTION test.acc_fu(p_bcode text, p_grace bigint, p_today bigint, p_openpast bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM test.assert_eq((SELECT count(*) FROM test.fu WHERE branch_id = test.branch(p_bcode) AND st <> 'DONE'
                             AND due_at < '2026-09-11 00:00+07' AND due_at + interval '24 hours' > '2026-09-11 10:24+07'),
                           p_grace, 'P13.2b ' || p_bcode || ' ตัดออก·ในผ่อนผัน');
    PERFORM test.assert_eq((SELECT count(*) FROM test.fu WHERE branch_id = test.branch(p_bcode) AND st <> 'DONE'
                             AND due_at >= '2026-09-11 00:00+07'), p_today, 'P13.2b ' || p_bcode || ' ตัดออก·due วันนี้');
    PERFORM test.assert_eq((SELECT count(*) FROM test.fu WHERE branch_id = test.branch(p_bcode) AND st <> 'DONE'
                             AND due_at + interval '24 hours' <= '2026-09-11 10:24+07'), p_openpast,
                           'P13.2b ' || p_bcode || ' เปิด·พ้นผ่อนผัน');
END; $$;
SELECT test.acc_fu('JP1', 6, 9, 0);
SELECT test.acc_fu('JP2', 2, 0, 7);
SELECT test.acc_fu('JP3', 2, 0, 6);
SELECT test.acc_fu('JP4', 2, 0, 6);
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE branch_id = test.branch('JP1') AND st <> 'DONE'
                        AND due_at >= '2026-09-11 00:00+07' AND owner_staff_id = test.staff('ST-0045')), 3::bigint,
                      'P13.1 JP1 งาน FOLLOW_UP due วันนี้ของคุณขวัญ 3');
SELECT test.assert_eq((SELECT count(*) FROM test.fu WHERE branch_id = test.branch('JP1') AND st <> 'DONE'
                        AND due_at >= '2026-09-11 00:00+07' AND owner_staff_id = test.staff('ST-0046')), 6::bigint,
                      'P13.1 JP1 งาน FOLLOW_UP due วันนี้ของคุณคิม 6');
-- เลข lead ของข้อ 13.0 ข้อ 8
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.created_at > '2026-08-12 19:40+07'
                        AND l.created_at < '2026-08-13 00:00+07'), 3::bigint,
                      'P13.0 หลัง LD-2026-006650 ในวันเดียวกันอีก 3 ใบ');
SELECT test.assert_eq((SELECT max(l.lead_no) FROM crm.leads l), 'LD-2026-007545', 'P13.0 เลข lead สูงสุด LD-2026-007545');
SELECT test.assert_eq((SELECT max(o.opportunity_no) FROM crm.opportunities o), 'OP-2026-003121', 'P13.0 เลข opportunity สูงสุด OP-2026-003121');
SELECT test.assert_eq((SELECT max(q.quotation_no) FROM crm.quotations q), 'QT-2026-001772', 'P13.0 เลขใบเสนอราคาสูงสุด QT-2026-001772');
SELECT test.assert_eq((SELECT max(t.task_no) FROM crm.tasks t), 'TK-2026-012660', 'P13.0 เลขงานสูงสุด TK-2026-012660');
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.lead_no = 'LD-2026-006650'
                        AND l.created_at = '2026-08-12T19:40:00+07:00'::timestamptz), 1::bigint,
                      'P13.0 LD-2026-006650 อยู่ที่ 12 ส.ค. 19:40');
-- ลำดับเลขเรียงตาม created_at (lead · opportunity · งาน)
SELECT test.assert_eq((SELECT count(*) FROM (
    SELECT lead_no, created_at, lag(created_at) OVER (ORDER BY lead_no) AS prev FROM crm.leads) z
    WHERE z.prev IS NOT NULL AND z.created_at < z.prev), 0::bigint, 'P13.0 เลข lead เรียงตาม created_at');
SELECT test.assert_eq((SELECT count(*) FROM (
    SELECT opportunity_no, created_at, lag(created_at) OVER (ORDER BY opportunity_no) AS prev FROM crm.opportunities) z
    WHERE z.prev IS NOT NULL AND z.created_at < z.prev), 0::bigint, 'P13.0 เลข opportunity เรียงตาม created_at');
SELECT test.assert_eq((SELECT count(*) FROM (
    SELECT task_no, created_at, lag(created_at) OVER (ORDER BY task_no) AS prev FROM crm.tasks) z
    WHERE z.prev IS NOT NULL AND z.created_at < z.prev), 0::bigint, 'P13.0 เลขงานเรียงตาม created_at');
SELECT test.assert_eq((SELECT count(*) FROM (
    SELECT customer_no, created_at, lag(created_at) OVER (ORDER BY customer_no) AS prev
      FROM crm.customers WHERE customer_no LIKE 'CUS-2026-%') z
    WHERE z.prev IS NOT NULL AND z.created_at < z.prev), 0::bigint, 'P13.0 เลขลูกค้าเรียงตาม created_at');
-- ข้อ 3.3 ข้อ 1: ทุก visit ที่ไม่ใช่ CANCELLED มี interaction ต้นทาง 1 รายการ
SELECT test.assert_eq((SELECT count(*) FROM crm.visits v WHERE v.status <> 'CANCELLED'
                        AND (SELECT count(*) FROM crm.interactions i WHERE i.visit_id = v.id AND i.is_visit_root) <> 1),
                      0::bigint, 'P3.3 ทุก visit ที่ไม่ใช่ CANCELLED มี interaction ต้นทาง 1 รายการ');
-- ข้อ 4.4: lead/opportunity ที่เปิดอยู่มี task next action หนึ่งใบ
SELECT test.assert_eq((SELECT count(*) FROM crm.leads l WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
                        AND NOT EXISTS (SELECT 1 FROM crm.tasks t WHERE t.lead_id = l.id AND t.is_next_action
                                                                    AND t.status IN ('OPEN', 'IN_PROGRESS'))),
                      0::bigint, 'P4.4 lead ที่เปิดอยู่ทุกใบมี task next action');
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
                        AND NOT EXISTS (SELECT 1 FROM crm.tasks t WHERE t.opportunity_id = o.id AND t.is_next_action
                                                                    AND t.status IN ('OPEN', 'IN_PROGRESS'))),
                      0::bigint, 'P4.4 opportunity ที่เปิดอยู่ทุกใบมี task next action');
-- ข้อ 4.4: opportunity ขั้น QUOTATION/FOLLOW_UP ต้องมีใบเสนอราคาที่ส่งแล้ว
SELECT test.assert_eq((SELECT count(*) FROM crm.opportunities o WHERE o.stage IN ('QUOTATION', 'FOLLOW_UP')
                        AND NOT EXISTS (SELECT 1 FROM crm.quotations q WHERE q.opportunity_id = o.id AND q.sent_at IS NOT NULL)),
                      0::bigint, 'P4.4 opportunity ขั้นเสนอราคา/รอตัดสินใจมีใบเสนอราคาที่ส่งแล้ว');
-- บัญชีผู้ใช้ของผู้ใช้ตัวอย่าง (ข้อ 13.5 · 7.3)
SELECT test.assert_eq((SELECT count(*) FROM core.staff_profiles s JOIN auth.users u ON u.id = s.user_id), 14::bigint,
                      'P13.5 auth.users ครบ 14 บัญชี');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_profiles s JOIN auth.users u ON u.id = s.user_id
                        WHERE s.status = 'ACTIVE' AND u.email_confirmed_at IS NULL), 0::bigint,
                      'P13.5 บัญชี ACTIVE ยืนยันอีเมลแล้วทุกคน');
SELECT test.assert_eq((SELECT u.email_confirmed_at FROM core.staff_profiles s JOIN auth.users u ON u.id = s.user_id
                        WHERE s.staff_code = 'ST-0051'), NULL::timestamptz,
                      'P13.5 คุณโอ๊ต (ST-0051) INVITED · ยังไม่ยืนยันอีเมล');
SELECT test.assert_true((SELECT s.invite_expires_at > app.clock() FROM core.staff_profiles s WHERE s.staff_code = 'ST-0051'),
                        'P13.5 คำเชิญของคุณโอ๊ตยังไม่หมดอายุ');
SELECT test.assert_eq((SELECT count(*) FROM core.staff_invitations i WHERE i.staff_id = test.staff('ST-0051')
                        AND i.accepted_at IS NULL AND i.revoked_at IS NULL), 1::bigint,
                      'P13.5 มีคำเชิญของคุณโอ๊ตที่ยังไม่ตอบรับ');
