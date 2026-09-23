-- =====================================================================================
-- JAUN CRM · Customer 360
-- migration 0011 : api — RPC ที่หน้าจอและ Edge Function เรียก (CANONICAL ข้อ 9.6)
-- target        : Supabase PostgreSQL 17 (ทดสอบบน PGlite 0.4.1 ผ่าน tools/db/run.mjs)
--
-- แหล่งจริงของสัญญา: docs/00-brief/CANONICAL.md v2.2 (ข้อ 6 · 7 · 8 · 9 · 10 · 11 · 19)
--                    docs/04-security/rls-spec.md ข้อ 8 (F1–F8 · 8.2 · 8.3) และ permission-matrix.md ข้อ 6–7
--
-- กติกาของไฟล์นี้ (rls-spec ข้อ 8.1):
--   F1 ทุกฟังก์ชันใน api เป็น SECURITY DEFINER · owner = role ที่รัน migration · SET search_path = ''
--      volatility ตามข้อ 9.6 · อ้างชื่อเต็ม schema.object เสมอ
--   F2 บรรทัดแรกคือการตรวจสิทธิ์: v_me := app.require_staff() (หรือ app.require_permission(...))
--      ยกเว้น api.activate_self() และ api.svc_*
--   F3 GRANT EXECUTE ให้ authenticated เท่านั้น · api.svc_* ให้ service_role เท่านั้น
--      และ svc_* ตรวจ auth.role() = 'service_role' บรรทัดแรก
--   F4 DEFINER ข้าม RLS และ app.enforce_row_transition → ต้องตรวจซ้ำด้วย helper ข้อ 9.3 ให้ได้ผลเท่ากับ policy
--   F5 ปฏิเสธด้วย SQLSTATE 42501 (ข้อความไทย · ใช้รหัส JCRM-Tnn ของ app.transition_denied เมื่อความหมายตรงกัน)
--      ข้อมูลไม่ถูกต้อง = 22023 · กติกาธุรกิจ = P0001
--   F6 ตั้ง app.audit_reason เมื่อมีเหตุผล (ข้อความห้ามมี PII)
--   F7 เวลาในการตัดสินสิทธิ์ใช้ now() เสมอ · ตัวนับอัตราใช้ app.rate_limit_hit
--   F8 api.svc_* ตั้ง app.actor_staff_id จาก sub ของ JWT ที่ Edge Function verify แล้ว
--
-- โครงของไฟล์
--   A  ส่วนต่างของ schema ที่ RPC ต้องใช้ (ข้อ 11.1 · 11.2 · rls-spec ข้อ 11.1)
--   B  helper ภายใน schema app (error · header · audit · access log · แจ้งเตือน · อัตรา)
--   C  helper ของลูกค้า (คะแนนผู้สมัครซ้ำ ข้อ 6.5 · การ์ดผล · ตัวเลขสรุป)
--   D  RPC ลูกค้า: quick_capture · search_customers · find_customer_candidates · link_customer_to_branch
--   E  RPC Customer 360 · reveal · save_contact/address · record_consent
--   F  RPC รวมลูกค้า: merge_customers · decide_duplicate
--   G  RPC งานหน้าร้าน: open_visit · close_visit · acknowledge_unrecorded_visit · convert_lead · assign_owner
--   H  RPC ส่งออกข้อมูลลูกค้า (ข้อ 8.2)
--   I  RPC audit · security log
--   J  RPC สิทธิ์ ผู้ใช้ ทีม อุปกรณ์ (ข้อ 7)
--   K  RPC settings
--   L  RPC PDPA · DSR · anonymize · integration log (ข้อ 10)
--   M  RPC ของ Edge Function (api.svc_*)
--   N  GRANT EXECUTE + COMMENT
--
-- หมายเหตุผู้เขียน (รายละเอียดอยู่ในแต่ละบล็อก)
--   1. บล็อก A แก้ CHECK ของ crm.notifications และเพิ่มคีย์ของ app.settings ที่ CANONICAL v2.2 มีแต่ 0001/0007 ยังไม่มี
--      (rls-spec ข้อ 11.1) — เป็นการแก้ขั้นต่ำที่ RPC ในไฟล์นี้ต้องใช้
--   2. audit.log_row_change (0008) ยังไม่อ่าน app.actor_staff_id เมื่อ auth.role() = 'service_role'
--      → api.svc_* ในไฟล์นี้ตั้งทั้ง app.actor_staff_id (F8) และ request.jwt.claims ของผู้กระทำที่ verify แล้ว
--      เพื่อให้ actor ใน audit ถูกต้องโดยไม่ต้องแก้ 0008 (ดูบล็อก M)
-- =====================================================================================


-- =====================================================================================
-- บล็อก A — ส่วนต่างของ schema ที่ RPC ต้องใช้
-- =====================================================================================

-- A1. รหัสการแจ้งเตือนของ v2.2 (CANONICAL ข้อ 11.1) — 0007 มีเพียง 19 รหัสแรก
ALTER TABLE crm.notifications DROP CONSTRAINT IF EXISTS notifications_code_chk;
ALTER TABLE crm.notifications ADD CONSTRAINT notifications_code_chk CHECK (code IN (
    'FOLLOWUP_DUE', 'FOLLOWUP_OVERDUE', 'TASK_OVERDUE', 'LEAD_UNASSIGNED', 'LEAD_NOT_CONTACTED',
    'LEAD_ASSIGNED', 'OPPORTUNITY_ASSIGNED', 'TASK_ASSIGNED', 'OPPORTUNITY_STALE', 'DUPLICATE_SUSPECTED',
    'VISITOR_WAITING_LONG', 'VISIT_OUTCOME_MISSING', 'DATA_MISSING', 'EXPORT_APPROVAL_REQUIRED', 'EXPORT_DECIDED',
    'ROLE_GRANT_APPROVAL_REQUIRED', 'REVEAL_LIMIT_EXCEEDED', 'SEARCH_LIMIT_EXCEEDED', 'RETENTION_ANONYMIZE_UPCOMING',
    'LOCKOUT_REPEATED', 'LINK_LIMIT_EXCEEDED', 'CUSTOMER_VIEW_LIMIT_EXCEEDED', 'EXPORT_READY',
    'ROLE_GRANT_DECIDED', 'DSR_DUE_SOON'));

-- A2. ค่าตั้งของ v2.2 ที่ 0001 ยังไม่มี (CANONICAL ข้อ 11.2)
INSERT INTO app.settings (key, value, editable_by) VALUES
    ('pdpa.current_notice_version', '"PN-2026-01"', 'settings.business'),
    ('security.login_ip_per_15min', '20',           'settings.business'),
    ('dsr.anonymize_per_day',       '20',           'settings.business')
ON CONFLICT (key) DO NOTHING;


-- =====================================================================================
-- บล็อก B — helper ภายใน schema app
-- ไม่ GRANT ให้ authenticated (CI-12b) · ถูกเรียกจากฟังก์ชัน DEFINER ในไฟล์นี้เท่านั้น
-- =====================================================================================

CREATE FUNCTION app.api_denied(p_msg text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = p_msg;
END;
$$;

CREATE FUNCTION app.api_invalid(p_msg text, p_sqlstate text DEFAULT '22023')
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = p_sqlstate, MESSAGE = p_msg;
END;
$$;

CREATE FUNCTION app.require_staff()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.current_staff_id();
BEGIN
    IF v_me IS NULL THEN
        PERFORM app.transition_denied('T00');
    END IF;
    RETURN v_me;
END;
$$;

CREATE FUNCTION app.require_permission(p_permission text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_staff();
BEGIN
    IF NOT app.has_permission(p_permission) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ ' || p_permission || ' (ตรวจ MFA และบทบาทของคุณ)');
    END IF;
    RETURN v_me;
END;
$$;

CREATE FUNCTION app.request_headers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_text text := nullif(current_setting('request.headers', true), '');
BEGIN
    IF v_text IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;
    BEGIN
        RETURN v_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN '{}'::jsonb;
    END;
END;
$$;

-- เขียน audit.audit_logs จาก RPC (ตารางที่ไม่มี trigger audit.log_row_change เช่น audit.export_requests · app.settings)
CREATE FUNCTION app.write_audit(
    p_action      text,
    p_entity_type text,
    p_entity_id   text,
    p_entity_ref  text    DEFAULT NULL,
    p_branch_id   uuid    DEFAULT NULL,
    p_before      jsonb   DEFAULT NULL,
    p_after       jsonb   DEFAULT NULL,
    p_changed     text[]  DEFAULT NULL,
    p_reason      text    DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_staff   uuid := app.current_staff_id();
    v_code    text;
    v_name    text;
    v_org     uuid;
    v_roles   text[] := '{}';
    v_actor   audit.actor_type;
    v_headers jsonb := app.request_headers();
BEGIN
    IF app.is_seed_mode() THEN
        RETURN;
    END IF;
    IF v_staff IS NOT NULL THEN
        SELECT s.staff_code, s.display_name, s.organization_id INTO v_code, v_name, v_org
        FROM core.staff_profiles s WHERE s.id = v_staff;
        SELECT coalesce(array_agg(DISTINCT a.role_code ORDER BY a.role_code), '{}') INTO v_roles
        FROM core.staff_role_assignments a
        WHERE a.staff_id = v_staff AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now());
    END IF;
    v_actor := CASE
        WHEN current_setting('app.actor_type', true) = 'INTEGRATION' THEN 'INTEGRATION'
        WHEN current_setting('app.actor_type', true) = 'SYSTEM'      THEN 'SYSTEM'
        WHEN v_staff IS NOT NULL                                     THEN 'STAFF'
        ELSE 'SYSTEM'
    END::audit.actor_type;
    INSERT INTO audit.audit_logs (
        occurred_at, organization_id, actor_type, actor_staff_id, actor_staff_code, actor_label, actor_roles, aal,
        action, entity_type, entity_id, entity_ref, branch_id, before, after, changed_fields, reason,
        ip, user_agent, device_id, request_id)
    VALUES (
        now(), coalesce(v_org, app.current_organization_id()), v_actor, v_staff, v_code,
        coalesce(nullif(current_setting('app.actor_label', true), ''), v_name,
                 v_actor::text || ':' || coalesce(nullif(current_setting('role', true), 'none'), session_user::text)),
        v_roles,
        CASE WHEN auth.jwt() ->> 'aal' IN ('aal1', 'aal2') THEN auth.jwt() ->> 'aal' END,
        p_action, p_entity_type, p_entity_id, p_entity_ref, p_branch_id, p_before, p_after, p_changed,
        coalesce(p_reason, nullif(current_setting('app.audit_reason', true), '')),
        v_headers ->> 'x-client-ip', v_headers ->> 'x-client-ua', v_headers ->> 'x-device-id', v_headers ->> 'x-request-id');
END;
$$;

CREATE FUNCTION app.write_access_log(
    p_action       text,
    p_customer_id  uuid    DEFAULT NULL,
    p_contact_id   uuid    DEFAULT NULL,
    p_visit_id     uuid    DEFAULT NULL,
    p_branch_id    uuid    DEFAULT NULL,
    p_purpose      text    DEFAULT NULL,
    p_hashes       text[]  DEFAULT NULL,
    p_result_count integer DEFAULT NULL,
    p_detail       jsonb   DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_staff   uuid := app.current_staff_id();
    v_code    text;
    v_org     uuid;
    v_roles   text[] := '{}';
    v_headers jsonb := app.request_headers();
BEGIN
    IF v_staff IS NOT NULL THEN
        SELECT s.staff_code, s.organization_id INTO v_code, v_org FROM core.staff_profiles s WHERE s.id = v_staff;
        SELECT coalesce(array_agg(DISTINCT a.role_code ORDER BY a.role_code), '{}') INTO v_roles
        FROM core.staff_role_assignments a
        WHERE a.staff_id = v_staff AND a.valid_from <= now() AND (a.valid_to IS NULL OR a.valid_to > now());
    END IF;
    INSERT INTO audit.access_logs (
        occurred_at, organization_id, actor_staff_id, actor_staff_code, actor_roles, aal, action,
        customer_id, contact_id, visit_id, branch_id, purpose, search_hashes, result_count, detail,
        ip, user_agent, device_id, request_id)
    VALUES (
        now(), coalesce(v_org, app.current_organization_id()), v_staff, v_code, v_roles,
        CASE WHEN auth.jwt() ->> 'aal' IN ('aal1', 'aal2') THEN auth.jwt() ->> 'aal' END,
        p_action, p_customer_id, p_contact_id, p_visit_id, p_branch_id, p_purpose, p_hashes, p_result_count, p_detail,
        v_headers ->> 'x-client-ip', v_headers ->> 'x-client-ua', v_headers ->> 'x-device-id', v_headers ->> 'x-request-id');
END;
$$;

CREATE FUNCTION app.notification_title(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE p_code
        WHEN 'FOLLOWUP_DUE'                 THEN 'ถึงเวลาติดตามลูกค้า'
        WHEN 'FOLLOWUP_OVERDUE'             THEN 'ติดตามเกินกำหนด'
        WHEN 'TASK_OVERDUE'                 THEN 'งานเกินกำหนด'
        WHEN 'LEAD_UNASSIGNED'              THEN 'Lead ยังไม่มีผู้รับผิดชอบ'
        WHEN 'LEAD_NOT_CONTACTED'           THEN 'Lead ยังไม่ถูกติดต่อ'
        WHEN 'LEAD_ASSIGNED'                THEN 'ได้รับมอบหมายรายการใหม่'
        WHEN 'OPPORTUNITY_ASSIGNED'         THEN 'ได้รับมอบหมายรายการใหม่'
        WHEN 'TASK_ASSIGNED'                THEN 'ได้รับมอบหมายรายการใหม่'
        WHEN 'OPPORTUNITY_STALE'            THEN 'โอกาสขายไม่มีความเคลื่อนไหว'
        WHEN 'DUPLICATE_SUSPECTED'          THEN 'อาจมีลูกค้าซ้ำ'
        WHEN 'VISITOR_WAITING_LONG'         THEN 'ลูกค้ารอนานเกินไป'
        WHEN 'VISIT_OUTCOME_MISSING'        THEN 'ยังไม่บันทึกผลการให้บริการ'
        WHEN 'DATA_MISSING'                 THEN 'ข้อมูลลูกค้าไม่ครบ'
        WHEN 'EXPORT_APPROVAL_REQUIRED'     THEN 'มีคำขอส่งออกรออนุมัติ'
        WHEN 'EXPORT_DECIDED'               THEN 'คำขอส่งออกได้รับการตัดสินแล้ว'
        WHEN 'EXPORT_READY'                 THEN 'ไฟล์ส่งออกพร้อมดาวน์โหลด'
        WHEN 'ROLE_GRANT_APPROVAL_REQUIRED' THEN 'มีคำขอมอบบทบาทรออนุมัติ'
        WHEN 'ROLE_GRANT_DECIDED'           THEN 'คำขอบทบาทได้รับการตัดสินแล้ว'
        WHEN 'REVEAL_LIMIT_EXCEEDED'        THEN 'การเปิดดู/ค้นหาเกินเกณฑ์'
        WHEN 'SEARCH_LIMIT_EXCEEDED'        THEN 'การเปิดดู/ค้นหาเกินเกณฑ์'
        WHEN 'RETENTION_ANONYMIZE_UPCOMING' THEN 'ข้อมูลใกล้ครบระยะเก็บ'
        WHEN 'LOCKOUT_REPEATED'             THEN 'บัญชีถูกล็อกซ้ำ'
        WHEN 'LINK_LIMIT_EXCEEDED'          THEN 'ผูกลูกค้าข้ามสาขาเกินเกณฑ์'
        WHEN 'CUSTOMER_VIEW_LIMIT_EXCEEDED' THEN 'เปิดดูลูกค้าจำนวนมาก'
        WHEN 'DSR_DUE_SOON'                 THEN 'คำขอเจ้าของข้อมูลใกล้ครบกำหนด'
    END
$$;

CREATE FUNCTION app.emit_notification(
    p_recipient   uuid,
    p_code        text,
    p_entity_type text    DEFAULT NULL,
    p_entity_id   uuid    DEFAULT NULL,
    p_entity_ref  text    DEFAULT NULL,
    p_body        text    DEFAULT NULL,
    p_level       integer DEFAULT 0,
    p_anchor      date    DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org   uuid;
    v_title text := app.notification_title(p_code);
BEGIN
    IF p_recipient IS NULL OR app.is_bulk() OR app.is_seed_mode() THEN
        RETURN;                                            -- ข้อ 19.1 ข้อ 11 · 13.0 ข้อ 7
    END IF;
    SELECT s.organization_id INTO v_org FROM core.staff_profiles s WHERE s.id = p_recipient AND s.status = 'ACTIVE';
    IF v_org IS NULL THEN
        RETURN;                                            -- ผู้รับไม่ ACTIVE → ข้าม (ข้อ 11.1 "ระดับที่ไม่มีผู้รับให้ข้าม")
    END IF;
    INSERT INTO crm.notifications (organization_id, recipient_staff_id, code, entity_type, entity_id, entity_ref,
                                   title, body, dedupe_key, created_by, updated_by)
    VALUES (v_org, p_recipient, p_code, p_entity_type, p_entity_id, p_entity_ref,
            coalesce(v_title, p_code), p_body,
            p_code || ':' || coalesce(p_entity_id::text, coalesce(p_entity_ref, '-')) || ':' || p_level::text
                   || ':' || to_char(coalesce(p_anchor, app.bangkok_date(now())), 'YYYY-MM-DD'),
            app.current_staff_id(), app.current_staff_id())
    ON CONFLICT (recipient_staff_id, dedupe_key) DO NOTHING;
END;
$$;

-- พนักงาน ACTIVE ที่มี assignment ของบทบาทนี้ (branch NULL = ไม่จำกัดสาขา)
CREATE FUNCTION app.staff_ids_with_role(p_role_code text, p_branch_id uuid DEFAULT NULL)
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
      AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
      AND s.organization_id = coalesce(app.current_organization_id(), s.organization_id)
$$;

-- ตัวนับอัตรา (ข้อ 6.4 · 6.5 · 6.6 · 11.2) · เพดานอ่านจาก app.settings ด้วย key เดียวกับชื่อตัวนับ
CREATE FUNCTION app.rate_limit_hit(p_counter_key text, p_per_day boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me      uuid := app.current_staff_id();
    v_limit   integer := app.setting_int(p_counter_key, 2147483647);
    v_window  timestamptz;
    v_count   integer;
    v_blocked timestamptz;
BEGIN
    IF v_me IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'hit_count', 0, 'limit', v_limit, 'blocked_until', NULL);
    END IF;
    v_window := CASE WHEN p_per_day
                     THEN (app.bangkok_date(now())::text || ' 00:00:00 Asia/Bangkok')::timestamptz
                     ELSE date_trunc('hour', now()) END;
    SELECT max(r.blocked_until) INTO v_blocked
    FROM app.rate_limit_counters r
    WHERE r.staff_id = v_me AND r.counter_key = p_counter_key AND r.blocked_until > now();
    INSERT INTO app.rate_limit_counters AS c (staff_id, counter_key, window_start, hit_count)
    VALUES (v_me, p_counter_key, v_window, 1)
    ON CONFLICT (staff_id, counter_key, window_start) DO UPDATE SET hit_count = c.hit_count + 1
    RETURNING c.hit_count INTO v_count;
    RETURN jsonb_build_object(
        'allowed',       v_blocked IS NULL AND v_count <= v_limit,
        'hit_count',     v_count,
        'limit',         v_limit,
        'blocked_until', v_blocked);
END;
$$;

CREATE FUNCTION app.rate_limit_block(p_counter_key text, p_until timestamptz)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.current_staff_id();
BEGIN
    IF v_me IS NULL THEN
        RETURN;
    END IF;
    UPDATE app.rate_limit_counters r
    SET blocked_until = greatest(coalesce(r.blocked_until, p_until), p_until)
    WHERE r.staff_id = v_me AND r.counter_key = p_counter_key
      AND r.window_start = (SELECT max(x.window_start) FROM app.rate_limit_counters x
                            WHERE x.staff_id = v_me AND x.counter_key = p_counter_key);
END;
$$;

CREATE FUNCTION app.sha256_hex(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_value IS NULL THEN NULL ELSE encode(sha256(convert_to(p_value, 'UTF8')), 'hex') END
$$;

-- ชนิด entity ของ audit: CANONICAL ข้อ 9.5 ใช้รหัส (CUSTOMER · LEAD …) แต่ audit.log_row_change (0008)
-- ยังเก็บ schema.table → ฟังก์ชันนี้คืนค่าที่ยอมรับได้ทั้งสองแบบให้ api.search_audit / api.get_entity_history
CREATE FUNCTION app.audit_entity_types(p_code text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE upper(p_code)
        WHEN 'CUSTOMER'           THEN ARRAY['CUSTOMER', 'crm.customers']
        WHEN 'CONTACT'            THEN ARRAY['CONTACT', 'crm.customer_contacts']
        WHEN 'ADDRESS'            THEN ARRAY['ADDRESS', 'crm.customer_addresses']
        WHEN 'NOTE'               THEN ARRAY['NOTE', 'crm.customer_notes']
        WHEN 'CONSENT'            THEN ARRAY['CONSENT', 'crm.customer_consents']
        WHEN 'VISIT'              THEN ARRAY['VISIT', 'crm.visits']
        WHEN 'INTERACTION'        THEN ARRAY['INTERACTION', 'crm.interactions']
        WHEN 'LEAD'               THEN ARRAY['LEAD', 'crm.leads']
        WHEN 'OPPORTUNITY'        THEN ARRAY['OPPORTUNITY', 'crm.opportunities']
        WHEN 'QUOTATION'          THEN ARRAY['QUOTATION', 'crm.quotations']
        WHEN 'TASK'               THEN ARRAY['TASK', 'crm.tasks']
        WHEN 'TRANSACTION_REF'    THEN ARRAY['TRANSACTION_REF', 'crm.transaction_refs']
        WHEN 'STAFF'              THEN ARRAY['STAFF', 'core.staff_profiles']
        WHEN 'ROLE_ASSIGNMENT'    THEN ARRAY['ROLE_ASSIGNMENT', 'core.staff_role_assignments']
        WHEN 'ROLE_GRANT_REQUEST' THEN ARRAY['ROLE_GRANT_REQUEST', 'core.role_grant_requests']
        WHEN 'TEAM'               THEN ARRAY['TEAM', 'core.teams']
        WHEN 'EXPORT'             THEN ARRAY['EXPORT', 'audit.export_requests']
        WHEN 'DSR'                THEN ARRAY['DSR', 'crm.data_subject_requests']
        WHEN 'SETTING'            THEN ARRAY['SETTING', 'app.settings']
        WHEN 'DUPLICATE_DECISION' THEN ARRAY['DUPLICATE_DECISION', 'crm.duplicate_decisions']
        WHEN 'REF'                THEN ARRAY['REF']
        ELSE ARRAY[p_code]
    END
$$;


-- =====================================================================================
-- บล็อก C — helper ของลูกค้า (ตรวจซ้ำ ข้อ 6.5 · การ์ดผลลัพธ์ · ตัวเลขสรุป ข้อ 3.3)
-- =====================================================================================

-- คะแนนผู้สมัครซ้ำตามตารางข้อ 6.5 (ค้นทั้งองค์กร · D16) · คืนคะแนนสูงสุดต่อลูกค้า 1 แถว
CREATE FUNCTION app.candidate_scores(
    p_branch_id  uuid,
    p_phone      text,
    p_line_id    text,
    p_email      text,
    p_first_name text,
    p_last_name  text)
RETURNS TABLE (customer_id uuid, score integer, rules text[], matched_phone boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH v AS (
        SELECT app.normalize_contact('PHONE'::crm.contact_type, p_phone)     AS phone,
               app.normalize_contact('LINE_ID'::crm.contact_type, p_line_id) AS line_id,
               app.normalize_contact('EMAIL'::crm.contact_type, p_email)     AS email,
               nullif(lower(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''))), '') AS name
    ),
    hits AS (
        SELECT ct.customer_id AS cid, 100 AS sc, 'เบอร์โทรตรงกัน' AS rule, true AS by_phone
        FROM crm.customer_contacts ct CROSS JOIN v
        WHERE v.phone IS NOT NULL AND ct.is_active AND ct.contact_type = 'PHONE' AND ct.value_normalized = v.phone
        UNION ALL
        SELECT ct.customer_id, 100, 'LINE ID ตรงกัน', false
        FROM crm.customer_contacts ct CROSS JOIN v
        WHERE v.line_id IS NOT NULL AND ct.is_active
          AND ct.contact_type IN ('LINE_ID', 'LINE_USER_ID') AND ct.value_normalized = v.line_id
        UNION ALL
        SELECT ct.customer_id, 90, 'อีเมลตรงกัน', false
        FROM crm.customer_contacts ct CROSS JOIN v
        WHERE v.email IS NOT NULL AND ct.is_active AND ct.contact_type = 'EMAIL' AND ct.value_normalized = v.email
        UNION ALL
        SELECT c.id, 70, 'ชื่อและนามสกุลตรงกัน + เบอร์ 4 ตัวท้ายตรงกัน', false
        FROM crm.customers c CROSS JOIN v
        WHERE v.name IS NOT NULL AND v.phone IS NOT NULL AND c.name_search = v.name
          AND EXISTS (SELECT 1 FROM crm.customer_contacts ct
                      WHERE ct.customer_id = c.id AND ct.is_active AND ct.contact_type = 'PHONE'
                        AND right(ct.value_normalized, 4) = right(v.phone, 4))
        UNION ALL
        SELECT c.id, 40, 'ชื่อคล้าย + สาขาแรกเดียวกัน', false
        FROM crm.customers c CROSS JOIN v
        WHERE v.name IS NOT NULL AND p_branch_id IS NOT NULL AND c.first_branch_id = p_branch_id
          AND c.name_search <> '' AND extensions.similarity(c.name_search, v.name) >= 0.6
    )
    SELECT h.cid, max(h.sc)::integer, array_agg(DISTINCT h.rule ORDER BY h.rule), bool_or(h.by_phone)
    FROM hits h
    JOIN crm.customers c ON c.id = h.cid
    WHERE c.record_status = 'ACTIVE'
      AND c.organization_id = app.current_organization_id()
    GROUP BY h.cid
$$;

-- การ์ดผลลัพธ์ตามข้อ 6.5 (ในขอบเขต = การ์ดเต็ม · นอกขอบเขต = การ์ดย่อ)
CREATE FUNCTION app.candidate_card(p_customer_id uuid, p_score integer, p_rules text[], p_matched_phone boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c        crm.customers%ROWTYPE;
    v_phone  text;
    v_in     boolean;
BEGIN
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    v_in := app.can_access_customer('customer.read', p_customer_id);
    SELECT ct.value_masked INTO v_phone
    FROM crm.customer_contacts ct
    WHERE ct.customer_id = c.id AND ct.contact_type = 'PHONE' AND ct.is_active
    ORDER BY ct.is_primary DESC, ct.created_at
    LIMIT 1;
    IF v_in THEN
        RETURN jsonb_build_object(
            'customer_id', c.id, 'customer_no', c.customer_no, 'display_name', c.display_name,
            'value_masked', v_phone, 'lifecycle_stage', c.lifecycle_stage,
            'score', p_score, 'reasons', to_jsonb(p_rules), 'in_scope', true, 'can_view', true);
    END IF;
    -- นอกขอบเขต: ชื่อ + นามสกุลย่อ · เบอร์ปิดบังเฉพาะเมื่อตรงด้วยเบอร์ · ไม่คืน lifecycle สาขา หรือวันที่ติดต่อ
    RETURN jsonb_build_object(
        'customer_id', c.id, 'customer_no', c.customer_no,
        'display_name', btrim(coalesce(c.first_name, coalesce(c.nickname, ''))
                              || CASE WHEN c.last_name IS NULL THEN '' ELSE ' ' || substr(c.last_name, 1, 1) || '.' END),
        'value_masked', CASE WHEN p_matched_phone THEN v_phone END,
        'score', p_score, 'reasons', to_jsonb(p_rules), 'in_scope', false, 'can_view', false);
END;
$$;

-- ตัวเลขสรุป 4 ช่องของ Customer 360 (ข้อ 3.3 ข้อ 5)
CREATE FUNCTION app.customer_counters(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'interaction_count', (SELECT count(*) FROM crm.interactions i
                              LEFT JOIN crm.visits v ON v.id = i.visit_id
                              WHERE i.customer_id = p_customer_id AND i.direction <> 'INTERNAL'
                                AND (v.id IS NULL OR v.status <> 'CANCELLED')),
        'walk_in_count',     (SELECT count(*) FROM crm.visits v
                              WHERE v.customer_id = p_customer_id AND v.channel_code = 'WALK_IN' AND v.status <> 'CANCELLED'),
        'purchase_count',    app.customer_purchase_count(p_customer_id),
        'purchase_amount',   (SELECT coalesce((SELECT sum(o.won_amount) FROM crm.opportunities o
                                               WHERE o.customer_id = p_customer_id AND o.stage = 'WON'), 0)
                                   + coalesce((SELECT sum(t.amount) FROM crm.transaction_refs t
                                               JOIN ref.transaction_types tt ON tt.code = t.transaction_type_code
                                               LEFT JOIN crm.opportunities o ON o.id = t.opportunity_id
                                               WHERE t.customer_id = p_customer_id AND tt.counts_as_purchase
                                                 AND (t.opportunity_id IS NULL OR o.stage <> 'WON')), 0)),
        'months_as_customer', (SELECT greatest(0, (extract(year FROM age(app.bangkok_date(app.clock()),
                                                                          app.bangkok_date(c.first_seen_at))) * 12
                                                   + extract(month FROM age(app.bangkok_date(app.clock()),
                                                                            app.bangkok_date(c.first_seen_at))))::integer)
                               FROM crm.customers c WHERE c.id = p_customer_id))
$$;


-- =====================================================================================
-- บล็อก D — RPC ลูกค้า: quick_capture · search_customers · find_customer_candidates · link_customer_to_branch
-- =====================================================================================

-- ข้อ 6.2 · 6.5 · 19.3 ข้อ 2 — สร้างลูกค้าได้ทางเดียว
CREATE FUNCTION api.quick_capture(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me         uuid := app.require_permission('customer.create');
    v_branch     uuid := nullif(p ->> 'branch_id', '')::uuid;
    v_channel    text := nullif(p ->> 'channel_code', '');
    v_interest   text := nullif(p ->> 'interest_code', '');
    v_visit_id   uuid := nullif(p ->> 'visit_id', '')::uuid;
    v_open_visit boolean := coalesce((p ->> 'open_visit')::boolean, v_visit_id IS NOT NULL);
    v_mode       text := coalesce(nullif(p ->> 'visit_mode', ''), 'SERVICE');
    v_contacts   jsonb := coalesce(p -> 'contacts', '[]'::jsonb);
    v_mkt        jsonb := coalesce(p -> 'marketing', '{}'::jsonb);
    v_is_live    boolean;
    v_creates    boolean;
    v_customer   uuid;
    v_cust_no    text;
    v_lead_id    uuid;
    v_lead_no    text;
    v_visit_no   text;
    v_queue      integer;
    v_root_id    uuid;
    v_started    timestamptz := now();
    v_cards      jsonb := '[]'::jsonb;
    v_top        uuid;
    v_top_score  integer := 0;
    v_top_rules  text[];
    v_decision   uuid;
    v_notice     text;
    v_via        crm.consent_capture_via;
    v_evidence   text;
    v_item       jsonb;
    v_type       crm.contact_type;
    v_value      text;
    v_first      boolean;
    v            crm.visits%ROWTYPE;
    r            record;
BEGIN
    -- ---- 1. ตรวจข้อมูลที่บังคับตอนสร้าง (ข้อ 6.2 · ตรวจใน RPC ไม่ใช่ CHECK ถาวร) ----
    IF v_branch IS NULL OR NOT (v_branch = ANY (app.scope_branch_ids('customer.create', 'OWN'))) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์สร้างลูกค้าในสาขานี้');
    END IF;
    IF nullif(btrim(coalesce(p ->> 'first_name', '')), '') IS NULL
       AND nullif(btrim(coalesce(p ->> 'nickname', '')), '') IS NULL THEN
        PERFORM app.api_invalid('ต้องกรอกชื่อ หรือชื่อเล่น อย่างน้อยหนึ่งช่อง');
    END IF;
    IF v_channel IS NULL OR NOT EXISTS (SELECT 1 FROM ref.channels ch WHERE ch.code = v_channel AND ch.is_active) THEN
        PERFORM app.api_invalid('ต้องเลือกช่องทางแรกที่ติดต่อ');
    END IF;
    IF v_interest IS NULL OR NOT EXISTS (SELECT 1 FROM ref.interest_types it WHERE it.code = v_interest AND it.is_active) THEN
        PERFORM app.api_invalid('ต้องเลือกความสนใจ');
    END IF;
    IF NOT coalesce((p ->> 'privacy_notice_ack')::boolean, false) THEN
        PERFORM app.api_invalid('ต้องติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว"', 'P0001');
    END IF;

    -- ทางลัดของฟอร์ม: phone · line_id · email → contacts
    IF nullif(p ->> 'phone', '') IS NOT NULL THEN
        v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('contact_type', 'PHONE', 'value', p ->> 'phone', 'is_primary', true));
    END IF;
    IF nullif(p ->> 'line_id', '') IS NOT NULL THEN
        v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('contact_type', 'LINE_ID', 'value', p ->> 'line_id', 'is_primary', true));
    END IF;
    IF nullif(p ->> 'email', '') IS NOT NULL THEN
        v_contacts := v_contacts || jsonb_build_array(jsonb_build_object('contact_type', 'EMAIL', 'value', p ->> 'email', 'is_primary', true));
    END IF;
    IF jsonb_array_length(v_contacts) = 0 THEN
        PERFORM app.api_invalid('ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ');
    END IF;
    IF v_channel IN ('WALK_IN', 'PHONE')
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_contacts) e WHERE e ->> 'contact_type' = 'PHONE') THEN
        PERFORM app.api_invalid('ช่องทางแรกเป็น Walk-in หรือโทรศัพท์ ต้องกรอกเบอร์โทร');
    END IF;

    -- ---- 2. ความยินยอมรับข่าวสาร (ข้อ 10.2 · 19.4 ข้อ 3) ----
    IF coalesce((v_mkt ->> 'granted')::boolean, false) THEN
        IF NOT (v_branch = ANY (app.scope_branch_ids('customer.consent.manage', 'OWN'))) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์บันทึกความยินยอมในสาขานี้');
        END IF;
        IF NOT coalesce((v_mkt ->> 'age_ack')::boolean, false) THEN
            PERFORM app.api_invalid('ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"', 'P0001');
        END IF;
    END IF;

    -- ---- 3. visit ที่เปิดอยู่ (19.3 ข้อ 2) ----
    IF v_visit_id IS NOT NULL THEN
        SELECT * INTO v FROM crm.visits WHERE id = v_visit_id FOR UPDATE;
        IF NOT FOUND OR v.branch_id <> v_branch OR v.status NOT IN ('WAITING', 'IN_SERVICE') THEN
            PERFORM app.api_denied('visit นี้ใช้ผูกลูกค้าไม่ได้');
        END IF;
        IF v.customer_id IS NOT NULL THEN
            PERFORM app.api_invalid('visit นี้ระบุลูกค้าแล้ว', 'P0001');
        END IF;
        IF NOT (app.can_access_record('visit.update', v.branch_id, v.owner_staff_id, v.created_by)
                OR (v.status = 'WAITING' AND v.owner_staff_id IS NULL
                    AND v.branch_id = ANY (app.scope_branch_ids('visit.update', 'OWN')))) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์แก้ visit นี้');
        END IF;
        v_started := least(v_started, v.started_at);
    ELSIF v_open_visit THEN
        IF NOT (v_branch = ANY (app.scope_branch_ids('visit.create', 'OWN'))) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์เปิด visit ในสาขานี้');
        END IF;
    END IF;

    -- ---- 4. คำนวณผู้สมัครซ้ำใหม่ฝั่ง server (19.3 ข้อ 2) ----
    FOR r IN
        SELECT * FROM app.candidate_scores(
            v_branch,
            (SELECT e ->> 'value' FROM jsonb_array_elements(v_contacts) e WHERE e ->> 'contact_type' = 'PHONE' LIMIT 1),
            (SELECT e ->> 'value' FROM jsonb_array_elements(v_contacts) e WHERE e ->> 'contact_type' = 'LINE_ID' LIMIT 1),
            (SELECT e ->> 'value' FROM jsonb_array_elements(v_contacts) e WHERE e ->> 'contact_type' = 'EMAIL' LIMIT 1),
            p ->> 'first_name', p ->> 'last_name')
        ORDER BY score DESC, customer_id
    LOOP
        v_cards := v_cards || jsonb_build_array(app.candidate_card(r.customer_id, r.score, r.rules, r.matched_phone));
        IF r.score > v_top_score THEN
            v_top := r.customer_id; v_top_score := r.score; v_top_rules := r.rules;
        END IF;
    END LOOP;
    IF v_top_score >= 70 AND nullif(p ->> 'duplicate_override_reason_code', '') IS NULL THEN
        PERFORM app.api_invalid('พบลูกค้าที่อาจซ้ำ ต้องเลือกเหตุผลก่อนสร้างลูกค้าใหม่', 'P0001');
    END IF;

    -- ---- 5. สร้างลูกค้า ----
    INSERT INTO crm.customers (customer_no, first_name, last_name, nickname, customer_type, first_seen_at,
                               first_channel_code, first_source_code, first_branch_id, owner_staff_id,
                               province_code, created_via)
    VALUES (NULL, nullif(btrim(coalesce(p ->> 'first_name', '')), ''), nullif(btrim(coalesce(p ->> 'last_name', '')), ''),
            nullif(btrim(coalesce(p ->> 'nickname', '')), ''), coalesce(nullif(p ->> 'customer_type', ''), 'INDIVIDUAL'),
            v_started, v_channel, nullif(p ->> 'source_code', ''), v_branch, v_me,
            nullif(p ->> 'province_code', ''), 'QUICK_CAPTURE')
    RETURNING id, customer_no INTO v_customer, v_cust_no;

    INSERT INTO crm.customer_branches (organization_id, customer_id, branch_id, first_linked_at, last_activity_at, linked_via, created_by, updated_by)
    VALUES (app.current_organization_id(), v_customer, v_branch, v_started, v_started, 'CREATED', v_me, v_me)
    ON CONFLICT (customer_id, branch_id) DO NOTHING;

    -- ---- 6. ช่องทางติดต่อ (ข้อ 6.4) ----
    FOR v_item IN SELECT e FROM jsonb_array_elements(v_contacts) e LOOP
        v_type  := (v_item ->> 'contact_type')::crm.contact_type;
        v_value := btrim(coalesce(v_item ->> 'value', ''));
        CONTINUE WHEN v_value = '';
        IF app.normalize_contact(v_type, v_value) IS NULL THEN
            PERFORM app.api_invalid('ช่องทางติดต่อไม่ถูกต้อง: ' || v_type::text);
        END IF;
        v_first := NOT EXISTS (SELECT 1 FROM crm.customer_contacts ct
                               WHERE ct.customer_id = v_customer AND ct.contact_type = v_type AND ct.is_active);
        INSERT INTO crm.customer_contacts (customer_id, contact_type, value_raw, is_primary, is_valid)
        VALUES (v_customer, v_type, v_value,
                v_first AND coalesce((v_item ->> 'is_primary')::boolean, true),
                CASE WHEN v_type = 'PHONE' THEN app.is_valid_thai_phone(v_value) ELSE true END)
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- ---- 7. ความยินยอม (ข้อ 10.2 · append-only) ----
    SELECT s.value #>> '{}' INTO v_notice FROM app.settings s WHERE s.key = 'pdpa.current_notice_version';
    v_via := coalesce(nullif(p ->> 'privacy_captured_via', '')::crm.consent_capture_via,
                      CASE WHEN v_channel = 'WALK_IN' THEN 'STAFF_FORM' ELSE 'LINK_SENT' END::crm.consent_capture_via);
    INSERT INTO crm.customer_consents (customer_id, purpose_code, status, notice_version, channels, captured_via, captured_by, captured_at, evidence)
    VALUES (v_customer, 'PRIVACY_NOTICE', 'GRANTED', v_notice, '{}', v_via, v_me, now(),
            coalesce(v_notice, 'PN') || ' · ' || v_via::text || ' · ' || v_channel);
    IF coalesce((v_mkt ->> 'granted')::boolean, false) THEN
        v_evidence := coalesce(v_notice, 'PN') || ' · STAFF_FORM · ช่องทาง '
                   || coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mkt -> 'channels', '[]'::jsonb))), ','), '')
                   || ' · ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม';
        INSERT INTO crm.customer_consents (customer_id, purpose_code, status, notice_version, channels, captured_via, captured_by, captured_at, evidence)
        VALUES (v_customer, 'MARKETING', 'GRANTED', v_notice,
                ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mkt -> 'channels', '[]'::jsonb))),
                'STAFF_FORM', v_me, now(), v_evidence);
    END IF;

    -- ---- 8. visit + interaction ต้นทาง (ข้อ 3.3 · 6.2 ข้อ 1) ----
    IF v_visit_id IS NOT NULL THEN
        UPDATE crm.visits SET customer_id = v_customer, updated_by = v_me WHERE id = v_visit_id;
        UPDATE crm.interactions SET customer_id = v_customer, updated_by = v_me
        WHERE visit_id = v_visit_id AND is_visit_root AND customer_id IS NULL
        RETURNING id INTO v_root_id;
        SELECT visit_no, queue_no INTO v_visit_no, v_queue FROM crm.visits WHERE id = v_visit_id;
    ELSIF v_open_visit THEN
        INSERT INTO crm.visits (visit_no, branch_id, channel_code, status, party_size, customer_id, interest_code,
                                source_code, started_at, service_started_at, owner_staff_id)
        VALUES (NULL, v_branch, v_channel,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN 'WAITING' ELSE 'IN_SERVICE' END::crm.visit_status,
                coalesce((p ->> 'party_size')::integer, 1), v_customer, v_interest,
                nullif(p ->> 'source_code', ''), v_started,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN NULL ELSE v_started END,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN NULL ELSE v_me END)
        RETURNING id, visit_no, queue_no INTO v_visit_id, v_visit_no, v_queue;
    END IF;
    IF v_visit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm.interactions i WHERE i.visit_id = v_visit_id AND i.is_visit_root) THEN
        INSERT INTO crm.interactions (customer_id, visit_id, is_visit_root, branch_id, channel_code, direction,
                                      interaction_type_code, occurred_at, owner_staff_id, summary)
        VALUES (v_customer, v_visit_id, true, v_branch, v_channel, 'INBOUND',
                coalesce(nullif(p ->> 'interaction_type_code', ''), CASE WHEN v_channel = 'WALK_IN' THEN 'VISIT' ELSE 'INQUIRY' END),
                v_started, v_me, nullif(p ->> 'summary', ''))
        RETURNING id INTO v_root_id;
    END IF;

    -- ---- 9. lead อัตโนมัติ (ข้อ 6.2 ข้อ 3 · สถานะตามข้อ 4.3) ----
    -- create_lead = false ปิดการสร้าง lead ของคำขอนั้น (ข้อ 20.12 · D52)
    -- ใช้ปิดได้อย่างเดียว เปิดไม่ได้ — ความสนใจที่ creates_lead = false ยังไม่สร้าง lead เหมือนเดิม
    SELECT it.creates_lead INTO v_creates FROM ref.interest_types it WHERE it.code = v_interest;
    SELECT ch.is_live INTO v_is_live FROM ref.channels ch WHERE ch.code = v_channel;
    IF coalesce(v_creates, false) AND coalesce((p ->> 'create_lead')::boolean, true) THEN
        INSERT INTO crm.leads (lead_no, customer_id, branch_id, owner_staff_id, channel_code, source_code, visit_id,
                               interest_code, product_type_code, product_model, status, priority_code,
                               next_action, next_action_type_code, next_action_at)
        VALUES (NULL, v_customer, v_branch, v_me, v_channel, nullif(p ->> 'source_code', ''), v_visit_id,
                v_interest, nullif(p ->> 'product_type_code', ''), nullif(p ->> 'product_model', ''),
                'NEW', 'NORMAL', 'ติดต่อกลับลูกค้า', 'CALL', now() + interval '30 minutes')
        RETURNING id, lead_no INTO v_lead_id, v_lead_no;
    END IF;

    -- ---- 10. โน้ตแรก (ข้อ 6.2 ข้อ 4) ----
    IF nullif(btrim(coalesce(p ->> 'note', '')), '') IS NOT NULL THEN
        INSERT INTO crm.customer_notes (customer_id, interaction_id, branch_id, body, is_pinned)
        VALUES (v_customer, v_root_id, v_branch, btrim(p ->> 'note'), coalesce((p ->> 'note_pinned')::boolean, false));
    END IF;

    -- ---- 11. ข้อมูลซ้ำที่ผู้ใช้ยืนยันว่าสร้างใหม่ (ข้อ 6.5) ----
    IF v_top_score >= 70 THEN
        INSERT INTO crm.duplicate_decisions (customer_id, candidate_customer_id, score, matched_rules,
                                             override_reason_code, override_note, status, created_by)
        VALUES (v_customer, v_top, v_top_score, v_top_rules, p ->> 'duplicate_override_reason_code',
                nullif(p ->> 'duplicate_override_note', ''), 'PENDING', v_me)
        RETURNING id INTO v_decision;
    END IF;

    RETURN jsonb_build_object(
        'ok', true, 'customer_id', v_customer, 'customer_no', v_cust_no,
        'visit_id', v_visit_id, 'visit_no', v_visit_no, 'queue_no', v_queue,
        'interaction_id', v_root_id, 'lead_id', v_lead_id, 'lead_no', v_lead_no,
        'duplicate_decision_id', v_decision, 'candidates', v_cards);
