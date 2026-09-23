# Schema Notes — JAUN CRM · Customer 360

> คู่กับเอกสารชุดที่ **09 Database Schema** ตาม A45 (ตัวสคีมาจริงคือ `supabase/migrations/`) · **ฉบับ Phase 0**
> ค่าทุกค่าอ้างอิง `docs/00-brief/CANONICAL.md` **v2.2** · ถ้าเอกสารนี้ขัดกับ CANONICAL **CANONICAL ชนะ**
> เอกสารนี้อธิบาย **"ทำไมสคีมาเป็นแบบนี้"** และ **"ต้องทำอย่างไรเมื่อจะแก้"** — ส่วน **"มีอะไรบ้าง"** อยู่ใน `docs/03-data/data-dictionary.md` (สร้างด้วย `npm run db:dictionary`) และ `docs/03-data/er-diagram.md`
> ตัวเลขทุกตัวในเอกสารนี้อ่านจากฐานข้อมูลจริงและจากการรันชุดทดสอบจริง (ข้อ 14) ไม่ใช่การประมาณ

## 0. วิธีอ่านเอกสารนี้

| ประเภทข้อความ | ความหมาย |
|---|---|
| **กฎ** | ข้อบังคับที่ migration ใหม่ต้องทำตาม · มี test คุมอยู่ (ระบุไฟล์ทดสอบไว้) |
| **เหตุผล** | ที่มาของกฎ อ้าง CANONICAL |
| **หมายเหตุผู้เขียน** | จุดที่ CANONICAL ไม่ได้กำหนด ผู้เขียน migration เลือกทางที่สอดคล้องกับส่วนอื่นมากที่สุด — ต้องให้เจ้าของโครงการยืนยัน (สรุปรวมในข้อ 15) |
| **[รอยืนยัน]** | ค่าที่ CANONICAL ติดป้ายรอยืนยันไว้เอง |

สถานะปัจจุบันของสคีมา (นับจากฐานข้อมูลที่ได้จาก `supabase/migrations/0001–0013`)

| หน่วย | จำนวน |
|---|---:|
| ตาราง | 64 (`core` 14 · `ref` 16 · `crm` 26 · `app` 3 · `audit` 5) |
| view | 4 (`analytics` 3 · `crm` 1) · ทุกตัว `security_invoker = true` |
| ENUM | 19 |
| คอลัมน์ | 845 · ในจำนวนนี้ติดป้าย `[pii]` **30** คอลัมน์ |
| ฟังก์ชัน | 178 (`api` 58 · `app` 115 · `audit` 5) |
| policy · index · trigger | 113 · 219 · 213 |
| Foreign key | 244 (`crm` 181 · `core` 53 · `audit` 7 · `app` 3 · `ref` 0) |

---

## 1. ข้อตกลงการตั้งชื่อ

### 1.1 Schema

**กฎ:** วัตถุทุกชิ้นอยู่ใน schema ใด schema หนึ่งใน 8 ตัวนี้เท่านั้น ห้ามสร้างวัตถุใน `public` (CANONICAL ข้อ 1.1)

| schema | เก็บอะไร | เปิด Data API |
|---|---|:--:|
| `api` | RPC ที่หน้าจอและ Edge Function เรียก | ✓ |
| `crm` | ลูกค้า · กิจกรรม · การขาย · งาน · การแจ้งเตือน | ✓ |
| `core` | องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ | ✓ |
| `ref` | Master Data (lookup) | ✓ |
| `app` | helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers | ✗ |
| `analytics` | view ภายในสำหรับ KPI | ✗ |
| `audit` | log และ workflow ของการส่งออก | ✗ |
| `restricted` | เอกสารสำคัญ (ว่างใน V1) | ✗ |

**เหตุผล:** `Data API exposed schemas = api, crm, core, ref` — อะไรที่ไม่อยู่ใน 4 ตัวนี้ผู้ใช้เรียกผ่าน PostgREST ไม่ได้เลย แม้จะมี GRANT ก็ตาม จึงเป็นชั้นป้องกันที่หนึ่งของ `app` `analytics` `audit`

### 1.2 ตารางและคอลัมน์

**กฎ**

1. ชื่อตารางเป็น **พหูพจน์ snake_case** (`customers` · `opportunity_items`) · ชื่อคอลัมน์เป็น snake_case
2. PK ชื่อ `id` ชนิด `uuid` `DEFAULT gen_random_uuid()` **เสมอ** — ยกเว้นสองกรณี
   - ตาราง lookup ใน `ref` ใช้ `code text PRIMARY KEY` (ค่าที่โค้ดอ้างถึงต้องอ่านออกใน SQL)
   - ตาราง log ใน `audit` ใช้ `bigint GENERATED ALWAYS AS IDENTITY` (เขียนถี่ · ไม่ต้องอ่านข้ามระบบ)
   - `crm.customer_branches` ใช้ PK ประกอบ `(customer_id, branch_id)` ตาม CANONICAL ข้อ 6.6 จึง**ไม่มี**คอลัมน์ `id`
3. เลขที่ผู้ใช้เห็นเป็นคอลัมน์แยก `*_no text UNIQUE` (`customer_no` · `lead_no` · `visit_no` …) — ข้อ 8
4. เวลาเป็น `timestamptz` **เสมอ** · วันที่ล้วนใช้ `date` เฉพาะ `valid_until` `starts_on` `ends_on`
5. เงินเป็น `numeric(12,2)` (CANONICAL ข้อ 1.3)
6. boolean ขึ้นต้นด้วย `is_` / `has_` / `closed_by_` (`is_primary` · `has_open_followup` · `closed_by_system`)

**เหตุผลที่ PK เป็น uuid ไม่ใช่ serial:** A12 กำหนดให้ฐานข้อมูลใช้ UUID และผู้ใช้เห็นเลขอ่านง่าย · uuid ทำให้ import/merge จากระบบเดิมไม่ชนกัน และ `customer_no` ที่ระบบภายนอกถือไว้ยังชี้ไป survivor ได้หลัง merge (Q27)

### 1.3 คอลัมน์มาตรฐานของตารางธุรกิจ

**กฎ:** ทุกตารางใน `crm` และ `core` (และ `audit.export_requests`) มีครบหกคอลัมน์นี้ (CANONICAL ข้อ 6.10)

```
id uuid PK · organization_id uuid NOT NULL · created_at timestamptz NOT NULL
created_by uuid · updated_at timestamptz NOT NULL · updated_by uuid
```

- `organization_id` มี `DEFAULT app.current_organization_id()` · `created_by`/`updated_by` มี `DEFAULT app.current_staff_id()`
- `trg_90_stamp_row` เขียนทับทั้งสามค่าเมื่อ `current_user = 'authenticated'` (ผู้ใช้ปลอมค่าไม่ได้) · `trg_touch_updated_at` ตั้ง `updated_at = now()` ทุกการ UPDATE
- **ทั้งหกคอลัมน์ไม่อยู่ใน column grant ของ UPDATE** (CANONICAL ข้อ 9.4 กติกา 7)
- ยกเว้น: ตารางประวัติแบบ append-only (`lead_status_history` · `opportunity_stage_history` · `ownership_changes`) มีเฉพาะ `created_at` / `changed_at` · `ref.*` ไม่มี `organization_id` (ค่ากลาง ข้อ 2)

**หมายเหตุผู้เขียน:** CANONICAL ไม่ได้ระบุว่า `created_by` ควร NOT NULL หรือไม่ — ผู้เขียนให้เป็น NULL ได้ เพราะแถวที่สร้างโดยงานระบบ (`job_close_stale_visits` · retention) ไม่มีพนักงานเป็นผู้กระทำ · ตัวตนของผู้กระทำงานระบบอยู่ใน `audit.audit_logs.actor_label` แทน

### 1.4 `_code` กับ `_id` — วิธีอ่าน FK จากชื่อคอลัมน์

**กฎ**

| ลงท้ายด้วย | ชี้ไป | ตัวอย่าง |
|---|---|---|
| `_code` | ตาราง lookup ใน `ref` (PK เป็น `text`) | `channel_code → ref.channels(code)` · `lost_reason_code → ref.lost_reasons(code)` |
| `_id` | ตารางที่ PK เป็น `uuid` | `customer_id → crm.customers(id)` · `branch_id → core.branches(id)` |
| `_staff_id` | `core.staff_profiles(id)` เสมอ | `owner_staff_id` · `recipient_staff_id` · `from_staff_id` |
| `_no` | **ไม่ใช่ FK** — เป็นเลขที่ผู้ใช้เห็นของตารางตัวเอง | `customer_no` · `visit_no` |

**ข้อยกเว้นที่ตั้งใจ (มี 3 จุด)** — `_code` ที่ไม่ได้ชี้ไป `ref`

| คอลัมน์ | ชี้ไป | เหตุผล |
|---|---|---|
| `core.staff_role_assignments.role_code` · `core.role_grant_requests.role_code` · `audit.export_requests.requested_as_role` | `core.roles(code)` | บทบาทเป็นข้อมูลของ `core` ไม่ใช่ master data ที่ BA แก้ได้ (ข้อ 7) |
| `core.role_permissions.permission_code` | `core.permissions(code)` | เช่นเดียวกัน · แก้ได้เฉพาะผ่าน migration (ข้อ 7.2) |
| `app.settings.editable_by` | `core.permissions(code)` | ใครแก้ค่าตั้งใดได้ ตัดสินจากสิทธิ์จริง (ข้อ 11.2) |

**เหตุผลที่ FK ไป `ref` ใช้ `text` ไม่ใช่ uuid:** ทำให้ policy · CHECK · seed · และ SQL ของ RPC อ่านออกโดยไม่ต้อง join (`WHERE channel_code = 'WALK_IN'`) และทำให้ข้อความใน CANONICAL กับข้อความใน SQL เป็นคำเดียวกัน

### 1.5 ชื่อของ constraint · index · trigger · policy · ฟังก์ชัน

**กฎ**

