-- =====================================================================================
-- supabase/tests/rls_01_catalog.sql — CI check ของสิทธิ์/RLS (ไม่ใช้ fixture · รันได้ทั้งมีและไม่มี seed)
-- แหล่งจริง: docs/04-security/rls-spec.md ข้อ 9 (CI-01 … CI-20)
-- CI-21 … CI-26 เป็นส่วนเพิ่มของ migration 0010 (ดูหมายเหตุท้ายไฟล์) ทุก assertion ต้องได้ผลว่าง/0
-- =====================================================================================

-- CI-01 RLS เปิดทุกตาราง core ref crm app
SELECT test.assert_eq((SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', '), '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('core', 'ref', 'crm', 'app') AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity), '', 'CI-01');
-- CI-02 view security_invoker
SELECT test.assert_eq((SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', '), '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v' AND n.nspname IN ('api','crm','core','ref','app','analytics','audit','restricted')
      AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)), '', 'CI-02');
-- CI-03 matview
SELECT test.assert_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'm' AND n.nspname IN ('api','crm','core','ref')), 0::bigint, 'CI-03');
-- CI-04 anon / PUBLIC
SELECT test.assert_eq((
    SELECT count(*) FROM (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        WHERE n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted') AND a.grantee IN (0, 'anon'::regrole)
        UNION ALL
        SELECT 1 FROM pg_attribute att JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(att.attacl) a
        WHERE n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted') AND a.grantee IN (0, 'anon'::regrole)
        UNION ALL
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted') AND a.grantee IN (0, 'anon'::regrole)
        UNION ALL
        SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted') AND has_schema_privilege('anon', n.oid, 'USAGE')
    ) x), 0::bigint, 'CI-04');