END;
$$;

-- ข้อ 6.5 — ตรวจซ้ำก่อนสร้าง
CREATE FUNCTION api.find_customer_candidates(
    p_visit_id   uuid,
    p_phone      text,
    p_line_id    text,
    p_email      text,
    p_first_name text DEFAULT NULL,
    p_last_name  text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('customer.create');
    v_branch uuid;
    v_rate   jsonb;
    v_cards  jsonb := '[]'::jsonb;
    v_ids    uuid[] := '{}';
    v_hashes text[];
    v_miss   jsonb;
    v        crm.visits%ROWTYPE;
    r        record;
BEGIN
    IF cardinality(app.scope_branch_ids('customer.create', 'OWN')) = 0 THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์สร้างลูกค้า');
    END IF;
    IF coalesce(btrim(p_phone), '') = '' AND coalesce(btrim(p_line_id), '') = '' AND coalesce(btrim(p_email), '') = '' THEN
        PERFORM app.api_invalid('ต้องส่งตัวระบุเต็มอย่างน้อย 1 อย่าง (เบอร์โทร · LINE ID · อีเมล)');
    END IF;
    IF p_visit_id IS NOT NULL THEN
        SELECT * INTO v FROM crm.visits WHERE id = p_visit_id;
        IF NOT FOUND
           OR v.status NOT IN ('WAITING', 'IN_SERVICE')
           OR NOT (v.branch_id = ANY (app.scope_branch_ids('visit.update', 'OWN')))
           OR v.created_at < now() - interval '4 hours' THEN
            PERFORM app.api_denied('visit นี้ใช้ตรวจซ้ำไม่ได้');
        END IF;
        v_branch := v.branch_id;
    ELSE
        v_branch := (app.scope_branch_ids('customer.create', 'OWN'))[1];
    END IF;

    v_rate := app.rate_limit_hit('security.search_per_hour');
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        PERFORM app.emit_notification(ba, 'SEARCH_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                      'ค้นหาลูกค้าเกินเกณฑ์ที่กำหนด')
        FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        RETURN jsonb_build_object('ok', false, 'code', 'SEARCH_LIMIT_EXCEEDED', 'count', 0, 'candidates', '[]'::jsonb);
    END IF;

    v_hashes := ARRAY(SELECT app.sha256_hex(x) FROM unnest(ARRAY[
                          app.normalize_contact('PHONE'::crm.contact_type, p_phone),
                          app.normalize_contact('LINE_ID'::crm.contact_type, p_line_id),
                          app.normalize_contact('EMAIL'::crm.contact_type, p_email)]) AS x WHERE x IS NOT NULL);

    FOR r IN
        SELECT * FROM app.candidate_scores(v_branch, p_phone, p_line_id, p_email, p_first_name, p_last_name)
        ORDER BY score DESC, customer_id
    LOOP
        v_cards := v_cards || jsonb_build_array(app.candidate_card(r.customer_id, r.score, r.rules, r.matched_phone));
        v_ids := v_ids || r.customer_id;
    END LOOP;

    IF cardinality(v_ids) = 0 THEN
        v_miss := app.rate_limit_hit('security.search_miss_per_hour');
        IF NOT (v_miss ->> 'allowed')::boolean THEN
            PERFORM app.rate_limit_block('security.search_miss_per_hour', now() + interval '1 hour');
            PERFORM app.emit_notification(ba, 'SEARCH_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                          'ค้นด้วยตัวระบุที่ไม่พบผลเกินเกณฑ์ · บล็อก 1 ชั่วโมง')
            FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        END IF;
    END IF;

    PERFORM app.write_access_log('CUSTOMER_CANDIDATE_SEARCH', NULL, NULL, p_visit_id, v_branch, NULL,
                                 v_hashes, cardinality(v_ids),
                                 jsonb_build_object('candidate_ids', to_jsonb(v_ids)));
    RETURN jsonb_build_object('ok', true, 'count', cardinality(v_ids), 'candidates', v_cards);
END;
$$;

-- ข้อ 6.5 — ค้นหาทั่วไป (แถบบนและหน้ารายการ)
CREATE FUNCTION api.search_customers(p_term text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_staff();
    v_term     text := btrim(coalesce(p_term, ''));
    v_rate     jsonb;
    v_phone    text;
    v_email    text;
    v_line     text;
    v_hashes   text[];
    v_cust     jsonb := '[]'::jsonb;
    v_leads    jsonb := '[]'::jsonb;
    v_opps     jsonb := '[]'::jsonb;
    v_quots    jsonb := '[]'::jsonb;
    v_txns     jsonb := '[]'::jsonb;
    v_ids      uuid[] := '{}';
    v_total    integer := 0;
    v_miss     jsonb;
    v_is_ident boolean;
BEGIN
    IF char_length(v_term) < 3 THEN
        PERFORM app.api_invalid('คำค้นต้องมีอย่างน้อย 3 ตัวอักษร');
    END IF;
    v_rate := app.rate_limit_hit('security.search_per_hour');
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        PERFORM app.emit_notification(ba, 'SEARCH_LIMIT_EXCEEDED', 'STAFF', v_me, NULL, 'ค้นหาลูกค้าเกินเกณฑ์ที่กำหนด')
        FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        RETURN jsonb_build_object('ok', false, 'code', 'SEARCH_LIMIT_EXCEEDED', 'groups', '{}'::jsonb);
    END IF;

    v_phone := CASE WHEN v_term ~ '^[0-9+(). -]+$' THEN app.normalize_contact('PHONE'::crm.contact_type, v_term) END;
    v_email := CASE WHEN v_term ~ '@' THEN app.normalize_contact('EMAIL'::crm.contact_type, v_term) END;
    v_line  := CASE WHEN v_term !~ '@' AND v_term !~ '^[0-9+(). -]+$' THEN app.normalize_contact('LINE_ID'::crm.contact_type, v_term) END;
    v_is_ident := v_phone IS NOT NULL OR v_email IS NOT NULL
               OR v_term ~ '^(CUS|LD|OP|QT)-' OR v_term ~ '^[0-9]{15}$';
    v_hashes := ARRAY(SELECT app.sha256_hex(x) FROM unnest(ARRAY[v_phone, v_email, v_line]) AS x WHERE x IS NOT NULL);

    -- ลูกค้า: ค่า contact ตรงทั้งค่าเท่านั้น · ชื่อใช้ trigram (ข้อ 6.5)
    SELECT coalesce(jsonb_agg(x.card ORDER BY x.rank, x.customer_no), '[]'::jsonb), coalesce(array_agg(x.id), '{}')
    INTO v_cust, v_ids
    FROM (
        SELECT c.id, c.customer_no,
               CASE WHEN ct.id IS NOT NULL THEN 0 ELSE 1 END AS rank,
               jsonb_build_object('customer_id', c.id, 'customer_no', c.customer_no, 'display_name', c.display_name,
                                  'lifecycle_stage', c.lifecycle_stage, 'record_status', c.record_status,
                                  'value_masked', ct.value_masked, 'last_activity_at', c.last_activity_at,
                                  'last_channel_code', c.last_channel_code) AS card
        FROM crm.customers c
        LEFT JOIN LATERAL (
            SELECT ct2.id, ct2.value_masked FROM crm.customer_contacts ct2
            WHERE ct2.customer_id = c.id AND ct2.is_active
              AND ((v_phone IS NOT NULL AND ct2.contact_type = 'PHONE' AND ct2.value_normalized = v_phone)
                OR (v_email IS NOT NULL AND ct2.contact_type = 'EMAIL' AND ct2.value_normalized = v_email)
                OR (v_line  IS NOT NULL AND ct2.contact_type IN ('LINE_ID', 'LINE_USER_ID') AND ct2.value_normalized = v_line))
            LIMIT 1) ct ON true
        WHERE c.id IN (SELECT app.readable_customer_ids())
          AND (ct.id IS NOT NULL
               OR c.customer_no = upper(v_term)
               OR (c.name_search <> '' AND extensions.similarity(c.name_search, lower(v_term)) >= 0.3))
        LIMIT 20) x;

    SELECT coalesce(jsonb_agg(jsonb_build_object('lead_id', l.id, 'lead_no', l.lead_no, 'customer_id', l.customer_id,
                                                 'status', l.status, 'branch_id', l.branch_id) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO v_leads
    FROM crm.leads l
    WHERE (l.lead_no = upper(v_term) OR l.customer_id = ANY (v_ids))
      AND (app.can_access_record('lead.read', l.branch_id, l.owner_staff_id, l.created_by)
           OR l.customer_id IN (SELECT app.readable_customer_ids()));

    SELECT coalesce(jsonb_agg(jsonb_build_object('opportunity_id', o.id, 'opportunity_no', o.opportunity_no,
                                                 'customer_id', o.customer_id, 'stage', o.stage,
                                                 'branch_id', o.branch_id) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO v_opps
    FROM crm.opportunities o
    WHERE (o.opportunity_no = upper(v_term) OR o.customer_id = ANY (v_ids))
      AND (app.can_access_record('opportunity.read', o.branch_id, o.owner_staff_id, o.created_by)
           OR o.customer_id IN (SELECT app.readable_customer_ids()));

    SELECT coalesce(jsonb_agg(jsonb_build_object('quotation_id', q.id, 'quotation_no', q.quotation_no,
                                                 'customer_id', q.customer_id, 'status', q.status,
                                                 'branch_id', q.branch_id) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_quots
    FROM crm.quotations q
    WHERE (q.quotation_no = upper(v_term) OR q.customer_id = ANY (v_ids))
      AND (app.can_access_record('quotation.read', q.branch_id, q.owner_staff_id, q.created_by)
           OR q.customer_id IN (SELECT app.readable_customer_ids()));

    SELECT coalesce(jsonb_agg(jsonb_build_object('transaction_ref_id', t.id, 'external_no', t.external_no,
                                                 'customer_id', t.customer_id, 'transaction_type_code', t.transaction_type_code,
                                                 'branch_id', t.branch_id) ORDER BY t.transacted_at DESC), '[]'::jsonb)
    INTO v_txns
    FROM crm.transaction_refs t
    WHERE (t.external_no = v_term OR (v_term ~ '^[0-9]{15}$' AND t.device_imei = v_term) OR t.customer_id = ANY (v_ids))
      AND (app.can_access_record('transaction.read', t.branch_id, NULL, t.created_by)
           OR t.customer_id IN (SELECT app.readable_customer_ids()));

    v_total := jsonb_array_length(v_cust) + jsonb_array_length(v_leads) + jsonb_array_length(v_opps)
             + jsonb_array_length(v_quots) + jsonb_array_length(v_txns);

    IF v_total = 0 AND v_is_ident THEN
        v_miss := app.rate_limit_hit('security.search_miss_per_hour');
        IF NOT (v_miss ->> 'allowed')::boolean THEN
            PERFORM app.rate_limit_block('security.search_miss_per_hour', now() + interval '1 hour');
            PERFORM app.emit_notification(ba, 'SEARCH_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                          'ค้นด้วยตัวระบุที่ไม่พบผลเกินเกณฑ์ · บล็อก 1 ชั่วโมง')
            FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        END IF;
    END IF;

    PERFORM app.write_access_log('CUSTOMER_SEARCH', NULL, NULL, NULL, NULL, NULL, v_hashes, v_total, NULL);
    RETURN jsonb_build_object('ok', true, 'count', v_total, 'groups', jsonb_build_object(
        'customers', v_cust, 'leads', v_leads, 'opportunities', v_opps, 'quotations', v_quots, 'transactions', v_txns));
END;
$$;

-- ข้อ 6.6 — ผูกลูกค้าที่ยังมองไม่เห็นเข้าสาขา (ทางเดียว)
CREATE FUNCTION api.link_customer_to_branch(p_customer_id uuid, p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me    uuid := app.require_staff();
    v       crm.visits%ROWTYPE;
    c       crm.customers%ROWTYPE;
    v_rate  jsonb;
BEGIN
    SELECT * INTO v FROM crm.visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND
       OR NOT (v.branch_id = ANY (app.scope_branch_ids('visit.update', 'OWN')))
       OR v.status NOT IN ('WAITING', 'IN_SERVICE')
       OR v.created_at < now() - interval '4 hours' THEN
        PERFORM app.api_denied('visit นี้ผูกลูกค้าไม่ได้ (ต้องเป็น visit ที่เปิดอยู่ในสาขาของคุณ ภายใน 4 ชั่วโมง)');
    END IF;
    IF v.customer_id IS NOT NULL THEN
        PERFORM app.api_invalid('visit นี้ระบุลูกค้าแล้ว', 'P0001');
    END IF;
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id;
    IF NOT FOUND OR c.record_status <> 'ACTIVE' OR c.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบลูกค้ารายนี้');
    END IF;
    -- ลูกค้าต้องถูกคืนจาก find_customer_candidates ของผู้เรียกสำหรับ visit นี้ภายใน 30 นาที
    IF NOT EXISTS (
        SELECT 1 FROM audit.access_logs a
        WHERE a.action = 'CUSTOMER_CANDIDATE_SEARCH'
          AND a.actor_staff_id = v_me
          AND a.visit_id = p_visit_id
          AND a.occurred_at > now() - interval '30 minutes'
          AND a.detail -> 'candidate_ids' @> to_jsonb(p_customer_id::text)) THEN
        PERFORM app.api_denied('ต้องเลือกลูกค้าจากผลตรวจซ้ำของ visit นี้ภายใน 30 นาที');
    END IF;

    INSERT INTO crm.customer_branches AS cb (organization_id, customer_id, branch_id, first_linked_at, last_activity_at,
                                             linked_via, created_by, updated_by)
    VALUES (c.organization_id, p_customer_id, v.branch_id, now(), now(), 'MANUAL_LINK', v_me, v_me)
    ON CONFLICT (customer_id, branch_id) DO UPDATE SET last_activity_at = greatest(cb.last_activity_at, excluded.last_activity_at);

    UPDATE crm.visits SET customer_id = p_customer_id, updated_by = v_me WHERE id = p_visit_id;
    UPDATE crm.interactions SET customer_id = p_customer_id, updated_by = v_me
    WHERE visit_id = p_visit_id AND is_visit_root AND customer_id IS NULL;

    PERFORM app.write_access_log('CUSTOMER_LINKED_TO_BRANCH', p_customer_id, NULL, p_visit_id, v.branch_id, NULL, NULL, 1, NULL);

    v_rate := app.rate_limit_hit('security.link_per_day', true);
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        PERFORM app.emit_notification(bm, 'LINK_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                      'ผูกลูกค้าข้ามสาขาเกิน ' || (v_rate ->> 'limit') || ' ครั้งในวันนี้')
        FROM app.staff_ids_with_role('BRANCH_MANAGER', v.branch_id) AS bm;
    END IF;

    RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id, 'customer_no', c.customer_no,
                              'branch_id', v.branch_id, 'visit_id', p_visit_id,
                              'link_count_today', v_rate ->> 'hit_count');
END;
$$;


-- =====================================================================================
-- บล็อก E — Customer 360 · เปิดค่าเต็ม · แก้ช่องทางติดต่อ/ที่อยู่ · ความยินยอม
-- =====================================================================================

-- ข้อ 6.8 — หัว + ตัวเลขสรุป + นัดติดตามถัดไป + สินค้าที่สนใจ + สรุปแท็บ · เขียน CUSTOMER_VIEWED
CREATE FUNCTION api.get_customer_360(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    c        crm.customers%ROWTYPE;
    v_rate   jsonb;
    v_out    jsonb;
    v_days   integer := app.setting_int('badge.new_customer_days', 30);
BEGIN
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id;
    IF NOT FOUND OR NOT app.can_access_customer('customer.read', p_customer_id) THEN
        PERFORM app.api_denied('ไม่พบลูกค้ารายนี้');            -- ไม่บอกว่ามีแถวอยู่แต่ไม่มีสิทธิ์ (F5)
    END IF;

    v_out := jsonb_build_object(
        'ok', true,
        'header', jsonb_build_object(
            'customer_id', c.id, 'customer_no', c.customer_no, 'display_name', c.display_name,
            'first_name', c.first_name, 'last_name', c.last_name, 'nickname', c.nickname,
            'lifecycle_stage', c.lifecycle_stage, 'record_status', c.record_status, 'merged_into_id', c.merged_into_id,
            'legal_hold', c.legal_hold, 'province_code', c.province_code,
            'first_channel_code', c.first_channel_code, 'first_source_code', c.first_source_code,
            'first_branch_id', c.first_branch_id, 'first_seen_at', c.first_seen_at,
            'last_activity_at', c.last_activity_at, 'last_channel_code', c.last_channel_code,
            'owner_staff_id', c.owner_staff_id,
            'owner_display_name', (SELECT s.display_name FROM core.staff_profiles s WHERE s.id = c.owner_staff_id),
            'badges', jsonb_build_object(
                'vip',          EXISTS (SELECT 1 FROM crm.customer_tags ct JOIN crm.tags t ON t.id = ct.tag_id
                                        WHERE ct.customer_id = c.id AND t.code = 'VIP'),
                'followingUp',  c.has_open_followup,
                -- "30 วันล่าสุด" ตามขอบวันธุรกิจข้อ 1.2 (ค่า badge.new_customer_days)
                'newCustomer',  app.bangkok_date(c.first_seen_at) > app.bangkok_date(app.clock()) - v_days,
                'notContacted', c.has_new_lead),
            'note_summary', c.note_summary),
        'counters', app.customer_counters(p_customer_id),
        'contacts', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'contact_id', ct.id, 'contact_type', ct.contact_type, 'value_masked', ct.value_masked,
                                'is_primary', ct.is_primary, 'is_valid', ct.is_valid, 'is_active', ct.is_active)
                                ORDER BY ct.contact_type, ct.is_primary DESC), '[]'::jsonb)
                     FROM crm.customer_contacts ct WHERE ct.customer_id = c.id),
        'addresses', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'address_id', a.id, 'district', a.district, 'province_code', a.province_code,
                                'value_masked', a.value_masked, 'is_primary', a.is_primary, 'is_active', a.is_active)
                                ORDER BY a.is_primary DESC), '[]'::jsonb)
                      FROM crm.customer_addresses a WHERE a.customer_id = c.id),
        'tags', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'label_th', t.label_th) ORDER BY t.code), '[]'::jsonb)
                 FROM crm.customer_tags ct JOIN crm.tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id),
        'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', b.id, 'code', b.code, 'name_th', b.name_th,
                                                                  'first_linked_at', cb.first_linked_at,
                                                                  'last_activity_at', cb.last_activity_at)
                                               ORDER BY cb.first_linked_at), '[]'::jsonb)
                     FROM crm.customer_branches cb JOIN core.branches b ON b.id = cb.branch_id WHERE cb.customer_id = c.id),
        'consents', (SELECT coalesce(jsonb_agg(jsonb_build_object('purpose_code', cc.purpose_code, 'status', cc.status,
                                                                  'channels', to_jsonb(cc.channels), 'captured_at', cc.captured_at,
                                                                  'notice_version', cc.notice_version) ORDER BY cc.purpose_code), '[]'::jsonb)
                     FROM crm.customer_consent_current cc WHERE cc.customer_id = c.id),
        'pinned_notes', (SELECT coalesce(jsonb_agg(jsonb_build_object('note_id', n.id, 'body', n.body, 'created_at', n.created_at,
                                                                      'created_by', n.created_by) ORDER BY n.created_at DESC), '[]'::jsonb)
                         FROM crm.customer_notes n WHERE n.customer_id = c.id AND n.is_pinned),
        'next_followup', (SELECT jsonb_build_object('source', x.src, 'entity_id', x.id, 'entity_ref', x.ref,
                                                    'next_action', x.act, 'next_action_type_code', x.typ,
                                                    'next_action_at', x.at, 'owner_staff_id', x.owner)
                          FROM (SELECT 'LEAD' AS src, l.id, l.lead_no AS ref, l.next_action AS act,
                                       l.next_action_type_code AS typ, l.next_action_at AS at, l.owner_staff_id AS owner
                                FROM crm.leads l WHERE l.customer_id = c.id AND l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')
                                UNION ALL
                                SELECT 'OPPORTUNITY', o.id, o.opportunity_no, o.next_action, o.next_action_type_code,
                                       o.next_action_at, o.owner_staff_id
                                FROM crm.opportunities o WHERE o.customer_id = c.id AND o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')) x
                          ORDER BY x.at LIMIT 1),
        -- สินค้าที่สนใจ: HOT → WARM → COLD แล้วตาม updated_at ล่าสุด สูงสุด 3 รายการ (ข้อ 6.8)
        'interests', (SELECT coalesce(jsonb_agg(jsonb_build_object('product_model', y.model, 'product_type_code', y.ptype,
                                                                   'interest_level', y.lvl, 'source', y.src, 'entity_ref', y.ref)), '[]'::jsonb)
                      FROM (SELECT z.model, z.ptype, z.lvl, z.src, z.ref
                            FROM (SELECT l.product_model AS model, l.product_type_code AS ptype, l.interest_level AS lvl,
                                         'LEAD' AS src, l.lead_no AS ref, l.updated_at AS upd
                                  FROM crm.leads l
                                  WHERE l.customer_id = c.id AND l.status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND l.product_model IS NOT NULL
                                  UNION ALL
                                  SELECT i.product_model, i.product_type_code, i.interest_level, 'OPPORTUNITY', o.opportunity_no, o.updated_at
                                  FROM crm.opportunities o JOIN crm.opportunity_items i ON i.opportunity_id = o.id
                                  WHERE o.customer_id = c.id AND o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP') AND i.product_model IS NOT NULL) z
                            ORDER BY (CASE z.lvl WHEN 'HOT' THEN 1 WHEN 'WARM' THEN 2 WHEN 'COLD' THEN 3 ELSE 4 END), z.upd DESC
                            LIMIT 3) y),
        'tabs', jsonb_build_object(
            'interactions',  (SELECT count(*) FROM crm.interactions i WHERE i.customer_id = c.id),
            'purchases',     (SELECT count(*) FROM crm.opportunities o WHERE o.customer_id = c.id AND o.stage = 'WON')
                           + (SELECT count(*) FROM crm.transaction_refs t WHERE t.customer_id = c.id),
            'leads',         (SELECT count(*) FROM crm.leads l WHERE l.customer_id = c.id),
            'opportunities', (SELECT count(*) FROM crm.opportunities o WHERE o.customer_id = c.id),
            'quotations',    (SELECT count(*) FROM crm.quotations q WHERE q.customer_id = c.id),
            'tasks',         (SELECT count(*) FROM crm.tasks t WHERE t.customer_id = c.id
                                AND app.can_access_record('task.read', t.branch_id, t.owner_staff_id, t.created_by)),
            'notes',         (SELECT count(*) FROM crm.customer_notes n WHERE n.customer_id = c.id),
            'documents',     (SELECT count(*) FROM crm.quotations q WHERE q.customer_id = c.id AND q.status <> 'DRAFT')
                           + (SELECT count(*) FROM crm.transaction_refs t WHERE t.customer_id = c.id),
            'can_view_history', app.can_access_customer('customer.update', c.id)));

    PERFORM app.write_access_log('CUSTOMER_VIEWED', c.id, NULL, NULL, c.last_branch_id, NULL, NULL, 1, NULL);
    v_rate := app.rate_limit_hit('security.customer_view_per_hour');
    IF NOT (v_rate ->> 'allowed')::boolean THEN                 -- แจ้งเท่านั้น ไม่บล็อก (ข้อ 11.1)
        PERFORM app.emit_notification(ba, 'CUSTOMER_VIEW_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                      'เปิดดูลูกค้าเกิน ' || (v_rate ->> 'limit') || ' รายในหนึ่งชั่วโมง')
        FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
    END IF;
    RETURN v_out;
END;
$$;

-- ข้อ 6.4 — ค่าเต็มของช่องทางติดต่อได้ทางเดียว
CREATE FUNCTION api.reveal_contact(p_contact_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_staff();
    ct     crm.customer_contacts%ROWTYPE;
    v_rate jsonb;
BEGIN
    IF p_purpose IS NULL OR p_purpose NOT IN ('VIEW', 'CALL', 'COPY', 'LINE_OPEN') THEN
        PERFORM app.api_invalid('purpose ต้องเป็น VIEW · CALL · COPY หรือ LINE_OPEN');
    END IF;
    SELECT * INTO ct FROM crm.customer_contacts WHERE id = p_contact_id;
    IF NOT FOUND OR NOT app.can_access_customer('customer.pii.reveal', ct.customer_id) THEN
        PERFORM app.api_denied('ไม่พบช่องทางติดต่อนี้');
    END IF;
    v_rate := app.rate_limit_hit('security.reveal_per_hour');
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        -- ข้อ 6.4 v2.2: ปฏิเสธแบบไม่ raise เพื่อให้ตัวนับและการแจ้งเตือนถูก commit
        PERFORM app.emit_notification(ba, 'REVEAL_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                      'เปิดค่าเต็มของช่องทางติดต่อเกิน ' || (v_rate ->> 'limit') || ' ครั้งในหนึ่งชั่วโมง')
        FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        RETURN jsonb_build_object('ok', false, 'code', 'REVEAL_LIMIT_EXCEEDED', 'hit_count', v_rate ->> 'hit_count');
    END IF;
    PERFORM app.write_access_log('CONTACT_REVEALED', ct.customer_id, ct.id, NULL, NULL, p_purpose, NULL, 1, NULL);
    RETURN jsonb_build_object('ok', true, 'contact_id', ct.id, 'contact_type', ct.contact_type,
                              'value_raw', ct.value_raw, 'value_normalized', ct.value_normalized,
                              'auto_hide_seconds', 30);
END;
$$;

-- ข้อ 6.4 · 19.1 ข้อ 5 — ที่อยู่เต็ม
-- หมายเหตุผู้เขียน (rls-spec H5): audit.access_logs บังคับ contact_id เมื่อ action = CONTACT_REVEALED
-- จึงบันทึก address_id ในคอลัมน์ contact_id และระบุชนิดใน detail จนกว่าจะมี action เฉพาะของที่อยู่
CREATE FUNCTION api.reveal_address(p_address_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_staff();
    a      crm.customer_addresses%ROWTYPE;
    v_rate jsonb;
BEGIN
    IF p_purpose IS NULL OR p_purpose NOT IN ('VIEW', 'CALL', 'COPY', 'LINE_OPEN') THEN
        PERFORM app.api_invalid('purpose ต้องเป็น VIEW · CALL · COPY หรือ LINE_OPEN');
    END IF;
    SELECT * INTO a FROM crm.customer_addresses WHERE id = p_address_id;
    IF NOT FOUND OR NOT app.can_access_customer('customer.pii.reveal', a.customer_id) THEN
        PERFORM app.api_denied('ไม่พบที่อยู่นี้');
    END IF;
    v_rate := app.rate_limit_hit('security.reveal_per_hour');
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        PERFORM app.emit_notification(ba, 'REVEAL_LIMIT_EXCEEDED', 'STAFF', v_me, NULL,
                                      'เปิดค่าเต็มเกิน ' || (v_rate ->> 'limit') || ' ครั้งในหนึ่งชั่วโมง')
        FROM app.staff_ids_with_role('BUSINESS_ADMIN') AS ba;
        RETURN jsonb_build_object('ok', false, 'code', 'REVEAL_LIMIT_EXCEEDED', 'hit_count', v_rate ->> 'hit_count');
    END IF;
    PERFORM app.write_access_log('CONTACT_REVEALED', a.customer_id, a.id, NULL, NULL, p_purpose, NULL, 1,
                                 jsonb_build_object('kind', 'ADDRESS'));
    RETURN jsonb_build_object('ok', true, 'address_id', a.id, 'address_line', a.address_line, 'subdistrict', a.subdistrict,
                              'district', a.district, 'province_code', a.province_code, 'postal_code', a.postal_code,
                              'auto_hide_seconds', 30);
END;
$$;

-- ข้อ 6.4 — เพิ่ม/แก้ช่องทางติดต่อ
CREATE FUNCTION api.save_contact(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_staff();
    v_id       uuid := nullif(p ->> 'contact_id', '')::uuid;
    v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
    v_type     crm.contact_type;
    v_value    text := btrim(coalesce(p ->> 'value', ''));
    v_primary  boolean := coalesce((p ->> 'is_primary')::boolean, false);
    v_active   boolean := coalesce((p ->> 'is_active')::boolean, true);
    ct         crm.customer_contacts%ROWTYPE;
BEGIN
    IF v_id IS NOT NULL THEN
        SELECT * INTO ct FROM crm.customer_contacts WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN
            PERFORM app.api_denied('ไม่พบช่องทางติดต่อนี้');
        END IF;
        v_customer := ct.customer_id;
        v_type := coalesce(nullif(p ->> 'contact_type', '')::crm.contact_type, ct.contact_type);
        v_value := coalesce(nullif(v_value, ''), ct.value_raw);
    ELSE
        v_type := nullif(p ->> 'contact_type', '')::crm.contact_type;
    END IF;
    IF v_customer IS NULL OR v_type IS NULL OR v_value = '' THEN
        PERFORM app.api_invalid('ต้องระบุ customer_id · contact_type · value');
    END IF;
    IF NOT app.can_access_customer('customer.update', v_customer) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์แก้ข้อมูลลูกค้ารายนี้');
    END IF;
    IF (SELECT c.record_status FROM crm.customers c WHERE c.id = v_customer) <> 'ACTIVE' THEN
        PERFORM app.transition_denied('T02');
    END IF;
    IF app.normalize_contact(v_type, v_value) IS NULL THEN
        PERFORM app.api_invalid('ค่าช่องทางติดต่อไม่ถูกต้อง');
    END IF;
    IF v_primary THEN
        UPDATE crm.customer_contacts SET is_primary = false, updated_by = v_me
        WHERE customer_id = v_customer AND contact_type = v_type AND is_primary AND (v_id IS NULL OR id <> v_id);
    END IF;
    IF v_id IS NULL THEN
        INSERT INTO crm.customer_contacts (customer_id, contact_type, value_raw, is_primary, is_active, is_valid, verified_at)
        VALUES (v_customer, v_type, v_value, v_primary, v_active,
                CASE WHEN v_type = 'PHONE' THEN app.is_valid_thai_phone(v_value) ELSE true END,
                CASE WHEN coalesce((p ->> 'verified')::boolean, false) THEN now() END)
        RETURNING id INTO v_id;
    ELSE
        UPDATE crm.customer_contacts
        SET value_raw   = v_value,
            contact_type = v_type,
            is_primary  = v_primary,
            is_active   = v_active,
            is_valid    = CASE WHEN v_type = 'PHONE' THEN app.is_valid_thai_phone(v_value) ELSE true END,
            verified_at = CASE WHEN coalesce((p ->> 'verified')::boolean, false) THEN coalesce(verified_at, now()) ELSE verified_at END,
            updated_by  = v_me
        WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'contact_id', v_id, 'customer_id', v_customer,
                              'value_masked', (SELECT x.value_masked FROM crm.customer_contacts x WHERE x.id = v_id));
END;
$$;

-- ข้อ 6.4 · 19.1 ข้อ 5 — เพิ่ม/แก้ที่อยู่
CREATE FUNCTION api.save_address(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_staff();
    v_id       uuid := nullif(p ->> 'address_id', '')::uuid;
    v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
    a          crm.customer_addresses%ROWTYPE;
    v_line     text := btrim(coalesce(p ->> 'address_line', ''));
    v_district text := nullif(p ->> 'district', '');
    v_province text := nullif(p ->> 'province_code', '');
    v_masked   text;
BEGIN
    IF v_id IS NOT NULL THEN
        SELECT * INTO a FROM crm.customer_addresses WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN
            PERFORM app.api_denied('ไม่พบที่อยู่นี้');
        END IF;
        v_customer := a.customer_id;
        v_line     := coalesce(nullif(v_line, ''), a.address_line);
        v_district := coalesce(v_district, a.district);
        v_province := coalesce(v_province, a.province_code);
    END IF;
    IF v_customer IS NULL OR v_line = '' THEN
        PERFORM app.api_invalid('ต้องระบุ customer_id และ address_line');
    END IF;
    IF NOT app.can_access_customer('customer.update', v_customer) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์แก้ข้อมูลลูกค้ารายนี้');
    END IF;
    IF (SELECT c.record_status FROM crm.customers c WHERE c.id = v_customer) <> 'ACTIVE' THEN
        PERFORM app.transition_denied('T02');
    END IF;
    v_masked := btrim(coalesce(v_district, '') || CASE WHEN v_district IS NOT NULL AND v_province IS NOT NULL THEN ' · ' ELSE '' END
                      || coalesce((SELECT pr.label_th FROM ref.provinces pr WHERE pr.code = v_province), ''));
    v_masked := coalesce(nullif(v_masked, ''), '—');
    IF coalesce((p ->> 'is_primary')::boolean, false) THEN
        UPDATE crm.customer_addresses SET is_primary = false, updated_by = v_me
        WHERE customer_id = v_customer AND is_primary AND (v_id IS NULL OR id <> v_id);
    END IF;
    IF v_id IS NULL THEN
        INSERT INTO crm.customer_addresses (customer_id, address_line, subdistrict, district, province_code, postal_code,
                                            value_masked, is_primary, is_active)
        VALUES (v_customer, v_line, nullif(p ->> 'subdistrict', ''), v_district, v_province, nullif(p ->> 'postal_code', ''),
                v_masked, coalesce((p ->> 'is_primary')::boolean, false), coalesce((p ->> 'is_active')::boolean, true))
        RETURNING id INTO v_id;
    ELSE
        UPDATE crm.customer_addresses
        SET address_line = v_line, subdistrict = coalesce(nullif(p ->> 'subdistrict', ''), subdistrict),
            district = v_district, province_code = v_province,
            postal_code = coalesce(nullif(p ->> 'postal_code', ''), postal_code),
            value_masked = v_masked, is_primary = coalesce((p ->> 'is_primary')::boolean, is_primary),
            is_active = coalesce((p ->> 'is_active')::boolean, is_active), updated_by = v_me
        WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'address_id', v_id, 'customer_id', v_customer, 'value_masked', v_masked);
END;
$$;

-- ข้อ 10.2 — บันทึกความยินยอม (append-only)
CREATE FUNCTION api.record_consent(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_staff();
    v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
    v_purpose  text := nullif(p ->> 'purpose_code', '');
    v_status   crm.consent_status := coalesce(nullif(p ->> 'status', ''), 'GRANTED')::crm.consent_status;
    v_via      crm.consent_capture_via := coalesce(nullif(p ->> 'captured_via', ''), 'STAFF_FORM')::crm.consent_capture_via;
    v_channels text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p -> 'channels', '[]'::jsonb)));
    v_notice   text;
    v_evidence text;
    v_id       uuid;
BEGIN
    IF v_customer IS NULL OR v_purpose IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุ customer_id และ purpose_code');
    END IF;
    IF NOT app.can_access_customer('customer.consent.manage', v_customer) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์บันทึกความยินยอมของลูกค้ารายนี้');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.consent_purposes cp WHERE cp.code = v_purpose AND cp.is_active) THEN
        PERFORM app.api_invalid('purpose_code ไม่ถูกต้อง');
    END IF;
    IF (SELECT c.record_status FROM crm.customers c WHERE c.id = v_customer) <> 'ACTIVE' THEN
        PERFORM app.transition_denied('T02');
    END IF;
    SELECT s.value #>> '{}' INTO v_notice FROM app.settings s WHERE s.key = 'pdpa.current_notice_version';
    IF v_purpose = 'MARKETING' AND v_status = 'GRANTED' AND NOT coalesce((p ->> 'age_ack')::boolean, false) THEN
        PERFORM app.api_invalid('ต้องติ๊ก "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"', 'P0001');
    END IF;
    v_evidence := coalesce(nullif(p ->> 'evidence', ''),
                           coalesce(nullif(p ->> 'notice_version', ''), v_notice, 'PN') || ' · ' || v_via::text
                           || CASE WHEN cardinality(v_channels) > 0 THEN ' · ช่องทาง ' || array_to_string(v_channels, ',') ELSE '' END
                           || CASE WHEN v_purpose = 'MARKETING' AND v_status = 'GRANTED'
                                   THEN ' · ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม' ELSE '' END);
    INSERT INTO crm.customer_consents (customer_id, purpose_code, status, notice_version, channels, captured_via,
                                       captured_by, captured_at, evidence)
    VALUES (v_customer, v_purpose, v_status, coalesce(nullif(p ->> 'notice_version', ''), v_notice),
            CASE WHEN v_status = 'GRANTED' THEN v_channels ELSE '{}'::text[] END,
            v_via, v_me, now(), v_evidence)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'consent_id', v_id, 'customer_id', v_customer,
                              'purpose_code', v_purpose, 'status', v_status);
END;
$$;


-- =====================================================================================
-- บล็อก F — รวมลูกค้าและการตัดสินข้อมูลซ้ำ (ข้อ 6.7)
-- =====================================================================================

CREATE FUNCTION app.customer_merge_snapshot(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'customer_id', c.id, 'customer_no', c.customer_no,
        'display_name', app.mask_pii_text(c.display_name),
        'first_name', app.mask_pii_text(c.first_name), 'last_name', app.mask_pii_text(c.last_name),
        'nickname', app.mask_pii_text(c.nickname),
        'customer_type', c.customer_type, 'province_code', c.province_code,
        'first_seen_at', c.first_seen_at, 'first_channel_code', c.first_channel_code,
        'first_source_code', c.first_source_code, 'first_branch_id', c.first_branch_id,
        'owner_staff_id', c.owner_staff_id, 'lifecycle_stage', c.lifecycle_stage,
        'contacts', (SELECT coalesce(jsonb_agg(jsonb_build_object('contact_type', ct.contact_type,
                                                                  'value_masked', ct.value_masked,
                                                                  'sha256', app.sha256_hex(ct.value_normalized),
                                                                  'is_active', ct.is_active) ORDER BY ct.contact_type), '[]'::jsonb)
                     FROM crm.customer_contacts ct WHERE ct.customer_id = c.id))
    FROM crm.customers c WHERE c.id = p_customer_id
$$;

CREATE FUNCTION api.merge_customers(
    p_survivor_id          uuid,
    p_merged_id            uuid,
    p_field_choices        jsonb DEFAULT '{}'::jsonb,
    p_reason               text  DEFAULT NULL,
    p_duplicate_decision_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_permission('customer.merge');
    s          crm.customers%ROWTYPE;
    m          crm.customers%ROWTYPE;
    d          crm.duplicate_decisions%ROWTYPE;
    v_counts   jsonb := '{}'::jsonb;
    v_snapshot jsonb;
    v_merge_id uuid;
    v_merge_no text;
    v_n        bigint;
    v_choice   text;
BEGIN
    IF p_survivor_id IS NULL OR p_merged_id IS NULL OR p_survivor_id = p_merged_id THEN
        PERFORM app.api_invalid('ต้องระบุลูกค้าสองรายที่ต่างกัน');
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลของการรวมลูกค้า');
    END IF;
    IF NOT app.can_access_customer('customer.merge', p_survivor_id)
       OR NOT app.can_access_customer('customer.merge', p_merged_id) THEN
        PERFORM app.api_denied('ต้องมีสิทธิ์รวมลูกค้าบนทั้งสองราย');
    END IF;
    SELECT * INTO s FROM crm.customers WHERE id = p_survivor_id FOR UPDATE;
    SELECT * INTO m FROM crm.customers WHERE id = p_merged_id FOR UPDATE;
    IF s.id IS NULL OR m.id IS NULL THEN
        PERFORM app.api_denied('ไม่พบลูกค้า');
    END IF;
    IF s.record_status <> 'ACTIVE' OR m.record_status <> 'ACTIVE' THEN
        PERFORM app.transition_denied('T02');                 -- 19.3 ข้อ 7
    END IF;
    IF p_duplicate_decision_id IS NOT NULL THEN
        SELECT * INTO d FROM crm.duplicate_decisions WHERE id = p_duplicate_decision_id FOR UPDATE;
        IF NOT FOUND OR d.status <> 'PENDING'
           OR NOT ((d.customer_id = p_survivor_id AND d.candidate_customer_id = p_merged_id)
                OR (d.customer_id = p_merged_id AND d.candidate_customer_id = p_survivor_id)) THEN
            PERFORM app.api_invalid('รายการข้อมูลซ้ำไม่ตรงกับลูกค้าคู่นี้', 'P0001');
        END IF;
        IF d.created_by = v_me THEN
            PERFORM app.api_denied('ผู้ตัดสินต้องไม่ใช่ผู้สร้างรายการข้อมูลซ้ำ');
        END IF;
    END IF;

    v_snapshot := jsonb_build_object('survivor', app.customer_merge_snapshot(p_survivor_id),
                                     'merged',   app.customer_merge_snapshot(p_merged_id));
    PERFORM set_config('app.bulk', 'on', true);
    PERFORM set_config('app.audit_reason', 'MERGE', true);

    -- ช่องทางติดต่อ: คู่ (contact_type, value_normalized) ซ้ำ เก็บแถว verified ก่อน
    UPDATE crm.customer_contacts x
    SET is_active = false, updated_by = v_me
    WHERE x.customer_id = p_survivor_id AND x.is_active
      AND EXISTS (SELECT 1 FROM crm.customer_contacts y
                  WHERE y.customer_id = p_merged_id AND y.is_active
                    AND y.contact_type = x.contact_type AND y.value_normalized = x.value_normalized
                    AND y.verified_at IS NOT NULL AND x.verified_at IS NULL);
    UPDATE crm.customer_contacts y
    SET customer_id = p_survivor_id, is_primary = false, updated_by = v_me,
        is_active = y.is_active AND NOT EXISTS (SELECT 1 FROM crm.customer_contacts x
                                                WHERE x.customer_id = p_survivor_id AND x.is_active
                                                  AND x.contact_type = y.contact_type
                                                  AND x.value_normalized = y.value_normalized)
    WHERE y.customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('customer_contacts', v_n);

    UPDATE crm.customer_addresses SET customer_id = p_survivor_id, is_primary = false, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('customer_addresses', v_n);
    UPDATE crm.customer_notes    SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('customer_notes', v_n);
    UPDATE crm.customer_consents SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('customer_consents', v_n);
    DELETE FROM crm.customer_tags t
    WHERE t.customer_id = p_merged_id
      AND EXISTS (SELECT 1 FROM crm.customer_tags u WHERE u.customer_id = p_survivor_id AND u.tag_id = t.tag_id);
    UPDATE crm.customer_tags SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('customer_tags', v_n);
    UPDATE crm.visits           SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('visits', v_n);
    UPDATE crm.interactions     SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('interactions', v_n);
    UPDATE crm.leads            SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('leads', v_n);
    UPDATE crm.opportunities    SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('opportunities', v_n);
    UPDATE crm.quotations       SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('quotations', v_n);
    UPDATE crm.tasks            SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('tasks', v_n);
    UPDATE crm.transaction_refs SET customer_id = p_survivor_id, updated_by = v_me WHERE customer_id = p_merged_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;  v_counts := v_counts || jsonb_build_object('transaction_refs', v_n);

    INSERT INTO crm.customer_branches AS cb (organization_id, customer_id, branch_id, first_linked_at, last_activity_at,
                                             linked_via, created_by, updated_by)
    SELECT x.organization_id, p_survivor_id, x.branch_id, x.first_linked_at, x.last_activity_at, 'MERGE', v_me, v_me
    FROM crm.customer_branches x WHERE x.customer_id = p_merged_id
    ON CONFLICT (customer_id, branch_id) DO UPDATE
        SET first_linked_at  = least(cb.first_linked_at, excluded.first_linked_at),
            last_activity_at = greatest(coalesce(cb.last_activity_at, excluded.last_activity_at), excluded.last_activity_at);
    DELETE FROM crm.customer_branches WHERE customer_id = p_merged_id;

    -- survivor: first_* มาจากรายที่ first_seen_at เก่ากว่า (ไม่ใช่ field_choices)
    UPDATE crm.customers c
    SET first_seen_at      = least(s.first_seen_at, m.first_seen_at),
        first_channel_code = CASE WHEN m.first_seen_at < s.first_seen_at THEN m.first_channel_code ELSE s.first_channel_code END,
        first_source_code  = CASE WHEN m.first_seen_at < s.first_seen_at THEN m.first_source_code  ELSE s.first_source_code  END,
        first_branch_id    = CASE WHEN m.first_seen_at < s.first_seen_at THEN m.first_branch_id    ELSE s.first_branch_id    END,
        first_name    = CASE WHEN p_field_choices ->> 'first_name'    = 'MERGED' THEN m.first_name    ELSE s.first_name    END,
        last_name     = CASE WHEN p_field_choices ->> 'last_name'     = 'MERGED' THEN m.last_name     ELSE s.last_name     END,
        nickname      = CASE WHEN p_field_choices ->> 'nickname'      = 'MERGED' THEN m.nickname      ELSE s.nickname      END,
        province_code = CASE WHEN p_field_choices ->> 'province_code' = 'MERGED' THEN m.province_code ELSE s.province_code END,
        customer_type = CASE WHEN p_field_choices ->> 'customer_type' = 'MERGED' THEN m.customer_type ELSE s.customer_type END,
        owner_staff_id = CASE WHEN p_field_choices ->> 'owner_staff_id' = 'MERGED' THEN m.owner_staff_id ELSE s.owner_staff_id END,
        updated_by = v_me
    WHERE c.id = p_survivor_id;

    UPDATE crm.customers SET record_status = 'MERGED', merged_into_id = p_survivor_id, updated_by = v_me
    WHERE id = p_merged_id;

    INSERT INTO crm.customer_merges (merge_no, survivor_customer_id, merged_customer_id, duplicate_decision_id,
                                     reason, field_choices, snapshot, moved_counts, merged_by, merged_at)
    VALUES (NULL, p_survivor_id, p_merged_id, p_duplicate_decision_id, btrim(p_reason),
            coalesce(p_field_choices, '{}'::jsonb), v_snapshot, v_counts, v_me, now())
    RETURNING id, merge_no INTO v_merge_id, v_merge_no;

    IF p_duplicate_decision_id IS NOT NULL THEN
        UPDATE crm.duplicate_decisions
        SET status = 'MERGED', decided_by = v_me, decided_at = now(),
            decision_note = coalesce(decision_note, btrim(p_reason)), updated_by = v_me
        WHERE id = p_duplicate_decision_id;
    END IF;

    PERFORM set_config('app.bulk', 'off', true);
    PERFORM app.refresh_customer_activity(p_survivor_id);
    PERFORM app.refresh_customer_lifecycle(p_survivor_id);
    PERFORM app.refresh_customer_lifecycle(p_merged_id);

    RETURN jsonb_build_object('ok', true, 'merge_id', v_merge_id, 'merge_no', v_merge_no,
                              'survivor_customer_id', p_survivor_id, 'merged_customer_id', p_merged_id,
                              'moved_counts', v_counts);
END;
$$;

CREATE FUNCTION api.decide_duplicate(p_decision_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('customer.merge');
    d    crm.duplicate_decisions%ROWTYPE;
BEGIN
    IF p_status IS DISTINCT FROM 'NOT_DUPLICATE' THEN
        PERFORM app.api_invalid('RPC นี้ใช้ยืนยัน "คนละคน" เท่านั้น (การรวมใช้ api.merge_customers)', 'P0001');
    END IF;
    SELECT * INTO d FROM crm.duplicate_decisions WHERE id = p_decision_id FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบรายการข้อมูลซ้ำนี้');
    END IF;
    IF NOT app.can_access_customer('customer.merge', d.customer_id)
       OR NOT app.can_access_customer('customer.merge', d.candidate_customer_id) THEN
        PERFORM app.api_denied('ต้องมีสิทธิ์รวมลูกค้าบนทั้งสองราย');
    END IF;
    IF d.status <> 'PENDING' THEN
        PERFORM app.api_invalid('รายการนี้ตัดสินแล้ว', 'P0001');
    END IF;
    IF d.created_by = v_me THEN
        PERFORM app.api_denied('ผู้ตัดสินต้องไม่ใช่ผู้สร้างรายการข้อมูลซ้ำ');
    END IF;
    UPDATE crm.duplicate_decisions
    SET status = 'NOT_DUPLICATE', decided_by = v_me, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), ''),
        updated_by = v_me
    WHERE id = p_decision_id;
    RETURN jsonb_build_object('ok', true, 'decision_id', p_decision_id, 'status', 'NOT_DUPLICATE');
END;
$$;


-- =====================================================================================
-- บล็อก G — visit · lead → opportunity · การมอบหมาย (ข้อ 3.3 · 4.1 · 4.2 · 9.4.2 · 19.3)
-- =====================================================================================

-- ข้อ 3.3 · 19.3 ข้อ 1 — เปิดหรือแนบ visit + interaction ต้นทาง (ไม่สร้าง lead อัตโนมัติ)
CREATE FUNCTION api.open_visit(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me        uuid := app.require_staff();
    v_branch    uuid := nullif(p ->> 'branch_id', '')::uuid;
    v_channel   text := nullif(p ->> 'channel_code', '');
    v_customer  uuid := nullif(p ->> 'customer_id', '')::uuid;
    v_interest  text := nullif(p ->> 'interest_code', '');
    v_mode      text := coalesce(nullif(p ->> 'visit_mode', ''), 'SERVICE');
    v_at        timestamptz := coalesce(nullif(p ->> 'occurred_at', '')::timestamptz, now());
    v_attach    uuid := nullif(p ->> 'attach_visit_id', '')::uuid;
    v_visit     uuid;
    v_visit_no  text;
    v_queue     integer;
    v_inter     uuid;
    v_attached  boolean := false;
    v_type      text;
BEGIN
    IF v_branch IS NULL OR NOT (v_branch = ANY (app.scope_branch_ids('visit.create', 'OWN'))) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์เปิด visit ในสาขานี้');
    END IF;
    IF v_channel IS NULL OR NOT EXISTS (SELECT 1 FROM ref.channels ch WHERE ch.code = v_channel AND ch.is_active) THEN
        PERFORM app.api_invalid('ต้องเลือกช่องทาง');
    END IF;
    IF v_channel = 'WALK_IN' AND v_interest IS NULL THEN
        PERFORM app.api_invalid('visit หน้าร้านต้องระบุวัตถุประสงค์');
    END IF;
    IF v_customer IS NOT NULL THEN
        IF NOT app.can_access_customer('visit.create', v_customer) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์เปิด visit ให้ลูกค้ารายนี้');
        END IF;
        IF NOT (v_branch = ANY (app.scope_branch_ids('visit.create', 'ORGANIZATION')))
           AND NOT EXISTS (SELECT 1 FROM crm.customer_branches cb WHERE cb.customer_id = v_customer AND cb.branch_id = v_branch)
           AND NOT EXISTS (SELECT 1 FROM crm.customers c WHERE c.id = v_customer AND c.first_branch_id = v_branch) THEN
            PERFORM app.transition_denied('T26');             -- ผูกลูกค้าข้ามสาขาต้องผ่าน api.link_customer_to_branch
        END IF;
        IF (SELECT c.record_status FROM crm.customers c WHERE c.id = v_customer) <> 'ACTIVE' THEN
            PERFORM app.transition_denied('T02');
        END IF;
    END IF;

    -- แนบเข้า visit ที่เปิดอยู่: ช่องทางเดียวกัน สาขาเดียวกัน วันธุรกิจเดียวกัน (19.3 ข้อ 1)
    IF v_channel <> 'WALK_IN' THEN
        SELECT x.id INTO v_visit
        FROM crm.visits x
        WHERE x.branch_id = v_branch AND x.channel_code = v_channel AND x.status = 'IN_SERVICE'
          AND app.bangkok_date(x.started_at) = app.bangkok_date(v_at)
          AND ((v_attach IS NOT NULL AND x.id = v_attach)
               OR (v_attach IS NULL AND v_customer IS NOT NULL AND x.customer_id = v_customer))
        ORDER BY x.started_at DESC
        LIMIT 1;
        v_attached := v_visit IS NOT NULL;
    END IF;

    IF NOT v_attached THEN
        INSERT INTO crm.visits (visit_no, branch_id, channel_code, status, party_size, customer_id, interest_code,
                                source_code, started_at, service_started_at, owner_staff_id)
        VALUES (NULL, v_branch, v_channel,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN 'WAITING' ELSE 'IN_SERVICE' END::crm.visit_status,
                coalesce((p ->> 'party_size')::integer, 1), v_customer, v_interest, nullif(p ->> 'source_code', ''),
                v_at,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN NULL ELSE v_at END,
                CASE WHEN v_channel = 'WALK_IN' AND v_mode = 'QUEUE' THEN NULL ELSE v_me END)
        RETURNING id, visit_no, queue_no INTO v_visit, v_visit_no, v_queue;
    ELSE
        SELECT visit_no, queue_no INTO v_visit_no, v_queue FROM crm.visits WHERE id = v_visit;
    END IF;

    v_type := coalesce(nullif(p ->> 'interaction_type_code', ''),
                       CASE WHEN v_channel = 'WALK_IN' THEN 'VISIT' ELSE 'INQUIRY' END);
    INSERT INTO crm.interactions (customer_id, visit_id, is_visit_root, branch_id, channel_code, direction,
                                  interaction_type_code, occurred_at, owner_staff_id, summary)
    VALUES (v_customer, v_visit,
            NOT EXISTS (SELECT 1 FROM crm.interactions i WHERE i.visit_id = v_visit AND i.is_visit_root),
            v_branch, v_channel, 'INBOUND', v_type, v_at, v_me, nullif(p ->> 'summary', ''))
    RETURNING id INTO v_inter;

    RETURN jsonb_build_object('ok', true, 'visit_id', v_visit, 'visit_no', v_visit_no, 'queue_no', v_queue,
                              'attached', v_attached, 'interaction_id', v_inter,
                              'status', (SELECT x.status FROM crm.visits x WHERE x.id = v_visit));
END;
$$;

-- ข้อ 4.1 · 4.2 · 19.3 ข้อ 3 — ปิด visit และบังคับผลของ outcome
CREATE FUNCTION api.close_visit(p_visit_id uuid, p_outcome_code text, p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    v        crm.visits%ROWTYPE;
    v_status crm.visit_status;
    v_lost   text := nullif(p ->> 'lost_reason_code', '');
    v_note   text := nullif(p ->> 'lost_note', '');
    v_closed integer := 0;
BEGIN
    SELECT * INTO v FROM crm.visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND OR NOT app.can_access_record('visit.update', v.branch_id, v.owner_staff_id, v.created_by) THEN
        PERFORM app.api_denied('ไม่พบ visit นี้หรือไม่มีสิทธิ์แก้');
    END IF;
    IF p_outcome_code IS NULL
       OR NOT EXISTS (SELECT 1 FROM ref.visit_outcomes o WHERE o.code = p_outcome_code AND o.is_active) THEN
        PERFORM app.api_invalid('ต้องเลือกผลการให้บริการ');
    END IF;
    IF p_outcome_code = 'UNRECORDED' THEN
        PERFORM app.api_invalid('ผล UNRECORDED ระบบตั้งให้เท่านั้น (ข้อ 4.1)', 'P0001');
    END IF;
    IF v.status = 'CANCELLED' THEN
        PERFORM app.transition_denied('T23');
    END IF;
    IF v.status IN ('COMPLETED', 'LEFT') THEN
        -- แก้ outcome ได้ภายในวันธุรกิจเดียวกัน (ข้อ 4.1)
        IF app.bangkok_date(v.started_at) <> app.bangkok_date(now()) THEN
            PERFORM app.transition_denied('T23');
        END IF;
        IF (p_outcome_code = 'LEFT_BEFORE_SERVICE') <> (v.status = 'LEFT') THEN
            PERFORM app.transition_denied('T21');
        END IF;
        v_status := v.status;
    ELSIF p_outcome_code = 'LEFT_BEFORE_SERVICE' THEN
        IF v.status <> 'WAITING' THEN
            PERFORM app.transition_denied('T21');
        END IF;
        v_status := 'LEFT';
    ELSE
        IF v.status <> 'IN_SERVICE' THEN
            PERFORM app.transition_denied('T21');
        END IF;
        v_status := 'COMPLETED';
    END IF;
    IF p_outcome_code IN ('PURCHASED', 'FOLLOW_UP') AND v.customer_id IS NULL THEN
        PERFORM app.api_invalid('ผลนี้ต้องระบุลูกค้าก่อน (ข้อ 4.2)', 'P0001');
    END IF;
    IF p_outcome_code = 'FOLLOW_UP'
       AND NOT EXISTS (SELECT 1 FROM crm.leads l WHERE l.customer_id = v.customer_id
                         AND l.status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND l.next_action_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM crm.opportunities o WHERE o.customer_id = v.customer_id
                         AND o.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP') AND o.next_action_at IS NOT NULL) THEN
        PERFORM app.api_invalid('ผล "นัดติดตาม" ต้องมี lead หรือโอกาสขายที่เปิดอยู่พร้อมงานถัดไป (ข้อ 4.2)', 'P0001');
    END IF;
    IF p_outcome_code = 'NOT_INTERESTED' THEN
        IF v_lost IS NULL OR NOT EXISTS (SELECT 1 FROM ref.lost_reasons lr WHERE lr.code = v_lost AND lr.is_active) THEN
            PERFORM app.api_invalid('ผล "ไม่สนใจ" ต้องระบุเหตุผลที่ไม่สำเร็จ (19.3 ข้อ 3)', 'P0001');
        END IF;
        IF v_lost = 'OTHER' AND v_note IS NULL THEN
            PERFORM app.api_invalid('เหตุผล "อื่น ๆ" ต้องระบุหมายเหตุ', 'P0001');
        END IF;
    END IF;

    PERFORM set_config('app.status_reason', coalesce(v_lost, p_outcome_code), true);
    UPDATE crm.visits
    SET status       = v_status,
        outcome_code = p_outcome_code,
        ended_at     = coalesce(ended_at, now()),
        updated_by   = v_me
    WHERE id = p_visit_id;

    IF p_outcome_code = 'PURCHASED' THEN
        UPDATE crm.interactions SET interaction_type_code = 'PURCHASE', updated_by = v_me
        WHERE visit_id = p_visit_id AND is_visit_root AND interaction_type_code <> 'PURCHASE';
    END IF;

    IF p_outcome_code = 'NOT_INTERESTED' THEN
        UPDATE crm.leads
        SET status = 'LOST', closed_at = now(), lost_reason_code = v_lost, lost_note = v_note, updated_by = v_me
        WHERE visit_id = p_visit_id AND status IN ('NEW', 'CONTACTED', 'QUALIFIED');
        GET DIAGNOSTICS v_closed = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'status', v_status,
                              'outcome_code', p_outcome_code, 'leads_closed', v_closed);
END;
$$;

-- ข้อ 9.6 — รับทราบ visit ที่ระบบปิดให้แบบไม่ได้บันทึกผล (ข้อ 12.3 VISIT_UNRECORDED)
CREATE FUNCTION api.acknowledge_unrecorded_visit(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_staff();
    v    crm.visits%ROWTYPE;
BEGIN
    SELECT * INTO v FROM crm.visits WHERE id = p_visit_id FOR UPDATE;
    IF NOT FOUND OR NOT app.can_access_record('visit.update', v.branch_id, v.owner_staff_id, v.created_by) THEN
        PERFORM app.api_denied('ไม่พบ visit นี้หรือไม่มีสิทธิ์แก้');
    END IF;
    IF v.outcome_code IS DISTINCT FROM 'UNRECORDED' THEN
        PERFORM app.api_invalid('visit นี้ไม่ได้อยู่ในสถานะ "ไม่ได้บันทึกผล"', 'P0001');
    END IF;
    IF v.unrecorded_ack_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'already_acknowledged', true,
                                  'unrecorded_ack_by', v.unrecorded_ack_by, 'unrecorded_ack_at', v.unrecorded_ack_at);
    END IF;
    UPDATE crm.visits SET unrecorded_ack_by = v_me, unrecorded_ack_at = now(), updated_by = v_me WHERE id = p_visit_id;
    RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'already_acknowledged', false,
                              'unrecorded_ack_by', v_me);
END;
$$;

-- ข้อ 4.3 · 4.4 — แปลง lead เป็นโอกาสขายในทรานแซกชันเดียว
CREATE FUNCTION api.convert_lead(p_lead_id uuid, p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    l        crm.leads%ROWTYPE;
    v_opp    uuid;
    v_opp_no text;
    v_owner  uuid;
    v_item   jsonb;
BEGIN
    SELECT * INTO l FROM crm.leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND OR NOT app.can_access_record('lead.update', l.branch_id, l.owner_staff_id, l.created_by) THEN
        PERFORM app.api_denied('ไม่พบ lead นี้หรือไม่มีสิทธิ์แก้');
    END IF;
    IF NOT app.can_access_record('opportunity.create', l.branch_id, l.owner_staff_id, l.created_by) THEN
        PERFORM app.api_denied('ต้องมีสิทธิ์สร้างโอกาสขายด้วย (ข้อ 8.1 lead.update)');
    END IF;
    IF l.status NOT IN ('NEW', 'CONTACTED', 'QUALIFIED') THEN
        PERFORM app.transition_denied('T43');
    END IF;
    IF NOT app.can_access_customer('customer.read', l.customer_id) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์อ่านลูกค้าของ lead นี้');
    END IF;
    v_owner := coalesce(l.owner_staff_id, v_me);

    INSERT INTO crm.opportunities (opportunity_no, customer_id, lead_id, origin_channel_code, origin_visit_id, branch_id,
                                   owner_staff_id, interest_code, stage, priority_code,
                                   next_action, next_action_type_code, next_action_at)
    VALUES (NULL, l.customer_id, l.id, l.channel_code, l.visit_id, l.branch_id, v_owner, l.interest_code,
            'INTERESTED', coalesce(nullif(p ->> 'priority_code', ''), l.priority_code, 'NORMAL'),
            coalesce(nullif(p ->> 'next_action', ''), l.next_action, 'ติดตามโอกาสขาย'),
            coalesce(nullif(p ->> 'next_action_type_code', ''), l.next_action_type_code, 'FOLLOW_UP'),
            coalesce(nullif(p ->> 'next_action_at', '')::timestamptz, l.next_action_at, now() + interval '1 day'))
    RETURNING id, opportunity_no INTO v_opp, v_opp_no;

    FOR v_item IN SELECT e FROM jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) e LOOP
        INSERT INTO crm.opportunity_items (opportunity_id, product_type_code, product_model, variant, quantity, unit_price, interest_level)
        VALUES (v_opp, nullif(v_item ->> 'product_type_code', ''), nullif(v_item ->> 'product_model', ''),
                nullif(v_item ->> 'variant', ''), coalesce((v_item ->> 'quantity')::integer, 1),
                coalesce((v_item ->> 'unit_price')::numeric, 0), nullif(v_item ->> 'interest_level', '')::crm.interest_level);
    END LOOP;
    IF jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 AND l.product_model IS NOT NULL THEN
        INSERT INTO crm.opportunity_items (opportunity_id, product_type_code, product_model, quantity, unit_price, interest_level)
        VALUES (v_opp, l.product_type_code, l.product_model, 1, coalesce((p ->> 'unit_price')::numeric, 0), l.interest_level);
    END IF;

    PERFORM set_config('app.status_reason', 'CONVERTED', true);
    UPDATE crm.leads
    SET status = 'CONVERTED', converted_opportunity_id = v_opp, closed_at = now(), updated_by = v_me
    WHERE id = p_lead_id;

    RETURN jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'opportunity_id', v_opp, 'opportunity_no', v_opp_no);
END;
$$;

-- ข้อ 9.4.2 · rls-spec ข้อ 8.3 — เส้นทางเดียวของการเปลี่ยน owner/ทีม/สาขา
CREATE FUNCTION api.assign_owner(
    p_entity_type text,
    p_entity_id   uuid,
    p_to_staff_id uuid,
    p_reason_code text,
    p_note        text DEFAULT NULL,
    p_to_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me        uuid := app.require_staff();
    v_perm      text;
    v_branch    uuid;                 -- สาขาเดิม
    v_new_br    uuid;                 -- สาขาปลายทาง
    v_owner     uuid;                 -- owner เดิม
    v_created   uuid;
    v_ref       text;
    v_team      uuid;
    v_change_br boolean;
    v_ok        boolean;
    c           crm.customers%ROWTYPE;
    vi          crm.visits%ROWTYPE;
    l           crm.leads%ROWTYPE;
    o           crm.opportunities%ROWTYPE;
    t           crm.tasks%ROWTYPE;
BEGIN
    -- 1. ชนิดของรายการ + ล็อกแถว
    IF p_entity_type IS NULL OR p_entity_type NOT IN ('CUSTOMER', 'VISIT', 'LEAD', 'OPPORTUNITY', 'TASK') THEN
        PERFORM app.api_invalid('entity_type ต้องเป็น CUSTOMER · VISIT · LEAD · OPPORTUNITY หรือ TASK');
    END IF;
    v_perm := CASE p_entity_type
        WHEN 'CUSTOMER' THEN 'customer.assign' WHEN 'VISIT' THEN 'visit.update'
        WHEN 'LEAD' THEN 'lead.assign' WHEN 'OPPORTUNITY' THEN 'opportunity.assign' ELSE 'task.assign' END;
    IF p_entity_type = 'CUSTOMER' THEN
        SELECT * INTO c FROM crm.customers WHERE id = p_entity_id FOR UPDATE;
        v_owner := c.owner_staff_id; v_ref := c.customer_no; v_branch := c.first_branch_id; v_created := c.created_by;
    ELSIF p_entity_type = 'VISIT' THEN
        SELECT * INTO vi FROM crm.visits WHERE id = p_entity_id FOR UPDATE;
        v_owner := vi.owner_staff_id; v_ref := vi.visit_no; v_branch := vi.branch_id; v_created := vi.created_by;
    ELSIF p_entity_type = 'LEAD' THEN
        SELECT * INTO l FROM crm.leads WHERE id = p_entity_id FOR UPDATE;
        v_owner := l.owner_staff_id; v_ref := l.lead_no; v_branch := l.branch_id; v_created := l.created_by;
    ELSIF p_entity_type = 'OPPORTUNITY' THEN
        SELECT * INTO o FROM crm.opportunities WHERE id = p_entity_id FOR UPDATE;
        v_owner := o.owner_staff_id; v_ref := o.opportunity_no; v_branch := o.branch_id; v_created := o.created_by;
    ELSE
        SELECT * INTO t FROM crm.tasks WHERE id = p_entity_id FOR UPDATE;
        v_owner := t.owner_staff_id; v_ref := t.task_no; v_branch := t.branch_id; v_created := t.created_by;
    END IF;
    IF v_ref IS NULL THEN
        PERFORM app.api_denied('ไม่พบรายการนี้');             -- ไม่พบ = ไม่มีสิทธิ์ (F5)
    END IF;
    v_new_br := coalesce(p_to_branch_id, v_branch);
    v_change_br := v_new_br IS DISTINCT FROM v_branch;

    -- 2. เหตุผล
    IF p_reason_code IS NULL
       OR NOT EXISTS (SELECT 1 FROM ref.ownership_change_reasons r WHERE r.code = p_reason_code AND r.is_active) THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลการเปลี่ยนผู้รับผิดชอบ');
    END IF;
    IF v_change_br AND p_reason_code <> 'BRANCH_TRANSFER' THEN
        PERFORM app.api_invalid('การย้ายสาขาต้องใช้เหตุผล BRANCH_TRANSFER');
    END IF;

    -- 3. สถานะของแถว
    IF p_entity_type = 'CUSTOMER' AND c.record_status <> 'ACTIVE' THEN PERFORM app.transition_denied('T02'); END IF;
    IF p_entity_type = 'VISIT' THEN
        IF vi.status = 'WAITING' THEN PERFORM app.transition_denied('T21'); END IF;
        IF vi.status <> 'IN_SERVICE' THEN PERFORM app.transition_denied('T23'); END IF;
    END IF;
    IF p_entity_type = 'LEAD' AND l.status NOT IN ('NEW', 'CONTACTED', 'QUALIFIED') THEN PERFORM app.transition_denied('T43'); END IF;
    IF p_entity_type = 'OPPORTUNITY' AND o.stage NOT IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP') THEN PERFORM app.transition_denied('T33'); END IF;
    IF p_entity_type = 'TASK' THEN
        IF t.status NOT IN ('OPEN', 'IN_PROGRESS') THEN PERFORM app.transition_denied('T70'); END IF;
        IF t.is_next_action THEN PERFORM app.transition_denied('T14'); END IF;
    END IF;

    -- 4. ย้ายสาขาได้เฉพาะ lead/opportunity/task
    IF v_change_br AND p_entity_type IN ('CUSTOMER', 'VISIT') THEN
        PERFORM app.transition_denied('T14');
    END IF;

    -- 5. สิทธิ์บนแถวเดิม
    IF p_entity_type = 'CUSTOMER' THEN
        IF NOT app.can_access_customer('customer.assign', p_entity_id) THEN PERFORM app.transition_denied('T90'); END IF;
    ELSIF p_entity_type = 'VISIT' THEN
        IF NOT (v_branch = ANY (app.scope_branch_ids('visit.update', 'BRANCH'))
                OR EXISTS (SELECT 1 FROM app.team_scope_pairs('visit.update') tp
                           WHERE tp.branch_id = v_branch AND tp.staff_id = v_owner)) THEN
            PERFORM app.transition_denied('T25');
        END IF;
    ELSE
        IF NOT app.can_access_record(v_perm, v_branch, v_owner, v_created) THEN PERFORM app.transition_denied('T10'); END IF;
    END IF;

    -- 6. สิทธิ์บนสาขาปลายทาง
    IF v_change_br AND NOT app.can_access_record(v_perm, v_new_br, p_to_staff_id, v_created) THEN
        PERFORM app.transition_denied('T15');
    END IF;

    -- 7. ขอบเขตของแถวใหม่
    IF p_entity_type = 'CUSTOMER' THEN
        v_ok := EXISTS (
            SELECT 1
            FROM (SELECT cb.branch_id FROM crm.customer_branches cb WHERE cb.customer_id = p_entity_id
                  UNION SELECT c.first_branch_id WHERE c.first_branch_id IS NOT NULL) x
            WHERE x.branch_id = ANY (app.scope_branch_ids('customer.assign', 'BRANCH'))
               OR (p_to_staff_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM app.team_scope_pairs('customer.assign') tp
                               WHERE tp.branch_id = x.branch_id AND tp.staff_id = p_to_staff_id)));
    ELSIF p_entity_type = 'VISIT' THEN
        v_ok := v_new_br = ANY (app.scope_branch_ids('visit.update', 'BRANCH'))
             OR EXISTS (SELECT 1 FROM app.team_scope_pairs('visit.update') tp
                        WHERE tp.branch_id = v_new_br AND tp.staff_id = p_to_staff_id);
    ELSE
        v_ok := app.can_access_record(v_perm, v_new_br, p_to_staff_id, v_created);
    END IF;
    IF NOT v_ok THEN
        PERFORM app.transition_denied('T11');
    END IF;

    -- 8. ผู้รับผิดชอบใหม่
    IF p_to_staff_id IS NULL THEN
        IF p_entity_type IN ('VISIT', 'OPPORTUNITY') THEN PERFORM app.transition_denied('T16'); END IF;
    ELSE
        IF p_entity_type = 'CUSTOMER' THEN
            IF NOT EXISTS (
                SELECT 1
                FROM (SELECT cb.branch_id FROM crm.customer_branches cb WHERE cb.customer_id = p_entity_id
                      UNION SELECT c.first_branch_id WHERE c.first_branch_id IS NOT NULL) x
                WHERE app.staff_has_branch_assignment(p_to_staff_id, x.branch_id)) THEN
                PERFORM app.transition_denied('T12');
            END IF;
        ELSIF NOT app.staff_has_branch_assignment(p_to_staff_id, v_new_br) THEN
            PERFORM app.transition_denied('T12');
        END IF;
    END IF;

    -- 9. เขียน
    SELECT tm.team_id INTO v_team
    FROM core.team_members tm JOIN core.teams tt ON tt.id = tm.team_id
    WHERE tm.staff_id = p_to_staff_id AND tt.branch_id = v_new_br
      AND tm.valid_from <= now() AND (tm.valid_to IS NULL OR now() < tm.valid_to)
    ORDER BY tt.code
    LIMIT 1;
    PERFORM set_config('app.audit_reason', p_reason_code, true);

    IF p_entity_type = 'CUSTOMER' THEN
        UPDATE crm.customers SET owner_staff_id = p_to_staff_id, updated_by = v_me WHERE id = p_entity_id;
    ELSIF p_entity_type = 'VISIT' THEN
        UPDATE crm.visits SET owner_staff_id = p_to_staff_id, team_id = v_team, updated_by = v_me WHERE id = p_entity_id;
    ELSIF p_entity_type = 'LEAD' THEN
        UPDATE crm.leads SET owner_staff_id = p_to_staff_id, team_id = v_team, branch_id = v_new_br, updated_by = v_me WHERE id = p_entity_id;
    ELSIF p_entity_type = 'OPPORTUNITY' THEN
        UPDATE crm.opportunities SET owner_staff_id = p_to_staff_id, team_id = v_team, branch_id = v_new_br, updated_by = v_me WHERE id = p_entity_id;
    ELSE
        UPDATE crm.tasks SET owner_staff_id = p_to_staff_id, team_id = v_team, branch_id = v_new_br, updated_by = v_me WHERE id = p_entity_id;
    END IF;

    -- crm.ownership_changes ไม่มีคอลัมน์ created_by/updated_by จึงไม่มี DEFAULT ของ organization_id (บล็อก D ของ 0010)
    INSERT INTO crm.ownership_changes (organization_id, entity_type, entity_id, from_staff_id, to_staff_id,
                                       from_branch_id, to_branch_id, reason_code, note, changed_by, changed_at)
    VALUES (app.current_organization_id(), p_entity_type, p_entity_id, v_owner, p_to_staff_id,
            CASE WHEN v_change_br THEN v_branch END, CASE WHEN v_change_br THEN v_new_br END,
            p_reason_code, nullif(btrim(coalesce(p_note, '')), ''), v_me, now());

    IF p_to_staff_id IS NOT NULL AND p_to_staff_id <> v_me AND p_entity_type IN ('LEAD', 'OPPORTUNITY', 'TASK') THEN
        PERFORM app.emit_notification(p_to_staff_id, p_entity_type || '_ASSIGNED', p_entity_type, p_entity_id, v_ref,
                                      'ได้รับมอบหมาย ' || v_ref);
    END IF;

    RETURN jsonb_build_object('ok', true, 'entity_type', p_entity_type, 'entity_id', p_entity_id, 'entity_ref', v_ref,
                              'from_staff_id', v_owner, 'to_staff_id', p_to_staff_id,
                              'from_branch_id', CASE WHEN v_change_br THEN v_branch END,
                              'to_branch_id', CASE WHEN v_change_br THEN v_new_br END);
END;
$$;


-- =====================================================================================
-- บล็อก H — การส่งออกข้อมูลลูกค้า (ข้อ 8.2 · permission-matrix ข้อ 7)
-- =====================================================================================

-- คอลัมน์ที่แต่ละบทบาทได้ (whitelist ข้อ 8.2) · ไม่มีบทบาทใดได้โน้ต สรุปการติดต่อ สรุปธุรกรรม หรือ IMEI
CREATE FUNCTION app.export_columns(p_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE p_role
        WHEN 'BRANCH_MANAGER' THEN ARRAY['customer_no', 'display_name', 'lifecycle_stage', 'first_channel_code',
                                         'province_code', 'last_activity_at', 'phone_masked']
        WHEN 'MARKETING'      THEN ARRAY['customer_no', 'display_name', 'phone', 'email', 'line_id']
        ELSE                       ARRAY['customer_no', 'display_name', 'lifecycle_stage', 'first_channel_code',
                                         'first_source_code', 'province_code', 'first_seen_at', 'last_activity_at',
                                         'phone', 'email', 'line_id', 'tags', 'consents']
    END
$$;

-- ลูกค้าที่เข้าเกณฑ์ของคำขอ (ขอบเขตสาขา + ตัวกรองที่บันทึกตอนยื่น + กติกา is_marketing)
CREATE FUNCTION app.export_candidate_ids(p_branch_ids uuid[], p_filter jsonb, p_marketing_only boolean)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT c.id
    FROM crm.customers c
    WHERE c.record_status = 'ACTIVE'
      AND (cardinality(coalesce(p_branch_ids, '{}'::uuid[])) = 0
           OR c.first_branch_id = ANY (p_branch_ids)
           OR EXISTS (SELECT 1 FROM crm.customer_branches cb
                      WHERE cb.customer_id = c.id AND cb.branch_id = ANY (p_branch_ids)))
      AND (p_filter -> 'lifecycle_stage' IS NULL
           OR c.lifecycle_stage = ANY (ARRAY(SELECT jsonb_array_elements_text(p_filter -> 'lifecycle_stage'))))
      AND (p_filter -> 'first_channel_code' IS NULL
           OR c.first_channel_code = ANY (ARRAY(SELECT jsonb_array_elements_text(p_filter -> 'first_channel_code'))))
      AND (p_filter -> 'province_code' IS NULL
           OR c.province_code = ANY (ARRAY(SELECT jsonb_array_elements_text(p_filter -> 'province_code'))))
      AND (p_filter ->> 'last_activity_from' IS NULL OR c.last_activity_at >= (p_filter ->> 'last_activity_from')::timestamptz)
      AND (p_filter ->> 'last_activity_to'   IS NULL OR c.last_activity_at <  (p_filter ->> 'last_activity_to')::timestamptz)
      AND (p_filter -> 'tag_codes' IS NULL
           OR EXISTS (SELECT 1 FROM crm.customer_tags ct JOIN crm.tags t ON t.id = ct.tag_id
                      WHERE ct.customer_id = c.id
                        AND t.code = ANY (ARRAY(SELECT jsonb_array_elements_text(p_filter -> 'tag_codes')))))
      AND (NOT p_marketing_only
           OR EXISTS (SELECT 1 FROM crm.customer_consent_current cc
                      WHERE cc.customer_id = c.id AND cc.purpose_code = 'MARKETING' AND cc.status = 'GRANTED'))
$$;

-- ชุดข้อมูลของคำขอ (ข้อ 8.2) · เรียกจาก api.svc_build_export_dataset เท่านั้น
CREATE FUNCTION app.build_export_dataset(p_export_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    e         audit.export_requests%ROWTYPE;
    v_cols    text[];
    v_mkt     boolean;
    v_rows    jsonb;
    v_code    text;
    v_count   integer;
BEGIN
    SELECT * INTO e FROM audit.export_requests WHERE id = p_export_id;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบคำขอส่งออกนี้');
    END IF;
    IF e.status <> 'APPROVED' THEN
        PERFORM app.api_invalid('คำขอนี้ยังไม่อยู่ในสถานะ APPROVED', 'P0001');
    END IF;
    -- ตรวจซ้ำ: ผู้ขอยัง ACTIVE และยังมี assignment ที่มีผลของบทบาทที่ยื่น ซึ่งมีสิทธิ์ customer.export
    IF NOT EXISTS (
        SELECT 1
        FROM core.staff_role_assignments a
        JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
        JOIN core.role_permissions rp ON rp.role_code = a.role_code AND rp.permission_code = 'customer.export'
        WHERE a.staff_id = e.requested_by AND a.role_code = e.requested_as_role
          AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)) THEN
        PERFORM app.api_denied('ผู้ขอไม่มีสิทธิ์ส่งออกแล้ว');
    END IF;
    SELECT r.is_marketing INTO v_mkt FROM ref.export_reasons r WHERE r.code = e.reason_code;
    v_cols := app.export_columns(e.requested_as_role);
    SELECT s.staff_code INTO v_code FROM core.staff_profiles s WHERE s.id = e.requested_by;

    SELECT coalesce(jsonb_agg(row_json ORDER BY customer_no), '[]'::jsonb), count(*)
    INTO v_rows, v_count
    FROM (
        SELECT c.customer_no,
               jsonb_strip_nulls(jsonb_build_object(
                   'customer_no',        c.customer_no,
                   'display_name',       c.display_name,
                   'lifecycle_stage',    CASE WHEN 'lifecycle_stage'    = ANY (v_cols) THEN c.lifecycle_stage END,
                   'first_channel_code', CASE WHEN 'first_channel_code' = ANY (v_cols) THEN c.first_channel_code END,
                   'first_source_code',  CASE WHEN 'first_source_code'  = ANY (v_cols) THEN c.first_source_code END,
                   'province_code',      CASE WHEN 'province_code'      = ANY (v_cols) THEN c.province_code END,
                   'first_seen_at',      CASE WHEN 'first_seen_at'      = ANY (v_cols) THEN to_jsonb(c.first_seen_at) END,
                   'last_activity_at',   CASE WHEN 'last_activity_at'   = ANY (v_cols) THEN to_jsonb(c.last_activity_at) END,
                   'phone_masked',       CASE WHEN 'phone_masked' = ANY (v_cols)
                                              THEN (SELECT ct.value_masked FROM crm.customer_contacts ct
                                                    WHERE ct.customer_id = c.id AND ct.contact_type = 'PHONE' AND ct.is_active
                                                    ORDER BY ct.is_primary DESC LIMIT 1) END,
                   'phone',              CASE WHEN 'phone' = ANY (v_cols)
                                              THEN (SELECT ct.value_normalized FROM crm.customer_contacts ct
                                                    WHERE ct.customer_id = c.id AND ct.contact_type = 'PHONE' AND ct.is_active
                                                      AND (e.requested_as_role <> 'MARKETING'
                                                           OR EXISTS (SELECT 1 FROM crm.customer_consent_current cc
                                                                      WHERE cc.customer_id = c.id AND cc.purpose_code = 'MARKETING'
                                                                        AND cc.status = 'GRANTED'
                                                                        AND (cc.channels && ARRAY['PHONE', 'SMS'])))
                                                    ORDER BY ct.is_primary DESC LIMIT 1) END,
                   'email',              CASE WHEN 'email' = ANY (v_cols)
                                              THEN (SELECT ct.value_normalized FROM crm.customer_contacts ct
                                                    WHERE ct.customer_id = c.id AND ct.contact_type = 'EMAIL' AND ct.is_active
                                                      AND (e.requested_as_role <> 'MARKETING'
                                                           OR EXISTS (SELECT 1 FROM crm.customer_consent_current cc
                                                                      WHERE cc.customer_id = c.id AND cc.purpose_code = 'MARKETING'
                                                                        AND cc.status = 'GRANTED' AND (cc.channels && ARRAY['EMAIL'])))
                                                    ORDER BY ct.is_primary DESC LIMIT 1) END,
                   'line_id',            CASE WHEN 'line_id' = ANY (v_cols)
                                              THEN (SELECT ct.value_normalized FROM crm.customer_contacts ct
                                                    WHERE ct.customer_id = c.id AND ct.contact_type = 'LINE_ID' AND ct.is_active
                                                      AND (e.requested_as_role <> 'MARKETING'
                                                           OR EXISTS (SELECT 1 FROM crm.customer_consent_current cc
                                                                      WHERE cc.customer_id = c.id AND cc.purpose_code = 'MARKETING'
                                                                        AND cc.status = 'GRANTED' AND (cc.channels && ARRAY['LINE'])))
                                                    ORDER BY ct.is_primary DESC LIMIT 1) END,
                   'tags',               CASE WHEN 'tags' = ANY (v_cols)
                                              THEN (SELECT jsonb_agg(t.code ORDER BY t.code) FROM crm.customer_tags ct
                                                    JOIN crm.tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id) END,
                   'consents',           CASE WHEN 'consents' = ANY (v_cols)
                                              THEN (SELECT jsonb_object_agg(cc.purpose_code, cc.status)
                                                    FROM crm.customer_consent_current cc WHERE cc.customer_id = c.id) END
               )) AS row_json
        FROM crm.customers c
        WHERE c.id IN (SELECT app.export_candidate_ids(e.branch_ids, e.filter, coalesce(v_mkt, false)))
    ) x;

    RETURN jsonb_build_object(
        'ok', true, 'export_id', e.id, 'export_no', e.export_no, 'requested_as_role', e.requested_as_role,
        'columns', to_jsonb(v_cols), 'row_count', v_count,
        'watermark', 'ส่งออกโดย ' || coalesce(v_code, '-') || ' · ' || e.export_no || ' · '
                     || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI'),
        'rows', v_rows);
END;
$$;

CREATE FUNCTION api.request_export(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_staff();
    v_role     text := nullif(p ->> 'requested_as_role', '');
    v_reason   text := nullif(p ->> 'reason_code', '');
    v_note     text := nullif(p ->> 'reason_note', '');
    v_filter   jsonb := coalesce(p -> 'filter', '{}'::jsonb);
    v_limits   jsonb;
    v_max      integer;
    v_per_day  integer;
    v_approver text;
    v_scope    core.data_scope;
    v_branches uuid[];
    v_mkt      boolean;
    v_count    integer;
    v_status   audit.export_status;
    v_id       uuid;
    v_no       text;
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('BRANCH_MANAGER', 'MARKETING', 'BUSINESS_ADMIN', 'EXECUTIVE') THEN
        PERFORM app.api_invalid('requested_as_role ต้องเป็น BRANCH_MANAGER · MARKETING · BUSINESS_ADMIN หรือ EXECUTIVE');
    END IF;
    SELECT rp.scope INTO v_scope FROM core.role_permissions rp
    WHERE rp.role_code = v_role AND rp.permission_code = 'customer.export';
    IF v_scope IS NULL
       OR NOT EXISTS (SELECT 1 FROM app.effective_assignments() ea WHERE ea.role_code = v_role)
       OR NOT app.is_aal2() THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ยื่นคำขอส่งออกในบทบาทนี้ (ต้องยืนยัน MFA)');
    END IF;
    IF v_reason IS NULL OR NOT EXISTS (SELECT 1 FROM ref.export_reasons r WHERE r.code = v_reason AND r.is_active) THEN
        PERFORM app.api_invalid('ต้องเลือกเหตุผลการส่งออก');
    END IF;
    IF v_reason = 'OTHER' AND v_note IS NULL THEN
        PERFORM app.api_invalid('เหตุผล "อื่น ๆ" ต้องระบุหมายเหตุ');
    END IF;

    SELECT s.value INTO v_limits FROM app.settings s WHERE s.key = 'export.limits';
    v_max      := coalesce((v_limits -> v_role ->> 'max_rows')::integer, 0);
    v_per_day  := coalesce((v_limits -> v_role ->> 'per_day')::integer, 0);
    v_approver := v_limits -> v_role ->> 'approver_role';

    IF (SELECT count(*) FROM audit.export_requests x
        WHERE x.requested_by = v_me AND x.requested_as_role = v_role
          AND app.bangkok_date(x.requested_at) = app.bangkok_date(now())) >= v_per_day THEN
        PERFORM app.api_denied('ยื่นคำขอส่งออกครบ ' || v_per_day || ' ครั้งของวันนี้แล้ว');
    END IF;

    IF v_scope = 'ORGANIZATION' THEN
        SELECT coalesce(array_agg(b.id ORDER BY b.code), '{}') INTO v_branches
        FROM core.branches b WHERE b.organization_id = app.current_organization_id();
    ELSE
        SELECT coalesce(array_agg(DISTINCT ea.branch_id), '{}') INTO v_branches
        FROM app.effective_assignments() ea WHERE ea.role_code = v_role AND ea.branch_id IS NOT NULL;
    END IF;
    SELECT r.is_marketing INTO v_mkt FROM ref.export_reasons r WHERE r.code = v_reason;
    SELECT count(*) INTO v_count FROM app.export_candidate_ids(v_branches, v_filter, coalesce(v_mkt, false));

    v_filter := v_filter || jsonb_build_object('columns', to_jsonb(app.export_columns(v_role)));
    IF v_count > v_max THEN
        v_status := 'REJECTED';                               -- เกินเพดาน = ปฏิเสธ (PM ข้อ 7.1 แถว 6) · แถวยังถูกบันทึกและนับต่อวัน
    ELSIF v_role = 'BRANCH_MANAGER' THEN
        v_status := 'APPROVED';                               -- อนุมัติทันที (ข้อ 8.2 v2.2)
    ELSE
        v_status := 'REQUESTED';
    END IF;

    INSERT INTO audit.export_requests (export_no, requested_by, requested_as_role, requested_at, branch_ids,
                                       reason_code, reason_note, filter, row_count, status, decided_at, decision_note)
    VALUES (NULL, v_me, v_role, now(), v_branches, v_reason, v_note, v_filter, v_count, v_status,
            CASE WHEN v_status IN ('APPROVED', 'REJECTED') THEN now() END,
            CASE WHEN v_status = 'REJECTED' THEN 'เกินเพดาน ' || v_max || ' แถวต่อครั้ง' END)
    RETURNING id, export_no INTO v_id, v_no;
    PERFORM app.write_audit('EXPORT_REQUESTED', 'EXPORT', v_id::text, v_no, NULL, NULL,
                            jsonb_build_object('requested_as_role', v_role, 'row_count', v_count, 'status', v_status),
                            NULL, v_reason);

    IF v_status = 'REQUESTED' AND v_approver IS NOT NULL THEN
        PERFORM app.emit_notification(ap, 'EXPORT_APPROVAL_REQUIRED', 'EXPORT', v_id, v_no,
                                      'คำขอส่งออก ' || v_no || ' · ' || v_count || ' แถว')
        FROM app.staff_ids_with_role(v_approver) AS ap WHERE ap <> v_me;
    END IF;

    RETURN jsonb_build_object('ok', v_status <> 'REJECTED', 'export_id', v_id, 'export_no', v_no,
                              'status', v_status, 'row_count', v_count, 'max_rows', v_max,
                              'code', CASE WHEN v_status = 'REJECTED' THEN 'EXPORT_ROW_LIMIT_EXCEEDED' END);
END;
$$;

CREATE FUNCTION api.decide_export(p_export_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_permission('export.approve');
    e          audit.export_requests%ROWTYPE;
    v_approver text;
BEGIN
    SELECT * INTO e FROM audit.export_requests WHERE id = p_export_id FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบคำขอส่งออกนี้');
    END IF;
    IF e.status <> 'REQUESTED' THEN
        PERFORM app.api_invalid('คำขอนี้ตัดสินแล้ว', 'P0001');
    END IF;
    IF e.requested_by = v_me THEN
        PERFORM app.api_denied('ผู้อนุมัติต้องไม่ใช่ผู้ขอ');
    END IF;
    SELECT s.value -> e.requested_as_role ->> 'approver_role' INTO v_approver FROM app.settings s WHERE s.key = 'export.limits';
    IF v_approver IS NULL OR NOT EXISTS (SELECT 1 FROM app.effective_assignments() ea WHERE ea.role_code = v_approver) THEN
        PERFORM app.api_denied('บทบาทของคุณไม่ใช่ผู้อนุมัติของคำขอนี้');
    END IF;
    UPDATE audit.export_requests
    SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END::audit.export_status,
        approved_by = CASE WHEN p_approve THEN v_me END,
        decided_at = now(),
        decision_note = nullif(btrim(coalesce(p_note, '')), ''),
        updated_by = v_me
    WHERE id = p_export_id;
    PERFORM app.write_audit('EXPORT_DECIDED', 'EXPORT', e.id::text, e.export_no, NULL,
                            jsonb_build_object('status', e.status),
                            jsonb_build_object('status', CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END),
                            ARRAY['status'], nullif(btrim(coalesce(p_note, '')), ''));
    PERFORM app.emit_notification(e.requested_by, 'EXPORT_DECIDED', 'EXPORT', e.id, e.export_no,
                                  'คำขอ ' || e.export_no || ' · ' || CASE WHEN p_approve THEN 'อนุมัติแล้ว' ELSE 'ไม่อนุมัติ' END);
    RETURN jsonb_build_object('ok', true, 'export_id', p_export_id, 'export_no', e.export_no,
                              'status', CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END);
END;
$$;

CREATE FUNCTION api.record_export_download(p_export_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_staff();
    e      audit.export_requests%ROWTYPE;
    v_max  integer := app.setting_int('export.max_downloads', 3);
    v_ttl  integer := app.setting_int('export.link_ttl_hours', 24);
BEGIN
    SELECT * INTO e FROM audit.export_requests WHERE id = p_export_id FOR UPDATE;
    IF NOT FOUND OR e.requested_by <> v_me THEN
        PERFORM app.api_denied('ไม่พบคำขอส่งออกนี้');
    END IF;
    IF NOT app.is_aal2() THEN
        PERFORM app.api_denied('ต้องยืนยัน MFA ก่อนดาวน์โหลดไฟล์ส่งออก');
    END IF;
    IF e.status NOT IN ('GENERATED', 'DOWNLOADED') THEN
        PERFORM app.api_invalid('ไฟล์ยังไม่พร้อมดาวน์โหลดหรือหมดอายุแล้ว', 'P0001');
    END IF;
    IF e.download_count >= v_max THEN
        PERFORM app.api_denied('ดาวน์โหลดครบ ' || v_max || ' ครั้งแล้ว');
    END IF;
    IF e.generated_at IS NULL OR now() >= e.generated_at + make_interval(hours => v_ttl) THEN
        PERFORM app.api_denied('ลิงก์ดาวน์โหลดหมดอายุแล้ว');
    END IF;
    UPDATE audit.export_requests
    SET download_count = download_count + 1, last_downloaded_at = now(), status = 'DOWNLOADED', updated_by = v_me
    WHERE id = p_export_id;
    PERFORM app.write_audit('EXPORT_DOWNLOADED', 'EXPORT', e.id::text, e.export_no, NULL, NULL,
                            jsonb_build_object('download_count', e.download_count + 1), NULL, NULL);
    RETURN jsonb_build_object('ok', true, 'export_id', p_export_id, 'export_no', e.export_no,
                              'file_path', e.file_path, 'download_count', e.download_count + 1);
END;
$$;

CREATE FUNCTION api.list_export_requests(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    v_status text := nullif(p ->> 'status', '');
    v_rows   jsonb;
BEGIN
    IF NOT app.has_permission('customer.export') AND NOT app.has_permission('export.approve') THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ดูคำขอส่งออก');
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'export_id', e.id, 'export_no', e.export_no, 'requested_by', e.requested_by,
               'requested_as_role', e.requested_as_role, 'requested_at', e.requested_at,
               'reason_code', e.reason_code, 'reason_note', e.reason_note, 'row_count', e.row_count,
               'status', e.status, 'approved_by', e.approved_by, 'decided_at', e.decided_at,
               'decision_note', e.decision_note, 'generated_at', e.generated_at,
               'download_count', e.download_count, 'last_downloaded_at', e.last_downloaded_at,
               'is_mine', e.requested_by = v_me) ORDER BY e.requested_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM audit.export_requests e
    WHERE e.organization_id = app.current_organization_id()
      AND (v_status IS NULL OR e.status::text = v_status)
      AND (e.requested_by = v_me
           OR (app.has_permission('export.approve')
               AND EXISTS (SELECT 1 FROM app.effective_assignments() ea
                           WHERE ea.role_code = (SELECT s.value -> e.requested_as_role ->> 'approver_role'
                                                 FROM app.settings s WHERE s.key = 'export.limits'))))
    LIMIT coalesce((p ->> 'limit')::integer, 200);
    RETURN jsonb_build_object('ok', true, 'requests', v_rows);
END;
$$;


-- =====================================================================================
-- บล็อก I — audit · security log (ข้อ 9.5 · คืนค่าปิดบังจากฐานข้อมูล)
-- =====================================================================================

CREATE FUNCTION api.search_audit(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_permission('audit.read');
    v_rows jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'occurred_at', a.occurred_at, 'actor_staff_id', a.actor_staff_id,
               'actor_staff_code', a.actor_staff_code, 'actor_label', a.actor_label, 'actor_roles', to_jsonb(a.actor_roles),
               'aal', a.aal, 'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
               'entity_ref', a.entity_ref, 'branch_id', a.branch_id, 'changed_fields', to_jsonb(a.changed_fields),
               'before', a.before, 'after', a.after, 'reason', a.reason) ORDER BY a.occurred_at DESC, a.id DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT * FROM audit.audit_logs a
        WHERE a.organization_id = app.current_organization_id()
          AND (p ->> 'entity_type' IS NULL OR a.entity_type = ANY (app.audit_entity_types(p ->> 'entity_type')))
          AND (p ->> 'entity_id' IS NULL OR a.entity_id = (p ->> 'entity_id'))
          AND (p ->> 'entity_ref' IS NULL OR a.entity_ref = (p ->> 'entity_ref'))
          AND (p ->> 'action' IS NULL OR a.action = (p ->> 'action'))
          AND (p ->> 'actor_staff_id' IS NULL OR a.actor_staff_id = (p ->> 'actor_staff_id')::uuid)
          AND (p ->> 'from' IS NULL OR a.occurred_at >= (p ->> 'from')::timestamptz)
          AND (p ->> 'to'   IS NULL OR a.occurred_at <  (p ->> 'to')::timestamptz)
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT least(coalesce((p ->> 'limit')::integer, 200), 200)) a;
    RETURN jsonb_build_object('ok', true, 'entries', v_rows);
END;
$$;

CREATE FUNCTION api.get_entity_history(p_entity_type text, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_staff();
    v_rows jsonb;
BEGIN
    IF p_entity_type IS NULL OR p_entity_id IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุ entity_type และ entity_id');
    END IF;
    IF upper(p_entity_type) = 'CUSTOMER' THEN
        IF NOT app.has_permission('audit.read') AND NOT app.can_access_customer('customer.update', p_entity_id) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์ดูประวัติการแก้ไขของลูกค้ารายนี้');
        END IF;
    ELSE
        IF NOT app.has_permission('audit.read') THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์ดูประวัติการแก้ไข');
        END IF;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'occurred_at', a.occurred_at, 'actor_staff_code', a.actor_staff_code,
               'actor_label', a.actor_label, 'aal', a.aal, 'action', a.action, 'entity_type', a.entity_type,
               'entity_id', a.entity_id, 'entity_ref', a.entity_ref, 'changed_fields', to_jsonb(a.changed_fields),
               'before', a.before, 'after', a.after, 'reason', a.reason) ORDER BY a.occurred_at DESC, a.id DESC), '[]'::jsonb)
    INTO v_rows
    FROM audit.audit_logs a
    WHERE a.organization_id = app.current_organization_id()
      AND ((a.entity_type = ANY (app.audit_entity_types(p_entity_type)) AND a.entity_id = p_entity_id::text)
           OR (upper(p_entity_type) = 'CUSTOMER'
               AND coalesce(a.after ->> 'customer_id', a.before ->> 'customer_id') = p_entity_id::text));
    RETURN jsonb_build_object('ok', true, 'entity_type', upper(p_entity_type), 'entity_id', p_entity_id, 'entries', v_rows);
END;
$$;

CREATE FUNCTION api.search_security_log(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('security_log.read');
    v_logins jsonb;
    v_audit  jsonb;
    v_limit  integer := least(coalesce((p ->> 'limit')::integer, 200), 200);
BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'occurred_at', x.occurred_at, 'user_id', x.user_id, 'staff_id', x.staff_id,
               'event_type', x.event_type, 'method', x.method, 'success', x.success, 'failure_reason', x.failure_reason,
               'aal', x.aal, 'ip', x.ip, 'device_id', x.device_id) ORDER BY x.occurred_at DESC), '[]'::jsonb)
    INTO v_logins
    FROM (SELECT * FROM audit.login_events e
          WHERE (e.organization_id IS NULL OR e.organization_id = app.current_organization_id())
            AND (p ->> 'from' IS NULL OR e.occurred_at >= (p ->> 'from')::timestamptz)
            AND (p ->> 'to'   IS NULL OR e.occurred_at <  (p ->> 'to')::timestamptz)
          ORDER BY e.occurred_at DESC LIMIT v_limit) x;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', y.id, 'occurred_at', y.occurred_at, 'actor_staff_code', y.actor_staff_code,
               'actor_label', y.actor_label, 'aal', y.aal, 'action', y.action, 'entity_type', y.entity_type,
               'entity_id', y.entity_id, 'entity_ref', y.entity_ref, 'changed_fields', to_jsonb(y.changed_fields),
               'reason', y.reason) ORDER BY y.occurred_at DESC), '[]'::jsonb)
    INTO v_audit
    FROM (SELECT * FROM audit.audit_logs a
          WHERE a.organization_id = app.current_organization_id()
            AND (a.action LIKE 'ROLE\_%' OR a.action LIKE 'STAFF\_%' OR a.action LIKE 'MFA\_%'
                 OR a.action IN ('PERMISSION_CHANGED', 'SETTINGS_UPDATED', 'INTEGRATION_UPDATED'))
            AND NOT (a.entity_type = ANY (ARRAY['CUSTOMER', 'crm.customers', 'CONTACT', 'crm.customer_contacts']))
            AND (p ->> 'from' IS NULL OR a.occurred_at >= (p ->> 'from')::timestamptz)
            AND (p ->> 'to'   IS NULL OR a.occurred_at <  (p ->> 'to')::timestamptz)
          ORDER BY a.occurred_at DESC LIMIT v_limit) y;
    RETURN jsonb_build_object('ok', true, 'login_events', v_logins, 'audit_entries', v_audit);