| ชนิด | รูปแบบ | ตัวอย่าง |
|---|---|---|
| PRIMARY KEY | `{table}_pkey` (ค่าเริ่มต้นของ PostgreSQL) | `leads_pkey` |
| UNIQUE | `{table}_{cols}_key` (อัตโนมัติ) หรือ `{table}_{ความหมาย}_uq` (ตั้งเอง) | `leads_lead_no_key` · `customer_tags_uq` |
| CHECK | `{table}_{ความหมาย}_chk` | `leads_status_chk` · `customers_lifecycle_stage_chk` |
| FOREIGN KEY | `{table}_{col}_fkey` (อัตโนมัติ) | `leads_branch_id_fkey` |
| index | `{table}_{cols}_idx` · index เชิงความหมายใช้ชื่อสื่อความ | `leads_branch_id_idx` · `leads_open_idx` |
| policy | `{table}_{select\|insert\|update\|delete}` | `leads_select` · `leads_update` |
| trigger BEFORE | `trg_{NN}_{ความหมาย}` — **NN คือลำดับ** (ข้อ 4) | `trg_10_enforce_transition` |
| trigger AFTER | `trg_{ความหมาย}` | `trg_touch_customer_activity` |
| ฟังก์ชัน trigger | `app.trg_{ความหมาย}` | `app.trg_link_customer_branch` |
| helper ตรวจสิทธิ์ | `app.{คำกริยา/คำนาม}` | `app.scope_branch_ids` · `app.readable_customer_ids` |
| งานตามเวลา | `app.job_{ความหมาย}(p_as_of)` | `app.job_close_stale_visits` |
| RPC ของหน้าจอ | `api.{คำกริยา}_{กรรม}` | `api.quick_capture` · `api.get_customer_360` |
| RPC ของ Edge Function | `api.svc_{...}` — GRANT ให้ `service_role` เท่านั้น | `api.svc_build_export_dataset` |
| พารามิเตอร์ของฟังก์ชัน | ขึ้นต้น `p_` เสมอ | `p_customer_id` · `p_as_of` |
| ตัวแปรใน plpgsql | ขึ้นต้น `v_` เสมอ | `v_me` · `v_staff` |

**เหตุผลที่พารามิเตอร์ต้องขึ้นต้น `p_`:** ทุกฟังก์ชันตั้ง `SET search_path = ''` และอ้างชื่อเต็ม ถ้าชื่อพารามิเตอร์ชนกับชื่อคอลัมน์ PostgreSQL จะตีความเป็นคอลัมน์เงียบ ๆ (`WHERE customer_id = customer_id` เป็นจริงเสมอ) — คำนำหน้าตัดปัญหานี้ทิ้งทั้งชุด

---

## 2. ENUM · lookup · ชุดค่า `text` + CHECK — เลือกอย่างไร

**กฎการเลือก** (CANONICAL ข้อ 4 · 5 · 19.1 ข้อ 1)

| ใช้ | เมื่อ | ตัวอย่าง |
|---|---|---|
| **ENUM** ใน schema ของตาราง | ชุดค่าปิดที่ **ระบบใช้ตัดสินใจ** และ**ผู้ดูแลแก้ไม่ได้** · อยู่ในข้อ 4 ของ CANONICAL | `crm.lead_status` · `crm.opportunity_stage` · `core.data_scope` |
| **ตาราง lookup ใน `ref`** | ชุดค่าที่ **ผู้ดูแลธุรกิจเพิ่ม/ปิดใช้งานได้** และมีป้ายไทย/ลำดับ/ธงความหมาย | `ref.channels` · `ref.lost_reasons` · `ref.interest_types` |
| **`text` + CHECK ชื่อคงที่** | ชุดค่าปิดที่ CANONICAL **ไม่ได้ใส่ไว้ในข้อ 4.8** | `customers.lifecycle_stage` · `customers.created_via` · `branches.branch_type` · `role_grant_requests.status` |

**เหตุผล:** ENUM เพิ่มค่าได้แต่ลบไม่ได้และ `ALTER TYPE … ADD VALUE` ใช้ในทรานแซกชันเดียวกับที่ใช้ค่าใหม่ไม่ได้ — จึงเหมาะกับสิ่งที่ "ไม่เปลี่ยน" เท่านั้น · lookup เปลี่ยนได้ตอน runtime จึงเหมาะกับ master data · CHECK อยู่ตรงกลาง: ปิดเหมือน ENUM แต่แก้ด้วย migration บรรทัดเดียวได้

**ป้ายไทยของ ENUM ไม่เก็บในฐานข้อมูล** (CANONICAL ข้อ 4) — อยู่ใน `docs/03-data/data-dictionary.md` ข้อ 2 (generator ฝังตารางป้ายจาก CANONICAL ข้อ 4 ไว้และตรวจว่าครบทุกค่า) และใน `prototype/assets/data.js`

### 2.1 วิธีเพิ่มค่าให้ ENUM

**กฎ:** สร้าง migration **ไฟล์ใหม่ที่มีแค่ `ALTER TYPE … ADD VALUE`** (CANONICAL ข้อ 4) ห้ามใส่ปนกับการเปลี่ยนอื่น

```sql
-- supabase/migrations/00NN_add_<enum>_<value>.sql   (ทั้งไฟล์มีแค่บรรทัดนี้)
ALTER TYPE crm.lead_status ADD VALUE 'ON_HOLD' AFTER 'QUALIFIED';
```

ขั้นตอนเต็ม

1. เพิ่มค่าใน **CANONICAL ข้อ 4** ก่อน (พร้อมป้ายไทย) — ถ้ายังไม่มีในนั้น ห้ามเพิ่มในฐานข้อมูล
2. สร้างไฟล์ migration ตามข้างบน · ระบุ `BEFORE`/`AFTER` ให้ลำดับ `enumsortorder` ตรงกับตารางใน CANONICAL (ลำดับมีผลจริงกับ `core.data_scope` ซึ่งเทียบด้วย `>=`)
3. สร้าง migration **ไฟล์ถัดไป** สำหรับสิ่งที่ใช้ค่าใหม่ (CHECK · policy · ฟังก์ชัน) — PostgreSQL ไม่ให้ใช้ค่า ENUM ใหม่ในทรานแซกชันเดียวกับที่เพิ่ม
4. เพิ่มป้ายไทยใน `ENUM_LABELS` ของ `tools/db/gen-data-dictionary.mjs` แล้วรัน `npm run db:dictionary` — ถ้าลืม generator จะเตือน `ENUM_LABELS …: ขาดค่า …` และใส่ ⚠ ในข้อ 8 ของ data dictionary
5. อัปเดต `01_schema_stage1.sql` (assert ลำดับค่าของ ENUM ทุกตัว) แล้วรัน `npm run db:test`

**ห้ามลบค่า ENUM** — PostgreSQL ไม่รองรับ · ถ้าเลิกใช้ ให้หยุดเขียนค่านั้นและตัดออกจาก UI

### 2.2 วิธีเพิ่มค่าให้ lookup ใน `ref`

- ค่าที่ **โค้ดหรือกติกาใน CANONICAL อ้างถึงโดยตรง** ต้องมี `is_system = true` → CHECK `is_active OR NOT is_system` ทำให้ปิดใช้งานไม่ได้
- ค่าใหม่ที่ธุรกิจเพิ่มเองได้ผ่านหน้า master-data (`master_data.manage` + aal2) ใช้ `is_system = false`
- **ห้าม DELETE** — `authenticated` ไม่มี GRANT DELETE บน `ref.*` เลย · เลิกใช้ = `is_active = false`
- ธงความหมาย (`creates_lead` · `counts_as_purchase` · `is_live` · `is_marketing` · `controller_entity`) **ตั้งตอนเพิ่มค่าและแก้ภายหลังได้ด้วย migration เท่านั้น** (CANONICAL ข้อ 19.1 ข้อ 4) เพราะธงเหล่านี้เปลี่ยนความหมายของ KPI ย้อนหลัง

---

## 3. ลำดับ migration และกฎ dependency

### 3.1 ลำดับจริง

`tools/db/run.mjs` รันไฟล์ **ตามชื่อ** และ **ข้ามไฟล์ที่ลงท้าย `_cron.sql`** · แต่ละไฟล์รันในทรานแซกชันของตัวเอง

| ไฟล์ | สร้างอะไร | พึ่งไฟล์ก่อนหน้าเพราะ |
|---|---|---|
| `0001_foundation.sql` | schema ทั้ง 8 · GRANT ระดับ schema · **ENUM ทุกตัว** · `app.settings` (30 แถว) · `app.running_numbers` · `app.rate_limit_counters` · helper พื้นฐาน (`app.clock` · `app.bangkok_date` · `normalize_contact` · `mask_contact` · `is_thai_national_id` · `touch_updated_at`) | – |
| `0002_core.sql` | ตาราง `core` ทั้ง 14 · บทบาท 8 แถว · `core.permissions` และ `core.role_permissions` **ทุกช่องของ CANONICAL ข้อ 8.1** | ต้องมี ENUM `core.staff_status` `core.data_scope` จาก 0001 |
| `0003_ref.sql` | ตาราง `ref` ทั้ง 16 และ **ทุกค่า** (รวม 77 จังหวัด) | ต้องมีคอลัมน์มาตรฐาน/helper จาก 0001 |
| `0004_crm_customer.sql` | `crm.customers` + ตารางย่อยของลูกค้า 10 ตาราง | FK ไป `core.branches` `core.staff_profiles` (0002) และ `ref.*` (0003) |
| `0005_crm_activity.sql` | `visits` · `interactions` · `transaction_refs` | FK ไป `crm.customers` (0004) |
| `0006_crm_sales.sql` | `campaigns` · `leads` · `opportunities` · `quotations` + items + ประวัติสถานะ + `ownership_changes` | FK ไป `crm.visits` (0005) |
| `0007_crm_work.sql` | `tasks` · `task_comments` · `notifications` | FK ไป `leads`/`opportunities` (0006) |
| `0008_audit.sql` | role `audit_retention` · ตาราง `audit` ทั้ง 5 · `audit.log_row_change()` · `audit.deny_change()` · `app.is_seed_mode()` | ต้องมีตารางธุรกิจครบก่อน จึงติด trigger audit ได้ทั้งชุด |
| `0009_business_triggers.sql` | trigger ของกติกาธุรกิจทั้งหมด (เลขอ้างอิง · `first_seen_at` · lifecycle · next-action task · `expected_amount` · `customer_branches` · ประวัติสถานะ …) | ต้องมีตารางครบและ audit พร้อม |
| `0010_security.sql` | **ส่วนต่างของสคีมาตาม v2.2** · GRANT ตาราง/คอลัมน์ · policy ทั้ง 113 · helper ตรวจสิทธิ์ · `app.enforce_row_transition` · `trg_90_stamp_row` | policy เรียก helper ที่สร้างในไฟล์นี้เอง (บล็อกเรียงในไฟล์ · ห้ามสลับ) |
| `0011_api.sql` | RPC ใน `api` ทั้ง 58 ตัว | เรียก helper และต้องอยู่หลัง RLS เพื่อให้ DEFINER ข้าม policy ได้อย่างตั้งใจ |
| `0012_analytics.sql` | view `analytics` 3 ตัว · helper KPI · `api.get_kpis` · `api.get_report` | อ่านตารางกิจกรรมและ `ref.*` ครบ |
| `0013_jobs.sql` | `app.job_*` ทั้ง 5 งาน | เรียก RPC/helper ของ 0011 · 0012 |
| `0014_schedule_cron.sql` | **`cron.schedule` เท่านั้น** — PGlite ข้ามไฟล์นี้ | ตรรกะอยู่ใน 0013 ทั้งหมด |

