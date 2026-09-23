-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0012 : analytics — view ภายใน · helper ของ KPI · RPC รายงาน
-- target        : Supabase PostgreSQL 17 (ทดสอบบน PGlite 0.4.1 = PG 17.5 ผ่าน tools/db/run.mjs)
--
-- ค่าอ้างอิงทั้งหมดมาจาก docs/00-brief/CANONICAL.md (v2.2) เท่านั้น
--   ข้อ 1.2   เวลา · app.clock() · ขอบวัน Asia/Bangkok
--   ข้อ 1.3   การปัดและการแสดงผล (half away from zero · pp จากอัตราที่ยังไม่ปัด)
--   ข้อ 3.1    analytics.customer_activity · purchase event · Unique/New/Returning/Repeat Buyer
--   ข้อ 9.4.1  KPI/รายงานผ่าน RPC SECURITY DEFINER · การตัดขอบเขตสาขา · TEAM/OWN คืน NULL
--   ข้อ 12.0   preset ของช่วงเวลาและช่วงเปรียบเทียบ · รหัสรายงาน
--   ข้อ 12.1   KPI หลัก · 12.2 อัตรา · 12.3 คุณภาพข้อมูล · 12.4 มิติและการผูกผลงาน
--   ข้อ 19.1 ข้อ 2  ทุกฟังก์ชันที่ authenticated เรียกตรงต้อง GRANT EXECUTE เอง
--
-- กติกาของไฟล์นี้:
--   · schema analytics **ไม่มี GRANT ใด ๆ** (ข้อ 1.1) · view ทุกตัว WITH (security_invoker = true) (ข้อ 9.4 กติกา 4)
--     เมื่ออ่านจาก RPC ที่เป็น SECURITY DEFINER เจ้าของ = postgres จึงเห็นทุกแถว และ RPC กรองขอบเขตเอง (ข้อ 9.4.1)
--   · helper ใน app ที่ RPC ใช้ภายใน ไม่ GRANT ให้ authenticated
--   · อ้างชื่อเต็ม schema.object เสมอ · ทุกฟังก์ชัน SET search_path = ''
--   · ไม่มี BEGIN/COMMIT ในไฟล์
-- =====================================================================================


-- =====================================================================================
-- ส่วนที่ 0 — ขอบวันธุรกิจ (CANONICAL ข้อ 1.2)
-- คู่กับ app.bangkok_date(timestamptz) ใน 0001: แปลงวันที่กลับเป็นเวลาเที่ยงคืน Asia/Bangkok
-- ห้ามพึ่ง session TimeZone จึง cast เป็น timestamp ก่อนแล้ว AT TIME ZONE เสมอ
-- =====================================================================================