-- CI-05 DELETE/TRUNCATE/REFERENCES/TRIGGER ของ authenticated
SELECT test.assert_eq((SELECT coalesce(string_agg(n.nspname || '.' || c.relname || ':' || a.privilege_type, ', '), '')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE a.grantee = 'authenticated'::regrole AND n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted')
      AND a.privilege_type IN ('DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
      AND NOT (a.privilege_type = 'DELETE' AND n.nspname = 'crm' AND c.relname IN ('customer_tags','opportunity_items','quotation_items'))), '', 'CI-05');
-- CI-06 ตารางเขียนโดย trigger/RPC เท่านั้น
SELECT test.assert_eq((SELECT coalesce(string_agg(f.t || ':' || f.p, ', '), '') FROM (VALUES
    ('crm.customers','INSERT'), ('crm.visits','INSERT'),
    ('crm.customer_contacts','INSERT'), ('crm.customer_contacts','UPDATE'), ('crm.customer_addresses','INSERT'), ('crm.customer_addresses','UPDATE'),
    ('crm.customer_consents','INSERT'), ('crm.customer_consents','UPDATE'), ('crm.customer_branches','INSERT'), ('crm.customer_branches','UPDATE'),
    ('crm.lead_status_history','INSERT'), ('crm.lead_status_history','UPDATE'), ('crm.opportunity_stage_history','INSERT'), ('crm.opportunity_stage_history','UPDATE'),
    ('crm.ownership_changes','INSERT'), ('crm.ownership_changes','UPDATE'), ('crm.customer_merges','INSERT'), ('crm.customer_merges','UPDATE'),
    ('crm.duplicate_decisions','INSERT'), ('crm.duplicate_decisions','UPDATE'), ('crm.notifications','INSERT'),
    ('crm.data_subject_requests','INSERT'), ('crm.data_subject_requests','UPDATE'), ('crm.transaction_refs','UPDATE')) f (t, p)
    WHERE has_table_privilege('authenticated', f.t, f.p) OR has_any_column_privilege('authenticated', f.t, f.p)), '', 'CI-06a');
SELECT test.assert_eq((SELECT coalesce(string_agg(n.nspname || '.' || c.relname, ', '), '')
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('core','audit','app','analytics','restricted') AND c.relkind IN ('r','p','v')
      AND (has_any_column_privilege('authenticated', c.oid, 'INSERT') OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
           OR has_table_privilege('authenticated', c.oid, 'DELETE'))), '', 'CI-06b');
-- CI-07
SELECT test.assert_eq((SELECT count(*) FROM pg_namespace n WHERE n.nspname IN ('audit','analytics','restricted') AND has_schema_privilege('authenticated', n.oid, 'USAGE')), 0::bigint, 'CI-07');
-- CI-08 GRANT ระดับตารางและระดับคอลัมน์ของ authenticated ตรงกับข้อ 6.1 ทุกแถว (ไม่มีเกิน ไม่มีขาด)
SELECT test.assert_eq((
    WITH expected (t, p) AS (VALUES
    ('core.branches', 'SELECT'),
    ('core.business_units', 'SELECT'),
    ('core.departments', 'SELECT'),
    ('core.organizations', 'SELECT'),
    ('core.permissions', 'SELECT'),
    ('core.role_permissions', 'SELECT'),
    ('core.roles', 'SELECT'),
    ('core.teams', 'SELECT'),
    ('crm.campaigns', 'SELECT'),
    ('crm.customer_branches', 'SELECT'),
    ('crm.customer_consent_current', 'SELECT'),
    ('crm.customer_consents', 'SELECT'),
    ('crm.customer_merges', 'SELECT'),
    ('crm.customer_notes', 'SELECT'),
    ('crm.customer_tags', 'DELETE,SELECT'),
    ('crm.customers', 'SELECT'),
    ('crm.data_subject_requests', 'SELECT'),
    ('crm.duplicate_decisions', 'SELECT'),
    ('crm.interactions', 'SELECT'),
    ('crm.lead_status_history', 'SELECT'),
    ('crm.leads', 'SELECT'),
    ('crm.notifications', 'SELECT'),
    ('crm.opportunities', 'SELECT'),
    ('crm.opportunity_items', 'DELETE,SELECT'),
    ('crm.opportunity_stage_history', 'SELECT'),
    ('crm.ownership_changes', 'SELECT'),
    ('crm.quotation_items', 'DELETE,SELECT'),
    ('crm.quotations', 'SELECT'),
    ('crm.tags', 'SELECT'),
    ('crm.task_comments', 'SELECT'),
    ('crm.tasks', 'SELECT'),
    ('crm.transaction_refs', 'SELECT'),
    ('crm.visits', 'SELECT'),
    ('ref.channels', 'SELECT'),
    ('ref.consent_purposes', 'SELECT'),
    ('ref.duplicate_override_reasons', 'SELECT'),
    ('ref.export_reasons', 'SELECT'),
    ('ref.interaction_types', 'SELECT'),
    ('ref.interest_types', 'SELECT'),
    ('ref.lost_reasons', 'SELECT'),
    ('ref.ownership_change_reasons', 'SELECT'),
    ('ref.priorities', 'SELECT'),
    ('ref.product_types', 'SELECT'),
    ('ref.provinces', 'SELECT'),
    ('ref.source_systems', 'SELECT'),
    ('ref.sources', 'SELECT'),
    ('ref.task_types', 'SELECT'),
    ('ref.transaction_types', 'SELECT'),
    ('ref.visit_outcomes', 'SELECT')
    ), actual AS (
        SELECT n.nspname || '.' || c.relname AS t, string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS p
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE a.grantee = 'authenticated'::regrole AND n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted')
        GROUP BY 1)
    SELECT coalesce(string_agg(d, '; '), '') FROM (
        (SELECT 'extra ' || t || ':' || p AS d FROM actual EXCEPT SELECT 'extra ' || t || ':' || p FROM expected)
        UNION ALL
        (SELECT 'missing ' || t || ':' || p FROM expected EXCEPT SELECT 'missing ' || t || ':' || p FROM actual)) x
    ), '', 'CI-08a GRANT ระดับตาราง');
SELECT test.assert_eq((
    WITH expected (t, p, cols) AS (VALUES
    ('core.staff_profiles', 'SELECT', 'display_name,id,nickname,staff_code,status'),
    ('crm.campaigns', 'INSERT', 'channel_code,code,ends_on,is_active,name_th,starts_on'),
    ('crm.campaigns', 'UPDATE', 'channel_code,ends_on,is_active,name_th,starts_on'),
    ('crm.customer_addresses', 'SELECT', 'created_at,customer_id,district,id,is_active,is_primary,organization_id,province_code,updated_at,value_masked'),
    ('crm.customer_contacts', 'SELECT', 'contact_type,created_at,customer_id,id,is_active,is_primary,is_valid,organization_id,updated_at,value_masked,verified_at'),
    ('crm.customer_notes', 'INSERT', 'body,branch_id,customer_id,interaction_id,is_pinned'),
    ('crm.customer_notes', 'UPDATE', 'body,is_pinned'),
    ('crm.customer_tags', 'INSERT', 'customer_id,tag_id'),
    ('crm.customers', 'UPDATE', 'customer_type,first_name,last_name,nickname,province_code'),
    ('crm.interactions', 'INSERT', 'branch_id,channel_code,customer_id,direction,interaction_type_code,lead_id,occurred_at,opportunity_id,owner_staff_id,summary,visit_id'),
    ('crm.interactions', 'UPDATE', 'customer_id,interaction_type_code,occurred_at,summary'),
    ('crm.leads', 'INSERT', 'branch_id,campaign_id,channel_code,customer_id,interest_code,interest_level,next_action,next_action_at,next_action_type_code,owner_staff_id,priority_code,product_model,product_type_code,source_code,visit_id'),
    ('crm.leads', 'UPDATE', 'campaign_id,closed_at,interest_code,interest_level,lost_note,lost_reason_code,next_action,next_action_at,next_action_type_code,priority_code,product_model,product_type_code,source_code,status'),
    ('crm.notifications', 'UPDATE', 'read_at'),
    ('crm.opportunities', 'INSERT', 'branch_id,customer_id,interest_code,next_action,next_action_at,next_action_type_code,origin_channel_code,origin_visit_id,owner_staff_id,priority_code'),
    ('crm.opportunities', 'UPDATE', 'closed_at,interest_code,lost_note,lost_reason_code,next_action,next_action_at,next_action_type_code,priority_code,stage,won_amount,won_at'),
    ('crm.opportunity_items', 'INSERT', 'interest_level,opportunity_id,product_model,product_type_code,quantity,unit_price,variant'),
    ('crm.opportunity_items', 'UPDATE', 'interest_level,product_model,product_type_code,quantity,unit_price,variant'),
    ('crm.quotation_items', 'INSERT', 'discount_amount,product_model,product_type_code,quantity,quotation_id,unit_price,variant'),
    ('crm.quotation_items', 'UPDATE', 'discount_amount,product_model,product_type_code,quantity,unit_price,variant'),
    ('crm.quotations', 'INSERT', 'installment_months,opportunity_id,terms_note,total_amount'),
    ('crm.quotations', 'UPDATE', 'installment_months,sent_channel_code,status,terms_note,total_amount'),
    ('crm.tags', 'INSERT', 'code,is_active,label_th'),
    ('crm.tags', 'UPDATE', 'is_active,label_th'),
    ('crm.task_comments', 'INSERT', 'body,task_id'),
    ('crm.task_comments', 'UPDATE', 'body'),
    ('crm.tasks', 'INSERT', 'branch_id,customer_id,description,due_at,lead_id,opportunity_id,owner_staff_id,priority_code,remind_at,task_type_code,title'),
    ('crm.tasks', 'UPDATE', 'description,due_at,priority_code,remind_at,status,task_type_code,title'),
    ('crm.transaction_refs', 'INSERT', 'amount,branch_id,customer_id,device_imei,device_serial,external_no,opportunity_id,source_system_code,summary,transacted_at,transaction_type_code'),
    ('crm.visits', 'UPDATE', 'cancel_reason,customer_id,interest_code,owner_staff_id,party_size,source_code,status'),
    ('ref.channels', 'INSERT', 'channel_group,chart_token,code,is_active,is_live,label_en,label_th,sort_order'),
    ('ref.channels', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.consent_purposes', 'INSERT', 'code,controller_entity,is_active,label_en,label_th,sort_order'),
    ('ref.consent_purposes', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.duplicate_override_reasons', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.duplicate_override_reasons', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.export_reasons', 'INSERT', 'code,is_active,is_marketing,label_en,label_th,sort_order'),
    ('ref.export_reasons', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.interaction_types', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.interaction_types', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.interest_types', 'INSERT', 'code,creates_lead,is_active,label_en,label_th,sort_order'),
    ('ref.interest_types', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.lost_reasons', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.lost_reasons', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.ownership_change_reasons', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.ownership_change_reasons', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.priorities', 'INSERT', 'code,color_token,is_active,label_en,label_th,sort_order'),
    ('ref.priorities', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.product_types', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.product_types', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.provinces', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.provinces', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.source_systems', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.source_systems', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.sources', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.sources', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.task_types', 'INSERT', 'code,is_active,label_en,label_th,sort_order'),
    ('ref.task_types', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.transaction_types', 'INSERT', 'code,counts_as_purchase,is_active,label_en,label_th,purchase_tab_group,sort_order'),
    ('ref.transaction_types', 'UPDATE', 'is_active,label_en,label_th,sort_order'),
    ('ref.visit_outcomes', 'INSERT', 'code,counts_as_recorded,is_active,label_en,label_th,sort_order'),
    ('ref.visit_outcomes', 'UPDATE', 'is_active,label_en,label_th,sort_order')
    ), actual AS (
        SELECT n.nspname || '.' || c.relname AS t, x.privilege_type AS p, string_agg(att.attname::text, ',' ORDER BY att.attname) AS cols
        FROM pg_attribute att JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(att.attacl) x
        WHERE x.grantee = 'authenticated'::regrole AND n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted')
        GROUP BY 1, 2)
    SELECT coalesce(string_agg(d, '; '), '') FROM (
        (SELECT 'extra ' || t || ':' || p || '(' || cols || ')' AS d FROM actual EXCEPT SELECT 'extra ' || t || ':' || p || '(' || cols || ')' FROM expected)
        UNION ALL
        (SELECT 'missing ' || t || ':' || p || '(' || cols || ')' FROM expected EXCEPT SELECT 'missing ' || t || ':' || p || '(' || cols || ')' FROM actual)) x
    ), '', 'CI-08b GRANT ระดับคอลัมน์');
-- CI-09 / CI-10 policy expressions
SELECT test.assert_eq((SELECT coalesce(string_agg(policyname, ', '), '') FROM (
        SELECT policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS e FROM pg_policies WHERE schemaname IN ('core','ref','crm')) p
    WHERE e ~ 'app\.(can_access_record|can_access_customer|staff_has_branch_assignment|effective_assignments|effective_grants|clock|transition_denied)\('
       OR regexp_count(e, 'app\.[a-z_]+\(') <> regexp_count(e, 'app\.[a-z_]+\((\s*''[^'']*''::[a-z_.]+\s*,?)*\s*\)')
       OR regexp_count(e, 'app\.[a-z_]+\(') <> regexp_count(e, '(SELECT\s+(unnest\()?app\.[a-z_]+\(|FROM\s+app\.[a-z_]+\()')), '', 'CI-09/CI-10');
-- CI-11 policy ไม่อ้างตารางตัวเอง
SELECT test.assert_eq((SELECT coalesce(string_agg(policyname, ', '), '') FROM pg_policies
    WHERE schemaname IN ('core','ref','crm') AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ ('(FROM|JOIN)\s+' || schemaname || '\.' || tablename || '\M')), '', 'CI-11');
-- CI-12 helper
SELECT test.assert_eq((SELECT coalesce(string_agg(e.fn, ', '), '') FROM (VALUES ('current_staff_id'),('is_aal2'),('clock'),('current_organization_id'),('has_permission'),
        ('scope_branch_ids'),('team_scope_pairs'),('team_member_staff_ids'),('customer_ids_in_scope'),('readable_customer_ids'),
        ('can_access_record'),('can_access_customer'),('staff_has_branch_assignment')) e(fn)
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace AND p.proname = e.fn AND p.prosecdef AND p.provolatile = 's'
                      AND p.proconfig @> ARRAY['search_path=""'] AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))), '', 'CI-12a');
SELECT test.assert_eq((SELECT coalesce(string_agg(p.proname, ', '), '') FROM pg_proc p
    WHERE p.pronamespace = 'app'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('current_staff_id','is_aal2','clock','current_organization_id','has_permission','scope_branch_ids','team_scope_pairs',
                            'team_member_staff_ids','customer_ids_in_scope','readable_customer_ids','can_access_record','can_access_customer',
                            'staff_has_branch_assignment','bangkok_date','transition_denied')), '', 'CI-12b');
-- CI-13 owner เดียวกับ schema crm
SELECT test.assert_eq((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('api','app','crm','core','ref','analytics','audit','restricted') AND c.relkind IN ('r','v','m','S','p')
      AND c.relowner <> (SELECT nspowner FROM pg_namespace WHERE nspname = 'crm')), 0::bigint, 'CI-13');
-- CI-14 ทุก grant มี policy
SELECT test.assert_eq((SELECT coalesce(string_agg(g.nspname || '.' || g.relname || ':' || g.priv, ', '), '') FROM (
        SELECT n.nspname, c.relname, v.priv FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) v(priv)
        WHERE n.nspname IN ('crm','core','ref') AND c.relkind IN ('r','p')
          AND (has_table_privilege('authenticated', c.oid, v.priv) OR (v.priv <> 'DELETE' AND has_any_column_privilege('authenticated', c.oid, v.priv)))) g
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = g.nspname AND pp.tablename = g.relname
                        AND pp.cmd IN (g.priv, 'ALL') AND 'authenticated' = ANY (pp.roles))), '', 'CI-14');
-- CI-15 enforce trigger
SELECT test.assert_eq((SELECT coalesce(string_agg(e.t, ', '), '') FROM (VALUES ('customers'),('visits'),('interactions'),('leads'),('opportunities'),('quotations'),('tasks')) e(t)
    WHERE NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = ('crm.' || e.t)::regclass AND tg.tgname = 'trg_10_enforce_transition'
                      AND tg.tgfoid = 'app.enforce_row_transition()'::regprocedure AND (tg.tgtype & 2) = 2 AND (tg.tgtype & 1) = 1
                      AND (tg.tgtype & 4) = 4 AND (tg.tgtype & 16) = 16)), '', 'CI-15');
-- CI-16 ชื่อ/ลำดับ BEFORE trigger
SELECT test.assert_eq((SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_assign_running_number','trg_guard_restricted_text','trg_row_defaults')), 0::bigint, 'CI-16a ชื่อเดิมไม่เหลือ');
SELECT test.assert_eq((SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_05_running_number'), 11::bigint, 'CI-16b trg_05 11 ตาราง');
SELECT test.assert_eq((SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_20_guard_text'), 7::bigint, 'CI-16c trg_20 7 ตาราง');
SELECT test.assert_eq((SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_30_row_defaults'), 4::bigint, 'CI-16d trg_30 4 ตาราง');
SELECT test.assert_eq((SELECT coalesce(string_agg(c.oid::regclass::text, ', '), '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('crm','core','audit') AND c.relkind = 'r'
      AND (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = c.oid AND NOT a.attisdropped AND a.attname IN ('organization_id','created_by','updated_by')) = 3
      AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = c.oid AND tg.tgname = 'trg_90_stamp_row')), '', 'CI-16e trg_90 ครบ');
-- CI-20 ฟังก์ชันใน CHECK/generated ของตารางที่ authenticated เขียน
SELECT test.assert_true(has_function_privilege('authenticated', 'app.bangkok_date(timestamptz)', 'EXECUTE'), 'CI-20');
-- CI-17 SYSTEM_ADMIN ไม่มีสิทธิ์ข้อมูลลูกค้า · บทบาทองค์กรมีเฉพาะ G/S · บทบาทสาขาไม่มี G/S
SELECT test.assert_eq((SELECT count(*) FROM core.role_permissions rp JOIN core.roles r ON r.code = rp.role_code
    WHERE (rp.role_code = 'SYSTEM_ADMIN' AND rp.permission_code ~ '^(customer|note|visit|interaction|lead|opportunity|quotation|task|transaction)\.')
       OR (NOT r.is_branch_role AND rp.scope NOT IN ('ORGANIZATION', 'SYSTEM'))
       OR (r.is_branch_role AND rp.scope IN ('ORGANIZATION', 'SYSTEM'))), 0::bigint, 'CI-17');
-- CI-18 ฟังก์ชันใน api: svc_* เฉพาะ service_role · ตัวอื่นเฉพาะ authenticated · ทุกตัว DEFINER + search_path ''
SELECT test.assert_eq((SELECT coalesce(string_agg(p.proname, ', '), '') FROM pg_proc p WHERE p.pronamespace = 'api'::regnamespace
    AND NOT (p.prosecdef AND coalesce(p.proconfig @> ARRAY['search_path=""'], false)
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
             AND CASE WHEN p.proname LIKE 'svc\_%' THEN has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE') END)), '', 'CI-18');
-- CI-19 bucket exports ไม่มี storage policy (ตรวจเมื่อมี schema storage · บน Supabase)
SELECT test.assert_eq((SELECT CASE WHEN to_regclass('storage.objects') IS NULL THEN 0::bigint
    ELSE (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
          AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%exports%') END), 0::bigint, 'CI-19');

-- =====================================================================================
-- CI-21 … CI-26 (ส่วนเพิ่มของ 0010 · หมายเหตุผู้เขียน) — invariant ที่ CANONICAL บังคับแต่ CI-01–CI-20 ยังไม่ครอบ
-- =====================================================================================

-- CI-21 ทุกฟังก์ชัน SECURITY DEFINER ใน schema ของโครงการต้อง SET search_path = '' และ anon/PUBLIC เรียกไม่ได้ (ข้อ 9.6 · 19.1 ข้อ 2)
SELECT test.assert_eq((SELECT coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('api', 'app', 'crm', 'core', 'ref', 'analytics', 'audit', 'restricted')
      AND p.prosecdef
      AND (NOT coalesce(p.proconfig @> ARRAY['search_path=""'], false)
           OR has_function_privilege('anon', p.oid, 'EXECUTE')
           OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0))),
    '', 'CI-21 DEFINER ทุกตัวมี search_path = '''' และ anon/PUBLIC เรียกไม่ได้');

-- CI-22 trigger ของตารางที่ authenticated เขียนได้ ต้องเป็น SECURITY DEFINER (เขียนตารางอื่นใต้ RLS ของผู้ใช้ไม่ได้)
--       ยกเว้นสามตัวที่ต้องเป็น INVOKER โดยเจตนา: enforce_row_transition · trg_stamp_row (อ่าน current_user) · touch_updated_at (แตะ NEW เท่านั้น)
SELECT test.assert_eq((SELECT coalesce(string_agg(DISTINCT p.pronamespace::regnamespace || '.' || p.proname, ', '), '')
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname IN ('crm', 'core', 'ref', 'audit', 'app')
      AND (has_any_column_privilege('authenticated', c.oid, 'INSERT')
           OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
           OR has_table_privilege('authenticated', c.oid, 'DELETE'))
      AND NOT p.prosecdef
      AND p.proname NOT IN ('enforce_row_transition', 'trg_stamp_row', 'touch_updated_at')),
    '', 'CI-22 trigger ของตารางที่ผู้ใช้เขียน เป็น DEFINER ยกเว้นรายการที่อนุญาต');

-- CI-23 policy ของสองตารางอ้างถึงกันไปกลับไม่ได้ (ข้อ 9.4 ข้อ 3 "ตารางที่อ้าง X กลับ") — CI-11 ตรวจเฉพาะการอ้างตัวเอง
SELECT test.assert_eq((
    WITH pol AS (
        SELECT schemaname AS s, tablename AS t, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS e
        FROM pg_policies WHERE schemaname IN ('crm', 'core', 'ref')),
    tbl AS (
        SELECT n.nspname AS s, c.relname AS t
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('crm', 'core', 'ref') AND c.relkind IN ('r', 'p', 'v')),
    edge AS (
        SELECT DISTINCT p.s AS fs, p.t AS ft, b.s AS ts, b.t AS tt
        FROM pol p JOIN tbl b ON p.e ~ ('(FROM|JOIN)\s+' || b.s || '\.' || b.t || '\M'))
    SELECT coalesce(string_agg(DISTINCT a.fs || '.' || a.ft || ' ↔ ' || a.ts || '.' || a.tt, ', '), '')
    FROM edge a JOIN edge b ON b.fs = a.ts AND b.ft = a.tt AND b.ts = a.fs AND b.tt = a.ft),
    '', 'CI-23 ไม่มี policy ที่อ้างตารางกันไปกลับ');

-- CI-24 service_role ได้เฉพาะ USAGE ของ api crm core ref (ข้อ 1.1 · 9.8 — Edge Function เรียกผ่าน api.svc_* เท่านั้น)
SELECT test.assert_eq((SELECT coalesce(string_agg(x.d, ', '), '') FROM (
        SELECT n.nspname || '.' || c.relname AS d
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('api', 'app', 'crm', 'core', 'ref', 'analytics', 'audit', 'restricted') AND c.relkind IN ('r', 'p', 'v')
          AND (has_table_privilege('service_role', c.oid, 'SELECT') OR has_any_column_privilege('service_role', c.oid, 'SELECT')
               OR has_any_column_privilege('service_role', c.oid, 'INSERT') OR has_any_column_privilege('service_role', c.oid, 'UPDATE')
               OR has_table_privilege('service_role', c.oid, 'DELETE'))
        UNION ALL
        SELECT 'USAGE:' || n.nspname FROM pg_namespace n
        WHERE n.nspname IN ('app', 'analytics', 'audit', 'restricted') AND has_schema_privilege('service_role', n.oid, 'USAGE')) x),
    '', 'CI-24 service_role ไม่มีสิทธิ์ตารางและไม่มี USAGE ของ app/analytics/audit/restricted');
SELECT test.assert_true((SELECT bool_and(has_schema_privilege('service_role', n.oid, 'USAGE')) FROM pg_namespace n
    WHERE n.nspname IN ('api', 'crm', 'core', 'ref')), 'CI-24 service_role มี USAGE ของ api crm core ref');

-- CI-25 ทุก policy ของโครงการผูกกับ role authenticated เท่านั้น (ห้าม PUBLIC/anon · ข้อ 1.1)
SELECT test.assert_eq((SELECT coalesce(string_agg(schemaname || '.' || tablename || ':' || policyname, ', '), '')
    FROM pg_policies WHERE schemaname IN ('crm', 'core', 'ref', 'app', 'api', 'analytics', 'audit', 'restricted')
      AND roles <> '{authenticated}'::name[]), '', 'CI-25 policy ทุกข้อเป็น TO authenticated');

-- CI-26 trigger ที่ต้องเห็น current_user ของผู้ใช้จริงต้องเป็น SECURITY INVOKER (ข้อ 9.4.2 · 19.2 ข้อ 1)
--       ถ้าเผลอทำเป็น DEFINER จะได้ current_user = owner แล้วข้ามการตรวจทั้งหมดเงียบ ๆ
SELECT test.assert_eq((SELECT coalesce(string_agg(p.proname, ', '), '') FROM pg_proc p
    WHERE p.oid IN ('app.enforce_row_transition()'::regprocedure, 'app.trg_stamp_row()'::regprocedure) AND p.prosecdef),
    '', 'CI-26 enforce_row_transition และ trg_stamp_row เป็น SECURITY INVOKER');