### 3.2 กฎ dependency สำหรับ migration ใหม่

**กฎ**

1. **เรียงตาม dependency ไม่ใช่ตาม Phase** (CANONICAL ข้อ 14.6) — migration ของ Phase 0 สร้างตารางของ Phase 1–3 ครบทุกตัว · ตารางของ Phase 4–5 (`campaign_members` · `online_conversations` · `segments` · `restricted.customer_documents`) **ยังไม่สร้าง**
2. ลำดับภายในระบบคือ **enum/ตาราง → view `analytics` → helper/RLS → trigger → RPC** (ข้อ 14.6)
3. **ไฟล์ที่ commit แล้วห้ามแก้** — แก้ด้วยไฟล์ใหม่เสมอ (Supabase รัน migration ตามชื่อและจำว่ารันแล้ว)
4. migration ต้อง **valid บน Supabase จริง** ไม่ใช่แค่ PGlite:
   - อ้างชื่อเต็ม `schema.object` ทุกที่
   - ฟังก์ชันทุกตัว `SECURITY DEFINER` (เว้นที่ตั้งใจให้ INVOKER) + `SET search_path = ''`
   - **`GRANT EXECUTE` ให้ทุกฟังก์ชันที่ถูกเรียกตรง** เพราะ `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ทำทั้งฐาน (CANONICAL ข้อ 19.1 ข้อ 2) — ลืม GRANT = policy พัง เพราะ policy เรียก helper ไม่ได้
   - ห้ามใช้ไวยากรณ์ของ PG 18 (CANONICAL ข้อ 1)
5. ไฟล์ที่ต้องรันบน Supabase เท่านั้นให้ลงท้าย `_cron.sql` และ**มีแต่การตั้งตารางเวลา**
6. ทุกวัตถุใหม่ต้องมี `COMMENT` ภาษาไทยที่อ้างข้อของ CANONICAL — data dictionary อ่านจาก COMMENT โดยตรง ไม่มี COMMENT = ช่องคำอธิบายว่าง
7. คอลัมน์ที่เป็นข้อมูลส่วนบุคคลต้องมี COMMENT ขึ้นต้น **`[pii]`** (CANONICAL ข้อ 19.1 ข้อ 3) — audit masking และ `app.anonymize_customer` อ่านจากป้ายนี้ ลืมใส่ = ค่าเต็มรั่วเข้า audit log

---

## 4. Trigger — รายการและลำดับ

### 4.1 ลำดับของ BEFORE trigger

PostgreSQL เรียก trigger **ตามลำดับตัวอักษรของชื่อ** ภายในเวลาเดียวกัน (BEFORE/AFTER) · ระบบจึงใส่เลขนำหน้าเพื่อกำหนดลำดับอย่างชัดเจน (CANONICAL ข้อ 9.4.2)

| ลำดับ | ชื่อ trigger | ฟังก์ชัน | ติดกี่ตาราง | ทำอะไร |
|---|---|---|---:|---|
| 1 | `trg_05_running_number` | `app.trg_assign_running_number` | 11 | ออกเลขอ้างอิง (`customer_no` · `visit_no` · `queue_no` · …) ถ้าแถวยังไม่มีเลข |
| 2 | `trg_10_enforce_transition` | `app.enforce_row_transition` | 7 | ตรวจสิทธิ์ที่ขึ้นกับคอลัมน์ที่เปลี่ยน (assign · close · reopen · ย้ายสาขา · แก้หลังส่ง · คอลัมน์ระบบ) |
| 3 | `trg_12_guard_export_request` | `audit.trg_guard_export_request` | 1 | เส้นทางสถานะของคำขอส่งออก · `download_count` ลดไม่ได้ |
| 4 | `trg_15_guard_core_row` | `app.trg_guard_core_row` | 3 | `staff_role_assignments` แก้ได้เฉพาะ `valid_to`/`revoked_*` · คำขอบทบาทแก้ข้อมูลตอนยื่นไม่ได้ |
| 5 | `trg_20_guard_text` | `app.trg_guard_restricted_text` | 7 | ปฏิเสธข้อความที่มีเลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (CANONICAL ข้อ 10.1) |
| 6 | `trg_30_row_defaults` | `app.trg_row_defaults` | 4 | ค่าเริ่มต้นที่คำนวณจากแถวอื่น (`quotations.customer_id`/`branch_id` จาก opportunity · `tasks.due_at` · `remind_at` · `visits.queue_no`) |
| 7 | `trg_90_stamp_row` | `app.trg_stamp_row` | 34 | ตั้ง `organization_id` `created_by` `updated_by` จากผู้ใช้จริง (เฉพาะเมื่อ `current_user = 'authenticated'`) |
| 8 | `trg_touch_updated_at` | `app.touch_updated_at` | 57 | ตั้ง `updated_at = now()` (ชื่อขึ้นต้น `trg_t` จึงมาหลัง `trg_9`) |

**เหตุผลของลำดับ:** เลขอ้างอิงต้องมีก่อนตรวจสิทธิ์ (ข้อความปฏิเสธอ้างเลขได้) → ตรวจสิทธิ์ก่อนเติมค่าเริ่มต้น (ผู้ใช้ที่ไม่มีสิทธิ์ต้องถูกปฏิเสธก่อนระบบเติมค่าให้) → ประทับตราผู้กระทำท้ายสุด (ผู้ใช้เขียนทับไม่ได้)

### 4.2 AFTER trigger (กติกาธุรกิจ)

| ชื่อ | ฟังก์ชัน | ติดที่ | ทำอะไร |
|---|---|---|---|
| `trg_audit_row_change` | `audit.log_row_change` | 51 ตาราง | เขียน `audit.audit_logs` (ค่า `pii` ปิดบัง + sha256) · **ยกเว้น** `notifications` · `lead_status_history` · `opportunity_stage_history` · `ownership_changes` · `customer_branches` (CANONICAL ข้อ 9.5) |
| `trg_touch_customer_activity` | `app.trg_touch_customer_activity` | `visits` `interactions` `leads` `opportunities` `tasks` `transaction_refs` | ปรับแคชบน `customers` (`last_activity_at` · `last_channel_code` · `last_branch_id` · `has_open_followup` · `has_new_lead`) และดึง `first_seen_at` ให้เก่าลง |
| `trg_refresh_lifecycle_{ins,upd,del}` | `app.trg_refresh_lifecycle` | `leads` `opportunities` `transaction_refs` | คำนวณ `customers.lifecycle_stage` ใหม่ (แยก 3 trigger ต่อ event ตาม CANONICAL ข้อ 3.4 — ห้ามใช้ transition table หลาย event) |
| `trg_link_customer_branch` | `app.trg_link_customer_branch` | `visits` `interactions` `leads` `opportunities` `transaction_refs` | upsert `crm.customer_branches` |
| `trg_sync_next_action_task` | `app.trg_sync_next_action_task` | `leads` `opportunities` | สร้าง/อัปเดต/ยกเลิก task ที่ `is_next_action = true` ให้ตรงกับ `next_action*` ของแม่ |
| `trg_write_status_history` | `app.trg_write_status_history` | `leads` `opportunities` | เขียน `lead_status_history` / `opportunity_stage_history` |
| `trg_mark_lead_contacted` | `app.trg_mark_lead_contacted` | `interactions` | `NEW → CONTACTED` อัตโนมัติเมื่อมี interaction `OUTBOUND` แรก (CANONICAL ข้อ 4.3) |
| `trg_quotation_sent_stage` | `app.trg_quotation_sent_stage` | `quotations` | ตั้ง `sent_at` · `valid_until` · สร้าง interaction `QUOTATION_SENT` · เลื่อนขั้น opportunity (ข้อ 19.3 ข้อ 5) |
| `trg_sync_expected_amount` | `app.trg_sync_expected_amount` | `opportunity_items` | คำนวณ `opportunities.expected_amount` |
| `trg_sync_note_summary` | `app.trg_sync_note_summary` | `customer_notes` | ตั้ง `customers.note_summary` = โน้ตที่ปักหมุดล่าสุด |
| `trg_check_role_exclusivity` | `app.trg_check_role_exclusivity` | `staff_role_assignments` | SYSTEM_ADMIN ห้ามถือร่วมกับบทบาทธุรกิจ · MARKETING ห้ามถือร่วมกับ BUSINESS_ADMIN **[รอยืนยัน Q22]** · ล็อกแถว `staff_profiles` ก่อนตรวจ (ข้อ 7.1) |
| `trg_check_team_member_assignment` | `app.trg_check_team_member_assignment` | `team_members` | สมาชิกทีมต้องมี assignment ในสาขาของทีม (ข้อ 7.1) |
| `trg_deny_change` · `trg_deny_truncate` | `audit.deny_change` | ตาราง log 4 ตัว | ปฏิเสธ UPDATE/DELETE/TRUNCATE ยกเว้นกรณีที่ CANONICAL ข้อ 9.5 อนุญาต |

**กฎ:** trigger ทุกตัวเป็น `SECURITY DEFINER` + `SET search_path = ''` และ **ไม่ GRANT ให้ใคร** — ยกเว้น `app.enforce_row_transition` ซึ่งเป็น **`SECURITY INVOKER`** โดยเจตนา (CANONICAL ข้อ 9.4.2) เพราะต้องเห็น `current_user` จริงเพื่อข้ามเมื่อผู้เรียกไม่ใช่ `authenticated`

---

## 5. ค่าที่ส่งเข้า trigger ผ่าน transaction-local setting

**กฎ:** ค่าที่ trigger ต้องรู้แต่ไม่ใช่คอลัมน์ ส่งผ่าน `set_config(key, value, true)` — พารามิเตอร์ที่สามคือ `true` = **local ต่อทรานแซกชัน** เสมอ (CANONICAL ข้อ 19.1 ข้อ 9)

| key | ใครตั้ง | trigger ที่อ่าน | ผล |
|---|---|---|---|
| `app.status_reason` | RPC ที่เปลี่ยนสถานะ | `app.trg_write_status_history` | เก็บลงคอลัมน์ `reason` ของประวัติสถานะ |
| `app.audit_reason` | RPC ที่ต้องการอธิบายเหตุ | `audit.log_row_change` | เก็บลง `audit_logs.reason` — **ห้ามมี PII** (ข้อ 19.4 ข้อ 2) |
| `app.actor_type` | งานระบบ · Edge Function | `audit.log_row_change` | `SYSTEM` หรือ `INTEGRATION` แทน `STAFF` |
| `app.actor_label` | งานระบบ | `audit.log_row_change` | เช่น `SYSTEM:close_stale_visits` |
| `app.actor_staff_id` | `app.svc_set_actor()` (**service_role เท่านั้น**) | `audit.log_row_change` | ผู้กระทำจริงเมื่อ Edge Function เขียนด้วย service_role (CANONICAL ข้อ 9.5) |
| `app.bulk` | merge · seed · import | หลาย trigger (ข้อ 6) | ข้ามงานหนักที่ทำครั้งเดียวท้ายงานได้ |
| `app.seed_mode` | `supabase/seed.sql` | `audit.log_row_change` · guard ของ `core`/`export_requests` | ข้าม audit และข้าม guard เส้นทางสถานะ |
| `app.audit_redaction` | `app.anonymize_customer` | `audit.deny_change` | อนุญาต UPDATE เฉพาะคอลัมน์ `before`/`after` ของ audit log (ข้อ 10.4) |

**เหตุผลที่ต้องเป็น local:** ถ้าตั้งแบบ session ค่าจะค้างข้ามคำขอใน connection pool ของ Supabase → งานถัดไปอาจเขียน audit ในนาม `SYSTEM` โดยไม่ตั้งใจ

**`app.actor_staff_id` เชื่อถือได้เพราะ** `app.svc_set_actor(p_actor_user_id, p_aal)` รับ `sub` ของ JWT ที่ Edge Function **verify แล้ว** แล้วแปลงเป็น `staff_id` ของพนักงานที่ `ACTIVE` เท่านั้น — Edge Function **ไม่รับ staff_id จาก body** (CANONICAL ข้อ 9.8)

---

## 6. Bulk mode และ Seed mode

ทั้งสองโหมดเปิดด้วย transaction-local setting และมีขอบเขตต่างกันชัดเจน

### 6.1 `app.bulk = 'on'` — ใช้ตอนย้าย/นำเข้าข้อมูลจำนวนมาก

อ่านด้วย `app.is_bulk()` · เปิดโดย `api.merge_customers` · `supabase/seed.sql` · สคริปต์นำเข้า

**ข้ามอะไรบ้าง** (CANONICAL ข้อ 19.1 ข้อ 11)

| ข้าม | เพราะ |
|---|---|
| `app.refresh_customer_lifecycle` | คำนวณใหม่ครั้งเดียวท้ายงานถูกกว่าคำนวณทุกแถว |
| sync task ของ next action | ระหว่างย้ายข้อมูล สถานะกลางยังไม่ถูกต้อง |
| `NEW → CONTACTED` อัตโนมัติ | ลำดับ interaction ที่นำเข้าอาจไม่เรียงเวลา |
| เลื่อนขั้นเป็น `QUOTATION` อัตโนมัติ | เช่นเดียวกัน |
| แคช `last_*` / `has_*` | คำนวณครั้งเดียวท้ายงาน |
| การแจ้งเตือน `*_ASSIGNED` | ไม่ควรยิงแจ้งเตือนย้อนหลังนับพันรายการ |

**กฎ:** งานที่เปิด `app.bulk` **ต้องเรียก `app.refresh_customer_activity(...)` และ `app.refresh_customer_lifecycle(...)` ท้ายงาน** มิฉะนั้นแคชและ `lifecycle_stage` จะค้าง — `acceptance.sql` จับได้ทันที เพราะ KPI คำนวณจากแถวจริงแต่ป้าย lifecycle อ่านจากแคช

### 6.2 `app.seed_mode = 'on'` — ใช้เฉพาะ `supabase/seed.sql`

อ่านด้วย `app.is_seed_mode()` ซึ่งเป็นจริงก็ต่อเมื่อ **ครบทั้งสามเงื่อนไข** (CANONICAL ข้อ 19.1 ข้อ 10)

1. `app.seed_mode = 'on'`
2. role GUC เป็น `none` (ไม่ได้ `SET ROLE` เป็น `authenticated`)
3. session user เป็น superuser/`postgres` (บน PGlite คือ `web_user`)

**ข้ามอะไรบ้าง** (CANONICAL ข้อ 13.0 ข้อ 7)

- `audit.log_row_change` ทั้งหมด (แถว audit ใน seed มีเฉพาะตัวอย่างข้อ 13.14 ที่ใส่ตรง)
- การสร้าง notification (แถวแจ้งเตือนใน seed = snapshot ของข้อ 13.14 ไม่ใช่ผลของกติกาข้อ 11.1)
- guard เส้นทางสถานะของ `core.staff_role_assignments` และ `audit.export_requests` (seed ต้องใส่แถวที่อยู่กลางเส้นทางได้)

**trigger ประวัติสถานะยังทำงานตามปกติ** — `lead_status_history` / `opportunity_stage_history` ใน seed จึงสมจริง

**เหตุผลที่เงื่อนไขต้องครบสามข้อ:** ผู้ใช้ที่เรียก RPC ผ่าน PostgREST ตั้ง `app.seed_mode` เองได้ (เป็น GUC ธรรมดา) — เงื่อนไข role และ session user ทำให้ค่าที่ผู้ใช้ตั้งไม่มีผล

---

## 7. `app.clock()` — นาฬิกาสองเรือนของระบบ

**กฎ** (CANONICAL ข้อ 1.2) — ระบบมีนาฬิกาสองเรือนและ **ห้ามสลับกัน**

| นาฬิกา | ใช้กับ | เหตุผล |
|---|---|---|
| **`app.clock()`** | KPI · รายงาน · คุณภาพข้อมูล · การแจ้งเตือน · การจัดกลุ่ม "วันนี้" · ป้าย "ลูกค้าใหม่" · งานตามเวลา | ต้องหยุดเวลาได้เพื่อให้ seed/test ให้ผลเดิมทุกครั้ง |
| **`now()`** | การตัดสินสิทธิ์ — `valid_from`/`valid_to` ของ assignment · กรอบ 24 ชม. ของการแก้ interaction · อายุคำเชิญ · ตัวนับอัตรา | สิทธิ์ต้องอิงเวลาจริงเสมอ มิฉะนั้นตั้ง `clock` ย้อนหลังแล้วได้สิทธิ์คืน |

นิยาม: `app.clock()` = `app.settings['clock'].as_of` เมื่อ `app.settings['env'] <> 'prod'` มิฉะนั้น `now()`

- บน **prod** ค่า `clock.as_of` ต้องเป็น `null` — ถ้าไม่ใช่ ระบบจะรายงานเวลาผิด
- seed และ test ตั้ง `{"as_of":"2026-09-11T10:24:00+07:00"}` = **"ตอนนี้" ของทุกตัวอย่างใน CANONICAL ข้อ 13**
- `app.clock()` เป็น `STABLE` + GRANT EXECUTE ให้ `authenticated`

**ขอบวันธุรกิจ:** ใช้ `(ts AT TIME ZONE 'Asia/Bangkok')::date` เสมอ ผ่าน helper `app.bangkok_date(p_ts)` — **ห้ามพึ่ง session TimeZone** (ทั้ง Supabase และ PGlite เป็น `UTC`) · ช่วง "N วันล่าสุด" เป็นครึ่งเปิด `[วันนี้ − (N−1), พรุ่งนี้)` ขอบบนใช้ `<` เสมอ

---

## 8. เลขอ้างอิง (running numbers)

**กฎ:** เลขทุกชนิดออกจาก `app.running_numbers(scope_key text PK, last_value bigint)` ผ่าน `app.next_running_number(p_scope_key)` เท่านั้น (CANONICAL ข้อ 6.1)

```sql
INSERT INTO app.running_numbers (scope_key, last_value) VALUES (p_scope_key, 1)
ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1
RETURNING last_value
```

| สิ่ง | รูปแบบ | scope_key | ความกว้าง |
|---|---|---|---:|
| ลูกค้า | `CUS-{YYYY}-{NNNNNN}` | `CUS:{YYYY}` | 6 |
| Lead · Opportunity · Quotation · Task | `LD-` · `OP-` · `QT-` · `TK-` `{YYYY}-{NNNNNN}` | `LD:{YYYY}` · `OP:{YYYY}` · `QT:{YYYY}` · `TK:{YYYY}` | 6 |
| การรวมลูกค้า · คำขอเจ้าของข้อมูล · คำขอส่งออก | `MG-` · `DSR-` · `EX-` `{YYYY}-{NNNNNN}` | `MG:{YYYY}` · `DSR:{YYYY}` · `EX:{YYYY}` | 6 |
| คำขอมอบบทบาท | `RG-{YYYY}-{NNNN}` | `RG:{YYYY}` | 4 |
| พนักงาน | `ST-{NNNN}` | `ST` | 4 |
| Visit | `V-{branch}-{YYMMDD}-{NNN}` | `VISIT:{branch}:{YYYYMMDD}` | 3 |
| คิวหน้าร้าน | `queue_no` เป็น integer แสดง "คิว 001" | `QUEUE:{branch}:{YYYYMMDD}` | 3 |

**รายละเอียดที่ผิดง่าย**

1. **ปี/วันคำนวณจาก `created_at` ของแถว** (visit ใช้ `started_at`) `AT TIME ZONE 'Asia/Bangkok'` — **ไม่ใช่ `now()`** · ปีเป็น **ค.ศ.** เสมอ
2. `lpad` ไม่ตัดเลขที่เกินหลัก (`CUS-2026-1234567` ถูกต้อง) — `02_schema_stage2.sql` ตรวจกรณีนี้
3. **ถ้าแถวมีเลขมาแล้ว trigger ไม่เขียนทับ** — seed และ import จึงใส่เลขของตัวเองได้ แต่ **ต้องตั้ง `app.running_numbers` ให้ตรง** มิฉะนั้นแถวถัดไปจะชนเลขเดิม (CANONICAL ข้อ 13.0 ข้อ 8 ระบุค่าที่ seed ต้องตั้งไว้ครบ)
4. `visit_no` กับ `queue_no` ใช้ **ตัวนับคนละตัว** และไม่จำเป็นต้องเท่ากัน (queue มีเฉพาะ WALK_IN)
5. `app.running_numbers` ไม่มี GRANT ให้ `authenticated` — เขียนผ่าน trigger `SECURITY DEFINER` เท่านั้น

---

## 9. `first_seen_at` · `lifecycle_stage` · คอลัมน์แคช

นี่คือสามกลไกที่ทำให้ "ตัวเลขบนหน้าจอ" กับ "แถวในฐานข้อมูล" ตรงกันเสมอ

### 9.1 `first_seen_at` — หลักประกันของ `ใหม่ + เก่า = ไม่ซ้ำ`

**นิยาม:** เวลาของ**กิจกรรมแรกที่รู้** ไม่ใช่เวลาสร้างแถว (CANONICAL ข้อ 3.2)

- ตอนสร้าง = `least(created_at, เวลากิจกรรมที่แนบมา)`
- trigger บน `visits` `interactions` `leads` `opportunities` `transaction_refs` (INSERT หรือเปลี่ยน `customer_id`) ตั้ง `first_seen_at = least(first_seen_at, เวลาเหตุการณ์)` — **ดึงได้เฉพาะให้เก่าลง**
- merge: survivor ได้ `least` ของทั้งสองราย · `first_channel_code`/`first_source_code`/`first_branch_id` มาจากรายที่ `first_seen_at` **เก่ากว่า** ไม่ใช่จาก `p_field_choices`

**invariant ที่มี test คุม:** ไม่มีกิจกรรมใดที่ `occurred_at < customers.first_seen_at` → รับประกันว่าในทุกช่วงเวลา `NEW_CUSTOMERS + RETURNING_CUSTOMERS = UNIQUE_CUSTOMERS` พอดี (`02_schema_stage2.sql` · `acceptance.sql`)

### 9.2 `lifecycle_stage` — คำนวณ ห้ามแก้ด้วยมือ

`text` + CHECK 6 ค่า (ข้อ 2) · ปรับโดย `app.refresh_customer_lifecycle(p_customer_id)` เท่านั้น (CANONICAL ข้อ 3.4)

```
ล็อกแถวก่อน:  PERFORM 1 FROM crm.customers WHERE id = p_customer_id FOR UPDATE;
แล้วจึง:      UPDATE … WHERE lifecycle_stage IS DISTINCT FROM v_stage;
```

- ลำดับตรวจ: `REPEAT` → `CUSTOMER` → `OPPORTUNITY` → `LEAD` → `LOST` → `IDENTIFIED`
- เรียกจาก **AFTER ROW trigger แยกตาม event** (`_ins` · `_upd` · `_del`) — CANONICAL ห้ามใช้ transition table หลาย event ในตัวเดียว
- ข้ามเมื่อ `app.bulk = 'on'`

**เหตุผลที่ต้องล็อกแถวก่อน:** สองทรานแซกชันที่เพิ่ม opportunity ให้ลูกค้าคนเดียวกันพร้อมกัน จะคำนวณ stage จาก snapshot คนละอัน · `FOR UPDATE` บังคับให้เรียงคิว · `IS DISTINCT FROM` กันการเขียนซ้ำที่จะปลุก trigger อื่นโดยเปล่าประโยชน์

### 9.3 คอลัมน์แคชบน `crm.customers`

| คอลัมน์ | เนื้อหา | trigger ที่เขียน |
|---|---|---|
| `last_activity_at` | เวลากิจกรรมล่าสุดตาม CANONICAL ข้อ 3.1 | `app.trg_touch_customer_activity` |
| `last_channel_code` | ช่องทางของ interaction ล่าสุดที่ **ไม่ใช่ `INTERNAL`** | เดียวกัน |
| `last_branch_id` | สาขาของกิจกรรมล่าสุด (คอลัมน์ "สาขา" ในหน้ารายการลูกค้า) | เดียวกัน |
| `has_open_followup` | มี task `FOLLOW_UP` สถานะ `OPEN`/`IN_PROGRESS` → ป้าย "ติดตามอยู่" | เดียวกัน |
| `has_new_lead` | มี lead เปิดสถานะ `NEW` → ป้าย "ยังไม่ได้ติดต่อ" | เดียวกัน |
| `note_summary` | เนื้อหาโน้ตที่ปักหมุดล่าสุด | `app.trg_sync_note_summary` |

**กฎ:** หน้ารายการลูกค้าและป้ายเสริม **อ่านจากคอลัมน์เหล่านี้เท่านั้น ห้ามอ่าน `tasks`/`leads` ตรง** (CANONICAL ข้อ 6.3)

**เหตุผล:** `tasks` ไม่มี read-through ผ่านลูกค้า (ข้อ 9.4) — ถ้าป้ายอ่านจาก `tasks` ตรง คนที่ไม่มี `task.read` ของงานนั้นจะเห็นป้ายไม่เหมือนคนอื่น · อ่านจากแคชทำให้ **ผู้ดูทุกคนเห็นป้ายเดียวกัน** และเรียง/กรองด้วย index ได้

**ข้อแลกเปลี่ยน:** แคชอาจค้างถ้ามีใครเขียนตารางกิจกรรมโดยปิด trigger หรือลืม refresh หลังงาน bulk — `app.refresh_customer_activity(p_customer_id)` คือทางแก้ และ `acceptance.sql` คือตัวจับ

---

## 10. การออกแบบ Audit

**กฎ** (CANONICAL ข้อ 9.5)

1. `audit.audit_logs` เป็น **append-only** — REVOKE UPDATE/DELETE/TRUNCATE จากทุก role และ trigger `audit.deny_change()` ปฏิเสธซ้ำอีกชั้น
2. มีข้อยกเว้นสองข้อเท่านั้น
   - DELETE เมื่อ `current_user = 'audit_retention'` (งาน retention `SET LOCAL ROLE audit_retention` ก่อนลบ · ข้อ 19.4 ข้อ 1) **และแถวต้องเก่ากว่าระยะเก็บ**
   - UPDATE เฉพาะคอลัมน์ `before`/`after` เมื่อ `app.audit_redaction = 'on'` (ใช้โดย `app.anonymize_customer` เท่านั้น)
3. `before`/`after` เก็บ **ภาพทั้งแถว** · คอลัมน์ที่ติดป้าย `[pii]` แปลงเป็น `{"masked":"081-XXX-1234","sha256":"…"}` — **ไม่เก็บค่าเต็ม**
4. `entity_id` เป็น `text` และ **ไม่มี FK** ไปตารางธุรกิจ — log ต้องอยู่รอดแม้แถวต้นทางถูก anonymize
5. `reason` **ห้ามมี PII** (ข้อ 19.4 ข้อ 2)
6. **ไม่บันทึกเมื่อคอลัมน์ที่เปลี่ยนมีแค่** `updated_at` `updated_by` `last_activity_at` `last_channel_code` `last_branch_id` `has_open_followup` `has_new_lead` `lifecycle_stage` `first_seen_at` `note_summary` — มิฉะนั้น log จะเต็มไปด้วยการเปลี่ยนแคช
7. **ไม่ติด trigger audit** บน `crm.notifications` · `lead_status_history` · `opportunity_stage_history` · `ownership_changes` · `customer_branches` (ตารางเหล่านี้เป็น log อยู่แล้ว)

**ผู้กระทำ (actor)**

| กรณี | `actor_type` | มาจาก |
|---|---|---|
| ผู้ใช้เรียกผ่าน JWT | `STAFF` | `app.current_staff_id()` |
| งานตามเวลา | `SYSTEM` | `app.actor_type` + `app.actor_label` = `SYSTEM:{job}` |
| Edge Function ด้วย service_role | `STAFF` หรือ `INTEGRATION` | `app.actor_staff_id` ที่ `app.svc_set_actor()` ตั้งจาก `sub` ของ JWT ที่ verify แล้ว |

`ip` · `user_agent` · `device_id` · `request_id` อ่านจาก `current_setting('request.headers', true)::jsonb` (คีย์ `x-client-ip` · `x-client-ua` · `x-device-id` · `x-request-id`) — **ถือเป็นค่า "ที่รายงาน" ไม่ใช่หลักฐาน** และ **ห้ามใช้ตัดสินสิทธิ์**

**`audit.access_logs` แยกจาก `audit_logs`** เพราะบันทึกการ **อ่าน** ไม่ใช่การเขียน (`CUSTOMER_VIEWED` · `CONTACT_REVEALED` · `CUSTOMER_SEARCH` · `CUSTOMER_CANDIDATE_SEARCH` · `CUSTOMER_LINKED_TO_BRANCH`) · เก็บ `sha256` ของค่าที่ค้น **ไม่เก็บค่าจริง** · hash ไม่ใส่ salt (ความเสี่ยงที่ยอมรับ · keyed hash พิจารณา Phase 3 · ข้อ 19.4 ข้อ 6) และ **ไม่ส่งออกนอกฐานข้อมูล**

---

## 11. โมเดล GRANT (สี่ชั้น)

**กฎ:** สิทธิ์เป็น **ผลคูณ** ของสี่ชั้น ผู้ใช้ผ่านได้ต้องผ่านครบทุกชั้น

| ชั้น | ควบคุมอะไร | ตั้งที่ไหน |
|---|---|---|
| 1. Data API exposed schemas | schema ไหนเรียกผ่าน PostgREST ได้ | ตั้งค่าโปรเจกต์ Supabase = `api, crm, core, ref` |
| 2. `GRANT USAGE ON SCHEMA` | เข้าถึง schema ได้ไหม | `api` `crm` `core` `ref` → `authenticated`, `service_role` · `app` → `authenticated` · `anon` **ไม่ได้อะไรเลย** |
| 3. `GRANT` ระดับตาราง/คอลัมน์ | ทำ SELECT/INSERT/UPDATE คอลัมน์ไหนได้ | migration `0010_security.sql` |
| 4. **RLS policy** | เห็น/เขียน **แถวไหน** ได้ | migration `0010_security.sql` (113 policy) |

**ชั้นที่ 3 คือที่ที่ CANONICAL ข้อ 9.4 กติกา 7 มีผล** — คอลัมน์ระบบ (`organization_id` · `created_by` · `*_no` · `first_seen_at` · `lifecycle_stage` · แคช `last_*`/`has_*` · `note_summary` · `created_via` · `record_status` · `merged_into_id` · `legal_hold` · `expected_amount` · `is_visit_root` · `is_next_action` · `closed_by_system` · `queue_no` · `outcome_code` · `converted_opportunity_id`) **ไม่อยู่ใน column grant ของ UPDATE** ผู้ใช้จึงเขียนไม่ได้แม้จะผ่าน policy

**ตารางที่ไม่มี GRANT ให้ใครเลย** (เขียน/อ่านผ่าน trigger หรือ RPC `SECURITY DEFINER` เท่านั้น · CANONICAL ข้อ 9.4 กติกา 6)
`crm.customers` (INSERT) · `crm.visits` (INSERT) · `customer_contacts` · `customer_addresses` · `customer_consents` · `customer_branches` · `lead_status_history` · `opportunity_stage_history` · `ownership_changes` · `customer_merges` · `duplicate_decisions` · `crm.notifications` (INSERT) · `audit.*` · `app.*`

**ฟังก์ชัน**

- `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ทำทั้งฐาน → **ทุกฟังก์ชันที่ถูกเรียกตรงต้อง GRANT EXECUTE เอง** (CANONICAL ข้อ 19.1 ข้อ 2)
- helper 15 ตัวใน `app` ที่ GRANT ให้ `authenticated` (เพราะ policy เรียก): `bangkok_date` · `can_access_customer` · `can_access_record` · `clock` · `current_organization_id` · `current_staff_id` · `customer_ids_in_scope` · `has_permission` · `is_aal2` · `readable_customer_ids` · `scope_branch_ids` · `staff_has_branch_assignment` · `team_member_staff_ids` · `team_scope_pairs` · `transition_denied`
- `api.svc_*` GRANT ให้ `service_role` **เท่านั้น** และตรวจ `auth.role() = 'service_role'` เป็นบรรทัดแรก
- `app.job_*` และ `app.refresh_*` **ไม่ GRANT ให้ใคร** — เรียกได้เฉพาะในฐานะ `postgres` (pg_cron) หรือจากฟังก์ชันอื่น