END;
$$;


-- =====================================================================================
-- บล็อก J — สิทธิ์ของฉัน · บทบาท · ผู้ใช้ · ทีม · อุปกรณ์ (ข้อ 7 · permission-matrix ข้อ 6)
-- =====================================================================================

CREATE FUNCTION api.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s      core.staff_profiles%ROWTYPE;
    v_aal  text := coalesce(auth.jwt() ->> 'aal', 'aal1');
BEGIN
    SELECT * INTO s FROM core.staff_profiles WHERE user_id = auth.uid();
    IF NOT FOUND THEN
        PERFORM app.transition_denied('T00');
    END IF;
    RETURN jsonb_build_object(
        'ok', true,
        'aal', v_aal,
        'staff', jsonb_build_object('staff_id', s.id, 'staff_code', s.staff_code, 'display_name', s.display_name,
                                    'nickname', s.nickname, 'email', s.email, 'status', s.status,
                                    'organization_id', s.organization_id, 'invite_expires_at', s.invite_expires_at),
        -- assignment ทุกแถวที่ยังมีผลตามเวลา (ไม่กรอง aal) พร้อมธง requires_mfa เพื่อให้ UI บอกได้ว่าต้องยืนยัน MFA
        'roles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                             'role_code', a.role_code, 'branch_id', a.branch_id,
                             'branch_code', b.code, 'rank', r.rank, 'requires_mfa', r.requires_mfa,
                             'effective_now', (NOT r.requires_mfa OR v_aal = 'aal2')) ORDER BY r.sort_order, b.code), '[]'::jsonb)
                  FROM core.staff_role_assignments a
                  JOIN core.roles r ON r.code = a.role_code
                  LEFT JOIN core.branches b ON b.id = a.branch_id
                  WHERE a.staff_id = s.id AND s.status = 'ACTIVE'
                    AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)),
        'permissions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'permission_code', x.permission_code, 'scope', x.scope, 'branch_id', x.branch_id,
                                   'requires_aal2', x.requires_aal2, 'requires_mfa', x.requires_mfa,
                                   'effective_now', x.effective_now) ORDER BY x.permission_code, x.branch_id), '[]'::jsonb)
                        FROM (SELECT DISTINCT rp.permission_code, rp.scope, a.branch_id, rp.requires_aal2, r.requires_mfa,
                                     ((NOT r.requires_mfa OR v_aal = 'aal2') AND (NOT rp.requires_aal2 OR v_aal = 'aal2')) AS effective_now
                              FROM core.staff_role_assignments a
                              JOIN core.roles r ON r.code = a.role_code
                              JOIN core.role_permissions rp ON rp.role_code = a.role_code
                              WHERE a.staff_id = s.id AND s.status = 'ACTIVE'
                                AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)) x),
        'branches', (SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id', b.id, 'code', b.code, 'name_th', b.name_th)
                                               ORDER BY b.code), '[]'::jsonb)
                     FROM core.branches b
                     WHERE b.organization_id = s.organization_id
                       AND (EXISTS (SELECT 1 FROM core.staff_role_assignments a
                                    JOIN core.roles r ON r.code = a.role_code
                                    WHERE a.staff_id = s.id AND a.branch_id = b.id
                                      AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to))
                            OR EXISTS (SELECT 1 FROM core.staff_role_assignments a
                                       JOIN core.roles r ON r.code = a.role_code
                                       WHERE a.staff_id = s.id AND a.branch_id IS NULL AND r.rank IS NOT NULL
                                         AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)))),
        'unread_notifications', (SELECT count(*) FROM crm.notifications n
                                 WHERE n.recipient_staff_id = s.id AND n.read_at IS NULL));
