# Test Case · UAT Checklist — JAUN CRM · Customer 360

> **ฉบับ Phase 0 · 21 ก.ย. 2569** · ครอบคลุมเอกสารชุดที่ **17 Test Case** และ **18 UAT Checklist** ของ A45
> ค่าทุกค่าอ้างอิง `docs/00-brief/CANONICAL.md` **v2.2** (อ้างเป็น "CANONICAL ข้อ …") · ถ้าเอกสารนี้ขัดกับ CANONICAL **CANONICAL ชนะ**
> เวิร์กโฟลว์อ้าง `docs/01-requirement/user-flows.md` (F01–F15) · สิทธิ์อ้าง `docs/04-security/rls-spec.md` และ `permission-matrix.md` · KPI อ้าง `docs/05-analytics/kpi-definitions.md` · การแจ้งเตือนอ้าง `docs/05-analytics/notification-rules.md` · ชั้นการทดสอบอ้าง `docs/02-architecture/system-architecture.md` §12
> ชื่อ object ในฐานข้อมูลยึด `supabase/migrations/0001–0014`
> ค่าที่ CANONICAL ไม่มีเขียนว่า **"รอยืนยัน"** · ข้อตีความของผู้เขียนติดป้าย **"หมายเหตุผู้เขียน Uxx"** และสรุปไว้ใน §7
> **การอ้างหัวข้อภายในเอกสารนี้ใช้ § · "ข้อ N" ที่ไม่มีชื่อเอกสารกำกับหมายถึง CANONICAL**
> เอกสารคู่กัน: `docs/08-delivery/roadmap.md` (§1.4 AC1–AC12 · §6.3 เกณฑ์ pilot) · `deployment-backup-recovery.md` (§3 CI/CD · §11 Go-live) · `data-migration-plan.md`

---

## 0. วิธีอ่านเอกสารนี้

### 0.1 ประเภทข้อความ

| ประเภท | ความหมาย |
|---|---|
| ตัวเลข · รหัส · ป้ายไทย · ชื่อหน้าจอ | มาจาก CANONICAL เท่านั้น (ข้อ 4 · 5 · 13 · 14.1) |
| **[รอยืนยัน]** | ค่าที่ CANONICAL ติดป้ายรอยืนยัน หรือเอกสารนี้ต้องใช้แต่ CANONICAL ไม่มี (ชื่อบุคคลจริง · วันที่ · จำนวนวัน UAT) |
| **หมายเหตุผู้เขียน Uxx** | จุดที่ CANONICAL ไม่ครอบคลุม ผู้เขียนเลือกการตีความที่สอดคล้องกับส่วนอื่นมากที่สุด · รวมใน §7 |
| `รหัสตัวพิมพ์เล็ก/ใหญ่` | ชื่อ object · permission · รหัสสถานะ ตามที่สะกดในฐานข้อมูล |

### 0.2 รหัสที่ใช้ในเอกสารนี้

| รหัส | ความหมาย |
|---|---|
| `T1` … `T10` | ชั้นการทดสอบ (system-architecture §12.1 · §1.2 ของเอกสารนี้) |
| `TC-F01-1` … | Test case ที่เขียนเป็นข้อความ · ส่วน `F01`–`F15` = flow ใน `user-flows.md` (§3.1–§3.15) |
| `TC-NEG-n` | กรณีปฏิเสธ/ตรวจสิทธิ์รายบุคคล ตามตารางข้อ 13.13 (§3.16) |
| `TC-DQ-n` | กรณีคุณภาพข้อมูล ตามข้อ 12.3 (§3.17) |
| `TC-PDPA-n` | กรณี PDPA ตามข้อ 10 (§3.18) |
| `AC1` … `AC12` | คำถาม Acceptance ของ V1 (A44 · B27) ตามรหัสใน `roadmap.md` §1.4 |
| `U1` … `U12` | หมายเหตุผู้เขียนของเอกสารนี้ (§7) |
| **ST · SV · BM · OP · MK · EX · BA · SA** | บทบาทย่อ (ข้อ 8.1) · 🔐 = ต้อง aal2 |

### 0.3 รูปแบบของ test case

ทุกแถวในตาราง §3 มีคอลัมน์เดียวกัน:

| คอลัมน์ | ความหมาย |
|---|---|
| ID | รหัสอ้างอิงถาวร · ใช้ในทะเบียนข้อบกพร่องและใบ sign-off |
| เงื่อนไขก่อนเริ่ม | สถานะข้อมูลและบัญชีที่ต้องมีก่อนเริ่ม (อ้าง seed ข้อ 13 เมื่อทำได้) |
| ขั้นตอน | สิ่งที่ผู้ทดสอบกด/เรียก เรียงเป็น 1) 2) 3) |
| ผลที่คาด | สิ่งที่ต้องเห็นบนหน้าจอ **และ** สิ่งที่ต้องเกิดในฐานข้อมูล (แถว · สถานะ · audit · แจ้งเตือน) |
| CANONICAL · สิทธิ์ | ข้อของ CANONICAL ที่เป็นแหล่งจริง และ permission + scope ที่ต้องมี |
| อัตโนมัติ | ไฟล์ทดสอบที่ครอบกรณีนี้แล้ว (§2.2) · `—` = ยังไม่มี test อัตโนมัติ ต้องทำที่ T7/T8/T10 |

> **หลักสำคัญ:** "ผลที่คาด" ที่เป็นการปฏิเสธต้องเกิดจาก **ฐานข้อมูล** ไม่ใช่การซ่อนปุ่ม — ผู้ทดสอบที่ตรวจข้อปฏิเสธต้องเรียก RPC/PostgREST ตรงด้วย JWT ของตนด้วย (ข้อ 9.1) · การซ่อนปุ่มเป็นความสะดวกเท่านั้น

---

## 1. กลยุทธ์การทดสอบ

### 1.1 หลักการ (ตรึงจาก CANONICAL)

| # | หลักการ | ที่มา |
|---|---|---|
| 1 | **ทุกการตรวจสิทธิ์อยู่ในฐานข้อมูล** — ผู้ใช้เรียก PostgREST/RPC ตรงด้วย JWT ของตนได้ ดังนั้นทุกกรณีปฏิเสธต้องทดสอบที่ชั้นฐานข้อมูล ไม่ใช่ที่ UI | ข้อ 9.1 |
| 2 | **ตัวเลขทุกตัวต้องคำนวณจากแถวจริง** ผ่าน `api.get_kpis` / `api.get_report` ห้าม assert ยอดที่เก็บสำเร็จรูป | ข้อ 13.0 กติกา 2 |
| 3 | **`acceptance.sql` ต้อง assert ทุกตัวเลขที่พิมพ์ในข้อ 13** (ข้อมูลเติมไม่ assert) | ข้อ 13.0 กติกา 9 |
| 4 | **ต้องเรียก `test.login_as` ก่อนทุก assertion เรื่องสิทธิ์** เพราะผู้ใช้เริ่มต้นของ PGlite เป็น superuser ที่ข้าม RLS · ทุกไฟล์ที่ทดสอบสิทธิ์ยืนยัน `current_setting('is_superuser') = 'off'` | ข้อ 13.13 · architecture §12.2 |
| 5 | **ไฟล์ที่ใช้ fixture ของตัวเองต้องเป็นอิสระจาก seed** — องค์กร `TEST-*` · อีเมล `@test.example.com` · `staff_code` `ST-9xxx` · ผ่านทั้งแบบมีและไม่มี `--seed` | §2.3 |
| 6 | **migration ต้องใช้ได้บน Supabase จริงด้วย** — ชื่อ schema-qualified · DEFINER + `SET search_path = ''` + GRANT EXECUTE รายฟังก์ชัน (default privileges ถอน EXECUTE ของ PUBLIC) → มี CI check ใน `rls_01_catalog.sql` | ข้อ 19.1 ข้อ 2 |
| 7 | **เวลาในการทดสอบ** ใช้ `app.clock()` ของ seed (11 ก.ย. 2569 10:24 น.) สำหรับ KPI · แจ้งเตือน · งานตามเวลา · กลุ่ม "วันนี้" · ใช้ `now()` สำหรับการตัดสินสิทธิ์และกรอบเวลาแก้ไข | ข้อ 1.2 |
| 8 | **ไฟล์ทดสอบถูกครอบ `BEGIN … ROLLBACK`** โดย `tools/db/run.mjs` · ห้ามมีคำสั่งควบคุมทรานแซกชันในไฟล์ · ผ่าน = ไม่มี exception | architecture §12.2 |

### 1.2 ชั้นการทดสอบ T1–T10

| ชั้น | เครื่องมือ | ครอบคลุม | รันเมื่อ | สถานะ Phase 0 |
|---|---|---|---|---|
| **T1** migration + seed | `node tools/db/run.mjs --seed` | migration 0001–0013 รันครบตามลำดับ (ข้าม `0014_schedule_cron.sql`) · `seed.sql` deterministic โหลดได้ | ทุก commit | ✓ ผ่าน |
| **T2** RLS persona | `supabase/tests/rls_*.sql` (10 ไฟล์) | ตารางข้อ 13.13 ครบทุกช่อง · mapping คอลัมน์→สิทธิ์ของ `rls-spec.md` ทุกแถว · CI check สิทธิ์/RLS | ทุก commit | ✓ 427 assertion (`rls_02`…`rls_09` · `rls_personas`) |
| **T3** acceptance | `supabase/tests/acceptance.sql` | ทุกตัวเลขที่พิมพ์ในข้อ 13.1–13.12 · 13.14 · 14.7 + คำถาม Acceptance 11 ข้อ | ทุก commit | ✓ 1,037 assertion |
| **T4** invariant / lint ของ schema | `01_schema_stage1.sql` · `02_schema_stage2.sql` · `rls_01_catalog.sql` | ENUM · CHECK · generated column · เลขอ้างอิง · invariant `first_seen_at` · `NEW + RETURNING = UNIQUE` · view `security_invoker` · DEFINER มี `search_path` · `anon` ไม่มี GRANT · ลำดับชื่อ BEFORE trigger | ทุก commit | ✓ 450 assertion (`01` · `02` · `rls_01`) |
| **T5** prototype / CANONICAL | `node tools/check-prototype.mjs` · `check:canonical` | prototype 19 หน้า + assets ใช้ค่าตรง CANONICAL (11 หมวด) | ทุก commit (Phase 0) | ✓ prototype ผ่าน · `tools/check-canonical.mjs` **ยังไม่มีไฟล์** (U1) |
| **T6** unit ฝั่งแอป | test runner ของ Next.js **[รอยืนยัน]** | `lib/format/*` (ปัด half away from zero · `–` เมื่อช่วงก่อนหน้าเป็น 0) · error mapping · ป้ายไทย | ทุก commit (Phase 1+) | ยังไม่เริ่ม (ไม่มีแอป) |
| **T7** HTTP-level บน staging | สคริปต์เรียก PostgREST / Edge Functions ด้วย JWT ของบัญชีข้อ 13.5 | สิ่งที่ PGlite จำลองไม่ได้ (§1.3) | ทุก deploy staging | ยังไม่เริ่ม |
| **T8** end-to-end | เบราว์เซอร์อัตโนมัติบน staging + seed **[รอยืนยันเครื่องมือ]** | flow หลักต่อบทบาทตัวแทนข้อ 14.1 · service worker · logout ล้าง storage | ก่อน release | ยังไม่เริ่ม |
| **T9** ประสิทธิภาพ | seed 10× บน staging (deterministic · แยกจาก seed หลัก) | เวลาตอบของ `api.get_kpis` · `api.search_customers` · หน้ารายการ | ก่อน Phase 3 | ยังไม่เริ่ม |
| **T10** UAT | **เอกสารนี้** §3 (ฝั่งที่ทำด้วยมือ) + §4 | คำถาม Acceptance A44 · B27 กับผู้ใช้จริง | ก่อน pilot และก่อน rollout | เอกสารพร้อม |

> **assertion ที่เหลือ 556 รายการ** กระจายอยู่ในชั้น T1/T4 ตามลักษณะงาน: พฤติกรรมของ RPC (`api_01` 84 · `api_02` 49 · `api_03` 135 = **268**) · KPI และรายงาน (`analytics_01` 163 · `analytics_02` 52 = **215**) · งานตามเวลา (`jobs_01` **73**) — รวมทุกชั้น **2,470 assertion** (§2.2 · §2.4)

### 1.3 สิ่งที่ PGlite จำลองไม่ได้ → ต้องชดเชยที่ T7/T8

| ข้อจำกัดของ PGlite 0.4.1 | ชดเชยด้วย | test case ที่เกี่ยวข้อง |
|---|---|---|
| ไม่มี PostgREST | T7 ตรวจ column grant ผ่าน HTTP · `max_rows = 200` **[รอยืนยัน]** · exposed schemas = `api, crm, core, ref` · `rpc/svc_*` ด้วย JWT ผู้ใช้ต้องถูกปฏิเสธ | TC-NEG-14 · TC-NEG-15 |
| ไม่มี GoTrue / Auth hooks จริง | T7 ตรวจ Before User Created hook · Password Verification Attempt hook (Team plan) · Custom Access Token Hook (โดเมน SSO) · อายุลิงก์อีเมล 3600 วินาที | TC-F08-2 · TC-F13-3 · TC-F13-6 |
| ไม่มี MFA จริง (มีแต่ `auth.mfa_factors` จำลอง) | T7/T8 ตรวจ enroll/challenge/verify ผ่าน Server Action (เซสชันเป็น HttpOnly cookie · ข้อ 19.4 ข้อ 4) | TC-F08-4 · TC-F13-4 |
| ไม่มี `pg_cron` / `pg_net` | T7 ตรวจว่ามี job ครบ 5 ตัวตามข้อ 9.6 และรันในฐานะ `postgres` · PGlite ทดสอบตรรกะของ `app.job_*` โดยเรียกตรงพร้อม `p_as_of` | TC-F15-1 … TC-F15-5 |
| ไม่มี Storage | T7 ตรวจ bucket `exports` private · ไม่มี storage policy ให้ `authenticated` · signed URL อายุ 60 วินาที · ไฟล์ถูกลบเมื่อครบ 24 ชม. | TC-F11-4 · TC-F11-5 |
| ไม่มี `request.headers` | คอลัมน์ `ip` `user_agent` `device_id` `request_id` ของ audit เป็น NULL ใน T2–T4 · T7 ตรวจว่า Next.js ส่ง `x-client-ip` `x-client-ua` `x-device-id` `x-request-id` ต่อจริง | TC-PDPA-8 |
| ไม่มี Edge Functions | T7 ตรวจข้อ 9.8 ทุกข้อ: verify JWT · ตรวจสิทธิ์ด้วย JWT ผู้เรียกก่อนใช้ service_role · ไม่รับ actor จาก body · audit actor = ผู้เรียก | TC-F08-2 · TC-F11-3 · TC-F13-2 |
| ไม่มี push / email | T7/T8 ตรวจว่า push และอีเมล **ไม่มีชื่อ เบอร์ หรือข้อมูลลูกค้า** (ข้อ 1.4) | TC-PDPA-7 |

### 1.4 เกณฑ์ผ่านของชุดทดสอบอัตโนมัติ

1. `npm run db:test` (= `node tools/db/run.mjs --seed --test --quiet`) **exit code 0** · ไฟล์ทดสอบทุกไฟล์ผ่าน
2. `node tools/db/run.mjs --test --quiet` (ไม่มี seed) — ไฟล์ที่ประกาศว่า seed-independent ทุกไฟล์ต้องผ่าน (§2.3)
3. `npm run check:prototype` ผ่านครบ 11 หมวด
4. จำนวน assertion **ห้ามลดลง** จากรุ่นก่อนโดยไม่มีเหตุผลใน PR (ตัวเลขฐานปัจจุบันอยู่ใน §2.4)

### 1.5 การเทียบกับ A45

| เอกสารตาม A45 | ส่วนของเอกสารนี้ |
|---|---|
| **#17 Test Case** | §1 กลยุทธ์ · §2 ชุดทดสอบอัตโนมัติ · §3 test case ที่เขียนเป็นข้อความ · §5 ตารางเทียบ |
| **#18 UAT Checklist** | §4 ทั้งหมด (ผู้เข้าร่วม · สภาพแวดล้อม · entry/exit · สคริปต์รายบทบาท · sign-off · ระดับข้อบกพร่อง · go/no-go) |

---

## 2. ชุดทดสอบอัตโนมัติ

### 2.1 คำสั่งรัน

รันจาก **รากโครงการ** เสมอ (พาธมีอักษรไทยและช่องว่าง — ต้องใส่เครื่องหมายคำพูดเมื่อใช้ `cd`)

| ต้องการ | คำสั่ง |
|---|---|
| migration อย่างเดียว | `npm run db:migrate` (= `node tools/db/run.mjs`) |
| migration + seed | `node tools/db/run.mjs --seed` |
| **ชุดเต็ม (ที่ CI ใช้)** | `npm run db:test` (= `node tools/db/run.mjs --seed --test --quiet`) |
| ชุดเต็มแบบพิมพ์ทุก assertion | `npm run db:test:verbose` |
| ตรวจความเป็นอิสระจาก seed | `node tools/db/run.mjs --test --quiet` |
| เฉพาะไฟล์ที่ชื่อขึ้นต้นด้วย … | `node tools/db/run.mjs --seed --test rls_` · `… --test acceptance` · `… --test api_` |
| ดีบักคำสั่งเดียว | `node tools/db/run.mjs --seed --sql "select app.clock()"` |
| ตรวจ prototype | `npm run check:prototype` (= `node tools/check-prototype.mjs`) |
| ตรวจทุกอย่าง | `npm run check` (`db:test` + `check:prototype` + `check:canonical`) — **`check:canonical` ยังล้มเหลวเพราะไม่มีไฟล์ `tools/check-canonical.mjs`** (U1) |

> `tools/db/run.mjs` = PGlite 0.4.1 (PostgreSQL 17.5 · WASM) · session TimeZone `UTC` · `pg_trgm` อยู่ใน schema `extensions` · โหลด `tools/db/supabase-shim.sql` (role `anon`/`authenticated`/`service_role`/`supabase_auth_admin` · `auth.users` · `auth.mfa_factors` · `auth.uid()`/`auth.jwt()`/`auth.role()` · helper `test.login_as(email, aal)` · `test.login_as_uid` · `test.logout` · `test.assert_true` · `test.assert_eq` · `test.assert_raises(sql, msg, sqlstate)` · `test.count_rows`) · apply migration ตามลำดับชื่อและ **ข้ามไฟล์ `*_cron.sql`**

### 2.2 ตารางไฟล์ทดสอบ

**19 ไฟล์ · 2,470 assertion** (รันด้วย `--seed --test`) — ผลรันล่าสุดอยู่ใน §2.4

| # | ไฟล์ | ครอบคลุมอะไร | assertion | รหัสภายในไฟล์ | ต้องมี seed |
|---|---|---|---:|---|:--:|
| 1 | `supabase/tests/01_schema_stage1.sql` | migration 0001–0004: schema 8 ตัว + GRANT ระดับ schema · default privilege ของฟังก์ชัน · ENUM ทุกตัวและลำดับค่า (`core.data_scope` ต้องเรียง OWN→SYSTEM) · `core.roles` 8 แถว · **ตารางสิทธิ์ข้อ 8.1 ทุกช่อง** (ถอดแบบรายบทบาทแยกจาก migration เพื่อตรวจไขว้) · Master Data ทุกตาราง (`ref.provinces` 77 จังหวัด) · `app.settings` ทุกคีย์ของข้อ 11.2 · `app.clock()` · normalize/mask ตามข้อ 6.4 · generated column (`display_name` · `name_search` · `due_at` ของ DSR) · CHECK สำคัญ · RLS เปิดทุกตาราง `core` `ref` `crm` · view `security_invoker` | 242 | — | ✗ |
| 2 | `supabase/tests/02_schema_stage2.sql` | migration 0005–0009: เลขอ้างอิงทุกชนิดของข้อ 6.1 (รวมขอบปี Asia/Bangkok · `visit_no`/`queue_no` แยกตัวนับ · เกินหลักไม่ตัด) · CHECK ของ `visits` `interactions` `transaction_refs` `leads` `opportunities` `quotations` `tasks` `notifications` `export_requests` · `first_seen_at = least(...)` + invariant · แคช `last_*` `has_*` · `customer_branches` · lifecycle ครบ 6 ขั้น · `NEW → CONTACTED` อัตโนมัติ · ประวัติสถานะ · next-action task sync · `INTERESTED → QUOTATION` อัตโนมัติ · `expected_amount` · `note_summary` · guard เลขบัตรประชาชน · SYSTEM_ADMIN ห้ามถือบทบาทธุรกิจ · MARKETING+BA ห้ามร่วม · สมาชิกทีม · audit (masked + sha256 · actor · header · append-only · redaction · retention) | 175 | — | ✗ |
| 3 | `supabase/tests/api_01_customer.sql` | RPC ลูกค้าของ 0011: `api.quick_capture` · `find_customer_candidates` · `search_customers` · `link_customer_to_branch` · `get_customer_360` · `reveal_contact` · `reveal_address` · `save_contact` · `save_address` · `record_consent` · `merge_customers` · `decide_duplicate` | 84 | — | ✗ |
| 4 | `supabase/tests/api_02_work.sql` | RPC งานหน้าร้าน: `api.open_visit` · `close_visit` (เงื่อนไข outcome ครบ 7 ค่า) · `acknowledge_unrecorded_visit` · `convert_lead` · `assign_owner` | 49 | — | ✗ |
| 5 | `supabase/tests/api_03_admin.sql` | RPC ผู้ใช้/สิทธิ์/ค่าตั้ง/ส่งออก/audit/PDPA: `get_my_access` · `can_assign_role` · `assign_role` · `revoke_role` · `request_role_grant` · `decide_role_grant` · `list_role_grant_requests` · `activate_self` · `list_staff` · `update_staff` · `disable_staff` · `save_team` · `set_team_member` · `register_device` · `get_settings` · `update_setting` · `request_export` · `decide_export` · `record_export_download` · `list_export_requests` · `search_audit` · `get_entity_history` · `search_security_log` · `create_dsr` · `list_dsr` · `update_dsr` · `build_dsr_package` · `anonymize_customer` · `set_legal_hold` · `list_integration_logs` · `api.svc_*` | 135 | — | ✗ |
| 6 | `supabase/tests/rls_01_catalog.sql` | CI check ของสิทธิ์/RLS (ไม่ใช้ fixture): RLS เปิดทุกตาราง · view `security_invoker` · ไม่มี materialized view ใน schema ที่เปิด API · `anon`/PUBLIC ไม่มี GRANT · `authenticated` ไม่มี DELETE/TRUNCATE/REFERENCES/TRIGGER · ตารางที่เขียนโดย trigger/RPC เท่านั้น · GRANT ระดับตาราง/คอลัมน์ตรงทุกแถว · policy ไม่อ้างตารางตัวเอง · helper · owner = `postgres` · ทุก grant มี policy · ลำดับชื่อ BEFORE trigger (`trg_05_…` → `trg_10_…` → `trg_20_…` → `trg_90_…`) | 33 | `CI-01`…`CI-26` | ✗ |
| 7 | `supabase/tests/rls_02_helpers.sql` | helper ข้อ 9.3: `current_staff_id` · `is_aal2` · `clock` · `scope_branch_ids` · `team_member_staff_ids` · `team_scope_pairs` · `has_permission` · `customer_ids_in_scope` · `readable_customer_ids` · `can_access_record` · `can_access_customer` · `staff_has_branch_assignment` · invariant `can_access_customer` = `customer_ids_in_scope` · กติกา MFA และ `valid_to` | 43 | `H00`…`H16` | ✗ |
| 8 | `supabase/tests/rls_03_customer.sql` | RLS ของ `crm.customers` · `customer_contacts` (column grant) · `customer_addresses` · `customer_notes` · `customer_tags` · `customer_consents` · `customer_branches` · `duplicate_decisions` | 53 | `C01`…`C32` | ✗ |
| 9 | `supabase/tests/rls_04_activity.sql` | RLS ของ `crm.visits` · `crm.interactions` (รวม clause "รับคิว" และ read-through ผ่านลูกค้า) | 23 | `A01`…`A23` | ✗ |
| 10 | `supabase/tests/rls_05_sales.sql` | RLS ของ `crm.leads` · `opportunities` · `opportunity_items` · `quotations` · `quotation_items` · `transaction_refs` | 32 | `S01`…`S28` | ✗ |
| 11 | `supabase/tests/rls_06_work.sql` | RLS ของ `crm.tasks` · `task_comments` (**ไม่มี read-through ผ่านลูกค้า**) · `crm.notifications` (อ่านเฉพาะของตน · UPDATE ได้เฉพาะ `read_at`) | 23 | `W01`…`W20` · `SV1` | ✗ |
| 12 | `supabase/tests/rls_07_transition.sql` | `app.enforce_row_transition` ทุกแถวของ mapping คอลัมน์→สิทธิ์: visit (รับคิว · แก้ outcome · ยกเลิก) · interaction (24 ชม.) · lead (ปิด · reopen · `converted_opportunity_id`) · opportunity (เลื่อนขั้นที่อนุญาต/ห้าม · close · reopen) · quotation (หลัง SENT แก้ได้เฉพาะ `status`) · task (`is_next_action` · `DONE`/`CANCELLED`) · คอลัมน์ระบบ | 64 | `CU-`·`IN-`·`LD-`·`OP-`·`QT-`·`TK-`·`ALL-` | ✗ |
| 13 | `supabase/tests/rls_08_core_ref_app_audit.sql` | RLS/GRANT ของ `core.*` (`staff_profiles` column grant · `teams` · `branches` · `staff_role_assignments` · `team_members` · `roles` · `permissions` · `role_permissions`) · `ref.*` · `app.*` · `audit.*` (ไม่มี GRANT ให้ `authenticated`) · `trg_90_stamp_row` · guard | 29 | `G01`…`G08` · `K01`…`K16` | ✗ |
| 14 | `supabase/tests/rls_09_links_and_writes.sql` | `L` ผูกลูกค้าข้ามสาขาด้วย UPDATE `customer_id` (ข้อ 6.6 · 19.3 ข้อ 4) · `X` ตารางที่เขียนได้เฉพาะ trigger/RPC · `Y` คอลัมน์ owner/ทีม/สาขาไม่อยู่ใน UPDATE grant · `Z` เส้นทางเขียนที่ต้องสำเร็จ (trigger DEFINER) · `Q` MFA และขอบเขตต่อการมอบบทบาท · `V` `service_role` และ `anon` | 51 | `L01`…`V06` | ✗ |
| 15 | `supabase/tests/analytics_01_kpis.sql` | migration 0012: `analytics.customer_activity` · `purchase_events` · `data_quality_issues` · `app.kpi_period` · `app.fmt_*` · `api.get_kpis` ทุก preset ของข้อ 12.0 · KPI ข้อ 12.1 ทุกรหัส · อัตราข้อ 12.2 · `p_group_by` ครบ 6 ค่า · การปัดตามข้อ 1.3 · `NULL` เมื่อ scope TEAM/OWN ไม่มีการผูกพนักงาน | 163 | — | ✗ |
| 16 | `supabase/tests/analytics_02_reports.sql` | `api.get_report` ครบ 8 รหัส (`OVERVIEW` · `CUSTOMERS` · `SALES` · `CHANNELS` · `STAFF` · `BRANCHES` · `LOST_REASONS` · `DATA_QUALITY`) · `api.record_report_export` (`REPORT_EXPORTED`) · เหตุผลที่ไม่สำเร็จ 5 อันดับ + "อื่น ๆ" | 52 | — | ✗ |
| 17 | `supabase/tests/jobs_01.sql` | migration 0013: `app.job_close_stale_visits` · `job_expire_quotations` · `job_expire_exports` · `job_notifications` (ทุกรหัสของข้อ 11.1 · `dedupe_key` · การยกระดับ · เวลาทำการ) · `job_retention` · ทุกงานเรียกด้วย `p_as_of` ที่ระบุชัดและทดสอบการรันซ้ำ (idempotent) | 73 | `L`·`M`·`N`·`O`·`P` | ✗ |
| 18 | `supabase/tests/acceptance.sql` | **ทุกตัวเลขที่พิมพ์ในข้อ 13.1–13.12 · 13.14 · 14.7** คำนวณผ่าน `api.get_kpis`/`api.get_report` จากแถวจริง + **คำถาม Acceptance 11 ข้อของ A44 · B27** (บล็อก `O`) + ค่าประกอบในวงเล็บและ invariant (บล็อก `P`) | 1,037 | `A`…`P` | **✓** |
| 19 | `supabase/tests/rls_personas.sql` | **ตารางข้อ 13.13 ครบทุกช่อง** ด้วยผู้ใช้จริงของ seed (13 บุคคล × 6 คอลัมน์) + test เพิ่มเติมที่บังคับ 6 ข้อ (ผู้ไม่มีบทบาทเห็น 0 แถว · ไม่ใช่ superuser · BM@JP1+ST@JP2 · STAFF@JP2 INSERT visit ลูกค้า JP1 · `value_raw` ถูกปฏิเสธ · SA ไม่มี `customer.*`) | 109 | ข้อ 13.13 | **✓** |
| — | `tools/check-prototype.mjs` | ความสอดคล้องของ `prototype/` กับ CANONICAL v2.2 · 11 หมวด (ดู §2.5) · ไม่นับเป็น assertion | 11 หมวด | — | ✗ |