**ทำไม `can_access_record` / `can_access_customer` ห้ามใช้ใน policy** (CANONICAL ข้อ 9.3 · 9.4 กติกา 2): ทั้งสองรับ**คอลัมน์ของแถว**เป็นพารามิเตอร์ → PostgreSQL เรียกทีละแถว ทำให้ตารางใหญ่ช้าและ planner ปรับไม่ได้ · policy ต้องใช้ฟังก์ชันที่รับ**ค่าคงที่**แล้วห่อด้วย `(SELECT …)` เพื่อให้เรียกครั้งเดียวต่อ query (`app.scope_branch_ids` · `app.team_scope_pairs` · `app.readable_customer_ids`) · สองตัวแรกใช้ได้เฉพาะใน **trigger และ RPC**

---

## 12. View ใน `analytics` และ RPC ของรายงาน

**กฎ**

1. **ทุก view ในทุก schema สร้างด้วย `WITH (security_invoker = true)`** · **ห้าม materialized view** ใน schema ที่เปิด API (CANONICAL ข้อ 9.4 กติกา 4) · CI ตรวจคืน 0 แถว (`rls_01_catalog.sql` CI-02)
2. view ใน `analytics` **ไม่มี GRANT ให้ใคร** — อ่านได้เฉพาะภายใน RPC `SECURITY DEFINER` (ข้อ 9.4.1)
3. KPI/รายงานให้บริการผ่าน **RPC สองตัวเท่านั้น**