CREATE FUNCTION app.bkk_ts(p_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT (p_date::timestamp AT TIME ZONE 'Asia/Bangkok')
$$;

COMMENT ON FUNCTION app.bkk_ts(date) IS
'เที่ยงคืน Asia/Bangkok ของวันที่ (ข้อ 1.2) = (d::timestamp AT TIME ZONE ''Asia/Bangkok'') · ใช้ประกอบขอบช่วง [start, end) ของ KPI · '
'ตรงข้ามกับ app.bangkok_date(timestamptz) · ไม่ขึ้นกับ session TimeZone · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 1 — view ภายในของ analytics (CANONICAL ข้อ 3.1 · 12.3)
-- =====================================================================================

-- 1.1 กิจกรรมของลูกค้า (ข้อ 3.1) · นิยามเดียวกับ app.customer_activity_events(uuid) ใน 0009
--     ต่างกันที่ view นี้ตัด interaction ที่ผูก visit CANCELLED ออกตาม v2.2
CREATE VIEW analytics.customer_activity WITH (security_invoker = true) AS
SELECT v.customer_id,
       v.branch_id,
       v.started_at AS occurred_at,
       'VISIT'::text AS kind
  FROM crm.visits v
 WHERE v.customer_id IS NOT NULL
   AND v.status <> 'CANCELLED'
UNION ALL
SELECT i.customer_id,
       i.branch_id,
       i.occurred_at,
       'INTERACTION'::text
  FROM crm.interactions i
  LEFT JOIN crm.visits iv ON iv.id = i.visit_id
 WHERE i.customer_id IS NOT NULL
   AND (i.visit_id IS NULL OR iv.status <> 'CANCELLED')
UNION ALL
SELECT l.customer_id, l.branch_id, l.created_at, 'LEAD'::text
  FROM crm.leads l
UNION ALL
SELECT o.customer_id, o.branch_id, o.created_at, 'OPPORTUNITY'::text
  FROM crm.opportunities o
UNION ALL
SELECT o.customer_id, o.branch_id, o.closed_at, 'OPPORTUNITY_CLOSED'::text
  FROM crm.opportunities o
 WHERE o.closed_at IS NOT NULL
UNION ALL
SELECT t.customer_id, t.branch_id, t.transacted_at, 'TRANSACTION'::text
  FROM crm.transaction_refs t;

COMMENT ON VIEW analytics.customer_activity IS
'กิจกรรมของลูกค้าที่นับได้ (CANONICAL ข้อ 3.1): visits.started_at (ไม่นับ CANCELLED) · interactions.occurred_at '
'(ไม่นับ interaction ที่ผูก visit CANCELLED) · leads.created_at · opportunities.created_at · opportunities.closed_at · '
'transaction_refs.transacted_at · ใช้นับ UNIQUE_CUSTOMERS / NEW_CUSTOMERS / RETURNING_CUSTOMERS (ข้อ 12.1) · '
'security_invoker · ไม่มี GRANT (อ่านใน RPC DEFINER เท่านั้น · ข้อ 9.4.1)';

-- 1.2 เหตุการณ์การซื้อ (ข้อ 3.1)
CREATE VIEW analytics.purchase_events WITH (security_invoker = true) AS
SELECT o.customer_id,
       o.branch_id,
       o.won_at           AS purchased_at,
       o.owner_staff_id,
       o.id               AS opportunity_id,
       o.won_amount       AS amount,
       'OPPORTUNITY'::text AS source
  FROM crm.opportunities o
 WHERE o.stage = 'WON'
   AND o.won_at IS NOT NULL
UNION ALL
SELECT t.customer_id,
       t.branch_id,
       t.transacted_at,
       NULL::uuid,
       t.opportunity_id,
       t.amount,
       'TRANSACTION_REF'::text
  FROM crm.transaction_refs t
  JOIN ref.transaction_types tt ON tt.code = t.transaction_type_code AND tt.counts_as_purchase
  LEFT JOIN crm.opportunities o ON o.id = t.opportunity_id
 WHERE t.opportunity_id IS NULL
    OR o.stage IS DISTINCT FROM 'WON';

COMMENT ON VIEW analytics.purchase_events IS
'เหตุการณ์การซื้อ (CANONICAL ข้อ 3.1): opportunity WON ที่ won_at + transaction_refs ที่ ref.transaction_types.counts_as_purchase '
'และ (ไม่ผูก opportunity หรือ opportunity นั้นไม่ใช่ WON) — ref ที่ผูก opportunity WON นับรวมเป็นครั้งเดียวกับ opportunity · '
'ใช้กับ BUYERS · REPEAT_BUYERS · REPEAT_RATE (ข้อ 12.1 · 12.2) · security_invoker · ไม่มี GRANT';

-- 1.3 รายการคุณภาพข้อมูล (ข้อ 12.3)
--     หมายเหตุผู้เขียน: ตัดแถว VISIT_UNRECORDED ที่รับทราบแล้ว (visits.unrecorded_ack_at IS NOT NULL) ออก
--     เพราะ api.acknowledge_unrecorded_visit (ข้อ 9.6) เป็นวิธีเดียวที่ "แก้" รายการนี้ได้หลังข้ามวัน (ข้อ 4.1)
--     คอลัมน์ owner_staff_id ของ LEAD_WITHOUT_OWNER ใช้ created_by (รายการไม่มี owner · ข้อ 8.0 scope O)
CREATE VIEW analytics.data_quality_issues WITH (security_invoker = true) AS
SELECT 'DUPLICATE_SUSPECTED'::text AS issue_code,
       'DUPLICATE_DECISION'::text  AS entity_type,
       d.id                        AS entity_id,
       d.customer_id,
       c.first_branch_id           AS branch_id,
       NULL::uuid                  AS owner_staff_id,
       d.created_at                AS detected_at
  FROM crm.duplicate_decisions d
  JOIN crm.customers c  ON c.id = d.customer_id           AND c.record_status = 'ACTIVE'
  JOIN crm.customers c2 ON c2.id = d.candidate_customer_id AND c2.record_status = 'ACTIVE'
 WHERE d.status = 'PENDING'
UNION ALL
SELECT 'MISSING_PHONE', 'CUSTOMER', c.id, c.id, c.first_branch_id, c.owner_staff_id, c.created_at
  FROM crm.customers c
 WHERE c.record_status = 'ACTIVE'
   AND c.first_channel_code IN ('WALK_IN', 'PHONE')
   AND NOT EXISTS (SELECT 1 FROM crm.customer_contacts cc
                    WHERE cc.customer_id = c.id AND cc.contact_type = 'PHONE' AND cc.is_active)
UNION ALL
SELECT 'INVALID_PHONE', 'CUSTOMER', c.id, c.id, c.first_branch_id, c.owner_staff_id, c.created_at
  FROM crm.customers c
 WHERE c.record_status = 'ACTIVE'
   AND EXISTS (SELECT 1 FROM crm.customer_contacts cc
                WHERE cc.customer_id = c.id AND cc.contact_type = 'PHONE' AND cc.is_active AND NOT cc.is_valid)
UNION ALL
SELECT 'LEAD_WITHOUT_OWNER', 'LEAD', l.id, l.customer_id, l.branch_id, l.created_by, l.created_at
  FROM crm.leads l
 WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
   AND l.owner_staff_id IS NULL
UNION ALL
SELECT 'LEAD_WITHOUT_OUTCOME', 'LEAD', l.id, l.customer_id, l.branch_id, l.owner_staff_id, l.created_at
  FROM crm.leads l
 WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
   AND l.created_at < app.clock() - make_interval(days => app.setting_int('dq.lead_without_outcome_days', 14))
UNION ALL
SELECT 'OVERDUE_FOLLOWUP', 'TASK', t.id, t.customer_id, t.branch_id, t.owner_staff_id, t.due_at
  FROM crm.tasks t
 WHERE t.task_type_code = 'FOLLOW_UP'
   AND t.status IN ('OPEN', 'IN_PROGRESS')
   AND t.due_at < app.bkk_ts(app.bangkok_date(app.clock()))
UNION ALL
SELECT 'INCOMPLETE_CUSTOMER', 'CUSTOMER', c.id, c.id, c.first_branch_id, c.owner_staff_id, c.created_at
  FROM crm.customers c
 WHERE c.record_status = 'ACTIVE'
   AND nullif(btrim(c.last_name), '') IS NULL
   AND c.province_code IS NULL
   AND NOT EXISTS (SELECT 1 FROM crm.leads l WHERE l.customer_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM crm.opportunities o WHERE o.customer_id = c.id AND o.interest_code IS NOT NULL)
UNION ALL
SELECT 'WON_WITHOUT_TRANSACTION', 'OPPORTUNITY', o.id, o.customer_id, o.branch_id, o.owner_staff_id, o.won_at
  FROM crm.opportunities o
 WHERE o.stage = 'WON'
   AND o.won_at < app.clock() - make_interval(days => app.setting_int('dq.won_without_txn_days', 3))
   AND NOT EXISTS (SELECT 1 FROM crm.transaction_refs t WHERE t.opportunity_id = o.id)
UNION ALL
SELECT 'VISIT_UNRECORDED', 'VISIT', v.id, v.customer_id, v.branch_id, v.owner_staff_id, v.started_at
  FROM crm.visits v
 WHERE v.outcome_code = 'UNRECORDED'
   AND v.unrecorded_ack_at IS NULL
   AND v.started_at >= app.bkk_ts(app.bangkok_date(app.clock()) - (app.setting_int('dq.visit_unrecorded_days', 7) - 1))
   AND v.started_at <  app.bkk_ts(app.bangkok_date(app.clock()) + 1);

COMMENT ON VIEW analytics.data_quality_issues IS
'รายการศูนย์คุณภาพข้อมูล 9 ชนิดตาม CANONICAL ข้อ 12.3 · คอลัมน์ (issue_code, entity_type, entity_id, customer_id, branch_id, owner_staff_id, detected_at) · '
'เกณฑ์วันอ่านจาก app.settings (dq.lead_without_outcome_days 14 · dq.won_without_txn_days 3 · dq.visit_unrecorded_days 7 · ข้อ 11.2) · '
'รายการระดับลูกค้าผูกสาขาด้วย first_branch_id (ข้อ 12.3) · LEAD_WITHOUT_OWNER ใช้ created_by เป็นคอลัมน์ผู้ผูก (ข้อ 8.0 scope O) · '
'หมายเหตุผู้เขียน: ตัด VISIT_UNRECORDED ที่ unrecorded_ack_at IS NOT NULL ออก (ข้อ 9.6 api.acknowledge_unrecorded_visit) · '
'security_invoker · ไม่มี GRANT (อ่านผ่าน api.list_data_quality_issues ตามสิทธิ์ data_quality.view)';


-- =====================================================================================
-- ส่วนที่ 2 — helper ของช่วงเวลา (CANONICAL ข้อ 1.2 · 12.0)
-- =====================================================================================

CREATE FUNCTION app.kpi_period(p_preset text, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (period_start timestamptz, period_end timestamptz, cmp_start timestamptz, cmp_end timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clock timestamptz := app.clock();
    v_d     date        := app.bangkok_date(app.clock());
    v_ms    date;                                   -- วันที่ 1 ของเดือนนี้
    v_pms   date;                                   -- วันที่ 1 ของเดือนก่อน
    v_qs    date;                                   -- วันแรกของไตรมาสนี้
    v_pqm   date;                                   -- เดือนเดียวกันของไตรมาสก่อน (วันที่ 1)
    v_len   integer;
BEGIN
    IF p_preset IS NULL THEN
        PERFORM app.api_invalid('p_preset ต้องไม่ว่าง (ข้อ 12.0)');
    END IF;

    CASE p_preset
        WHEN 'TODAY' THEN
            period_start := app.bkk_ts(v_d);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts(v_d - 7);
            cmp_end      := v_clock - interval '7 days';          -- ขอบบนเป็นเวลาเดียวกัน ใช้ < (ข้อ 12.0)
        WHEN 'YESTERDAY' THEN
            period_start := app.bkk_ts(v_d - 1);
            period_end   := app.bkk_ts(v_d);
            cmp_start    := app.bkk_ts(v_d - 8);
            cmp_end      := app.bkk_ts(v_d - 7);
        WHEN 'LAST_7_DAYS' THEN
            period_start := app.bkk_ts(v_d - 6);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts(v_d - 13);
            cmp_end      := app.bkk_ts(v_d - 6);
        WHEN 'THIS_WEEK' THEN                                      -- ISO week = จันทร์ [รอยืนยัน Q18]
            period_start := app.bkk_ts(date_trunc('week', v_d::timestamp)::date);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts(date_trunc('week', v_d::timestamp)::date - 7);
            cmp_end      := app.bkk_ts(v_d - 6);
        WHEN 'LAST_30_DAYS' THEN
            period_start := app.bkk_ts(v_d - 29);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts(v_d - 59);
            cmp_end      := app.bkk_ts(v_d - 29);
        WHEN 'THIS_MONTH' THEN
            v_ms  := date_trunc('month', v_d::timestamp)::date;
            v_pms := (v_ms - interval '1 month')::date;
            period_start := app.bkk_ts(v_ms);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts(v_pms);
            cmp_end      := app.bkk_ts(least(v_pms + (v_d - v_ms) + 1, v_ms));   -- ตัดที่สิ้นเดือนก่อน
        WHEN 'LAST_MONTH' THEN
            v_ms  := date_trunc('month', v_d::timestamp)::date;
            v_pms := (v_ms - interval '1 month')::date;
            period_start := app.bkk_ts(v_pms);
            period_end   := app.bkk_ts(v_ms);
            cmp_start    := app.bkk_ts((v_pms - interval '1 month')::date);
            cmp_end      := app.bkk_ts(v_pms);
        WHEN 'THIS_QUARTER' THEN                                   -- ไตรมาสปฏิทิน [รอยืนยัน Q18]
            v_qs  := date_trunc('quarter', v_d::timestamp)::date;
            v_pqm := (date_trunc('month', v_d::timestamp) - interval '3 months')::date;
            period_start := app.bkk_ts(v_qs);
            period_end   := app.bkk_ts(v_d + 1);
            cmp_start    := app.bkk_ts((v_qs - interval '3 months')::date);
            cmp_end      := app.bkk_ts(least(v_pqm + extract(day FROM v_d)::integer,
                                             (v_pqm + interval '1 month')::date));
        WHEN 'CUSTOM' THEN
            IF p_start IS NULL OR p_end IS NULL THEN
                PERFORM app.api_invalid('CUSTOM ต้องส่ง p_start และ p_end (ข้อ 12.0)');
            END IF;
            v_len := p_end - p_start;
            IF v_len < 1 OR v_len > 366 THEN
                PERFORM app.api_invalid('ช่วง CUSTOM ต้องยาว 1–366 วัน และ p_end เป็นขอบเปิด (ข้อ 12.0)');
            END IF;
            period_start := app.bkk_ts(p_start);
            period_end   := app.bkk_ts(p_end);
            cmp_start    := app.bkk_ts(p_start - v_len);
            cmp_end      := app.bkk_ts(p_start);
        ELSE
            PERFORM app.api_invalid('p_preset ไม่ถูกต้อง: ' || p_preset || ' (ข้อ 12.0)');
    END CASE;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION app.kpi_period(text, date, date) IS
'ขอบช่วงปัจจุบันและช่วงเปรียบเทียบของ preset (CANONICAL ข้อ 12.0) · ทุกช่วงเป็นครึ่งเปิด [start, end) ขอบวันเที่ยงคืน Asia/Bangkok · '
'คิดจาก app.clock() (ข้อ 1.2) · TODAY เทียบ [วันเดียวกันสัปดาห์ก่อน 00:00, app.clock() − 7 วัน) · '
'THIS_MONTH/THIS_QUARTER เทียบช่วงวันที่ตรงกันของเดือน/ไตรมาสก่อนและตัดที่สิ้นเดือนถ้าสั้นกว่า · '
'CUSTOM ใช้ p_start/p_end (p_end เป็นขอบเปิด · ยาว 1–366 วัน) · preset อื่นละเลย p_start/p_end (ข้อ 9.4.1) · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 3 — helper ของขอบเขตผู้เรียก (CANONICAL ข้อ 9.4.1 · 12.4)
-- =====================================================================================

CREATE FUNCTION app.kpi_scope(p_permission text, p_branch_ids uuid[])
RETURNS TABLE (sel_ids uuid[], full_ids uuid[], team_ids uuid[], own_ids uuid[], pair_keys text[], is_partial boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_any uuid[] := app.scope_branch_ids(p_permission, 'OWN');   -- สาขาที่มีสิทธิ์นี้ที่ scope ใดก็ได้
BEGIN
    IF p_branch_ids IS NULL THEN
        sel_ids := v_any;                                        -- "ทุกสาขา" = ทุกสาขาที่ผู้เรียกมีสิทธิ์ (ข้อ 9.4.1)
    ELSE
        sel_ids := ARRAY(SELECT x FROM unnest(v_any) x WHERE x = ANY (p_branch_ids) ORDER BY x);
    END IF;

    full_ids := ARRAY(SELECT x FROM unnest(app.scope_branch_ids(p_permission, 'BRANCH')) x
                       WHERE x = ANY (sel_ids) ORDER BY x);
    team_ids := ARRAY(SELECT x FROM unnest(app.scope_branch_ids(p_permission, 'TEAM')) x
                       WHERE x = ANY (sel_ids) AND NOT (x = ANY (full_ids)) ORDER BY x);
    own_ids  := ARRAY(SELECT x FROM unnest(sel_ids) x
                       WHERE NOT (x = ANY (full_ids)) AND NOT (x = ANY (team_ids)) ORDER BY x);
    pair_keys := coalesce((SELECT array_agg(tp.branch_id::text || ':' || tp.staff_id::text ORDER BY 1)
                             FROM app.team_scope_pairs(p_permission) tp), '{}'::text[]);
    is_partial := cardinality(team_ids) > 0 OR cardinality(own_ids) > 0;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION app.kpi_scope(text, uuid[]) IS
'แบ่งสาขาที่ขอออกตาม scope สูงสุดต่อสาขาสำหรับ KPI/รายงาน (CANONICAL ข้อ 9.4.1 · 12.4): sel_ids = p_branch_ids ∩ สาขาของสิทธิ์ '
'(p_branch_ids NULL = ทุกสาขาในสิทธิ์ · สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้งเงียบ ๆ) · full_ids = BRANCH/ORGANIZATION · team_ids = TEAM · own_ids = OWN · '
'pair_keys = ''branch:staff'' ของ app.team_scope_pairs · is_partial = มีสาขาที่เป็น TEAM/OWN → KPI ที่ไม่มีการผูกพนักงานคืน NULL (ข้อ 12.4) · ภายใน ไม่ GRANT';

CREATE FUNCTION app.kpi_in_scope(p_branch uuid, p_owner uuid, p_full uuid[], p_team uuid[], p_own uuid[],
                                 p_pairs text[], p_me uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT p_branch IS NOT NULL AND (
           p_branch = ANY (p_full)
        OR (p_branch = ANY (p_team) AND p_owner IS NOT NULL
            AND (p_branch::text || ':' || p_owner::text) = ANY (p_pairs))
        OR (p_branch = ANY (p_own) AND p_owner IS NOT NULL AND p_owner = p_me))
$$;

COMMENT ON FUNCTION app.kpi_in_scope(uuid, uuid, uuid[], uuid[], uuid[], text[], uuid) IS
'⟨scope(b, o)⟩ ของ KPI (CANONICAL ข้อ 9.4.1 · 12.4): สาขา BRANCH/ORG ผ่านทุกแถว · สาขา TEAM ผ่านเมื่อคู่ (สาขา, owner) '
'อยู่ใน app.team_scope_pairs · สาขา OWN ผ่านเมื่อ owner = ผู้เรียก · **ผูกด้วย owner เท่านั้น ไม่ใช้ created_by สำรอง** (ข้อ 12.4) · '
'แถวที่ owner ว่างจึงไม่ผ่าน TEAM/OWN · ภายใน ไม่ GRANT';

CREATE FUNCTION app.owner_teams(p_staff uuid, p_branch uuid)
RETURNS TABLE (team_id uuid, team_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT t.id, t.name_th
    FROM core.teams t
    JOIN core.team_members m ON m.team_id = t.id
                            AND m.staff_id = p_staff
                            AND m.valid_from <= now()
                            AND (m.valid_to IS NULL OR now() < m.valid_to)
    WHERE t.branch_id = p_branch
$$;

COMMENT ON FUNCTION app.owner_teams(uuid, uuid) IS
'ทีมปัจจุบันของ owner ในสาขาของแถว (CANONICAL ข้อ 7.1 · 12.4 "ทีมปัจจุบันของ owner") · ใช้จัดกลุ่ม p_group_by = ''TEAM'' · '
'owner ที่อยู่หลายทีมนับในทุกทีม (ข้อ 12.4) · owner ว่างหรือไม่อยู่ทีมใด → ไม่มีแถว → กลุ่ม NULL · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 4 — การปัดและการแสดงผล (CANONICAL ข้อ 1.3)
-- =====================================================================================

CREATE FUNCTION app.fmt_int(p_value numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE WHEN p_value IS NULL THEN NULL
                ELSE replace(btrim(to_char(round(p_value, 0), 'FM999,999,999,999,990')), '-', U&'\2212') END
$$;

CREATE FUNCTION app.fmt_money(p_value numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN NULL
        WHEN round(p_value, 2) = round(p_value, 0)
            THEN '฿' || replace(btrim(to_char(round(p_value, 0), 'FM999,999,999,999,990')), '-', U&'\2212')
        ELSE '฿' || replace(btrim(to_char(round(p_value, 2), 'FM999,999,999,999,990.00')), '-', U&'\2212')
    END
$$;

CREATE FUNCTION app.fmt_rate(p_ratio numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE WHEN p_ratio IS NULL THEN U&'\2013'
                ELSE replace(btrim(to_char(round(100 * p_ratio, 1), 'FM999,999,990.0')), '-', U&'\2212') || '%' END
$$;

CREATE FUNCTION app.fmt_delta_pct(p_cur numeric, p_prev numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE
        WHEN p_cur IS NULL OR p_prev IS NULL OR p_prev = 0 THEN U&'\2013'
        ELSE (CASE WHEN round(100 * (p_cur - p_prev) / p_prev, 0) > 0 THEN '+'
                   WHEN round(100 * (p_cur - p_prev) / p_prev, 0) < 0 THEN U&'\2212'
                   ELSE '' END)
             || btrim(to_char(abs(round(100 * (p_cur - p_prev) / p_prev, 0)), 'FM999,999,990')) || '%'
    END
$$;

CREATE FUNCTION app.fmt_delta_pp(p_cur_ratio numeric, p_prev_ratio numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE
        WHEN p_cur_ratio IS NULL OR p_prev_ratio IS NULL THEN U&'\2013'
        ELSE (CASE WHEN round(100 * (p_cur_ratio - p_prev_ratio), 1) > 0 THEN '+'
                   WHEN round(100 * (p_cur_ratio - p_prev_ratio), 1) < 0 THEN U&'\2212'
                   ELSE '' END)
             || btrim(to_char(abs(round(100 * (p_cur_ratio - p_prev_ratio), 1)), 'FM999,999,990.0')) || ' pp'
    END
$$;

COMMENT ON FUNCTION app.fmt_int(numeric)   IS 'จำนวนคั่นหลักพัน ''3,125'' (ข้อ 1.3) · ค่าลบใช้เครื่องหมายลบ U+2212';
COMMENT ON FUNCTION app.fmt_money(numeric) IS 'เงิน ''฿3,332,700'' · แสดงสตางค์ 2 ตำแหน่งเฉพาะเมื่อไม่ใช่จำนวนเต็ม ''฿28,900.50'' (ข้อ 1.3)';
COMMENT ON FUNCTION app.fmt_rate(numeric)  IS 'อัตราจากสัดส่วน 0–1 → 1 ตำแหน่งทศนิยมเสมอ ''24.1%'' ''100.0%'' · NULL → ''–'' (ข้อ 1.3)';
COMMENT ON FUNCTION app.fmt_delta_pct(numeric, numeric) IS
'ส่วนต่างของจำนวน/เงินเป็น % จำนวนเต็ม ''+12%'' ''−5%'' · ช่วงก่อนหน้าเป็น 0 หรือ NULL → ''–'' และไม่แสดงป้าย · ผลเป็นศูนย์ → ''0%'' (ข้อ 1.3)';
COMMENT ON FUNCTION app.fmt_delta_pp(numeric, numeric) IS
'ส่วนต่างของอัตราเป็น pp 1 ตำแหน่ง ''+2.1 pp'' · คำนวณจากอัตราที่ยังไม่ปัดแล้วค่อยปัด (ข้อ 1.3) · ไม่มีค่าก่อนหน้า → ''–''';

CREATE FUNCTION app.kpi_rate(p_num numeric, p_den numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE WHEN p_num IS NULL OR p_den IS NULL OR p_den = 0 THEN NULL ELSE p_num / p_den END
$$;

COMMENT ON FUNCTION app.kpi_rate(numeric, numeric) IS
'สัดส่วนที่ยังไม่ปัด · ตัวตั้งหรือตัวหารเป็น NULL หรือตัวหาร 0 → NULL (แสดง ''–'' · CANONICAL ข้อ 1.3 · 9.4.1)';

CREATE FUNCTION app.kpi_display(p_kind text, p_value numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE
        WHEN p_value IS NULL     THEN U&'\2013'
        WHEN p_kind = 'MONEY'    THEN app.fmt_money(p_value)
        WHEN p_kind = 'RATE'     THEN app.fmt_rate(p_value)
        WHEN p_kind = 'MINUTES'  THEN app.fmt_int(p_value) || ' นาที'
        ELSE app.fmt_int(p_value)
    END
$$;


-- =====================================================================================
-- ส่วนที่ 5 — ที่เก็บค่าระหว่างคำนวณ (map: group_key → {cur, prev} → measure)
-- =====================================================================================

CREATE FUNCTION app.kpi_group(p jsonb, p_gk text)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT jsonb_set(coalesce(p, '{}'::jsonb), ARRAY[coalesce(p_gk, '')],
                     coalesce(p -> coalesce(p_gk, ''),
                              jsonb_build_object('cur', '{}'::jsonb, 'prev', '{}'::jsonb)), true)
$$;

CREATE FUNCTION app.kpi_put(p jsonb, p_gk text, p_side text, p_key text, p_val numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT jsonb_set(app.kpi_group(p, p_gk), ARRAY[coalesce(p_gk, ''), p_side, p_key],
                     CASE WHEN p_val IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_val) END, true)
$$;

CREATE FUNCTION app.kpi_get(p jsonb, p_gk text, p_side text, p_key text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT CASE WHEN jsonb_typeof(p #> ARRAY[coalesce(p_gk, ''), p_side, p_key]) = 'number'
                THEN (p #>> ARRAY[coalesce(p_gk, ''), p_side, p_key])::numeric END
$$;

COMMENT ON FUNCTION app.kpi_group(jsonb, text) IS 'สร้างกลุ่มใน map ของ app.kpi_compute ถ้ายังไม่มี (คีย์ '''' = กลุ่ม NULL) · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.kpi_put(jsonb, text, text, text, numeric)  IS 'เก็บค่า measure ลง map ของ app.kpi_compute · ภายใน ไม่ GRANT';
COMMENT ON FUNCTION app.kpi_get(jsonb, text, text, text)           IS 'อ่านค่า measure จาก map ของ app.kpi_compute (ไม่มี/ไม่ใช่ตัวเลข → NULL) · ภายใน ไม่ GRANT';

CREATE FUNCTION app.kpi_row(p_code text, p_gk text, p_label text, p_kind text,
                            p_value numeric, p_prev numeric DEFAULT NULL,
                            p_num numeric DEFAULT NULL, p_den numeric DEFAULT NULL,
                            p_target boolean DEFAULT NULL, p_extra jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
    SELECT jsonb_build_object(
        'code',           p_code,
        'group_key',      CASE WHEN coalesce(p_gk, '') = '' THEN NULL ELSE p_gk END,
        'group_label',    p_label,
        'kind',           p_kind,
        'value',          p_value,
        'numerator',      p_num,
        'denominator',    p_den,
        'prev_value',     p_prev,
        'display',        app.kpi_display(p_kind, p_value),
        'change_display', CASE WHEN p_kind = 'RATE' THEN app.fmt_delta_pp(p_value, p_prev)
                               ELSE app.fmt_delta_pct(p_value, p_prev) END,
        'target_met',     p_target,
        'extra',          p_extra)
$$;

COMMENT ON FUNCTION app.kpi_row(text, text, text, text, numeric, numeric, numeric, numeric, boolean, jsonb) IS
'หนึ่งแถวผลลัพธ์ของ api.get_kpis: code · group_key · group_label · kind · value (ดิบ · อัตราเป็นสัดส่วน 0–1) · numerator · denominator · '
'prev_value · display · change_display (ปัดตามข้อ 1.3) · target_met (เทียบค่าไม่ปัด) · extra · ภายใน ไม่ GRANT';


-- =====================================================================================
-- ส่วนที่ 6 — app.kpi_compute : คำนวณ KPI ทุกตัวของข้อ 12.1–12.3 ในครั้งเดียว
-- =====================================================================================

CREATE FUNCTION app.kpi_compute(p_permission text, p_preset text, p_start date, p_end date,
                                p_branch_ids uuid[], p_group_by text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_dims constant text[][] := ARRAY[
        ['VISITS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['WALKIN_VISITS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['IDENTIFIED_VISITS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['UNIQUE_CUSTOMERS','COUNT','NONE,BRANCH,CHANNEL'],
        ['NEW_CUSTOMERS','COUNT','NONE,BRANCH,CHANNEL'],
        ['RETURNING_CUSTOMERS','COUNT','NONE,BRANCH,CHANNEL'],
        ['LEADS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['OPPORTUNITIES','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['SALES','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['SALES_AMOUNT','MONEY','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['LOST_OPPORTUNITIES','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['LOST_LEADS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['LOST_TOTAL','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['BUYERS','COUNT','NONE,BRANCH'],
        ['REPEAT_BUYERS','COUNT','NONE,BRANCH'],
        ['OPEN_FOLLOWUP_CUSTOMERS','COUNT','NONE,BRANCH,TEAM,STAFF'],
        ['OPEN_LEADS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL,STATUS'],
        ['OPEN_OPPORTUNITIES','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL,STATUS'],
        ['OPEN_PIPELINE_AMOUNT','MONEY','NONE,BRANCH,TEAM,STAFF,CHANNEL,STATUS'],
        ['WON_LAST_7_DAYS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['WON_LAST_7_DAYS_AMOUNT','MONEY','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['TASKS_TODAY','COUNT','NONE,BRANCH,TEAM,STAFF'],
        ['TASKS_OVERDUE','COUNT','NONE,BRANCH,TEAM,STAFF'],
        ['OPEN_VISITS','COUNT','NONE,BRANCH,TEAM,STAFF,CHANNEL,STATUS'],
        ['LEAD_RATE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['OPPORTUNITY_RATE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['CLOSE_RATE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['LOST_RATE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['CONV_LEAD_TO_SALE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['CONV_VISIT_TO_SALE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['WALKIN_CONVERSION','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['CAPTURE_RATE','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['REPEAT_RATE','RATE','NONE,BRANCH'],
        ['LEAD_RESPONSE_MIN','MINUTES','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['FOLLOWUP_COMPLETION','RATE','NONE,BRANCH,TEAM,STAFF'],
        ['OUTCOME_COMPLETION','RATE','NONE,BRANCH,TEAM,STAFF,CHANNEL'],
        ['DUPLICATE_RATE','RATE','NONE,BRANCH'],
        ['MISSING_REQUIRED_RATE','RATE','NONE,BRANCH']];
    v_me       uuid        := app.current_staff_id();
    v_clock    timestamptz := app.clock();
    v_today    timestamptz;
    v_tomorrow timestamptz;
    v_w7s      timestamptz;
    v_p        record;
    v_sc       record;
    v_full     uuid[];
    v_team     uuid[];
    v_own      uuid[];
    v_pairs    text[];
    v_attr     boolean;
    v_m        jsonb := '{}'::jsonb;
    v_rows     jsonb := '[]'::jsonb;
    v_groups   text[];
    v_side     text;
    v_qs       timestamptz;
    v_qe       timestamptz;
    v_gk       text;
    v_lbl      text;
    r          record;
    i          integer;
    -- ค่าอ่านซ้ำในลูปกลุ่ม
    c_vis  numeric; c_wal numeric; c_idn numeric; c_cls numeric; c_okc numeric;
    p_vis  numeric; p_wal numeric; p_idn numeric; p_cls numeric; p_okc numeric;
    c_lead numeric; c_lol numeric; c_opp numeric; c_sal numeric; c_sam numeric; c_saw numeric; c_loo numeric;
    p_lead numeric; p_lol numeric; p_opp numeric; p_sal numeric; p_sam numeric; p_saw numeric; p_loo numeric;
    c_uni  numeric; c_new numeric; c_ret numeric; c_buy numeric; c_rep numeric;
    p_uni  numeric; p_new numeric; p_ret numeric; p_buy numeric; p_rep numeric;
    c_fun  numeric; c_fud numeric; p_fun numeric; p_fud numeric;
BEGIN
    IF p_group_by IS NULL OR p_group_by NOT IN ('NONE', 'BRANCH', 'TEAM', 'STAFF', 'CHANNEL', 'STATUS') THEN
        PERFORM app.api_invalid('p_group_by ต้องเป็น NONE · BRANCH · TEAM · STAFF · CHANNEL · STATUS (ข้อ 9.4.1)');
    END IF;

    SELECT * INTO v_p  FROM app.kpi_period(p_preset, p_start, p_end);
    SELECT * INTO v_sc FROM app.kpi_scope(p_permission, p_branch_ids);

    IF cardinality(v_sc.sel_ids) = 0 THEN
        PERFORM app.api_denied('ไม่มีสาขาที่คุณมีสิทธิ์ ' || p_permission || ' ในรายการที่ขอ (ข้อ 9.4.1)');
    END IF;

    v_full  := v_sc.full_ids;
    v_team  := v_sc.team_ids;
    v_own   := v_sc.own_ids;
    v_pairs := v_sc.pair_keys;
    v_attr  := NOT v_sc.is_partial;                 -- KPI ที่ไม่มีการผูกพนักงานคำนวณได้เฉพาะเมื่อทุกสาขาเป็น B/G (ข้อ 12.4)

    v_today    := app.bkk_ts(app.bangkok_date(v_clock));
    v_tomorrow := app.bkk_ts(app.bangkok_date(v_clock) + 1);
    v_w7s      := app.bkk_ts(app.bangkok_date(v_clock) - 6);          -- "7 วันล่าสุด" (ข้อ 1.2)

    -- กลุ่มตั้งต้น: NONE มีกลุ่มเดียว · BRANCH มีทุกสาขาที่ขอ (สาขาที่ไม่มีข้อมูลได้แถวศูนย์)
    IF p_group_by = 'NONE' THEN
        v_m := app.kpi_group(v_m, '');
    ELSIF p_group_by = 'BRANCH' THEN
        FOR r IN SELECT x AS b FROM unnest(v_sc.sel_ids) x LOOP
            v_m := app.kpi_group(v_m, r.b::text);
        END LOOP;
    END IF;

    -- ---------------------------------------------------------------------------------
    -- 6.1 measure ตามช่วงเวลา (คำนวณสองรอบ: ช่วงปัจจุบัน · ช่วงเปรียบเทียบ)
    -- ---------------------------------------------------------------------------------
    FOREACH v_side IN ARRAY ARRAY['cur', 'prev'] LOOP
        IF v_side = 'cur' THEN v_qs := v_p.period_start; v_qe := v_p.period_end;
        ELSE                   v_qs := v_p.cmp_start;    v_qe := v_p.cmp_end;
        END IF;

        -- visits (ข้อ 12.1 VISITS · WALKIN_VISITS · IDENTIFIED_VISITS · ข้อ 12.2 OUTCOME_COMPLETION)
        IF p_group_by <> 'STATUS' THEN
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH'  THEN v.branch_id::text
                         WHEN 'STAFF'   THEN v.owner_staff_id::text
                         WHEN 'TEAM'    THEN tm.team_id::text
                         WHEN 'CHANNEL' THEN v.channel_code
                         ELSE '' END                                                            AS gk,
                       count(*)::numeric                                                        AS n,
                       count(*) FILTER (WHERE v.channel_code = 'WALK_IN')::numeric              AS w,
                       count(*) FILTER (WHERE v.customer_id IS NOT NULL)::numeric               AS idn,
                       count(*) FILTER (WHERE v.status IN ('COMPLETED', 'LEFT'))::numeric       AS cls,
                       count(*) FILTER (WHERE v.status IN ('COMPLETED', 'LEFT')
                                          AND v.outcome_code <> 'UNRECORDED')::numeric          AS okc
                FROM crm.visits v
                LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN v.owner_staff_id END, v.branch_id) tm ON true
                WHERE v.status <> 'CANCELLED'
                  AND v.started_at >= v_qs AND v.started_at < v_qe
                  AND app.kpi_in_scope(v.branch_id, v.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'VIS_N',   r.n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'VIS_W',   r.w);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'VIS_IDN', r.idn);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'VIS_CLS', r.cls);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'VIS_OK',  r.okc);
            END LOOP;
        END IF;

        -- leads (ข้อ 12.1 LEADS · LOST_LEADS)
        IF p_group_by <> 'STATUS' THEN
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH'  THEN l.branch_id::text
                         WHEN 'STAFF'   THEN l.owner_staff_id::text
                         WHEN 'TEAM'    THEN tm.team_id::text
                         WHEN 'CHANNEL' THEN l.channel_code
                         ELSE '' END                                                                       AS gk,
                       count(*) FILTER (WHERE l.created_at >= v_qs AND l.created_at < v_qe)::numeric       AS lead_n,
                       count(*) FILTER (WHERE l.status = 'LOST'
                                          AND l.closed_at >= v_qs AND l.closed_at < v_qe)::numeric         AS lost_n
                FROM crm.leads l
                LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN l.owner_staff_id END, l.branch_id) tm ON true
                WHERE ((l.created_at >= v_qs AND l.created_at < v_qe)
                    OR (l.status = 'LOST' AND l.closed_at >= v_qs AND l.closed_at < v_qe))
                  AND app.kpi_in_scope(l.branch_id, l.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LEAD_N',     r.lead_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LOST_LEAD',  r.lost_n);
            END LOOP;

            -- LEAD_RESPONSE_MIN (ข้อ 12.2) · ฐาน = lead ช่องทางข้อความ (ref.channels.is_live = false)
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH'  THEN l.branch_id::text
                         WHEN 'STAFF'   THEN l.owner_staff_id::text
                         WHEN 'TEAM'    THEN tm.team_id::text
                         WHEN 'CHANNEL' THEN l.channel_code
                         ELSE '' END                                                          AS gk,
                       count(*) FILTER (WHERE l.first_contacted_at IS NOT NULL)::numeric      AS base_n,
                       count(*) FILTER (WHERE l.first_contacted_at IS NULL)::numeric          AS nc_n,
                       round((percentile_cont(0.5) WITHIN GROUP (
                                 ORDER BY extract(epoch FROM (l.first_contacted_at - l.created_at)) / 60))::numeric)
                                                                                              AS med
                FROM crm.leads l
                JOIN ref.channels ch ON ch.code = l.channel_code AND ch.is_live = false
                LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN l.owner_staff_id END, l.branch_id) tm ON true
                WHERE l.created_at >= v_qs AND l.created_at < v_qe
                  AND app.kpi_in_scope(l.branch_id, l.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LR_BASE', r.base_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LR_NC',   r.nc_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LR_MED',  r.med);
            END LOOP;
        END IF;

        -- opportunities (ข้อ 12.1 OPPORTUNITIES · SALES · SALES_AMOUNT · LOST_OPPORTUNITIES · ข้อ 12.2 WALKIN_CONVERSION)
        IF p_group_by <> 'STATUS' THEN
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH'  THEN o.branch_id::text
                         WHEN 'STAFF'   THEN o.owner_staff_id::text
                         WHEN 'TEAM'    THEN tm.team_id::text
                         WHEN 'CHANNEL' THEN o.origin_channel_code
                         ELSE '' END                                                                        AS gk,
                       count(*) FILTER (WHERE o.created_at >= v_qs AND o.created_at < v_qe)::numeric        AS opp_n,
                       count(*) FILTER (WHERE o.stage = 'WON'
                                          AND o.won_at >= v_qs AND o.won_at < v_qe)::numeric                AS sale_n,
                       coalesce(sum(o.won_amount) FILTER (WHERE o.stage = 'WON'
                                          AND o.won_at >= v_qs AND o.won_at < v_qe), 0)::numeric            AS sale_amt,
                       count(*) FILTER (WHERE o.stage = 'WON' AND o.won_at >= v_qs AND o.won_at < v_qe
                                          AND o.origin_channel_code = 'WALK_IN')::numeric                   AS sale_w,
                       count(*) FILTER (WHERE o.stage = 'LOST'
                                          AND o.closed_at >= v_qs AND o.closed_at < v_qe)::numeric          AS lost_n
                FROM crm.opportunities o
                LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN o.owner_staff_id END, o.branch_id) tm ON true
                WHERE ((o.created_at >= v_qs AND o.created_at < v_qe)
                    OR (o.stage = 'WON'  AND o.won_at    >= v_qs AND o.won_at    < v_qe)
                    OR (o.stage = 'LOST' AND o.closed_at >= v_qs AND o.closed_at < v_qe))
                  AND app.kpi_in_scope(o.branch_id, o.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'OPP_N',    r.opp_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'SALE_N',   r.sale_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'SALE_AMT', r.sale_amt);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'SALE_W',   r.sale_w);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'LOST_OPP', r.lost_n);
            END LOOP;
        END IF;

        -- FOLLOWUP_COMPLETION (ข้อ 12.2) · ระยะผ่อนผัน 24 ชม. เป็นค่าคงที่ของสูตร
        IF p_group_by IN ('NONE', 'BRANCH', 'TEAM', 'STAFF') THEN
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH' THEN t.branch_id::text
                         WHEN 'STAFF'  THEN t.owner_staff_id::text
                         WHEN 'TEAM'   THEN tm.team_id::text
                         ELSE '' END                                                                 AS gk,
                       count(*) FILTER (WHERE t.status = 'DONE'
                                          AND t.completed_at <= t.due_at + interval '24 hours')::numeric AS num,
                       count(*)::numeric                                                             AS den
                FROM crm.tasks t
                LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN t.owner_staff_id END, t.branch_id) tm ON true
                WHERE t.task_type_code = 'FOLLOW_UP'
                  AND t.due_at >= v_qs AND t.due_at < v_qe
                  AND t.status <> 'CANCELLED'
                  AND NOT (t.status <> 'DONE' AND t.due_at + interval '24 hours' > v_clock)
                  AND app.kpi_in_scope(t.branch_id, t.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'FU_NUM', r.num);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'FU_DEN', r.den);
            END LOOP;
        END IF;

        -- UNIQUE / NEW / RETURNING (ข้อ 3.1 · 12.1) · ไม่มีการผูกพนักงาน → เฉพาะสาขา B/G
        IF v_attr AND p_group_by IN ('NONE', 'BRANCH', 'CHANNEL') THEN
            FOR r IN
                SELECT CASE p_group_by
                         WHEN 'BRANCH'  THEN act.branch_id::text
                         WHEN 'CHANNEL' THEN c.first_channel_code
                         ELSE '' END                                                                  AS gk,
                       count(DISTINCT c.id)::numeric                                                  AS uniq_n,
                       count(DISTINCT c.id) FILTER (WHERE c.first_seen_at >= v_qs
                                                      AND c.first_seen_at <  v_qe)::numeric           AS new_n,
                       count(DISTINCT c.id) FILTER (WHERE c.first_seen_at <  v_qs)::numeric           AS ret_n
                FROM (SELECT DISTINCT a.customer_id, a.branch_id
                        FROM analytics.customer_activity a
                       WHERE a.occurred_at >= v_qs AND a.occurred_at < v_qe
                         AND a.customer_id IS NOT NULL
                         AND a.branch_id = ANY (v_full)) act
                JOIN crm.customers c ON c.id = act.customer_id
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'UNI_N', r.uniq_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'NEW_N', r.new_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'RET_N', r.ret_n);
            END LOOP;
        END IF;

        -- BUYERS / REPEAT_BUYERS (ข้อ 3.1 · 12.1) · "≥ 2 ครั้ง" นับเหตุการณ์ทุกสาขาของลูกค้าที่ < ขอบบนของช่วง
        IF v_attr AND p_group_by IN ('NONE', 'BRANCH') THEN
            FOR r IN
                WITH b AS (
                    SELECT DISTINCT pe.customer_id, pe.branch_id
                      FROM analytics.purchase_events pe
                     WHERE pe.purchased_at >= v_qs AND pe.purchased_at < v_qe
                       AND pe.branch_id = ANY (v_full)
                ), cnt AS (
                    SELECT x.customer_id, count(*) AS n
                      FROM analytics.purchase_events x
                     WHERE x.purchased_at < v_qe
                       AND x.customer_id IN (SELECT b2.customer_id FROM b b2)
                     GROUP BY 1
                )
                SELECT CASE p_group_by WHEN 'BRANCH' THEN b.branch_id::text ELSE '' END   AS gk,
                       count(DISTINCT b.customer_id)::numeric                             AS buy_n,
                       count(DISTINCT b.customer_id) FILTER (WHERE cnt.n >= 2)::numeric   AS rep_n
                FROM b JOIN cnt ON cnt.customer_id = b.customer_id
                GROUP BY 1
            LOOP
                v_m := app.kpi_put(v_m, r.gk, v_side, 'BUY_N', r.buy_n);
                v_m := app.kpi_put(v_m, r.gk, v_side, 'REP_N', r.rep_n);
            END LOOP;
        END IF;
    END LOOP;

    -- ---------------------------------------------------------------------------------
    -- 6.2 measure "ณ app.clock()" (ไม่มีช่วงเปรียบเทียบ · ข้อ 12.1)
    -- ---------------------------------------------------------------------------------
    FOR r IN
        SELECT CASE p_group_by
                 WHEN 'BRANCH'  THEN l.branch_id::text
                 WHEN 'STAFF'   THEN l.owner_staff_id::text
                 WHEN 'TEAM'    THEN tm.team_id::text
                 WHEN 'CHANNEL' THEN l.channel_code
                 WHEN 'STATUS'  THEN l.status::text
                 ELSE '' END   AS gk,
               count(*)::numeric AS n
        FROM crm.leads l
        LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN l.owner_staff_id END, l.branch_id) tm ON true
        WHERE l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
          AND app.kpi_in_scope(l.branch_id, l.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
        GROUP BY 1
    LOOP
        v_m := app.kpi_put(v_m, r.gk, 'cur', 'OPEN_LEAD', r.n);
    END LOOP;

    FOR r IN
        SELECT CASE p_group_by
                 WHEN 'BRANCH'  THEN o.branch_id::text
                 WHEN 'STAFF'   THEN o.owner_staff_id::text
                 WHEN 'TEAM'    THEN tm.team_id::text
                 WHEN 'CHANNEL' THEN o.origin_channel_code
                 WHEN 'STATUS'  THEN o.stage::text
                 ELSE '' END                              AS gk,
               count(*)::numeric                          AS n,
               coalesce(sum(o.expected_amount), 0)::numeric AS amt
        FROM crm.opportunities o
        LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN o.owner_staff_id END, o.branch_id) tm ON true
        WHERE o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
          AND app.kpi_in_scope(o.branch_id, o.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
        GROUP BY 1
    LOOP
        v_m := app.kpi_put(v_m, r.gk, 'cur', 'OPEN_OPP', r.n);
        v_m := app.kpi_put(v_m, r.gk, 'cur', 'OPEN_AMT', r.amt);
    END LOOP;

    FOR r IN
        SELECT CASE p_group_by
                 WHEN 'BRANCH'  THEN v.branch_id::text
                 WHEN 'STAFF'   THEN v.owner_staff_id::text
                 WHEN 'TEAM'    THEN tm.team_id::text
                 WHEN 'CHANNEL' THEN v.channel_code
                 WHEN 'STATUS'  THEN v.status::text
                 ELSE '' END   AS gk,
               count(*)::numeric AS n
        FROM crm.visits v
        LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN v.owner_staff_id END, v.branch_id) tm ON true
        WHERE v.status IN ('WAITING', 'IN_SERVICE')
          AND app.kpi_in_scope(v.branch_id, v.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
        GROUP BY 1
    LOOP
        v_m := app.kpi_put(v_m, r.gk, 'cur', 'OPEN_VIS', r.n);
    END LOOP;

    IF p_group_by <> 'STATUS' THEN
        FOR r IN
            SELECT CASE p_group_by
                     WHEN 'BRANCH'  THEN o.branch_id::text
                     WHEN 'STAFF'   THEN o.owner_staff_id::text
                     WHEN 'TEAM'    THEN tm.team_id::text
                     WHEN 'CHANNEL' THEN o.origin_channel_code
                     ELSE '' END                          AS gk,
                   count(*)::numeric                      AS n,
                   coalesce(sum(o.won_amount), 0)::numeric AS amt
            FROM crm.opportunities o
            LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN o.owner_staff_id END, o.branch_id) tm ON true
            WHERE o.stage = 'WON' AND o.won_at >= v_w7s AND o.won_at < v_tomorrow
              AND app.kpi_in_scope(o.branch_id, o.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
            GROUP BY 1
        LOOP
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'WON7_N',   r.n);
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'WON7_AMT', r.amt);
        END LOOP;
    END IF;

    IF p_group_by IN ('NONE', 'BRANCH', 'TEAM', 'STAFF') THEN
        FOR r IN
            SELECT CASE p_group_by
                     WHEN 'BRANCH' THEN t.branch_id::text
                     WHEN 'STAFF'  THEN t.owner_staff_id::text
                     WHEN 'TEAM'   THEN tm.team_id::text
                     ELSE '' END                                                            AS gk,
                   count(*) FILTER (WHERE t.due_at >= v_today AND t.due_at < v_tomorrow)::numeric AS today_n,
                   count(*) FILTER (WHERE t.due_at <  v_today)::numeric                     AS over_n
            FROM crm.tasks t
            LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN t.owner_staff_id END, t.branch_id) tm ON true
            WHERE t.status IN ('OPEN', 'IN_PROGRESS')
              AND app.kpi_in_scope(t.branch_id, t.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
            GROUP BY 1
        LOOP
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'TASK_TODAY', r.today_n);
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'TASK_OVER',  r.over_n);
        END LOOP;

        FOR r IN
            SELECT CASE p_group_by
                     WHEN 'BRANCH' THEN t.branch_id::text
                     WHEN 'STAFF'  THEN t.owner_staff_id::text
                     WHEN 'TEAM'   THEN tm.team_id::text
                     ELSE '' END                                                                AS gk,
                   count(DISTINCT coalesce(t.customer_id, l.customer_id, o.customer_id))::numeric AS n
            FROM crm.tasks t
            LEFT JOIN crm.leads l         ON l.id = t.lead_id
            LEFT JOIN crm.opportunities o ON o.id = t.opportunity_id
            LEFT JOIN LATERAL app.owner_teams(CASE WHEN p_group_by = 'TEAM' THEN t.owner_staff_id END, t.branch_id) tm ON true
            WHERE t.task_type_code = 'FOLLOW_UP'
              AND t.status IN ('OPEN', 'IN_PROGRESS')
              AND app.kpi_in_scope(t.branch_id, t.owner_staff_id, v_full, v_team, v_own, v_pairs, v_me)
            GROUP BY 1
        LOOP
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'OPEN_FU_CUST', r.n);
        END LOOP;
    END IF;

    -- DUPLICATE_RATE · MISSING_REQUIRED_RATE (ข้อ 12.3) · รายสาขาใช้ first_branch_id ทั้งตัวตั้งและตัวหาร (ข้อ 12.4)
    IF v_attr AND p_group_by IN ('NONE', 'BRANCH') THEN
        FOR r IN
            SELECT CASE p_group_by WHEN 'BRANCH' THEN c.first_branch_id::text ELSE '' END AS gk,
                   count(*)::numeric AS n
            FROM crm.customers c
            WHERE c.record_status = 'ACTIVE' AND c.first_branch_id = ANY (v_full)
            GROUP BY 1
        LOOP
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'DQ_DEN', r.n);
        END LOOP;
        FOR r IN
            SELECT CASE p_group_by WHEN 'BRANCH' THEN q.branch_id::text ELSE '' END AS gk,
                   count(DISTINCT q.customer_id) FILTER (WHERE q.issue_code = 'DUPLICATE_SUSPECTED')::numeric AS dup_n,
                   count(DISTINCT q.customer_id) FILTER (WHERE q.issue_code IN ('MISSING_PHONE',
                                                                                'INCOMPLETE_CUSTOMER'))::numeric AS miss_n
            FROM analytics.data_quality_issues q
            WHERE q.issue_code IN ('DUPLICATE_SUSPECTED', 'MISSING_PHONE', 'INCOMPLETE_CUSTOMER')
              AND q.branch_id = ANY (v_full)
            GROUP BY 1
        LOOP
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'DUP_NUM',  r.dup_n);
            v_m := app.kpi_put(v_m, r.gk, 'cur', 'MISS_NUM', r.miss_n);
        END LOOP;
    END IF;

    -- ---------------------------------------------------------------------------------
    -- 6.3 ประกอบแถวผลลัพธ์
    -- ---------------------------------------------------------------------------------
    SELECT coalesce(array_agg(x.k ORDER BY (x.k = '') DESC, x.sk NULLS FIRST, x.k), '{}'::text[])
      INTO v_groups
      FROM (SELECT k,
                   CASE p_group_by
                     WHEN 'BRANCH'  THEN (SELECT b.code       FROM core.branches b       WHERE b.id   = nullif(k, '')::uuid)
                     WHEN 'STAFF'   THEN (SELECT s.staff_code FROM core.staff_profiles s WHERE s.id   = nullif(k, '')::uuid)
                     WHEN 'TEAM'    THEN (SELECT t.code       FROM core.teams t          WHERE t.id   = nullif(k, '')::uuid)
                     WHEN 'CHANNEL' THEN (SELECT lpad(ch.sort_order::text, 4, '0') FROM ref.channels ch WHERE ch.code = nullif(k, ''))
                     ELSE k END AS sk
              FROM jsonb_object_keys(v_m) AS k) x;

    FOREACH v_gk IN ARRAY v_groups LOOP
        v_lbl := CASE p_group_by
                   WHEN 'BRANCH'  THEN (SELECT b.name_th      FROM core.branches b       WHERE b.id   = nullif(v_gk, '')::uuid)
                   WHEN 'STAFF'   THEN (SELECT s.display_name FROM core.staff_profiles s WHERE s.id   = nullif(v_gk, '')::uuid)
                   WHEN 'TEAM'    THEN (SELECT t.name_th      FROM core.teams t          WHERE t.id   = nullif(v_gk, '')::uuid)
                   WHEN 'CHANNEL' THEN (SELECT ch.label_th    FROM ref.channels ch       WHERE ch.code = nullif(v_gk, ''))
                   ELSE NULL END;

        c_vis := coalesce(app.kpi_get(v_m, v_gk, 'cur', 'VIS_N'), 0);
        c_wal := coalesce(app.kpi_get(v_m, v_gk, 'cur', 'VIS_W'), 0);
        c_idn := coalesce(app.kpi_get(v_m, v_gk, 'cur', 'VIS_IDN'), 0);
        c_cls := coalesce(app.kpi_get(v_m, v_gk, 'cur', 'VIS_CLS'), 0);
        c_okc := coalesce(app.kpi_get(v_m, v_gk, 'cur', 'VIS_OK'), 0);
        p_vis := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'VIS_N'), 0);
        p_wal := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'VIS_W'), 0);
        p_idn := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'VIS_IDN'), 0);
        p_cls := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'VIS_CLS'), 0);
        p_okc := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'VIS_OK'), 0);
        c_lead := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'LEAD_N'), 0);
        p_lead := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'LEAD_N'), 0);
        c_lol  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'LOST_LEAD'), 0);
        p_lol  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'LOST_LEAD'), 0);
        c_opp  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'OPP_N'), 0);
        p_opp  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'OPP_N'), 0);
        c_sal  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'SALE_N'), 0);
        p_sal  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'SALE_N'), 0);
        c_sam  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'SALE_AMT'), 0);
        p_sam  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'SALE_AMT'), 0);
        c_saw  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'SALE_W'), 0);
        p_saw  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'SALE_W'), 0);
        c_loo  := coalesce(app.kpi_get(v_m, v_gk, 'cur',  'LOST_OPP'), 0);
        p_loo  := coalesce(app.kpi_get(v_m, v_gk, 'prev', 'LOST_OPP'), 0);
        c_fun  := app.kpi_get(v_m, v_gk, 'cur',  'FU_NUM');
        c_fud  := app.kpi_get(v_m, v_gk, 'cur',  'FU_DEN');
        p_fun  := app.kpi_get(v_m, v_gk, 'prev', 'FU_NUM');
        p_fud  := app.kpi_get(v_m, v_gk, 'prev', 'FU_DEN');
        c_uni  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur',  'UNI_N'), 0) END;
        p_uni  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'prev', 'UNI_N'), 0) END;
        c_new  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur',  'NEW_N'), 0) END;
        p_new  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'prev', 'NEW_N'), 0) END;
        c_ret  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur',  'RET_N'), 0) END;
        p_ret  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'prev', 'RET_N'), 0) END;
        c_buy  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur',  'BUY_N'), 0) END;
        p_buy  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'prev', 'BUY_N'), 0) END;
        c_rep  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur',  'REP_N'), 0) END;
        p_rep  := CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'prev', 'REP_N'), 0) END;

        -- ชุด A: มิติ NONE · BRANCH · TEAM · STAFF · CHANNEL
        IF p_group_by <> 'STATUS' THEN
            v_rows := v_rows
                || app.kpi_row('VISITS',             v_gk, v_lbl, 'COUNT', c_vis, p_vis)
                || app.kpi_row('WALKIN_VISITS',      v_gk, v_lbl, 'COUNT', c_wal, p_wal)
                || app.kpi_row('IDENTIFIED_VISITS',  v_gk, v_lbl, 'COUNT', c_idn, p_idn)
                || app.kpi_row('LEADS',              v_gk, v_lbl, 'COUNT', c_lead, p_lead)
                || app.kpi_row('OPPORTUNITIES',      v_gk, v_lbl, 'COUNT', c_opp, p_opp)
                || app.kpi_row('SALES',              v_gk, v_lbl, 'COUNT', c_sal, p_sal)
                || app.kpi_row('SALES_AMOUNT',       v_gk, v_lbl, 'MONEY', c_sam, p_sam)
                || app.kpi_row('LOST_OPPORTUNITIES', v_gk, v_lbl, 'COUNT', c_loo, p_loo)
                || app.kpi_row('LOST_LEADS',         v_gk, v_lbl, 'COUNT', c_lol, p_lol)
                || app.kpi_row('LOST_TOTAL',         v_gk, v_lbl, 'COUNT', c_loo + c_lol, p_loo + p_lol)
                || app.kpi_row('WON_LAST_7_DAYS',        v_gk, v_lbl, 'COUNT',
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'WON7_N'), 0))
                || app.kpi_row('WON_LAST_7_DAYS_AMOUNT', v_gk, v_lbl, 'MONEY',
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'WON7_AMT'), 0))
                || app.kpi_row('LEAD_RATE',          v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_lead, c_vis), app.kpi_rate(p_lead, p_vis), c_lead, c_vis)
                || app.kpi_row('OPPORTUNITY_RATE',   v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_opp, c_lead), app.kpi_rate(p_opp, p_lead), c_opp, c_lead)
                || app.kpi_row('CLOSE_RATE',         v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_sal, c_sal + c_loo), app.kpi_rate(p_sal, p_sal + p_loo),
                               c_sal, c_sal + c_loo)
                || app.kpi_row('LOST_RATE',          v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_loo, c_sal + c_loo), app.kpi_rate(p_loo, p_sal + p_loo),
                               c_loo, c_sal + c_loo)
                || app.kpi_row('CONV_LEAD_TO_SALE',  v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_sal, c_lead), app.kpi_rate(p_sal, p_lead), c_sal, c_lead)
                || app.kpi_row('CONV_VISIT_TO_SALE', v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_sal, c_vis), app.kpi_rate(p_sal, p_vis), c_sal, c_vis)
                || app.kpi_row('WALKIN_CONVERSION',  v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_saw, c_wal), app.kpi_rate(p_saw, p_wal), c_saw, c_wal)
                || app.kpi_row('CAPTURE_RATE',       v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_idn, c_vis), app.kpi_rate(p_idn, p_vis), c_idn, c_vis,
                               CASE WHEN app.kpi_rate(c_idn, c_vis) IS NULL THEN NULL
                                    ELSE app.kpi_rate(c_idn, c_vis) >= 0.95 END)
                || app.kpi_row('OUTCOME_COMPLETION', v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_okc, c_cls), app.kpi_rate(p_okc, p_cls), c_okc, c_cls,
                               CASE WHEN app.kpi_rate(c_okc, c_cls) IS NULL THEN NULL
                                    ELSE app.kpi_rate(c_okc, c_cls) >= 0.95 END)
                || app.kpi_row('LEAD_RESPONSE_MIN',  v_gk, v_lbl, 'MINUTES',
                               app.kpi_get(v_m, v_gk, 'cur', 'LR_MED'),
                               app.kpi_get(v_m, v_gk, 'prev', 'LR_MED'),
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'LR_BASE'), 0), NULL, NULL,
                               jsonb_build_object('not_contacted',
                                                  coalesce(app.kpi_get(v_m, v_gk, 'cur', 'LR_NC'), 0)));
        END IF;

        -- ชุด B: มิติ NONE · BRANCH · CHANNEL (ไม่มีการผูกพนักงาน)
        IF p_group_by IN ('NONE', 'BRANCH', 'CHANNEL') THEN
            v_rows := v_rows
                || app.kpi_row('UNIQUE_CUSTOMERS',    v_gk, v_lbl, 'COUNT', c_uni, p_uni)
                || app.kpi_row('NEW_CUSTOMERS',       v_gk, v_lbl, 'COUNT', c_new, p_new)
                || app.kpi_row('RETURNING_CUSTOMERS', v_gk, v_lbl, 'COUNT', c_ret, p_ret);
        END IF;

        -- ชุด C: มิติ NONE · BRANCH (ไม่มีการผูกพนักงาน)
        IF p_group_by IN ('NONE', 'BRANCH') THEN
            v_rows := v_rows
                || app.kpi_row('BUYERS',        v_gk, v_lbl, 'COUNT', c_buy, p_buy)
                || app.kpi_row('REPEAT_BUYERS', v_gk, v_lbl, 'COUNT', c_rep, p_rep)
                || app.kpi_row('REPEAT_RATE',   v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_rep, c_buy), app.kpi_rate(p_rep, p_buy), c_rep, c_buy)
                || app.kpi_row('DUPLICATE_RATE', v_gk, v_lbl, 'RATE',
                               app.kpi_rate(CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'DUP_NUM'), 0) END,
                                            app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')),
                               NULL,
                               CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'DUP_NUM'), 0) END,
                               app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN'),
                               CASE WHEN app.kpi_rate(CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'DUP_NUM'), 0) END,
                                                      app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')) IS NULL THEN NULL
                                    ELSE app.kpi_rate(coalesce(app.kpi_get(v_m, v_gk, 'cur', 'DUP_NUM'), 0),
                                                      app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')) < 0.02 END)
                || app.kpi_row('MISSING_REQUIRED_RATE', v_gk, v_lbl, 'RATE',
                               app.kpi_rate(CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'MISS_NUM'), 0) END,
                                            app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')),
                               NULL,
                               CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'MISS_NUM'), 0) END,
                               app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN'),
                               CASE WHEN app.kpi_rate(CASE WHEN v_attr THEN coalesce(app.kpi_get(v_m, v_gk, 'cur', 'MISS_NUM'), 0) END,
                                                      app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')) IS NULL THEN NULL
                                    ELSE app.kpi_rate(coalesce(app.kpi_get(v_m, v_gk, 'cur', 'MISS_NUM'), 0),
                                                      app.kpi_get(v_m, v_gk, 'cur', 'DQ_DEN')) < 0.02 END);
        END IF;

        -- ชุด D: มิติ NONE · BRANCH · TEAM · STAFF
        IF p_group_by IN ('NONE', 'BRANCH', 'TEAM', 'STAFF') THEN
            v_rows := v_rows
                || app.kpi_row('OPEN_FOLLOWUP_CUSTOMERS', v_gk, v_lbl, 'COUNT',
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'OPEN_FU_CUST'), 0))
                || app.kpi_row('TASKS_TODAY',   v_gk, v_lbl, 'COUNT',
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'TASK_TODAY'), 0))
                || app.kpi_row('TASKS_OVERDUE', v_gk, v_lbl, 'COUNT',
                               coalesce(app.kpi_get(v_m, v_gk, 'cur', 'TASK_OVER'), 0))
                || app.kpi_row('FOLLOWUP_COMPLETION', v_gk, v_lbl, 'RATE',
                               app.kpi_rate(c_fun, c_fud), app.kpi_rate(p_fun, p_fud), c_fun, c_fud,
                               CASE WHEN app.kpi_rate(c_fun, c_fud) IS NULL THEN NULL
                                    ELSE app.kpi_rate(c_fun, c_fud) >= 0.90 END);
        END IF;

        -- ชุด E: ทุกมิติ (มี STATUS)
        v_rows := v_rows
            || app.kpi_row('OPEN_LEADS',           v_gk, v_lbl, 'COUNT',
                           coalesce(app.kpi_get(v_m, v_gk, 'cur', 'OPEN_LEAD'), 0))
            || app.kpi_row('OPEN_OPPORTUNITIES',   v_gk, v_lbl, 'COUNT',
                           coalesce(app.kpi_get(v_m, v_gk, 'cur', 'OPEN_OPP'), 0))
            || app.kpi_row('OPEN_PIPELINE_AMOUNT', v_gk, v_lbl, 'MONEY',
                           coalesce(app.kpi_get(v_m, v_gk, 'cur', 'OPEN_AMT'), 0))
            || app.kpi_row('OPEN_VISITS',          v_gk, v_lbl, 'COUNT',
                           coalesce(app.kpi_get(v_m, v_gk, 'cur', 'OPEN_VIS'), 0));
    END LOOP;

    -- KPI ที่ไม่มีมิติที่ขอ คืนหนึ่งแถว group_key = NULL และ value = NULL (ข้อ 9.4.1)
    FOR i IN 1 .. array_length(c_dims, 1) LOOP
        IF position(p_group_by IN c_dims[i][3]) = 0 THEN
            v_rows := v_rows || app.kpi_row(c_dims[i][1], NULL, NULL, c_dims[i][2], NULL);
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok',         true,
        'preset',     p_preset,
        'group_by',   p_group_by,
        'clock',      v_clock,
        'period',     jsonb_build_object('start', v_p.period_start, 'end', v_p.period_end,
                                         'cmp_start', v_p.cmp_start, 'cmp_end', v_p.cmp_end),
        'branch_ids', to_jsonb(v_sc.sel_ids),
        'scope',      jsonb_build_object('branch', to_jsonb(v_full), 'team', to_jsonb(v_team),
                                         'own', to_jsonb(v_own), 'partial', v_sc.is_partial),
        'rows',       v_rows);
END;
$$;

COMMENT ON FUNCTION app.kpi_compute(text, text, date, date, uuid[], text) IS
'คำนวณ KPI ทุกตัวของ CANONICAL ข้อ 12.1–12.3 ในครั้งเดียวแล้วคืน jsonb ตามรูปของ api.get_kpis · '
'p_permission = ''dashboard.view'' (get_kpis) หรือ ''report.view'' (get_report) · ตัดขอบเขตด้วย app.kpi_scope และ app.kpi_in_scope (ข้อ 9.4.1 · 12.4) · '
'KPI ที่ไม่มีการผูกพนักงาน (UNIQUE/NEW/RETURNING/BUYERS/REPEAT_BUYERS/REPEAT_RATE/DUPLICATE_RATE/MISSING_REQUIRED_RATE) คืน NULL เมื่อมีสาขา TEAM/OWN · '
'KPI แบบ "ณ app.clock()" ไม่มี prev_value · ภายใน ไม่ GRANT (เรียกจาก api.get_kpis / api.get_report)';


-- =====================================================================================
-- ส่วนที่ 7 — RPC ของหน้าจอ (schema api · SECURITY DEFINER · CANONICAL ข้อ 9.4.1 · 9.6)
-- =====================================================================================

-- =====================================================================================
-- วิดเจ็ตกราฟของหน้าหลัก (02) — CANONICAL ข้อ 14.7 · 20.15
--
-- ทำไมต้องมีฟังก์ชันชุดนี้แยกจาก api.get_report:
--   หน้าหลักเปิดด้วยสิทธิ์ `dashboard.view` ส่วน api.get_report ต้องมี `report.view`
--   และ STAFF มี dashboard.view (scope OWN) แต่ **ไม่มี** report.view
--   ถ้าให้หน้าหลักเรียก get_report จะกลายเป็นว่าพนักงานเปิดหน้าหลักแล้วโดนปฏิเสธ
--
-- หลักที่เจ้าของโครงการตรึงไว้ (ข้อ 20.15): **ห้ามคำนวณ KPI หรือร้อยละซ้ำที่ Frontend**
--   ทุกฟังก์ชันในส่วนนี้จึงคืน "ค่าที่จัดรูปแบบแล้ว" มาพร้อมเสมอ (display · pct_display)
--   และคืน `share` เป็นสัดส่วน 0–1 ให้ใช้กำหนดความกว้างแท่ง/ส่วนโค้งโดยหน้าจอไม่ต้องหารเอง
-- =====================================================================================

CREATE FUNCTION app.lost_reason_breakdown(p_permission text, p_preset text, p_start date,
                                          p_end date, p_branch_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $BODY$
DECLARE
    v_me  uuid := app.current_staff_id();
    v_p   record;
    v_sc  record;
    v_out jsonb;
BEGIN
    SELECT * INTO v_p  FROM app.kpi_period(p_preset, p_start, p_end);
    SELECT * INTO v_sc FROM app.kpi_scope(p_permission, p_branch_ids);

    -- 5 อันดับแรก + "อื่น ๆ" เรียงมากไปน้อย · เท่ากันเรียง ref.lost_reasons.sort_order (ข้อ 5.5 · 13.4)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'code',        z.bucket,
               'label_th',    z.label_th,
               'value',       z.n,
               'lead_value',  z.lead_n,
               'lead_display', app.fmt_int(z.lead_n),
               'display',     app.fmt_int(z.n),
               'pct',         app.kpi_rate(z.n, z.total),
               'pct_display', app.fmt_rate(app.kpi_rate(z.n, z.total))) ORDER BY z.ord), '[]'::jsonb)
      INTO v_out
      FROM (
        SELECT b.bucket,
               CASE WHEN b.bucket = '_OTHERS' THEN 'อื่น ๆ' ELSE min(b.label_th) END AS label_th,
               sum(b.n)::numeric      AS n,
               sum(b.lead_n)::numeric AS lead_n,
               min(b.rk)              AS ord,
               min(b.total)::numeric  AS total
        FROM (
          SELECT a.code, a.label_th, a.n, a.lead_n,
                 row_number() OVER (ORDER BY a.n DESC, a.sort_order) AS rk,
                 sum(a.n) OVER ()                                    AS total,
                 CASE WHEN row_number() OVER (ORDER BY a.n DESC, a.sort_order) <= 5
                      THEN a.code ELSE '_OTHERS' END                 AS bucket
          FROM (
            SELECT r.code, r.label_th, r.sort_order,
                   count(*)                                  AS n,
                   count(*) FILTER (WHERE lost.src = 'LEAD') AS lead_n
            FROM (
                SELECT o.lost_reason_code AS code, 'OPPORTUNITY'::text AS src
                  FROM crm.opportunities o
                 WHERE o.stage = 'LOST'
                   AND o.closed_at >= v_p.period_start AND o.closed_at < v_p.period_end
                   AND app.kpi_in_scope(o.branch_id, o.owner_staff_id, v_sc.full_ids, v_sc.team_ids,
                                        v_sc.own_ids, v_sc.pair_keys, v_me)
                UNION ALL
                SELECT l.lost_reason_code, 'LEAD'::text
                  FROM crm.leads l
                 WHERE l.status = 'LOST'
                   AND l.closed_at >= v_p.period_start AND l.closed_at < v_p.period_end
                   AND app.kpi_in_scope(l.branch_id, l.owner_staff_id, v_sc.full_ids, v_sc.team_ids,
                                        v_sc.own_ids, v_sc.pair_keys, v_me)
            ) lost
            JOIN ref.lost_reasons r ON r.code = lost.code
            GROUP BY r.code, r.label_th, r.sort_order
          ) a
        ) b
        GROUP BY b.bucket
      ) z;
    RETURN v_out;
END;
$BODY$;

CREATE FUNCTION app.dashboard_funnel(p_permission text, p_preset text, p_start date,
                                     p_end date, p_branch_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $BODY$
DECLARE
    -- ขั้นของ funnel ตามข้อ 13.1 · ป้ายและสีตรงกับ prototype (D.funnelStages + D.kpiLabels)
    --
    -- สีของขั้นสุดท้ายเป็น --chart-6 ไม่ใช่ --chart-4 โดยตั้งใจ:
    -- --chart-4 คือสีของ Instagram ในโดนัท "แหล่งที่มาลูกค้า" ซึ่งอยู่แถวเดียวกันบนหน้าจอ
    -- ถ้าใช้ซ้ำ สีเดียวกันจะมีสองความหมายในสายตาเดียว (ข้อ 15 ห้ามสื่อด้วยสีอย่างเดียว)
    c_stages constant text[][] := ARRAY[
        ['VISITS',        'ผู้มาติดต่อ (Visitor)', '--chart-1'],
        ['LEADS',         'Leads',                 '--chart-2'],
        ['OPPORTUNITIES', 'Opportunities',         '--chart-3'],
        ['SALES',         'ปิดการขาย (Sales)',     '--chart-6']];
    v_rows  jsonb;
    v_first numeric;
    v_out   jsonb := '[]'::jsonb;
    v_val   numeric;
    i       integer;
BEGIN
    -- ดึงจาก app.kpi_compute ตัวเดียวกับที่การ์ด KPI ใช้ **โดยตั้งใจ**
    -- ถ้าเขียน query นับเองที่นี่ วันหนึ่งสองที่จะให้ตัวเลขไม่ตรงกัน แล้วไม่มีใครรู้ว่าอันไหนถูก
    v_rows := app.kpi_compute(p_permission, p_preset, p_start, p_end, p_branch_ids, 'NONE') -> 'rows';

    SELECT (x ->> 'value')::numeric INTO v_first
      FROM jsonb_array_elements(v_rows) x WHERE x ->> 'code' = c_stages[1][1];

    FOR i IN 1 .. array_length(c_stages, 1) LOOP
        SELECT (x ->> 'value')::numeric INTO v_val
          FROM jsonb_array_elements(v_rows) x WHERE x ->> 'code' = c_stages[i][1];

        v_out := v_out || jsonb_build_object(
            'code',        c_stages[i][1],
            'label_th',    c_stages[i][2],
            'chart_token', c_stages[i][3],
            'value',       v_val,
            'display',     app.fmt_int(v_val),
            -- ร้อยละเทียบ "ขั้นแรก" ไม่ใช่ขั้นก่อนหน้า (ตาม prototype chart.funnel)
            -- คืน share ให้หน้าจอใช้กำหนดความกว้างแท่งด้วย จะได้ไม่ต้องหารเอง
            'share',         app.kpi_rate(v_val, v_first),
            'share_display', app.fmt_rate(app.kpi_rate(v_val, v_first)));
    END LOOP;
    RETURN v_out;
END;
$BODY$;

CREATE FUNCTION app.dashboard_channels(p_permission text, p_preset text, p_start date,
                                       p_end date, p_branch_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $BODY$
DECLARE
    v_rows  jsonb;
    v_total numeric;
    v_out   jsonb;
BEGIN
    -- ลูกค้าไม่ซ้ำแยกตามช่องทาง — ใช้ kpi_compute กลุ่ม CHANNEL ตัวเดียวกับรายงานช่องทาง
    -- ผลรวมของทุกส่วนจึงเท่ากับการ์ด "ลูกค้าไม่ซ้ำ" เสมอ ซึ่งเป็นเลขกลางวงโดนัท (ข้อ 14.7)
    v_rows := app.kpi_compute(p_permission, p_preset, p_start, p_end, p_branch_ids, 'CHANNEL') -> 'rows';

    SELECT sum((x ->> 'value')::numeric) INTO v_total
      FROM jsonb_array_elements(v_rows) x
     WHERE x ->> 'code' = 'UNIQUE_CUSTOMERS' AND x ->> 'value' IS NOT NULL;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'code',          s.code,
               'label_th',      s.label_th,
               'chart_token',   s.chart_token,
               'value',         s.n,
               'display',       app.fmt_int(s.n),
               'pct',           app.kpi_rate(s.n, v_total),
               'pct_display',   app.fmt_rate(app.kpi_rate(s.n, v_total)))
               ORDER BY s.sort_order, s.code), '[]'::jsonb)
      INTO v_out
      FROM (SELECT x ->> 'group_key'                            AS code,
                   coalesce(ch.label_th, x ->> 'group_label')   AS label_th,
                   coalesce(ch.chart_token, '--chart-6')        AS chart_token,
                   coalesce(ch.sort_order, 999)                 AS sort_order,
                   (x ->> 'value')::numeric                     AS n
              FROM jsonb_array_elements(v_rows) x
              LEFT JOIN ref.channels ch ON ch.code = x ->> 'group_key'
             WHERE x ->> 'code' = 'UNIQUE_CUSTOMERS'
               AND (x ->> 'value')::numeric > 0) s;             -- แสดงเฉพาะส่วนที่ > 0 (ข้อ 13.3 · D3)

    RETURN jsonb_build_object('total', v_total, 'total_display', app.fmt_int(v_total), 'segments', v_out);
END;
$BODY$;

CREATE FUNCTION api.get_dashboard_charts(p_preset     text   DEFAULT 'LAST_30_DAYS',
                                         p_start      date   DEFAULT NULL,
                                         p_end        date   DEFAULT NULL,
                                         p_branch_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $BODY$
DECLARE
    v_kpi jsonb;
BEGIN
    PERFORM app.require_permission('dashboard.view');
    -- เรียก kpi_compute หนึ่งครั้งเพื่อเอา clock/period/scope ชุดเดียวกับการ์ด KPI
    -- หน้าจอจึงเขียน "ข้อมูล ณ …" ได้ค่าเดียวกันทั้งหน้า ไม่ใช่คนละเวลา
    v_kpi := app.kpi_compute('dashboard.view', p_preset, p_start, p_end, p_branch_ids, 'NONE');

    RETURN jsonb_build_object(
        'ok',           true,
        'preset',       p_preset,
        'clock',        v_kpi -> 'clock',
        'period',       v_kpi -> 'period',
        'scope',        v_kpi -> 'scope',
        'branch_ids',   v_kpi -> 'branch_ids',
        'funnel',       app.dashboard_funnel('dashboard.view', p_preset, p_start, p_end, p_branch_ids),
        'channels',     app.dashboard_channels('dashboard.view', p_preset, p_start, p_end, p_branch_ids),
        'lost_reasons', app.lost_reason_breakdown('dashboard.view', p_preset, p_start, p_end, p_branch_ids));
END;
$BODY$;

CREATE FUNCTION api.get_kpis(p_preset      text    DEFAULT 'LAST_30_DAYS',
                             p_start       date    DEFAULT NULL,
                             p_end         date    DEFAULT NULL,
                             p_branch_ids  uuid[]  DEFAULT NULL,
                             p_group_by    text    DEFAULT 'NONE')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sc record;
BEGIN
    PERFORM app.require_permission('dashboard.view');
    IF p_group_by = 'STAFF' THEN
        SELECT * INTO v_sc FROM app.kpi_scope('dashboard.view', p_branch_ids);
        IF NOT (v_sc.sel_ids <@ app.scope_branch_ids('report.staff_performance', 'OWN')) THEN
            PERFORM app.api_denied('ต้องมีสิทธิ์ report.staff_performance ในทุกสาขาที่ขอ (ข้อ 9.4.1)');
        END IF;
    END IF;
    RETURN app.kpi_compute('dashboard.view', p_preset, p_start, p_end, p_branch_ids, p_group_by);
END;
$$;

CREATE FUNCTION api.get_report(p_code       text,
                               p_preset     text   DEFAULT 'LAST_30_DAYS',
                               p_start      date   DEFAULT NULL,
                               p_end        date   DEFAULT NULL,
                               p_branch_ids uuid[] DEFAULT NULL,
                               p_params     jsonb  DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_codes constant text[] := ARRAY['OVERVIEW', 'CUSTOMERS', 'SALES', 'CHANNELS', 'STAFF',
                                     'BRANCHES', 'LOST_REASONS', 'DATA_QUALITY'];
    v_me     uuid := app.current_staff_id();
    v_group  text;
    v_keep   text[];
    v_kpi    jsonb;
    v_rows   jsonb;
    v_extra  jsonb := '{}'::jsonb;
    v_p      record;
    v_sc     record;
    v_attr   boolean;
BEGIN
    PERFORM app.require_permission('report.view');
    IF p_code IS NULL OR NOT (p_code = ANY (c_codes)) THEN
        PERFORM app.api_invalid('p_code ต้องเป็นหนึ่งใน ' || array_to_string(c_codes, ' · ') || ' (ข้อ 12.0)');
    END IF;

    SELECT * INTO v_p  FROM app.kpi_period(p_preset, p_start, p_end);
    SELECT * INTO v_sc FROM app.kpi_scope('report.view', p_branch_ids);
    IF cardinality(v_sc.sel_ids) = 0 THEN
        PERFORM app.api_denied('ไม่มีสาขาที่คุณมีสิทธิ์ report.view ในรายการที่ขอ (ข้อ 9.4.1)');
    END IF;
    v_attr := NOT v_sc.is_partial;

    v_group := coalesce(nullif(p_params ->> 'group_by', ''),
                        CASE p_code
                            WHEN 'CHANNELS' THEN 'CHANNEL'
                            WHEN 'STAFF'    THEN 'STAFF'
                            WHEN 'BRANCHES' THEN 'BRANCH'
                            ELSE 'NONE' END);

    IF p_code = 'STAFF' OR v_group = 'STAFF' THEN
        IF NOT (v_sc.sel_ids <@ app.scope_branch_ids('report.staff_performance', 'OWN')) THEN
            PERFORM app.api_denied('รายงานรายพนักงานต้องมีสิทธิ์ report.staff_performance ในทุกสาขาที่ขอ (ข้อ 8.1 · 9.4.1)');
        END IF;
    END IF;

    v_kpi  := app.kpi_compute('report.view', p_preset, p_start, p_end, p_branch_ids, v_group);
    v_keep := CASE p_code
        WHEN 'OVERVIEW'     THEN ARRAY['VISITS','WALKIN_VISITS','UNIQUE_CUSTOMERS','NEW_CUSTOMERS','RETURNING_CUSTOMERS',
                                       'LEADS','OPPORTUNITIES','SALES','CONV_LEAD_TO_SALE']
        WHEN 'CUSTOMERS'    THEN ARRAY['UNIQUE_CUSTOMERS','NEW_CUSTOMERS','RETURNING_CUSTOMERS','BUYERS','REPEAT_BUYERS',
                                       'REPEAT_RATE','CAPTURE_RATE','IDENTIFIED_VISITS']
        WHEN 'SALES'        THEN ARRAY['VISITS','LEADS','OPPORTUNITIES','SALES','SALES_AMOUNT','CLOSE_RATE','LOST_RATE',
                                       'LOST_OPPORTUNITIES','LOST_LEADS','LOST_TOTAL']
        WHEN 'CHANNELS'     THEN ARRAY['UNIQUE_CUSTOMERS','VISITS','LEADS','LEAD_RATE']
        WHEN 'LOST_REASONS' THEN ARRAY['LOST_OPPORTUNITIES','LOST_LEADS','LOST_TOTAL']
        WHEN 'DATA_QUALITY' THEN ARRAY['CAPTURE_RATE','OUTCOME_COMPLETION','FOLLOWUP_COMPLETION',
                                       'DUPLICATE_RATE','MISSING_REQUIRED_RATE']
        ELSE NULL END;                                        -- STAFF · BRANCHES = ทุก KPI

    IF v_keep IS NULL THEN
        v_rows := v_kpi -> 'rows';
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_rows
        FROM jsonb_array_elements(v_kpi -> 'rows') x
        WHERE x ->> 'code' = ANY (v_keep);
    END IF;

    -- ------------------------------------------------------------------ ส่วนเสริมรายรหัส
    IF p_code IN ('SALES', 'LOST_REASONS') THEN
        -- ตรรกะอยู่ใน app.lost_reason_breakdown ที่เดียว เพราะหน้าหลัก (02) ใช้ชุดเดียวกัน
        -- แต่เข้าด้วยสิทธิ์ dashboard.view ถ้าเขียน query ซ้ำสองที่ วันหนึ่งจะให้คำตอบไม่ตรงกัน
        v_extra := jsonb_build_object('lost_reasons',
            app.lost_reason_breakdown('report.view', p_preset, p_start, p_end, p_branch_ids));

    ELSIF p_code = 'CHANNELS' THEN
        -- ลูกค้าไม่ซ้ำ × สาขา × ช่องทางแรก (ข้อ 13.3) · ไม่มีการผูกพนักงาน → ต้องเป็นสาขา B/G ทั้งหมด
        IF v_attr THEN
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'branch_id',    m.branch_id,
                       'branch_code',  m.branch_code,
                       'branch_label', m.branch_label,
                       'channel_code', m.channel_code,
                       'value',        m.n,
                       'display',      app.fmt_int(m.n)) ORDER BY m.branch_code, m.csort, m.channel_code), '[]'::jsonb)
              INTO v_extra
              FROM (SELECT act.branch_id, b.code AS branch_code, b.name_th AS branch_label,
                           c.first_channel_code AS channel_code,
                           coalesce(ch.sort_order, 999) AS csort,
                           count(DISTINCT c.id)::numeric AS n
                    FROM (SELECT DISTINCT a.customer_id, a.branch_id
                            FROM analytics.customer_activity a
                           WHERE a.occurred_at >= v_p.period_start AND a.occurred_at < v_p.period_end
                             AND a.customer_id IS NOT NULL
                             AND a.branch_id = ANY (v_sc.full_ids)) act
                    JOIN crm.customers c ON c.id = act.customer_id
                    JOIN core.branches b ON b.id = act.branch_id
                    LEFT JOIN ref.channels ch ON ch.code = c.first_channel_code
                    GROUP BY 1, 2, 3, 4, 5) m;
        ELSE
            v_extra := 'null'::jsonb;
        END IF;
        v_extra := jsonb_build_object('channel_matrix', v_extra);

    ELSIF p_code = 'DATA_QUALITY' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'issue_code',   z.issue_code,
                   'branch_id',    z.branch_id,
                   'branch_code',  z.branch_code,
                   'value',        z.n,
                   'display',      app.fmt_int(z.n)) ORDER BY z.issue_code, z.branch_code), '[]'::jsonb)
          INTO v_extra
          FROM (SELECT q.issue_code, q.branch_id, b.code AS branch_code, count(*)::numeric AS n
                  FROM analytics.data_quality_issues q
                  LEFT JOIN core.branches b ON b.id = q.branch_id
                 WHERE app.kpi_in_scope(q.branch_id, q.owner_staff_id, v_sc.full_ids, v_sc.team_ids,
                                        v_sc.own_ids, v_sc.pair_keys, v_me)
                 GROUP BY 1, 2, 3) z;
        v_extra := jsonb_build_object('issues', v_extra);

    ELSIF p_code = 'OVERVIEW' THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_extra
          FROM jsonb_array_elements(app.kpi_compute('report.view', p_preset, p_start, p_end,
                                                    p_branch_ids, 'BRANCH') -> 'rows') x
         WHERE x ->> 'code' = 'WALKIN_VISITS';
        v_extra := jsonb_build_object('walkin_by_branch', v_extra);
    END IF;

    RETURN jsonb_build_object(
        'ok',         true,
        'code',       p_code,
        'preset',     p_preset,
        'group_by',   v_group,
        'clock',      v_kpi -> 'clock',
        'period',     v_kpi -> 'period',
        'branch_ids', v_kpi -> 'branch_ids',
        'scope',      v_kpi -> 'scope',
        'rows',       v_rows,
        'extra',      v_extra);
END;
$$;

CREATE FUNCTION api.list_data_quality_issues(p_issue_code text DEFAULT NULL, p_branch_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_codes constant text[] := ARRAY['DUPLICATE_SUSPECTED', 'MISSING_PHONE', 'INVALID_PHONE', 'LEAD_WITHOUT_OWNER',
                                     'LEAD_WITHOUT_OUTCOME', 'OVERDUE_FOLLOWUP', 'INCOMPLETE_CUSTOMER',
                                     'WON_WITHOUT_TRANSACTION', 'VISIT_UNRECORDED'];
    v_me    uuid := app.current_staff_id();
    v_sc    record;
    v_rows  jsonb;
    v_counts jsonb;
    v_total bigint;
BEGIN
    PERFORM app.require_permission('data_quality.view');
    IF p_issue_code IS NOT NULL AND NOT (p_issue_code = ANY (c_codes)) THEN
        PERFORM app.api_invalid('p_issue_code ไม่ถูกต้อง (ข้อ 12.3)');
    END IF;

    SELECT * INTO v_sc FROM app.kpi_scope('data_quality.view', p_branch_ids);
    IF cardinality(v_sc.sel_ids) = 0 THEN
        PERFORM app.api_denied('ไม่มีสาขาที่คุณมีสิทธิ์ data_quality.view ในรายการที่ขอ (ข้อ 8.1)');
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'issue_code',     q.issue_code,
               'entity_type',    q.entity_type,
               'entity_id',      q.entity_id,
               'customer_id',    q.customer_id,
               'branch_id',      q.branch_id,
               'owner_staff_id', q.owner_staff_id,
               'detected_at',    q.detected_at) ORDER BY q.issue_code, q.detected_at, q.entity_id), '[]'::jsonb),
           count(*)
      INTO v_rows, v_total
      FROM analytics.data_quality_issues q
     WHERE (p_issue_code IS NULL OR q.issue_code = p_issue_code)
       AND app.kpi_in_scope(q.branch_id, q.owner_staff_id, v_sc.full_ids, v_sc.team_ids,
                            v_sc.own_ids, v_sc.pair_keys, v_me);

    SELECT coalesce(jsonb_agg(jsonb_build_object('issue_code', z.issue_code, 'branch_id', z.branch_id,
                                                 'branch_code', z.branch_code, 'value', z.n)
                              ORDER BY z.issue_code, z.branch_code), '[]'::jsonb)
      INTO v_counts
      FROM (SELECT q.issue_code, q.branch_id, b.code AS branch_code, count(*)::numeric AS n
              FROM analytics.data_quality_issues q
              LEFT JOIN core.branches b ON b.id = q.branch_id
             WHERE app.kpi_in_scope(q.branch_id, q.owner_staff_id, v_sc.full_ids, v_sc.team_ids,
                                    v_sc.own_ids, v_sc.pair_keys, v_me)
             GROUP BY 1, 2, 3) z;

    RETURN jsonb_build_object('ok', true, 'issue_code', p_issue_code, 'branch_ids', to_jsonb(v_sc.sel_ids),
                              'total', v_total, 'counts', v_counts, 'rows', v_rows);
END;
$$;

CREATE FUNCTION api.record_report_export(p_code text, p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_codes constant text[] := ARRAY['OVERVIEW', 'CUSTOMERS', 'SALES', 'CHANNELS', 'STAFF',
                                     'BRANCHES', 'LOST_REASONS', 'DATA_QUALITY'];
    v_me uuid;
BEGIN
    v_me := app.require_permission('report.export');
    IF p_code IS NULL OR NOT (p_code = ANY (c_codes)) THEN
        PERFORM app.api_invalid('p_code ต้องเป็นหนึ่งใน ' || array_to_string(c_codes, ' · ') || ' (ข้อ 12.0)');
    END IF;
    PERFORM app.write_audit('REPORT_EXPORTED', 'EXPORT', p_code, p_code, NULL, NULL,
                            coalesce(p_params, '{}'::jsonb), NULL, NULL);
    RETURN jsonb_build_object('ok', true, 'code', p_code, 'params', coalesce(p_params, '{}'::jsonb),
                              'exported_at', now());
END;
$$;


-- =====================================================================================
-- ส่วนที่ 8 — GRANT (CANONICAL ข้อ 1.1 · 19.1 ข้อ 2)
-- schema analytics ไม่มี GRANT ใด ๆ · helper ใน app ไม่ GRANT · RPC ใน api ให้ EXECUTE รายฟังก์ชัน
-- =====================================================================================

GRANT EXECUTE ON FUNCTION
    api.get_kpis(text, date, date, uuid[], text),
    api.get_dashboard_charts(text, date, date, uuid[]),
    api.get_report(text, text, date, date, uuid[], jsonb),
    api.list_data_quality_issues(text, uuid[]),
    api.record_report_export(text, jsonb)
TO authenticated;


-- =====================================================================================
-- ส่วนที่ 9 — คำอธิบายฟังก์ชัน (ใช้สร้าง data dictionary · api-spec)
-- =====================================================================================

COMMENT ON FUNCTION api.get_kpis(text, date, date, uuid[], text) IS
$doc$KPI ของ Dashboard และหน้ารายงาน (CANONICAL ข้อ 9.4.1 · 9.6 · 12.1–12.4) · ต้องมี dashboard.view ·
p_group_by = 'STAFF' ต้องมี report.staff_performance ในทุกสาขาที่ขอ · p_preset ∈ TODAY · YESTERDAY · LAST_7_DAYS ·
THIS_WEEK · LAST_30_DAYS (ค่าเริ่มต้น) · THIS_MONTH · LAST_MONTH · THIS_QUARTER · CUSTOM (ใช้ p_start/p_end · p_end เป็นขอบเปิด) ·
p_branch_ids = NULL หมายถึงทุกสาขาที่ผู้เรียกมีสิทธิ์ · สาขาที่ไม่มีสิทธิ์ถูกตัดทิ้ง · ไม่เหลือสาขา → 42501

รูปผลลัพธ์ (jsonb):
{
  "ok": true,
  "preset": "LAST_30_DAYS",
  "group_by": "NONE",
  "clock": "2026-09-11T03:24:00+00:00",
  "period": {"start": <ts>, "end": <ts>, "cmp_start": <ts>, "cmp_end": <ts>},
  "branch_ids": [<uuid>, ...],
  "scope": {"branch": [<uuid>], "team": [<uuid>], "own": [<uuid>], "partial": false},
  "rows": [
    {"code": "VISITS", "group_key": null, "group_label": null, "kind": "COUNT",
     "value": 3125, "numerator": null, "denominator": null, "prev_value": 2790,
     "display": "3,125", "change_display": "+12%", "target_met": null, "extra": null},
    {"code": "CONV_LEAD_TO_SALE", "group_key": null, "group_label": null, "kind": "RATE",
     "value": 0.2410313901, "numerator": 215, "denominator": 892, "prev_value": 0.2203389831,
     "display": "24.1%", "change_display": "+2.1 pp", "target_met": null, "extra": null}
  ]
}

ความหมายของคอลัมน์ในแต่ละแถว:
  code           รหัส KPI ของข้อ 12.1 · 12.2 · 12.3 (38 รหัส)
  group_key      ค่ามิติ: uuid สาขา/พนักงาน/ทีม · รหัสช่องทาง · รหัสสถานะ · NULL = ไม่จัดกลุ่ม หรือกลุ่ม "ไม่มีทีม/ไม่มีผู้รับผิดชอบ"
  group_label    ป้ายของกลุ่ม (ชื่อสาขา/พนักงาน/ทีม/ช่องทาง) · NULL สำหรับ STATUS (ป้ายไทยของ ENUM ไม่เก็บในฐานข้อมูล · ข้อ 4)
  kind           COUNT · MONEY · RATE (value เป็นสัดส่วน 0–1 ที่ยังไม่ปัด) · MINUTES
  value          ค่าดิบที่ยังไม่ปัด · NULL เมื่อคำนวณไม่ได้ (ตัวหาร 0 · ไม่มีมิตินี้ · ขอบเขต TEAM/OWN ของ KPI ที่ไม่ผูกพนักงาน)
  numerator      ตัวตั้ง (เฉพาะอัตรา) · LEAD_RESPONSE_MIN = จำนวน lead ในฐานมัธยฐาน
  denominator    ตัวหาร (เฉพาะอัตรา)
  prev_value     ค่าช่วงเปรียบเทียบ · NULL สำหรับ KPI แบบ "ณ app.clock()" (OPEN_* · TASKS_* · WON_LAST_7_DAYS* · DUPLICATE_RATE · MISSING_REQUIRED_RATE)
  display        ข้อความที่ปัดแล้วตามข้อ 1.3 ("3,125" · "฿3,332,700" · "24.1%" · "18 นาที" · "–")
  change_display ส่วนต่างที่ปัดแล้ว ("+12%" · "+2.1 pp" · "–" เมื่อไม่มีค่าก่อนหน้าหรือค่าก่อนหน้าเป็น 0)
  target_met     เทียบเป้าด้วยค่าที่ยังไม่ปัด: CAPTURE_RATE ≥ 0.95 · OUTCOME_COMPLETION ≥ 0.95 ·
                 FOLLOWUP_COMPLETION ≥ 0.90 · DUPLICATE_RATE < 0.02 · MISSING_REQUIRED_RATE < 0.02 · อื่น ๆ NULL
  extra          ข้อมูลเสริม · LEAD_RESPONSE_MIN = {"not_contacted": N} ("ยังไม่ติดต่อ N" ของข้อ 12.2)$doc$;

COMMENT ON FUNCTION api.get_report(text, text, date, date, uuid[], jsonb) IS
$doc$รายงานหน้า 09 และหัวหน้า 12 (CANONICAL ข้อ 9.4.1 · 9.6 · 12.0 · 14.8) · ต้องมี report.view ·
p_code ∈ OVERVIEW · CUSTOMERS · SALES · CHANNELS · STAFF · BRANCHES · LOST_REASONS · DATA_QUALITY ·
p_code = 'STAFF' (หรือ p_params->>'group_by' = 'STAFF') ต้องมี report.staff_performance ในทุกสาขาที่ขอ ·
p_params รับ {"group_by": "..."} เพื่อเปลี่ยนมิติ (ค่าเริ่มต้น: CHANNELS → CHANNEL · STAFF → STAFF · BRANCHES → BRANCH · อื่น ๆ → NONE)

รูปผลลัพธ์ (jsonb): {"ok", "code", "preset", "group_by", "clock", "period", "branch_ids", "scope", "rows", "extra"}
  rows   แถวเดียวกับ api.get_kpis (กรองเฉพาะ KPI ของรายงานนั้น · STAFF และ BRANCHES คืนทุก KPI)
  extra  ส่วนเสริมรายรหัส
         SALES · LOST_REASONS → {"lost_reasons": [{"code","label_th","value","lead_value","lead_display","display","pct","pct_display"}]}
                                5 อันดับแรก + "_OTHERS" (ป้าย "อื่น ๆ") เรียงมากไปน้อย · เท่ากันเรียง ref.lost_reasons.sort_order (ข้อ 5.5)
                                lead_value = จำนวนที่มาจาก crm.leads (คอลัมน์ "ในนั้นเป็น Lead" ของข้อ 13.4)
         CHANNELS             → {"channel_matrix": [{"branch_id","branch_code","branch_label","channel_code","value","display"}]}
                                ลูกค้าไม่ซ้ำ × สาขา × customers.first_channel_code (ข้อ 13.3) · NULL เมื่อขอบเขตมีสาขา TEAM/OWN
         DATA_QUALITY         → {"issues": [{"issue_code","branch_id","branch_code","value","display"}]}
         OVERVIEW             → {"walkin_by_branch": [แถว WALKIN_VISITS จัดกลุ่ม BRANCH]}$doc$;

COMMENT ON FUNCTION api.get_dashboard_charts(text, date, date, uuid[]) IS
$doc$วิดเจ็ตกราฟของหน้าหลัก 02 (CANONICAL ข้อ 14.7 · 20.15) · ต้องมี dashboard.view
**แยกจาก api.get_report เพราะ STAFF มี dashboard.view แต่ไม่มี report.view** ถ้าใช้ตัวเดียวกันพนักงานจะเปิดหน้าหลักไม่ได้

ทุกค่าที่คืนมาจัดรูปแบบมาแล้ว เพื่อไม่ให้หน้าจอคำนวณหรือปัดเศษเอง (ข้อ 20.15):
  funnel       [{"code","label_th","chart_token","value","display","share","share_display"}]
               ขั้นตามข้อ 13.1 (VISITS → LEADS → OPPORTUNITIES → SALES)
               share/share_display = เทียบ **ขั้นแรก** ไม่ใช่ขั้นก่อนหน้า · share เป็นสัดส่วน 0–1 ใช้กำหนดความกว้างแท่งได้เลย
  channels     {"total","total_display","segments":[{"code","label_th","chart_token","value","display","pct","pct_display"}]}
               ลูกค้าไม่ซ้ำแยกช่องทาง · total = เลขกลางวงโดนัท · แสดงเฉพาะส่วนที่ > 0 (ข้อ 13.3 · D3)
  lost_reasons เหมือน api.get_report('LOST_REASONS').extra.lost_reasons (ใช้ app.lost_reason_breakdown ตัวเดียวกัน)

clock/period/scope มาจาก app.kpi_compute ชุดเดียวกับ api.get_kpis ทั้งหน้าจึงอ้างเวลาเดียวกัน$doc$;

COMMENT ON FUNCTION api.list_data_quality_issues(text, uuid[]) IS
$doc$รายการศูนย์คุณภาพข้อมูล (CANONICAL ข้อ 9.6 · 12.3) · ต้องมี data_quality.view · กรองตามขอบเขตของสิทธิ์นี้
(O = รายการที่ตนเป็นผู้ผูก · T = สมาชิกทีมที่ตนเป็นหัวหน้า · B/G = ทั้งสาขา/องค์กร) ·
p_issue_code = NULL คืนทุกชนิด · p_branch_ids = NULL คืนทุกสาขาที่มีสิทธิ์

รูปผลลัพธ์ (jsonb): {"ok", "issue_code", "branch_ids", "total", "counts", "rows"}
  counts [{"issue_code","branch_id","branch_code","value"}] — จำนวนต่อชนิดต่อสาขา (ไม่ขึ้นกับ p_issue_code)
  rows   [{"issue_code","entity_type","entity_id","customer_id","branch_id","owner_staff_id","detected_at"}]$doc$;

COMMENT ON FUNCTION api.record_report_export(text, jsonb) IS
'บันทึกการส่งออกรายงานตัวเลขรวม (CANONICAL ข้อ 9.6 · 14.8) · ต้องมี report.export · เขียน audit REPORT_EXPORTED '
'(entity_type = EXPORT · entity_id/entity_ref = p_code · after = p_params) · ไม่ต้องอนุมัติ · ไม่มี PII ในไฟล์รายงาน (ข้อ 8.1)';