END;
$$;

-- เหตุผลที่มอบบทบาทไม่ได้ (NULL = มอบได้) · ตรรกะเดียวกับ permission-matrix ข้อ 6.1
-- p_target_staff_id = NULL สำหรับบัญชีที่ยังไม่ถูกสร้าง (ใช้ตอนเชิญ)
CREATE FUNCTION app.assign_role_denial(p_target_staff_id uuid, p_role_code text, p_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.current_staff_id();
    v_org    boolean;
    v_rank   integer;
    v_target core.staff_profiles%ROWTYPE;
    r        core.roles%ROWTYPE;
BEGIN
    IF v_me IS NULL OR NOT app.has_permission('role.assign') THEN
        RETURN 'ไม่มีสิทธิ์มอบบทบาท (ต้องยืนยัน MFA)';
    END IF;
    SELECT * INTO r FROM core.roles WHERE code = p_role_code;
    IF NOT FOUND THEN
        RETURN 'ไม่พบบทบาทนี้';
    END IF;
    IF p_target_staff_id IS NOT NULL AND p_target_staff_id = v_me THEN
        RETURN 'ห้ามมอบบทบาทของตนเอง';
    END IF;
    IF p_role_code IN ('EXECUTIVE', 'BUSINESS_ADMIN', 'SYSTEM_ADMIN') THEN
        RETURN 'บทบาทนี้ต้องยื่นคำขอ (api.request_role_grant)';
    END IF;
    SELECT max(rr.rank) INTO v_rank
    FROM app.effective_assignments() ea JOIN core.roles rr ON rr.code = ea.role_code;
    IF v_rank IS NULL OR r.rank IS NULL OR r.rank >= v_rank THEN
        RETURN 'มอบบทบาทที่ระดับเท่ากับหรือสูงกว่าของตนไม่ได้';
    END IF;
    IF r.is_branch_role <> (p_branch_id IS NOT NULL) THEN
        RETURN 'บทบาทสาขาต้องระบุสาขา · บทบาทระดับองค์กรต้องไม่ระบุสาขา';
    END IF;
    v_org := EXISTS (SELECT 1 FROM app.effective_grants('role.assign') g WHERE g.scope = 'ORGANIZATION');
    IF v_org THEN
        IF p_role_code NOT IN ('STAFF', 'SUPERVISOR', 'BRANCH_MANAGER', 'MARKETING', 'OPERATIONS') THEN
            RETURN 'บทบาทนี้มอบผ่านหน้านี้ไม่ได้';
        END IF;
    ELSE
        IF p_role_code NOT IN ('STAFF', 'SUPERVISOR')
           OR p_branch_id IS NULL OR NOT (p_branch_id = ANY (app.scope_branch_ids('role.assign', 'BRANCH'))) THEN
            RETURN 'ผู้จัดการสาขามอบได้เฉพาะ STAFF และ SUPERVISOR ในสาขาของตน';
        END IF;
    END IF;
    IF p_target_staff_id IS NOT NULL THEN
        -- หมายเหตุผู้เขียน: ฟังก์ชันนี้ STABLE (api.can_assign_role ต้อง STABLE ตามข้อ 9.6) จึงล็อกแถวเองไม่ได้
        -- ผู้เรียกที่เขียนข้อมูล (api.assign_role · api.svc_prepare_invite) ทำ SELECT … FOR UPDATE ก่อนตามข้อ 7.1
        SELECT * INTO v_target FROM core.staff_profiles WHERE id = p_target_staff_id;
        IF NOT FOUND OR v_target.organization_id <> app.current_organization_id() THEN
            RETURN 'ไม่พบบัญชีผู้รับ';
        END IF;
        IF v_target.status = 'DISABLED' THEN
            RETURN 'ห้ามมอบบทบาทให้บัญชีที่ปิดใช้งาน';
        END IF;
        IF EXISTS (SELECT 1 FROM core.staff_role_assignments a
                   WHERE a.staff_id = p_target_staff_id AND a.role_code = 'SYSTEM_ADMIN'
                     AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            RETURN 'SYSTEM_ADMIN ถือร่วมกับบทบาทธุรกิจไม่ได้';
        END IF;
        IF v_target.identity_verified_by IS NULL
           AND EXISTS (SELECT 1 FROM core.staff_invitations i
                       JOIN core.staff_role_assignments a ON a.staff_id = i.invited_by AND a.role_code = 'SYSTEM_ADMIN'
                       WHERE i.staff_id = p_target_staff_id) THEN
            RETURN 'ต้องให้ BUSINESS_ADMIN ยืนยันตัวตนกับ HR ก่อน';
        END IF;
        IF p_role_code = 'MARKETING'
           AND EXISTS (SELECT 1 FROM core.staff_role_assignments a
                       WHERE a.staff_id = p_target_staff_id AND a.role_code = 'BUSINESS_ADMIN'
                         AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            RETURN 'ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN ในบัญชีเดียว';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION api.can_assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT app.assign_role_denial(p_target_staff_id, p_role_code, p_branch_id) IS NULL
$$;

CREATE FUNCTION api.assign_role(p_target_staff_id uuid, p_role_code text, p_branch_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('role.assign');
    v_denial text;
    v_id     uuid;
BEGIN
    PERFORM 1 FROM core.staff_profiles WHERE id = p_target_staff_id FOR UPDATE;   -- ข้อ 7.1 (ตรวจ SYSTEM_ADMIN แบบกันแข่ง)
    v_denial := app.assign_role_denial(p_target_staff_id, p_role_code, p_branch_id);
    IF v_denial IS NOT NULL THEN
        PERFORM app.api_denied(v_denial);
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลของการมอบบทบาท');
    END IF;
    PERFORM set_config('app.audit_reason', btrim(p_reason), true);
    INSERT INTO core.staff_role_assignments (staff_id, role_code, branch_id, valid_from, granted_by, grant_reason)
    VALUES (p_target_staff_id, p_role_code, p_branch_id, now(), v_me, btrim(p_reason))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'assignment_id', v_id, 'staff_id', p_target_staff_id,
                              'role_code', p_role_code, 'branch_id', p_branch_id);
END;
$$;

CREATE FUNCTION api.revoke_role(p_assignment_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('role.assign');
    a    core.staff_role_assignments%ROWTYPE;
    v_org boolean;
BEGIN
    SELECT * INTO a FROM core.staff_role_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF NOT FOUND OR a.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบการมอบบทบาทนี้');
    END IF;
    IF a.staff_id = v_me THEN
        PERFORM app.api_denied('ห้ามถอนบทบาทของตนเอง');
    END IF;
    IF a.role_code IN ('EXECUTIVE', 'BUSINESS_ADMIN', 'SYSTEM_ADMIN') THEN
        PERFORM app.api_denied('บทบาทนี้ถอนผ่านคำขอชนิด REVOKE เท่านั้น (api.request_role_grant)');
    END IF;
    IF a.valid_to IS NOT NULL AND a.valid_to <= now() THEN
        PERFORM app.api_invalid('บทบาทนี้ถอนหรือหมดอายุแล้ว', 'P0001');
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลของการถอนบทบาท');
    END IF;
    v_org := EXISTS (SELECT 1 FROM app.effective_grants('role.assign') g WHERE g.scope = 'ORGANIZATION');
    IF v_org THEN
        IF a.role_code NOT IN ('STAFF', 'SUPERVISOR', 'BRANCH_MANAGER', 'MARKETING', 'OPERATIONS') THEN
            PERFORM app.api_denied('บทบาทนี้ถอนผ่านหน้านี้ไม่ได้');
        END IF;
    ELSIF a.role_code NOT IN ('STAFF', 'SUPERVISOR')
          OR a.branch_id IS NULL OR NOT (a.branch_id = ANY (app.scope_branch_ids('role.assign', 'BRANCH'))) THEN
        PERFORM app.api_denied('ผู้จัดการสาขาถอนได้เฉพาะ STAFF และ SUPERVISOR ในสาขาของตน');
    END IF;
    PERFORM set_config('app.audit_reason', btrim(p_reason), true);
    UPDATE core.staff_role_assignments
    SET valid_to = now(), revoked_by = v_me, revoke_reason = btrim(p_reason), updated_by = v_me
    WHERE id = p_assignment_id;
    RETURN jsonb_build_object('ok', true, 'assignment_id', p_assignment_id, 'staff_id', a.staff_id, 'role_code', a.role_code);
END;
$$;

CREATE FUNCTION api.request_role_grant(p_target_staff_id uuid, p_role_code text,
                                       p_request_type text DEFAULT 'GRANT', p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('role.request');
    t    core.staff_profiles%ROWTYPE;
    v_id uuid;
    v_no text;
BEGIN
    IF p_role_code NOT IN ('SYSTEM_ADMIN', 'EXECUTIVE', 'BUSINESS_ADMIN') THEN
        PERFORM app.api_invalid('คำขอนี้ใช้กับ SYSTEM_ADMIN · EXECUTIVE · BUSINESS_ADMIN เท่านั้น');
    END IF;
    IF p_request_type NOT IN ('GRANT', 'REVOKE') THEN
        PERFORM app.api_invalid('ชนิดคำขอต้องเป็น GRANT หรือ REVOKE');
    END IF;
    SELECT * INTO t FROM core.staff_profiles WHERE id = p_target_staff_id FOR UPDATE;
    IF NOT FOUND OR t.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบบัญชีผู้รับ');
    END IF;
    IF p_target_staff_id = v_me THEN
        PERFORM app.api_denied('ยื่นคำขอบทบาทให้ตนเองไม่ได้');
    END IF;
    IF p_request_type = 'GRANT' THEN
        IF t.status = 'DISABLED' THEN
            PERFORM app.api_denied('ห้ามมอบบทบาทให้บัญชีที่ปิดใช้งาน');
        END IF;
        IF p_role_code = 'SYSTEM_ADMIN'
           AND EXISTS (SELECT 1 FROM core.staff_role_assignments a
                       WHERE a.staff_id = p_target_staff_id AND a.role_code <> 'SYSTEM_ADMIN'
                         AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            PERFORM app.api_denied('SYSTEM_ADMIN ถือร่วมกับบทบาทธุรกิจไม่ได้');
        END IF;
        IF p_role_code <> 'SYSTEM_ADMIN'
           AND EXISTS (SELECT 1 FROM core.staff_role_assignments a
                       WHERE a.staff_id = p_target_staff_id AND a.role_code = 'SYSTEM_ADMIN'
                         AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            PERFORM app.api_denied('บัญชีนี้เป็น SYSTEM_ADMIN จึงรับบทบาทธุรกิจไม่ได้');
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM core.staff_role_assignments a
                       WHERE a.staff_id = p_target_staff_id AND a.role_code = p_role_code
                         AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            PERFORM app.api_invalid('บัญชีนี้ไม่มีบทบาทที่ขอถอน', 'P0001');
        END IF;
    END IF;
    INSERT INTO core.role_grant_requests (request_no, role_code, request_type, target_staff_id, requested_by,
                                          requested_at, request_reason)
    VALUES (NULL, p_role_code, p_request_type, p_target_staff_id, v_me, now(), nullif(btrim(coalesce(p_reason, '')), ''))
    RETURNING id, request_no INTO v_id, v_no;
    PERFORM app.emit_notification(ex, 'ROLE_GRANT_APPROVAL_REQUIRED', 'ROLE_GRANT_REQUEST', v_id, v_no,
                                  'คำขอ ' || p_request_type || ' ' || p_role_code || ' · ' || v_no)
    FROM app.staff_ids_with_role('EXECUTIVE') AS ex WHERE ex <> p_target_staff_id;
    RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'request_no', v_no,
                              'role_code', p_role_code, 'request_type', p_request_type);
END;
$$;

CREATE FUNCTION api.decide_role_grant(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_permission('role.decide');
    q      core.role_grant_requests%ROWTYPE;
    t      core.staff_profiles%ROWTYPE;
    v_emp  text;
    v_left integer;
BEGIN
    SELECT * INTO q FROM core.role_grant_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR q.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบคำขอนี้');
    END IF;
    IF q.status <> 'REQUESTED' THEN
        PERFORM app.api_invalid('คำขอนี้ตัดสินแล้ว', 'P0001');
    END IF;
    IF v_me IN (q.requested_by, q.target_staff_id) THEN
        PERFORM app.api_denied('ผู้ตัดสินต้องไม่ใช่ผู้ยื่นหรือผู้รับ');
    END IF;
    SELECT * INTO t FROM core.staff_profiles WHERE id = q.target_staff_id FOR UPDATE;
    SELECT s.employee_code INTO v_emp FROM core.staff_profiles s WHERE s.id = v_me;
    IF v_emp IS NOT NULL AND t.employee_code = v_emp THEN
        PERFORM app.api_denied('ผู้ตัดสินต้องไม่ใช่บัญชีที่มีรหัสพนักงานเดียวกับผู้รับ');
    END IF;

    IF p_approve AND q.request_type = 'GRANT' THEN
        IF t.status = 'DISABLED' THEN
            PERFORM app.api_denied('ห้ามมอบบทบาทให้บัญชีที่ปิดใช้งาน');
        END IF;
        IF q.role_code IN ('EXECUTIVE', 'BUSINESS_ADMIN') AND t.identity_verified_by IS NULL
           AND EXISTS (SELECT 1 FROM core.staff_invitations i
                       JOIN core.staff_role_assignments a ON a.staff_id = i.invited_by AND a.role_code = 'SYSTEM_ADMIN'
                       WHERE i.staff_id = q.target_staff_id) THEN
            -- Bootstrap (PM ข้อ 6.3 M3): ผู้อนุมัติ (EXECUTIVE) ยืนยันตัวตนกับ HR แทน BUSINESS_ADMIN
            UPDATE core.staff_profiles SET identity_verified_by = v_me, identity_verified_at = now(), updated_by = v_me
            WHERE id = q.target_staff_id;
        END IF;
    END IF;
    IF p_approve AND q.request_type = 'REVOKE' AND q.role_code IN ('EXECUTIVE', 'BUSINESS_ADMIN') THEN
        SELECT count(DISTINCT a.staff_id) INTO v_left
        FROM core.staff_role_assignments a
        JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
        WHERE a.role_code = q.role_code AND a.staff_id <> q.target_staff_id
          AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to);
        IF coalesce(v_left, 0) = 0 THEN
            PERFORM app.api_denied('องค์กรต้องเหลือ ' || q.role_code || ' ที่ใช้งานอยู่อย่างน้อย 1 บัญชี');
        END IF;
    END IF;

    PERFORM set_config('app.audit_reason', coalesce(nullif(btrim(coalesce(p_note, '')), ''), q.request_type), true);
    UPDATE core.role_grant_requests
    SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
        decided_by = v_me, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), ''), updated_by = v_me
    WHERE id = p_request_id;

    IF p_approve AND q.request_type = 'GRANT' THEN
        INSERT INTO core.staff_role_assignments (staff_id, role_code, branch_id, valid_from, granted_by, grant_reason)
        VALUES (q.target_staff_id, q.role_code, NULL, now(), v_me, coalesce(q.request_reason, q.request_no));
    ELSIF p_approve AND q.request_type = 'REVOKE' THEN
        UPDATE core.staff_role_assignments
        SET valid_to = now(), revoked_by = v_me, revoke_reason = coalesce(q.request_reason, q.request_no), updated_by = v_me
        WHERE staff_id = q.target_staff_id AND role_code = q.role_code AND (valid_to IS NULL OR valid_to > now());
    END IF;

    PERFORM app.emit_notification(q.requested_by, 'ROLE_GRANT_DECIDED', 'ROLE_GRANT_REQUEST', q.id, q.request_no,
                                  'คำขอ ' || q.request_no || ' · ' || CASE WHEN p_approve THEN 'อนุมัติแล้ว' ELSE 'ไม่อนุมัติ' END);
    RETURN jsonb_build_object('ok', true, 'request_id', p_request_id, 'request_no', q.request_no,
                              'status', CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END);
END;
$$;

CREATE FUNCTION api.list_role_grant_requests(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    v_all    boolean := app.has_permission('role.decide');
    v_mine   boolean := app.has_permission('role.request');
    v_read   boolean := app.has_permission('user.read');
    v_status text := nullif(p ->> 'status', '');
    v_rows   jsonb;
BEGIN
    IF NOT (v_all OR v_mine OR v_read) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ดูคำขอมอบบทบาท');
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'request_id', q.id, 'request_no', q.request_no, 'role_code', q.role_code, 'request_type', q.request_type,
               'target_staff_id', q.target_staff_id, 'target_staff_code', ts.staff_code, 'target_display_name', ts.display_name,
               'target_email', ts.email, 'target_employee_code', ts.employee_code, 'target_status', ts.status,
               'invited_by', inv.invited_by, 'invited_at', inv.invited_at,
               'requested_by', q.requested_by, 'requested_at', q.requested_at, 'request_reason', q.request_reason,
               'status', q.status, 'decided_by', q.decided_by, 'decided_at', q.decided_at, 'decision_note', q.decision_note)
               ORDER BY q.requested_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM core.role_grant_requests q
    JOIN core.staff_profiles ts ON ts.id = q.target_staff_id
    LEFT JOIN LATERAL (SELECT i.invited_by, i.invited_at FROM core.staff_invitations i
                       WHERE i.staff_id = q.target_staff_id ORDER BY i.invited_at DESC LIMIT 1) inv ON true
    WHERE q.organization_id = app.current_organization_id()
      AND (v_status IS NULL OR q.status = v_status)
      AND (v_all
           OR (v_mine AND q.requested_by = v_me)
           OR (v_read AND (EXISTS (SELECT 1 FROM core.staff_role_assignments a
                                   WHERE a.staff_id = q.target_staff_id
                                     AND a.branch_id = ANY (app.scope_branch_ids('user.read', 'BRANCH'))
                                     AND (a.valid_to IS NULL OR a.valid_to > now()))
                           OR q.target_staff_id = ANY (app.team_member_staff_ids('user.read')))));
    RETURN jsonb_build_object('ok', true, 'requests', v_rows);
END;
$$;

-- ข้อ 7.3 ข้อ 3 — เปิดใช้งานบัญชีของตนเอง (ไม่ใช้ app.require_staff เพราะสถานะยังเป็น INVITED)
CREATE FUNCTION api.activate_self()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s        core.staff_profiles%ROWTYPE;
    v_uid    uuid := auth.uid();
    v_mfa    boolean;
BEGIN
    IF v_uid IS NULL THEN
        PERFORM app.transition_denied('T00');
    END IF;
    SELECT * INTO s FROM core.staff_profiles WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบบัญชีพนักงานของผู้ใช้นี้');
    END IF;
    IF s.status = 'ACTIVE' THEN
        RETURN jsonb_build_object('ok', true, 'staff_id', s.id, 'status', 'ACTIVE', 'already_active', true);
    END IF;
    IF s.status <> 'INVITED' THEN
        PERFORM app.api_denied('บัญชีนี้เปิดใช้งานเองไม่ได้');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL) THEN
        PERFORM app.api_invalid('ต้องยืนยันอีเมลก่อนเปิดใช้งาน', 'P0001');
    END IF;
    IF s.invite_expires_at IS NULL OR s.invite_expires_at <= now() THEN
        PERFORM app.api_invalid('คำเชิญหมดอายุแล้ว ต้องให้ผู้ดูแลเชิญใหม่', 'P0001');
    END IF;
    SELECT EXISTS (SELECT 1 FROM core.staff_role_assignments a JOIN core.roles r ON r.code = a.role_code
                   WHERE a.staff_id = s.id AND r.requires_mfa AND (a.valid_to IS NULL OR a.valid_to > now()))
    INTO v_mfa;
    IF v_mfa AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_uid AND f.status = 'verified') THEN
        PERFORM app.api_invalid('บทบาทของคุณต้องลงทะเบียน MFA ก่อนเปิดใช้งาน', 'P0001');
    END IF;
    UPDATE core.staff_profiles SET status = 'ACTIVE', invite_expires_at = NULL, updated_by = s.id WHERE id = s.id;
    UPDATE core.staff_invitations SET accepted_at = now(), updated_by = s.id
    WHERE staff_id = s.id AND accepted_at IS NULL AND revoked_at IS NULL;
    RETURN jsonb_build_object('ok', true, 'staff_id', s.id, 'staff_code', s.staff_code, 'status', 'ACTIVE',
                              'requires_mfa', v_mfa);
END;
$$;

CREATE FUNCTION api.list_staff(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('user.read');
    v_org    boolean := EXISTS (SELECT 1 FROM app.effective_grants('user.read') g WHERE g.scope = 'ORGANIZATION');
    v_sys    boolean := EXISTS (SELECT 1 FROM app.effective_assignments() ea WHERE ea.role_code = 'SYSTEM_ADMIN');
    v_status text := nullif(p ->> 'status', '');
    v_rows   jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'staff_id', s.id, 'staff_code', s.staff_code, 'display_name', s.display_name, 'nickname', s.nickname,
               'email', s.email, 'phone', s.phone, 'employee_code', s.employee_code, 'status', s.status,
               'identity_verified_by', s.identity_verified_by, 'invite_expires_at', s.invite_expires_at,
               'roles', (SELECT coalesce(jsonb_agg(jsonb_build_object('assignment_id', a.id, 'role_code', a.role_code,
                                                                      'branch_id', a.branch_id, 'valid_from', a.valid_from,
                                                                      'valid_to', a.valid_to) ORDER BY a.role_code), '[]'::jsonb)
                         FROM core.staff_role_assignments a
                         WHERE a.staff_id = s.id AND (a.valid_to IS NULL OR a.valid_to > now())),
               'teams', (SELECT coalesce(jsonb_agg(jsonb_build_object('team_id', tm.team_id, 'code', tt.code,
                                                                      'is_leader', tm.is_leader) ORDER BY tt.code), '[]'::jsonb)
                         FROM core.team_members tm JOIN core.teams tt ON tt.id = tm.team_id
                         WHERE tm.staff_id = s.id AND (tm.valid_to IS NULL OR tm.valid_to > now())))
               ORDER BY s.staff_code), '[]'::jsonb)
    INTO v_rows
    FROM core.staff_profiles s
    WHERE s.organization_id = app.current_organization_id()
      AND (v_status IS NULL OR s.status::text = v_status)
      AND (v_org
           OR EXISTS (SELECT 1 FROM core.staff_role_assignments a
                      WHERE a.staff_id = s.id AND (a.valid_to IS NULL OR a.valid_to > now())
                        AND a.branch_id = ANY (app.scope_branch_ids('user.read', 'BRANCH')))
           OR s.id = ANY (app.team_member_staff_ids('user.read'))
           OR (v_sys AND NOT EXISTS (SELECT 1 FROM core.staff_role_assignments a
                                     WHERE a.staff_id = s.id AND a.role_code <> 'SYSTEM_ADMIN'
                                       AND (a.valid_to IS NULL OR a.valid_to > now()))));
    RETURN jsonb_build_object('ok', true, 'staff', v_rows);