| view | นิยาม | ใช้กับ |
|---|---|---|
| `analytics.customer_activity` | UNION ของ 6 แหล่ง: `visits.started_at` (ไม่นับ `CANCELLED`) · `interactions.occurred_at` (ไม่นับที่ผูก visit `CANCELLED`) · `leads.created_at` · `opportunities.created_at` · `opportunities.closed_at` · `transaction_refs.transacted_at` | `UNIQUE_CUSTOMERS` · `NEW_CUSTOMERS` · `RETURNING_CUSTOMERS` (ข้อ 3.1 · 12.1) |
| `analytics.purchase_events` | opportunity `WON` ที่ `won_at` **รวมกับ** `transaction_refs` ที่ `counts_as_purchase` และไม่ได้ผูก opportunity `WON` | `BUYERS` · `REPEAT_BUYERS` · `REPEAT_RATE` · `lifecycle_stage` |
| `analytics.data_quality_issues` | 9 ชนิดตาม CANONICAL ข้อ 12.3 · เกณฑ์วันอ่านจาก `app.settings` | `api.list_data_quality_issues` · KPI คุณภาพข้อมูล |
| `crm.customer_consent_current` | แถวล่าสุดต่อ `(customer_id, purpose_code)` | สถานะความยินยอมปัจจุบัน (ข้อ 10.2) |