### 2.3 ความเป็นอิสระจาก seed

| กลุ่ม | ไฟล์ | fixture |
|---|---|---|
| **อิสระจาก seed** (17 ไฟล์ · 1,324 assertion) | 01 · 02 · `api_01` · `api_02` · `api_03` · `rls_01`…`rls_09` · `analytics_01` · `analytics_02` · `jobs_01` | องค์กร `TEST-S1` `TEST-S2` `TEST-API` `TEST-RLS` `TEST-KPI` `TEST-RPT` `TEST-JOB` · อีเมล `@test.example.com` · `staff_code` `ST-9xxx` · `CUS-1999-…` `CUS-1997-…` |
| **ต้องรันคู่ seed** (2 ไฟล์ · 1,146 assertion) | `acceptance.sql` · `rls_personas.sql` | ข้อมูลตัวอย่างข้อ 13 (ผู้ใช้ `ST-0001`…`ST-0051` · อีเมล `@example.com`) |

- `node tools/db/run.mjs --test --quiet` (ไม่มี seed) → 17 ไฟล์ผ่าน · `acceptance.sql` ล้มที่ `F01 app.clock()` และ `rls_personas.sql` ล้มที่ `test.login_as: ไม่พบผู้ใช้ kwan@example.com` — **เป็นพฤติกรรมที่ตั้งใจ** เพราะทั้งสองไฟล์ตรวจค่าของ seed โดยตรง (ข้อ 13.0 กติกา 9 · ข้อ 13.13)
- `jobs_01.sql` เป็นงานระดับระบบ (ไม่มีพารามิเตอร์องค์กร/สาขา) จึงล้างตารางธุรกิจทั้งหมดก่อนสร้าง fixture ภายในทรานแซกชันของไฟล์ (run.mjs ROLLBACK ให้) — **ห้ามรันไฟล์นี้กับฐานข้อมูลจริง**

### 2.4 ผลรันล่าสุด (ฐานอ้างอิงของ §1.4 ข้อ 4)

```
✓ test supabase/tests/01_schema_stage1.sql — 242 assertion ผ่าน
✓ test supabase/tests/02_schema_stage2.sql — 175 assertion ผ่าน
✓ test supabase/tests/acceptance.sql — 1037 assertion ผ่าน
✓ test supabase/tests/analytics_01_kpis.sql — 163 assertion ผ่าน
✓ test supabase/tests/analytics_02_reports.sql — 52 assertion ผ่าน
✓ test supabase/tests/api_01_customer.sql — 84 assertion ผ่าน
✓ test supabase/tests/api_02_work.sql — 49 assertion ผ่าน
✓ test supabase/tests/api_03_admin.sql — 135 assertion ผ่าน
✓ test supabase/tests/jobs_01.sql — 73 assertion ผ่าน
✓ test supabase/tests/rls_01_catalog.sql — 33 assertion ผ่าน
✓ test supabase/tests/rls_02_helpers.sql — 43 assertion ผ่าน
✓ test supabase/tests/rls_03_customer.sql — 53 assertion ผ่าน
✓ test supabase/tests/rls_04_activity.sql — 23 assertion ผ่าน
✓ test supabase/tests/rls_05_sales.sql — 32 assertion ผ่าน
✓ test supabase/tests/rls_06_work.sql — 23 assertion ผ่าน
✓ test supabase/tests/rls_07_transition.sql — 64 assertion ผ่าน
✓ test supabase/tests/rls_08_core_ref_app_audit.sql — 29 assertion ผ่าน
✓ test supabase/tests/rls_09_links_and_writes.sql — 51 assertion ผ่าน
✓ test supabase/tests/rls_personas.sql — 109 assertion ผ่าน

ทดสอบผ่านทั้งหมด 19 ไฟล์
```

### 2.5 `tools/check-prototype.mjs` — 11 หมวด

| หมวด | ตรวจอะไร |
|---|---|
| 1 | `assets/data.js` และ `assets/app.js` โหลดได้ใน sandbox ที่ไม่มี DOM |
| 2 | หน้าจอใน `data.js` = ตารางข้อ 14.1 · `<body data-page data-roles>` ของทุกไฟล์ตรงทุกตัวอักษร (19 หน้า + `index.html`) |
| 3 | เมนูข้อ 14.2 · bottom nav · "เพิ่มเติม" · FAB อ้างเฉพาะหน้าที่มีจริง · ผู้ใช้ตัวอย่างข้อ 13.5 |
| 4 | ไม่มีสี hex นอกบล็อก `:root` ของ `app.css` · ไม่มี hex ใน `<style>`/`style=""` ของหน้า |
| 5 | ไม่มี URL ภายนอก · `@import` ระยะไกล · การเรียกเครือข่าย ทั้งโฟลเดอร์ `prototype/` |
| 6 | ทุกหน้า include `assets/app.css` · `assets/data.js` · `assets/app.js` ตามลำดับ |
| 7 | ตัวเลขใน `data.js`: ผลรวมรายสาขา = องค์กร · รายพนักงาน = JP1 · pipeline · งาน · ร้อยละคำนวณใหม่ (half away from zero) |
| 8 | การ์ด dashboard ตามบทบาท (ข้อ 14.7) ตรงข้อมูลที่อ้าง |
| 9 | `JCRM.can` ให้ผลตรงตารางข้อ 13.13 · ตัวจัดรูปแบบตัวเลข/วันที่ตรงข้อ 1.2–1.3 |
| 10 | ค่าที่ปรับใน v2.2: สีกราฟ D49 · ป้ายไทยข้อ 4.8 · ชื่อทีม · ลูกค้าล่าสุด/กิจกรรมล่าสุด 13.5 · priority การ์ด 13.9 · กระดิ่ง 13.14 · คำขอส่งออก · คู่ซ้ำ · `NULL` KPI ของคุณฝน · KPI `OPEN_*` `TASKS_*` `WON_LAST_7_DAYS` |
| 11 | พฤติกรรม `app.js` ตาม v2.2: ตัวเลือกช่วงเวลาเฉพาะหน้า 02 · 09 · 12 · ช่องค้นหาซ่อนสำหรับ MK/SA · กติกาย้ายขั้นข้อ 4.4 · `access()` · ตัวเลือกข้อมูลตาม persona |

> `prototype/` เป็นแบบจำลองหน้าจอ **ไม่ใช่ระบบจริง** — ไม่เรียกฐานข้อมูล จึงไม่ใช้เป็นหลักฐานของ Acceptance (ข้อ 13.0 กติกา 2) · ใช้ตรวจความถูกต้องของป้าย ตัวเลขที่พิมพ์ และกติกา UI เท่านั้น

---

## 3. Test case

> **บัญชีที่ใช้ในทุก case** (ข้อ 13.5 · prototype ใช้ชุดเดียวกัน): `ST-0045` คุณขวัญ STAFF@JP1 · `ST-0046` คุณคิม STAFF@JP1 · `ST-0030` คุณนัท SUPERVISOR@JP1 (หัวหน้า `JP1-SALES`) · `ST-0020` คุณเจ BRANCH_MANAGER@JP1 · `ST-0021` คุณบอส BRANCH_MANAGER@JP2 · `ST-0010` คุณปุ๊ก OPERATIONS@JP1–JP4 · `ST-0011` คุณมายด์ MARKETING · `ST-0001` จ๋าอั๋น EXECUTIVE · `ST-0002` คุณแพร BUSINESS_ADMIN · `ST-0003` คุณต้น SYSTEM_ADMIN · `ST-0050` คุณฝน STAFF@JPON · `ST-0051` คุณโอ๊ต INVITED
> **"ตอนนี้" ของชุดข้อมูล** = 11 ก.ย. 2569 10:24 น. · **P** = "30 วันล่าสุด" = [13 ส.ค. 2569, 12 ก.ย. 2569) (ข้อ 13)
> บทบาทที่ `requires_mfa` ต้อง **aal2** เสมอ เว้นแต่ case ระบุว่า aal1 (ข้อ 8.0)

### 3.1 F01 — รับลูกค้า Walk-in · รับคิว · ปิด visit พร้อมผล

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F01-1** รับเข้าคิว (ยังไม่รู้ตัวตน) | คุณขวัญล็อกอิน (aal1) · เปิดหน้า 07 ของ JP1 · คิววันนี้มี 001–004 | 1) ตั้ง `party_size` = 1 2) เลือก "รู้จักร้านจาก" = `PASSING_BY` 3) กดชิป "ซื้อเครื่อง" (`BUY`) 4) ไม่ระบุลูกค้า 5) กด **"รับเข้าคิว"** | visit ใหม่ `status='WAITING'` · `owner_staff_id IS NULL` · `channel_code='WALK_IN'` · `started_at = now()` · `visit_no` จากตัวนับ `VISIT:JP1:{YYYYMMDD}` · `queue_no` จาก `QUEUE:JP1:{YYYYMMDD}` แสดง "คิว 005" · มี interaction ต้นทาง `is_visit_root = true` `INBOUND` `WALK_IN` 1 แถวพอดี · `customer_id` ว่าง จึงยังไม่นับใน `IDENTIFIED_VISITS` | ข้อ 3.3 ข้อ 1–2 · 4.1 · 6.1 · `visit.create` B | `api_02_work.sql` · `02_schema_stage2.sql` |
| **TC-F01-2** ไม่เลือกความสนใจ | เหมือน TC-F01-1 | 1) ไม่กดชิปวัตถุประสงค์ 2) กด "รับเข้าคิว" | ปุ่มกดไม่ได้ที่ UI · เรียก `api.open_visit` ตรงโดยไม่ส่ง `interest_code` ถูก **ปฏิเสธ** (บังคับเมื่อ `WALK_IN`) | ข้อ 6.10 · `visit.create` | `api_02_work.sql` |
| **TC-F01-3** รับคิว (สองคนกดพร้อมกัน) | มี visit `WAITING` owner ว่างที่ JP1 · คุณขวัญและคุณคิมเปิดหน้า 07 พร้อมกัน | 1) ทั้งสองกด **"รับคิว"** บนคิวเดียวกันเกือบพร้อมกัน | คนแรกสำเร็จ: `status='IN_SERVICE'` · `owner_staff_id` = ผู้กด · `service_started_at = greatest(now(), started_at)` · คนที่สองได้ **0 แถว** (USING ต้อง `owner_staff_id IS NULL`) → หน้าจอแจ้ง "มีผู้รับคิวแล้ว" แล้วโหลดคิวใหม่ · การพยายามเปลี่ยนคอลัมน์อื่นพร้อมกันถูกปฏิเสธ | ข้อ 4.1 · 9.4 (clause รับคิว) · 9.4.2 · `visit.update` scope ใดก็ได้ในสาขา | `rls_04_activity.sql` · `rls_07_transition.sql` |
| **TC-F01-4** ระบุลูกค้าเดิมระหว่างให้บริการ | visit `IN_SERVICE` ของคุณขวัญ · คุณสมชาย `CUS-2026-000297` อยู่ในขอบเขตของคุณขวัญ | 1) ค้นหา "081-234-5678" 2) เลือกคุณสมชาย 3) ยืนยัน | `visits.customer_id` ถูกตั้ง (จากค่าว่างเท่านั้น) · `IDENTIFIED_VISITS` เพิ่ม · `crm.customer_branches` และ `first_seen_at` ถูกปรับโดย trigger · UI เสนอปุ่ม "สร้าง Lead" แต่ `api.open_visit` **ไม่สร้าง lead อัตโนมัติ** | ข้อ 19.2 ข้อ 2 · 19.3 ข้อ 1 · `visit.update` · `interaction.create` B | `api_02_work.sql` · `rls_09_links_and_writes.sql` |
| **TC-F01-5** ปิด visit ตามเงื่อนไข outcome | visit `IN_SERVICE` มี `customer_id` และมี `OP-2026-002998` เปิดอยู่ที่มี next action | 1) กด "จบการให้บริการ" 2) เลือก `FOLLOW_UP` 3) ยืนยัน | `status='COMPLETED'` · `outcome_code='FOLLOW_UP'` · `ended_at` ถูกตั้ง · lifecycle refresh · ถ้าเลือก `PURCHASED` โดยไม่มี `customer_id` → **ปฏิเสธ** · ถ้าเลือก `NOT_INTERESTED` โดยไม่ส่ง `lost_reason_code` → **ปฏิเสธทั้งทรานแซกชัน** · `NOT_INTERESTED` ที่ถูกต้องปิด lead ที่เปิดจาก visit นี้เป็น `LOST` และยกเลิก task next action ในทรานแซกชันเดียว | ข้อ 4.2 · 19.3 ข้อ 3 · `visit.update` บน visit | `api_02_work.sql` |
| **TC-F01-6** แก้ outcome ข้ามวัน | visit ปิดเมื่อวาน | 1) เรียก `api.close_visit` ซ้ำด้วย outcome ใหม่ | **ปฏิเสธ** (แก้ได้เฉพาะภายในวันธุรกิจเดียวกัน) · `branch_id` ของ visit เปลี่ยนไม่ได้ทุกกรณี | ข้อ 4.1 · 19.3 ข้อ 3 | `api_02_work.sql` · `rls_07_transition.sql` |
| **TC-F01-7** ยกเลิก visit ที่สร้างผิด | visit `WAITING` ที่คุณขวัญเพิ่งสร้าง | 1) กด "ยกเลิก" 2) ไม่กรอกเหตุผล → บันทึก 3) กรอกเหตุผลแล้วบันทึก | ขั้น 2 **ปฏิเสธ** (`visits_cancel_reason_chk`) · ขั้น 3 สำเร็จ: `status='CANCELLED'` · **ไม่นับในทุก KPI** · interaction ต้นทางไม่นับเป็นกิจกรรมและไม่นับใน "ติดต่อ N ครั้ง" · `trg_link_customer_branch` ไม่ผูกสาขาจาก visit นี้ | ข้อ 3.1 · 3.3 ข้อ 5 · 4.1 (เจ้าของภายใน 15 นาที **[รอยืนยัน]** · หลังจากนั้นต้อง scope T/B) | `rls_07_transition.sql` |
| **TC-F01-8** รับทราบ visit ที่ระบบปิด | visit outcome `UNRECORDED` (ปิดโดยงาน 00:05) | 1) เปิดหน้า 12 2) กด "รับทราบ" | `api.acknowledge_unrecorded_visit` ตั้ง `unrecorded_ack_by` = ตน · `unrecorded_ack_at = now()` · visit ที่ outcome ไม่ใช่ `UNRECORDED` → **ปฏิเสธ** · รายการยังนับใน issue `VISIT_UNRECORDED` จนพ้น 7 วัน | ข้อ 9.6 · 12.3 · `visit.update` บน visit | `api_02_work.sql` |

### 3.2 F02 — การติดต่อออนไลน์/โทร

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F02-1** เปิด visit ใหม่จากข้อความแรกของวัน | คุณสมชายทัก LINE 11 ก.ย. 10:24 · ไม่มี visit LINE ของคุณสมชายที่เปิดอยู่ในวันธุรกิจนี้ | 1) คุณขวัญบันทึกการติดต่อ: ช่องทาง `LINE` · `INBOUND` · ประเภท `INQUIRY` · สรุป | เปิด visit ใหม่ `status='IN_SERVICE'` · owner = ผู้บันทึก · มี `visit_no` (`V-JP1-260911-007`) · **ไม่มี `queue_no`** · interaction ต้นทาง · ตัวนับ `VISIT:JP1:20260911` = 7 | ข้อ 3.3 ข้อ 3 · 19.3 ข้อ 1 · `visit.create` B + `interaction.create` B | `api_02_work.sql` |
| **TC-F02-2** แนบเข้า visit เดิม | มี visit `LINE` ของลูกค้าคนเดิม สาขาเดียวกัน ยัง `IN_SERVICE` ในวันธุรกิจนี้ | 1) บันทึกการติดต่อ `INBOUND` `LINE` อีกครั้ง | แนบ interaction เข้า visit เดิม (`visit_id` เดิม · `is_visit_root = false`) · **ไม่เพิ่ม `VISITS`** · กุญแจจับคู่ = `customer_id` + `channel_code` + `branch_id` + วันธุรกิจ กับ visit `IN_SERVICE` | ข้อ 3.3 ข้อ 3 · 19.3 ข้อ 1 | `api_02_work.sql` |
| **TC-F02-3** OUTBOUND ไม่สร้าง visit | ลูกค้ามี lead `NEW` ช่องทาง `LINE` | 1) คุณขวัญกด "โทร" (เรียก `api.reveal_contact` ก่อน) 2) ยืนยัน interaction `OUTBOUND` หลังวางสาย | **ไม่สร้าง visit** และไม่นับใน `VISITS` แต่นับเป็นกิจกรรมของลูกค้า (`UNIQUE_CUSTOMERS`) · lead `NEW` ของลูกค้าที่ `created_at ≤ occurred_at` เปลี่ยนเป็น `CONTACTED` + `first_contacted_at = occurred_at` โดย `app.trg_mark_lead_contacted` · เขียน `CONTACT_REVEALED` ใน `audit.access_logs` | ข้อ 3.3 ข้อ 4 · 4.3 · 6.4 · `interaction.create` B · `customer.pii.reveal` B | `02_schema_stage2.sql` · `api_01_customer.sql` |
| **TC-F02-4** INSERT interaction INBOUND ตรงโดยไม่มี visit | ผู้ใช้เรียก PostgREST ตรง | 1) `INSERT crm.interactions` `direction='INBOUND'` `channel_code='LINE'` โดยไม่ส่ง `visit_id` | **ปฏิเสธ** · INBOUND ที่ INSERT ตรงต้องมี `visit_id` ของ visit ที่เปิดอยู่สาขาเดียวกัน มิฉะนั้นต้องใช้ `api.open_visit` · `channel_code='WALK_IN'` ต้องใช้ F01 | ข้อ 19.2 ข้อ 5 | `rls_04_activity.sql` · `rls_07_transition.sql` |
| **TC-F02-5** ส่งต่อรายการจาก JPON ไปสาขา | คุณฝน (`ST-0050` STAFF@JPON) มี lead ที่ JPON · คุณแพร (BA · G) ทำการส่งต่อ | 1) เรียก `api.assign_owner('LEAD', id, <owner ที่ JP1>, 'BRANCH_TRANSFER', note, <JP1>)` | `branch_id` เปลี่ยนเป็น JP1 · `owner_staff_id` = ผู้รับใหม่ที่มี assignment ที่ JP1 · แถว `crm.ownership_changes` เหตุผล `BRANCH_TRANSFER` · task next action ย้ายสาขาตามแม่ · **visit และ interaction ย้ายสาขาไม่ได้** · ผู้กระทำต้องมี `lead.assign` ทั้งสาขาต้นทางและปลายทาง | ข้อ 9.4.2 · 12.4 · `lead.assign` (ST ไม่มี) | `api_02_work.sql` · `rls_09_links_and_writes.sql` |