END;
$$;

-- เหตุผลที่แก้/ปิดใช้งานบัญชีนี้ไม่ได้ (NULL = ทำได้) · permission-matrix ข้อ 6.5
CREATE FUNCTION app.staff_admin_denial(p_target_staff_id uuid, p_permission text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me  uuid := app.current_staff_id();
    t     core.staff_profiles%ROWTYPE;
    v_org boolean;
    v_sys boolean;
BEGIN
    IF v_me IS NULL OR NOT app.has_permission(p_permission) THEN
        RETURN 'ไม่มีสิทธิ์จัดการบัญชีผู้ใช้';
    END IF;
    SELECT * INTO t FROM core.staff_profiles WHERE id = p_target_staff_id;       -- ผู้เรียก VOLATILE ล็อกแถวก่อนเรียก
    IF NOT FOUND OR t.organization_id <> app.current_organization_id() THEN
        RETURN 'ไม่พบบัญชีนี้';
    END IF;
    v_org := EXISTS (SELECT 1 FROM app.effective_grants(p_permission) g WHERE g.scope = 'ORGANIZATION');
    v_sys := EXISTS (SELECT 1 FROM app.effective_grants(p_permission) g WHERE g.scope = 'SYSTEM')
             AND NOT v_org;
    IF v_sys THEN
        IF EXISTS (SELECT 1 FROM core.staff_role_assignments a
                   WHERE a.staff_id = p_target_staff_id AND a.role_code <> 'SYSTEM_ADMIN'
                     AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            RETURN 'SYSTEM_ADMIN จัดการได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ';
        END IF;
        RETURN NULL;
    END IF;
    IF NOT v_org THEN
        -- BRANCH_MANAGER: ทุก assignment ที่ยังมีผลของเป้าหมายต้องเป็น STAFF/SUPERVISOR ในสาขาที่ตนเป็นผู้จัดการ
        IF EXISTS (SELECT 1 FROM core.staff_role_assignments a
                   WHERE a.staff_id = p_target_staff_id AND (a.valid_to IS NULL OR a.valid_to > now())
                     AND (a.role_code NOT IN ('STAFF', 'SUPERVISOR')
                          OR a.branch_id IS NULL
                          OR NOT (a.branch_id = ANY (app.scope_branch_ids(p_permission, 'BRANCH'))))) THEN
            RETURN 'ผู้จัดการสาขาจัดการได้เฉพาะ STAFF/SUPERVISOR ในสาขาของตน';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM core.staff_role_assignments a
                       WHERE a.staff_id = p_target_staff_id AND (a.valid_to IS NULL OR a.valid_to > now())) THEN
            RETURN 'ผู้จัดการสาขาจัดการได้เฉพาะบัญชีที่มีบทบาทในสาขาของตน';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION api.update_staff(p_staff_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('user.update');
    v_denial text;
    v_org    boolean := EXISTS (SELECT 1 FROM app.effective_grants('user.update') g WHERE g.scope = 'ORGANIZATION');
BEGIN
    PERFORM 1 FROM core.staff_profiles WHERE id = p_staff_id FOR UPDATE;
    v_denial := app.staff_admin_denial(p_staff_id, 'user.update');
    IF v_denial IS NOT NULL THEN
        PERFORM app.api_denied(v_denial);
    END IF;
    IF p ? 'email' AND NOT v_org THEN
        PERFORM app.api_denied('ผู้จัดการสาขาแก้อีเมลไม่ได้ (ข้อ 7.3 ข้อ 5)');
    END IF;
    UPDATE core.staff_profiles
    SET display_name  = coalesce(nullif(btrim(coalesce(p ->> 'display_name', '')), ''), display_name),
        nickname      = CASE WHEN p ? 'nickname' THEN nullif(btrim(coalesce(p ->> 'nickname', '')), '') ELSE nickname END,
        phone         = CASE WHEN p ? 'phone' THEN nullif(btrim(coalesce(p ->> 'phone', '')), '') ELSE phone END,
        employee_code = coalesce(nullif(btrim(coalesce(p ->> 'employee_code', '')), ''), employee_code),
        email         = coalesce(nullif(btrim(coalesce(p ->> 'email', '')), ''), email),
        identity_verified_by = CASE WHEN coalesce((p ->> 'identity_verified')::boolean, false) AND v_org
                                    THEN v_me ELSE identity_verified_by END,
        identity_verified_at = CASE WHEN coalesce((p ->> 'identity_verified')::boolean, false) AND v_org
                                    THEN now() ELSE identity_verified_at END,
        updated_by    = v_me
    WHERE id = p_staff_id;
    RETURN jsonb_build_object('ok', true, 'staff_id', p_staff_id);
END;
$$;

CREATE FUNCTION api.disable_staff(p_staff_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me      uuid := app.require_permission('user.disable');
    v_denial  text;
    v_role    text;
    v_opps    integer := 0;
    v_leads   integer := 0;
    v_tasks   integer := 0;
    o         record;
    v_bm      uuid;
BEGIN
    PERFORM 1 FROM core.staff_profiles WHERE id = p_staff_id FOR UPDATE;
    v_denial := app.staff_admin_denial(p_staff_id, 'user.disable');
    IF v_denial IS NOT NULL THEN
        PERFORM app.api_denied(v_denial);
    END IF;
    IF p_staff_id = v_me THEN
        PERFORM app.api_denied('ห้ามปิดใช้งานตนเอง');
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลการปิดใช้งาน');
    END IF;
    FOREACH v_role IN ARRAY ARRAY['EXECUTIVE', 'BUSINESS_ADMIN'] LOOP
        IF EXISTS (SELECT 1 FROM core.staff_role_assignments a
                   WHERE a.staff_id = p_staff_id AND a.role_code = v_role AND (a.valid_to IS NULL OR a.valid_to > now()))
           AND NOT EXISTS (SELECT 1 FROM core.staff_role_assignments a
                           JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
                           WHERE a.role_code = v_role AND a.staff_id <> p_staff_id
                             AND a.organization_id = (SELECT s2.organization_id FROM core.staff_profiles s2
                                                       WHERE s2.id = p_staff_id)   -- ข้อ 7.3: นับเฉพาะองค์กรเดียวกัน
                             AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)) THEN
            PERFORM app.api_denied('ห้ามปิดใช้งาน ' || v_role || ' ที่ใช้งานอยู่คนสุดท้าย');
        END IF;
    END LOOP;

    -- opportunity ที่เปิดอยู่ต้องมีผู้จัดการสาขารับช่วง (ข้อ 7.3 ข้อ 4)
    FOR o IN SELECT x.id, x.branch_id, x.opportunity_no FROM crm.opportunities x
             WHERE x.owner_staff_id = p_staff_id AND x.stage IN ('INTERESTED', 'QUOTATION', 'FOLLOW_UP')
             FOR UPDATE
    LOOP
        SELECT s.id INTO v_bm
        FROM core.staff_role_assignments a
        JOIN core.staff_profiles s ON s.id = a.staff_id AND s.status = 'ACTIVE'
        WHERE a.role_code = 'BRANCH_MANAGER' AND a.branch_id = o.branch_id AND a.staff_id <> p_staff_id
          AND a.valid_from <= now() AND (a.valid_to IS NULL OR now() < a.valid_to)
        ORDER BY s.staff_code
        LIMIT 1;
        IF v_bm IS NULL THEN
            PERFORM app.api_denied('สาขาของ ' || o.opportunity_no || ' ไม่มีผู้จัดการสาขารับช่วง · โอนงานด้วย api.assign_owner ก่อน');
        END IF;
        UPDATE crm.opportunities SET owner_staff_id = v_bm, updated_by = v_me WHERE id = o.id;
        INSERT INTO crm.ownership_changes (organization_id, entity_type, entity_id, from_staff_id, to_staff_id,
                                           reason_code, note, changed_by, changed_at)
        VALUES (app.current_organization_id(), 'OPPORTUNITY', o.id, p_staff_id, v_bm, 'STAFF_LEFT', btrim(p_reason), v_me, now());
        v_opps := v_opps + 1;
    END LOOP;

    -- lead และ task ที่เปิดอยู่ → owner ว่าง + แจ้ง LEAD_UNASSIGNED
    FOR o IN SELECT x.id, x.branch_id, x.lead_no FROM crm.leads x
             WHERE x.owner_staff_id = p_staff_id AND x.status IN ('NEW', 'CONTACTED', 'QUALIFIED') FOR UPDATE
    LOOP
        UPDATE crm.leads SET owner_staff_id = NULL, updated_by = v_me WHERE id = o.id;
        INSERT INTO crm.ownership_changes (organization_id, entity_type, entity_id, from_staff_id, to_staff_id,
                                           reason_code, note, changed_by, changed_at)
        VALUES (app.current_organization_id(), 'LEAD', o.id, p_staff_id, NULL, 'STAFF_LEFT', btrim(p_reason), v_me, now());
        PERFORM app.emit_notification(x, 'LEAD_UNASSIGNED', 'LEAD', o.id, o.lead_no, 'Lead ' || o.lead_no || ' ยังไม่มีผู้รับผิดชอบ')
        FROM (SELECT app.staff_ids_with_role('SUPERVISOR', o.branch_id) AS x
              UNION SELECT app.staff_ids_with_role('BRANCH_MANAGER', o.branch_id)) y;
        v_leads := v_leads + 1;
    END LOOP;
    FOR o IN SELECT x.id FROM crm.tasks x
             WHERE x.owner_staff_id = p_staff_id AND x.status IN ('OPEN', 'IN_PROGRESS') AND NOT x.is_next_action FOR UPDATE
    LOOP
        UPDATE crm.tasks SET owner_staff_id = NULL, updated_by = v_me WHERE id = o.id;
        INSERT INTO crm.ownership_changes (organization_id, entity_type, entity_id, from_staff_id, to_staff_id,
                                           reason_code, note, changed_by, changed_at)
        VALUES (app.current_organization_id(), 'TASK', o.id, p_staff_id, NULL, 'STAFF_LEFT', btrim(p_reason), v_me, now());
        v_tasks := v_tasks + 1;
    END LOOP;

    PERFORM set_config('app.audit_reason', btrim(p_reason), true);
    UPDATE core.staff_role_assignments
    SET valid_to = now(), revoked_by = v_me, revoke_reason = btrim(p_reason), updated_by = v_me
    WHERE staff_id = p_staff_id AND (valid_to IS NULL OR valid_to > now());
    UPDATE core.staff_profiles SET status = 'DISABLED', updated_by = v_me WHERE id = p_staff_id;

    RETURN jsonb_build_object('ok', true, 'staff_id', p_staff_id, 'opportunities_reassigned', v_opps,
                              'leads_unassigned', v_leads, 'tasks_unassigned', v_tasks);
END;
$$;

CREATE FUNCTION api.save_team(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_permission('team.manage');
    v_id     uuid := nullif(p ->> 'team_id', '')::uuid;
    v_branch uuid := nullif(p ->> 'branch_id', '')::uuid;
    v_code   text := nullif(btrim(coalesce(p ->> 'code', '')), '');
    v_name   text := nullif(btrim(coalesce(p ->> 'name_th', '')), '');
    t        core.teams%ROWTYPE;
BEGIN
    IF v_id IS NOT NULL THEN
        SELECT * INTO t FROM core.teams WHERE id = v_id FOR UPDATE;
        IF NOT FOUND OR t.organization_id <> app.current_organization_id() THEN
            PERFORM app.api_denied('ไม่พบทีมนี้');
        END IF;
        v_branch := coalesce(v_branch, t.branch_id);
    END IF;
    IF v_branch IS NULL OR NOT (v_branch = ANY (app.scope_branch_ids('team.manage', 'BRANCH'))) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์จัดการทีมของสาขานี้');
    END IF;
    IF v_id IS NULL THEN
        IF v_code IS NULL OR v_name IS NULL THEN
            PERFORM app.api_invalid('ต้องระบุ code และ name_th');
        END IF;
        INSERT INTO core.teams (branch_id, code, name_th, is_active)
        VALUES (v_branch, upper(v_code), v_name, coalesce((p ->> 'is_active')::boolean, true))
        RETURNING id INTO v_id;
    ELSE
        IF t.branch_id <> v_branch AND NOT (t.branch_id = ANY (app.scope_branch_ids('team.manage', 'BRANCH'))) THEN
            PERFORM app.api_denied('ไม่มีสิทธิ์ย้ายทีมจากสาขาเดิม');
        END IF;
        UPDATE core.teams
        SET branch_id = v_branch, name_th = coalesce(v_name, name_th),
            is_active = coalesce((p ->> 'is_active')::boolean, is_active), updated_by = v_me
        WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'team_id', v_id, 'branch_id', v_branch);
END;
$$;

CREATE FUNCTION api.set_team_member(p_team_id uuid, p_staff_id uuid, p_is_leader boolean DEFAULT false,
                                    p_active boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('team.manage');
    t    core.teams%ROWTYPE;
    v_id uuid;
BEGIN
    SELECT * INTO t FROM core.teams WHERE id = p_team_id;
    IF NOT FOUND OR t.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบทีมนี้');
    END IF;
    IF NOT (t.branch_id = ANY (app.scope_branch_ids('team.manage', 'BRANCH'))) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์จัดการทีมของสาขานี้');
    END IF;
    IF p_active AND NOT app.staff_has_branch_assignment(p_staff_id, t.branch_id) THEN
        PERFORM app.api_denied('สมาชิกทีมต้องมีบทบาทที่ยังมีผลในสาขาของทีม (ข้อ 7.1)');
    END IF;
    SELECT m.id INTO v_id FROM core.team_members m
    WHERE m.team_id = p_team_id AND m.staff_id = p_staff_id AND m.valid_to IS NULL FOR UPDATE;
    IF p_active THEN
        IF v_id IS NULL THEN
            INSERT INTO core.team_members (team_id, staff_id, is_leader, valid_from)
            VALUES (p_team_id, p_staff_id, coalesce(p_is_leader, false), now())
            RETURNING id INTO v_id;
        ELSE
            UPDATE core.team_members SET is_leader = coalesce(p_is_leader, false), updated_by = v_me WHERE id = v_id;
        END IF;
    ELSIF v_id IS NOT NULL THEN
        UPDATE core.team_members SET valid_to = now(), updated_by = v_me WHERE id = v_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'team_id', p_team_id, 'staff_id', p_staff_id,
                              'member_id', v_id, 'is_leader', coalesce(p_is_leader, false), 'active', p_active);
END;
$$;

CREATE FUNCTION api.register_device(p_device_id text, p_branch_id uuid, p_is_shared_counter boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_staff();
    v_id uuid;
BEGIN
    IF coalesce(btrim(coalesce(p_device_id, '')), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุ device_id');
    END IF;
    IF p_branch_id IS NULL OR NOT (p_branch_id = ANY (app.scope_branch_ids('user.update', 'BRANCH'))) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ลงทะเบียนอุปกรณ์ของสาขานี้');
    END IF;
    INSERT INTO core.devices AS d (device_id, branch_id, is_shared_counter, label)
    VALUES (btrim(p_device_id), p_branch_id, coalesce(p_is_shared_counter, false), NULL)
    ON CONFLICT (device_id) DO UPDATE
        SET branch_id = excluded.branch_id, is_shared_counter = excluded.is_shared_counter,
            is_active = true, updated_by = v_me
    RETURNING d.id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'device_row_id', v_id, 'device_id', btrim(p_device_id),
                              'branch_id', p_branch_id, 'is_shared_counter', coalesce(p_is_shared_counter, false));
END;
$$;


-- =====================================================================================
-- บล็อก K — ค่าตั้งของระบบ (ข้อ 11.2)
-- =====================================================================================

CREATE FUNCTION api.get_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_staff();
    v_biz  boolean := app.has_permission('settings.business');
    v_sys  boolean := app.has_permission('settings.system');
    v_rows jsonb;
BEGIN
    IF NOT (v_biz OR v_sys) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ดูค่าตั้งของระบบ');
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'editable_by', s.editable_by,
                                                 'updated_by', s.updated_by, 'updated_at', s.updated_at)
                              ORDER BY s.key), '[]'::jsonb)
    INTO v_rows
    FROM app.settings s
    WHERE (s.editable_by = 'settings.business' AND v_biz) OR (s.editable_by = 'settings.system' AND v_sys);
    RETURN jsonb_build_object('ok', true, 'settings', v_rows);