**RPC**

```
api.get_kpis(p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_group_by text)   -- DEFINER · STABLE
api.get_report(p_code text, p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_params jsonb)
```

- `p_preset` ∈ 9 ค่าของ CANONICAL ข้อ 12.0 · ถ้าไม่ใช่ `CUSTOM` ให้ **ละเลย** `p_start`/`p_end`
- `p_group_by` ∈ `NONE` `BRANCH` `TEAM` `STAFF` `CHANNEL` `STATUS`
- `p_code` ของรายงาน: `OVERVIEW` · `CUSTOMERS` · `SALES` · `CHANNELS` · `STAFF` · `BRANCHES` · `LOST_REASONS` · `DATA_QUALITY`
- ตรวจ `dashboard.view` / `report.view` (`report.staff_performance` สำหรับรายงานรายพนักงาน) → **ตัด `p_branch_ids` ด้วยสาขาของสิทธิ์นั้น** → scope `TEAM`/`OWN` กรองตาม owner
- **คืนเฉพาะตัวเลขรวม** ไม่มี `customer_id` ชื่อ หรือเบอร์ · รวมลูกค้า `ANONYMIZED` และ `MERGED` (นับที่ survivor) เสมอ
- เมื่อผู้เรียกมีเพียง scope TEAM/OWN: KPI ที่ไม่มีการผูกพนักงานคืน `NULL` · อัตราที่ตัวตั้ง/ตัวหารเป็น `NULL` คืน `NULL`

**เหตุผลที่ไม่ใช้ materialized view:** ตัวเลขต้องตรงกับแถวจริง ณ เวลาที่ถาม (CANONICAL ข้อ 13.0 ข้อ 2 บังคับว่า KPI ทุกตัวต้องคำนวณได้จากแถวจริง) · matview ยังไม่รองรับ RLS และต้องมีงาน refresh เพิ่มอีกชั้น

---

## 13. งานตามเวลา (jobs) และ cron

**กฎ:** ตรรกะอยู่ใน `0013_jobs.sql` · ตารางเวลาอยู่ใน `0014_schedule_cron.sql` เท่านั้น (ไฟล์ `_cron.sql` ห้ามสร้าง/แก้ตาราง ฟังก์ชัน หรือสิทธิ์)

| ฟังก์ชัน | เวลา (Asia/Bangkok) | cron (UTC) | ทำอะไร |
|---|---|---|---|
| `app.job_close_stale_visits(p_as_of)` | 00:05 | `5 17 * * *` | visit ที่ยังไม่ปิดของวันธุรกิจก่อนหน้า → `COMPLETED` + outcome `UNRECORDED` · `ended_at` = 23:59:59 ของวันนั้น · `closed_by_system = true` · แจ้ง `VISIT_OUTCOME_MISSING` |
| `app.job_expire_quotations(p_as_of)` | 00:10 | `10 17 * * *` | ใบเสนอราคาที่พ้น `valid_until` → `EXPIRED` |
| `app.job_retention(p_as_of)` | 02:00 | `0 19 * * *` | แจ้งล่วงหน้า 30 วัน → anonymize → `SET LOCAL ROLE audit_retention` แล้วลบ log ที่ครบระยะเก็บ |
| `app.job_expire_exports(p_as_of)` | ทุกชั่วโมง นาทีที่ 15 | `15 * * * *` | `GENERATED`/`DOWNLOADED` ที่เกิน `export.link_ttl_hours` → `EXPIRED` (คง `download_count`) |
| `app.job_notifications(p_as_of)` | ทุก 5 นาที | `*/5 * * * *` | การแจ้งเตือนที่เป็นงานตามเวลาทั้งหมดของ CANONICAL ข้อ 11.1 |

**กฎการออกแบบงาน**

1. ทุกงานรับ `p_as_of` ได้ · ตารางเวลาเรียกโดยไม่ส่งค่า → ใช้ `app.clock()` (บน prod เท่ากับ `now()`)
2. ทุกงานต้อง **idempotent** — รันซ้ำด้วย `p_as_of` เดิมต้องไม่เปลี่ยนผลและไม่สร้างแถวซ้ำ (`jobs_01.sql` ทดสอบข้อนี้โดยตรง)
3. การกันแจ้งซ้ำใช้ `notifications.dedupe_key` ที่ยึดกับ **"จุดยึดของรายการ"** (`due_at` · `due_at + 24 ชม.` · เวลาที่ lead เริ่มไม่มี owner · วันที่ของสรุป) **ไม่ใช่วันที่ job รัน** + UNIQUE `(recipient_staff_id, dedupe_key)`
4. `app.job_retention` เป็น **`SECURITY INVOKER`** (ข้อ 19.4 ข้อ 1) เพื่อให้ `SET LOCAL ROLE audit_retention` มีผลจริง — งานอื่นเป็น DEFINER
5. actor ของงานระบบ: `app.actor_type = 'SYSTEM'` · `app.actor_label = 'SYSTEM:{job}'`
6. **PGlite ข้าม `0014`** จึงทดสอบงานโดย**เรียกฟังก์ชันตรง**พร้อม `p_as_of` ที่ระบุชัด — ตารางเวลาเองไม่มี test (ต้องตรวจบน Supabase จริงตอน deploy)

**การลบไฟล์ใน Storage** ทำโดย Edge Function `cron-export-cleanup` ที่อ่าน `api.svc_expired_export_files()` — ฐานข้อมูลลบไฟล์เองไม่ได้ **[รอยืนยัน — หรือใช้ scheduler ภายนอกเรียก Edge Function แทน pg_cron]**

---

## 14. Harness การทดสอบ (PGlite)

### 14.1 `tools/db/run.mjs` ทำอะไร

```bash
node tools/db/run.mjs                          # migrations อย่างเดียว
node tools/db/run.mjs --seed                   # + supabase/seed.sql
node tools/db/run.mjs --seed --test --quiet    # + ทุกไฟล์ใน supabase/tests/   ← npm run db:test
node tools/db/run.mjs --test rls_              # เฉพาะไฟล์ที่ขึ้นต้นด้วย rls_
node tools/db/run.mjs --seed --sql "select …"  # รันคำสั่งเดียวแล้วพิมพ์ผล (ดีบัก)
```