### 3.3 F03 — Quick Capture · ตรวจซ้ำ · ผูกลูกค้าสาขาอื่น

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F03-1** สร้างลูกค้าครบเงื่อนไข (โหมด A) | คุณขวัญเปิดหน้า 04 จากปุ่ม "+ รับลูกค้า" | 1) กรอกเบอร์ `081-000-0001` · ชื่อ · ช่องทางแรก `WALK_IN` · สาขา JP1 2) ติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" 3) เลือกความสนใจ `BUY` 4) กด "บันทึก" | ทรานแซกชันเดียวสร้าง: `crm.customers` (`customer_no` `CUS-2026-…` · `created_via='QUICK_CAPTURE'` · `owner_staff_id` = ผู้บันทึก · `first_seen_at = least(created_at, เวลากิจกรรม)`) · `customer_contacts` (E.164 `+66810000001` + `value_masked` `081-XXX-0001` คำนวณในฐานข้อมูล) · `customer_consents` `PRIVACY_NOTICE` `GRANTED` `notice_version='PN-2026-01'` · visit + interaction ต้นทาง · lead (เพราะ `BUY.creates_lead = true`) สถานะ `CONTACTED` (ช่องทางสด) · `customer_branches` `linked_via='CREATED'` · audit `CUSTOMER_CREATED` · `CONSENT_RECORDED` | ข้อ 6.2 · 6.4 · 10.2 · 4.3 · `customer.create` B + `visit.create` B | `api_01_customer.sql` |
| **TC-F03-2** เงื่อนไขบังคับไม่ครบ | เหมือน TC-F03-1 | ทดสอบทีละกรณี: 1) ไม่มีทั้งชื่อและชื่อเล่น 2) ไม่มีช่องทางติดต่อเลย 3) ช่องทางแรก `WALK_IN` แต่ไม่มีเบอร์ 4) ไม่ติ๊กแจ้งประกาศ 5) เลือกสาขาที่ตนไม่มี `customer.create` 6) โน้ตมีเลขบัตรประชาชน 13 หลักที่ checksum ถูก | ทุกกรณี **ปฏิเสธทั้งทรานแซกชัน** · กรณีเบอร์ผิดรูปแบบ (เช่น `12345`) **ไม่ปฏิเสธ** แต่เก็บ `is_valid = false` → ปรากฏใน issue `INVALID_PHONE` | ข้อ 6.2 · 6.4 · 10.1 · 12.3 | `api_01_customer.sql` · `02_schema_stage2.sql` |
| **TC-F03-3** ตรวจซ้ำ — การ์ดเต็ม | คุณขวัญ (ST@JP1) · ลูกค้า `CUS-2026-000297` และ `CUS-2026-004410` อยู่ในขอบเขต | 1) กรอก `081-234-5678` + "สมชาย ใจดี" 2) ระบบเรียก `api.find_customer_candidates` อัตโนมัติ | แผง "พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน 2 รายการ" · `CUS-2026-000297` คะแนน **100** "เบอร์โทรตรงกัน" การ์ดเต็ม (`081-XXX-5678` · ป้าย "ลูกค้าซื้อซ้ำ" · ปุ่ม "ดูข้อมูล" + "ใช้ลูกค้าเดิม") · `CUS-2026-004410` คะแนน **40** "ชื่อคล้าย + สาขาแรกเดียวกัน" · เขียน `CUSTOMER_CANDIDATE_SEARCH` ที่เก็บ **sha256 ของค่า normalized** ไม่ใช่ค่าจริง | ข้อ 6.5 · 13.14 · `customer.create` | `api_01_customer.sql` |
| **TC-F03-4** ตรวจซ้ำ — การ์ดย่อ (ลูกค้านอกขอบเขต) | พนักงาน JP2 ที่ไม่เคยเห็นลูกค้าทั้งสอง | 1) กรอก `081-234-5678` + "สมชาย ใจดี" | คืนเฉพาะ `CUS-2026-000297` เป็น **การ์ดย่อ**: `customer_no` · "สมชาย ใ." · `081-XXX-5678` (เบอร์ปิดบังแสดงเฉพาะเมื่อตรงด้วยเบอร์) · คะแนน · เหตุผล · ปุ่ม "ใช้ลูกค้าเดิม" — **ไม่คืน lifecycle สาขา หรือวันที่ติดต่อ** · `CUS-2026-004410` **ไม่แสดง** (กฎคะแนน 40 ต้องสาขาแรก = สาขาผู้เรียก · กฎ 70 ไม่ผ่านเพราะเบอร์ 4 ตัวท้ายต่างกัน) | ข้อ 6.5 · D32 · 13.14 | `api_01_customer.sql` |
| **TC-F03-5** ผูกลูกค้าสาขาอื่นผ่าน visit | โหมด A/C · มี visit ของ JP2 สถานะ `WAITING`/`IN_SERVICE` สร้างภายใน 4 ชม. `customer_id` ยังว่าง · ลูกค้าถูกคืนจาก `find_customer_candidates` ของผู้เรียกสำหรับ visit นี้ภายใน 30 นาที | 1) กด "ใช้ลูกค้าเดิม" บนการ์ดย่อ 2) เรียก `api.link_customer_to_branch(p_customer_id, p_visit_id)` | `visits.customer_id` ถูกตั้งในทรานแซกชันเดียว · เพิ่มแถว `customer_branches` สาขาของ visit `linked_via='MANUAL_LINK'` · เขียน `CUSTOMER_LINKED_TO_BRANCH` · **สาขามาจาก visit ไม่รับจากผู้เรียก** · เกิน `security.link_per_day` (10 ครั้ง/วัน/ผู้ใช้) → แจ้ง `LINK_LIMIT_EXCEEDED` ถึง BRANCH_MANAGER ของสาขานั้น | ข้อ 6.6 · 11.1 · 11.2 · `visit.update` บน visit | `api_01_customer.sql` · `rls_09_links_and_writes.sql` |
| **TC-F03-6** โหมด B ผูกสาขาไม่ได้ | เปิดหน้า 04 จาก "เพิ่มลูกค้า" ในหน้า 03 (ไม่มี visit) | 1) พบการ์ดย่อของลูกค้านอกขอบเขต | ปุ่ม "ใช้ลูกค้าเดิม" **แสดงแบบปิด** พร้อมเหตุผล "ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า" · เรียก `api.link_customer_to_branch` โดยไม่มี visit ถูก **ปฏิเสธ** · การ UPDATE `customer_id` ของรายการกิจกรรมเพื่อเลี่ยงถูกปฏิเสธด้วย WITH CHECK `customer_id IN (SELECT app.readable_customer_ids())` | ข้อ 6.6 · 19.3 ข้อ 4 | `rls_09_links_and_writes.sql` (`L01`–`L06`) |
| **TC-F03-7** override สร้างใหม่ทั้งที่อาจซ้ำ | มีผู้สมัครคะแนน ≥ 70 | 1) กด "ยังต้องการสร้างลูกค้าใหม่" 2) เลือก `FAMILY_SHARED_PHONE` 3) บันทึก | สร้างลูกค้าใหม่ได้ (**ไม่บล็อก · ไม่มี merge อัตโนมัติ**) · RPC **คำนวณผู้สมัครใหม่ฝั่ง server ไม่รับคะแนนจาก client** · สร้าง `crm.duplicate_decisions` `PENDING` 1 แถว (คู่กับผู้สมัครคะแนนสูงสุด · CHECK `score >= 70` · unique 1 แถวต่อลูกค้าใหม่) · เหตุผล `OTHER` บังคับหมายเหตุ · ผู้สมัครคะแนน 40 อย่างเดียว → **ไม่สร้างแถว** · ถูกสรุปใน `DUPLICATE_SUSPECTED` เวลา 18:00 ถึง SV/BM ของสาขา | ข้อ 6.5 · 19.1 ข้อ 7 · 19.3 ข้อ 2 | `api_01_customer.sql` |
| **TC-F03-8** เพดานอัตราการค้นหา | ผู้ใช้เดียวกันเรียก `find_customer_candidates` ซ้ำ | 1) เรียกเกิน 60 ครั้ง/ชม. 2) ค้นด้วยตัวระบุที่ไม่พบผลเกิน 20 ครั้ง/ชม. | ขั้น 1 **ปฏิเสธ** · ขั้น 2 บล็อก 1 ชม. + แจ้ง `SEARCH_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN · ส่งแต่ชื่อโดยไม่มี phone/line_id/email → **ปฏิเสธ** | ข้อ 6.5 · 11.1 · 11.2 (`security.search_per_hour` 60 · `security.search_miss_per_hour` 20) | `api_01_customer.sql` |

### 3.4 F04 — วงจร Lead

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F04-1** สถานะเริ่มต้นตามช่องทาง | ลูกค้าที่อ่านได้และเชื่อมกับสาขาแล้ว | 1) สร้าง lead ช่องทาง `WALK_IN` 2) สร้าง lead ช่องทาง `LINE` | `WALK_IN`/`PHONE` (`ref.channels.is_live = true`) → `CONTACTED` + `first_contacted_at = created_at` · ช่องทางข้อความ → `NEW` · ใช้กับทุก lead ไม่ว่ามีหรือไม่มี visit · task next action ถูกสร้างโดย `app.trg_sync_next_action_task` · `has_new_lead` ของลูกค้าเป็น true เมื่อ `NEW` | ข้อ 4.3 · 5.1 · `lead.create` B | `02_schema_stage2.sql` · `rls_05_sales.sql` |
| **TC-F04-2** สาขาของ lead ต้องเป็นสาขาที่ลูกค้าเชื่อมแล้ว | คุณขวัญ (scope O/B ที่ JP1) · ลูกค้าที่ยังไม่เชื่อมกับ JP1 | 1) INSERT lead ที่ `branch_id = JP1` | **ปฏิเสธ** · `branch_id` ต้องอยู่ในสาขาของ assignment **และ** เป็นสาขาที่ลูกค้าเชื่อมอยู่แล้ว (`customer_branches`/`first_branch_id`) เว้นแต่ scope ORGANIZATION · ต้องใช้ `api.link_customer_to_branch` ก่อน | ข้อ 8.0 · 6.6 | `rls_05_sales.sql` · `rls_09_links_and_writes.sql` |
| **TC-F04-3** `NEW → CONTACTED` อัตโนมัติ | lead `NEW` ช่องทาง `LINE` | 1) บันทึก interaction `OUTBOUND` ของลูกค้าคนเดียวกันที่ `occurred_at ≥ lead.created_at` | lead → `CONTACTED` · `first_contacted_at = occurred_at` · เขียน `crm.lead_status_history` · ป้าย "ยังไม่ได้ติดต่อ" หายเมื่อไม่มี lead `NEW` เหลือ · เข้าฐานของ `LEAD_RESPONSE_MIN` | ข้อ 4.3 · 12.2 | `02_schema_stage2.sql` |
| **TC-F04-4** เปลี่ยนสถานะด้วยมือ | lead `NEW` · owner = คุณขวัญ | 1) `NEW → CONTACTED` 2) `CONTACTED → QUALIFIED` 3) `QUALIFIED → CONTACTED` 4) พยายาม `CONTACTED → NEW` 5) พยายามส่ง `first_contacted_at` เอง | 1–3 สำเร็จ · ออกจาก `NEW` ด้วยมือตั้ง `first_contacted_at = greatest(now(), created_at)` · 4 **ปฏิเสธ** (ย้อนเป็น `NEW` ไม่ได้) · 5 **ปฏิเสธ** (คอลัมน์ตั้งโดยระบบ) · ทุกการเปลี่ยนเขียน `lead_status_history` พร้อม `reason` จาก `app.status_reason` | ข้อ 4.3 · 19.1 ข้อ 9 · 19.2 ข้อ 4 · `lead.update` (ST O · SV T · BM B · BA G) | `rls_07_transition.sql` |
| **TC-F04-5** แปลงเป็นโอกาสขาย | lead เปิดอยู่ · ผู้กระทำมี `lead.update` และ `opportunity.create` | 1) เรียก `api.convert_lead(p_lead_id, p)` พร้อม `priority_code` + next action 3 ช่อง 2) ทดสอบซ้ำโดยไม่ส่ง next action 3) ทดสอบด้วยคุณแพร (BA) | 1 สำเร็จ: opportunity ใหม่ `INTERESTED` (`lead_id` · `customer_id` · `branch_id` ของ lead · `origin_channel_code = leads.channel_code`) · lead `CONVERTED` + `converted_opportunity_id` + `closed_at` · task next action ของ lead → `CANCELLED` · task ของ opportunity ถูกสร้าง · lifecycle → `OPPORTUNITY` · 2 **ปฏิเสธทั้งทรานแซกชัน** · 3 **ปฏิเสธ** (BA ไม่มี `opportunity.create`) · UPDATE `status='CONVERTED'` ตรงถูกปฏิเสธ | ข้อ 4.3 · 8.1 · 9.4 กติกา 7 · `lead.update` + `opportunity.create` | `api_02_work.sql` · `rls_07_transition.sql` |
| **TC-F04-6** ปิดไม่สำเร็จ และเปิดใหม่ | lead เปิดอยู่ | 1) UPDATE `status='LOST'` + `lost_reason_code='PRICE'` + `closed_at` 2) พยายามแก้ lead ที่ปิดแล้ว 3) คุณขวัญ/คุณนัทพยายาม reopen 4) คุณเจ reopen | 1 สำเร็จ · task next action → `CANCELLED` · lifecycle → `LOST` เมื่อไม่เคยซื้อและไม่มีรายการเปิด · `OTHER` บังคับ `lost_note` · 2 **ปฏิเสธ** (อ่านอย่างเดียวจนกว่าจะ reopen) · 3 **ปฏิเสธ** (ST/SV ไม่มี `lead.reopen`) · 4 สำเร็จ: → `CONTACTED` และล้าง `closed_at` `lost_reason_code` `converted_opportunity_id` + task next action ใหม่ | ข้อ 4.3 · 8.1 · 19.2 ข้อ 3 · `lead.update` / `lead.reopen` (BM B · BA G) | `rls_07_transition.sql` |
| **TC-F04-7** lead ไม่มี owner | lead เปิดอยู่ `owner_staff_id IS NULL` (seed มี 8 รายการ สาขาละ 2) | 1) รอเกิน 15 นาที **ในเวลาทำการ** 2) คุณนัท (SV@JP1 · หัวหน้าทีม) มอบ lead ด้วย `api.assign_owner` | ขั้น 1: `app.job_notifications` สร้าง `LEAD_UNASSIGNED` ถึง SUPERVISOR (หัวหน้าทีมในสาขา) และ BRANCH_MANAGER ที่ ACTIVE ทุกคนของสาขา (in-app + push) · ขั้น 2 สำเร็จ เพราะ `lead.assign` scope **T รวมรายการที่ owner ว่าง** ในสาขาที่ตนเป็นหัวหน้าทีม · issue `LEAD_WITHOUT_OWNER` หายไป | ข้อ 8.0 · 11.1 · 12.3 · Q28 · `lead.assign` | `jobs_01.sql` · `rls_09_links_and_writes.sql` |

### 3.5 F05 — Opportunity → ใบเสนอราคา → ปิดการขาย/ไม่สำเร็จ

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F05-1** สร้างโอกาสขายตรง | ลูกค้าที่อ่านได้ · ผู้กระทำมี `opportunity.create` B | 1) INSERT `crm.opportunities` พร้อม `origin_channel_code` · `priority_code` · next action 3 ช่อง · owner 2) ทดสอบด้วยคุณแพร (BA) | 1 สำเร็จ: `INTERESTED` · `origin_channel_code` ตั้งครั้งเดียวไม่เปลี่ยน · `opportunity_stage_history` + task next action ถูกสร้าง · ขาดช่องบังคับของ CHECK → **ปฏิเสธ** · 2 **ปฏิเสธ** (BA ไม่มี `opportunity.create`) | ข้อ 4.4 · 8.1 | `rls_05_sales.sql` · `02_schema_stage2.sql` |
| **TC-F05-2** `expected_amount` มาจาก items | opportunity เปิดอยู่ | 1) เพิ่ม/แก้/ลบ `crm.opportunity_items` | trigger ปรับ `expected_amount` = ผลรวม items ทุกครั้ง · ผู้ใช้ตั้ง `expected_amount` เองไม่ได้ (คอลัมน์ระบบ) · ลบ item ได้เมื่อ opportunity ยังเปิด | ข้อ 6.10 · 9.4 กติกา 7 · `opportunity.update` ของแม่ | `02_schema_stage2.sql` · `rls_05_sales.sql` |
| **TC-F05-3** สร้างและส่งใบเสนอราคา | opportunity `INTERESTED` เปิดอยู่ | 1) สร้าง quotation (`DRAFT`) 2) กด "ส่ง" พร้อม `sent_channel_code='LINE'` | ขั้น 1: `quotation_no` `QT-…` · `customer_id` `branch_id` `owner_staff_id` คัดลอกจาก opportunity แม่เมื่อไม่ส่งมา · ขั้น 2: `status='SENT'` · trigger ตั้ง `sent_at = now()` และ `valid_until = วันที่ส่ง (Asia/Bangkok) + quotation.valid_days (7)` **[รอยืนยัน]** · สร้าง interaction `QUOTATION_SENT` `OUTBOUND` ช่องทาง = `sent_channel_code` · `app.trg_quotation_sent_stage` เลื่อน opportunity `INTERESTED`/`FOLLOW_UP` → `QUOTATION` · OUTBOUND นี้ทำให้ lead `NEW` ของลูกค้าเป็น `CONTACTED` | ข้อ 4.4 · 4.6 · 19.1 ข้อ 6 · 19.3 ข้อ 5 · `quotation.create`/`quotation.update` (ST O · SV T · BM B) | `02_schema_stage2.sql` · `rls_05_sales.sql` |
| **TC-F05-4** ใบเสนอราคาหลังส่งแก้ได้เฉพาะ `status` | quotation `SENT` | 1) พยายามแก้ `total_amount` 2) พยายามแก้ `quotation_items` 3) พยายามตั้ง `sent_at`/`valid_until` เอง 4) เปลี่ยนเป็น `ACCEPTED` | 1–3 **ปฏิเสธ** · 4 สำเร็จ และ **ไม่ปิด opportunity เป็น WON อัตโนมัติ** · `REJECTED` เช่นกัน | ข้อ 4.6 · 9.4.2 · 19.2 ข้อ 4 | `rls_07_transition.sql` |
| **TC-F05-5** กติกาการเลื่อนขั้นด้วยมือ | opportunity ในแต่ละขั้น | ทดสอบทุกทิศ: 1) `QUOTATION → FOLLOW_UP` 2) `INTERESTED → QUOTATION` เมื่อ **ยังไม่มี** ใบที่ `sent_at IS NOT NULL` 3) เหมือนข้อ 2 แต่มีใบที่ส่งแล้ว 4) `FOLLOW_UP → QUOTATION` ด้วยมือ 5) ขั้นใดก็ได้ → `INTERESTED` | 1 สำเร็จเสมอ · 2 **ปฏิเสธ** + toast "ยังไม่มีใบเสนอราคาที่ส่งแล้ว" · 3 สำเร็จ · 4 **ปฏิเสธ** (เกิดอัตโนมัติเมื่อมีใบใหม่ `SENT` เท่านั้น) · 5 **ปฏิเสธ — ห้ามย้อนเป็นสนใจ** (D48) · ฐานข้อมูลบังคับใน `app.enforce_row_transition` แม้ UPDATE ตรงทาง PostgREST | ข้อ 4.4 · 14.9 · D48 · `opportunity.update` | `rls_07_transition.sql` (`OP-1`…`OP-6`) |
| **TC-F05-6** ปิดการขาย (WON) | opportunity เปิดอยู่ · ผู้กระทำมี `opportunity.close` | 1) ปิดด้วย `won_amount = 28900` · `won_at` · `closed_at = won_at` 2) ทดสอบ `won_amount = 0` 3) ทดสอบ `closed_at ≠ won_at` | 1 สำเร็จ: `stage='WON'` · task next action → `CANCELLED` · lifecycle → `CUSTOMER` หรือ `REPEAT` · audit `OPPORTUNITY_WON` · `opportunity_stage_history` · 2–3 **ปฏิเสธ** (CHECK ข้อ 4.4) · รายการที่ปิดแล้วอ่านอย่างเดียวจนกว่าจะ reopen | ข้อ 4.4 · 19.2 ข้อ 3 · `opportunity.close` (ST O · SV T · BM B · BA G) | `rls_07_transition.sql` |
| **TC-F05-7** ผูกเลขธุรกรรม | opportunity `WON` | 1) INSERT `crm.transaction_refs` (`source_system_code='MANUAL'`) 2) INSERT ซ้ำด้วย (`source_system_code`, `external_no`) เดิม 3) พยายาม UPDATE/DELETE แถวเดิม | 1 สำเร็จ: ref ที่ผูก opportunity WON นับเป็นการซื้อ **ครั้งเดียวกัน** กับ opportunity · `customer_branches.linked_via='MANUAL_LINK'` เมื่อเป็นสาขาใหม่ · 2 **ปฏิเสธ** (UNIQUE) · 3 **ปฏิเสธ — INSERT ได้อย่างเดียว** (แก้ที่ผูกผิดด้วยสคริปต์ BA · **[รอยืนยัน Q29]**) · ยังไม่ผูกเมื่อ `won_at` เกิน 3 วัน → issue `WON_WITHOUT_TRANSACTION` | ข้อ 3.1 · 12.3 · 19.2 ข้อ 6 · `transaction.link` (scope O ประเมินจาก `created_by`) | `rls_05_sales.sql` · `02_schema_stage2.sql` |
| **TC-F05-8** ปิดไม่สำเร็จ และเปิดใหม่ | opportunity เปิดอยู่ | 1) `stage='LOST'` + `lost_reason_code` + `closed_at` 2) คุณขวัญ/คุณนัทพยายาม reopen 3) คุณเจ reopen | 1 สำเร็จ · task next action → `CANCELLED` · `opportunity_stage_history` มี `reason` = `lost_reason_code` เมื่อไม่ส่ง `app.status_reason` · 2 **ปฏิเสธ** · 3 สำเร็จ → `FOLLOW_UP` และล้าง `won_at` `won_amount` `closed_at` `lost_reason_code` + task next action ใหม่ | ข้อ 4.4 · 8.1 · `opportunity.close` / `opportunity.reopen` (BM B · BA G) | `rls_07_transition.sql` |
| **TC-F05-9** ใบเสนอราคาหมดอายุ | `QT-2026-001702` `SENT` · `valid_until` 8 ก.ย. 2569 | 1) เรียก `app.job_expire_quotations('2026-09-09 00:10+07')` | ใบ → `EXPIRED` · **opportunity ไม่เปลี่ยนขั้น** (นิยามขั้น `QUOTATION` = มีใบ `SENT` แล้วอย่างน้อย 1 ใบ ไม่ว่าจะหมดอายุหรือไม่) · ใบที่ไม่ใช่ `SENT` ไม่ถูกแตะ · รันซ้ำได้ (idempotent) | ข้อ 4.4 · 4.6 · 9.6 | `jobs_01.sql` (`M`) |

### 3.6 F06 — Next action · task ซิงก์ · งานของวันนี้

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F06-1** trigger ซิงก์ next action → task | lead/opportunity เปิดอยู่ | 1) ตั้ง `next_action` · `next_action_type_code` · `next_action_at` 2) แก้ `next_action_at` 3) เปลี่ยน owner ผ่าน `api.assign_owner` | มี task `is_next_action = true` **หนึ่งใบต่อรายการ** (unique partial index) · `title` = `next_action` · `task_type_code` = `next_action_type_code` · `due_at` = `next_action_at` · `remind_at = due_at − 15 นาที` (`sla.followup_remind_min`) และเลื่อนตาม `due_at` ถ้าไม่ได้แก้เอง · `owner_staff_id` `priority_code` `team_id` `branch_id` `customer_id` ตามแม่ · ช่องว่างขณะรายการเปิด → CHECK **ปฏิเสธ** | ข้อ 4.4 · 4.7 · 11.2 | `02_schema_stage2.sql` |
| **TC-F06-2** ห้ามแก้ task next action ตรง | task `is_next_action = true` | 1) พยายามแก้ `owner_staff_id` 2) `branch_id` 3) `due_at` 4) `task_type_code` | ทุกข้อ **ปฏิเสธ** — ต้องแก้ที่ next action ของแม่ หรือ `api.assign_owner` ของแม่ | ข้อ 19.2 ข้อ 3 | `rls_07_transition.sql` (`TK-`) |
| **TC-F06-3** กลุ่ม "วันนี้" และ "เกินกำหนด" | งานของคุณขวัญตามข้อ 13.10 (ทั้งหมด 12 = วันนี้ 8 + เกินกำหนด 4) ณ 11 ก.ย. 10:24 | 1) เปิดหน้า 08 ในฐานะคุณขวัญ | **วันนี้ 8** = `OPEN`/`IN_PROGRESS` และ `due_at` อยู่ในวันนี้ (งาน #5 due 10:00 อยู่กลุ่มนี้พร้อมป้าย "เลยเวลา") · **เกินกำหนด 4** = `due_at` ก่อน 00:00 ของวันนี้ (#1–#4 due 10 ก.ย.) · สองกลุ่ม**ไม่ทับกัน** · งานของคุณสมชาย (18 ก.ย.) ไม่อยู่ในรายการ · วันตาม Asia/Bangkok เทียบ `app.clock()` | ข้อ 4.7 · 12.1 · 13.10 · D20 · `task.read` (**ไม่มี read-through ผ่านลูกค้า**) | `acceptance.sql` (`J`) · `analytics_01_kpis.sql` |
| **TC-F06-4** ปิด task next action ขณะรายการยังเปิด | task `is_next_action` ของ opportunity ที่ยังเปิด | 1) ตั้ง `status='DONE'` | สำเร็จ · `completed_at` ถูกตั้งโดย `app.trg_row_defaults` · **UI บังคับ dialog ตั้ง next action ใหม่ก่อนออกจากหน้า** · เมื่อตั้งใหม่ trigger สร้าง task ใบใหม่ · task `DONE`/`CANCELLED` แก้ต่อไม่ได้ · `has_open_followup` ของลูกค้าปรับโดย `app.trg_touch_customer_activity` | ข้อ 4.4 · 19.2 ข้อ 3 · `task.update` | `rls_07_transition.sql` · `02_schema_stage2.sql` |
| **TC-F06-5** สร้างงานเอง (ไม่ใช่ next action) | ลูกค้า/opportunity ที่อ่านได้ | 1) INSERT `crm.tasks` โดยไม่ส่ง `due_at` 2) INSERT พร้อม `due_at` 3) INSERT พร้อม owner คนอื่น | 1 **ปฏิเสธ** (`due_at` NOT NULL) · 2 สำเร็จ: `OPEN` · `is_next_action = false` · `remind_at = due_at − 15 นาที` · `customer_id` เติมจาก lead/opportunity เมื่อว่าง · 3 ต้องมี `task.assign` บนแถวใหม่ → แจ้ง `TASK_ASSIGNED` (ไม่ส่งสำหรับ task `is_next_action`) | ข้อ 4.7 · 8.0 · 11.1 · 19.1 ข้อ 6 · `task.create` (ST O · SV T · BM B · BA G) | `rls_06_work.sql` · `jobs_01.sql` |
| **TC-F06-6** "นัดติดตามถัดไป" บน Customer 360 | คุณสมชายมี `OP-2026-002998` (next action 18 ก.ย. 10:00) และ `LD-2026-007460` (20 ก.ย. 11:00) | 1) เปิดหน้า 05 ของคุณสมชาย | แสดง **18 ก.ย. 2569 10:00 · โทรติดตามเรื่องผ่อน · คุณขวัญ** (next action ที่ใกล้ที่สุดจาก lead/opportunity ที่เปิด) · **อ่านจาก lead/opportunity ไม่ใช่จาก `tasks`** เพราะ tasks ไม่มี read-through · ป้าย "ติดตามอยู่" อ่านจาก `customers.has_open_followup` จึงเห็นเหมือนกันทุกผู้ดู | ข้อ 3.5 · 6.3 · 6.8 · 9.4 · 13.7 | `acceptance.sql` (`G`) |

### 3.7 F07 — เปลี่ยนผู้รับผิดชอบ / ย้ายสาขา

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F07-1** เปลี่ยน owner ของ lead | `LD-2026-007512` ของคุณวิไลวรรณ `CUS-2026-006790` · owner = คุณขวัญ · ผู้กระทำ = คุณเจ (BM@JP1) | 1) เรียก `api.assign_owner('LEAD', id, <คุณคิม ST-0046>, 'SHIFT_CHANGE', 'เปลี่ยนกะ', NULL)` | `owner_staff_id` = คุณคิม · `team_id` = ทีมปัจจุบันของคุณคิม · แถว `crm.ownership_changes` (`from_staff_id` · `to_staff_id` · `reason_code='SHIFT_CHANGE'` · `note` · `changed_by` · `changed_at`) · audit `LEAD_ASSIGNED` · แจ้ง `LEAD_ASSIGNED` ถึงคุณคิม · task next action เปลี่ยน owner ตาม · lead นับเป็นของคุณคิมในผลงานรายพนักงาน (owner ปัจจุบัน) | ข้อ 9.4.2 · 12.4 · 13.14 · `lead.assign` (SV T · BM B · BA G) | `api_02_work.sql` · `acceptance.sql` (`M`) |
| **TC-F07-2** UPDATE owner ตรงถูกปฏิเสธ | เหมือน TC-F07-1 | 1) `UPDATE crm.leads SET owner_staff_id = …` ผ่าน PostgREST 2) เช่นเดียวกันกับ `team_id` และ `branch_id` | **ปฏิเสธ** ทุกกรณี เพราะคอลัมน์เหล่านี้ไม่อยู่ใน column grant ของ UPDATE (ยกเว้นการรับคิวของ visit) · ต้องผ่าน `api.assign_owner` เท่านั้นเพื่อให้ส่งเหตุผลได้ | ข้อ 9.4.2 · 19.2 | `rls_09_links_and_writes.sql` (`Y01`–`Y07`) |
| **TC-F07-3** ข้อจำกัดของ SUPERVISOR | คุณนัท (SV@JP1 · หัวหน้า `JP1-SALES`) | 1) มอบ lead ให้คุณคิม (สมาชิกทีม) 2) มอบ lead ให้พนักงานที่ไม่ใช่สมาชิกทีม 3) มอบ lead ที่ owner ว่างในสาขาที่ตนเป็นหัวหน้าทีม | 1 สำเร็จ · 2 **ปฏิเสธ** (ต้องมี `lead.assign` บนแถว**หลัง**เปลี่ยนด้วย · scope T ครอบเฉพาะสมาชิกทีม) · 3 สำเร็จ (scope T รวมรายการที่ owner ว่าง · Q28) · owner ใหม่ต้องมี assignment ในสาขาของแถว (`app.staff_has_branch_assignment`) มิฉะนั้น **ปฏิเสธ** | ข้อ 8.0 · 9.4.2 · Q28 | `rls_09_links_and_writes.sql` · `api_02_work.sql` |
| **TC-F07-4** ย้ายสาขา | lead ที่ JPON · ผู้กระทำมี `lead.assign` ทั้ง JPON และ JP1 | 1) `api.assign_owner(…, 'BRANCH_TRANSFER', note, <JP1>)` 2) ทดสอบด้วยผู้ที่มีสิทธิ์สาขาเดียว | 1 สำเร็จ: `branch_id` ใหม่ · `ownership_changes` เหตุผล `BRANCH_TRANSFER` · task next action ย้ายตามแม่ · KPI รายสาขาใช้ `branch_id` **ปัจจุบัน** · 2 **ปฏิเสธ** · `p_reason_code` ที่ไม่อยู่ใน `ref.ownership_change_reasons` → **ปฏิเสธ** | ข้อ 9.4.2 · 12.4 · 5.8 | `api_02_work.sql` |
| **TC-F07-5** สิ่งที่เปลี่ยน owner/สาขาไม่ได้ | interaction · quotation · visit | 1) พยายามเปลี่ยน owner ของ interaction 2) owner ของ quotation 3) `branch_id` ของ visit 4) `branch_id` ของ interaction | ทุกข้อ **ปฏิเสธ** (เปลี่ยนไม่ได้) | ข้อ 9.4.2 · 19.2 ข้อ 2 | `rls_07_transition.sql` · `rls_09_links_and_writes.sql` |

### 3.8 F08 — เชิญพนักงาน → เปิดใช้งาน (MFA) → ปิดใช้งาน

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F08-1** รายการบทบาทที่เชิญได้ | คุณเจ (BM@JP1) เปิดหน้า 13 | 1) กด "เพิ่มผู้ใช้งาน" | เห็นเฉพาะ `STAFF` และ `SUPERVISOR` · **ไม่มีตัวเลือกสาขา** (ล็อกเป็น JP1) · `api.can_assign_role` คืน false สำหรับบทบาทอื่น · คุณแพร (BA) เห็น `STAFF` `SUPERVISOR` `BRANCH_MANAGER` `MARKETING` `OPERATIONS` ทุกสาขา · คุณต้น (SA) เชิญได้เฉพาะบัญชีสาย SYSTEM_ADMIN | ข้อ 7.2 · 7.3 · `user.invite` · `role.assign` 🔐 | `api_03_admin.sql` |
| **TC-F08-2** เชิญพนักงาน (Edge Function) | เหมือน TC-F08-1 | 1) กรอกชื่อ · ชื่อเล่น · อีเมล · เบอร์ · `employee_code` 2) ส่ง | `invite-staff` verify JWT → เรียก `api.can_assign_role` **ด้วย JWT ของผู้เรียก** → `api.svc_prepare_invite` (service_role) สร้าง `core.staff_invitations` + `core.staff_profiles` (`INVITED` · `invite_expires_at = +24 ชม.` · `staff_code` `ST-{NNNN}` จากตัวนับ `ST`) + assignment ที่เลือก (มีผลเมื่อ ACTIVE) **ก่อน** เรียก `auth.admin.generateLink`/`inviteUserByEmail` · audit `STAFF_INVITED` · `ROLE_GRANTED` โดย actor จาก JWT · **ไม่รับ actor/staff_id จาก body** · อีเมลคำเชิญ**ไม่มีข้อมูลลูกค้า** | ข้อ 7.3 · 9.8 · 19.3 ข้อ 6 | `api_03_admin.sql` (`api.svc_prepare_invite`) · ส่วน HTTP ต้องทำที่ **T7** |
| **TC-F08-3** กรณีปฏิเสธของการเชิญ | — | 1) `employee_code` ซ้ำกับบัญชีที่ไม่ใช่ `DISABLED` 2) เชิญบัญชีที่จะถือ SYSTEM_ADMIN ร่วมกับบทบาทธุรกิจ 3) บัญชีที่ SA เชิญขอรับบทบาทธุรกิจโดยยังไม่มี `identity_verified_by` | ทุกข้อ **ปฏิเสธ**: 1 `staff_profiles_employee_code_open_uidx` **[รอยืนยัน Q1]** · 2 `app.trg_check_role_exclusivity` (ทำ `SELECT … FOR UPDATE` แถว `core.staff_profiles` ก่อน) · 3 ต้องให้ BUSINESS_ADMIN ยืนยันตัวตนกับ HR ก่อน | ข้อ 7.1 · 7.2 | `02_schema_stage2.sql` · `api_03_admin.sql` |
| **TC-F08-4** เปิดใช้งานด้วยตนเอง | บัญชี `INVITED` ที่ยืนยันอีเมลแล้ว | 1) ตั้งรหัสผ่าน (< 12 ตัวอักษร) 2) ตั้งรหัสผ่าน ≥ 12 ตัวอักษร 3) ลงทะเบียน TOTP เมื่อมีบทบาท `requires_mfa` 4) เรียก `api.activate_self()` 5) ทดสอบเมื่อคำเชิญหมดอายุ | 1 **ปฏิเสธ** (≥ 12 ตัวอักษร + leaked password protection) · 4 สำเร็จเมื่อ `email_confirmed_at` มีค่า · คำเชิญยังไม่หมดอายุ (เทียบ `now()`) · และมี verified factor เมื่อบทบาทบังคับ → `ACTIVE` + `staff_invitations.accepted_at` · 5 **ปฏิเสธ** ต้องเชิญใหม่ · อีเมลที่ไม่มีคำเชิญถูก Before User Created hook ปฏิเสธ | ข้อ 7.3 · 9.2 · 19.3 ข้อ 6 | `api_03_admin.sql` · hook/MFA ต้องทำที่ **T7** |
| **TC-F08-5** ปิดใช้งานและการโอนงาน | พนักงานที่มี opportunity เปิดอยู่ · สาขามีผู้จัดการ | 1) คุณเจเรียก `api.disable_staff` | `status='DISABLED'` (**ห้ามลบแถว**) · ban ใน Supabase Auth + เพิกถอน session · `valid_to = now()` ทุก assignment · **opportunity ที่เปิด → owner = ผู้จัดการสาขาของรายการ** (หลายคน → `staff_code` น้อยสุด **[รอยืนยัน]**) · **lead/task ที่เปิด → owner ว่าง** + แจ้ง `LEAD_UNASSIGNED` **[รอยืนยัน]** · `ownership_changes` เหตุผล `STAFF_LEFT` · audit `STAFF_DISABLED` · `ROLE_REVOKED` · ประวัติ audit ของพนักงานยังอยู่ครบ | ข้อ 7.3 ข้อ 4 · `user.disable` 🔐 | `api_03_admin.sql` |
| **TC-F08-6** กรณีปฏิเสธของการปิดใช้งาน | — | 1) ปิดใช้งานตนเอง 2) ปิด EXECUTIVE หรือ BUSINESS_ADMIN ที่ `ACTIVE` คนสุดท้าย 3) ปิดบัญชีที่มี opportunity เปิดในสาขาที่**ไม่มีผู้จัดการ** 4) คุณเจปิดบัญชีที่มี assignment นอก JP1 | ทุกข้อ **ปฏิเสธ** · ข้อ 3 ต้องโอนงานด้วย `api.assign_owner` ก่อน · ข้อ 4: BM ปิดได้เฉพาะบัญชีที่ assignment ที่ยังมีผล **ทุกแถว** เป็น STAFF/SUPERVISOR ในสาขาตน (กรณีอื่นถอนได้เฉพาะ assignment ในสาขาตน) · BM แก้อีเมลไม่ได้ | ข้อ 7.3 ข้อ 4–5 | `api_03_admin.sql` |
| **TC-F08-7** จัดทีม | คุณเจ (BM@JP1) | 1) `api.save_team` สร้างทีมที่ JP1 2) `api.set_team_member` เพิ่มสมาชิกที่มี assignment ที่ JP1 3) เพิ่มสมาชิกที่ไม่มี assignment ในสาขาของทีม | 1–2 สำเร็จ (`is_leader` · `valid_from` · `valid_to`) · 3 **ปฏิเสธ** · SUPERVISOR ที่ไม่เป็น `is_leader` ของทีมใดในสาขา **ไม่ได้สิทธิ์ SUPERVISOR** ที่สาขานั้น | ข้อ 7.1 · `team.manage` (BM B · BA G) | `api_03_admin.sql` · `rls_02_helpers.sql` |
| **TC-F08-8** เปลี่ยนอีเมล / รีเซ็ต MFA | — | 1) BA รีเซ็ต MFA ของบัญชี STAFF และบัญชี ≥ SUPERVISOR 2) BA รีเซ็ต MFA ของบัญชี BA/EX/SA 3) EX รีเซ็ต MFA ของบัญชี BA/EX/SA | 1 สำเร็จ (ผู้กระทำต้อง aal2) · 2 **ปฏิเสธ** · 3 สำเร็จ · ทุกครั้งแจ้งอีเมลเดิมและบันทึก `MFA_RESET` · ผ่าน Edge Function `reset-mfa` → `api.svc_reset_mfa_authorize` | ข้อ 7.3 ข้อ 6 | `api_03_admin.sql` · ส่วน EF ต้องทำที่ **T7** |

### 3.9 F09 — คำขอมอบบทบาทสูง

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F09-1** ยื่นคำขอ | คุณต้น (SA · aal2) · คุณโอ๊ต `ST-0051` `INVITED` | 1) `api.request_role_grant` ชนิด `GRANT` บทบาท `SYSTEM_ADMIN` ให้คุณโอ๊ต + เหตุผล | `core.role_grant_requests` `status='REQUESTED'` · เลข `RG-2026-0003` · audit `ROLE_GRANT_REQUESTED` · แจ้ง `ROLE_GRANT_APPROVAL_REQUIRED` ถึง **EXECUTIVE ทุกคนยกเว้นผู้รับ** (in-app + email ที่มีเฉพาะป้าย + เลขอ้างอิง + deep link) | ข้อ 7.2 · 11.1 · 13.14 · `role.request` S (SA `requires_mfa` → aal2) | `api_03_admin.sql` · `acceptance.sql` (`M`) |
| **TC-F09-2** กรณีปฏิเสธของการยื่น | — | 1) ผู้รับเป็นตนเอง 2) มีคำขอ `REQUESTED` ของ (ผู้รับ, บทบาท) อยู่แล้ว 3) ผู้รับ `DISABLED` กับชนิด `GRANT` 4) ขอบทบาทนอก `SYSTEM_ADMIN`/`EXECUTIVE`/`BUSINESS_ADMIN` | ทุกข้อ **ปฏิเสธ** (`role_grant_requests_requester_chk` · `role_grant_requests_open_uidx` · ข้อ 7.2) · ข้อ 4 ต้องใช้ `api.assign_role`/`api.revoke_role` โดย BM/BA แทน | ข้อ 7.2 · 4.8 | `api_03_admin.sql` |
| **TC-F09-3** อนุมัติ | จ๋าอั๋น (EX) · คำขอ `RG-2026-0003` | 1) เข้าสู่ระบบที่ **aal1** แล้วกดอนุมัติ 2) ยืนยัน MFA จน aal2 แล้วกดอนุมัติ | 1 **ปฏิเสธ** (ที่ aal1 assignment ของบทบาท `requires_mfa` ไม่ถูกนับ → ได้สิทธิ์เท่ากับไม่มีบทบาท) · 2 สำเร็จ: `APPROVED` · ชนิด `GRANT` สร้าง assignment ใหม่ (`granted_by` · `grant_reason`) · `decided_by` `decided_at` `decision_note` · audit `ROLE_GRANT_DECIDED` + `ROLE_GRANTED` · แจ้ง `ROLE_GRANT_DECIDED` ถึงผู้ยื่น (in-app + email) | ข้อ 8.0 · 11.1 · 13.13 · `role.decide` G 🔐 | `api_03_admin.sql` · `rls_personas.sql` |
| **TC-F09-4** กรณีปฏิเสธของการตัดสิน | — | 1) ผู้อนุมัติ = ผู้ยื่น 2) ผู้อนุมัติ = ผู้รับ 3) ผู้อนุมัติเป็นบัญชีที่ `employee_code` เดียวกับผู้รับ 4) ผู้รับมีบทบาทธุรกิจอยู่แล้วแต่ขอ `SYSTEM_ADMIN` 5) `REVOKE` ที่ทำให้ไม่เหลือ EX/BA ที่ ACTIVE | ทุกข้อ **ปฏิเสธ** (`role_grant_requests_decider_chk` + การตรวจใน RPC · `app.trg_check_role_exclusivity`) · **ลบคำขอไม่ได้** ทุกกรณี | ข้อ 7.2 · U2 | `api_03_admin.sql` |
| **TC-F09-5** ถอนบทบาทที่มอบตรงได้ | คุณเจ (BM@JP1) · คุณแพร (BA) | 1) คุณเจถอน `STAFF`@JP1 ของพนักงาน 2) คุณเจถอน `BRANCH_MANAGER` 3) ถอนบทบาทของตนเอง 4) ถอน `EXECUTIVE`/`BUSINESS_ADMIN`/`SYSTEM_ADMIN` ตรง | 1 สำเร็จ: ตั้ง `valid_to` · `revoked_by` · `revoke_reason` (แถว assignment แก้ได้เฉพาะสามคอลัมน์นี้) · audit `ROLE_REVOKED` · 2–4 **ปฏิเสธ** · ข้อ 4 ต้องใช้คำขอ RG ชนิด `REVOKE` · การแก้ `core.role_permissions` ทำผ่าน migration เท่านั้น (trigger บันทึก `PERMISSION_CHANGED`) | ข้อ 7.1 · 7.2 · `role.assign` 🔐 | `api_03_admin.sql` · `rls_08_core_ref_app_audit.sql` |

### 3.10 F10 — รวมลูกค้าและตัดสินข้อมูลซ้ำ

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F10-1** เห็นคู่ซ้ำเฉพาะที่มองเห็นทั้งสองราย | คู่แรกของหน้า 12: `CUS-2026-006633` คุณณัฐพล สุขใจ ↔ `CUS-2026-002118` คุณณัฐพร สุขใจ (สาขาแรก JP1 · ผู้ดูแลคุณคิม · คะแนน 100 "เบอร์โทรตรงกัน" · `PENDING`) | 1) เปิดหน้า 12 ด้วยคุณเจ 2) ด้วยคุณบอส (BM@JP2) | คุณเจเห็น · คุณบอส **ไม่เห็น** · ต้องมี `data_quality.view` บน **ลูกค้าทั้งสองราย** · ค่าติดต่อแสดงแบบปิดบัง | ข้อ 8.3 · 12.3 · 13.14 · `data_quality.view` | `rls_03_customer.sql` · `acceptance.sql` (`L`·`M`) |
| **TC-F10-2** ผู้สร้างแถวตัดสินเองไม่ได้ | คุณคิมเป็นผู้สร้าง `CUS-2026-006633` | 1) คุณคิมพยายาม `api.decide_duplicate` 2) คุณคิมพยายาม `api.merge_customers` | **ปฏิเสธทั้งสองกรณี** ด้วยสองเหตุผล: คุณคิม (STAFF) ไม่มี `customer.merge` **และ** ผู้ตัดสินต้อง ≠ `created_by` ของแถว | ข้อ 6.7 · 12.3 · `customer.merge` 🔐 | `api_01_customer.sql` |
| **TC-F10-3** ใครตัดสินได้ | เหมือน TC-F10-1 | 1) คุณนัท (SV@JP1 · aal2) 2) คุณเจ (BM@JP1 · aal2) 3) คุณแพร (BA · aal2) 4) คุณนัทที่ **aal1** | 1–3 สำเร็จ: คุณนัทได้เพราะผู้ดูแลคือคุณคิมซึ่งเป็นสมาชิก `JP1-SALES` ที่คุณนัทเป็นหัวหน้า (scope T) · คุณเจเพราะลูกค้าทั้งสองเชื่อมกับ JP1 (scope B) · คุณแพร scope G · 4 **ปฏิเสธ** (สิทธิ์ 🔐 ต้อง aal2) | ข้อ 8.0 · 8.1 · 13.13 | `rls_03_customer.sql` · `rls_09_links_and_writes.sql` (`Q`) |
| **TC-F10-4** ยืนยัน "คนละคน" | แถว `PENDING` | 1) `api.decide_duplicate(p_decision_id, 'NOT_DUPLICATE', p_note)` | สถานะ → `NOT_DUPLICATE` · `decided_by` · `decided_at` · `decision_note` · `DUPLICATE_RATE` ลดลง (นับเฉพาะ `PENDING` ที่ลูกค้าทั้งสองรายยัง `ACTIVE`) | ข้อ 6.7 · 12.3 | `api_01_customer.sql` |
| **TC-F10-5** รวมลูกค้า | เลือก survivor และค่าที่จะเก็บต่อช่อง | 1) `api.merge_customers(p_survivor_id, p_merged_id, p_field_choices, p_reason, p_duplicate_decision_id)` | ทรานแซกชันเดียวตั้ง `app.bulk = on`: ย้าย `customer_contacts` (คู่ `(contact_type, value_normalized)` ซ้ำ เก็บแถว verified ก่อน) · `visits` `interactions` `leads` `opportunities` `quotations` `tasks` `transaction_refs` `customer_notes` `customer_consents` · `customer_tags` (`ON CONFLICT DO NOTHING`) · `customer_branches` (upsert: least `first_linked_at` · greatest `last_activity_at`) · survivor ได้ `first_seen_at` = least ของทั้งสอง และ `first_channel_code`/`first_source_code`/`first_branch_id` **จากรายที่ `first_seen_at` เก่ากว่า (ไม่ใช้ `p_field_choices`)** · ผู้ถูกรวม `record_status='MERGED'` + `merged_into_id` · แถว `crm.customer_merges` เลข `MG-…` + snapshot **ปิดบัง PII** + จำนวนแถวที่ย้ายแยกตาราง · refresh lifecycle **ครั้งเดียว** ท้ายงาน · audit `CUSTOMER_MERGED` · `duplicate_decisions` → `MERGED` | ข้อ 6.7 · 19.1 ข้อ 11 | `api_01_customer.sql` |
| **TC-F10-6** กรณีปฏิเสธของการรวม | — | 1) aal1 2) รายใดรายหนึ่งอยู่นอก scope 3) รายใดเป็น `MERGED` หรือ `ANONYMIZED` 4) merge จากเมนู ⋮ บน Customer 360 โดยไม่มีแถวตัดสิน | 1–3 **ปฏิเสธ** · 4 สำเร็จ โดยส่ง `p_duplicate_decision_id` = NULL และ**ไม่ใช้กติกา "ผู้ตัดสิน ≠ ผู้สร้างแถว"** · ลูกค้า `legal_hold` **[รอยืนยัน]** | ข้อ 6.7 · 19.3 ข้อ 7 | `api_01_customer.sql` |
| **TC-F10-7** เปิด `customer_no` ของผู้ถูกรวม | ลูกค้าที่ `record_status='MERGED'` | 1) เปิดหน้า 05 ด้วย `customer_no` เดิม | redirect ไป survivor · เขียน `CUSTOMER_VIEWED` ของ survivor · KPI นับลูกค้า `MERGED` ที่ survivor · **V1 ไม่มี unmerge อัตโนมัติ** | ข้อ 6.7 · 12.1 | `api_01_customer.sql` · `acceptance.sql` |

### 3.11 F11 — ส่งออกข้อมูลลูกค้า

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F11-1** ยื่นคำขอในบทบาท MARKETING | คุณมายด์ (MK · aal2) | 1) เลือกเหตุผล `MARKETING_CAMPAIGN` · ตัวกรอง · สาขา · บทบาทที่ยื่น 2) ส่ง | `audit.export_requests` `status='REQUESTED'` · เลข `EX-2026-000031` · บันทึกตัวกรองและขอบเขตสาขา + จำนวนแถว (1,850) · audit `EXPORT_REQUESTED` · แจ้ง `EXPORT_APPROVAL_REQUIRED` **เฉพาะผู้อนุมัติที่มีสิทธิ์ตามบทบาทที่ยื่น** = BUSINESS_ADMIN (คุณแพร) · เหตุผลที่ `is_marketing = true` → **กรองเฉพาะลูกค้าที่ยินยอม `MARKETING`** | ข้อ 8.2 · 11.1 · 13.14 · `customer.export` 🔐 | `api_03_admin.sql` · `acceptance.sql` (`M`) |
| **TC-F11-2** เพดานตามบทบาท | `app.settings['export.limits']` = `{ROLE: {max_rows, per_day, approver_role}}` | 1) BM ขอ 412 แถว 2) BM ขอ 501 แถว 3) BM ขอครั้งที่ 4 ของวัน 4) MK ขอ 5,001 แถว 5) EX ขอ | 1 → **`APPROVED` ทันที** `approved_by` NULL (BM ≤ 500 ไม่ต้องอนุมัติ) · 2 → **`REJECTED`** (เกินเพดาน) · 3 **ปฏิเสธ** (BM 3 ครั้ง/วัน · นับทุกคำขอในวันธุรกิจ Asia/Bangkok ต่อผู้ขอและ `requested_as_role` **รวมที่ถูกปฏิเสธ**) · 4 **ปฏิเสธ** (MK 5,000 แถว · 2 ครั้ง/วัน) · 5 ผู้อนุมัติ = BUSINESS_ADMIN **[รอยืนยัน Q23]** · `requested_as_role` นอก 4 บทบาท → **ปฏิเสธ** (`export_requests_role_chk`) | ข้อ 8.2 · 19.1 ข้อ 8 | `api_03_admin.sql` |
| **TC-F11-3** อนุมัติและสร้างไฟล์ | `EX-2026-000031` รออนุมัติ | 1) คุณแพร (BA · aal2) กดอนุมัติ 2) Edge Function `generate-export` ทำงาน 3) ทดสอบให้คุณมายด์อนุมัติคำขอของตนเอง | 1 → `APPROVED` · `decided_at` · `decision_note` · audit `EXPORT_DECIDED` · แจ้ง `EXPORT_DECIDED` ถึงผู้ขอ · 2 → `api.svc_build_export_dataset` **ตรวจซ้ำทุกเงื่อนไข** (สถานะ · ผู้ขอยัง `ACTIVE` และยังมี `customer.export` · ขอบเขตสาขาและตัวกรองที่บันทึกตอนยื่น · whitelist คอลัมน์ · กรองความยินยอมเมื่อ `is_marketing`) → `api.svc_mark_export_generated` → `GENERATED` + `file_path` + ลายน้ำ `ส่งออกโดย {staff_code} · {export_no} · {วันเวลา}` ในแถวหัวไฟล์**และชื่อไฟล์** · แจ้ง `EXPORT_READY` · 3 **ปฏิเสธ** (CHECK `approved_by <> requested_by`) | ข้อ 8.2 · 9.8 · `export.approve` 🔐 | `api_03_admin.sql` · ส่วน EF/Storage ต้องทำที่ **T7** |
| **TC-F11-4** ดาวน์โหลด | คำขอ `GENERATED` | 1) ผู้ขอกดดาวน์โหลด 2) ผู้อนุมัติกดดาวน์โหลด 3) ดาวน์โหลดครั้งที่ 4 4) ดาวน์โหลดหลัง 24 ชม. 5) ผู้ขอที่ aal1 | 1 สำเร็จ: `api.record_export_download` → `DOWNLOADED` · `download_count` + 1 · `last_downloaded_at` · audit `EXPORT_DOWNLOADED` → EF ออก **signed URL อายุ 60 วินาที** · 2–5 **ปฏิเสธ** (ผู้ขอเท่านั้น · `ACTIVE` · aal2 · สถานะ `GENERATED`/`DOWNLOADED` · < 3 ครั้ง · ภายใน 24 ชม. หลังสร้างไฟล์ — ตรวจเองใน RPC จึงไม่พึ่งเวลางาน) · bucket `exports` **ไม่มี storage policy ให้ `authenticated`** | ข้อ 8.2 · 9.8 · 11.2 (`export.max_downloads` 3 · `export.link_ttl_hours` 24) | `api_03_admin.sql` · Storage ต้องทำที่ **T7** |
| **TC-F11-5** หมดอายุ | `EX-2026-000030` ของคุณเจ สร้างไฟล์ 5 ก.ย. 2569 · ดาวน์โหลดแล้ว 1 ครั้ง | 1) เรียก `app.job_expire_exports(p_as_of)` หลัง 24 ชม. | `GENERATED`/`DOWNLOADED` ที่สร้างไฟล์เกิน 24 ชม. → `EXPIRED` · `expired_at` · **จำนวนครั้งดาวน์โหลดคงไว้** · ไฟล์ถูกลบโดย EF `cron-export-cleanup` ที่อ่าน `api.svc_expired_export_files()` **[รอยืนยัน]** · รันซ้ำได้ (idempotent) · metadata เก็บตามระยะของ audit | ข้อ 8.2 · 9.6 · 10.3 | `jobs_01.sql` (`N`) · `api_03_admin.sql` |
| **TC-F11-6** คอลัมน์ที่ได้ต่อบทบาท | คำขอที่ `GENERATED` ของแต่ละบทบาท | 1) ตรวจหัวคอลัมน์ของไฟล์ | BM: `customer_no` · `display_name` · `lifecycle_stage` · `first_channel_code` · `province_code` · `last_activity_at` · เบอร์**ปิดบัง** · MK: `customer_no` · `display_name` + PHONE เมื่อยินยอมช่องทาง `PHONE`/`SMS` · EMAIL เมื่อ `EMAIL` · LINE เมื่อ `LINE` · BA/EX: โปรไฟล์ + ช่องทางติดต่อ + tag + ความยินยอมปัจจุบัน · **ไม่มีบทบาทใดได้โน้ต สรุปการติดต่อ สรุปธุรกรรม หรือ IMEI** | ข้อ 8.2 | `api_03_admin.sql` |
| **TC-F11-7** ส่งออกรายงาน (ไม่ใช่ flow นี้) | คุณเจเปิดหน้า 09 | 1) กด "ส่งออก" | `api.record_report_export` เขียน audit `REPORT_EXPORTED` · ได้**ตัวเลขรวมไม่มี PII** · มีลายน้ำ · **ไม่ต้องอนุมัติ** และไม่นับในเพดานของข้อ 8.2 | ข้อ 9.6 · 14.8 · `report.export` | `analytics_02_reports.sql` |

### 3.12 F12 — คำขอเจ้าของข้อมูล (DSR) → ทำนิรนาม

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F12-1** รับคำขอที่หน้าร้าน | คุณขวัญเปิดเมนู ⋮ บนหน้า 05 | 1) `api.create_dsr` ประเภท `DELETION` · ชื่อผู้ยื่น · ช่องทางติดต่อ (เก็บแบบปิดบัง) · ลูกค้า (ระบุได้) | `crm.data_subject_requests` `status='RECEIVED'` · `request_no` `DSR-{YYYY}-{NNNNNN}` · `received_at` · `received_by` · `due_at = received_at + 30 วัน` (คอลัมน์ generated) · `customer_id` ว่างได้ · audit `DSR_CREATED` · **ไม่มีแจ้งเตือนเมื่อสร้าง** (U3) · ผู้รับคำขอเห็นเฉพาะของตน · **ห้ามแนบ/เก็บสำเนาบัตร** | ข้อ 10.4 · `dsr.create` (ST B · SV B · BM B · BA G) | `api_03_admin.sql` · `01_schema_stage1.sql` |
| **TC-F12-2** ยืนยันตัวตน | คำขอ `RECEIVED` | 1) คุณแพร (BA · aal2) `api.update_dsr(id, 'VERIFIED', {verification_method: 'IN_PERSON_ID_SIGHTED'})` 2) พยายามข้ามไป `COMPLETED` โดยไม่มี `verified_by` | 1 สำเร็จ: `VERIFIED` · `verified_by` = ตน · 2 **ปฏิเสธ** (`data_subject_requests_verified_chk` บังคับ `verified_by` + `verification_method` เมื่อ `VERIFIED`/`IN_PROGRESS`/`COMPLETED`) · `verification_method` ∈ `IN_PERSON_ID_SIGHTED` · `OTP_TO_REGISTERED_CONTACT` · `OTHER` (กลไกส่ง OTP **[รอยืนยัน]**) | ข้อ 4.8 · 10.4 · `dsr.manage` 🔐 | `api_03_admin.sql` |
| **TC-F12-3** `ACCESS`/`PORTABILITY` | คำขอ `IN_PROGRESS` ประเภท `ACCESS` | 1) `api.build_dsr_package(dsr_id)` | ไฟล์ JSON/CSV ของ**ลูกค้ารายเดียว** ใน bucket `exports` อายุ 24 ชม. · **ไม่ผ่านเพดาน export ของข้อ 8.2** · **ไม่แนบอีเมล** · วิธีส่งมอบให้เจ้าของข้อมูล **[รอยืนยัน DPO]** | ข้อ 10.4 · 19.4 ข้อ 5 · `dsr.manage` 🔐 | `api_03_admin.sql` |
| **TC-F12-4** `WITHDRAW_CONSENT`/`OBJECTION` | ลูกค้าที่เคยยินยอม `MARKETING` | 1) `api.record_consent` แถวใหม่ `WITHDRAWN` 2) พยายาม UPDATE/DELETE แถว consent เดิม | 1 สำเร็จ: view `crm.customer_consent_current` แสดงสถานะปัจจุบัน = `WITHDRAWN` · ตัดออกจาก export ที่ยังไม่สร้างไฟล์ · 2 **ปฏิเสธ** — `crm.customer_consents` เป็น **append-only** ไม่มี UPDATE/DELETE และไม่มีคอลัมน์ `withdrawn_at` | ข้อ 10.2 · 10.4 · `customer.consent.manage` | `api_01_customer.sql` · `rls_03_customer.sql` |
| **TC-F12-5** `DELETION` → ทำนิรนาม (สองคน) | DSR `VERIFIED` ที่ `verified_by` = BA คนที่ 1 · ระบบมี BA ที่ ACTIVE ≥ 2 คน | 1) BA คนที่ 1 เรียก `api.anonymize_customer` 2) BA คนที่ 2 เรียก | 1 **ปฏิเสธ** (`verified_by` ต้อง ≠ ผู้ดำเนินการ) · 2 สำเร็จ: `first_name = 'ลูกค้านิรนาม ' \|\| customer_no` · `last_name` `nickname` `province_code` = NULL · ลบ contacts/addresses · ล้างคอลัมน์ที่ COMMENT ขึ้นต้น `[pii]` ทุกตารางที่อ้างลูกค้า (โน้ต · `summary` · `title` · `next_action` · `lost_note` · `transaction_refs.summary` `device_imei` `device_serial` · `notifications.title/body` · snapshot ของ merge · `duplicate_decisions.override_note` · `customer_consents.evidence`) · ตั้ง `app.audit_redaction = 'on'` แล้วแทน**เฉพาะคีย์ PII** ใน `audit.audit_logs.before/after` เป็น `"[ANONYMIZED]"` · `record_status='ANONYMIZED'` · audit `CUSTOMER_ANONYMIZED` | ข้อ 10.4 · 19.1 ข้อ 3 · 19.4 ข้อ 2 · Q26 · `customer.anonymize` 🔐 (BA G) | `api_03_admin.sql` |
| **TC-F12-6** ผลข้างเคียงของการทำนิรนาม | หลัง TC-F12-5 | 1) รัน `api.get_kpis` ของ P อีกครั้ง 2) ตรวจลูกค้าที่ `MERGED` ชี้มาหาลูกค้านี้ 3) เปิดหน้า 03 | 1 **KPI ย้อนหลังไม่เปลี่ยน** (visit · lead · opportunity · transaction ref คงไว้เพราะไม่มี PII) · 2 แถว `MERGED` ที่ `merged_into_id` ชี้มาถูก anonymize ด้วย (วนซ้ำ) · 3 ลูกค้ายังผ่าน RLS แต่ **UI ซ่อนจากรายการด้วยตัวกรอง** | ข้อ 9.4 · 10.4 · 19.4 ข้อ 2 | `api_03_admin.sql` · `acceptance.sql` |
| **TC-F12-7** `legal_hold` | ลูกค้าที่ `legal_hold = true` | 1) `api.set_legal_hold(p_customer_id, true, p_reason)` 2) พยายาม anonymize 3) งาน retention ถึงกำหนด | 1 ต้องมี `dsr.manage` 🔐 (คอลัมน์ `legal_hold` เปลี่ยนตรงไม่ได้) · 2 **ข้าม/ปฏิเสธ** · 3 งาน retention **ข้าม**ลูกค้ารายนี้ | ข้อ 9.4 กติกา 7 · 10.3 · 10.4 | `api_03_admin.sql` · `jobs_01.sql` (`P`) |
| **TC-F12-8** เพดานการทำนิรนามต่อวัน | — | 1) เรียก `api.anonymize_customer` เกิน 20 ครั้ง/วัน/ผู้ใช้ | **ปฏิเสธ** (`dsr.anonymize_per_day` = 20) | ข้อ 10.4 · 11.2 | `api_03_admin.sql` |
| **TC-F12-9** ปิดคำขอและการเตือนใกล้ครบกำหนด | คำขอที่ยังไม่ `COMPLETED`/`REJECTED` และเหลือ 7 วันก่อน `due_at` | 1) รัน `app.job_notifications` 2) `api.update_dsr(id, 'COMPLETED', p)` | 1 → `DSR_DUE_SOON` ถึง BUSINESS_ADMIN (in-app + email) · 2 → `COMPLETED` + `completed_at` (`data_subject_requests_completed_chk`) · audit `DSR_COMPLETED` | ข้อ 10.4 · 11.1 | `jobs_01.sql` (`O`) · `api_03_admin.sql` |

### 3.13 F13 — เข้าสู่ระบบ · MFA · การล็อก · อุปกรณ์ counter

> ชั้น T2–T4 จำลอง `auth.users`/`auth.mfa_factors` ผ่าน `supabase-shim.sql` เท่านั้น — case ที่ทำเครื่องหมาย **T7** ต้องทดสอบบน staging กับ Supabase Auth จริง

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F13-1** เข้าสู่ระบบด้วยอีเมล | บัญชี `ACTIVE` | 1) กรอกอีเมล + รหัสผ่าน | session aal1 · access token 15 นาที · refresh token rotation (reuse interval 10 วินาที) · เขียน `audit.login_events` (password) · "จดจำฉันไว้" จำเฉพาะอีเมล/รหัสพนักงานในช่องกรอก **ไม่ยืดอายุ session** · ไม่ติ๊กไว้ก่อน · ซ่อนบนอุปกรณ์ counter | ข้อ 9.2 · D34 | **T7** |
| **TC-F13-2** เข้าสู่ระบบด้วย `ST-NNNN` | บัญชี `ST-0045` | 1) กรอก `ST-0045` + รหัสผ่านถูก 2) กรอก `ST-9999` (ไม่มีจริง) 3) กรอก `ST-0045` + รหัสผ่านผิด | 1 สำเร็จผ่าน EF `staff-code-login` → `api.svc_resolve_staff_code` (คืน `user_id` **ภายใน EF เท่านั้น**) → password grant ฝั่ง server → คืน session · 2–3 **ข้อความผิดพลาดเหมือนกันทุกกรณี** และ **ไม่คืนอีเมลในทุกกรณี** | ข้อ 9.2 · D24 | `api_03_admin.sql` (`api.svc_*`) · ส่วน EF ต้องทำที่ **T7** |
| **TC-F13-3** SSO | — | 1) Google ที่ `hd` อยู่ใน `app.settings['allowed_sso_domains']` 2) `hd` นอกรายการ 3) บัญชี `INVITED` ที่ยังไม่จบ flow คำเชิญ | 1 สำเร็จ · 2–3 **ปฏิเสธ** · Microsoft ใช้ Azure single-tenant ขององค์กร · SSO **ไม่เปิดทางสมัครเอง** · ถ้าองค์กรไม่มี Workspace/M365 → ซ่อนปุ่ม SSO **[รอยืนยัน Q5]** | ข้อ 9.2.1 · D23 | **T7** (Custom Access Token Hook) |
| **TC-F13-4** MFA และ aal | คุณนัท (SV@JP1 · มี TOTP verified) | 1) ล็อกอินแล้วหยุดที่ aal1 → อ่าน `CUS-2026-000297` 2) ยืนยัน TOTP จน aal2 → อ่านอีกครั้ง 3) จ๋าอั๋น (EX) ที่ aal1 เรียก `api.get_kpis` | 1 **ปฏิเสธ/0 แถว** (assignment ของบทบาท `requires_mfa` ไม่ถูกนับที่ aal1 → ได้สิทธิ์เท่ากับไม่มีบทบาท) · 2 สำเร็จ · 3 **ปฏิเสธ** · สิทธิ์จากบทบาท `STAFF` ยังใช้ได้ที่ aal1 (คุณขวัญอ่านและแก้ได้) · เมนูสร้างจาก `api.get_my_access()` | ข้อ 8.0 · 9.2 · 13.13 | `rls_personas.sql` · `rls_09_links_and_writes.sql` (`Q`) |
| **TC-F13-5** สิทธิ์ตรวจสดไม่ฝังใน JWT | ผู้ใช้กำลังใช้งานอยู่ | 1) ถอนบทบาทของผู้ใช้ระหว่างที่ session ยังอยู่ 2) ผู้ใช้เรียก RPC ถัดไป | **การถอนมีผลทันทีที่คำขอถัดไป** เพราะบทบาท/สิทธิ์ตรวจสดจากตารางทุกคำขอ **ห้ามฝังใน JWT** | ข้อ 8.0 · 9.2 | `rls_02_helpers.sql` |
| **TC-F13-6** เข้าผิดซ้ำและการล็อก | — | 1) กรอกรหัสผิดซ้ำจากเดียวกัน IP เกิน 20 ครั้ง/15 นาที 2) บัญชีถูกล็อกเกิน 3 ครั้ง/วัน | 1 → หน่วงเวลาเพิ่มขึ้น · Team plan ล็อกตาม **(บัญชี, IP)** ด้วย Password Verification Attempt hook · Pro plan นับใน Server Action/`staff-code-login` แบบ best-effort (เรียก `/auth/v1/token` ตรงได้) · **ไม่ล็อกบัญชีจากทุกที่** · 2 → แจ้ง `LOCKOUT_REPEATED` ถึง BUSINESS_ADMIN (in-app + email) · ทุกเหตุการณ์อยู่ที่ `audit.login_events` แหล่งเดียว · `ip`/`device_id` เป็นข้อมูลประกอบ **ห้ามใช้ตัดสินสิทธิ์** | ข้อ 9.2 · 11.1 · 11.2 (`security.login_ip_per_15min` 20) | `jobs_01.sql` (`O`) · ส่วน hook ต้องทำที่ **T7** |
| **TC-F13-7** ลืมรหัสผ่าน | — | 1) กรอกอีเมลของบัญชี `ACTIVE` 2) กรอกอีเมลที่ไม่มีในระบบ 3) ตั้งรหัสใหม่ | 1 ส่งลิงก์อายุ 1 ชม. ไปอีเมลที่ลงทะเบียน · 2 **ตอบข้อความเดียวกัน** แต่ไม่ส่ง · 3 **เพิกถอน session ทั้งหมด** · อีเมลไม่มีข้อมูลลูกค้า · ไม่มีกติกา "ห้ามใช้รหัสซ้ำ 5 ครั้ง" (D43) | ข้อ 9.2 · D43 | **T7** |
| **TC-F13-8** อุปกรณ์ counter | คุณเจ (BM · `user.update` scope B ของ JP1) | 1) `api.register_device(p_device_id, JP1, true)` 2) ลงทะเบียน `device_id` ซ้ำ 3) ปล่อยหน้าจอ counter ว่าง 10 นาที | 1 สำเร็จ · 2 **ปฏิเสธ** (UNIQUE) · 3 ล็อกหน้าจอและต้องล็อกอินใหม่ (`session.shared_counter_idle_min` = 10) · `device_id` เก็บใน localStorage (ไม่ถูกล้างตอน logout) และส่งเป็น header `x-device-id` | ข้อ 9.2 · 9.6 · 11.2 | `api_03_admin.sql` · ส่วนหน้าจอต้องทำที่ **T8** |
| **TC-F13-9** ออกจากระบบและ PWA | ผู้ใช้ล็อกอินอยู่ | 1) กด "ออกจากระบบ" 2) ตรวจ service worker | 1 ล้าง Cache Storage · IndexedDB · sessionStorage · localStorage **ยกเว้น `device_id` และค่าที่ "จดจำ" `login_id`** · 2 service worker **ห้าม cache** route ที่ต้องล็อกอิน และห้าม cache `/rest/v1` `/rpc` `/auth` · response ข้อมูลลูกค้าต้องมี `Cache-Control: no-store` | ข้อ 9.2 | **T8** |

### 3.14 F14 — การแจ้งเตือนและการยกระดับ

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F14-1** เส้นเวลา `FOLLOWUP_*` | task `FOLLOW_UP` "ติดตามใบเสนอราคา iPhone 17 Pro Max" ของคุณพิมพ์ชนก `CUS-2026-005412` · due 10 ก.ย. 2569 15:00 · owner คุณขวัญ (ทีม `JP1-SALES` หัวหน้าคุณนัท · ผู้จัดการ JP1 คุณเจ) | 1) รัน `app.job_notifications` ที่ 14:45 · 15:00 · +24 ชม. · +48 ชม. | 14:45 `FOLLOWUP_DUE` → คุณขวัญ (in-app + push) · 15:00 `FOLLOWUP_OVERDUE` ระดับ 0 → คุณขวัญ · 11 ก.ย. 15:00 ระดับ 1 → **คุณนัท** · 12 ก.ย. 15:00 ระดับ 2 → **คุณเจ** · ถ้าคุณขวัญปิดงานก่อน 11 ก.ย. 15:00 → **ไม่มีระดับ 1 และ 2** (แถวที่สร้างแล้วยังอยู่) | ข้อ 11.1 · 11.2 (`escalation.overdue_hours` `[24,48]`) | `jobs_01.sql` (`O`) |
| **TC-F14-2** `dedupe_key` ไม่แจ้งซ้ำทุกวัน | เหมือน TC-F14-1 | 1) รัน `app.job_notifications` ซ้ำหลายรอบในวันเดียวกัน | สร้างแถวเดียวต่อ (`recipient_staff_id`, `dedupe_key`) · `dedupe_key = '{code}:{entity_id}:{escalation_level}:{วันที่ Asia/Bangkok ของจุดยึด}'` — **จุดยึดคือ `due_at` / `due_at + 24 ชม.` / เวลาที่ lead เริ่มไม่มี owner / วันที่ของสรุป ไม่ใช่วันที่ job รัน** · งานรันซ้ำได้ (idempotent) | ข้อ 11.1 · U4 | `jobs_01.sql` (`O`) |
| **TC-F14-3** เวลาทำการ | `business_hours` = `{"default":["10:00","21:00"]}` | 1) lead ไม่มี owner ตั้งแต่ 20:50 → รัน job ที่ 21:10 และ 10:10 ของวันถัดไป | `LEAD_UNASSIGNED` และ `LEAD_NOT_CONTACTED` **นับเฉพาะนาทีในเวลาทำการ** และ **ส่งเฉพาะในเวลาทำการ** · `VISITOR_WAITING_LONG` **นับนาทีปฏิทิน** แต่ส่งเฉพาะในเวลาทำการ · `business_hours` รองรับคีย์รหัสสาขาทับค่า `default` · **ยังไม่มีวันหยุด [รอยืนยัน Q4]** | ข้อ 11.1 · 11.2 | `jobs_01.sql` (`O`) |
| **TC-F14-4** ผู้รับและการยกระดับ | — | 1) owner เป็นหัวหน้าทีมเอง 2) ระดับที่ไม่มีผู้รับ 3) owner ใหม่เป็นผู้เปลี่ยนเอง 4) task `is_next_action` 5) `app.bulk = on` | 1 **ไม่ส่งซ้ำถึงตน** (การยกระดับไม่ส่งกลับไปที่ owner) · 2 **ข้าม** · 3 **ไม่ส่ง `*_ASSIGNED`** · 4 **ไม่ส่ง `TASK_ASSIGNED`** · 5 **ไม่ส่ง `*_ASSIGNED`** · SUPERVISOR เป็นผู้รับได้เมื่อเป็นหัวหน้าทีมในสาขานั้น | ข้อ 11.1 · 19.1 ข้อ 11 | `jobs_01.sql` (`O`) |
| **TC-F14-5** เนื้อหาของข้อความ | แถวแจ้งเตือนของ TC-F14-1 | 1) ตรวจ `crm.notifications` 2) ตรวจ push/email | `title` = ป้ายของรหัส · `body` = "คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00" อยู่ใน `crm.notifications` **เท่านั้น** · push/email มีเฉพาะ **title + เลขอ้างอิง (`entity_ref`) + deep link ที่ต้องเข้าสู่ระบบ** — **ห้ามมีชื่อ เบอร์ หรือข้อมูลลูกค้า** | ข้อ 1.4 · 11.1 | `jobs_01.sql` · push/email ต้องทำที่ **T7** |
| **TC-F14-6** สิทธิ์อ่านแจ้งเตือน | แถวแจ้งเตือนของคุณขวัญ | 1) คุณคิมพยายามอ่าน 2) คุณขวัญ UPDATE `read_at` ของตน 3) คุณขวัญ UPDATE คอลัมน์อื่น 4) INSERT แถวเอง | 1 **0 แถว** (อ่านได้เฉพาะ `recipient_staff_id` = ตน) · 2 สำเร็จ · 3–4 **ปฏิเสธ** (UPDATE ได้เฉพาะ `read_at` ผ่าน column grant · INSERT โดย trigger/RPC เท่านั้น) | ข้อ 8.3 · 9.4 กติกา 6 | `rls_06_work.sql` |
| **TC-F14-7** กระดิ่งของ seed | ข้อมูลตามข้อ 13.14 (snapshot ไม่ใช่ผลของการรันกติกา) | 1) นับแถวที่ยังไม่อ่านต่อผู้ใช้ | คุณขวัญ **6** · คุณคิม **5** · คุณนัท **3** · คุณเจ **4** · คุณแพร **1** · จ๋าอั๋น **1** · คนอื่น **0** | ข้อ 13.14 | `acceptance.sql` (`M`) · `check-prototype.mjs` |

### 3.15 F15 — งานตามเวลา

> ทุกงานรับ `p_as_of` (prod = `now()` · dev/staging/test = `app.clock()`) · `app.enforce_row_transition` ข้ามงานระบบ · audit `actor_type = 'SYSTEM'`

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL · สิทธิ์ | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-F15-1** ปิด visit ค้าง | visit `WAITING`/`IN_SERVICE` ที่วันธุรกิจของ `started_at` ก่อนวันของ `p_as_of` (เช่น คิว JP1 001–004 ของ 11 ก.ย.) | 1) `app.job_close_stale_visits('2026-09-12 00:05+07')` 2) รันซ้ำ | 1 → `COMPLETED` · `outcome_code='UNRECORDED'` · `ended_at` = **23:59:59 ของวันนั้น** · `closed_by_system = true` · `actor_label = 'SYSTEM:close_stale_visits'` · `VISIT_OUTCOME_MISSING` สรุปให้ผู้จัดการสาขา · `WAITING → COMPLETED` ทำได้เฉพาะงานระบบ · `UNRECORDED` **ไม่นับเป็นบันทึกผลครบ** (`OUTCOME_COMPLETION`) · 2 แถวที่ปิดแล้วไม่ถูกเลือกซ้ำ | ข้อ 4.1 · 4.2 · 9.6 · 12.2 | `jobs_01.sql` (`L`) |
| **TC-F15-2** หมดอายุใบเสนอราคา | ดู TC-F05-9 | — | — | ข้อ 4.6 · 9.6 | `jobs_01.sql` (`M`) |
| **TC-F15-3** หมดอายุไฟล์ export | ดู TC-F11-5 | — | — | ข้อ 8.2 · 9.6 | `jobs_01.sql` (`N`) |
| **TC-F15-4** งานแจ้งเตือน | ดู §3.14 | 1) รันรอบ 09:00 · 18:00 · ทุก 5 นาที | รอบ 09:00 → `DATA_MISSING` รายวันของ owner และ **วันจันทร์ 09:00** รายสัปดาห์ของผู้จัดการ (`notify.data_missing_time`) · รอบ 18:00 → `DUPLICATE_SUSPECTED` สรุปถึง SV/BM ของสาขา (`notify.duplicate_digest_time`) · `RETENTION_ANONYMIZE_UPCOMING` สรุปรายวัน · `DSR_DUE_SOON` | ข้อ 11.1 · 11.2 · 9.6 | `jobs_01.sql` (`O`) |
| **TC-F15-5** retention | ลูกค้าไม่เคยซื้อที่ `last_activity_at` ครบ 24 เดือน · ลูกค้าเคยซื้อครบ 10 ปีจากธุรกรรมล่าสุด · log เกินระยะเก็บ | 1) `app.job_retention(p_as_of)` 2) รันซ้ำ | แจ้งล่วงหน้า **30 วัน** ด้วย `RETENTION_ANONYMIZE_UPCOMING` → เมื่อครบ **anonymize ก่อน** (actor `SYSTEM:retention` · ไม่ต้องมี DSR · **ข้าม `legal_hold`** · รวมแถว `MERGED` ที่ชี้มา) → `SET LOCAL ROLE audit_retention` → DELETE `audit.audit_logs` เกิน 5 ปี · `access_logs`/`login_events` เกิน 1 ปี · งานเป็น **SECURITY INVOKER** · ลูกค้า `ANONYMIZED` ไม่ถูกเลือกซ้ำ · **KPI ย้อนหลังไม่เปลี่ยน** · ระยะทุกค่า **[รอยืนยัน DPO · Q8]** | ข้อ 10.3 · 10.4 · 19.1 ข้อ 13 · 19.4 ข้อ 1–2 | `jobs_01.sql` (`P`) |
| **TC-F15-6** ตารางเวลา cron | `supabase/migrations/0014_schedule_cron.sql` (PGlite ข้าม) | 1) apply บน Supabase แล้วตรวจ `cron.job` | มี 5 job: `job_close_stale_visits` `5 17 * * *` · `job_expire_quotations` `10 17 * * *` · `job_retention` `0 19 * * *` · `job_expire_exports` `15 * * * *` · `job_notifications` `*/5 * * * *` (เวลา cron เป็น **UTC** · Asia/Bangkok = UTC+7) · รันในฐานะ `postgres` · ไฟล์ `*_cron.sql` มีเฉพาะ `cron.schedule`/`cron.unschedule` และ unschedule ชื่อเดิมก่อน (รันซ้ำได้) | ข้อ 9.6 · deployment §3.3 M6 | **T7** |

### 3.16 กรณีปฏิเสธ / ตรวจสิทธิ์รายบุคคล (ข้อ 13.13)

**วิธีทดสอบ:** ทุกแถวต้องเรียก `test.login_as(อีเมล, aal)` (หรือใช้ JWT ของบัญชีนั้นกับ PostgREST) ก่อนเสมอ · ผลที่เป็น "อ่านไม่ได้" ต้องได้ **0 แถว** จาก RLS หรือ **`42501`** จาก RPC — **ไม่ใช่การซ่อนปุ่ม** (ข้อ 9.1) · aal2 เว้นแต่ระบุ

| ID | ผู้ใช้ | อ่าน `CUS-2026-000297` | แก้ `CUS-2026-000297` | แก้ `OP-2026-002998` | อ่าน `TK-2026-012508` | เปิดเบอร์คุณสมชาย | `api.get_kpis` P |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| **TC-NEG-1** | คุณขวัญ `ST-0045` (ST@JP1 · **aal1**) | ✓ | ✓ | ✓ | ✓ | ✓ | ขอบเขตของตน (ข้อ 13.6 คอลัมน์คุณขวัญ) |
| **TC-NEG-2** | คุณคิม `ST-0046` (ST@JP1 · **aal1**) | ✓ | ✗ | ✗ | ✗ | ✓ | ขอบเขตของตน |
| **TC-NEG-3** | คุณนัท `ST-0030` (SV@JP1 · aal2) | ✓ | ✓ | ✓ | ✓ | ✓ | ทีม `JP1-SALES` (ข้อ 13.6) |
| **TC-NEG-4** | คุณนัท (SV@JP1 · **aal1**) | ✗ | ✗ | ✗ | ✗ | ✗ | **ปฏิเสธ** |
| **TC-NEG-5** | คุณเจ `ST-0020` (BM@JP1) | ✓ | ✓ | ✓ | ✓ | ✓ | แถว JAUNPHONE 1 |
| **TC-NEG-6** | คุณบอส `ST-0021` (BM@JP2) | ✗ | ✗ | ✗ | ✗ | ✗ | แถว JAUNPHONE 2 |
| **TC-NEG-7** | คุณฝน `ST-0050` (ST@JPON · **aal1**) | ✗ | ✗ | ✗ | ✗ | ✗ | จำนวนเป็น **0** · KPI ที่ไม่ผูกพนักงานและอัตรา 0/0 เป็น **`NULL`** (หน้าจอแสดง `–`) |
| **TC-NEG-8** | คุณปุ๊ก `ST-0010` (OP@JP1–JP4) | ✓ | ✗ | ✗ | ✓ | ✗ | = ข้อ 13.1 |
| **TC-NEG-9** | คุณมายด์ `ST-0011` (MK) | ✗ | ✗ | ✗ | ✗ | ✗ | = ข้อ 13.1 |
| **TC-NEG-10** | จ๋าอั๋น `ST-0001` (EX) | ✓ | ✗ | ✗ | ✓ | ✓ | = ข้อ 13.1 |
| **TC-NEG-11** | จ๋าอั๋น (EX · **aal1**) | ✗ | ✗ | ✗ | ✗ | ✗ | **ปฏิเสธ** |
| **TC-NEG-12** | คุณแพร `ST-0002` (BA) | ✓ | ✓ | ✓ | ✓ | ✓ | = ข้อ 13.1 |
| **TC-NEG-13** | คุณต้น `ST-0003` (SA) | ✗ | ✗ | ✗ | ✗ | ✗ | **ปฏิเสธ** |

**กรณีเพิ่มเติมที่ CANONICAL บังคับ (ข้อ 13.13 ย่อหน้าท้าย) และกรณีของชั้น HTTP**

| ID | เงื่อนไข | ขั้นตอน | ผลที่คาด | CANONICAL | อัตโนมัติ |
|---|---|---|---|---|---|
| **TC-NEG-14** ผู้ใช้ไม่มีบทบาท | บัญชี `ACTIVE` ที่ไม่มี assignment ใด | `SELECT * FROM crm.customers` | **0 แถว** · ปฏิเสธเป็นค่าเริ่มต้นทุกตาราง | ข้อ 13.13 | `rls_personas.sql` · `rls_02_helpers.sql` (`P12`) |
| **TC-NEG-15** ไม่ใช่ superuser ขณะทดสอบ | ระหว่างชุด T2 | ตรวจ `current_setting('is_superuser')` | ต้องเป็น `'off'` — ถ้าเป็น `'on'` ผลทุก assertion เรื่องสิทธิ์เป็นโมฆะ | ข้อ 13.13 | `rls_personas.sql` |
| **TC-NEG-16** ห้ามยุบ scope ข้ามสาขา | บัญชี `BRANCH_MANAGER`@JP1 **+** `STAFF`@JP2 | UPDATE lead ของคนอื่นที่ JP2 | **0 แถว** — ได้ `B` ที่ JP1 และ `O` ที่ JP2 เท่านั้น (ประเมินต่อแถวการมอบบทบาทแล้วรวมแบบ OR) | ข้อ 8.0 · 13.13 | `rls_personas.sql` · `rls_02_helpers.sql` (`P13`) |
| **TC-NEG-17** ผูกลูกค้าข้ามสาขาด้วย INSERT | STAFF@JP2 | INSERT visit ที่ `customer_id` เป็นลูกค้าของ JP1 อย่างเดียว | **ปฏิเสธ** — WITH CHECK บังคับ `customer_id IN (SELECT app.readable_customer_ids())` · ต้องใช้ `api.link_customer_to_branch` | ข้อ 6.6 · 13.13 | `rls_personas.sql` · `rls_09_links_and_writes.sql` |
| **TC-NEG-18** ค่าติดต่อเต็มผ่าน API | ผู้ใช้ใดก็ได้ | `GET /rest/v1/customer_contacts?select=value_raw` | **ปฏิเสธ** (column grant ไม่รวม `value_raw` `value_normalized`) · ค่าเต็มได้ทางเดียวคือ `api.reveal_contact` ซึ่งเขียน `CONTACT_REVEALED` ก่อนคืนค่า | ข้อ 6.4 · 13.13 | `rls_03_customer.sql` · `rls_personas.sql` · ชั้น HTTP ที่ **T7** |
| **TC-NEG-19** SYSTEM_ADMIN ไม่มีสิทธิ์ข้อมูลลูกค้า | คุณต้น (SA) | ตรวจ `core.role_permissions` และเรียก RPC ลูกค้า | ไม่มีสิทธิ์ `customer.*` `visit.*` `lead.*` `opportunity.*` · ถือ SYSTEM_ADMIN ร่วมกับบทบาทธุรกิจในบัญชีเดียวถูก trigger ปฏิเสธ | ข้อ 7.1 · 13.13 | `rls_personas.sql` · `01_schema_stage1.sql` |
| **TC-NEG-20** `anon` ไม่มีสิทธิ์ใด | role `anon` | SELECT ทุก schema ของโครงการ | **ไม่มี GRANT ใด ๆ** ทั้งระดับ schema ตาราง คอลัมน์ และฟังก์ชัน | ข้อ 1.1 · 9.8 | `rls_01_catalog.sql` (`CI-04`) · `rls_09_links_and_writes.sql` (`V`) |
| **TC-NEG-21** `api.svc_*` ด้วย JWT ผู้ใช้ | ผู้ใช้ `authenticated` | เรียก `rpc/svc_build_export_dataset` | **ปฏิเสธ** — `api.svc_*` GRANT EXECUTE ให้ `service_role` เท่านั้น และตรวจ `auth.role() = 'service_role'` บรรทัดแรก | ข้อ 9.6 · 9.8 | `rls_09_links_and_writes.sql` (`V`) · `api_03_admin.sql` · ชั้น HTTP ที่ **T7** |
| **TC-NEG-22** assignment หมดอายุ / บัญชีถูกปิด | บัญชีที่ `valid_to = now() − 1 วัน` และบัญชี `DISABLED` | เรียก RPC ใด ๆ ที่ต้องมีสิทธิ์ | **ปฏิเสธ/0 แถว** — helper นับเฉพาะ staff `ACTIVE` และ `valid_from ≤ now() < coalesce(valid_to, ∞)` | ข้อ 8.0 | `rls_02_helpers.sql` (`P15` · `P16`) |
| **TC-NEG-23** SUPERVISOR ที่ไม่ใช่หัวหน้าทีม | บัญชี `SUPERVISOR`@JP2 ที่เป็นสมาชิกทีมแต่ **ไม่ใช่** `is_leader` | อ่าน/แก้รายการของสมาชิกคนอื่นในสาขา | **0 แถว** — `SUPERVISOR`@สาขา X ใช้ได้เมื่อเป็น `is_leader` ของทีมที่ `teams.branch_id = X` อย่างน้อย 1 ทีม | ข้อ 7.1 | `rls_02_helpers.sql` (`P14`) |
| **TC-NEG-24** `tasks` ไม่มี read-through ผ่านลูกค้า | คุณคิมอ่านคุณสมชายได้ (scope B) แต่ไม่ใช่ owner ของ `TK-2026-012508` | อ่าน `TK-2026-012508` | **0 แถว** — `tasks` และ `task_comments` ใช้ `task.read` อย่างเดียว · Customer 360 แสดง "นัดติดตามถัดไป" จาก next action ของ lead/opportunity แทน | ข้อ 8.1 · 9.4 | `rls_06_work.sql` · `rls_personas.sql` |
| **TC-NEG-25** อ่าน `audit.*` ตรง | ผู้ใช้ใดก็ได้ | SELECT จาก `audit.audit_logs` · `access_logs` · `login_events` | **ปฏิเสธ** — `audit.*` ไม่มี GRANT ให้ `authenticated` · อ่านผ่าน `api.search_audit` / `api.get_entity_history` / `api.search_security_log` ซึ่งคืน**ค่าปิดบัง** เท่านั้น | ข้อ 9.4 · 9.5 | `rls_08_core_ref_app_audit.sql` · `api_03_admin.sql` |
| **TC-NEG-26** `security_log.read` ไม่เห็นข้อมูลลูกค้า | คุณต้น (SA · `security_log.read` S) | `api.search_security_log(...)` | คืนเฉพาะ `login_events` + `audit_logs` ที่ action ∈ {`ROLE_*` · `PERMISSION_CHANGED` · `STAFF_*` · `MFA_*` · `SETTINGS_UPDATED` · `INTEGRATION_UPDATED`} · **ไม่คืน `access_logs` หรือรายการที่ `entity_type` เป็นลูกค้า** | ข้อ 9.5 | `api_03_admin.sql` |
| **TC-NEG-27** MARKETING เปิดหน้าที่ไม่ควรเข้า | คุณมายด์ (MK) | 1) เปิดหน้า 03 · 05 2) เปิดหน้า 14 | 1 การ์ด "ไม่มีสิทธิ์เข้าหน้านี้" (ไม่มี `customer.read`) · 2 เข้าได้เฉพาะแท็บ **Tag** และ **แคมเปญ** · ช่องค้นหากลางถูกซ่อนสำหรับ MARKETING และ SYSTEM_ADMIN | ข้อ 8.1 · 14.1 · 14.3 | `check-prototype.mjs` (หมวด 9 · 11) |

### 3.17 กรณีคุณภาพข้อมูล (ข้อ 12.3)

จำนวนใน seed (ข้อ 13.12) ถูก assert ใน `acceptance.sql` บล็อก `L` · case ด้านล่างทดสอบ **กติกาการเกิดและการแก้** ของแต่ละ issue

| ID | issue | เงื่อนไขที่ทำให้เกิด | ขั้นตอนทดสอบ | ผลที่คาด · จำนวนใน seed | แก้ด้วยสิทธิ์ |
|---|---|---|---|---|---|
| **TC-DQ-1** | `DUPLICATE_SUSPECTED` | แถว `duplicate_decisions` `PENDING` (นับเป็นแถว) | สร้าง override ตาม TC-F03-7 แล้วเปิดหน้า 12 | ปรากฏ 1 แถว · seed: JP1 5 · JP2 4 · JP3 4 · JP4 3 = **16** · `DUPLICATE_RATE` = `count(distinct duplicate_decisions.customer_id)` ที่ `PENDING` และลูกค้าทั้งสองรายยัง `ACTIVE` / ลูกค้า `ACTIVE` ทั้งหมด = **0.1% (16 / 14,962)** เป้า **< 2%** ✓ | `customer.merge` 🔐 · ผู้ตัดสิน ≠ ผู้สร้างแถว |
| **TC-DQ-2** | `MISSING_PHONE` | ลูกค้า `ACTIVE` ที่**ไม่มี** contact `PHONE` ที่ `is_active` **และ** `first_channel_code IN ('WALK_IN','PHONE')` | ปิดใช้งาน contact PHONE ของลูกค้า walk-in | ปรากฏ · seed **23** (JP1 7 · JP2 6 · JP3 5 · JP4 5) ทั้งหมดเป็นข้อมูลนำเข้า `created_via='IMPORT'` | `data_quality.resolve` (ST scope O ใช้ได้กับ issue นี้) |
| **TC-DQ-3** | `INVALID_PHONE` | มี contact `PHONE` ที่ `is_active` และ `is_valid = false` | บันทึกเบอร์ `12345` ผ่าน `api.save_contact` | ไม่ปฏิเสธการบันทึก แต่ `is_valid = false` → ปรากฏใน issue · seed **6** · เบอร์ถูกต้อง = มือถือ 10 หลักขึ้นต้น `06` `08` `09` หรือเบอร์บ้าน 9 หลักขึ้นต้น `02`–`07` | `data_quality.resolve` (O ใช้ได้) |
| **TC-DQ-4** | `LEAD_WITHOUT_OWNER` | lead เปิดอยู่ `owner_staff_id IS NULL` | ดู TC-F04-7 | seed **8** (สาขาละ 2) · แจ้ง `LEAD_UNASSIGNED` เมื่อเกิน 15 นาทีเวลาทำการ | `lead.assign` (SV scope T รวมรายการที่ owner ว่าง) |
| **TC-DQ-5** | `LEAD_WITHOUT_OUTCOME` | lead เปิดอยู่ `created_at < app.clock() − 14 วัน` (`dq.lead_without_outcome_days`) | สร้าง lead ย้อนหลัง 15 วันแล้วปล่อยเปิดไว้ | ปรากฏ · seed **19** (JP1 6 · JP2 5 · JP3 4 · JP4 4) · JP1 ทั้ง 6 คือ lead `NEW` ที่สร้างก่อน P | `lead.update` |
| **TC-DQ-6** | `OVERDUE_FOLLOWUP` | task `FOLLOW_UP` ในกลุ่ม "เกินกำหนด" (ข้อ 4.7) | ปล่อย task `FOLLOW_UP` ที่ due เมื่อวานไว้ | seed **31** (JP1 6 = คุณขวัญ 3 + คุณคิม 3 · JP2 9 · JP3 8 · JP4 8) | `task.update` |
| **TC-DQ-7** | `INCOMPLETE_CUSTOMER` | ขาด `last_name` **และ** `province_code` **และ** ไม่มี lead/opportunity ที่ระบุ `interest_code` | สร้างลูกค้าด้วยชื่อเล่นอย่างเดียว ความสนใจ `INQUIRY` (ไม่สร้าง lead) | ปรากฏ · seed **42** · เพิ่ม `last_name` หรือ `province_code` หรือสร้าง lead ที่มีความสนใจ → หายไป | `data_quality.resolve` (O ใช้ได้) |
| **TC-DQ-8** | `WON_WITHOUT_TRANSACTION` | opportunity `WON` ที่ `won_at < app.clock() − 3 วัน` (`dq.won_without_txn_days`) และไม่มี transaction ref ผูก | ปิด WON แล้วไม่ผูกเลขธุรกรรม | seed **12** (JP1 4 · JP2 3 · JP3 3 · JP4 2) — เป็นรายการเดียวที่ seed ยอมให้ WON ไม่มี ref (ข้อ 13.0 กติกา 6) | `transaction.link` |
| **TC-DQ-9** | `VISIT_UNRECORDED` | visit outcome `UNRECORDED` ที่ `started_at` อยู่ใน "7 วันล่าสุด" (`dq.visit_unrecorded_days`) | ดู TC-F15-1 | seed **29** (JP1 9 · JP2 8 · JP3 7 · JP4 5) · **แก้ outcome ข้ามวันไม่ได้** → ใช้ `api.acknowledge_unrecorded_visit` รับทราบ แต่รายการยังนับจนพ้น 7 วัน | `visit.update` |
| **TC-DQ-10** | `MISSING_REQUIRED_RATE` | ลูกค้า `ACTIVE` ไม่ซ้ำที่ติด `MISSING_PHONE` **หรือ** `INCOMPLETE_CUSTOMER` / ลูกค้า `ACTIVE` ทั้งหมด | เรียก `api.get_kpis` ในฐานะจ๋าอั๋น | **0.4% (61 / 14,962)** เป้า **< 2%** ✓ · 61 = 23 + 42 − 4 (ลูกค้า 4 รายติดทั้งสองธง) | — (KPI) |
| **TC-DQ-11** | ขอบเขตของศูนย์คุณภาพข้อมูล | — | 1) คุณขวัญ (ST · `data_quality.view` O) เปิดหน้า 12 2) พยายามแก้ `LEAD_WITHOUT_OWNER` | 1 เห็นเฉพาะรายการของตน · 2 **ปฏิเสธ** — `data_quality.resolve` ระดับ O ใช้ได้เฉพาะ `MISSING_PHONE` `INVALID_PHONE` `INCOMPLETE_CUSTOMER` ของลูกค้าที่ตนดูแล · รายการระดับลูกค้าผูกสาขาด้วย `first_branch_id` | ข้อ 8.1 · 12.3 |

### 3.18 กรณี PDPA (ข้อ 10)

| ID | เงื่อนไขก่อนเริ่ม | ขั้นตอน | ผลที่คาด | CANONICAL |
|---|---|---|---|---|
| **TC-PDPA-1** ประกาศความเป็นส่วนตัวบังคับ | หน้า 04 | 1) ไม่ติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" แล้วบันทึก | **ปฏิเสธ** · เมื่อติ๊กแล้วได้แถว `customer_consents` `PRIVACY_NOTICE` `GRANTED` + `notice_version` จาก `app.settings['pdpa.current_notice_version']` (`"PN-2026-01"`) + `captured_via` + `evidence` (NOT NULL) · ช่องทางออนไลน์/โทรบันทึกได้เมื่อส่งลิงก์ประกาศแล้ว → `captured_via = 'LINK_SENT'` | ข้อ 6.2 · 10.2 · 11.2 |
| **TC-PDPA-2** ความยินยอมการตลาด | หน้า 04 แท็บ "เพิ่มเติม" | 1) ตรวจค่าเริ่มต้น 2) ติ๊ก `MARKETING` โดยไม่ติ๊กช่องอายุ 3) ติ๊กทั้งสอง | 1 **ไม่ติ๊กไว้ก่อน** · 2 RPC **ปฏิเสธ** `MARKETING` `GRANTED` · 3 สำเร็จ · ข้อความ "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" เก็บใน `evidence` · ช่องทางที่ยินยอม ⊆ {`LINE`,`SMS`,`PHONE`,`EMAIL`} | ข้อ 10.2 · 19.4 ข้อ 3 · D11 |
| **TC-PDPA-3** consent เป็น append-only | ลูกค้าที่มี consent แล้ว | 1) UPDATE แถวเดิม 2) DELETE 3) เพิ่มแถว `WITHDRAWN` | 1–2 **ปฏิเสธ** · 3 สำเร็จ · สถานะปัจจุบัน = แถวล่าสุดต่อ purpose (view `crm.customer_consent_current` · `security_invoker`) | ข้อ 10.2 · 8.3 |
| **TC-PDPA-4** ค่าเต็มของช่องทางติดต่อ | คุณขวัญมี `customer.pii.reveal` B | 1) เปิดหน้า 05 แล้วดู HTML ที่ส่งมา 2) กด "แสดง" 3) เรียก `api.reveal_contact` เกิน 30 ครั้ง/ชม. | 1 **ห้ามฝังค่าเต็มใน HTML ตอนโหลดหน้า** — เห็นเฉพาะ `value_masked` (`081-XXX-5678` · `so***` · `s***@example.com` · LINE_USER_ID แสดง `—`) · 2 `api.reveal_contact(p_contact_id, p_purpose)` โดย `p_purpose` ∈ `VIEW` `CALL` `COPY` `LINE_OPEN` เขียน `CONTACT_REVEALED` ใน `audit.access_logs` **ก่อนคืนค่า** · ค่าที่เปิดซ่อนกลับอัตโนมัติใน 30 วินาที **[รอยืนยัน]** · 3 **ปฏิเสธ** (คืนผลแบบไม่ raise เพื่อให้ตัวนับและการแจ้งเตือนถูก commit) + แจ้ง `REVEAL_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN | ข้อ 6.4 · 9.5 · 11.1 · 11.2 (`security.reveal_per_hour` 30) |
| **TC-PDPA-5** audit เก็บค่าปิดบัง | แก้เบอร์ของลูกค้า | 1) `api.save_contact` เปลี่ยน `081-XXX-1234` → `089-XXX-5678` 2) อ่านผ่าน `api.get_entity_history` | `audit.audit_logs.before/after` เก็บ **ภาพทั้งแถวแบบปิดบัง** — คอลัมน์ที่ data dictionary ติดป้าย `[pii]` เก็บเป็น `{"masked":"081-XXX-1234","sha256":"…"}` **ไม่เก็บค่าเต็ม** · `changed_fields` ระบุคอลัมน์ที่เปลี่ยน · action `CUSTOMER_CONTACT_UPDATED` · การกู้ข้อมูลใช้ PITR ไม่ใช้ audit | ข้อ 9.5 · 19.1 ข้อ 3 |
| **TC-PDPA-6** audit แก้ไม่ได้ | — | 1) UPDATE `audit.audit_logs` 2) DELETE 3) TRUNCATE 4) DELETE ในฐานะ role `audit_retention` | 1–3 **ปฏิเสธ** (REVOKE + trigger `audit.deny_change`) · 4 อนุญาตเฉพาะแถวที่เก่ากว่าระยะเก็บ · UPDATE คอลัมน์ `before`/`after` อนุญาตเฉพาะเมื่อ `app.audit_redaction = 'on'` (ใช้โดย `app.anonymize_customer`) | ข้อ 9.5 · 19.1 ข้อ 13 |
| **TC-PDPA-7** push/email ไม่มีข้อมูลลูกค้า | แจ้งเตือนใด ๆ | 1) ตรวจ payload ของ push 2) ตรวจเนื้ออีเมล (คำเชิญ · รีเซ็ตรหัส · อนุมัติ) | มีเฉพาะ **ป้ายการแจ้งเตือน + เลขอ้างอิง + deep link ที่ต้องเข้าสู่ระบบ** — **ห้ามมีชื่อ เบอร์ หรือข้อมูลลูกค้า** | ข้อ 1.4 · 11.1 |
| **TC-PDPA-8** header ที่เป็นข้อมูลประกอบ | Next.js ส่งคำขอต่อ | 1) ตรวจว่า audit บันทึก `ip` `user_agent` `device_id` `request_id` จาก `current_setting('request.headers')` คีย์ `x-client-ip` `x-client-ua` `x-device-id` `x-request-id` | ค่าเหล่านี้เป็น**ข้อมูล "ที่รายงาน" ไม่ใช่หลักฐาน** และ **ห้ามใช้ตัดสินสิทธิ์** · บน PGlite เป็น NULL → ต้องตรวจที่ **T7** | ข้อ 9.5 |
| **TC-PDPA-9** ห้ามเก็บข้อมูล Restricted | ช่องข้อความอิสระ | 1) บันทึกโน้ตที่มีเลข 13 หลักรูปแบบเลขบัตรประชาชนไทยที่ **checksum ถูกต้อง** 2) เลข 13 หลักที่ checksum ผิด | 1 **ปฏิเสธ** โดย `app.trg_guard_restricted_text` บน `customer_notes.body` · `interactions.summary` · `tasks.title/description` · `task_comments.body` · `leads/opportunities.next_action` `lost_note` · `quotations.terms_note` · 2 ผ่าน · `crm.customers` **ห้ามมี** เลขบัตรประชาชน วันเกิดเต็ม รายได้ รูปถ่าย หรือเอกสาร · V1 **ไม่มีการอัปโหลดไฟล์ของลูกค้า** | ข้อ 6.3 · 10.1 · A31 · B23 |
| **TC-PDPA-10** ลูกค้านอกขอบเขตในผลตรวจซ้ำ | ดู TC-F03-4 | — | การ์ดย่อ**ไม่คืน** lifecycle สาขา หรือวันที่ติดต่อ · เบอร์ปิดบังแสดงเฉพาะเมื่อตรงด้วยเบอร์ · `audit.access_logs` เก็บ **sha256 ของค่า normalized** ไม่เก็บค่าจริง (ไม่ใส่ salt · ไม่ส่งออกนอกฐานข้อมูล) | ข้อ 6.5 · 19.4 ข้อ 6 |
| **TC-PDPA-11** เปิดดูลูกค้าจำนวนมาก | ผู้ใช้เรียก `api.get_customer_360` เกิน 100 ครั้ง/ชม. | 1) เรียกเกินเพดาน | **แจ้งเท่านั้น ไม่บล็อก** — `CUSTOMER_VIEW_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN (in-app) · `security.customer_view_per_hour` = 100 | ข้อ 11.1 · 11.2 |
| **TC-PDPA-12** แท็บเอกสารใน V1 | หน้า 05 แท็บ "เอกสาร" | 1) เปิดแท็บ | แสดง **เฉพาะเลขใบเสนอราคาและเลขสัญญาจาก transaction refs** + ข้อความ "เอกสารอยู่ในระบบสัญญา" · **ไม่มีปุ่มอัปโหลด** · schema `restricted` ปิดใช้งานใน V1 | ข้อ 6.8 · 10.1 · D31 |

---

## 4. UAT Checklist

> **UAT = การทดสอบโดยผู้ใช้จริงของ JAUN บน staging ด้วย `seed.sql`** ไม่ใช่การทดสอบของทีมพัฒนา · ทำ **ก่อน pilot JP1** และ **ก่อน rollout** สาขาที่เหลือ (roadmap §6 · §7)
> วันที่ · จำนวนวัน · ชื่อบุคคลจริง · ช่องทางแจ้งปัญหา ทั้งหมดเป็น **[รอยืนยัน]** — CANONICAL ไม่มีข้อมูลนี้

### 4.1 ผู้เข้าร่วมและบทบาทที่รับผิดชอบ

| บทบาทในระบบ | ผู้เล่นในสคริปต์ (บัญชี staging ของ seed · ข้อ 13.5) | ผู้ทดสอบจริง | จำนวนขั้นต่ำ | สิ่งที่ต้องยืนยัน |
|---|---|---|---:|---|
| `STAFF` | **คุณขวัญ** `ST-0045` (ST@JP1 · ทีม `JP1-SALES` · **ใช้งานที่ aal1 ได้**) | พนักงานขายหน้าร้าน JP1 **[รอยืนยัน]** | 2 คน | รับลูกค้า · Quick Capture · ตรวจซ้ำ · บันทึกการติดต่อ · งานของวันนี้ · Customer 360 |
| `SUPERVISOR` | **คุณนัท** `ST-0030` (SV@JP1 · หัวหน้า `JP1-SALES` · ต้อง aal2) | หัวหน้าทีมขาย JP1 **[รอยืนยัน]** | 1 คน | มอบงาน/เปลี่ยนผู้รับผิดชอบในทีม · ตัวเลขระดับทีม · รับ `LEAD_UNASSIGNED` |
| `BRANCH_MANAGER` | **คุณเจ** `ST-0020` (BM@JP1 · ต้อง aal2) | ผู้จัดการสาขา JP1 **[รอยืนยัน]** | 1 คน | Dashboard สาขา · ผลงานรายพนักงาน · เชิญ/ปิดใช้งานผู้ใช้ · ขอส่งออก ≤ 500 แถว · ตัดสินข้อมูลซ้ำ · reopen |
| `BUSINESS_ADMIN` | **คุณแพร** `ST-0002` (BA · ทั้งองค์กร · ต้อง aal2) | ผู้ดูแลข้อมูลธุรกิจ **[รอยืนยัน]** | 2 คน (จำเป็นสำหรับ DSR ประเภท `DELETION`) | Master Data · ผู้ใช้/สิทธิ์ · คุณภาพข้อมูล · อนุมัติส่งออกของ MARKETING · PDPA/DSR · ตั้งค่าเกณฑ์ธุรกิจ |
| `EXECUTIVE` | **จ๋าอั๋น** `ST-0001` (EX · ต้อง aal2) | ผู้บริหาร **[รอยืนยัน]** | 1 คน | ตอบคำถาม Acceptance 12 ข้อจาก Dashboard/รายงาน · อนุมัติคำขอบทบาทสูง · ลงนาม go/no-go |
| `OPERATIONS` (สังเกตการณ์) | **คุณปุ๊ก** `ST-0010` (OP@JP1–JP4) | ฝ่ายปฏิบัติการ **[รอยืนยัน]** | 1 คน | อ่านอย่างเดียวหลายสาขา · ยืนยันว่า**แก้ไขไม่ได้** |
| `MARKETING` (สังเกตการณ์) | **คุณมายด์** `ST-0011` (MK) | ทีมการตลาด **[รอยืนยัน]** | 1 คน | ยื่นคำขอส่งออก · ยืนยันว่า**ไม่เห็นข้อมูลลูกค้ารายคน** |
| `SYSTEM_ADMIN` (สังเกตการณ์) | **คุณต้น** `ST-0003` (SA) | ผู้ดูแลระบบ (IT) **[รอยืนยัน]** | 1 คน | ตั้งค่าเชิงเทคนิค · security log · ยืนยันว่า**ไม่มีสิทธิ์ข้อมูลลูกค้า** |
| ผู้ดำเนินการ UAT | — | QA / PO **[รอยืนยัน]** | 1 คน | คุมรอบ · บันทึกผล · จัดลำดับข้อบกพร่อง |
| ผู้สังเกตการณ์ด้าน PDPA | — | DPO / ที่ปรึกษากฎหมาย **[รอยืนยัน Q8]** | 1 คน | ตรวจ TC-PDPA-* · ประกาศ `PN-2026-01` **[รอยืนยัน Q9]** |

> **ห้ามใช้บัญชีเดียวเล่นหลายบทบาท** ในรอบเดียวกัน — ข้อ 7.2 ห้ามถือ SYSTEM_ADMIN ร่วมกับบทบาทธุรกิจ และ Q22 ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN · กรณี DSR `DELETION` ต้องมี BUSINESS_ADMIN ที่ `ACTIVE` **อย่างน้อย 2 คน** (Q26)

### 4.2 สภาพแวดล้อมและข้อมูล

| หัวข้อ | ค่า |
|---|---|
| Environment | **staging** (Supabase project แยก · `app.settings['env'] = "staging"`) — **ห้ามทำ UAT บน prod** |
| ข้อมูล | `supabase/seed.sql` เท่านั้น (ข้อมูลสมมติ · อีเมล `@example.com`) หรือสำเนา prod ที่ผ่านขั้นตอนทำนิรนาม (deployment §8) |
| นาฬิกา | `app.settings['clock'] = {"as_of":"2026-09-11T10:24:00+07:00"}` → "ตอนนี้" ของทุกหน้าจอคือ **11 ก.ย. 2569 10:24 น.** · ตัวเลขที่เห็นต้องตรงข้อ 13 ทุกตัว |
| ช่วงเวลาเริ่มต้น | preset `LAST_30_DAYS` = **[13 ส.ค. 2569, 12 ก.ย. 2569)** · ป้ายบนหน้าจอต้องเขียน "30 วันล่าสุด" **ห้ามเขียน "เดือนนี้"** (D27) |
| บัญชี | 14 บัญชีตามข้อ 13.5 · ทุกบัญชีที่ `requires_mfa` มี TOTP verified แล้ว · คุณขวัญ/คุณคิม (STAFF) ใช้ที่ aal1 ได้ |
| อุปกรณ์ | อย่างน้อย 1 เครื่องต่อประเภท: เดสก์ท็อป ≥ 1280px · แท็บเล็ต counter 768–1279px · มือถือ < 768px (ทดสอบ bottom navigation 5 ช่องและ FAB "รับลูกค้า") |
| เครือข่าย | ทดสอบบนเครือข่ายของสาขาจริงอย่างน้อย 1 รอบ (วัดเวลาตอบของ `api.search_customers` และ `api.get_kpis`) |
| การรีเซ็ตข้อมูล | ล้างและโหลด `seed.sql` ใหม่ก่อนทุกรอบ UAT เพื่อให้ตัวเลขกลับไปตรงข้อ 13 (`app.running_numbers` กลับไปตามข้อ 13.0 กติกา 8) |
| สิ่งที่ห้ามทำ | ห้ามนำข้อมูลลูกค้าจริงเข้ามาระหว่าง UAT · ห้ามรัน `supabase/tests/jobs_01.sql` บนฐานข้อมูลที่ต้องการเก็บข้อมูล (ไฟล์ล้างตารางธุรกิจก่อนสร้าง fixture) |

### 4.3 เงื่อนไขเข้า (entry criteria)

ต้องครบทุกข้อก่อนเริ่มรอบ UAT

- [ ] `npm run db:test` ผ่านทั้ง 19 ไฟล์ · **2,470 assertion** (§2.4) · exit code 0
- [ ] `node tools/db/run.mjs --test --quiet` — 17 ไฟล์ที่เป็นอิสระจาก seed ผ่านครบ (§2.3)
- [ ] `npm run check:prototype` ผ่านครบ 11 หมวด
- [ ] Checklist การตั้งค่าของ staging ครบตาม `deployment-backup-recovery.md` §2 (Auth · Data API · Database · Storage · Edge Functions · hosting)
- [ ] `supabase migration list` ของ staging ตรงกับไฟล์ใน repo · `0014_schedule_cron.sql` apply แล้วและมี 5 job (TC-F15-6)
- [ ] ชั้น **T7** ผ่านบน staging: PostgREST column grant · `rpc/svc_*` ถูกปฏิเสธด้วย JWT ผู้ใช้ · Auth hooks · MFA · bucket `exports` private · signed URL 60 วินาที
- [ ] โหลด `seed.sql` บน staging แล้วเปิดหน้า 02 ในฐานะจ๋าอั๋น เห็น **ลูกค้าไม่ซ้ำ 1,284 (+12%) · Leads 892 (+8%) · Opportunities 368 (+14%) · ปิดการขาย 215 (+18%) · Conversion (Lead → ขาย) 24.1% (+2.1 pp)**
- [ ] บัญชีทั้ง 14 ล็อกอินได้ · บัญชีที่ `requires_mfa` ยืนยัน TOTP ได้จริง
- [ ] เอกสารนี้ · `user-flows.md` · `permission-matrix.md` แจกให้ผู้ทดสอบแล้ว · อบรมตาม roadmap §6.2 เสร็จแล้ว
- [ ] ทะเบียนข้อบกพร่องและช่องทางแจ้งปัญหาพร้อม **[รอยืนยัน]**
- [ ] DPO ได้รับเอกสาร `docs/04-security/pdpa.md` และข้อความประกาศ `PN-2026-01` **[รอยืนยัน Q9]**

### 4.4 เงื่อนไขจบ (exit criteria)

| # | เกณฑ์ | วิธีวัด | ค่าเป้าหมาย |
|---|---|---|---|
| E-1 | ทุก test case บังคับใน §4.5 ถูกทำและบันทึกผล | ใบบันทึกผลรายบทบาท | 100% |
| E-2 | ไม่มีข้อบกพร่องระดับ **S1 (วิกฤต)** หรือ **S2 (สูง)** ค้าง | ทะเบียนข้อบกพร่อง | 0 รายการ |
| E-3 | ข้อบกพร่อง **S3** มีแผนแก้และผู้รับผิดชอบครบ | ทะเบียนข้อบกพร่อง | ครบทุกรายการ |
| E-4 | คำถาม Acceptance ที่ phase นั้นรับผิดชอบตอบได้จากฐานข้อมูลจริง | §4.8 | ตอบได้ครบ |
| E-5 | ตัวเลขบนหน้าจอตรงข้อ 13 ทุกจุดที่ตรวจ | เทียบกับ `acceptance.sql` | ไม่มีส่วนต่าง |
| E-6 | ไม่มีเหตุการณ์ด้านความเป็นส่วนตัวระหว่าง UAT | `audit.access_logs` · `REVEAL_LIMIT_EXCEEDED` · `SEARCH_LIMIT_EXCEEDED` · `CUSTOMER_VIEW_LIMIT_EXCEEDED` | ไม่มีเหตุที่ต้องรายงาน DPO |
| E-7 | ผู้ทดสอบทุกบทบาทลงนามในใบ sign-off (§4.6) | ใบ sign-off | ครบทุกบทบาท |
| E-8 | EXECUTIVE ตัดสิน **Go** ตาม §4.8 | บันทึกการอนุมัติ | ลงนามแล้ว |

### 4.5 สคริปต์รายบทบาท

> เครื่องหมาย **(บังคับ)** = ต้องทำและบันทึกผลทุกรอบ · **(เลือก)** = ทำเมื่อเวลาพอ
> ทุกบรรทัดอ้าง test case ใน §3 เพื่อให้เปิดดูขั้นตอนและผลที่คาดได้ครบ

#### 4.5.1 คุณขวัญ — `STAFF` @ JAUNPHONE 1 (ใช้งานที่ aal1)

| # | สิ่งที่ทำ | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| 1 | ล็อกอินด้วยอีเมล แล้วล็อกอินซ้ำด้วย `ST-0045` **(บังคับ)** | TC-F13-1 · TC-F13-2 | เข้าหน้า **02 หน้าหลัก** · การ์ด "งานวันนี้ 8 · เกินกำหนด 4 · Lead ที่ดูแล 30 · โอกาสขายที่ดูแล 34 (฿731,600) · ปิดการขาย 30 วัน 44 · ยอดขาย 30 วัน ฿668,400" (ข้อ 14.7) · **ไม่มี Funnel/ตารางสาขา** |
| 2 | เปิด "ลูกค้าล่าสุดของฉัน" **(บังคับ)** | — | 5 ราย: คุณสมชาย ใจดี 11 ก.ย. 10:24 · คุณมานพ รักงาน 10 ก.ย. 16:40 · คุณพิมพ์ชนก ศรีสุข 10 ก.ย. 14:05 · คุณชนากานต์ ใจงาม 10 ก.ย. 11:20 · คุณอรอุมา แสนดี 9 ก.ย. 15:10 (ข้อ 13.5) |
| 3 | หน้า 07 รับลูกค้าเข้าร้าน: รับเข้าคิว → รับคิว → ปิดด้วยผล **(บังคับ)** | TC-F01-1 · TC-F01-3 · TC-F01-5 | คิวใหม่ต่อจาก 004 · ปุ่มกดไม่ได้เมื่อไม่เลือกวัตถุประสงค์ · ปิด visit ได้เมื่อครบเงื่อนไขของ outcome |
| 4 | Quick Capture ลูกค้าใหม่พร้อมตรวจซ้ำ **(บังคับ)** | TC-F03-1 · TC-F03-2 · TC-F03-3 · TC-F03-7 | แผง "พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน 2 รายการ" · บันทึกไม่ได้เมื่อไม่ติ๊กแจ้งประกาศ · เลือกเหตุผล override แล้วสร้างได้ |
| 5 | เปิด Customer 360 ของคุณสมชาย `CUS-2026-000297` **(บังคับ)** | TC-F06-6 · TC-PDPA-4 | ติดต่อ **7** · เข้าร้าน **3** · ซื้อ **2** · ยอดซื้อสะสม **52,800** บาท · ป้าย "ลูกค้าซื้อซ้ำ · VIP · ติดตามอยู่" · เบอร์แสดง `081-XXX-5678` · "เป็นลูกค้ามา 8 เดือน" · "นัดติดตามถัดไป 18 ก.ย. 2569 10:00" |
| 6 | กด "แสดง" และ "โทร" บนเบอร์ **(บังคับ)** | TC-PDPA-4 · TC-F02-3 | เห็นค่าเต็มหลังกดเท่านั้น · มีแถว `CONTACT_REVEALED` · ปุ่มโทรสร้าง interaction `OUTBOUND` แบบร่างให้ยืนยันหลังวางสาย |
| 7 | หน้า 08 งานของวันนี้ **(บังคับ)** | TC-F06-3 | ทั้งหมด **12** = วันนี้ **8** + เกินกำหนด **4** · งาน 10:00 อยู่กลุ่ม "วันนี้" พร้อมป้าย "เลยเวลา" |
| 8 | ปิด task next action แล้วตั้ง next action ใหม่ **(บังคับ)** | TC-F06-4 | ระบบบังคับตั้ง next action ใหม่ · task ใบใหม่ถูกสร้าง |
| 9 | สร้าง lead → แปลงเป็นโอกาสขาย → สร้างและส่งใบเสนอราคา → ปิด WON **(บังคับ)** | TC-F04-1 · TC-F04-5 · TC-F05-3 · TC-F05-6 | opportunity เลื่อนเป็น "เสนอราคา" อัตโนมัติเมื่อใบเป็น `SENT` · ปิด WON ต้องกรอกยอด |
| 10 | ลองลากการ์ดย้อนเป็น "สนใจ" บนหน้า 06 **(บังคับ)** | TC-F05-5 | **ทำไม่ได้** + toast บอกเหตุผล (D48) |
| 11 | เปิดหน้าจอมือถือ: bottom nav 5 ช่อง + ปุ่มกลม "รับลูกค้า" **(บังคับ)** | — | การ์ด "งานทั้งหมด 12 · เกินกำหนด 4" · หน้า reports/users/settings แสดง "กรุณาใช้งานบนคอมพิวเตอร์" (ข้อ 14.4) |
| 12 | ลองแก้ลูกค้าที่ไม่ใช่ของตน (เช่นลูกค้าของคุณคิม) **(บังคับ)** | TC-NEG-2 | **แก้ไม่ได้** — STAFF มี `customer.update` scope **O** เท่านั้น (Q11) |
| 13 | รับคำขอเจ้าของข้อมูลจากเมนู ⋮ **(เลือก)** | TC-F12-1 | ได้เลข `DSR-…` · ครบกำหนด 30 วัน · เห็นเฉพาะคำขอของตน |
| 14 | บันทึกโน้ตที่มีเลข 13 หลักรูปแบบเลขบัตรประชาชน **(บังคับ)** | TC-PDPA-9 | **ถูกปฏิเสธ** พร้อมข้อความเตือนบนฟอร์ม |

#### 4.5.2 คุณนัท — `SUPERVISOR` @ JAUNPHONE 1 (หัวหน้า `JP1-SALES` · ต้อง aal2)

| # | สิ่งที่ทำ | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| 1 | ล็อกอินแล้ว **หยุดที่ aal1** ลองเปิดหน้า 03 และ 05 **(บังคับ)** | TC-NEG-4 · TC-F13-4 | **เข้าไม่ได้/0 แถว** — ที่ aal1 ได้สิทธิ์เท่ากับไม่มีบทบาท |
| 2 | ยืนยัน TOTP จน aal2 แล้วเปิดหน้า 02 **(บังคับ)** | TC-NEG-3 | Leads **296** · Opportunities **120** · ปิดการขาย **82** · ยอดขาย **฿1,245,000** · Conversion (Lead → ขาย) **27.7%** · งานเกินกำหนดของทีม **7** (ข้อ 13.6 · 14.7) |
| 3 | เปิด widget "ผลงานรายพนักงานในทีม" **(บังคับ)** | — | คุณขวัญ Leads 154 · Opp 63 · Sales 44 · ฿668,400 ／ คุณคิม 142 · 57 · 38 · ฿576,600 ／ ไม่มี owner 2 (ข้อ 13.6) |
| 4 | รับแจ้งเตือน `LEAD_UNASSIGNED` แล้วมอบ lead ให้คุณคิม **(บังคับ)** | TC-F04-7 · TC-F07-1 · TC-F07-3 | กระดิ่งมี 3 รายการที่ยังไม่อ่าน (`LEAD_UNASSIGNED` ×2 · `DUPLICATE_SUSPECTED` สรุป 10 ก.ย. 18:00) · มอบได้เพราะ scope T รวมรายการที่ owner ว่าง |
| 5 | ลองมอบ lead ให้พนักงานที่ไม่ใช่สมาชิกทีม **(บังคับ)** | TC-F07-3 | **ปฏิเสธ** |
| 6 | เปิดหน้า 12 แล้วตัดสินคู่ซ้ำ `CUS-2026-006633` ↔ `CUS-2026-002118` **(บังคับ)** | TC-F10-1 · TC-F10-3 | ตัดสินได้ (ผู้ดูแลคือคุณคิมซึ่งเป็นสมาชิกทีมที่ตนเป็นหัวหน้า) · ต้อง aal2 |
| 7 | ลอง reopen lead ที่ปิดแล้ว **(บังคับ)** | TC-F04-6 | **ปฏิเสธ** — SUPERVISOR ไม่มี `lead.reopen` |
| 8 | เปิดหน้า 09 รายงาน แท็บ "พนักงาน" **(เลือก)** | — | เห็นเฉพาะระดับทีมของตน (`report.staff_performance` scope T) |

#### 4.5.3 คุณเจ — `BRANCH_MANAGER` @ JAUNPHONE 1 (ต้อง aal2)

| # | สิ่งที่ทำ | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| 1 | เปิดหน้า 02 **(บังคับ)** | — | ลูกค้าไม่ซ้ำวันนี้ **7 (+17%)** · ลูกค้าไม่ซ้ำ **412 (+12%)** · Leads **298 (+8%)** · Opportunities **120 (+14%)** · ปิดการขาย **82 (+19%)** · Conversion (Lead → ขาย) **27.5% (+2.5 pp)** · widget: Funnel JP1 · แหล่งที่มา JP1 · เหตุผลที่ไม่สำเร็จ JP1 · **ผลงานรายพนักงาน** · กิจกรรมล่าสุด (ข้อ 14.7) |
| 2 | ตรวจ Funnel ของ JP1 **(บังคับ)** | — | 1,008 → 298 (29.6%) → 120 (11.9%) → 82 (8.1%) (ข้อ 13.2b) |
| 3 | เปลี่ยนผู้รับผิดชอบ `LD-2026-007512` คุณขวัญ → คุณคิม เหตุผล `SHIFT_CHANGE` **(บังคับ)** | TC-F07-1 | แถว `ownership_changes` · audit `LEAD_ASSIGNED` · คุณคิมได้แจ้งเตือน · lead นับเป็นของคุณคิมในผลงานรายพนักงาน |
| 4 | เชิญพนักงานใหม่ที่ JP1 **(บังคับ)** | TC-F08-1 · TC-F08-2 · TC-F08-3 | เห็นเฉพาะบทบาท `STAFF`/`SUPERVISOR` · ไม่มีตัวเลือกสาขา · `employee_code` ซ้ำถูกปฏิเสธ |
| 5 | ปิดใช้งานพนักงานที่มี opportunity เปิดอยู่ **(บังคับ)** | TC-F08-5 · TC-F08-6 | opportunity → ผู้จัดการสาขา · lead/task → owner ว่าง · ปิดตนเองไม่ได้ · ปิดบัญชีนอกสาขาตนไม่ได้ |
| 6 | ยื่นคำขอส่งออก 412 แถว แล้วยื่น 501 แถว **(บังคับ)** | TC-F11-2 | 412 → **อนุมัติทันที** (`approved_by` NULL) · 501 → **ถูกปฏิเสธ** (เกินเพดาน 500) · ครั้งที่ 4 ของวันถูกปฏิเสธ |
| 7 | เปิดหน้า 12 ศูนย์คุณภาพข้อมูลของ JP1 **(บังคับ)** | TC-DQ-1 … TC-DQ-9 | `DUPLICATE_SUSPECTED` 5 · `MISSING_PHONE` 7 · `INVALID_PHONE` 2 · `LEAD_WITHOUT_OWNER` 2 · `LEAD_WITHOUT_OUTCOME` 6 · `OVERDUE_FOLLOWUP` 6 · `INCOMPLETE_CUSTOMER` 13 · `WON_WITHOUT_TRANSACTION` 4 · `VISIT_UNRECORDED` 9 (ข้อ 13.12) |
| 8 | รับทราบ visit `UNRECORDED` **(บังคับ)** | TC-F01-8 · TC-DQ-9 | ตั้ง `unrecorded_ack_by/_at` · **แก้ outcome ข้ามวันไม่ได้** · รายการยังนับจนพ้น 7 วัน |
| 9 | เปิด reopen opportunity ที่ `LOST` **(บังคับ)** | TC-F05-8 | สำเร็จ → `FOLLOW_UP` + ต้องตั้ง next action ใหม่ |
| 10 | ลองเปิดข้อมูลของ JP2 **(บังคับ)** | TC-NEG-6 (มุมกลับ) | **ไม่เห็น** — ขอบเขตจำกัดที่ JP1 |
| 11 | ลงทะเบียนแท็บเล็ต counter ของ JP1 **(เลือก)** | TC-F13-8 | อุปกรณ์เป็น counter · ปล่อยว่าง 10 นาที → ล็อกหน้าจอ |

#### 4.5.4 คุณแพร — `BUSINESS_ADMIN` (ทั้งองค์กร · ต้อง aal2)

| # | สิ่งที่ทำ | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| 1 | เปิดหน้า 02 **(บังคับ)** | — | การ์ดชุดทั้งองค์กร + **แถวคุณภาพข้อมูล**: Capture **87.0%** · Outcome **95.4%** · Follow-up **85.0%** · Duplicate **0.1%** · Missing **0.4%** (ข้อ 14.7) |
| 2 | อนุมัติคำขอส่งออก `EX-2026-000031` ของคุณมายด์ **(บังคับ)** | TC-F11-3 | กระดิ่งมี 1 รายการ `EXPORT_APPROVAL_REQUIRED` · อนุมัติแล้วได้ `APPROVED` → `GENERATED` · ผู้ขอได้ `EXPORT_DECIDED` และ `EXPORT_READY` |
| 3 | ลองดาวน์โหลดไฟล์ของคำขอที่ตนอนุมัติ **(บังคับ)** | TC-F11-4 | **ดาวน์โหลดไม่ได้** — ผู้ขอเท่านั้น |
| 4 | ตรวจคอลัมน์ในไฟล์ของ MARKETING **(บังคับ)** | TC-F11-6 | มีเฉพาะ `customer_no` · `display_name` + ช่องทางที่ลูกค้ายินยอม · **ไม่มีโน้ต สรุปการติดต่อ สรุปธุรกรรม IMEI** · มีลายน้ำในแถวหัวไฟล์และชื่อไฟล์ |
| 5 | จัดการ Master Data: ปิดใช้งานค่า lookup **(บังคับ)** | — | **ห้ามลบ** ใช้ `is_active = false` · ค่าที่ `is_system = true` ปิดใช้งานไม่ได้ · ต้อง aal2 (`master_data.manage` 🔐) |
| 6 | รวมลูกค้าคู่ `CUS-2026-006633` ↔ `CUS-2026-002118` **(บังคับ)** | TC-F10-5 · TC-F10-7 | เลข `MG-…` · ผู้ถูกรวมเป็น `MERGED` · เปิด `customer_no` เดิม → redirect ไป survivor · KPI นับที่ survivor |
| 7 | จบ flow DSR `DELETION` ร่วมกับ BA อีกคน **(บังคับ)** | TC-F12-2 · TC-F12-5 · TC-F12-6 | BA คนที่ยืนยันตัวตนทำนิรนามเองไม่ได้ · หลังทำนิรนามชื่อเป็น "ลูกค้านิรนาม CUS-…" และ **ยอด Sales 215 ของ P ไม่เปลี่ยน** |
| 8 | ตรวจ audit ของการแก้เบอร์ **(บังคับ)** | TC-PDPA-5 | เห็น `081-XXX-1234` → `089-XXX-5678` แบบปิดบัง · **ไม่มีค่าเต็ม** |
| 9 | แก้ค่าตั้งเกณฑ์ธุรกิจ (เช่น `sla.lead_not_contacted_min`) **(เลือก)** | — | `api.update_setting` ต้อง aal2 (`settings.business` 🔐) · audit `SETTINGS_UPDATED` · คีย์ที่ `editable_by` เป็น SA แก้ไม่ได้ |
| 10 | ลองเปิดหน้า 18 แท็บเชิงเทคนิค **(บังคับ)** | — | **เข้าไม่ได้** — `settings.system` เป็นของ SYSTEM_ADMIN |

#### 4.5.5 จ๋าอั๋น — `EXECUTIVE` (ต้อง aal2)

| # | สิ่งที่ทำ | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| 1 | ล็อกอินแล้ว **หยุดที่ aal1** เปิดหน้า 02 **(บังคับ)** | TC-NEG-11 | **ถูกปฏิเสธ** |
| 2 | ยืนยัน TOTP จน aal2 แล้วเปิดหน้า 02 **(บังคับ)** | TC-NEG-10 | ลูกค้าไม่ซ้ำวันนี้ **16 (+14%)** · ลูกค้าไม่ซ้ำ **1,284 (+12%)** · Leads **892 (+8%)** · Opportunities **368 (+14%)** · ปิดการขาย **215 (+18%)** · Conversion (Lead → ขาย) **24.1% (+2.1 pp)** |
| 3 | ตอบคำถาม Acceptance 12 ข้อจากหน้าจอ **(บังคับ)** | §4.8 | ทุกข้อตอบได้ **จากฐานข้อมูลจริง** ไม่ใช่ตัวเลขที่พิมพ์ไว้ |
| 4 | เปิดโดนัท "แหล่งที่มาลูกค้า" **(บังคับ)** | — | กลาง **1,284** · WALK_IN 462 (36.0%) · LINE 360 (28.0%) · FACEBOOK 205 (16.0%) · INSTAGRAM 103 (8.0%) · TIKTOK 90 (7.0%) · PHONE 64 (5.0%) · **`WEBSITE` = 0 ไม่แสดงบนกราฟ** (ข้อ 13.3) |
| 5 | เปิดกราฟ "เหตุผลที่ไม่สำเร็จ" **(บังคับ)** | — | 5 อันดับ + "อื่น ๆ": `PRICE` 83 (28.0%) · `COMPARING` 53 (17.9%) · `NOT_READY` 47 (15.9%) · `DOCUMENTS` 36 (12.2%) · `CHANGED_MIND` 30 (10.1%) · อื่น ๆ 47 (15.9%) รวม **296** (ข้อ 13.4) |
| 6 | เปิดตาราง "ผลงานรายสาขา" **(บังคับ)** | — | JP1 1,008/412/298/120/82/฿1,245,000 (+12%) · JP2 842/356/241/98/61/฿906,500 (+8%) · JP3 694/280/187/86/45/฿712,300 (+5%) · JP4 581/236/166/64/27/฿468,900 (+11%) · รวม 3,125/1,284/892/368/215/฿3,332,700 (+9%) (ข้อ 13.2) |
| 7 | เปิดหน้า 09 ทุกแท็บ **(บังคับ)** | TC-F11-7 | `ภาพรวม` · `ลูกค้า` · `การขาย` · `ช่องทาง` · `พนักงาน` · `สาขา` · ปุ่ม "ส่งออก" ได้ตัวเลขรวม **ไม่มี PII** และไม่ต้องอนุมัติ |
| 8 | อนุมัติคำขอบทบาท `RG-2026-0003` **(บังคับ)** | TC-F09-3 · TC-F09-4 | กระดิ่งมี 1 รายการ `ROLE_GRANT_APPROVAL_REQUIRED` · อนุมัติได้เมื่อ aal2 · อนุมัติคำขอที่ตนเป็นผู้รับไม่ได้ |
| 9 | ลองแก้ข้อมูลลูกค้า **(บังคับ)** | TC-NEG-10 | **แก้ไม่ได้** — EXECUTIVE มี `customer.read` G แต่ไม่มี `customer.update` |
| 10 | ตรวจว่าหน้า users ของตนทำอะไรได้บ้าง **(บังคับ)** | — | เปิดได้เพื่อ **ดูและอนุมัติคำขอบทบาทเท่านั้น** (ข้อ 8.1) |

#### 4.5.6 สคริปต์ของผู้สังเกตการณ์ (ทำครั้งเดียวต่อรอบ)

| ผู้เล่น | สิ่งที่ทำ **(บังคับ)** | test case | ผลที่ต้องเห็น |
|---|---|---|---|
| คุณปุ๊ก (OP) | เปิดหน้า 03 · 05 · 06 · 07 · 08 · 12 ของทุกสาขา แล้วลองแก้ | TC-NEG-8 | **อ่านได้ทุกสาขา แก้ไม่ได้ทั้งหมด** · เปิดเบอร์เต็มไม่ได้ (ไม่มี `customer.pii.reveal`) · เห็น task ได้ (`task.read` B) |
| คุณมายด์ (MK) | เปิดหน้า 03 · 05 · 14 · 15 | TC-NEG-9 · TC-NEG-27 | หน้า 03/05 **เข้าไม่ได้** · หน้า 14 เข้าได้เฉพาะแท็บ Tag/แคมเปญ · ยื่นคำขอส่งออกได้ · **ช่องค้นหากลางถูกซ่อน** |
| คุณต้น (SA) | เปิดหน้า 18 · 16 แล้วลองเปิดหน้า 03 · 05 | TC-NEG-13 · TC-NEG-19 · TC-NEG-26 | ตั้งค่าเชิงเทคนิคได้ · security log เห็นเฉพาะ `login_events` + audit ของสิทธิ์/บัญชี · **ไม่มีสิทธิ์ข้อมูลลูกค้าเลย** · หน้าแรกหลังล็อกอินคือ **18-settings** |
| คุณฝน (ST@JPON) | เปิดหน้า 02 · 03 · 06 · 08 · 11 · 12 | TC-NEG-7 | ทุกหน้าเป็น **empty state** · จำนวนเป็น 0 · KPI ที่ไม่ผูกพนักงานและอัตรา 0/0 แสดง **`–`** |
| คุณบอส (BM@JP2) | ลองเปิด `CUS-2026-000297` และ `OP-2026-002998` | TC-NEG-6 | **ไม่เห็นทั้งหมด** · Dashboard แสดงแถว JAUNPHONE 2 เท่านั้น |
| QA | เรียก PostgREST/RPC ตรงด้วย JWT ของแต่ละบัญชีสำหรับทุกช่อง ✗ ในตาราง §3.16 | TC-NEG-1 … TC-NEG-27 | ได้ **0 แถว** หรือ **`42501`** ทุกกรณี — ยืนยันว่าการปฏิเสธมาจากฐานข้อมูล ไม่ใช่การซ่อนปุ่ม |

### 4.6 ใบ sign-off

| # | บทบาท | ผู้ทดสอบ (ชื่อจริง) | วันที่ | case บังคับที่ทำ / ทั้งหมด | ข้อบกพร่องที่พบ (S1/S2/S3/S4) | ผล | ลงนาม |
|---|---|---|---|---|---|---|---|
| 1 | `STAFF` | **[รอยืนยัน]** | | 13 / 13 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 2 | `STAFF` (คนที่ 2) | **[รอยืนยัน]** | | | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 3 | `SUPERVISOR` | **[รอยืนยัน]** | | 7 / 7 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 4 | `BRANCH_MANAGER` | **[รอยืนยัน]** | | 10 / 10 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 5 | `BUSINESS_ADMIN` | **[รอยืนยัน]** | | 9 / 9 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 6 | `BUSINESS_ADMIN` (คนที่ 2) | **[รอยืนยัน]** | | | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 7 | `EXECUTIVE` | **[รอยืนยัน]** | | 10 / 10 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 8 | `OPERATIONS` | **[รอยืนยัน]** | | 1 / 1 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 9 | `MARKETING` | **[รอยืนยัน]** | | 1 / 1 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 10 | `SYSTEM_ADMIN` | **[รอยืนยัน]** | | 1 / 1 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 11 | QA (ชั้นฐานข้อมูล §3.16) | **[รอยืนยัน]** | | 27 / 27 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| 12 | DPO (TC-PDPA-*) | **[รอยืนยัน Q8]** | | 12 / 12 | | ☐ ผ่าน ☐ ผ่านมีเงื่อนไข ☐ ไม่ผ่าน | |
| — | **สรุปรอบ UAT** | ผู้ดำเนินการ UAT | | | | ☐ Go ☐ Conditional Go ☐ No-Go | |
| — | **อนุมัติ** | `EXECUTIVE` | | | | ☐ Go ☐ Conditional Go ☐ No-Go | |

> "ผ่านมีเงื่อนไข" ใช้ได้เฉพาะเมื่อข้อบกพร่องที่เหลือเป็น **S3/S4** และมีแผนแก้พร้อมผู้รับผิดชอบและกำหนดเวลา

### 4.7 ระดับข้อบกพร่องและการจัดลำดับ

**ข้อเสนอผู้เขียน** — CANONICAL ไม่มีมาตราความรุนแรง (U5) · ลำดับความสำคัญยึดหลักของ roadmap §6.5: **กระทบข้อมูลส่วนบุคคล > กระทบการให้บริการหน้าร้าน > กระทบตัวเลข > ความสะดวก**

| ระดับ | นิยาม | ตัวอย่าง | เวลาตอบสนอง **[รอยืนยัน]** | ผลต่อ go/no-go |
|---|---|---|---|---|
| **S1 วิกฤต** | ข้อมูลส่วนบุคคลรั่วหรือสิทธิ์ผิด · ข้อมูลเสียหาย/สูญหาย · ระบบใช้งานไม่ได้ทั้งระบบ | ผู้ใช้เห็นลูกค้าของสาขาอื่น · `value_raw` หลุดผ่าน API · การปฏิเสธมาจาก UI เท่านั้น ไม่ใช่ฐานข้อมูล · audit เก็บค่าเต็มของ PII · push/email มีชื่อลูกค้า | ทันที · หยุดรอบ UAT | **No-Go** ทันที |
| **S2 สูง** | flow หลักทำไม่ได้ · ตัวเลข KPI ผิดจากข้อ 13 · งานตามเวลาไม่ทำงาน | รับคิวแล้ว owner ไม่ถูกตั้ง · `CLOSE_RATE` ไม่ตรง 58.4% · `job_close_stale_visits` ไม่ปิด visit ค้าง · การแจ้งเตือนซ้ำทุกวัน (`dedupe_key` ผิด) | ภายในรอบเดียวกัน | **No-Go** จนกว่าจะแก้ |
| **S3 ปานกลาง** | flow ทำได้แต่มีทางอ้อม · ป้าย/ข้อความผิด · การจัดรูปแบบตัวเลขผิด | ป้ายการ์ดเขียน "เดือนนี้" กับข้อมูล 30 วัน (D27) · แสดง `24%` แทน `24.1%` · ปุ่มที่ไม่มีสิทธิ์แสดงแบบเปิด (แต่ฐานข้อมูลยังปฏิเสธ) | ก่อน go-live ของ phase นั้น | **Conditional Go** ถ้ามีแผนแก้ |
| **S4 ต่ำ** | ความสะดวก · ข้อเสนอปรับปรุง | ลำดับช่องในฟอร์ม · ข้อความช่วยเหลือ · ขนาดปุ่มบนแท็บเล็ต | ตามคิวพัฒนา | ไม่กระทบ |

**ขั้นตอนจัดการข้อบกพร่อง**

1. ผู้ทดสอบบันทึก: รหัส test case · บัญชีที่ใช้ · เวลา (Asia/Bangkok) · สิ่งที่เห็น · สิ่งที่คาด · ภาพหน้าจอ · `request_id` ถ้ามี
2. ผู้ดำเนินการ UAT จัดระดับภายใน **[รอยืนยัน]** ชั่วโมงทำการ · S1 แจ้งผู้ดูแลระบบและ DPO ทันที
3. ข้อบกพร่องที่เกี่ยวกับสิทธิ์ต้องยืนยันซ้ำที่ **ชั้นฐานข้อมูล** ก่อนปิด (เรียก RPC/PostgREST ตรง) — ถ้าฐานข้อมูลปฏิเสธถูกต้องแล้วแต่ UI แสดงปุ่ม ให้ลดเป็น **S3**
4. การแก้ที่กระทบสิทธิ์ (`core.role_permissions` · policy · helper) ต้องผ่าน migration + test ข้อ 13.13 และได้รับอนุมัติตาม deployment §3.5
5. ปิดข้อบกพร่องได้เมื่อ: มี test อัตโนมัติครอบเพิ่ม (T2–T4 หรือ T7) **และ** ผู้ทดสอบเดิมยืนยันซ้ำ

### 4.8 เกณฑ์ Go / No-Go ผูกกับคำถาม Acceptance

**กติกา:** "ตอบได้" = ตอบจาก **ฐานข้อมูลจริง** ผ่าน `api.get_kpis` / `api.get_report` ไม่ใช่ตัวเลขที่พิมพ์ไว้ (ข้อ 13.0 กติกา 2) · **ถ้ายังตอบไม่ได้ข้อใดข้อหนึ่ง ถือว่า module ที่เกี่ยวข้องยังไม่ผ่าน Acceptance** (A44)

| # | คำถาม (A44 · B27) | ตอบด้วย | ค่าที่ต้องได้บน staging + seed | ผู้ยืนยัน | Phase ที่ต้องตอบได้ | test อัตโนมัติ |
|---|---|---|---|---|---|---|
| **AC1** | วันนี้มีคนเข้าร้านกี่คน | `VISITS` · `WALKIN_VISITS` preset `TODAY` | **17** การมาติดต่อ (Walk-in 9 · ออนไลน์/โทร 8) · ลูกค้าไม่ซ้ำวันนี้ **16 (+14%)** | EXECUTIVE · BRANCH_MANAGER | 1 | `acceptance.sql` `O01` |
| **AC2** | เดือนนี้มีลูกค้าไม่ซ้ำกี่คน | `UNIQUE_CUSTOMERS` preset `LAST_30_DAYS` | **1,284 (+12%)** | EXECUTIVE | 1 (preset ครบ = 3) | `acceptance.sql` `O02` |
| **AC3** | ลูกค้าใหม่กี่คน | `NEW_CUSTOMERS` (`first_seen_at ∈ P`) | **809 (63.0%)** | EXECUTIVE | 1 | `acceptance.sql` `O03` |
| **AC4** | ลูกค้าเก่ากี่คน | `RETURNING_CUSTOMERS` | **475 (37.0%)** | EXECUTIVE | 1 | `acceptance.sql` `O04` |
| **AC5** | ลูกค้ามาจากช่องทางไหน | `customers.first_channel_code` → `api.get_report('CHANNELS')` | เมทริกซ์ช่องทาง × สาขา รวม **1,284** (ข้อ 13.3) | EXECUTIVE · MARKETING | 1 | `acceptance.sql` `O05` |
| **AC6** | สนใจสินค้า/บริการอะไร | `interest_code` บน Customer 360 · การ์ด pipeline (D51) | lead ใน P ระบุ `interest_code` **ครบทุกใบ** (5 ชนิดที่สร้าง lead) · **รายงานรวมตามความสนใจ = Phase 3 [รอยืนยัน]** | STAFF · BRANCH_MANAGER | 2 (ระดับรายการ) | `acceptance.sql` `O06` · `O06b` |
| **AC7** | ใครเป็น Owner | `customers.owner_staff_id` · `leads/opportunities/tasks.owner_staff_id` | lead เปิดอยู่ที่ยังไม่มีผู้ดูแลเหลือ **8** รายการ · **opportunity ที่เปิดอยู่มีผู้ดูแลครบทุกใบ** | SUPERVISOR · BRANCH_MANAGER | 1 → 2 | `acceptance.sql` `O07` · `O07b` |
| **AC8** | ซื้อหรือไม่ซื้อ | เหตุการณ์การซื้อ (ข้อ 3.1) | ผู้ซื้อ **209** ราย · `SALES` **215** · `SALES_AMOUNT` **฿3,332,700** · ไม่สำเร็จรวม **296** | EXECUTIVE | 2 | `acceptance.sql` `O08` · `O08b` |
| **AC9** | ถ้าไม่ซื้อ เพราะอะไร | `lost_reason_code` → กราฟ 5 อันดับ + "อื่น ๆ" | lead และ opportunity ที่ `LOST` **มีเหตุผลครบทุกใบ** · `PRICE` 83 (28.0%) สูงสุด | EXECUTIVE · BRANCH_MANAGER | 2 | `acceptance.sql` `O09` · `O09b` |
| **AC10** | ใครต้อง Follow-up ต่อ | `OPEN_FOLLOWUP_CUSTOMERS` · task `FOLLOW_UP` | **117** ราย | SUPERVISOR · STAFF | 2 | `acceptance.sql` `O10` |
| **AC11** | แต่ละสาขา Conversion เท่าไร | `CONV_LEAD_TO_SALE` รายสาขา | มีค่าให้ทุกสาขา (JP1–JP4 · JPON) · JP1 **27.5%** · JP2 **25.3%** · JP3 **24.1%** · JP4 **16.3%** · รวม **24.1%** | EXECUTIVE | ข้อมูลครบเมื่อจบ 2 · หน้ารายงาน = 3 | `acceptance.sql` `O11` |
| **AC12** | มีข้อมูลซ้ำหรือข้อมูลไม่ครบเท่าไร | `DUPLICATE_RATE` · `MISSING_REQUIRED_RATE` | **0.1%** (16 / 14,962) · **0.4%** (61 / 14,962) · ทั้งคู่ **ต่ำกว่าเป้า < 2%** ✓ | BUSINESS_ADMIN | 1 | `acceptance.sql` `O11b` · `O11c` |

**การตัดสิน**

| ผล | เงื่อนไข |
|---|---|
| **Go** | E-1 … E-8 ครบ · AC ที่ phase นั้นรับผิดชอบตอบได้ครบ · **ไม่มี S1/S2 ค้าง** · EXECUTIVE ลงนาม |
| **Conditional Go** | AC ครบและไม่มี S1/S2 แต่มี **S3** ค้าง — ต้องมีแผนแก้ ผู้รับผิดชอบ และกำหนดเวลา · ระบุขอบเขตที่เปิดใช้จริงได้ (เช่น pilot JP1 เท่านั้น) |
| **No-Go** | มี **S1** แม้รายการเดียว · หรือมี **S2** ค้าง · หรือ AC ข้อใดข้อหนึ่งตอบไม่ได้ · หรือตัวเลขบนหน้าจอไม่ตรงข้อ 13 |

**ความสัมพันธ์กับ pilot และ rollout**

- **ก่อน pilot JP1:** ต้องตอบ **AC1 · AC2 · AC3 · AC4 · AC5 · AC12** ได้ (Phase 1) และผ่าน E-1 … E-8 · จากนั้นเข้าเกณฑ์ pilot `P-1` … `P-10` ของ roadmap §6.3
- **ก่อน rollout สาขาที่เหลือ:** pilot ต้องผ่าน `P-1` … `P-10` **และ** UAT รอบที่สองตอบ **AC1 … AC12 ครบทั้ง 12 ข้อ** (V1 = จบ Phase 3 · D26)
- ผลการตัดสินบันทึกในใบ sign-off §4.6 และในบันทึก release ตาม `deployment-backup-recovery.md` §11

---

## 5. ตารางเทียบ (traceability)

### 5.1 Flow → test case → ไฟล์ทดสอบอัตโนมัติ

| Flow (`user-flows.md`) | test case | ไฟล์ทดสอบที่ครอบ | ช่องว่างที่ต้องทำที่ T7/T8 |
|---|---|---|---|
| F01 รับลูกค้า Walk-in | TC-F01-1 … TC-F01-8 | `api_02_work.sql` · `02_schema_stage2.sql` · `rls_04_activity.sql` · `rls_07_transition.sql` | การกดพร้อมกันจริงบนสองเครื่อง (T8) |
| F02 ออนไลน์/โทร | TC-F02-1 … TC-F02-5 | `api_02_work.sql` · `rls_04_activity.sql` · `02_schema_stage2.sql` | — |
| F03 Quick Capture · ตรวจซ้ำ · ผูกสาขา | TC-F03-1 … TC-F03-8 | `api_01_customer.sql` · `rls_09_links_and_writes.sql` | — |
| F04 วงจร Lead | TC-F04-1 … TC-F04-7 | `rls_05_sales.sql` · `rls_07_transition.sql` · `api_02_work.sql` · `02_schema_stage2.sql` | — |
| F05 Opportunity · ใบเสนอราคา | TC-F05-1 … TC-F05-9 | `rls_05_sales.sql` · `rls_07_transition.sql` · `02_schema_stage2.sql` · `jobs_01.sql` | การลากการ์ดบน UI (T8) |
| F06 Next action · task | TC-F06-1 … TC-F06-6 | `02_schema_stage2.sql` · `rls_06_work.sql` · `rls_07_transition.sql` · `acceptance.sql` | dialog บังคับตั้ง next action ใหม่ (T8) |
| F07 เปลี่ยนผู้รับผิดชอบ | TC-F07-1 … TC-F07-5 | `api_02_work.sql` · `rls_09_links_and_writes.sql` | — |
| F08 เชิญ · เปิดใช้งาน · ปิดใช้งาน | TC-F08-1 … TC-F08-8 | `api_03_admin.sql` · `02_schema_stage2.sql` | Edge Functions · Auth hooks · MFA enroll (T7) |
| F09 คำขอบทบาทสูง | TC-F09-1 … TC-F09-5 | `api_03_admin.sql` · `rls_08_core_ref_app_audit.sql` | อีเมลแจ้งเตือน (T7) |
| F10 รวมลูกค้า | TC-F10-1 … TC-F10-7 | `api_01_customer.sql` · `rls_03_customer.sql` · `rls_09_links_and_writes.sql` | — |
| F11 ส่งออกข้อมูลลูกค้า | TC-F11-1 … TC-F11-7 | `api_03_admin.sql` · `jobs_01.sql` · `analytics_02_reports.sql` | `generate-export` · Storage · signed URL · ลายน้ำในไฟล์ (T7) |
| F12 DSR · ทำนิรนาม | TC-F12-1 … TC-F12-9 | `api_03_admin.sql` · `jobs_01.sql` · `01_schema_stage1.sql` | `build_dsr_package` ลงไฟล์จริง (T7) |
| F13 เข้าสู่ระบบ · MFA · ล็อก | TC-F13-1 … TC-F13-9 | `api_03_admin.sql` · `rls_personas.sql` · `rls_09_links_and_writes.sql` | **ส่วนใหญ่ต้องทำที่ T7/T8** (Supabase Auth · hooks · PWA) |
| F14 แจ้งเตือน · ยกระดับ | TC-F14-1 … TC-F14-7 | `jobs_01.sql` · `rls_06_work.sql` · `acceptance.sql` | push · email payload (T7) |
| F15 งานตามเวลา | TC-F15-1 … TC-F15-6 | `jobs_01.sql` | `pg_cron` มี 5 job และรันเป็น `postgres` (T7) |
| ข้อ 13.13 ตรวจสิทธิ์รายบุคคล | TC-NEG-1 … TC-NEG-27 | `rls_personas.sql` · `rls_01`…`rls_09` | column grant ผ่าน HTTP · `rpc/svc_*` (T7) |
| ข้อ 12.3 คุณภาพข้อมูล | TC-DQ-1 … TC-DQ-11 | `acceptance.sql` (`L`) · `analytics_01_kpis.sql` · `analytics_02_reports.sql` | — |
| ข้อ 10 PDPA | TC-PDPA-1 … TC-PDPA-12 | `api_01_customer.sql` · `api_03_admin.sql` · `02_schema_stage2.sql` · `rls_03_customer.sql` | header จริง · push/email (T7) |

### 5.2 ข้อของ CANONICAL → test case ที่ตรวจ

| ข้อ | หัวข้อ | test case หลัก |
|---|---|---|
| 1.2 · 1.3 | เวลาและการปัด | TC-F06-3 · §4.2 · `analytics_01_kpis.sql` |
| 3.1 · 3.2 · 3.3 | นิยามหน่วยนับ · `first_seen_at` · กติกา visit | TC-F01-1 · TC-F02-1 · TC-F02-2 · TC-F02-3 |
| 3.4 · 3.5 | lifecycle · ป้ายเสริม | TC-F04-1 · TC-F05-6 · TC-F06-6 |
| 4.1 · 4.2 | สถานะ visit · outcome | TC-F01-3 · TC-F01-5 · TC-F01-7 · TC-F15-1 |
| 4.3 | สถานะ lead | TC-F04-1 · TC-F04-3 · TC-F04-4 |
| 4.4 · 4.6 | ขั้น opportunity · ใบเสนอราคา | TC-F05-3 · TC-F05-4 · TC-F05-5 · TC-F05-9 |
| 4.7 | task และกลุ่มงาน | TC-F06-1 · TC-F06-3 · TC-F06-5 |
| 6.1 | เลขอ้างอิง | TC-F01-1 · TC-F03-1 · `02_schema_stage2.sql` |
| 6.2 · 6.4 | Quick Capture · ช่องทางติดต่อ | TC-F03-1 · TC-F03-2 · TC-PDPA-4 |
| 6.5 · 6.6 | ตรวจซ้ำ · การมองเห็นข้ามสาขา | TC-F03-3 … TC-F03-6 · TC-F03-8 · TC-NEG-17 |
| 6.7 | การรวมลูกค้า | TC-F10-1 … TC-F10-7 |
| 7.1 · 7.2 · 7.3 | บทบาท · การมอบ/ถอน · เชิญ/ปิดใช้งาน | TC-F08-* · TC-F09-* · TC-NEG-19 · TC-NEG-23 |
| 8.0 · 8.1 | scope และตารางสิทธิ์ | TC-NEG-1 … TC-NEG-27 · `01_schema_stage1.sql` |
| 8.2 | การส่งออกข้อมูลลูกค้า | TC-F11-1 … TC-F11-6 |
| 8.3 | สิทธิ์ของตารางย่อย | TC-F14-6 · TC-PDPA-3 · TC-F10-1 |
| 9.1 | การตรวจสิทธิ์อยู่ในฐานข้อมูล | §0.3 · §4.5.6 (QA) · TC-NEG-* ทุกข้อ |
| 9.2 · 9.2.1 | เข้าสู่ระบบ · SSO | TC-F13-1 … TC-F13-9 |
| 9.3 · 9.4 · 9.4.1 · 9.4.2 | helper · RLS · KPI RPC · transition | `rls_02_helpers.sql` · `rls_07_transition.sql` · `analytics_01_kpis.sql` |
| 9.5 | Audit | TC-PDPA-5 · TC-PDPA-6 · TC-NEG-25 · TC-NEG-26 |
| 9.6 · 9.8 | ฟังก์ชันของระบบ · service_role | TC-NEG-21 · TC-F15-6 · TC-F08-2 · TC-F11-3 |
| 10.1 … 10.4 | PDPA | TC-PDPA-1 … TC-PDPA-12 · TC-F12-* |
| 11.1 · 11.2 | การแจ้งเตือน · settings | TC-F14-1 … TC-F14-7 · TC-F15-4 |
| 12.0 … 12.4 | KPI · อัตรา · คุณภาพข้อมูล · มิติ | TC-DQ-* · §4.8 · `analytics_01_kpis.sql` · `analytics_02_reports.sql` |
| 13.1 … 13.14 | ชุดข้อมูลตัวอย่าง | `acceptance.sql` ทั้งไฟล์ · §4.5 ทุกสคริปต์ |
| 14.1 … 14.9 | หน้าจอ · เมนู · Dashboard ตามบทบาท | §4.5 · `check-prototype.mjs` |
| 19.1 … 19.5 | ข้อตัดสินรายละเอียด | กระจายทุกส่วน (อ้างในคอลัมน์ "CANONICAL · สิทธิ์") |

---

## 6. ช่องว่างที่ยังต้องปิด

| # | ช่องว่าง | ผลกระทบ | ข้อเสนอ |
|---|---|---|---|
| G1 | `tools/check-canonical.mjs` **ยังไม่มีไฟล์** แต่ `package.json` มี script `check:canonical` และ `npm run check` เรียกใช้ | `npm run check` ล้มเหลวเสมอ · CI ขั้น C4 ของ deployment §3.2 ทำไม่ครบ | สร้างไฟล์ (ตรวจว่าเอกสารและ SQL ใช้ค่าตรง CANONICAL) หรือถอด script ออกชั่วคราว — เจ้าของงานตาม roadmap §2.2 |
| G2 | `tools/db/anonymize.sql` ยังไม่มี (ข้อ 9.7 · deployment §8) | ทำสำเนา prod เพื่อทดสอบไม่ได้ · restore test แบบ (A) ขาดขั้นตอนทำนิรนาม | สร้างก่อนใช้ staging ด้วยสำเนา prod |
| G3 | ชั้น **T7** และ **T8** ยังไม่มีสคริปต์ | ทุกรายการใน §1.3 ยังไม่มีหลักฐานอัตโนมัติ · UAT ต้องทำด้วยมือทั้งหมด | เขียนพร้อม Phase 1 (roadmap §4.2) — รายการที่ต้องครอบอยู่ใน §1.3 และคอลัมน์ "ช่องว่าง" ของ §5.1 |
| G4 | ชั้น **T9** (ประสิทธิภาพ) ยังไม่มี seed 10× | ไม่ทราบเวลาตอบเมื่อข้อมูลโต | สร้าง seed 10× แบบ deterministic แยกจาก seed หลัก ก่อน Phase 3 |
| G5 | เกณฑ์ตัวเลขของ pilot บางข้อยังเป็น **[รอยืนยัน]** (`P-3` ระยะเวลาต่อเนื่อง · `P-7` จำนวน `VISIT_UNRECORDED`) | ตัดสิน exit ของ pilot ไม่ชัด | ยืนยันกับ PO ก่อนเริ่ม pilot |
| G6 | วันที่ · จำนวนวัน · ชื่อผู้ทดสอบจริง ของ UAT ยังเป็น **[รอยืนยัน]** | วางแผนรอบ UAT ไม่ได้ | ยืนยันพร้อมแผน sprint (roadmap §4.2) |

---

## 7. หมายเหตุผู้เขียน

| # | ประเด็น | CANONICAL ว่าอย่างไร | การตีความที่ใช้ |
|---|---|---|---|
| **U1** | `tools/check-canonical.mjs` | ข้อ 18 ระบุว่าต้องมีไฟล์นี้ แต่ไฟล์ยังไม่ถูกสร้าง | เอกสารนี้บันทึกเป็นช่องว่าง G1 และ **ไม่** นับเป็นเงื่อนไขเข้า UAT ในรอบแรก (เพราะ `check:prototype` ครอบส่วน prototype แล้ว) |
| **U2** | "ลบคำขอบทบาทไม่ได้" | ข้อ 7.2 ระบุว่าลบไม่ได้ แต่ไม่ระบุว่าคำขอที่ `REJECTED` ยื่นใหม่ได้หรือไม่ | ตีความว่ายื่นใหม่ได้ เพราะ `role_grant_requests_open_uidx` บังคับเฉพาะคำขอที่ยัง `REQUESTED` |
| **U3** | ไม่มีแจ้งเตือนเมื่อสร้าง DSR | ข้อ 11.1 มีเฉพาะ `DSR_DUE_SOON` (7 วันก่อนครบกำหนด) | ตีความว่าการสร้าง DSR **ไม่มี** แจ้งเตือน · ถ้าต้องการให้ BA รู้ทันที ต้องเพิ่มรหัสใหม่ใน CANONICAL ก่อน |
| **U4** | จุดยึดของ `dedupe_key` ของบางรหัส | ข้อ 11.1 ระบุจุดยึด 4 แบบ แต่ไม่ครบทุกรหัส | ใช้ตามที่ `user-flows.md` (AN-29) กำหนด — test case อ้างจุดยึดตามรหัสที่ระบุชัดเท่านั้น |
| **U5** | มาตราความรุนแรงของข้อบกพร่อง | CANONICAL ไม่มี · roadmap §6.5 มีแต่ลำดับความสำคัญเชิงคำพูด | นิยาม S1–S4 ใน §4.7 เป็น **ข้อเสนอผู้เขียน** โดยยึดลำดับ "ข้อมูลส่วนบุคคล > การให้บริการหน้าร้าน > ตัวเลข > ความสะดวก" ของ roadmap §6.5 |
| **U6** | รหัส `AC1`–`AC12` | A44 มี 11 คำถาม · B27 เพิ่ม "มีข้อมูลซ้ำหรือข้อมูลไม่ครบเท่าไร" → 12 ข้อ · CANONICAL ไม่มีรหัส | ใช้รหัสเดียวกับ `roadmap.md` §1.4 (ซึ่งประกาศไว้เป็น **หมายเหตุผู้เขียน N1** ของเอกสารนั้น) เพื่อให้อ้างถึงกันได้ |
| **U7** | จำนวนผู้ทดสอบขั้นต่ำต่อบทบาท | CANONICAL ไม่มี | ข้อเสนอใน §4.1 · ข้อที่ **บังคับจริง** มีข้อเดียวคือ BUSINESS_ADMIN ≥ 2 คน เพราะ DSR `DELETION` ต้องมีผู้ยืนยัน ≠ ผู้ดำเนินการ (Q26) |
| **U8** | "ผ่านมีเงื่อนไข" (Conditional Go) | CANONICAL และ roadmap มีแต่ Go/No-Go | เพิ่มสถานะกลางเพื่อให้ pilot เดินต่อได้เมื่อเหลือเฉพาะ S3/S4 · ยังคงกติกา "มี S1 หรือ S2 = No-Go" ไว้เคร่งครัด |
| **U9** | การรีเซ็ตข้อมูลระหว่างรอบ UAT | CANONICAL ไม่มี | กำหนดให้ล้างและโหลด `seed.sql` ใหม่ก่อนทุกรอบ เพราะตัวเลขในข้อ 13 และ `app.running_numbers` (ข้อ 13.0 กติกา 8) เป็นสถานะที่ตรึงไว้ |
| **U10** | การจัดระดับข้อบกพร่องด้านสิทธิ์ | CANONICAL ข้อ 9.1 บอกว่า UI ซ่อนปุ่มเพื่อความสะดวกเท่านั้น | จึงกำหนดใน §4.7 ข้อ 3 ว่า ถ้าฐานข้อมูลปฏิเสธถูกต้องแล้วแต่ UI ยังแสดงปุ่ม ให้เป็น **S3** ไม่ใช่ S1 · ถ้าฐานข้อมูล**ไม่**ปฏิเสธ เป็น **S1** เสมอ |
| **U11** | จำนวน assertion เป็นเกณฑ์ | CANONICAL ไม่มี | §1.4 ข้อ 4 กำหนดว่าจำนวน assertion ห้ามลดลงโดยไม่มีเหตุผลใน PR — เป็นเครื่องมือกันการลบ test โดยไม่ตั้งใจ |
| **U12** | ไม่มี "รายงานผลการสร้าง seed" เป็นไฟล์แยก | ข้อ 13.0 กติกา 9 ระบุให้ `acceptance.sql` assert ทุกตัวเลขที่พิมพ์ในข้อ 13 | ถือว่า **`acceptance.sql` + ผลรันของ `run.mjs` คือรายงานของ seed** · §2.4 เก็บผลรันล่าสุดไว้เป็นฐานอ้างอิง |

---

## 8. รายการที่ต้องให้เจ้าของโครงการยืนยัน

| # | เรื่อง | ค่าที่ใช้ไปก่อน | อ้าง |
|---|---|---|---|
| 1 | ชื่อผู้ทดสอบจริงต่อบทบาท · วันที่และจำนวนวันของรอบ UAT · ช่องทางแจ้งปัญหา | **[รอยืนยัน]** | §4.1 · §4.6 |
| 2 | เวลาตอบสนองต่อข้อบกพร่องแต่ละระดับ | **[รอยืนยัน]** | §4.7 |
| 3 | ผู้ทำหน้าที่ DPO และข้อความประกาศ `PN-2026-01` | **[รอยืนยัน Q8 · Q9]** | §4.1 · TC-PDPA-1 |
| 4 | เกณฑ์ตัวเลขของ pilot `P-3` (ระยะต่อเนื่อง) และ `P-7` (`VISIT_UNRECORDED` ต่อวัน) | **[รอยืนยัน]** | roadmap §6.3 · §4.8 |
| 5 | แพ็กเกจ Supabase (Pro หรือ Team) — กำหนดว่าการนับการเข้าผิดเป็น hook หรือ best-effort | Pro + PITR **[รอยืนยัน Q6]** | TC-F13-6 |
| 6 | เพดานการส่งออก (ข้อ 8.2) และผู้อนุมัติคำขอของ EXECUTIVE | ตามตาราง **[รอยืนยัน Q7 · Q23]** | TC-F11-2 |
| 7 | ระยะเวลาเก็บข้อมูลของ retention | ตามตาราง **[รอยืนยัน Q8]** | TC-F15-5 |
| 8 | วันหยุดของสาขาใน `business_hours` | ยังไม่มีวันหยุด **[รอยืนยัน Q4]** | TC-F14-3 |
| 9 | เครื่องมือของชั้น T6 · T8 · T9 | **[รอยืนยัน]** | §1.2 · §6 (G3 · G4) |
| 10 | การใช้ `pg_cron` หรือ scheduler ภายนอกเรียก Edge Function | `pg_cron` **[รอยืนยัน]** | TC-F15-6 |