END;
$$;

CREATE FUNCTION api.update_setting(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    s        app.settings%ROWTYPE;
BEGIN
    SELECT * INTO s FROM app.settings WHERE key = p_key FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_invalid('ไม่พบค่าตั้ง ' || coalesce(p_key, '(null)'));
    END IF;
    IF NOT app.has_permission(s.editable_by) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์แก้ค่าตั้งนี้ (ต้องมี ' || s.editable_by || ' และยืนยัน MFA)');
    END IF;
    IF p_value IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุค่าใหม่');
    END IF;
    UPDATE app.settings SET value = p_value, updated_by = v_me, updated_at = now() WHERE key = p_key;
    PERFORM app.write_audit('SETTINGS_UPDATED', 'SETTING', p_key, p_key, NULL,
                            jsonb_build_object('value', s.value), jsonb_build_object('value', p_value),
                            ARRAY['value'], NULL);
    RETURN jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
END;
$$;


-- =====================================================================================
-- บล็อก L — PDPA: คำขอเจ้าของข้อมูล · ข้อมูลนิรนาม · legal hold · integration log (ข้อ 10)
-- =====================================================================================

CREATE FUNCTION api.create_dsr(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me       uuid := app.require_permission('dsr.create');
    v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
    v_type     text := nullif(p ->> 'request_type', '');
    v_name     text := nullif(btrim(coalesce(p ->> 'requester_name', '')), '');
    v_id       uuid;
    v_no       text;
BEGIN
    IF v_name IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุชื่อผู้ยื่นคำขอ');
    END IF;
    IF v_type IS NULL OR v_type NOT IN ('ACCESS', 'CORRECTION', 'DELETION', 'OBJECTION', 'WITHDRAW_CONSENT', 'PORTABILITY') THEN
        PERFORM app.api_invalid('ประเภทคำขอไม่ถูกต้อง');
    END IF;
    IF v_customer IS NOT NULL AND NOT app.can_access_customer('dsr.create', v_customer) THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์รับคำขอของลูกค้ารายนี้');
    END IF;
    INSERT INTO crm.data_subject_requests (request_no, customer_id, requester_name, requester_contact_masked,
                                           request_type, status, received_at, received_by, note)
    VALUES (NULL, v_customer, v_name,
            app.mask_pii_text(nullif(btrim(coalesce(p ->> 'requester_contact', '')), '')),
            v_type::crm.dsr_type, 'RECEIVED', now(), v_me, nullif(btrim(coalesce(p ->> 'note', '')), ''))
    RETURNING id, request_no INTO v_id, v_no;
    RETURN jsonb_build_object('ok', true, 'dsr_id', v_id, 'request_no', v_no, 'status', 'RECEIVED');
END;
$$;

CREATE FUNCTION api.list_dsr(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me     uuid := app.require_staff();
    v_manage boolean := app.has_permission('dsr.manage');
    v_status text := nullif(p ->> 'status', '');
    v_rows   jsonb;
BEGIN
    IF NOT v_manage AND NOT app.has_permission('dsr.create') THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์ดูคำขอเจ้าของข้อมูล');
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'dsr_id', d.id, 'request_no', d.request_no, 'customer_id', d.customer_id,
               'requester_name', d.requester_name, 'requester_contact_masked', d.requester_contact_masked,
               'request_type', d.request_type, 'status', d.status, 'received_at', d.received_at,
               'received_by', d.received_by, 'due_at', d.due_at, 'verification_method', d.verification_method,
               'verified_by', d.verified_by, 'extended_until', d.extended_until, 'completed_at', d.completed_at,
               'note', d.note) ORDER BY d.received_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM crm.data_subject_requests d
    WHERE d.organization_id = app.current_organization_id()
      AND (v_status IS NULL OR d.status::text = v_status)
      AND (v_manage OR d.received_by = v_me);
    RETURN jsonb_build_object('ok', true, 'requests', v_rows);
END;
$$;

CREATE FUNCTION api.update_dsr(p_dsr_id uuid, p_status text, p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_permission('dsr.manage');
    d      crm.data_subject_requests%ROWTYPE;
    v_new  crm.dsr_status;
    v_vm   text := nullif(p ->> 'verification_method', '');
BEGIN
    SELECT * INTO d FROM crm.data_subject_requests WHERE id = p_dsr_id FOR UPDATE;
    IF NOT FOUND OR d.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบคำขอนี้');
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('RECEIVED', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED') THEN
        PERFORM app.api_invalid('สถานะไม่ถูกต้อง');
    END IF;
    v_new := p_status::crm.dsr_status;
    IF (d.status::text, v_new::text) NOT IN (('RECEIVED', 'VERIFIED'), ('RECEIVED', 'REJECTED'),
                                             ('VERIFIED', 'IN_PROGRESS'), ('VERIFIED', 'REJECTED'),
                                             ('IN_PROGRESS', 'COMPLETED'), ('IN_PROGRESS', 'REJECTED'),
                                             ('VERIFIED', 'COMPLETED')) THEN
        PERFORM app.api_invalid('เปลี่ยนสถานะคำขอจาก ' || d.status || ' เป็น ' || v_new || ' ไม่ได้', 'P0001');
    END IF;
    IF v_new = 'VERIFIED' THEN
        IF v_vm IS NULL OR v_vm NOT IN ('IN_PERSON_ID_SIGHTED', 'OTP_TO_REGISTERED_CONTACT', 'OTHER') THEN
            PERFORM app.api_invalid('ต้องระบุวิธียืนยันตัวตน (ห้ามเก็บสำเนาบัตร)');
        END IF;
    END IF;
    UPDATE crm.data_subject_requests
    SET status              = v_new,
        verification_method = CASE WHEN v_new = 'VERIFIED' THEN v_vm ELSE verification_method END,
        verified_by         = CASE WHEN v_new = 'VERIFIED' THEN v_me ELSE verified_by END,
        completed_at        = CASE WHEN v_new = 'COMPLETED' THEN now() ELSE completed_at END,
        extended_until      = coalesce(nullif(p ->> 'extended_until', '')::timestamptz, extended_until),
        extension_reason    = coalesce(nullif(btrim(coalesce(p ->> 'extension_reason', '')), ''), extension_reason),
        note                = coalesce(nullif(btrim(coalesce(p ->> 'note', '')), ''), note),
        updated_by          = v_me
    WHERE id = p_dsr_id;
    RETURN jsonb_build_object('ok', true, 'dsr_id', p_dsr_id, 'status', v_new, 'verified_by',
                              CASE WHEN v_new = 'VERIFIED' THEN v_me ELSE d.verified_by END);
END;
$$;

-- ข้อ 10.4 — แพ็กเกจข้อมูลของลูกค้ารายเดียว (ACCESS / PORTABILITY · ไม่ผ่านเพดาน export)
-- หมายเหตุผู้เขียน: action ของ audit ใช้รูป {ENTITY}_{VERB} = DSR_PACKAGE_BUILT (ข้อ 9.5 ไม่ได้ระบุชื่อนี้ไว้)
CREATE FUNCTION api.build_dsr_package(p_dsr_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('dsr.manage');
    d    crm.data_subject_requests%ROWTYPE;
    v_pkg jsonb;
BEGIN
    SELECT * INTO d FROM crm.data_subject_requests WHERE id = p_dsr_id;
    IF NOT FOUND OR d.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบคำขอนี้');
    END IF;
    IF d.request_type NOT IN ('ACCESS', 'PORTABILITY') THEN
        PERFORM app.api_invalid('สร้างแพ็กเกจได้เฉพาะคำขอชนิด ACCESS หรือ PORTABILITY', 'P0001');
    END IF;
    IF d.status NOT IN ('VERIFIED', 'IN_PROGRESS') THEN
        PERFORM app.api_invalid('ต้องยืนยันตัวตนก่อนสร้างแพ็กเกจ', 'P0001');
    END IF;
    IF d.customer_id IS NULL THEN
        PERFORM app.api_invalid('คำขอนี้ยังไม่ผูกกับลูกค้า', 'P0001');
    END IF;
    SELECT jsonb_build_object(
        'customer', jsonb_build_object('customer_no', c.customer_no, 'first_name', c.first_name, 'last_name', c.last_name,
                                       'nickname', c.nickname, 'province_code', c.province_code,
                                       'first_seen_at', c.first_seen_at, 'lifecycle_stage', c.lifecycle_stage,
                                       'record_status', c.record_status),
        'contacts', (SELECT coalesce(jsonb_agg(jsonb_build_object('contact_type', ct.contact_type, 'value', ct.value_raw,
                                                                  'is_active', ct.is_active) ORDER BY ct.contact_type), '[]'::jsonb)
                     FROM crm.customer_contacts ct WHERE ct.customer_id = c.id),
        'addresses', (SELECT coalesce(jsonb_agg(jsonb_build_object('address_line', ad.address_line, 'subdistrict', ad.subdistrict,
                                                                   'district', ad.district, 'province_code', ad.province_code,
                                                                   'postal_code', ad.postal_code)), '[]'::jsonb)
                      FROM crm.customer_addresses ad WHERE ad.customer_id = c.id),
        'consents', (SELECT coalesce(jsonb_agg(jsonb_build_object('purpose_code', cs.purpose_code, 'status', cs.status,
                                                                  'channels', to_jsonb(cs.channels), 'captured_at', cs.captured_at,
                                                                  'notice_version', cs.notice_version) ORDER BY cs.captured_at), '[]'::jsonb)
                     FROM crm.customer_consents cs WHERE cs.customer_id = c.id),
        'visits', (SELECT coalesce(jsonb_agg(jsonb_build_object('visit_no', v.visit_no, 'started_at', v.started_at,
                                                                'channel_code', v.channel_code, 'outcome_code', v.outcome_code)
                                             ORDER BY v.started_at), '[]'::jsonb)
                   FROM crm.visits v WHERE v.customer_id = c.id),
        'interactions', (SELECT coalesce(jsonb_agg(jsonb_build_object('occurred_at', i.occurred_at, 'channel_code', i.channel_code,
                                                                      'direction', i.direction, 'type', i.interaction_type_code,
                                                                      'summary', i.summary) ORDER BY i.occurred_at), '[]'::jsonb)
                         FROM crm.interactions i WHERE i.customer_id = c.id),
        'leads', (SELECT coalesce(jsonb_agg(jsonb_build_object('lead_no', l.lead_no, 'created_at', l.created_at,
                                                               'status', l.status, 'interest_code', l.interest_code,
                                                               'product_model', l.product_model) ORDER BY l.created_at), '[]'::jsonb)
                  FROM crm.leads l WHERE l.customer_id = c.id),
        'opportunities', (SELECT coalesce(jsonb_agg(jsonb_build_object('opportunity_no', o.opportunity_no, 'created_at', o.created_at,
                                                                       'stage', o.stage, 'won_amount', o.won_amount) ORDER BY o.created_at), '[]'::jsonb)
                          FROM crm.opportunities o WHERE o.customer_id = c.id),
        'transactions', (SELECT coalesce(jsonb_agg(jsonb_build_object('external_no', t.external_no, 'transacted_at', t.transacted_at,
                                                                      'transaction_type_code', t.transaction_type_code,
                                                                      'amount', t.amount) ORDER BY t.transacted_at), '[]'::jsonb)
                         FROM crm.transaction_refs t WHERE t.customer_id = c.id),
        'notes', (SELECT coalesce(jsonb_agg(jsonb_build_object('created_at', n.created_at, 'body', n.body) ORDER BY n.created_at), '[]'::jsonb)
                  FROM crm.customer_notes n WHERE n.customer_id = c.id))
    INTO v_pkg
    FROM crm.customers c WHERE c.id = d.customer_id;

    PERFORM app.write_audit('DSR_PACKAGE_BUILT', 'DSR', d.id::text, d.request_no, NULL, NULL,
                            jsonb_build_object('customer_id', d.customer_id), NULL, d.request_type::text);
    RETURN jsonb_build_object('ok', true, 'dsr_id', d.id, 'request_no', d.request_no,
                              'customer_id', d.customer_id, 'package', v_pkg);
END;
$$;

-- ข้อ 10.4 · 19.4 ข้อ 2 — ทำข้อมูลนิรนาม (ภายใน · ใช้โดย api.anonymize_customer และงาน retention)
CREATE FUNCTION app.anonymize_customer(p_customer_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c       crm.customers%ROWTYPE;
    v_pii   text[];
    v_merged uuid;
    v_done  jsonb := '[]'::jsonb;
BEGIN
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    END IF;
    IF c.record_status = 'ANONYMIZED' THEN
        RETURN jsonb_build_object('ok', true, 'already', true, 'customer_id', p_customer_id);
    END IF;
    PERFORM set_config('app.bulk', 'on', true);
    PERFORM set_config('app.audit_reason', coalesce(p_reason, 'ANONYMIZE'), true);

    DELETE FROM crm.customer_contacts  WHERE customer_id = p_customer_id;
    DELETE FROM crm.customer_addresses WHERE customer_id = p_customer_id;
    UPDATE crm.customer_notes    SET body = '[ANONYMIZED]'      WHERE customer_id = p_customer_id;
    UPDATE crm.interactions      SET summary = NULL              WHERE customer_id = p_customer_id AND summary IS NOT NULL;
    UPDATE crm.tasks             SET title = '[ANONYMIZED]', description = NULL WHERE customer_id = p_customer_id;
    UPDATE crm.leads             SET next_action = CASE WHEN next_action IS NULL THEN NULL ELSE '[ANONYMIZED]' END,
                                     lost_note = NULL            WHERE customer_id = p_customer_id;
    UPDATE crm.opportunities     SET next_action = CASE WHEN next_action IS NULL THEN NULL ELSE '[ANONYMIZED]' END,
                                     lost_note = NULL            WHERE customer_id = p_customer_id;
    UPDATE crm.quotations        SET terms_note = NULL           WHERE customer_id = p_customer_id AND terms_note IS NOT NULL;
    UPDATE crm.transaction_refs  SET summary = NULL, device_imei = NULL, device_serial = NULL WHERE customer_id = p_customer_id;
    UPDATE crm.customer_consents SET evidence = '[ANONYMIZED]'   WHERE customer_id = p_customer_id;
    UPDATE crm.duplicate_decisions SET override_note = NULL, decision_note = NULL
    WHERE customer_id = p_customer_id OR candidate_customer_id = p_customer_id;
    UPDATE crm.customer_merges   SET snapshot = '{"redacted": true}'::jsonb
    WHERE survivor_customer_id = p_customer_id OR merged_customer_id = p_customer_id;
    UPDATE crm.notifications     SET title = '[ANONYMIZED]', body = NULL
    WHERE entity_id IN (SELECT x.id FROM crm.leads x WHERE x.customer_id = p_customer_id
                        UNION SELECT x.id FROM crm.opportunities x WHERE x.customer_id = p_customer_id
                        UNION SELECT x.id FROM crm.tasks x WHERE x.customer_id = p_customer_id
                        UNION SELECT p_customer_id);
    UPDATE crm.data_subject_requests SET note = NULL WHERE customer_id = p_customer_id AND note IS NOT NULL;

    UPDATE crm.customers
    SET first_name = 'ลูกค้านิรนาม ' || c.customer_no,
        last_name = NULL, nickname = NULL, province_code = NULL, note_summary = NULL,
        record_status = 'ANONYMIZED'
    WHERE id = p_customer_id;

    -- แทนค่า PII ใน audit.audit_logs ของลูกค้ารายนี้ (19.4 ข้อ 2)
    v_pii := ARRAY(SELECT DISTINCT x.column_name FROM app.pii_columns() x);
    PERFORM set_config('app.audit_redaction', 'on', true);
    UPDATE audit.audit_logs a
    SET before = (SELECT jsonb_object_agg(e.k, CASE WHEN e.k = ANY (v_pii) THEN '"[ANONYMIZED]"'::jsonb ELSE e.v END)
                  FROM jsonb_each(a.before) AS e(k, v)),
        after  = (SELECT jsonb_object_agg(e.k, CASE WHEN e.k = ANY (v_pii) THEN '"[ANONYMIZED]"'::jsonb ELSE e.v END)
                  FROM jsonb_each(a.after) AS e(k, v))
    WHERE a.entity_id = p_customer_id::text
       OR coalesce(a.after ->> 'customer_id', a.before ->> 'customer_id') = p_customer_id::text;
    PERFORM set_config('app.audit_redaction', 'off', true);

    v_done := jsonb_build_array(p_customer_id);
    FOR v_merged IN SELECT x.id FROM crm.customers x WHERE x.merged_into_id = p_customer_id AND x.record_status <> 'ANONYMIZED'
    LOOP
        v_done := v_done || (app.anonymize_customer(v_merged, p_reason) -> 'anonymized');
    END LOOP;

    PERFORM set_config('app.bulk', 'off', true);
    PERFORM app.refresh_customer_lifecycle(p_customer_id);
    RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id, 'anonymized', v_done);
END;
$$;

CREATE FUNCTION api.anonymize_customer(p_customer_id uuid, p_dsr_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_permission('customer.anonymize');
    c      crm.customers%ROWTYPE;
    d      crm.data_subject_requests%ROWTYPE;
    v_rate jsonb;
    v_res  jsonb;
BEGIN
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id;
    IF NOT FOUND OR c.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบลูกค้ารายนี้');
    END IF;
    IF c.legal_hold THEN
        PERFORM app.api_invalid('ลูกค้ารายนี้ติด legal hold (ข้อ 10.3)', 'P0001');
    END IF;
    IF p_dsr_id IS NULL THEN
        PERFORM app.api_invalid('ต้องอ้างคำขอเจ้าของข้อมูลที่ยืนยันตัวตนแล้ว');
    END IF;
    SELECT * INTO d FROM crm.data_subject_requests WHERE id = p_dsr_id;
    IF NOT FOUND OR d.customer_id IS DISTINCT FROM p_customer_id THEN
        PERFORM app.api_invalid('คำขอนี้ไม่ตรงกับลูกค้ารายนี้', 'P0001');
    END IF;
    IF d.status NOT IN ('VERIFIED', 'IN_PROGRESS') OR d.verified_by IS NULL THEN
        PERFORM app.api_invalid('คำขอต้องผ่านการยืนยันตัวตนก่อน', 'P0001');
    END IF;
    IF d.verified_by = v_me THEN
        PERFORM app.api_denied('ผู้ดำเนินการต้องไม่ใช่ผู้ยืนยันตัวตน (ข้อ 10.4 · Q26)');
    END IF;
    v_rate := app.rate_limit_hit('dsr.anonymize_per_day', true);
    IF NOT (v_rate ->> 'allowed')::boolean THEN
        PERFORM app.api_denied('ทำข้อมูลนิรนามครบ ' || (v_rate ->> 'limit') || ' รายของวันนี้แล้ว');
    END IF;
    v_res := app.anonymize_customer(p_customer_id, 'DSR ' || d.request_no);
    RETURN v_res || jsonb_build_object('dsr_id', p_dsr_id, 'request_no', d.request_no);
END;
$$;

CREATE FUNCTION api.set_legal_hold(p_customer_id uuid, p_on boolean, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me uuid := app.require_permission('dsr.manage');
    c    crm.customers%ROWTYPE;
BEGIN
    SELECT * INTO c FROM crm.customers WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND OR c.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบลูกค้ารายนี้');
    END IF;
    IF coalesce(btrim(coalesce(p_reason, '')), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุเหตุผลของการตั้ง/ยกเลิก legal hold');
    END IF;
    PERFORM set_config('app.audit_reason', btrim(p_reason), true);
    UPDATE crm.customers SET legal_hold = coalesce(p_on, false), updated_by = v_me WHERE id = p_customer_id;
    RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id, 'legal_hold', coalesce(p_on, false));
END;
$$;

CREATE FUNCTION api.list_integration_logs(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me   uuid := app.require_permission('integration.manage');
    v_rows jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'occurred_at', x.occurred_at, 'source_system_code', x.source_system_code,
               'direction', x.direction, 'operation', x.operation, 'status', x.status, 'http_status', x.http_status,
               'external_ref', x.external_ref, 'error_message', x.error_message, 'payload_sha256', x.payload_sha256,
               'actor_label', x.actor_label, 'request_id', x.request_id) ORDER BY x.occurred_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (SELECT * FROM audit.integration_logs l
          WHERE (l.organization_id IS NULL OR l.organization_id = app.current_organization_id())
            AND (p ->> 'source_system_code' IS NULL OR l.source_system_code = (p ->> 'source_system_code'))
            AND (p ->> 'status' IS NULL OR l.status = (p ->> 'status'))
            AND (p ->> 'from' IS NULL OR l.occurred_at >= (p ->> 'from')::timestamptz)
            AND (p ->> 'to'   IS NULL OR l.occurred_at <  (p ->> 'to')::timestamptz)
          ORDER BY l.occurred_at DESC
          LIMIT least(coalesce((p ->> 'limit')::integer, 200), 200)) x;
    RETURN jsonb_build_object('ok', true, 'entries', v_rows);
END;
$$;


-- =====================================================================================
-- บล็อก M — RPC ของ Edge Function (api.svc_* · GRANT ให้ service_role เท่านั้น · ข้อ 9.6 · 9.8)
-- F8: Edge Function verify JWT แล้วส่ง sub ของผู้เรียกมา · ห้ามรับ staff_id จาก body
-- หมายเหตุผู้เขียน: audit.log_row_change (0008) ยังไม่อ่าน app.actor_staff_id จึงตั้ง request.jwt.claims
-- ของผู้กระทำที่ verify แล้วควบคู่ไปด้วย เพื่อให้ actor ใน audit และ helper ตรวจสิทธิ์ถูกต้อง
-- =====================================================================================

CREATE FUNCTION app.svc_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ฟังก์ชันนี้เรียกได้จาก Edge Function เท่านั้น';
    END IF;
END;
$$;

CREATE FUNCTION app.svc_set_actor(p_actor_user_id uuid, p_aal text DEFAULT 'aal1')
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_staff uuid;
BEGIN
    IF p_actor_user_id IS NULL THEN
        PERFORM app.api_invalid('ต้องส่ง sub ของ JWT ที่ verify แล้ว');
    END IF;
    SELECT s.id INTO v_staff FROM core.staff_profiles s WHERE s.user_id = p_actor_user_id AND s.status = 'ACTIVE';
    IF v_staff IS NULL THEN
        PERFORM app.api_denied('ผู้กระทำไม่ใช่พนักงานที่ใช้งานอยู่');
    END IF;
    PERFORM set_config('app.actor_staff_id', v_staff::text, true);
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p_actor_user_id, 'role', 'service_role',
                                         'aal', coalesce(nullif(p_aal, ''), 'aal1'))::text, true);
    RETURN v_staff;
END;
$$;

CREATE FUNCTION api.svc_build_export_dataset(p_export_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM app.svc_guard();
    RETURN app.build_export_dataset(p_export_id);
END;
$$;

CREATE FUNCTION api.svc_mark_export_generated(p_export_id uuid, p_file_path text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    e audit.export_requests%ROWTYPE;
BEGIN
    PERFORM app.svc_guard();
    IF coalesce(btrim(coalesce(p_file_path, '')), '') = '' THEN
        PERFORM app.api_invalid('ต้องระบุ file_path');
    END IF;
    SELECT * INTO e FROM audit.export_requests WHERE id = p_export_id FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบคำขอส่งออกนี้');
    END IF;
    IF e.status <> 'APPROVED' THEN
        PERFORM app.api_invalid('คำขอนี้ไม่อยู่ในสถานะ APPROVED', 'P0001');
    END IF;
    UPDATE audit.export_requests
    SET status = 'GENERATED', generated_at = now(), file_path = btrim(p_file_path)
    WHERE id = p_export_id;
    PERFORM app.emit_notification(e.requested_by, 'EXPORT_READY', 'EXPORT', e.id, e.export_no,
                                  'ไฟล์ของคำขอ ' || e.export_no || ' พร้อมดาวน์โหลด');
    RETURN jsonb_build_object('ok', true, 'export_id', p_export_id, 'export_no', e.export_no, 'status', 'GENERATED');
END;
$$;

-- ข้อ 7.3 ข้อ 2 · 19.3 ข้อ 6 — สร้างบัญชี INVITED + คำเชิญ + assignment ก่อนออกลิงก์เชิญ
CREATE FUNCTION api.svc_prepare_invite(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor   uuid;
    v_role    text := nullif(p ->> 'role_code', '');
    v_branch  uuid := nullif(p ->> 'branch_id', '')::uuid;
    v_email   text := lower(btrim(coalesce(p ->> 'email', '')));
    v_denial  text;
    v_staff   uuid;
    v_code    text;
    v_expires timestamptz := now() + interval '24 hours';
BEGIN
    PERFORM app.svc_guard();
    v_actor := app.svc_set_actor(nullif(p ->> 'actor_user_id', '')::uuid, p ->> 'actor_aal');
    IF v_email = '' OR nullif(btrim(coalesce(p ->> 'display_name', '')), '') IS NULL
       OR nullif(btrim(coalesce(p ->> 'employee_code', '')), '') IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุ อีเมล · ชื่อที่แสดง · รหัสพนักงาน');
    END IF;
    IF NOT app.has_permission('user.invite') THEN
        PERFORM app.api_denied('ไม่มีสิทธิ์เชิญผู้ใช้');
    END IF;
    IF v_role IS NOT NULL THEN
        v_denial := app.assign_role_denial(NULL, v_role, v_branch);
        IF v_denial IS NOT NULL THEN
            PERFORM app.api_denied(v_denial);
        END IF;
    END IF;
    INSERT INTO core.staff_profiles (organization_id, staff_code, employee_code, display_name, nickname, email, phone,
                                     status, invite_expires_at)
    VALUES (app.current_organization_id(), NULL, btrim(p ->> 'employee_code'), btrim(p ->> 'display_name'),
            nullif(btrim(coalesce(p ->> 'nickname', '')), ''), v_email, nullif(btrim(coalesce(p ->> 'phone', '')), ''),
            'INVITED', v_expires)
    RETURNING id, staff_code INTO v_staff, v_code;
    INSERT INTO core.staff_invitations (organization_id, staff_id, email, invited_by, invited_at, expires_at)
    VALUES (app.current_organization_id(), v_staff, v_email, v_actor, now(), v_expires);
    IF v_role IS NOT NULL THEN
        INSERT INTO core.staff_role_assignments (staff_id, role_code, branch_id, valid_from, granted_by, grant_reason)
        VALUES (v_staff, v_role, v_branch, now(), v_actor, 'คำเชิญผู้ใช้ใหม่');
    END IF;
    RETURN jsonb_build_object('ok', true, 'staff_id', v_staff, 'staff_code', v_code, 'email', v_email,
                              'invite_expires_at', v_expires, 'role_code', v_role, 'branch_id', v_branch);
END;
$$;

-- ปิดคำเชิญที่ค้างหลัง Edge Function ban ผู้ใช้และเพิกถอน session แล้ว (ข้อ 7.3 ข้อ 4)
CREATE FUNCTION api.svc_finalize_disable(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor  uuid;
    v_staff  uuid := nullif(p ->> 'staff_id', '')::uuid;
    s        core.staff_profiles%ROWTYPE;
BEGIN
    PERFORM app.svc_guard();
    v_actor := app.svc_set_actor(nullif(p ->> 'actor_user_id', '')::uuid, p ->> 'actor_aal');
    SELECT * INTO s FROM core.staff_profiles WHERE id = v_staff FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบบัญชีนี้');
    END IF;
    IF s.status <> 'DISABLED' THEN
        PERFORM app.api_invalid('บัญชีนี้ยังไม่ถูกปิดใช้งานด้วย api.disable_staff', 'P0001');
    END IF;
    UPDATE core.staff_invitations SET revoked_at = now(), updated_by = v_actor
    WHERE staff_id = v_staff AND accepted_at IS NULL AND revoked_at IS NULL;
    PERFORM app.write_audit('STAFF_DISABLED', 'STAFF', v_staff::text, s.staff_code, NULL, NULL,
                            jsonb_build_object('auth_banned', true, 'sessions_revoked', true), NULL,
                            nullif(btrim(coalesce(p ->> 'reason', '')), ''));
    RETURN jsonb_build_object('ok', true, 'staff_id', v_staff, 'staff_code', s.staff_code);
END;
$$;

-- ข้อ 9.5 — บันทึกเหตุการณ์เข้าสู่ระบบ (สำเร็จ/ล้มเหลว · MFA · ออกจากระบบ)
-- ทำไมต้องมี: audit.login_events ถูก REVOKE จากทุก role และไม่มีทางเขียนเลย
-- ข้อกำหนด "Login / MFA / Invite / Disable Audit" จึงปิดไม่ครบ ถ้าไม่มีประตูนี้
-- ตัวระบุที่ผู้ใช้กรอก (อีเมล/ST-NNNN) เก็บเป็น sha256 เท่านั้น ห้ามเก็บค่าจริง (ข้อ 9.5)
CREATE FUNCTION api.svc_record_login_event(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user  uuid := nullif(p ->> 'user_id', '')::uuid;
    v_staff uuid;
    v_org   uuid;
    v_id    bigint;
BEGIN
    PERFORM app.svc_guard();
    IF nullif(p ->> 'event_type', '') IS NULL OR (p ->> 'success') IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุ event_type และ success');
    END IF;

    -- ผูกกับพนักงานให้ถ้าทำได้ เพื่อให้หน้าประวัติความปลอดภัยกรองตามคนได้
    IF v_user IS NOT NULL THEN
        SELECT sp.id, sp.organization_id INTO v_staff, v_org
        FROM core.staff_profiles sp WHERE sp.user_id = v_user;
    END IF;

    INSERT INTO audit.login_events (organization_id, user_id, staff_id, event_type, method, success,
                                    failure_reason, identifier_hash, aal, ip, user_agent, device_id, request_id, detail)
    VALUES (v_org, v_user, v_staff,
            upper(btrim(p ->> 'event_type')),
            nullif(upper(btrim(coalesce(p ->> 'method', ''))), ''),
            (p ->> 'success')::boolean,
            nullif(btrim(coalesce(p ->> 'failure_reason', '')), ''),
            nullif(btrim(coalesce(p ->> 'identifier_hash', '')), ''),
            nullif(btrim(coalesce(p ->> 'aal', '')), ''),
            nullif(btrim(coalesce(p ->> 'ip', '')), ''),
            left(nullif(btrim(coalesce(p ->> 'user_agent', '')), ''), 400),
            nullif(btrim(coalesce(p ->> 'device_id', '')), ''),
            nullif(btrim(coalesce(p ->> 'request_id', '')), ''),
            p -> 'detail')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'login_event_id', v_id);
END;
$$;

-- ข้อ 7.1 · 19.3 ข้อ 6 — ผูกบัญชีผู้ใช้ที่ Auth เพิ่งสร้าง เข้ากับโปรไฟล์ที่ถูกเชิญไว้
-- ทำไมต้องมี: api.svc_prepare_invite สร้างโปรไฟล์สถานะ INVITED โดยยังไม่มี user_id
-- แต่ api.activate_self() ค้นหาพนักงานด้วย user_id = auth.uid() ถ้าไม่ผูกขั้นนี้ คำเชิญจะเปิดใช้งานไม่ได้เลย
-- Edge Function invite-staff เรียกตัวนี้ทันทีหลังสร้างบัญชีผู้ใช้ใน Supabase Auth
CREATE FUNCTION api.svc_link_invited_user(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_staff uuid := nullif(p ->> 'staff_id', '')::uuid;
    v_user  uuid := nullif(p ->> 'user_id', '')::uuid;
    s       core.staff_profiles%ROWTYPE;
    v_email text;
BEGIN
    PERFORM app.svc_guard();
    IF v_staff IS NULL OR v_user IS NULL THEN
        PERFORM app.api_invalid('ต้องระบุ staff_id และ user_id');
    END IF;

    SELECT * INTO s FROM core.staff_profiles WHERE id = v_staff FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM app.api_denied('ไม่พบโปรไฟล์พนักงาน');
    END IF;
    -- ผูกได้เฉพาะบัญชีที่เพิ่งถูกเชิญและยังไม่เคยผูก — กันการยึดบัญชีที่ใช้งานอยู่
    IF s.status <> 'INVITED' THEN
        PERFORM app.api_denied('ผูกบัญชีผู้ใช้ได้เฉพาะโปรไฟล์ที่สถานะ INVITED');
    END IF;
    IF s.user_id IS NOT NULL THEN
        PERFORM app.api_denied('โปรไฟล์นี้ผูกบัญชีผู้ใช้ไว้แล้ว');
    END IF;

    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_user;
    IF v_email IS NULL THEN
        PERFORM app.api_denied('ไม่พบบัญชีผู้ใช้');
    END IF;
    -- อีเมลต้องตรงกับที่เชิญไว้ ไม่งั้นเท่ากับเชิญคนหนึ่งแล้วผูกให้อีกคน
    IF lower(btrim(v_email)) IS DISTINCT FROM lower(btrim(s.email)) THEN
        PERFORM app.api_denied('อีเมลของบัญชีผู้ใช้ไม่ตรงกับอีเมลที่เชิญไว้');
    END IF;
    IF EXISTS (SELECT 1 FROM core.staff_profiles x WHERE x.user_id = v_user) THEN
        PERFORM app.api_denied('บัญชีผู้ใช้นี้ผูกกับพนักงานคนอื่นแล้ว');
    END IF;

    UPDATE core.staff_profiles SET user_id = v_user, updated_at = now() WHERE id = v_staff;
    RETURN jsonb_build_object('ok', true, 'staff_id', v_staff, 'staff_code', s.staff_code);
END;
$$;

-- ข้อ 9.2 — เข้าสู่ระบบด้วย ST-NNNN (คืน user_id เท่านั้น ห้ามส่งอีเมลออก)
CREATE FUNCTION api.svc_resolve_staff_code(p_staff_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s core.staff_profiles%ROWTYPE;
BEGIN
    PERFORM app.svc_guard();
    SELECT * INTO s FROM core.staff_profiles WHERE staff_code = upper(btrim(coalesce(p_staff_code, '')));
    IF NOT FOUND OR s.user_id IS NULL OR s.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('ok', false);              -- ข้อความผิดพลาดเหมือนกันทุกกรณี (ข้อ 9.2)
    END IF;
    RETURN jsonb_build_object('ok', true, 'user_id', s.user_id, 'staff_id', s.id, 'status', s.status);
END;
$$;

-- ข้อ 7.3 ข้อ 6 — ตรวจสิทธิ์ก่อนรีเซ็ต MFA / เปลี่ยนอีเมล
CREATE FUNCTION api.svc_reset_mfa_authorize(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor   uuid;
    v_target  uuid := nullif(p ->> 'target_staff_id', '')::uuid;
    t         core.staff_profiles%ROWTYPE;
    v_high    boolean;
    v_need    text;
BEGIN
    PERFORM app.svc_guard();
    v_actor := app.svc_set_actor(nullif(p ->> 'actor_user_id', '')::uuid, p ->> 'actor_aal');
    IF NOT app.is_aal2() THEN
        PERFORM app.api_denied('ผู้กระทำต้องยืนยัน MFA ในเซสชันนี้');
    END IF;
    SELECT * INTO t FROM core.staff_profiles WHERE id = v_target;
    IF NOT FOUND OR t.organization_id <> app.current_organization_id() THEN
        PERFORM app.api_denied('ไม่พบบัญชีเป้าหมาย');
    END IF;
    v_high := EXISTS (SELECT 1 FROM core.staff_role_assignments a
                      WHERE a.staff_id = v_target AND a.role_code IN ('BUSINESS_ADMIN', 'EXECUTIVE', 'SYSTEM_ADMIN')
                        AND (a.valid_to IS NULL OR a.valid_to > now()));
    v_need := CASE WHEN v_high THEN 'EXECUTIVE' ELSE 'BUSINESS_ADMIN' END;
    IF NOT EXISTS (SELECT 1 FROM app.effective_assignments() ea WHERE ea.role_code = v_need) THEN
        PERFORM app.api_denied('บัญชีนี้ต้องให้ ' || v_need || ' เป็นผู้ดำเนินการ');
    END IF;
    PERFORM app.write_audit('MFA_RESET', 'STAFF', v_target::text, t.staff_code, NULL, NULL,
                            jsonb_build_object('authorized_by_role', v_need), NULL,
                            nullif(btrim(coalesce(p ->> 'reason', '')), ''));
    RETURN jsonb_build_object('ok', true, 'target_staff_id', v_target, 'target_user_id', t.user_id,
                              'required_role', v_need);
END;
$$;

-- ไฟล์ที่ต้องลบใน Storage (อ่านอย่างเดียว · การเปลี่ยนสถานะเป็นของ app.job_expire_exports)
CREATE FUNCTION api.svc_expired_export_files()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows jsonb;
BEGIN
    PERFORM app.svc_guard();
    SELECT coalesce(jsonb_agg(jsonb_build_object('export_id', e.id, 'export_no', e.export_no, 'file_path', e.file_path,
                                                 'expired_at', e.expired_at) ORDER BY e.export_no), '[]'::jsonb)
    INTO v_rows
    FROM audit.export_requests e
    WHERE e.status = 'EXPIRED' AND e.file_path IS NOT NULL AND e.file_deleted_at IS NULL;
    RETURN jsonb_build_object('ok', true, 'files', v_rows);
END;
$$;


-- =====================================================================================
-- บล็อก N — GRANT EXECUTE (F3 · CI-18) และ COMMENT (data dictionary)
-- =====================================================================================

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p WHERE p.pronamespace = 'api'::regnamespace
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
        IF r.proname LIKE 'svc\_%' THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
        ELSE
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
    END LOOP;
END $$;

COMMENT ON FUNCTION api.quick_capture(jsonb) IS
'สร้างลูกค้า (ทางเดียวตามข้อ 6.2) ในทรานแซกชันเดียว: customer + contacts + consent PRIVACY_NOTICE (+ MARKETING) '
'+ visit/interaction ต้นทาง + lead อัตโนมัติตาม ref.interest_types.creates_lead (สถานะตามข้อ 4.3) + โน้ตแรก · '
'ส่ง create_lead = false เพื่อไม่สร้าง lead ของคำขอนั้น (Phase 1 · ข้อ 20.12 · D52 — ปิดได้อย่างเดียว เปิดไม่ได้) · '
'คำนวณผู้สมัครซ้ำใหม่ฝั่ง server (19.3 ข้อ 2) และบังคับเหตุผล override เมื่อมีคะแนน ≥ 70 (ข้อ 6.5) · ต้องมี customer.create ในสาขา';
COMMENT ON FUNCTION api.find_customer_candidates(uuid, text, text, text, text, text) IS
'ตรวจซ้ำก่อนสร้างลูกค้า (ข้อ 6.5) · ต้องมี customer.create และตัวระบุเต็มอย่างน้อย 1 · การ์ดย่อสำหรับลูกค้านอกขอบเขต · '
'อัตรา security.search_per_hour / security.search_miss_per_hour · เขียน CUSTOMER_CANDIDATE_SEARCH (sha256 ของค่า normalized)';
COMMENT ON FUNCTION api.search_customers(text) IS
'ค้นหาทั่วไป (ข้อ 6.5) · เบอร์/อีเมล/LINE/IMEI/เลขอ้างอิงตรงทั้งค่า · ชื่อใช้ trigram · ผลแบ่งกลุ่มและกรองตามสิทธิ์ · '
'ค่า contact คืนเป็น value_masked · เขียน CUSTOMER_SEARCH';
COMMENT ON FUNCTION api.link_customer_to_branch(uuid, uuid) IS
'ผูกลูกค้าที่ยังมองไม่เห็นเข้าสาขาของ visit (ข้อ 6.6 · ทางเดียว) · เกิน security.link_per_day แจ้ง LINK_LIMIT_EXCEEDED ให้ผู้จัดการสาขา';
COMMENT ON FUNCTION api.get_customer_360(uuid) IS
'ข้อมูลหน้า Customer 360 (ข้อ 6.8 · ตัวเลขสรุปข้อ 3.3) · เขียน CUSTOMER_VIEWED ในทรานแซกชันเดียวกัน · '
'เกิน security.customer_view_per_hour แจ้ง CUSTOMER_VIEW_LIMIT_EXCEEDED เท่านั้น (ไม่บล็อก)';
COMMENT ON FUNCTION api.reveal_contact(uuid, text) IS
'เปิดค่าเต็มของช่องทางติดต่อ (ข้อ 6.4) · ต้องมี customer.pii.reveal · เขียน CONTACT_REVEALED ก่อนคืนค่า · '
'เกิน security.reveal_per_hour คืนผลปฏิเสธโดยไม่ raise + แจ้ง REVEAL_LIMIT_EXCEEDED';
COMMENT ON FUNCTION api.reveal_address(uuid, text) IS 'เปิดที่อยู่เต็ม (ข้อ 6.4 · 19.1 ข้อ 5) · ใช้ตัวนับเดียวกับ reveal_contact';
COMMENT ON FUNCTION api.save_contact(jsonb) IS 'เพิ่ม/แก้ช่องทางติดต่อ (ข้อ 6.4) · ต้องมี customer.update บนลูกค้าและลูกค้าต้อง ACTIVE';
COMMENT ON FUNCTION api.save_address(jsonb) IS 'เพิ่ม/แก้ที่อยู่ (19.1 ข้อ 5) · value_masked = {อำเภอ} · {จังหวัด}';
COMMENT ON FUNCTION api.record_consent(jsonb) IS 'บันทึกความยินยอมแบบ append-only (ข้อ 10.2) · MARKETING GRANTED ต้องมีธงอายุใน evidence (19.4 ข้อ 3)';
COMMENT ON FUNCTION api.merge_customers(uuid, uuid, jsonb, text, uuid) IS
'รวมลูกค้า (ข้อ 6.7) · ต้องมี customer.merge 🔐 บนทั้งสองราย · ย้ายทุกตารางลูก · snapshot ปิดบัง PII · refresh lifecycle ท้ายงาน';
COMMENT ON FUNCTION api.decide_duplicate(uuid, text, text) IS 'ยืนยัน "คนละคน" (ข้อ 6.7) · ผู้ตัดสิน ≠ ผู้สร้างแถว';
COMMENT ON FUNCTION api.open_visit(jsonb) IS 'เปิดหรือแนบ visit + interaction ต้นทาง (ข้อ 3.3 · 19.3 ข้อ 1) · ไม่สร้าง lead อัตโนมัติ';
COMMENT ON FUNCTION api.close_visit(uuid, text, jsonb) IS
'ปิด visit พร้อม outcome (ข้อ 4.1 · 4.2) · NOT_INTERESTED ต้องมี lost_reason_code และปิด lead ของ visit นั้นเป็น LOST · '
'แก้ outcome ได้ภายในวันธุรกิจเดียวกัน · UNRECORDED ระบบตั้งเท่านั้น';
COMMENT ON FUNCTION api.acknowledge_unrecorded_visit(uuid) IS 'รับทราบ visit ที่ระบบปิดให้ (ตั้ง unrecorded_ack_by/_at · ข้อ 9.6)';
COMMENT ON FUNCTION api.convert_lead(uuid, jsonb) IS 'แปลง lead เป็นโอกาสขาย (ข้อ 4.3 · ทางเดียว) · ต้องมี lead.update และ opportunity.create บน lead';
COMMENT ON FUNCTION api.assign_owner(text, uuid, uuid, text, text, uuid) IS
'เปลี่ยนผู้รับผิดชอบ/ทีม/สาขา (ข้อ 9.4.2 · rls-spec ข้อ 8.3 · ทางเดียว) · บันทึก crm.ownership_changes และแจ้ง *_ASSIGNED';
COMMENT ON FUNCTION api.request_export(jsonb) IS
'ยื่นคำขอส่งออกข้อมูลลูกค้า (ข้อ 8.2 · PM ข้อ 7.1) · นับครั้ง/วันรวมที่ถูกปฏิเสธ · BRANCH_MANAGER อนุมัติทันที · เกินเพดานแถว = REJECTED';
COMMENT ON FUNCTION api.decide_export(uuid, boolean, text) IS 'อนุมัติ/ปฏิเสธคำขอส่งออก (PM ข้อ 7.2) · ผู้อนุมัติตาม export.limits[role].approver_role';
COMMENT ON FUNCTION api.record_export_download(uuid) IS 'บันทึกการดาวน์โหลดไฟล์ส่งออก (ข้อ 8.2) · ผู้ขอเท่านั้น · aal2 · < export.max_downloads · ภายใน export.link_ttl_hours';
COMMENT ON FUNCTION api.list_export_requests(jsonb) IS 'รายการคำขอส่งออกของตน + ที่ตนเป็นผู้อนุมัติ · ไม่คืน file_path';
COMMENT ON FUNCTION api.search_audit(jsonb) IS 'ค้น audit log ธุรกิจ (ข้อ 9.5) · ต้องมี audit.read · คืนค่าปิดบังตามที่เก็บ';
COMMENT ON FUNCTION api.get_entity_history(text, uuid) IS 'ประวัติการแก้ไขของรายการเดียว · ลูกค้าใช้ customer.update บนลูกค้ารายนั้นหรือ audit.read';
COMMENT ON FUNCTION api.search_security_log(jsonb) IS 'log เข้าสู่ระบบ + audit ของบทบาท/ผู้ใช้/ตั้งค่า (ข้อ 9.5) · ไม่คืน access_logs และรายการของลูกค้า';
COMMENT ON FUNCTION api.get_my_access() IS 'โปรไฟล์ บทบาท และสิทธิ์ของผู้เรียก (ข้อ 9.6) · คืนทุก assignment ที่ยังมีผลตามเวลาพร้อมธง requires_mfa และ aal ปัจจุบัน';
COMMENT ON FUNCTION api.can_assign_role(uuid, text, uuid) IS 'true/false ตาม PM ข้อ 6.1 (ไม่ raise) · Edge Function invite-staff เรียกด้วย JWT ของผู้เชิญ';
COMMENT ON FUNCTION api.assign_role(uuid, text, uuid, text) IS 'มอบบทบาท (ข้อ 7.2 · PM ข้อ 6.1) · EXECUTIVE/BUSINESS_ADMIN/SYSTEM_ADMIN ต้องใช้คำขอ';
COMMENT ON FUNCTION api.revoke_role(uuid, text) IS 'ถอนบทบาท (PM ข้อ 6.2) · ตั้ง valid_to revoked_by revoke_reason เท่านั้น';
COMMENT ON FUNCTION api.request_role_grant(uuid, text, text, text) IS 'ยื่นคำขอบทบาทสูงชนิด GRANT/REVOKE (ข้อ 7.2) · แจ้ง EXECUTIVE ทุกคนยกเว้นผู้รับ';
COMMENT ON FUNCTION api.decide_role_grant(uuid, boolean, text) IS 'อนุมัติ/ปฏิเสธคำขอบทบาทสูง (PM ข้อ 6.3) · ผู้ตัดสิน ≠ ผู้ยื่น ≠ ผู้รับ ≠ รหัสพนักงานเดียวกับผู้รับ';
COMMENT ON FUNCTION api.list_role_grant_requests(jsonb) IS 'คำขอบทบาทตามสิทธิ์ role.decide / role.request / user.read (rls-spec ข้อ 8.2)';
COMMENT ON FUNCTION api.activate_self() IS 'เปิดใช้งานบัญชีของตนเองหลังรับคำเชิญ (ข้อ 7.3 ข้อ 3)';
COMMENT ON FUNCTION api.list_staff(jsonb) IS 'รายชื่อผู้ใช้ตามขอบเขตของ user.read (G ทั้งองค์กร · B ตามสาขา · T ตามทีม · S บัญชีที่ไม่มีบทบาทธุรกิจ)';
COMMENT ON FUNCTION api.update_staff(uuid, jsonb) IS 'แก้โปรไฟล์ผู้ใช้ (PM ข้อ 6.5) · ผู้จัดการสาขาแก้อีเมลไม่ได้';
COMMENT ON FUNCTION api.disable_staff(uuid, text) IS
'ปิดใช้งานผู้ใช้ (ข้อ 7.3 ข้อ 4–5) · โอน opportunity ให้ผู้จัดการสาขา (staff_code น้อยสุด) · lead/task → owner ว่าง + LEAD_UNASSIGNED';
COMMENT ON FUNCTION api.save_team(jsonb) IS 'สร้าง/แก้ทีม (ข้อ 7.1) · ต้องมี team.manage ในสาขาของทีม';
COMMENT ON FUNCTION api.set_team_member(uuid, uuid, boolean, boolean) IS 'เพิ่ม/ถอด/ตั้งหัวหน้าสมาชิกทีม · สมาชิกต้องมี assignment ในสาขาของทีม';
COMMENT ON FUNCTION api.register_device(text, uuid, boolean) IS 'ลงทะเบียนอุปกรณ์ counter (ข้อ 9.2) · ต้องมี user.update scope BRANCH ของสาขานั้น';
COMMENT ON FUNCTION api.get_settings() IS 'ค่าตั้งที่ผู้เรียกมีสิทธิ์แก้ตาม editable_by (ข้อ 11.2)';
COMMENT ON FUNCTION api.update_setting(text, jsonb) IS 'แก้ค่าตั้ง (ข้อ 11.2) · ตรวจสิทธิ์ตาม app.settings.editable_by · เขียน SETTINGS_UPDATED';
COMMENT ON FUNCTION api.create_dsr(jsonb) IS 'รับคำขอเจ้าของข้อมูลที่หน้าร้าน (ข้อ 10.4) · เก็บช่องทางผู้ยื่นแบบปิดบัง';
COMMENT ON FUNCTION api.list_dsr(jsonb) IS 'รายการคำขอเจ้าของข้อมูล · dsr.manage เห็นทั้งหมด · ผู้รับคำขอเห็นของตน';
COMMENT ON FUNCTION api.update_dsr(uuid, text, jsonb) IS 'เปลี่ยนสถานะคำขอเจ้าของข้อมูล (ข้อ 10.4) · VERIFIED ตั้ง verified_by = ผู้เรียก + verification_method';
COMMENT ON FUNCTION api.build_dsr_package(uuid) IS 'แพ็กเกจข้อมูลของลูกค้ารายเดียวสำหรับ ACCESS/PORTABILITY (ข้อ 10.4 · ไม่ผ่านเพดาน export)';
COMMENT ON FUNCTION api.anonymize_customer(uuid, uuid) IS
'ทำข้อมูลนิรนาม (ข้อ 10.4) · ต้องมี customer.anonymize 🔐 · DSR VERIFIED ที่ verified_by ≠ ผู้เรียก · ข้ามเมื่อ legal_hold · ≤ dsr.anonymize_per_day';
COMMENT ON FUNCTION api.set_legal_hold(uuid, boolean, text) IS 'ตั้ง/ยกเลิก legal hold ของลูกค้า (ข้อ 10.3) · ต้องมี dsr.manage 🔐';
COMMENT ON FUNCTION api.list_integration_logs(jsonb) IS 'audit.integration_logs ตามสิทธิ์ integration.manage (ข้อ 9.6)';
COMMENT ON FUNCTION api.svc_build_export_dataset(uuid) IS 'Edge Function generate-export: ชุดข้อมูลของคำขอที่ APPROVED พร้อม whitelist คอลัมน์และลายน้ำ (ข้อ 8.2)';
COMMENT ON FUNCTION api.svc_mark_export_generated(uuid, text) IS 'Edge Function generate-export: APPROVED → GENERATED + file_path · แจ้ง EXPORT_READY';
COMMENT ON FUNCTION api.svc_prepare_invite(jsonb) IS 'Edge Function invite-staff: สร้าง staff_profiles (INVITED) + staff_invitations + assignment ก่อนออกลิงก์ (19.3 ข้อ 6)';
COMMENT ON FUNCTION api.svc_finalize_disable(jsonb) IS 'Edge Function disable-staff: ปิดคำเชิญที่ค้างและบันทึก STAFF_DISABLED หลัง ban ผู้ใช้';
COMMENT ON FUNCTION api.svc_record_login_event(jsonb) IS
'Edge Function: บันทึก audit.login_events (ข้อ 9.5) · ตัวระบุที่ผู้ใช้กรอกเก็บเป็น sha256 เท่านั้น · ไม่มีทางอื่นเขียนตารางนี้ได้เลย';
COMMENT ON FUNCTION api.svc_link_invited_user(jsonb) IS
'Edge Function invite-staff: ผูก auth.users ที่เพิ่งสร้าง เข้ากับโปรไฟล์ INVITED (อีเมลต้องตรงกัน · ผูกซ้ำไม่ได้) · ขาดขั้นนี้ api.activate_self() จะหาโปรไฟล์ไม่เจอ';
COMMENT ON FUNCTION api.svc_resolve_staff_code(text) IS 'Edge Function staff-code-login: ST-NNNN → user_id (ห้ามส่งอีเมลออก · ข้อ 9.2)';
COMMENT ON FUNCTION api.svc_reset_mfa_authorize(jsonb) IS 'Edge Function reset-mfa: ตรวจผู้กระทำตามข้อ 7.3 ข้อ 6 แล้วบันทึก MFA_RESET';
COMMENT ON FUNCTION api.svc_expired_export_files() IS 'Edge Function cron-export-cleanup: ไฟล์ของคำขอที่ EXPIRED และยังไม่ถูกลบ (อ่านอย่างเดียว)';
COMMENT ON FUNCTION app.rate_limit_hit(text, boolean) IS
'ตัวนับอัตราต่อผู้ใช้ (ข้อ 6.4 · 6.5 · 6.6 · 11.2) · เพดานอ่านจาก app.settings ด้วย key เดียวกับชื่อตัวนับ · คืน {allowed, hit_count, limit, blocked_until}';
COMMENT ON FUNCTION app.build_export_dataset(uuid) IS 'ชุดข้อมูลของคำขอส่งออก (ข้อ 8.2) · ตรวจซ้ำสถานะ ผู้ขอ ขอบเขตสาขา ตัวกรอง และ whitelist คอลัมน์';
COMMENT ON FUNCTION app.anonymize_customer(uuid, text) IS
'ทำข้อมูลนิรนามของลูกค้าและแถว MERGED ที่ชี้มาหา (ข้อ 10.4 · 19.4 ข้อ 2) · แทนคีย์ PII ใน audit_logs ด้วย app.audit_redaction';
COMMENT ON FUNCTION app.candidate_scores(uuid, text, text, text, text, text) IS 'คะแนนผู้สมัครซ้ำตามตารางข้อ 6.5 (ค้นทั้งองค์กร · เฉพาะลูกค้า ACTIVE)';
COMMENT ON FUNCTION app.emit_notification(uuid, text, text, uuid, text, text, integer, date) IS
'สร้างแถว crm.notifications แบบ dedupe (ข้อ 11.1) · ข้ามเมื่อ app.bulk = on หรือผู้รับไม่ ACTIVE';
COMMENT ON FUNCTION app.write_audit(text, text, text, text, uuid, jsonb, jsonb, text[], text) IS
'เขียน audit.audit_logs จาก RPC สำหรับตารางที่ไม่มี trigger audit.log_row_change (ข้อ 9.5)';
COMMENT ON FUNCTION app.write_access_log(text, uuid, uuid, uuid, uuid, text, text[], integer, jsonb) IS
'เขียน audit.access_logs (ข้อ 9.5) · เก็บ sha256 ของค่า normalized ไม่เก็บค่าจริง';