1. เปิด **PGlite 0.4.1 = PostgreSQL 17.5 (WASM)** — ไม่ต้องติดตั้ง PostgreSQL หรือ Docker · ตรวจว่าเวอร์ชันเป็น 17 จริง ไม่ใช่ก็ออกด้วย exit 2
2. `SET TIME ZONE 'UTC'` (เหมือน Supabase) · `CREATE EXTENSION pg_trgm WITH SCHEMA extensions`
3. โหลด `tools/db/supabase-shim.sql` — จำลองเฉพาะส่วนของ Supabase ที่ migration อ้างถึง
   - role: `anon` · `authenticated` · `service_role` (BYPASSRLS) · `supabase_auth_admin`
   - schema `auth`: ตาราง `auth.users` · `auth.mfa_factors` · ฟังก์ชัน `auth.uid()` · `auth.jwt()` · `auth.role()`
   - schema `test`: `login_as(email, aal)` · `login_as_uid` · `login_anon` · `logout` · `assert_true` · `assert_eq` · `assert_raises(sql, msg, sqlstate)` · `count_rows(sql)`
4. รัน `supabase/migrations/*.sql` ตามชื่อ · **ข้าม `*_cron.sql`** · แต่ละไฟล์อยู่ในทรานแซกชันของตัวเอง
5. `--seed` โหลด `supabase/seed.sql`
6. `--test` รันทุกไฟล์ใน `supabase/tests/` โดย**ครอบแต่ละไฟล์ด้วย `BEGIN … ROLLBACK`** → ไฟล์ทดสอบสร้างตาราง/ฟังก์ชัน/ข้อมูลของตัวเองได้โดยไม่กระทบไฟล์ถัดไป
7. ผ่าน = ไม่มี exception · นับ assertion จาก NOTICE ที่ขึ้นต้น `ok:` · exit 1 เมื่อมีไฟล์ใดล้มเหลว

**กฎของไฟล์ทดสอบ**

- **ห้ามมีคำสั่งควบคุมทรานแซกชัน** (`BEGIN` · `COMMIT` · `ROLLBACK` · `SAVEPOINT`) ในไฟล์ — runner ครอบให้แล้ว
- **PGlite รันด้วย superuser ที่ข้าม RLS ทุกกรณี** → ทุก assertion ที่ตรวจสิทธิ์ **ต้องเรียก `test.login_as(...)` ก่อน** มิฉะนั้นการทดสอบจะผ่านแบบหลอก ๆ
- ไฟล์ที่ใช้ fixture ของตัวเองต้อง **seed-independent**: องค์กรรหัส `TEST-*` · อีเมล `@test.example.com` · `staff_code` `ST-9xxx` — เพื่อให้ผ่านทั้งแบบมีและไม่มี `--seed`

### 14.2 ไฟล์ทดสอบทั้งหมด (ผลจากการรันจริง `node tools/db/run.mjs --seed --test --quiet`)

| # | ไฟล์ | ครอบคลุม | assertion | ต้องมี seed |
|---:|---|---|---:|:--:|
| 1 | `01_schema_stage1.sql` | migration 0001–0004: schema + GRANT ระดับ schema · default privilege ของฟังก์ชัน · ENUM ทุกตัวและลำดับค่า · บทบาท 8 แถว · **ตารางสิทธิ์ข้อ 8.1 ทุกช่อง** (ถอดแบบแยกจาก migration เพื่อตรวจไขว้) · Master Data ทุกตาราง (77 จังหวัด) · `app.settings` · `app.clock()` · normalize/mask ข้อ 6.4 · generated column · CHECK สำคัญ · RLS เปิดทุกตาราง · view `security_invoker` | 242 | – |
| 2 | `02_schema_stage2.sql` | migration 0005–0009: เลขอ้างอิงทุกชนิด (ขอบปี Asia/Bangkok · `visit_no`/`queue_no` แยกตัวนับ · เกินหลักไม่ตัด) · CHECK ของทุกตารางกิจกรรม · `first_seen_at` + invariant · แคช `last_*`/`has_*` · `customer_branches` · lifecycle ทุกขั้น · `NEW → CONTACTED` · ประวัติสถานะ · next-action task sync · `expected_amount` · `note_summary` · guard เลขบัตรประชาชน · audit (masked + sha256 · actor · header · append-only · redaction · retention) | 175 | – |
| 3 | `acceptance.sql` | **ทุกตัวเลขที่พิมพ์ใน CANONICAL ข้อ 13.1–13.12 · 13.14 · 14.7** และคำถาม Acceptance 11 ข้อของ A44 · B27 — คำนวณจากแถวจริงผ่าน `api.get_kpis` / `api.get_report` | **1,037** | ✓ |
| 4 | `analytics_01_kpis.sql` | migration 0012: `analytics.customer_activity` · `purchase_events` · `data_quality_issues` · `app.kpi_period` · `app.fmt_*` · `api.get_kpis` (ข้อ 1.2 · 1.3 · 3.1 · 9.4.1 · 12.0–12.4) · fixture `TEST-KPI` / `ST-91xx` | 163 | – |
| 5 | `analytics_02_reports.sql` | `api.get_report` ทั้ง 8 รหัส · `api.record_report_export` (ข้อ 12.0 · 13.4 · 14.8) · fixture `TEST-RPT` / `ST-92xx` | 52 | – |
| 6 | `api_01_customer.sql` | RPC ลูกค้า: `quick_capture` · `find_customer_candidates` · `search_customers` · `link_customer_to_branch` · `get_customer_360` · `reveal_contact` · `reveal_address` · `save_contact` · `save_address` · `record_consent` · `merge_customers` · `decide_duplicate` · fixture `TEST-API` / `ST-96xx` | 84 | – |
| 7 | `api_02_work.sql` | RPC งานหน้าร้าน: `open_visit` · `close_visit` · `acknowledge_unrecorded_visit` · `convert_lead` · `assign_owner` | 49 | – |
| 8 | `api_03_admin.sql` | RPC ผู้ใช้/สิทธิ์/ค่าตั้ง/ส่งออก/audit/PDPA รวม `api.svc_*` ทั้งชุด (ดูรายชื่อในหัวไฟล์) | 135 | – |
| 9 | `jobs_01.sql` | งานตามเวลาทั้ง 5 ตัวของ migration 0013 · เรียกด้วย `p_as_of` ที่ระบุชัด → ตรวจ **การรันซ้ำ (idempotent)** ได้ · fixture `TEST-JOB` / `ST-93xx` | 73 | – |
| 10 | `rls_01_catalog.sql` | CI check ของสิทธิ์/RLS (CI-01 … CI-26 · แหล่งจริง = `docs/04-security/rls-spec.md` ข้อ 9) — ไม่ใช้ fixture · ทุก assertion ต้องได้ผลว่าง/0: RLS เปิดครบใน `core` `ref` `crm` `app` · view `security_invoker` · ฟังก์ชันมี `search_path` · ไม่มี GRANT ให้ `anon` · คอลัมน์ระบบไม่อยู่ใน column grant | 33 | – |
| 11 | `rls_02_helpers.sql` | helper ตรวจสิทธิ์ทั้งชุด (`scope_branch_ids` · `team_scope_pairs` · `customer_ids_in_scope` · MFA · ลำดับ scope) · fixture `TEST-RLS` persona P01–P19 | 43 | – |
| 12 | `rls_03_customer.sql` | RLS ของลูกค้าและตารางย่อย · column grant ของ `customer_contacts` | 53 | – |
| 13 | `rls_04_activity.sql` | RLS ของ `visits` · `interactions` · `transaction_refs` | 23 | – |
| 14 | `rls_05_sales.sql` | RLS ของ `leads` · `opportunities` · `quotations` + items | 32 | – |
| 15 | `rls_06_work.sql` | RLS ของ `tasks` · `task_comments` · `notifications` (**ไม่มี read-through**) | 23 | – |
| 16 | `rls_07_transition.sql` | `app.enforce_row_transition` ทุกแถวของ mapping คอลัมน์→สิทธิ์ (ข้อ 9.4.2) | 64 | – |
| 17 | `rls_08_core_ref_app_audit.sql` | RLS/GRANT ของ `core` · `ref` · `app` · `audit` | 29 | – |
| 18 | `rls_09_links_and_writes.sql` | WITH CHECK ของการผูกลูกค้า/สาขา · การเขียนข้ามสาขา · `api.link_customer_to_branch` | 51 | – |
| 19 | `rls_personas.sql` | **ตารางผลที่คาดของ CANONICAL ข้อ 13.13 ทั้งตาราง** (ผู้ใช้ตัวอย่าง 13 ราย × 6 คอลัมน์ · aal1/aal2) | 109 | ✓ |
| | **รวม** | | **2,447** | |

**ผลการรันจริง**

| คำสั่ง | ผล |
|---|---|
| `node tools/db/run.mjs --seed --test --quiet` | ผ่านทั้งหมด **19 ไฟล์ · 2,447 assertion** (~69 วินาที · seed 6.1 วินาที) |
| `node tools/db/run.mjs --test --quiet` (ไม่มี seed) | ผ่าน **17 ไฟล์ · 1,301 assertion** · `acceptance.sql` และ `rls_personas.sql` ล้มเหลวตามที่ออกแบบไว้ (ต้องใช้ข้อมูลของ seed) |

**หมายเหตุด้านเวลา:** `rls_02_helpers.sql` ใช้ ~33 วินาทีเมื่อมี seed แต่ ~0.8 วินาทีเมื่อไม่มี — helper อย่าง `app.customer_ids_in_scope` สแกนลูกค้าทั้ง 14,962 รายใน PGlite (WASM ไม่มี parallel worker) ไม่ใช่สัญญาณของปัญหาบน Supabase จริง แต่เป็นเหตุผลที่ควรรัน `--test rls_` ระหว่างพัฒนาแล้วค่อยรันเต็มก่อน commit

### 14.3 `npm run db:dictionary`

`tools/db/gen-data-dictionary.mjs` ใช้วิธีโหลด PGlite เดียวกัน (shim + migrations **ไม่มี seed**) แล้วอ่าน catalog เขียน `docs/03-data/data-dictionary.md`

- ผลลัพธ์ **deterministic** — ไม่มีเวลาที่รันในไฟล์ · ทุกรายการเรียงตามชื่อ → `git diff` ของ data dictionary คือผลของ migration โดยตรง
- `node tools/db/gen-data-dictionary.mjs --check` ไม่เขียนไฟล์ แต่ออก exit 1 ถ้าไฟล์ในดิสก์ไม่ตรงกับฐานข้อมูล (เหมาะกับ CI)
- generator ตรวจให้ด้วยและรายงานในข้อ 8 ของเอกสาร: ENUM ทุกตัวมีป้ายไทยครบ · ทุกค่าในชุด `text` + CHECK ปรากฏใน CHECK จริง · ทุก view เป็น `security_invoker` · ทุกฟังก์ชันตั้ง `search_path` · ตารางใน `core`/`ref`/`crm` เปิด RLS ครบ
- **ต้องรันและ commit ผลทุกครั้งที่ migration เปลี่ยน**

---

## 15. ข้อจำกัดที่รู้ และรายการที่ยังต้องยืนยัน

### 15.1 ข้อจำกัดของ harness (PGlite ≠ Supabase)

| # | ข้อจำกัด | ผล | ทางลด |
|---|---|---|---|
| 1 | ไม่มี `pg_cron` · `pg_net` | `0014_schedule_cron.sql` **ไม่เคยถูกรัน**ในการทดสอบ | ทดสอบงานโดยเรียกฟังก์ชันตรงพร้อม `p_as_of` · ตรวจตารางเวลาบน staging จริงตอน deploy |
| 2 | ไม่มี Supabase Auth จริง | `auth.users` · `auth.mfa_factors` เป็น shim · การตรวจ `email_confirmed_at` · MFA factor เป็นข้อมูลปลอม | flow เชิญ/เปิดใช้งาน/รีเซ็ต MFA ต้องทดสอบบน staging (UAT) |
| 3 | ไม่มี PostgREST | column grant · `max_rows` · การ expose schema เป็นการตรวจจาก catalog ไม่ใช่การเรียกจริง | UAT ต้องยิง `GET /rest/v1/customer_contacts?select=value_raw` จริงเพื่อยืนยันว่าถูกปฏิเสธ |
| 4 | ไม่มี Edge Function · Storage | `api.svc_*` ทดสอบได้แต่การ verify JWT · signed URL 60 วินาที · การลบไฟล์ ไม่ได้ | ทดสอบใน UAT |
| 5 | ผู้ใช้เริ่มต้นเป็น superuser ที่ข้าม RLS | assertion ที่ลืม `test.login_as` จะ **ผ่านแบบหลอก** | `rls_02_helpers.sql` (H00) และ `rls_personas.sql` ตรวจ `current_setting('is_superuser') = 'off'` หลังสลับเป็น `authenticated` (CANONICAL ข้อ 13.13) และทุกไฟล์ RLS เริ่มด้วยการ login |
| 6 | WASM ไม่มี parallel worker | การทดสอบที่สแกนตารางใหญ่ช้ากว่าจริงมาก | ไม่ใช้เวลาที่วัดจาก PGlite เป็นตัวเลขประสิทธิภาพ |
| 7 | ไม่มี `auth.audit_log_entries` ของ Supabase | `audit.login_events` ต้องเขียนจากฝั่งแอป/Edge Function | ระบุใน `docs/04-security/security-design.md` |

### 15.2 ข้อจำกัดของการออกแบบที่ยอมรับแล้ว

| # | ข้อจำกัด | เหตุผลที่ยอมรับ |
|---|---|---|
| 1 | `transaction_refs` **INSERT ได้อย่างเดียว** ใน V1 | ผูกด้วยมือ · การแก้ที่ผูกผิดทำด้วยสคริปต์ของ BUSINESS_ADMIN (CANONICAL Q29 · ข้อ 19.2 ข้อ 6) |
| 2 | **ไม่มี unmerge** | V1 ไม่รองรับ (ข้อ 6.7) · snapshot ก่อนรวมเก็บไว้ใน `customer_merges` แบบปิดบัง PII เพื่อการตรวจสอบเท่านั้น |
| 3 | `sha256` ใน `access_logs` **ไม่ใส่ salt** | ความเสี่ยงที่ยอมรับ · keyed hash พิจารณา Phase 3 (ข้อ 19.4 ข้อ 6) · ค่าไม่ส่งออกนอกฐานข้อมูล |
| 4 | คอลัมน์แคชบน `customers` อาจค้างได้ | แลกกับความเร็วของหน้ารายการและความสม่ำเสมอของป้าย · แก้ด้วย `app.refresh_customer_activity` · `acceptance.sql` เป็นตัวจับ |
| 5 | `employee_code` ไม่ UNIQUE | HR อาจใช้รหัสซ้ำกับบัญชีที่ปิดใช้งานแล้ว · ใช้ partial unique index `WHERE status <> 'DISABLED'` แทน **[รอยืนยัน Q1]** |
| 6 | FORCE RLS ไม่ใช่ชั้นป้องกันจริง | owner ของทุกตารางคือ `postgres` ซึ่ง BYPASSRLS อยู่แล้ว (ข้อ 9.4 กติกา 1) · ชั้นป้องกันจริงคือ GRANT + policy + Data API exposed schemas |
| 7 | `audit.*` ไม่เปิด RLS | คุมด้วย GRANT แทน (ไม่มี role ใดนอกจาก `audit_retention` เข้าถึงได้ · ข้อ 19.1 ข้อ 13) · อ่านผ่าน `api.search_audit` เท่านั้น |
| 8 | ตาราง Phase 4–5 ยังไม่สร้าง | `campaign_members` · `online_conversations` · `segments` · `restricted.customer_documents` (ข้อ 14.6) — จะเพิ่มด้วย migration ใหม่ ไม่กระทบสคีมาปัจจุบัน |

### 15.3 รายการ **[รอยืนยัน]** ที่กระทบสคีมาโดยตรง

| # | ประเด็น | ค่าที่ใช้ไปก่อน | อ้างอิง |
|---|---|---|---|
| 1 | `pg_cron` + `pg_net` บน Supabase หรือใช้ scheduler ภายนอกเรียก Edge Function | `pg_cron` (`0014_schedule_cron.sql`) | CANONICAL ข้อ 1 · 9.6 |
| 2 | `employee_code` ซ้ำได้ในบัญชีที่ `DISABLED` | partial unique index | Q1 · ข้อ 7.1 |
| 3 | หน่วย `JPON` (`branch_type = 'online_team'`) มีจริงหรือไม่ | มี | Q3 · D21 |
| 4 | `duplicate_decisions.matched_rules` เก็บข้อความบนการ์ดหรือรหัสกฎ | ข้อความบนการ์ด · CHECK `score >= 70` | ข้อ 19.1 ข้อ 7 |
| 5 | JAUNPHONE กับ JAUN POWER MONEY เป็นนิติบุคคลเดียวกันหรือไม่ — ถ้าไม่ ต้องแยก purpose เป็น `MARKETING_JAUNPHONE` / `MARKETING_JPM` และใช้ `ref.consent_purposes.controller_entity` | controller เดียว | Q17 · ข้อ 10.2 |
| 6 | เพดานและผู้อนุมัติของ `export.limits` | ตาราง CANONICAL ข้อ 8.2 · เก็บเป็น `{ROLE: {max_rows, per_day, approver_role}}` | Q7 · Q23 · ข้อ 19.1 ข้อ 8 |
| 7 | ระยะเวลาเก็บข้อมูลใน `app.job_retention` (24 เดือน / 10 ปี / 5 ปี / 1 ปี) | ตาราง CANONICAL ข้อ 10.3 | Q8 · **[รอยืนยัน DPO]** |
| 8 | `PostgREST max_rows = 200` | 200 | ข้อ 1.1 |
| 9 | ค่าตั้งใน `app.settings` 30 แถว (SLA · เกณฑ์ · อัตรา) | ตาราง CANONICAL ข้อ 11.2 | Q12 · ข้อ 11.2 |
| 10 | `crm.interest_level` (`HOT`/`WARM`/`COLD`) และ `ref.sources` · `ref.product_types` · `ref.interaction_types` · `crm.tags` | ตาราง CANONICAL ข้อ 5 | Q13 · ข้อ 4.8 |
| 11 | merge ลูกค้าที่ติด `legal_hold` ทำได้หรือไม่ | ปฏิเสธ | ข้อ 19.3 ข้อ 7 |

### 15.4 หมายเหตุผู้เขียนที่ฝังอยู่ในสคีมา

COMMENT ของวัตถุหลายตัวขึ้นต้นด้วย **"หมายเหตุผู้เขียน:"** = จุดที่ CANONICAL ไม่ได้กำหนดโครงสร้างไว้ และผู้เขียน migration ออกแบบเอง · อ่านรวมได้จาก `docs/03-data/data-dictionary.md` หรือ

```bash
node tools/db/run.mjs --sql "SELECT objsubid, description FROM pg_description WHERE description LIKE '%หมายเหตุผู้เขียน%'"
```

จุดที่สำคัญที่สุด

1. **`crm.customer_addresses`** — CANONICAL ไม่ระบุคอลัมน์ · ผู้เขียนแยกส่วนที่เปิดเผยได้ (`district` · `province_code`) ออกจากส่วนที่ปิดบัง (`address_line` · `subdistrict` · `postal_code`) ตามกติกาเดียวกับ `customer_contacts`
2. **`app.rate_limit_counters`** — CANONICAL ระบุแต่ชื่อตาราง ผู้เขียนออกแบบ PK `(staff_id, counter_key, window_start)` และใช้ `now()` เสมอ (เป็นการตัดสินสิทธิ์ จึงไม่ใช้ `app.clock()`)
3. **`audit.access_logs`** — CANONICAL ระบุเฉพาะ action และ "เก็บ contact_id/hash" ผู้เขียนออกแบบคอลัมน์อื่นให้สอดคล้องกับ `audit_logs`
4. **`analytics.data_quality_issues`** — ผู้เขียนตัด `VISIT_UNRECORDED` ที่ `unrecorded_ack_at IS NOT NULL` ออก เพื่อให้ `api.acknowledge_unrecorded_visit` (ข้อ 9.6) มีความหมาย
5. **`crm.customer_contacts`** — ผู้เขียนให้ `value_normalized` และ `value_masked` เป็น **generated column** จาก `app.normalize_contact` / `app.mask_contact` จึงผิดเพี้ยนจากกันไม่ได้ และค่าที่ normalize แล้วว่างถูกปฏิเสธด้วย `NOT NULL`
