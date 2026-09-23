# CANONICAL — ข้อเท็จจริงกลางของโครงการ JAUN CRM · Customer 360

> **ฉบับ v2.3 · 23 ก.ย. 2569** — ปรับจาก v1 ตามผลตรวจแบบ adversarial 5 มุม (148 ข้อ) · ตรวจความสอดคล้องภายใน v2 (22 ข้อ) · ข้อตัดสินจากผู้สร้างรอบแรก (ข้อ 19) · และ **Direction จากเจ้าของโครงการ 22 ก.ย. 2569 (ข้อ 20)**
>
> **กฎ:** ทุกเอกสาร ทุกไฟล์ SQL และทุกหน้าของ prototype ต้องใช้ค่าจากไฟล์นี้เท่านั้น
> ห้ามคิดตัวเลข ชื่อ รหัส หรือสูตรขึ้นเอง ถ้าต้องการค่าที่ไม่มีในนี้ ให้เขียนว่า **"รอยืนยัน"** อย่าเดา
> **ข้อยกเว้นเดียว:** ข้อมูลเติม (filler) ใน seed ตามกติกาข้อ 13.0 — สร้างแบบ deterministic และต้องไม่ทำให้ตัวเลขที่พิมพ์ในไฟล์นี้เปลี่ยน
> ค่าที่มีป้าย **[รอยืนยัน]** คือค่าเริ่มต้นที่ทีมออกแบบเสนอ ใช้ได้ทันทีแต่ต้องให้เจ้าของโครงการยืนยันก่อน production
> ต้นฉบับบรีฟอยู่ที่ `docs/00-brief/REQUIREMENT.md` (อ้างเป็น A1–A45 และ B1–B27) · mockup A/B อยู่ในโฟลเดอร์ `UX:UI/`
> ที่ใดที่บรีฟ mockup และไฟล์นี้ไม่ตรงกัน **ไฟล์นี้ชนะ** และมีเหตุผลในข้อ 16
> **ลำดับความสำคัญ:** ข้อ 20 (Direction จากเจ้าของโครงการ) > ข้ออื่นในไฟล์นี้ > บรีฟ/mockup — ที่ใดที่ข้อ 20 ขัดกับข้ออื่น ให้ยึดข้อ 20

ระบบ: **JAUN CRM · Customer 360**
องค์กร: **JAUN** — ธุรกิจ JAUNPHONE (ค้าปลีก iPhone/อุปกรณ์ · รับซื้อ · เทิร์น · ซ่อม) และ JAUN POWER MONEY (ผ่อนชำระ)
ขอบเขตเอกสาร: **Phase 0** (Requirement · Data · Permission · UX · Prototype)

---

## 1. เป้าหมายเทคนิค (ตรึง)

| หัวข้อ | ค่า |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Responsive Web + PWA |
| Auth | Supabase Auth (ไม่เปิด public sign-up · invite-only) |
| Database | Supabase PostgreSQL **17** · ใช้เฉพาะไวยากรณ์ที่มีใน PG 17 (ห้ามของ PG 18) |
| Security | RLS ทุกตาราง · ตรวจสิทธิ์ในฐานข้อมูลเสมอ (ข้อ 9) |
| Storage | Supabase Storage bucket private **ใช้เฉพาะไฟล์ export** (V1 ไม่มีการอัปโหลดไฟล์ของลูกค้า) · signed URL อายุ 60 วินาที |
| Application | Next.js Server Actions / Route Handlers ใช้ JWT ของผู้ใช้ · service_role ใช้ได้เฉพาะ Edge Functions ที่ระบุในข้อ 9.8 |
| Extensions | `pg_trgm` ติดตั้ง `WITH SCHEMA extensions` (ทั้ง Supabase และ PGlite) · `pg_cron` + `pg_net` เฉพาะ Supabase สำหรับงานตามเวลา **[รอยืนยัน — หรือใช้ scheduler ภายนอกเรียก Edge Function]** · ไม่ใช้ `citext` `pgcrypto` (`gen_random_uuid()` `sha256()` เป็นแกนของ PG) |
| ในฟังก์ชัน `search_path = ''` | อ้างชื่อเต็มเสมอ: `extensions.similarity()` · `OPERATOR(extensions.%)` · `extensions.gin_trgm_ops` |
| ทดสอบ | PGlite **0.4.1** (= PostgreSQL 17.5 · WASM) ผ่าน `tools/db/run.mjs` · session TimeZone = `UTC` เหมือน Supabase |

### 1.1 Schema ในฐานข้อมูล

| schema | เก็บอะไร | เปิดผ่าน Data API | GRANT ให้ `authenticated` |
|---|---|:--:|---|
| `api` | RPC ที่หน้าจอเรียก (ข้อ 9.6) | ✓ | EXECUTE รายฟังก์ชัน |
| `crm` | ลูกค้า · กิจกรรม · lead · opportunity · quotation · task · transaction ref · notification | ✓ | SELECT/INSERT/UPDATE ตามตาราง + column grant (ข้อ 9.4) |
| `core` | องค์กร · สาขา · ทีม · พนักงาน · บทบาท · สิทธิ์ · อุปกรณ์ | ✓ | SELECT ตาม RLS |
| `ref` | Master Data (lookup) | ✓ | SELECT ตาม RLS |
| `app` | helper ตรวจสิทธิ์ · trigger · งานตามเวลา · settings · running numbers | ✗ | EXECUTE เฉพาะ helper ข้อ 9.3 (policy ต้องเรียกได้) |
| `analytics` | view ภายในสำหรับคำนวณ KPI (ใช้ใน RPC เท่านั้น) | ✗ | ไม่มี |
| `audit` | audit_logs · access_logs · login_events · export_requests · integration_logs | ✗ | ไม่มี |
| `restricted` | เอกสารสำคัญ (ปิดใช้งานใน V1) | ✗ | ไม่มี |

- migration ต้อง `GRANT USAGE ON SCHEMA api, crm, core, ref TO authenticated, service_role` และ `GRANT USAGE ON SCHEMA app TO authenticated` แยกชัด · `ALTER DEFAULT PRIVILEGES IN SCHEMA api, app, audit, analytics REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
- role `anon` ไม่มี GRANT ใด ๆ ใน schema ของระบบ
- supabase-js เรียกด้วย `.schema('crm')` / `.schema('api')` · ตั้ง Data API exposed schemas = `api, crm, core, ref` · PostgREST `max_rows = 200` **[รอยืนยัน]**
- ENUM อยู่ใน schema ของตารางที่ใช้ และอ้างชื่อเต็มเสมอ (ข้อ 4)
- ทุก schema ตาราง และฟังก์ชันมี owner = `postgres` (Supabase: BYPASSRLS · PGlite: superuser) ห้ามสร้าง owner role อื่น

### 1.2 เวลา (ตรึง)

| หัวข้อ | ค่า |
|---|---|
| การเก็บ | `timestamptz` ทั้งหมด |
| ขอบวันธุรกิจ | เที่ยงคืน **Asia/Bangkok** · คำนวณด้วย `(ts AT TIME ZONE 'Asia/Bangkok')::date` เสมอ **ห้ามพึ่ง session TimeZone** |
| นาฬิกาอ้างอิงของรายงาน | `app.clock()` = `coalesce(app.settings['clock'].as_of, now())` ถ้า `app.settings['env'] <> 'prod'` มิฉะนั้น `now()` — ใช้กับ KPI · คุณภาพข้อมูล · การแจ้งเตือน · การจัดกลุ่ม "วันนี้" · ป้าย "ลูกค้าใหม่" · งานตามเวลา |
| นาฬิกาของการตัดสินสิทธิ์ | `now()` เสมอ (เช่น แก้ interaction ภายใน 24 ชม. · `valid_from/valid_to` · อายุคำเชิญ) ห้ามใช้ `app.clock()` |
| ช่วง "N วันล่าสุด" | `[วันนี้ − (N−1) วัน 00:00, พรุ่งนี้ 00:00)` · ขอบบนใช้ `<` เสมอ |
| "วันนี้" | `[00:00, พรุ่งนี้ 00:00)` Asia/Bangkok |
| การแสดงวันที่ | พ.ศ. แบบย่อ `11 ก.ย. 2569` · เวลา 24 ชม. `10:24 น.` |
| seed และ test | ตั้ง `app.settings['clock'] = {"as_of":"2026-09-11T10:24:00+07:00"}` · เวลาใน seed เป็นค่าคงที่แบบมี `+07` |

### 1.3 ตัวเลขและการปัด (ตรึง)

| หัวข้อ | กติกา |
|---|---|
| จำนวน | คั่นหลักพัน `3,125` |
| เงิน | การ์ด/ข้อความ `฿3,332,700` · ช่องตาราง `1,245,000` ใต้หัวคอลัมน์ "(บาท)" · เก็บ `numeric(12,2)` · แสดงสตางค์ 2 ตำแหน่งเฉพาะเมื่อไม่ใช่จำนวนเต็ม (`฿28,900.50`) |
| อัตรา/สัดส่วน | 1 ตำแหน่งทศนิยมเสมอ `24.1%` `36.0%` (รวมขั้นแรกของ funnel `100.0%`) |
| ส่วนต่างของอัตรา | **pp** 1 ตำแหน่ง `+2.1 pp` · คำนวณจากอัตราที่ยังไม่ปัดแล้วค่อยปัด |
| ส่วนต่างของจำนวน | % จำนวนเต็ม `+12%` · ค่าลบใช้เครื่องหมายลบ `−5%` `−0.4 pp` |
| วิธีปัด | half away from zero = `round(x::numeric, n)` ของ PostgreSQL · JS ห้ามใช้ `Math.round` บน float (ใช้ helper ปัดด้วยจำนวนเต็ม) |
| เทียบเป้าหมาย | ใช้ค่าที่ยังไม่ปัด (94.96% แสดง 95.0% แต่ **ไม่ผ่าน** เป้า ≥ 95%) |
| ช่วงก่อนหน้าเป็น 0 หรือไม่มีค่า | แสดง `–` และไม่แสดงป้ายเปลี่ยนแปลง |

### 1.4 ผู้ประมวลผลข้อมูลภายนอก **[รอยืนยัน — DPO ประเมินตาม PDPA ม.28–29]**

Supabase `ap-southeast-1` (Singapore) · ผู้ให้บริการ hosting ของ Next.js (ผู้ให้บริการ/region) · ผู้ส่งอีเมล (คำเชิญ/รีเซ็ตรหัส/แจ้งอนุมัติ) · Web Push (FCM/APNs) · storage ของ logical dump
**push และอีเมลห้ามมีชื่อ เบอร์ หรือข้อมูลลูกค้า** — ใช้เฉพาะป้ายการแจ้งเตือน + เลขอ้างอิง + deep link ที่ต้องเข้าสู่ระบบ

---

## 2. โครงสร้างองค์กรตัวอย่าง (seed และ prototype)

| code | ชนิด | ชื่อที่แสดง | หมายเหตุ |
|---|---|---|---|
| `JAUN` | organization | JAUN | องค์กรเดียวใน V1 · ตารางธุรกิจทุกตารางมี `organization_id` (ตาราง `ref.*` เป็นค่ากลาง ไม่มี) |
| `JAUNPHONE` | business_unit | JAUN PHONE | |
| `JPM` | business_unit | JAUN POWER MONEY | V1 เชื่อมผ่าน transaction ref เท่านั้น · **[รอยืนยัน Q17 นิติบุคคลเดียวกันหรือไม่]** |
| `JP1` · `JP2` · `JP3` · `JP4` | branch (`store`) | JAUNPHONE 1 · 2 · 3 · 4 | ใต้ JAUNPHONE · mockup เขียน "สาขา 1–4" |
| `JPON` | branch (`online_team`) | ทีมออนไลน์ส่วนกลาง | ใต้ JAUNPHONE **[รอยืนยัน Q3]** · มีเพื่อให้รายการออนไลน์ที่ยังไม่มอบสาขามี `branch_id` เสมอ |

- `branch_type`: `store` · `online_team`
- ทีม `core.teams(code, name_th, branch_id NOT NULL)`: `JP1-SALES` ทีมขาย JAUNPHONE 1 · `JP2-SALES` ทีมขาย JAUNPHONE 2 · `JP3-SALES` ทีมขาย JAUNPHONE 3 · `JP4-SALES` ทีมขาย JAUNPHONE 4 · `JPON-ADMIN` ทีมแอดมินออนไลน์
- สมาชิกทีม: แหล่งเดียวคือ `core.team_members(team_id, staff_id, is_leader, valid_from, valid_to)` (ข้อ 7.1)

---

## 3. นิยามลูกค้าและหน่วยนับ (หัวใจของระบบ · A2 · B2)

### 3.1 คำศัพท์ที่ตรึง

| คำ (ไทย / อังกฤษ) | นิยามที่นับได้จากฐานข้อมูล | ตาราง |
|---|---|---|
| **การมาติดต่อ / Visit** | หนึ่งครั้งที่บุคคลหรือกลุ่มหนึ่งติดต่อธุรกิจ บนช่องทางใดก็ได้ ไม่จำเป็นต้องรู้ตัวตน (กติกาการเกิด visit ข้อ 3.3) | `crm.visits` |
| **Walk-in Visit** | Visit ที่ `channel_code = 'WALK_IN'` | `crm.visits` |
| **Visitor / Traffic** | จำนวน Visit ที่ `started_at` อยู่ในช่วง และ `status <> 'CANCELLED'` (นับครั้ง ไม่ใช่นับคน · `party_size` ใช้แสดงเท่านั้น) | |
| **Identified Visit** | Visit ที่ `customer_id IS NOT NULL` | |
| **ลูกค้า (Customer record)** | บุคคลที่ระบบรู้ตัวตน · สร้างได้ทางเดียวคือ `api.quick_capture` (ข้อ 6.2) | `crm.customers` |
| **กิจกรรมของลูกค้า (activity event)** | `visits.started_at` (ไม่นับ CANCELLED) · `interactions.occurred_at` (ไม่นับ interaction ที่ผูก visit `CANCELLED`) · `leads.created_at` · `opportunities.created_at` · `opportunities.closed_at` · `transaction_refs.transacted_at` — รวมไว้ใน view ภายใน `analytics.customer_activity(customer_id, branch_id, occurred_at, kind)` | |
| **Unique Customer** | จำนวน `customer_id` ไม่ซ้ำใน `analytics.customer_activity` ที่ `occurred_at` อยู่ในช่วง | |
| **ลูกค้าใหม่ / New Customer** | Unique Customer ที่ `first_seen_at` อยู่ในช่วง | |
| **ลูกค้าเก่า / Returning Customer** | Unique Customer ที่ `first_seen_at < p_start` | |
| **Lead** | การแสดงความสนใจหนึ่งครั้งของลูกค้าที่รู้ตัวตน (`customer_id NOT NULL`) นับตาม `created_at` | `crm.leads` |
| **Opportunity** | โอกาสซื้อจริง นับตาม `created_at` | `crm.opportunities` |
| **Sale / ปิดการขาย** | Opportunity `stage = 'WON'` นับตาม `won_at` | |
| **Lost / ไม่สำเร็จ** | Lead หรือ Opportunity ที่ปิดเป็น `LOST` พร้อม `lost_reason_code` นับตาม `closed_at` | |
| **เหตุการณ์การซื้อ (purchase event)** | opportunity `WON` (ที่ `won_at`) **รวมกับ** `transaction_refs` ที่ `ref.transaction_types.counts_as_purchase = true` และ (`opportunity_id IS NULL` หรือ opportunity นั้นไม่ใช่ WON) — ref ที่ผูก opportunity WON นับรวมเป็นครั้งเดียวกับ opportunity | |
| **ผู้ซื้อ / Buying Customer** | ลูกค้าไม่ซ้ำที่มีเหตุการณ์การซื้อในช่วง | |
| **ลูกค้าซื้อซ้ำ / Repeat Buyer** | ผู้ซื้อในช่วงที่มีเหตุการณ์การซื้อ **≥ 2 ครั้ง** ที่เวลา `< p_end` (ครั้งก่อนหน้าอยู่ในช่วงเดียวกันได้) | |

> **Funnel เป็นแบบ "ตามช่วงเวลา" (period-based) ไม่ใช่ cohort**
> แต่ละขั้นนับจากวันที่เหตุการณ์ของขั้นนั้นเกิดในช่วงเวลา Sale ในช่วงนี้อาจมาจาก Lead ของช่วงก่อน
> อัตราระหว่างขั้นจึงเป็น "อัตรากิจกรรม" · หน้าจอที่แสดง funnel ต้องมีคำอธิบายนี้ใน tooltip · รายงาน cohort เป็นงาน Phase 3

### 3.2 `first_seen_at`

- `crm.customers.first_seen_at timestamptz NOT NULL` = เวลาของ **กิจกรรมแรกที่รู้** (ไม่ใช่เวลาสร้างแถว)
- ตอนสร้าง = `least(created_at, เวลากิจกรรมที่แนบมา)` · trigger บน visits/interactions/leads/opportunities/transaction_refs (INSERT หรือเปลี่ยน `customer_id`) ตั้ง `first_seen_at = least(first_seen_at, เวลาเหตุการณ์)`
- ข้อมูลนำเข้า (legacy) ใช้วันที่รู้จักครั้งแรกจากระบบเดิม
- invariant (มี test): ไม่มีกิจกรรมใดที่ `occurred_at < customers.first_seen_at` → จึงรับประกัน `NEW + RETURNING = UNIQUE` ในทุกช่วง
- `first_channel_code` · `first_source_code` · `first_branch_id` = ของกิจกรรมแรกนั้น

### 3.3 Visit กับ Interaction (กติกาเดียวทั้งระบบ)

1. **ทุก visit ที่ไม่ใช่ CANCELLED มี interaction ต้นทาง 1 รายการเสมอ** (`interactions.visit_id = visits.id` · `is_visit_root = true`) ประเภทของ interaction ต้นทางเลือกตามเนื้อหา (`VISIT` · `INQUIRY` · `PURCHASE` …) · outcome `PURCHASED` → ประเภท `PURCHASE`
2. **Walk-in:** visit เกิดเมื่อพนักงานกด "รับเข้าคิว" หรือ "เริ่มให้บริการ" (ข้อ 4.1) แม้ยังไม่รู้ตัวตน · **visit สร้างได้ผ่าน `api.open_visit` หรือ `api.quick_capture` เท่านั้น** และปิดผ่าน `api.close_visit`
3. **ออนไลน์/โทร (V1 บันทึกด้วยมือ):** การติดต่อ `INBOUND` บนช่องทางอื่นที่ไม่ใช่ WALK_IN → ถ้าลูกค้า (หรือผู้ติดต่อนิรนามคนเดิม) มี visit ช่องทางเดียวกันที่ยังไม่ปิดในวันธุรกิจเดียวกัน ให้แนบ interaction เข้า visit นั้น **มิฉะนั้นเปิด visit ใหม่** สถานะ `IN_SERVICE` · Phase 4 ทำอัตโนมัติจาก `crm.online_conversations` **[รอยืนยัน Q19 · Q20]**
4. interaction `OUTBOUND` และ `INTERNAL` **ไม่สร้าง visit**
5. ตัวนับบน Customer 360: **ติดต่อ N ครั้ง** = `count(interactions WHERE direction <> 'INTERNAL')` ไม่นับ interaction ของ visit `CANCELLED` · **เข้าร้าน N ครั้ง** = `count(visits WHERE channel_code='WALK_IN' AND status <> 'CANCELLED')` · **ซื้อ N ครั้ง** = จำนวนเหตุการณ์การซื้อ (ข้อ 3.1) · **ยอดซื้อสะสม** = Σ `won_amount` + Σ `transaction_refs.amount` ของ ref ที่นับเป็นการซื้อและไม่ได้ผูก opportunity WON · **เป็นลูกค้ามา N เดือน** = จำนวนเดือนเต็มนับตาม **วันที่** (Asia/Bangkok) จาก `first_seen_at` ถึง `app.clock()` (11 ม.ค. → 11 ก.ย. = 8)

### 3.4 สถานะวงจรชีวิตลูกค้า `lifecycle_stage` (คำนวณจากข้อเท็จจริง · ห้ามแก้ด้วยมือ)

เก็บเป็นคอลัมน์แคช `crm.customers.lifecycle_stage` ปรับโดย `app.refresh_customer_lifecycle(customer_id)` (ข้อ 9.6)

| ลำดับตรวจ | code | ป้ายไทย | เงื่อนไข |
|---|---|---|---|
| 1 | `REPEAT` | ลูกค้าซื้อซ้ำ | เหตุการณ์การซื้อตลอดอายุ ≥ 2 |
| 2 | `CUSTOMER` | ลูกค้าปัจจุบัน | เหตุการณ์การซื้อ = 1 |
| 3 | `OPPORTUNITY` | มีโอกาสซื้อ | ยังไม่เคยซื้อ · มี opportunity ที่ยังไม่ปิด |
| 4 | `LEAD` | สนใจซื้อ | ยังไม่เคยซื้อ · มี lead ที่ยังไม่ปิด |
| 5 | `LOST` | ไม่สำเร็จ | ยังไม่เคยซื้อ · ไม่มีรายการเปิด · มี lead หรือ opportunity ที่ LOST อย่างน้อย 1 |
| 6 | `IDENTIFIED` | รู้จักแล้ว | นอกเหนือจากข้างบน |

การ refresh:
- ล็อกแถวลูกค้าก่อนคำนวณ: `PERFORM 1 FROM crm.customers WHERE id = p_customer_id FOR UPDATE` แล้ว `UPDATE … WHERE lifecycle_stage IS DISTINCT FROM v_stage`
- เรียกจาก AFTER ROW trigger แยกตาม event (ห้าม transition table หลาย event) · ข้ามเมื่อ `current_setting('app.bulk', true) = 'on'` — merge/seed/import ตั้งค่านี้แล้ว refresh ครั้งเดียวต่อลูกค้าท้ายงาน

### 3.5 ป้ายเสริม (แสดงต่อจากป้าย lifecycle)

แสดง **ทุกป้ายที่เข้าเงื่อนไข** ตามลำดับนี้ สูงสุด 3 ป้าย เกินแสดง `+N`

| ลำดับ | ป้าย | เงื่อนไข | สี (ข้อ 15) |
|---|---|---|---|
| 1 | VIP | มี tag `VIP` | navy |
| 2 | ติดตามอยู่ | มี task `task_type_code = 'FOLLOW_UP'` สถานะ `OPEN`/`IN_PROGRESS` | warning |
| 3 | ลูกค้าใหม่ | `first_seen_at` อยู่ใน "30 วันล่าสุด" (ข้อ 1.2 · ค่า `badge.new_customer_days`) | info |
| 4 | ยังไม่ได้ติดต่อ | มี lead เปิดอยู่สถานะ `NEW` | danger |

คำนำหน้า "คุณ" เติมที่ UI เท่านั้น ไม่เก็บในคอลัมน์ชื่อ (ข้อความสำเร็จรูป เช่น `notifications.body` มี "คุณ" ได้) · ไม่มีรูปถ่ายลูกค้าใน V1 (แสดง avatar ตัวอักษรย่อ)

---

## 4. สถานะและการเปลี่ยนสถานะ

ENUM ใช้กับชุดค่าที่ระบบใช้ตัดสินใจ อยู่ใน schema ของตาราง อ้างชื่อเต็มเสมอ · เพิ่มค่า = migration ไฟล์เดี่ยวที่มีแค่ `ALTER TYPE … ADD VALUE` · ป้ายไทยของ ENUM อยู่ใน data dictionary และ `prototype/assets/data.js` (ไม่เก็บในฐานข้อมูล)

### 4.1 Visit — `crm.visit_status`

| code | ป้ายไทย | ความหมาย |
|---|---|---|
| `WAITING` | รอรับบริการ | walk-in อยู่ในคิว ยังไม่มีผู้รับ (`owner_staff_id IS NULL`) |
| `IN_SERVICE` | กำลังให้บริการ | มีผู้รับแล้ว · visit ออนไลน์/โทรเริ่มที่สถานะนี้ |
| `COMPLETED` | เสร็จสิ้น | ปิดพร้อม `outcome_code` (บังคับ) |
| `LEFT` | ออกก่อนรับบริการ | outcome = `LEFT_BEFORE_SERVICE` อัตโนมัติ |
| `CANCELLED` | ยกเลิก (สร้างผิด) | **ไม่นับในทุก KPI** · บังคับ `cancel_reason` |

การเปลี่ยนสถานะที่อนุญาต (บังคับใน trigger `app.enforce_row_transition`):
- `WAITING → IN_SERVICE` ตั้ง `owner_staff_id` = ผู้กด และ `service_started_at` · **รับคิว:** ผู้มี `visit.update` ในสาขาของ visit (ทุก scope) ทำได้เมื่อ `status='WAITING' AND owner_staff_id IS NULL` โดยเปลี่ยนได้เฉพาะสองคอลัมน์นี้
- `WAITING → LEFT` · `IN_SERVICE → COMPLETED` (outcome บังคับ) · `WAITING/IN_SERVICE → CANCELLED` (เจ้าของทำได้ภายใน 15 นาทีหลังสร้าง **[รอยืนยัน]** หลังจากนั้นต้องมี scope T/B)
- แก้ `outcome_code` ได้ภายในวันธุรกิจเดียวกัน · `branch_id` ของ visit **เปลี่ยนไม่ได้**
- ปุ่มหน้ารับลูกค้า: **"รับเข้าคิว"** → `WAITING` · **"เริ่มให้บริการ"** → `IN_SERVICE` โดยผู้กดเป็นผู้รับ
- `queue_no` มีเฉพาะ WALK_IN ตัวนับ `QUEUE:{branch}:{YYYYMMDD}` แสดง "คิว 001" · `visit_no` ใช้ตัวนับ `VISIT:{branch}:{YYYYMMDD}` ทุกช่องทาง (สองเลขไม่จำเป็นต้องเท่ากัน)
- งาน `app.job_close_stale_visits(p_as_of)` รัน 00:05 Asia/Bangkok: visit ที่ยังไม่ปิดของวันธุรกิจก่อนหน้า → `COMPLETED` + outcome `UNRECORDED` · `ended_at` = 23:59:59 ของวันนั้น · `closed_by_system = true` · แจ้ง `VISIT_OUTCOME_MISSING`

### 4.2 Visit Outcome — `ref.visit_outcomes` (`is_system = true` ทั้งหมด)

| code | ป้ายไทย | ผลต่อรายการอื่น | นับเป็นบันทึกผลครบ |
|---|---|---|---|
| `PURCHASED` | ซื้อแล้ว | ต้องมี `customer_id` · UI เสนอให้ปิด opportunity เป็น WON (ไม่บังคับใน V1) | ✓ |
| `FOLLOW_UP` | นัดติดตาม | ต้องมี `customer_id` และ lead/opportunity เปิดอยู่ที่มี next action | ✓ |
| `NOT_YET` | ยังไม่ซื้อ | ถ้ามี lead/opportunity เปิดอยู่ต้องมี next action | ✓ |
| `NOT_INTERESTED` | ไม่สนใจ | lead ที่เปิดจาก visit นี้ต้องปิดเป็น LOST พร้อมเหตุผล | ✓ |
| `SERVICE_DONE` | ให้บริการเสร็จ (ซ่อม/สอบถาม/ชำระ) | – | ✓ |
| `LEFT_BEFORE_SERVICE` | ออกก่อนรับบริการ | – | ✓ |
| `UNRECORDED` | ไม่ได้บันทึกผล (ระบบปิดให้) | – | **✗** |

สี่ค่าแรกจาก B6 · สามค่าหลังเป็นข้อเสนอเพิ่ม **[รอยืนยัน]**

### 4.3 Lead — `crm.lead_status`

| code | ป้ายไทย | ความหมาย |
|---|---|---|
| `NEW` | ใหม่ | ยังไม่มีการตอบกลับ |
| `CONTACTED` | ติดต่อแล้ว | มีการตอบกลับครั้งแรกแล้ว (`first_contacted_at`) |
| `QUALIFIED` | คัดกรองแล้ว | ยืนยันความต้องการ งบ และช่วงเวลาซื้อ |
| `CONVERTED` | แปลงเป็นโอกาสขาย | บังคับ `converted_opportunity_id` + `closed_at` |
| `LOST` | ไม่สำเร็จ | บังคับ `lost_reason_code` + `closed_at` |

- lead ที่สร้างระหว่าง visit ช่องทาง **WALK_IN หรือ PHONE** (คุยกับลูกค้าสด) เริ่มที่ `CONTACTED` และ `first_contacted_at = created_at`
- lead จากช่องทางข้อความ (LINE · FACEBOOK · INSTAGRAM · TIKTOK · WEBSITE) เริ่มที่ `NEW` · `NEW → CONTACTED` อัตโนมัติเมื่อมี interaction `OUTBOUND` แรกที่ `lead_id` = lead หรือ `customer_id` เดียวกันและ `occurred_at ≥ created_at`
- สถานะเริ่มต้นของ lead ทุกรายการ (มีหรือไม่มี visit) ตัดสินจาก `ref.channels.is_live` ของ `leads.channel_code`
- เปลี่ยน `NEW → CONTACTED` หรือ `NEW → QUALIFIED` ด้วยมือได้ (เช่น โทรจากเครื่องอื่นแล้วมาบันทึก) → `first_contacted_at = greatest(now(), created_at)` · `QUALIFIED → CONTACTED` ย้อนได้ · สถานะเปิดใดก็ได้ → `CONVERTED` (สร้าง opportunity `INTERESTED`) หรือ `LOST`
- **การแปลง lead ทำผ่าน `api.convert_lead` เท่านั้น** (สร้าง opportunity แล้วตั้ง `converted_opportunity_id` ในทรานแซกชันเดียว)
- ออกจาก `CONVERTED`/`LOST` ต้องมี `lead.reopen` → กลับเป็น `CONTACTED` และล้าง `closed_at` `lost_reason_code` `converted_opportunity_id`
- ค่าเริ่มต้นเมื่อสร้างจาก Quick Capture: `priority_code='NORMAL'` · `next_action='ติดต่อกลับลูกค้า'` · `next_action_type_code='CALL'` · `next_action_at = created_at + 30 นาที` **[รอยืนยัน]** · `owner_staff_id` = ผู้บันทึก

### 4.4 Opportunity — `crm.opportunity_stage`

| code | ป้ายไทย (คอลัมน์ Pipeline) | ความหมาย |
|---|---|---|
| `INTERESTED` | สนใจ | มีโอกาสซื้อจริง ยังไม่เสนอราคา |
| `QUOTATION` | เสนอราคา | มี quotation ที่ `SENT` แล้วอย่างน้อย 1 ใบ (ไม่ว่าจะหมดอายุหรือไม่) |
| `FOLLOW_UP` | รอตัดสินใจ | เสนอแล้ว รอลูกค้าตัดสินใจ |
| `WON` | ปิดการขาย | บังคับ `won_amount > 0` · `won_at` · `closed_at = won_at` |
| `LOST` | ไม่สำเร็จ | บังคับ `lost_reason_code` · `closed_at` |

- `INTERESTED → QUOTATION` อัตโนมัติเมื่อ quotation ของ opportunity เปลี่ยนเป็น `SENT` · `QUOTATION → FOLLOW_UP` ด้วยมือ · `FOLLOW_UP → QUOTATION` อัตโนมัติเมื่อมีใบใหม่ `SENT` · สถานะเปิดใดก็ได้ → `WON`/`LOST`
- **การเลื่อนขั้นด้วยมือที่อนุญาต (รวมการลากการ์ด):** `QUOTATION → FOLLOW_UP` เท่านั้น · `INTERESTED → QUOTATION/FOLLOW_UP` ด้วยมือได้เฉพาะเมื่อมี quotation `sent_at IS NOT NULL` แล้ว · **ห้ามย้อนกลับเป็น `INTERESTED`** (D48)
- ออกจาก `WON`/`LOST` ต้องมี `opportunity.reopen` → กลับเป็น `FOLLOW_UP` และล้าง `won_at` `won_amount` `closed_at` `lost_reason_code`
- `origin_channel_code NOT NULL` ตั้งครั้งเดียวไม่เปลี่ยน = `channel_code` ของ lead ต้นทาง หรือช่องทางของ visit/interaction ที่สร้าง opportunity ตรง
- **next action เป็นแหล่งจริงของงานติดตาม:** ทุก lead/opportunity ที่เปิดอยู่มี task ที่ `is_next_action = true` หนึ่งใบ (unique partial index) ซึ่ง trigger สร้าง/อัปเดตให้ตรงกับ `next_action` `next_action_type_code` `next_action_at` `owner_staff_id` · ปิดรายการ → task นั้น `CANCELLED` ถ้ายังไม่ DONE · ปิด task แล้วรายการยังเปิด → UI บังคับตั้ง next action ใหม่

CHECK ของ `crm.opportunities` (ตรึง):

```sql
CHECK (CASE stage
  WHEN 'WON'  THEN won_amount > 0 AND won_at IS NOT NULL AND closed_at = won_at AND lost_reason_code IS NULL
  WHEN 'LOST' THEN lost_reason_code IS NOT NULL AND closed_at IS NOT NULL AND won_at IS NULL AND won_amount IS NULL
  ELSE owner_staff_id IS NOT NULL AND next_action IS NOT NULL AND next_action_at IS NOT NULL
       AND next_action_type_code IS NOT NULL AND priority_code IS NOT NULL
       AND won_at IS NULL AND won_amount IS NULL AND closed_at IS NULL AND lost_reason_code IS NULL
END)
```

`crm.leads` ใช้รูปเดียวกัน: `CONVERTED` (บังคับ `converted_opportunity_id` `closed_at`) · `LOST` (บังคับ `lost_reason_code` `closed_at`) · สถานะเปิด (บังคับ `next_action` `next_action_type_code` `next_action_at` `priority_code` · **`owner_staff_id` ว่างได้** → `LEAD_UNASSIGNED`)

### 4.5 เส้นทางการขายแบบรวม (ตรงกับลำดับใน A7 · B8)

| # | สถานะในบรีฟ | เก็บที่ | code |
|---|---|---|---|
| 1 | New | lead | `NEW` |
| 2 | Contacted | lead | `CONTACTED` |
| 3 | Qualified | lead | `QUALIFIED` |
| 4 | Opportunity | opportunity | `INTERESTED` (lead → `CONVERTED`) |
| 5 | Quotation | opportunity | `QUOTATION` |
| 6 | Follow-up | opportunity | `FOLLOW_UP` |
| 7 | Won / Lost | opportunity (หรือ lead ที่ปิดก่อนเป็นโอกาสขาย) | `WON` / `LOST` |

ทุกการเปลี่ยนสถานะบันทึก `crm.lead_status_history` / `crm.opportunity_stage_history` (from · to · changed_by · changed_at · reason) โดย trigger

### 4.6 Quotation — `crm.quotation_status`

| code | ป้ายไทย | การเปลี่ยน |
|---|---|---|
| `DRAFT` | ร่าง | แก้ได้ทุกช่อง (`quotation.update`) |
| `SENT` | ส่งแล้ว | จาก DRAFT ด้วยปุ่ม "ส่ง" (บันทึก `sent_at` `sent_channel_code` + สร้าง interaction `QUOTATION_SENT`) · `valid_until = วันที่ส่ง + quotation.valid_days (7) วัน` **[รอยืนยัน]** · หลังส่งแก้ได้เฉพาะ `status` |
| `ACCEPTED` | ตอบรับ | จาก SENT ด้วยมือ · **ไม่** ปิด WON อัตโนมัติ |
| `REJECTED` | ปฏิเสธ | จาก SENT ด้วยมือ |
| `EXPIRED` | หมดอายุ | งาน `app.job_expire_quotations` 00:00 วันถัดจาก `valid_until` |

### 4.7 Task — `crm.task_status` · `ref.task_types` · `ref.priorities`

`crm.task_status`: `OPEN` เปิด · `IN_PROGRESS` กำลังทำ · `DONE` เสร็จ (บังคับ `completed_at`) · `CANCELLED` ยกเลิก (บังคับ `cancelled_at`)

| task_type | ป้ายไทย | | priority | ป้ายไทย | สี |
|---|---|---|---|---|---|
| `FOLLOW_UP` | ติดตามลูกค้า | | `LOW` | ต่ำ | neutral |
| `CALL` | โทรหาลูกค้า | | `NORMAL` | ปกติ | info |
| `APPOINTMENT` | นัดเข้าร้าน | | `HIGH` | สูง | warning |
| `SEND_QUOTATION` | ส่งใบเสนอราคา | | `URGENT` | ด่วน | danger |
| `DOCUMENT` | ตามเอกสาร | | | | |
| `OTHER` | อื่น ๆ | | | | |

- บรีฟแยก `tasks`/`followups` → รวมเป็น `crm.tasks` (D7) · follow-up = `task_type_code = 'FOLLOW_UP'`
- `remind_at` ค่าเริ่มต้น = `due_at − 15 นาที`

การนับบนหน้า "งานของวันนี้" แบ่งสองกลุ่มไม่ทับกัน · **ทั้งหมด = วันนี้ + เกินกำหนด**

| กลุ่ม | เงื่อนไข (วันตาม Asia/Bangkok · เทียบ `app.clock()`) |
|---|---|
| **วันนี้** | สถานะ `OPEN`/`IN_PROGRESS` และ `due_at` อยู่ในวันนี้ · ถ้าเลยเวลาแล้วแสดงป้าย "เลยเวลา" แต่ยังนับในกลุ่มนี้ |
| **เกินกำหนด** | สถานะ `OPEN`/`IN_PROGRESS` และ `due_at` ก่อน 00:00 ของวันนี้ |

### 4.8 ENUM อื่น (schema.name : ค่า)

| enum | ค่า |
|---|---|
| `core.staff_status` | `INVITED` เชิญแล้ว · `ACTIVE` ใช้งาน · `DISABLED` ปิดใช้งาน (ห้ามลบแถว) |
| `core.data_scope` | `OWN` · `TEAM` · `BRANCH` · `ORGANIZATION` · `SYSTEM` — **ประกาศตามลำดับนี้** และการเทียบ `>=` ต้องมี `scope <> 'SYSTEM'` |
| `crm.customer_record_status` | `ACTIVE` · `MERGED` (มี `merged_into_id`) · `ANONYMIZED` |
| `crm.interaction_direction` | `INBOUND` ลูกค้าติดต่อมา · `OUTBOUND` พนักงานติดต่อไป · `INTERNAL` บันทึกภายใน |
| `crm.contact_type` | `PHONE` · `LINE_ID` · `LINE_USER_ID` · `FACEBOOK` · `INSTAGRAM` · `TIKTOK` · `EMAIL` |
| `crm.consent_status` | `GRANTED` ยินยอม/แจ้งแล้ว · `WITHDRAWN` ถอนแล้ว |
| `crm.consent_capture_via` | `STAFF_FORM` พนักงานบันทึก · `LINK_SENT` ส่งลิงก์ประกาศ · `LINE_OA` ผ่าน LINE OA · `WEB` ผ่านเว็บไซต์ |
| `crm.customer_link_via` | `CREATED` · `VISIT` · `INTERACTION` · `LEAD` · `OPPORTUNITY` · `MANUAL_LINK` · `MERGE` (transaction ref ใช้ `MANUAL_LINK` ใน V1) |
| `crm.duplicate_status` | `PENDING` รอตัดสิน · `MERGED` รวมแล้ว · `NOT_DUPLICATE` ยืนยันคนละคน |
| `crm.dsr_type` | `ACCESS` ขอดู/ขอสำเนา · `CORRECTION` ขอแก้ไข · `DELETION` ขอลบ · `OBJECTION` คัดค้าน · `WITHDRAW_CONSENT` ถอนความยินยอม · `PORTABILITY` ขอโอนย้าย |
| `crm.dsr_status` | `RECEIVED` รับคำขอแล้ว · `VERIFIED` ยืนยันตัวตนแล้ว · `IN_PROGRESS` กำลังดำเนินการ · `COMPLETED` เสร็จสิ้น · `REJECTED` ปฏิเสธคำขอ |
| `crm.interest_level` | `HOT` สนใจมาก · `WARM` สนใจ · `COLD` สนใจน้อย **[รอยืนยัน]** |
| `audit.export_status` | `REQUESTED` รออนุมัติ · `APPROVED` อนุมัติแล้ว · `REJECTED` ไม่อนุมัติ · `GENERATED` พร้อมดาวน์โหลด · `DOWNLOADED` ดาวน์โหลดแล้ว · `EXPIRED` หมดอายุ |
| `core.role_grant_status` (text CHECK) | `REQUESTED` รออนุมัติ · `APPROVED` อนุมัติแล้ว · `REJECTED` ไม่อนุมัติ · ชนิดคำขอ `GRANT` มอบ · `REVOKE` ถอน |
| `crm.dsr_verification_method` (text CHECK) | `IN_PERSON_ID_SIGHTED` เห็นบัตรต่อหน้า · `OTP_TO_REGISTERED_CONTACT` รหัส OTP ไปช่องทางที่ลงทะเบียน · `OTHER` อื่น ๆ |
| `audit.actor_type` | `STAFF` · `SYSTEM` · `INTEGRATION` |

---

## 5. Master Data (schema `ref` · ห้ามพิมพ์อิสระ · A14 · B15)

ทุกตาราง lookup: `code text PK` · `label_th` · `label_en` · `sort_order` · `is_active` · `is_system` (ค่าที่โค้ดอ้างถึง ปิดใช้งานไม่ได้) · `created_at` · `updated_at` · ไม่มี `organization_id`
อ่าน: ผู้ใช้ที่เข้าสู่ระบบ เห็นแถว `is_active` (ผู้มี `master_data.manage` เห็นทั้งหมด) · เขียน: `master_data.manage` + aal2 · **ห้ามลบ** ใช้ `is_active = false`
"Service Type" ในบรีฟ = `ref.interest_types` (REPAIR/INQUIRY) + `ref.transaction_types` ไม่มีตารางแยก (D39)

### 5.1 ช่องทางติดต่อ — `ref.channels`

| code | ชื่อที่แสดง | กลุ่ม | ลักษณะการคุย | สี chart |
|---|---|---|---|---|
| `WALK_IN` | Walk-in (หน้าร้าน) | offline | สด | `--chart-1` |
| `LINE` | LINE | online | ข้อความ | `--chart-2` |
| `FACEBOOK` | Facebook | online | ข้อความ | `--chart-3` |
| `INSTAGRAM` | Instagram | online | ข้อความ | `--chart-4` |
| `TIKTOK` | TikTok | online | ข้อความ | `--chart-5` |
| `PHONE` | โทรศัพท์ | offline | สด | `--chart-6` |
| `WEBSITE` | เว็บไซต์ | online | ข้อความ | `--chart-7` |

คอลัมน์เพิ่ม `is_live boolean` (สด = WALK_IN, PHONE) ใช้ในกติกาข้อ 4.3

### 5.2 แหล่งที่รู้จักร้าน — `ref.sources` **[รอยืนยัน]**

`FACEBOOK_ADS` โฆษณา Facebook · `FACEBOOK_PAGE` เพจ Facebook · `TIKTOK` TikTok · `INSTAGRAM` Instagram · `LINE_OA` LINE OA · `GOOGLE_MAPS` Google Maps · `PASSING_BY` เดินผ่านหน้าร้าน · `REFERRAL` เพื่อน/คนรู้จักแนะนำ · `EXISTING_CUSTOMER` ลูกค้าเดิม · `EVENT` งานอีเวนต์/บูธ · `OTHER` อื่น ๆ

> **ช่องทาง ≠ แหล่งที่มา** · กราฟ "แหล่งที่มาลูกค้า" ใช้ `customers.first_channel_code` ตาม mockup

### 5.3 วัตถุประสงค์/ความสนใจ — `ref.interest_types` (B6)

| code | ป้ายไทย | ถือเป็นโอกาสขาย (สร้าง lead อัตโนมัติ) |
|---|---|:--:|
| `BUY` | ซื้อเครื่อง | ✓ |
| `SELL` | ขายเครื่อง (รับซื้อ) | ✓ |
| `TRADE_IN` | เทิร์นเครื่อง | ✓ |
| `INSTALLMENT` | ผ่อน | ✓ |
| `ACCESSORY` | อุปกรณ์เสริม | ✓ |
| `REPAIR` | ซ่อม | – |
| `INQUIRY` | สอบถาม/โปรโมชั่น | – |

คอลัมน์เพิ่ม `creates_lead boolean` · หน้ารับลูกค้าแสดงชิปครบ 7 ค่าตาม `sort_order`

### 5.4 ประเภทสินค้า — `ref.product_types` **[รอยืนยัน]**

`IPHONE` iPhone · `IPAD` iPad · `MAC` Mac · `APPLE_WATCH` Apple Watch · `AIRPODS` AirPods · `ANDROID` สมาร์ตโฟนอื่น · `ACCESSORY` อุปกรณ์เสริม · `OTHER` อื่น ๆ
รุ่นเก็บเป็นข้อความ `product_model` (เช่น "iPhone 17 Pro") ใน V1 · catalog จาก POS ใน Phase 4

### 5.5 เหตุผลที่ไม่สำเร็จ — `ref.lost_reasons` (รวม A8 · B8 · mockup B)

| sort | code | ป้ายไทย | ที่มา |
|---:|---|---|---|
| 1 | `PRICE` | ราคาสูงไป | A8 Price · mockup B |
| 2 | `COMPARING` | รอเปรียบเทียบ | mockup B **[รอยืนยัน Q10]** |
| 3 | `NOT_READY` | ลูกค้ายังไม่พร้อม | A8 Timing · mockup B |
| 4 | `DOCUMENTS` | ติดเรื่องเอกสาร | mockup B |
| 5 | `CHANGED_MIND` | เปลี่ยนรุ่น/เปลี่ยนใจ | mockup B |
| 6 | `OUT_OF_STOCK` | ไม่มีสินค้า | A8 Stock |
| 7 | `NO_MODEL_COLOR` | ไม่มีรุ่น/สีที่ต้องการ | A8 Product |
| 8 | `COMPETITOR` | ซื้อร้านอื่น | A8 |
| 9 | `FINANCE_REJECTED` | ผ่อน/เครดิตไม่ผ่าน | A8 Finance |
| 10 | `DOWN_PAYMENT` | เงินดาวน์ไม่พอ | A8 |
| 11 | `PROMOTION` | โปรโมชั่นไม่ตรง | A8 |
| 12 | `UNREACHABLE` | ติดต่อไม่ได้ | A8 Contact |
| 13 | `SERVICE_EXPERIENCE` | ประสบการณ์บริการ | A8 Service |
| 14 | `OTHER` | อื่น ๆ (บังคับ `lost_note`) | A8 |

กราฟแสดง 5 อันดับแรก + "อื่น ๆ" (รวมที่เหลือ) เรียงมากไปน้อย · คะแนนเท่ากันเรียงตาม `sort_order`

### 5.6 ประเภทการติดต่อ — `ref.interaction_types` **[รอยืนยัน]**

`VISIT` เข้าร้าน/รับบริการหน้าร้าน · `INQUIRY` สอบถาม · `CALL` โทรติดตาม · `MESSAGE` ส่งข้อความ · `QUOTATION_SENT` ส่งใบเสนอราคา · `APPOINTMENT` นัดหมายเข้าร้าน · `PURCHASE` ปิดการขาย · `SERVICE` ให้บริการ (ซ่อม/ชำระ) · `COMPLAINT` ร้องเรียน · `NOTE` บันทึกภายใน (ใช้กับ `INTERNAL` เท่านั้น) · `OTHER` อื่น ๆ

### 5.7 ประเภทธุรกรรม — `ref.transaction_types` · ระบบต้นทาง — `ref.source_systems` **[รอยืนยัน Q14]**

| code | ป้ายไทย | `counts_as_purchase` | กลุ่มในแท็บ "การซื้อและบริการ" |
|---|---|:--:|---|
| `SALE` | ขายเครื่อง/สินค้า | ✓ | การซื้อ |
| `TRADE_IN_SALE` | เทิร์นเครื่อง | ✓ | Trade-in |
| `INSTALLMENT_CONTRACT` | สัญญาผ่อน | ✓ | ผ่อน |
| `ACCESSORY_SALE` | ขายอุปกรณ์เสริม | – | การซื้อ |
| `BUYBACK` | รับซื้อเครื่องจากลูกค้า | – | รับซื้อ |
| `REPAIR` | งานซ่อม | – | ซ่อม |
| `INSTALLMENT_PAYMENT` | ชำระค่างวด | – | ผ่อน (Phase 4) |
| `REFUND` | คืนเงิน | – | การซื้อ |

`ref.source_systems`: `MANUAL` บันทึกด้วยมือ · `POS` ระบบขายหน้าร้าน · `REPAIR` ระบบซ่อม · `JPM_INSTALLMENT` ระบบผ่อน JAUN POWER MONEY · `CONTRACT` ระบบสัญญา · `ACCOUNTING` ระบบบัญชี

### 5.8 lookup อื่น

| ตาราง | ค่า |
|---|---|
| `ref.provinces` | 77 จังหวัด · `code` = ISO 3166-2:TH (เช่น `TH-10` กรุงเทพมหานคร) |
| `ref.export_reasons` **[รอยืนยัน]** | `MARKETING_CAMPAIGN` แคมเปญการตลาด (กลุ่มการตลาด → บังคับกรองความยินยอม) · `MANAGEMENT_REPORT` รายงานผู้บริหาร · `DATA_CLEANUP` ทำความสะอาดข้อมูล · `INTERNAL_AUDIT` ตรวจสอบภายใน · `OTHER` อื่น ๆ (บังคับหมายเหตุ) — คอลัมน์เพิ่ม `is_marketing boolean` |
| `ref.duplicate_override_reasons` | `FAMILY_SHARED_PHONE` ใช้เบอร์ร่วมกันในครอบครัว · `DIFFERENT_PERSON` คนละคน · `OTHER` อื่น ๆ (บังคับหมายเหตุ) |
| `ref.ownership_change_reasons` | `SHIFT_CHANGE` เปลี่ยนกะ · `WORKLOAD` กระจายงาน · `STAFF_LEFT` พนักงานลาออก · `CUSTOMER_REQUEST` ลูกค้าขอเปลี่ยน · `BRANCH_TRANSFER` ย้ายสาขา · `OTHER` อื่น ๆ |
| `ref.consent_purposes` | `PRIVACY_NOTICE` แจ้งประกาศความเป็นส่วนตัวแล้ว · `MARKETING` ยินยอมรับข่าวสาร/โปรโมชั่น — คอลัมน์ `controller_entity` **[รอยืนยัน Q17]** |

ชุดค่าที่เป็น CHECK (ไม่ใช่ lookup): ช่องทางของความยินยอม ⊆ {`LINE`,`SMS`,`PHONE`,`EMAIL`} · `customer_type` ∈ {`INDIVIDUAL`,`BUSINESS`} ค่าเริ่มต้น `INDIVIDUAL` (ไม่แสดงบน Quick Capture ไม่ใช้ใน KPI)

### 5.9 Tag — `crm.tags`

สร้าง/แก้: `tag.manage` (MARKETING · BUSINESS_ADMIN) ที่หน้า master-data แท็บ "Tag" · ผู้ที่แก้ลูกค้าได้ **เลือก** tag ที่มีอยู่
`VIP` ลูกค้าคนสำคัญ (VIP) · `INSTALLMENT` ผ่อนชำระ · `STUDENT` นักศึกษา · `TRADE_IN` Trade-in · `IPHONE_FAN` สาย iPhone **[รอยืนยัน]**

### 5.10 Campaign · Segment

- `crm.campaigns(code, name_th, channel_code, starts_on, ends_on, is_active)` สร้างใน migration ของ Phase 2 พร้อม `leads.campaign_id` (nullable · first-touch)
- V1 ไม่มีหน้าจัดการแคมเปญ · MARKETING/BUSINESS_ADMIN เพิ่มแคมเปญที่หน้า master-data แท็บ "แคมเปญ" · `campaign_members` + หน้าแคมเปญเต็ม = Phase 4 · `segments` = Phase 5

---

## 6. Customer Master · Capture · Customer 360 (B4 · B5 · A6 · A12 · A13 · A25)

### 6.1 เลขอ้างอิง (UUID เป็น PK เสมอ · เลขอ้างอิงเป็น `text UNIQUE`)

| สิ่ง | รูปแบบ | ตัวอย่าง | scope ตัวนับ |
|---|---|---|---|
| ลูกค้า | `CUS-{YYYY}-{NNNNNN}` | `CUS-2026-000297` | `CUS:{YYYY}` |
| Lead | `LD-{YYYY}-{NNNNNN}` | `LD-2026-007460` | `LD:{YYYY}` |
| Opportunity | `OP-{YYYY}-{NNNNNN}` | `OP-2026-002998` | `OP:{YYYY}` |
| Quotation | `QT-{YYYY}-{NNNNNN}` | `QT-2026-001702` | `QT:{YYYY}` |
| Task | `TK-{YYYY}-{NNNNNN}` | `TK-2026-012508` | `TK:{YYYY}` |
| Visit | `V-{branch}-{YYMMDD}-{NNN}` | `V-JP1-260908-017` | `VISIT:{branch}:{YYYYMMDD}` |
| คิวหน้าร้าน | `คิว NNN` | `คิว 001` | `QUEUE:{branch}:{YYYYMMDD}` |
| พนักงาน | `ST-{NNNN}` | `ST-0045` | `ST` |
| คำขอส่งออก | `EX-{YYYY}-{NNNNNN}` | `EX-2026-000031` | `EX:{YYYY}` |
| การรวมลูกค้า | `MG-{YYYY}-{NNNNNN}` | `MG-2026-000016` | `MG:{YYYY}` |
| คำขอเจ้าของข้อมูล | `DSR-{YYYY}-{NNNNNN}` | – | `DSR:{YYYY}` |
| คำขอมอบบทบาท | `RG-{YYYY}-{NNNN}` | `RG-2026-0003` | `RG:{YYYY}` |

- กำหนดใน BEFORE INSERT trigger (SECURITY DEFINER · ไม่ GRANT ให้ authenticated) ด้วย upsert:
  `INSERT INTO app.running_numbers(scope_key, last_value) VALUES (v_key, 1) ON CONFLICT (scope_key) DO UPDATE SET last_value = app.running_numbers.last_value + 1 RETURNING last_value`
- ปี/วันคำนวณจาก `created_at` (visit: `started_at`) ของแถว `AT TIME ZONE 'Asia/Bangkok'` ไม่ใช่ `now()` · ปีเป็น ค.ศ. เสมอ · `lpad(n, 6, '0')` เกินหลักได้ไม่ตัด
- ถ้าแถวมีเลขอยู่แล้ว (seed/import) trigger ไม่เขียนทับ · seed ต้องตั้ง `app.running_numbers` ให้ตรงข้อ 13.0

### 6.2 การสร้างลูกค้า (Capture First, Enrich Later)

**สร้างลูกค้าได้ทางเดียว: `api.quick_capture(p jsonb)`** (SECURITY DEFINER · VOLATILE) สร้างในทรานแซกชันเดียว: customer + contacts + consent `PRIVACY_NOTICE` (+ visit + interaction ต้นทาง + lead ตามกรณี) · `authenticated` ไม่มี INSERT บน `crm.customers` `crm.customer_contacts` `crm.customer_consents`

| ช่อง | กติกา (ตรวจ **ตอนสร้างเท่านั้น** ใน RPC ไม่ใช่ CHECK ถาวรของตาราง) |
|---|---|
| ชื่อ | `first_name` **หรือ** `nickname` อย่างน้อยหนึ่งช่อง |
| ช่องทางติดต่อ | อย่างน้อย 1 รายการ |
| เบอร์โทร | **บังคับ** เมื่อช่องทางแรกเป็น `WALK_IN` หรือ `PHONE` |
| ช่องทางแรก · สาขา | บังคับ · สาขาเติมจากผู้ใช้ (เลือกได้ถ้ามีหลายสาขา) · ต้องอยู่ในสาขาที่มี `customer.create` |
| ความสนใจ | `interest_code` บังคับ · `product_type_code` `product_model` ไม่บังคับ |
| ประกาศความเป็นส่วนตัว | บังคับติ๊ก "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" (ข้อ 10.2) |

ลูกค้าที่ขาดเบอร์ภายหลังเกิดได้จากข้อมูลนำเข้า (`created_via = 'IMPORT'`) หรือ contact ที่ถูกปิดใช้งาน → เป็นที่มาของ `MISSING_PHONE`

ผลของการบันทึก:
1. เปิดจากปุ่ม **"+ รับลูกค้า"** หรือหน้ารับลูกค้า → สร้าง/ผูกลูกค้า **และ** เปิด visit (walk-in ตามปุ่มที่กด · ช่องทางอื่น `IN_SERVICE`) + interaction ต้นทาง
2. เปิดจาก "เพิ่มลูกค้า" ในหน้ารายการลูกค้า → สร้างลูกค้าอย่างเดียว ไม่มี visit
3. `interest_code` ที่ `creates_lead = true` → สร้าง lead อัตโนมัติ owner = ผู้บันทึก สถานะตามข้อ 4.3 · `REPAIR`/`INQUIRY` ไม่สร้าง lead
   **Phase 1 ปิดข้อนี้ไว้** — ส่ง `create_lead = false` ทุกคำขอ (ข้อ 20.12 · D52) · เปิดคืนใน Phase 2 พร้อมกติกา promote
4. ช่อง "สาขาที่สนใจ" (mockup B) = `first_branch_id` · "รายละเอียดเพิ่มเติม" = โน้ตแรกใน `crm.customer_notes`

แท็บของฟอร์ม Quick Capture (หน้า 04): **ข้อมูลพื้นฐาน** (เบอร์ · ชื่อ · นามสกุล · ช่องทาง · สาขา · แจ้งประกาศ) · **ความสนใจ** (ความสนใจ · ประเภทสินค้า · รุ่น) · **เพิ่มเติม** (ชื่อเล่น · LINE · อีเมล · จังหวัด · แหล่งที่มา · ยินยอมรับข่าวสาร) · ฟอร์มมือถือเรียงเป็นหน้าเดียว

### 6.3 คอลัมน์ของ `crm.customers`

`id` · `organization_id` · `customer_no` · `first_name` · `last_name` · `nickname` · `display_name` · `name_search` · `customer_type` · `first_seen_at` · `first_channel_code` · `first_source_code` · `first_branch_id` · `owner_staff_id` · `lifecycle_stage` · `record_status` · `merged_into_id` · `province_code` · `note_summary` · `legal_hold boolean` · `created_via` (`QUICK_CAPTURE` · `IMPORT` · `MERGE_SURVIVOR`) · `last_activity_at` · `last_channel_code` · `last_branch_id` · `has_open_followup boolean` · `has_new_lead boolean` · `created_at` · `created_by` · `updated_at` · `updated_by`

```sql
display_name text GENERATED ALWAYS AS (
  coalesce(nullif(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), nickname)) STORED
name_search  text GENERATED ALWAYS AS (
  lower(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')))) STORED
-- ห้ามใช้ concat_ws/format ใน generated column (ไม่ immutable)
CREATE INDEX ON crm.customers USING gin (name_search extensions.gin_trgm_ops);
```

- **ห้ามมี** เลขบัตรประชาชน วันเกิดเต็ม รายได้ รูปถ่าย หรือเอกสารในตารางนี้ (A31 · B23)
- `note_summary` = เนื้อหาโน้ตที่ปักหมุดล่าสุด (trigger) ผู้ใช้แก้ตรงไม่ได้
- `last_activity_at` = เวลากิจกรรมล่าสุดตามข้อ 3.1 · `last_channel_code` = ช่องทางของ interaction ล่าสุดที่ไม่ใช่ INTERNAL · `last_branch_id` = สาขาของกิจกรรมล่าสุด · `has_open_followup` · `has_new_lead` = ธงของป้ายเสริมข้อ 3.5 — **ทั้งหมดเป็นแคชที่ trigger `app.trg_touch_customer_activity` ปรับ** · ป้ายเสริมและตัวกรองหน้า 03 อ่านจากคอลัมน์เหล่านี้ ไม่อ่าน tasks/leads ตรง (ผู้ดูทุกคนจึงเห็นป้ายเดียวกัน)

### 6.4 ช่องทางติดต่อ `crm.customer_contacts` — ค่าเต็มควบคุมระดับคอลัมน์

คอลัมน์: `id` · `organization_id` · `customer_id` · `contact_type` · `value_raw` · `value_normalized` · `value_masked` · `is_primary` · `is_valid` · `is_active` · `verified_at` · `created_*` · `updated_*`

```sql
REVOKE ALL ON crm.customer_contacts FROM authenticated;
GRANT SELECT (id, organization_id, customer_id, contact_type, value_masked, is_primary, is_valid,
              is_active, verified_at, created_at, updated_at) ON crm.customer_contacts TO authenticated;
CREATE INDEX ON crm.customer_contacts (contact_type, value_normalized);
```

| ชนิด | `value_normalized` | `value_masked` |
|---|---|---|
| PHONE มือถือไทย | E.164 `+66812345678` | `081-XXX-5678` |
| PHONE เบอร์บ้าน | E.164 `+6621234567` | `02-XXX-4567` |
| EMAIL | ตัดช่องว่าง ตัวพิมพ์เล็ก (`text`) | อักษรแรก + `***@` + โดเมน เช่น `s***@example.com` |
| LINE_ID | ตัดช่องว่าง ตัวพิมพ์เล็ก ตัด `@` นำหน้า | 2 อักษรแรก + `***` เช่น `so***` |
| FACEBOOK · INSTAGRAM · TIKTOK | ตัดช่องว่าง ตัวพิมพ์เล็ก | 2 อักษรแรก + `***` |
| LINE_USER_ID | ตามที่ LINE ส่ง | ไม่แสดง (`—`) |

- เบอร์ถูกต้อง = มือถือ 10 หลักขึ้นต้น `06` `08` `09` หรือเบอร์บ้าน 9 หลักขึ้นต้น `02`–`07` · นอกนั้นเก็บได้ `is_valid = false`
- เพิ่ม/แก้ช่องทางติดต่อ: `api.save_contact(...)` (DEFINER · ตรวจ `customer.update` บนลูกค้า · normalize + mask ในฐานข้อมูล)
- **ค่าเต็มได้ทางเดียว: `api.reveal_contact(p_contact_id, p_purpose)`** · `p_purpose` ∈ `VIEW` `CALL` `COPY` `LINE_OPEN` · ตรวจ `customer.pii.reveal` · เขียน `audit.access_logs` `CONTACT_REVEALED` ก่อนคืนค่า · ปุ่ม "โทร" "คัดลอก" "เปิด LINE" เรียกฟังก์ชันนี้ก่อนเสมอ · ห้ามฝังค่าเต็มใน HTML ตอนโหลดหน้า · ค่าที่เปิดซ่อนกลับอัตโนมัติใน 30 วินาที **[รอยืนยัน]** · เกิน `security.reveal_per_hour` → **ปฏิเสธ** (คืนผลแบบไม่ raise เพื่อให้ตัวนับและการแจ้งเตือนถูก commit) + แจ้ง `REVEAL_LIMIT_EXCEEDED`
- ปุ่ม "โทร" สร้าง interaction `OUTBOUND` PHONE แบบร่างให้ยืนยันหลังวางสาย
- `crm.customer_addresses` ใช้กติกาคอลัมน์เดียวกัน (แสดงระดับจังหวัด/อำเภอ · ที่อยู่เต็มผ่าน reveal)

### 6.5 ค้นหาลูกค้า

**ค้นหาทั่วไป (แถบบนและหน้ารายการ): `api.search_customers(p_term)`** (DEFINER · VOLATILE)
- เบอร์/อีเมล/LINE ID/IMEI/เลขธุรกรรม: **ตรงทั้งค่าเท่านั้น** กับค่า normalized (ห้าม LIKE/prefix/trigram บนค่า contact) · IMEI 15 หลัก
- ชื่อ: trigram บน `name_search` · `customer_no` `LD-` `OP-` `QT-`: ตรงทั้งค่า · ขั้นต่ำ 3 ตัวอักษร
- คืนเฉพาะรายการที่ผู้เรียกอ่านได้ (ข้อ 9.3) · ผลแบ่งกลุ่ม ลูกค้า · Lead · โอกาสขาย · ใบเสนอราคา · ธุรกรรม · ค่า contact ที่คืนเป็น `value_masked`
- ตัวนับอัตราใน `app.rate_limit_counters`

**ตรวจซ้ำก่อนสร้าง: `api.find_customer_candidates(p_visit_id, p_phone, p_line_id, p_email, p_first_name, p_last_name)`** (DEFINER · VOLATILE)
- ต้องมี `customer.create` · ต้องส่งตัวระบุเต็มอย่างน้อย 1 อย่าง (phone/line_id/email) — ส่งแต่ชื่ออย่างเดียวไม่ได้
- `p_visit_id` (ถ้ามี) ต้องเป็น visit `WAITING`/`IN_SERVICE` ในสาขาที่ผู้เรียกมี `visit.update` สร้างภายใน 4 ชม. **[รอยืนยัน]**
- เรียกอัตโนมัติเมื่อกรอกเบอร์ครบ และเมื่อกด "ตรวจสอบซ้ำ"

| กฎ | ระดับ | คะแนน |
|---|---|---:|
| เบอร์โทร (normalized) ตรงกัน | สูง | 100 |
| LINE ID หรือ LINE userId ตรงกัน | สูง | 100 |
| Email ตรงกัน | สูง | 90 |
| ชื่อ+นามสกุลตรงกัน (`name_search`) และเบอร์ 4 ตัวท้ายตรงกัน | กลาง | 70 |
| `name_search OPERATOR(extensions.%) ชื่อที่กรอก` (threshold 0.6) และ `first_branch_id` = สาขาของผู้เรียก/visit | ต่ำ | 40 |

การ์ดผลลัพธ์ (หัวแผง **"พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน N รายการ"**):
- ลูกค้าที่ผู้เรียก **อ่านได้**: `customer_no` · ชื่อที่แสดง · `value_masked` · ป้าย lifecycle · คะแนน · เหตุผล · ปุ่ม "ดูข้อมูล" + "ใช้ลูกค้าเดิม"
- ลูกค้า **นอกขอบเขต**: `customer_no` · ชื่อ + นามสกุลย่อ (`สมชาย ใ.`) · เบอร์ปิดบัง **เฉพาะเมื่อตรงด้วยเบอร์** · คะแนน · เหตุผล · ปุ่ม "ใช้ลูกค้าเดิม" — **ไม่คืน** lifecycle สาขา หรือวันที่ติดต่อ
- ปุ่มท้ายแผง "ยังต้องการสร้างลูกค้าใหม่" → เลือก `ref.duplicate_override_reasons` → ถ้ามีผู้สมัครคะแนน ≥ 70 สร้างแถว `crm.duplicate_decisions` สถานะ `PENDING` (1 แถวต่อ 1 ลูกค้าที่สร้างใหม่ คู่กับผู้สมัครคะแนนสูงสุด)
- **ไม่มีการ merge อัตโนมัติ** และไม่บล็อกการสร้าง
- อัตรา: ≤ 60 ครั้ง/ชม./ผู้ใช้ · ค้นด้วยตัวระบุที่ไม่พบผล > 20 ครั้ง/ชม. → บล็อก 1 ชม. + แจ้ง BUSINESS_ADMIN **[รอยืนยัน]** · `audit.access_logs` เก็บ `sha256(ค่า normalized)` ไม่เก็บค่าจริง

### 6.6 การมองเห็นลูกค้าข้ามสาขา — `crm.customer_branches`

`crm.customer_branches(customer_id, branch_id, first_linked_at, last_activity_at, linked_via)` PK `(customer_id, branch_id)` · เขียนโดย trigger/RPC เท่านั้น
- เพิ่มอัตโนมัติเมื่อเกิด visit/interaction/lead/opportunity/transaction ref ของลูกค้าที่สาขานั้น — **แต่ INSERT/UPDATE ของตารางเหล่านั้นต้องผ่าน WITH CHECK `customer_id IS NULL OR customer_id IN (SELECT app.readable_customer_ids())`** จึงใช้การสร้างรายการเป็นช่องทางผูกลูกค้าที่มองไม่เห็นไม่ได้
- **ผูกลูกค้าที่ยังมองไม่เห็นเข้าสาขาได้ทางเดียว: `api.link_customer_to_branch(p_customer_id, p_visit_id)`** (DEFINER) — สาขามาจาก visit (ไม่รับจากผู้เรียก) · visit อยู่ในสาขาที่ผู้เรียกมี `visit.update` · สถานะ `WAITING`/`IN_SERVICE` · สร้างภายใน 4 ชม. · `visits.customer_id` ยังว่าง · ลูกค้าถูกคืนจาก `find_customer_candidates` ของผู้เรียกสำหรับ visit นี้ภายใน 30 นาที · ตั้ง `visits.customer_id` ในทรานแซกชันเดียวกัน · บันทึก `CUSTOMER_LINKED_TO_BRANCH` · เกิน 10 ครั้ง/วัน/ผู้ใช้ → แจ้งผู้จัดการสาขา **[รอยืนยัน]**
- เมื่อเห็นลูกค้าแล้ว เห็นประวัติจากทุกสาขาของลูกค้าคนนั้นแบบอ่านอย่างเดียว (read-through ข้อ 9.4) · หน้า "รายการ" และรายงานกรองตาม `branch_id` ของแต่ละรายการ

### 6.7 การรวมลูกค้า (Merge) และการตัดสินข้อมูลซ้ำ

- `api.merge_customers(p_survivor_id, p_merged_id, p_field_choices jsonb, p_reason, p_duplicate_decision_id)` · ต้องมี `customer.merge` บน **ทั้งสองราย** + aal2 · ผู้ตัดสิน ≠ `duplicate_decisions.created_by`
- ทรานแซกชันเดียว ตั้ง `app.bulk = on`: ย้าย contacts (คู่ `(contact_type, value_normalized)` ซ้ำ เก็บแถว verified ก่อน) · visits · interactions · leads · opportunities · quotations · tasks · transaction refs · notes · consents · `customer_tags` (`ON CONFLICT DO NOTHING`) · `customer_branches` (upsert: least `first_linked_at` · greatest `last_activity_at`)
- survivor: `first_seen_at` = least ของทั้งสอง · `first_channel_code`/`first_source_code`/`first_branch_id` มาจากรายที่ `first_seen_at` เก่ากว่า (ไม่ใช่ field_choices) · field อื่นตาม `p_field_choices`
- ผู้ถูกรวม: `record_status = 'MERGED'` + `merged_into_id` · เปิด `customer_no` เดิม → redirect ไป survivor
- บันทึก `crm.customer_merges` (เลข `MG-…` · snapshot ก่อนรวมแบบปิดบัง PII ตามข้อ 9.5 · จำนวนแถวที่ย้ายแยกตาราง) · refresh lifecycle ครั้งเดียวท้ายงาน
- ยืนยัน "คนละคน": `api.decide_duplicate(p_decision_id, 'NOT_DUPLICATE', p_note)` สิทธิ์เดียวกับ merge
- V1 ไม่มี unmerge อัตโนมัติ

`crm.duplicate_decisions(id, customer_id /*รายที่สร้างใหม่*/, candidate_customer_id, score, matched_rules text[], override_reason_code, override_note, status, created_by, created_at, decided_by, decided_at, decision_note)`

### 6.8 Customer 360 (หน้า 05 · แท็บเดียวกันทุกขนาดจอ มือถือย่อป้ายได้)

- **หัว:** `customer_no` · ชื่อ ("คุณ" + display_name) · ป้าย lifecycle + ป้ายเสริม · ปุ่ม "แก้ไข" · เมนู ⋮ = รวมลูกค้า · รับคำขอเจ้าของข้อมูล · ดูประวัติการแก้ไข (ตามสิทธิ์)
- **คอลัมน์ซ้าย:** ช่องทางติดต่อ (ปิดบัง + ปุ่ม แสดง/โทร/คัดลอก/LINE) · จังหวัด · "รู้จักร้านจาก {source}" · "เป็นลูกค้ามา N เดือน" · Tag · สาขาที่เคยใช้บริการ · ผู้ดูแล · โน้ตที่ปักหมุด · **นัดติดตามถัดไป** (next action ที่ใกล้ที่สุดจาก lead/opportunity ที่เปิด)
- **ตัวเลขสรุป 4 ช่อง:** จำนวนการติดต่อ · จำนวนครั้งเข้าร้าน · จำนวนการซื้อ · ยอดซื้อสะสม (บาท) — สูตรข้อ 3.3
- **แท็บ:** `ภาพรวม` · `ประวัติการติดต่อ` (timeline กรองตามช่องทางและประเภท) · `การซื้อและบริการ` (opportunity WON + transaction refs จัดกลุ่มตามข้อ 5.7) · `งานและโอกาสขาย` (lead/opportunity/quotation + task ที่ผู้ใช้มี `task.read`) · `โน้ต` · `เอกสาร` (V1: เลขใบเสนอราคาและเลขสัญญาจาก transaction refs เท่านั้น ข้อความ "เอกสารอยู่ในระบบสัญญา" · ไม่มีปุ่มอัปโหลด) · `ประวัติการแก้ไข` (เฉพาะผู้มี `customer.update` บนลูกค้ารายนี้ · ค่าปิดบัง)
- **สินค้าที่สนใจ:** `product_model` ของ lead/opportunity ที่เปิดอยู่ เรียง `HOT` → `WARM` → `COLD` แล้วตาม `updated_at` ล่าสุด สูงสุด 3 รายการ
- ข้อมูลหัวดึงผ่าน `api.get_customer_360(p_customer_id)` ซึ่งเขียน `CUSTOMER_VIEWED` ในทรานแซกชันเดียวกัน

### 6.9 โน้ต — `crm.customer_notes`

`customer_id` · `interaction_id` (nullable) · `branch_id` · `body text` (≤ 2,000 ตัวอักษร) · `is_pinned` · `created_*` · `updated_*` · ไม่มี DELETE
อ่าน = อ่านลูกค้าได้ · สร้าง = `note.create` · แก้ = `note.update` (ภายใน 24 ชม. หลังสร้างสำหรับทุกคน · BUSINESS_ADMIN แก้ของคนอื่นได้แต่ยังอยู่ในกรอบ 24 ชม.) · ฟอร์มแสดงคำเตือน **"ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา"**

### 6.10 คอลัมน์หลักของตารางกิจกรรม (ตรึง · FK ไป `ref` ลงท้าย `_code` · ทุกตารางมี `id` `organization_id` `created_at` `created_by` `updated_at` `updated_by`)

| ตาราง | คอลัมน์ |
|---|---|
| `crm.visits` | `visit_no` · `branch_id NOT NULL` · `team_id` · `channel_code` · `status` · `queue_no` (WALK_IN เท่านั้น) · `party_size int ≥ 1 DEFAULT 1` · `customer_id` (nullable) · `interest_code` (บังคับเมื่อ WALK_IN) · `source_code` · `started_at` (เข้าคิว/ข้อความแรก) · `service_started_at` · `ended_at` · `owner_staff_id` (ผู้รับ · ว่างได้เมื่อ WAITING) · `outcome_code` · `cancel_reason` · `closed_by_system boolean` · `unrecorded_ack_by` · `unrecorded_ack_at` |
| `crm.interactions` | `customer_id` (nullable) · `visit_id` · `is_visit_root boolean` · `lead_id` · `opportunity_id` · `branch_id NOT NULL` · `channel_code` · `direction` · `interaction_type_code` · `occurred_at` · `owner_staff_id` · `summary text` |
| `crm.leads` | `lead_no` · `customer_id NOT NULL` · `branch_id NOT NULL` · `owner_staff_id` · `team_id` · `channel_code NOT NULL` · `source_code` · `campaign_id` · `visit_id` · `interest_code NOT NULL` · `product_type_code` · `product_model` · `interest_level` · `status` · `priority_code` · `next_action` · `next_action_type_code` · `next_action_at` · `first_contacted_at` · `closed_at` · `lost_reason_code` · `lost_note` · `converted_opportunity_id` |
| `crm.opportunities` | `opportunity_no` · `customer_id NOT NULL` · `lead_id` · `origin_channel_code NOT NULL` · `origin_visit_id` · `branch_id NOT NULL` · `owner_staff_id` · `team_id` · `interest_code` · `stage` · `priority_code` · `expected_amount` (= ผลรวม items · trigger) · `next_action` · `next_action_type_code` · `next_action_at` · `won_amount numeric(12,2)` · `won_at` · `closed_at` · `lost_reason_code` · `lost_note` |
| `crm.opportunity_items` | `opportunity_id` · `product_type_code` · `product_model` · `variant` · `quantity` · `unit_price` · `interest_level` |
| `crm.quotations` | `quotation_no` · `opportunity_id NOT NULL` · `customer_id` · `branch_id` · `owner_staff_id` · `status` · `sent_at` · `sent_channel_code` · `valid_until` · `total_amount` · `installment_months` · `terms_note` |
| `crm.quotation_items` | `quotation_id` · `product_type_code` · `product_model` · `variant` · `quantity` · `unit_price` · `discount_amount` |
| `crm.tasks` | `task_no` · `task_type_code` · `title` · `description` · `customer_id` · `lead_id` · `opportunity_id` · `branch_id NOT NULL` · `owner_staff_id` · `team_id` · `status` · `priority_code` · `due_at` · `remind_at` · `completed_at` · `cancelled_at` · `is_next_action boolean` |
| `crm.task_comments` | `task_id` · `body` · `created_*` |
| `crm.transaction_refs` | `customer_id NOT NULL` · `branch_id NOT NULL` · `opportunity_id` · `transaction_type_code` · `source_system_code` · `external_no` · `transacted_at` · `amount` · `device_imei` · `device_serial` · `summary jsonb` · UNIQUE(`source_system_code`, `external_no`) |
| `crm.ownership_changes` | `entity_type` · `entity_id` · `from_staff_id` · `to_staff_id` · `from_branch_id` · `to_branch_id` · `reason_code` · `note` · `changed_by` · `changed_at` |
| `crm.notifications` | `recipient_staff_id` · `code` · `entity_type` · `entity_id` · `entity_ref` · `title` · `body` · `created_at` · `read_at` · `dedupe_key` · UNIQUE(`recipient_staff_id`, `dedupe_key`) |

Index บังคับทุกตารางกิจกรรม: `(branch_id)` · `(owner_staff_id)` · `(customer_id)` · และ `crm.customer_branches (branch_id, customer_id)`

---

## 7. บทบาท ผู้ใช้ และทีม (A15 · A17 · B10 · B11)

| code | ป้ายไทย | rank | ใครบ้าง | `requires_mfa` |
|---|---|---:|---|:--:|
| `STAFF` | พนักงานขาย/แอดมิน | 10 | พนักงานหน้าร้าน · แอดมินออนไลน์ | – |
| `SUPERVISOR` | หัวหน้าทีม | 20 | หัวหน้าทีมขาย/หัวหน้าแอดมิน | ✓ |
| `BRANCH_MANAGER` | ผู้จัดการสาขา | 30 | ผู้จัดการร้าน | ✓ |
| `MARKETING` | ฝ่ายการตลาด | 30 | ทีมการตลาด | ✓ |
| `OPERATIONS` | ฝ่ายปฏิบัติการ | 40 | ดูแลหลายสาขา (อ่านอย่างเดียว) | ✓ |
| `BUSINESS_ADMIN` | ผู้ดูแลข้อมูลธุรกิจ | 50 | master data · ผู้ใช้ · คุณภาพข้อมูล · PDPA | ✓ |
| `EXECUTIVE` | ผู้บริหาร | 60 | ผู้บริหารระดับองค์กร | ✓ |
| `SYSTEM_ADMIN` | ผู้ดูแลระบบ (IT) | ไม่เทียบ (NULL · สายแยก) | ดูแลระบบ · integration | ✓ |

`core.roles(code, label_th, rank, requires_mfa, is_branch_role)`

### 7.1 การมอบบทบาทและทีม

`core.staff_role_assignments(id, staff_id, role_code, branch_id, valid_from, valid_to, granted_by, grant_reason, revoked_by, revoke_reason)`
- CHECK: `role_code IN ('MARKETING','EXECUTIVE','BUSINESS_ADMIN','SYSTEM_ADMIN')` ⇔ `branch_id IS NULL` · `STAFF` `SUPERVISOR` `BRANCH_MANAGER` `OPERATIONS` ต้องมี `branch_id`
- คนเดียวมีหลายแถวได้ · "Multi-Branch" ของ OPERATIONS = หลายแถวคนละสาขา (A15: คุณ A `BRANCH_MANAGER`@JP2 · คุณ B `BRANCH_MANAGER`@JP4)
- แถว assignment **แก้ได้เฉพาะ `valid_to` `revoked_by` `revoke_reason`** (การถอน) · helper ห้ามตีความ `branch_id` NULL ของบทบาทสาขาเป็นทุกสาขา
- `SUPERVISOR`@สาขา X ใช้ได้เมื่อเป็น `is_leader` ของทีมที่ `teams.branch_id = X` อย่างน้อย 1 ทีม
- **SYSTEM_ADMIN ไม่มีสิทธิ์ข้อมูลลูกค้าใด ๆ** และห้ามถือร่วมกับบทบาทธุรกิจในบัญชีเดียว · trigger ตรวจต้อง `SELECT … FOR UPDATE` แถว `core.staff_profiles` ก่อน
- `core.staff_profiles.staff_code text NOT NULL UNIQUE` = `ST-{NNNN}` ออกโดย trigger ตัวนับ `ST` (ใช้ล็อกอินและแสดงผล)
- `core.staff_profiles.employee_code text NOT NULL` = รหัส HR ที่ผู้เชิญกรอก · **ไม่ UNIQUE** แต่ห้ามมีสองบัญชีที่ไม่ใช่ `DISABLED` ด้วย employee_code เดียวกัน (partial unique index `WHERE status <> 'DISABLED'`) **[รอยืนยัน Q1]**
- คอลัมน์แสดงผลของ `core.staff_profiles`: `display_name` (เช่น "คุณขวัญ") · `nickname` · `status` · `user_id` (→ `auth.users`) · `organization_id`
- ทีม: `core.team_members(team_id, staff_id, is_leader, valid_from, valid_to)` แหล่งเดียว · สมาชิกต้องมี assignment ในสาขาของทีม · หัวหน้านับเป็นสมาชิก · จัดการทีม = `team.manage`
- scope `TEAM` ประเมินจาก **สมาชิกภาพปัจจุบันของ owner** · `team_id` บนรายการเป็น snapshot ตอนมอบงาน (A28) ใช้แสดงผล/รายงาน

### 7.2 ใครมอบ/ถอนบทบาทได้

| ผู้กระทำ | มอบ/ถอนได้ | ขอบเขต |
|---|---|---|
| `BRANCH_MANAGER` | `STAFF` · `SUPERVISOR` | เฉพาะสาขาที่ตนเป็นผู้จัดการ (ระบบล็อก) |
| `BUSINESS_ADMIN` | `STAFF` · `SUPERVISOR` · `BRANCH_MANAGER` · `MARKETING` · `OPERATIONS` | ทุกสาขา |
| `SYSTEM_ADMIN` | **ยื่นคำขอ** `SYSTEM_ADMIN` · `EXECUTIVE` · `BUSINESS_ADMIN` ผ่าน `api.request_role_grant` | – |
| `EXECUTIVE` | **อนุมัติ/ปฏิเสธ** คำขอด้วย `api.decide_role_grant` (aal2) | – |

กติการ่วม:
- ห้ามมอบ/ถอนบทบาทของตนเอง · ห้ามมอบ rank ≥ rank สูงสุดของตน (SYSTEM_ADMIN ไม่มี rank จึงมอบตรงไม่ได้เลย)
- ผู้อนุมัติคำขอ ≠ ผู้ยื่น ≠ ผู้รับ ≠ บัญชีที่ `employee_code` เดียวกับผู้รับ · หน้าอนุมัติแสดงผู้เชิญ วันที่เชิญ อีเมล รหัสพนักงาน
- บัญชีที่ SYSTEM_ADMIN เป็นผู้เชิญ รับบทบาทธุรกิจไม่ได้จนกว่า BUSINESS_ADMIN ยืนยันตัวตนกับ HR (`identity_verified_by`)
- สคริปต์ bootstrap สร้าง EXECUTIVE คนแรก + SYSTEM_ADMIN คนแรก + บัญชี INVITED ของ BUSINESS_ADMIN คนแรก (บทบาท BA มอบผ่านคำขอ RG ที่ EXECUTIVE อนุมัติ และ EXECUTIVE ยืนยันตัวตนกับ HR แทน BA)
- การถอน `EXECUTIVE` `BUSINESS_ADMIN` `SYSTEM_ADMIN` ใช้คำขอ RG ชนิด `REVOKE` เส้นทางเดียวกับการมอบ
- ลบคำขอไม่ได้ · ห้ามมอบบทบาทให้บัญชี `DISABLED`
- `core.role_permissions` แก้ได้เฉพาะผ่าน migration (ไม่มีหน้าจอ/RPC ใน V1) · trigger บันทึก `PERMISSION_CHANGED` · test ยืนยันว่า SYSTEM_ADMIN ไม่มีสิทธิ์ `customer.*` `visit.*` `lead.*` `opportunity.*`
- ทุกการมอบ/ถอน/ยื่น/ตัดสิน บันทึก `ROLE_GRANTED` `ROLE_REVOKED` `ROLE_GRANT_REQUESTED` `ROLE_GRANT_DECIDED`

### 7.3 เชิญ · เปิดใช้งาน · ปิดใช้งาน (B10)

1. ผู้จัดการ → "ผู้ใช้งานในสาขา" → "เพิ่มผู้ใช้งาน" → กรอก ชื่อ · ชื่อเล่น · อีเมล · เบอร์ · รหัสพนักงาน → เลือกบทบาท (เฉพาะที่มอบได้) → สาขาถูกล็อก
2. Edge Function `invite-staff`: verify JWT → เรียก `api.can_assign_role(...)` **ด้วย JWT ของผู้เรียก** → สร้าง `core.staff_invitations` + `core.staff_profiles` (`INVITED`, `invite_expires_at = +24 ชม.`) **ก่อน** → `auth.admin.generateLink`/`inviteUserByEmail` (service_role)
3. พนักงานกดลิงก์ → ตั้งรหัสผ่าน → ถ้ามีบทบาทที่ `requires_mfa` ลงทะเบียน TOTP → `api.activate_self()` (ตรวจ `email_confirmed_at` · ไม่หมดอายุคำเชิญ · มี verified factor เมื่อจำเป็น) → `ACTIVE`
4. ปิดใช้งาน (`api.disable_staff` + Edge Function `disable-staff`): `DISABLED` **ห้ามลบ** · ban ผู้ใช้ใน Supabase Auth + เพิกถอน session · ตั้ง `valid_to = now()` ทุก assignment · opportunity ที่เปิดอยู่ → owner = ผู้จัดการสาขาของรายการ (ถ้ามีหลายคนใช้ `staff_code` น้อยสุด **[รอยืนยัน]** · ถ้าไม่มีผู้จัดการ → ปฏิเสธการปิดใช้งานจนกว่าจะโอนงานด้วย `api.assign_owner`) (`ownership_changes` เหตุผล `STAFF_LEFT`) · lead/task ที่เปิดอยู่ → owner ว่าง + แจ้ง `LEAD_UNASSIGNED` **[รอยืนยัน]** · เปิดใช้งานใหม่ต้องมอบบทบาทใหม่
5. ข้อจำกัด: BRANCH_MANAGER ปิดใช้งาน/แก้โปรไฟล์ได้เฉพาะบัญชีที่ assignment ที่ยังมีผล **ทุกแถว** เป็น STAFF/SUPERVISOR ในสาขาที่ตนเป็นผู้จัดการ (กรณีอื่นถอนได้เฉพาะ assignment ในสาขาตน) · BRANCH_MANAGER แก้อีเมลไม่ได้ · ห้ามปิดใช้งานตนเอง · ห้ามปิดใช้งาน EXECUTIVE หรือ BUSINESS_ADMIN ที่ ACTIVE คนสุดท้าย · SYSTEM_ADMIN แก้/ปิดใช้งานได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ
6. เปลี่ยนอีเมล/ตัวตนล็อกอิน/รีเซ็ต MFA: บัญชี STAFF และบทบาท ≥ SUPERVISOR → BUSINESS_ADMIN · บัญชี BA/EX/SA → EXECUTIVE ผ่าน Edge Function `reset-mfa` ที่ผู้กระทำต้อง aal2 · แจ้งอีเมลเดิมทุกครั้ง · บันทึก `MFA_RESET`

---

## 8. สิทธิ์ (Permission) × ขอบเขต (Scope)

### 8.0 ความหมายของขอบเขต (ตรึง · ประเมิน **ต่อแถวการมอบบทบาท** แล้วรวมแบบ OR)

แถวข้อมูลผ่านสิทธิ์ `p` ถ้ามี assignment `a` ของผู้ใช้ (staff `ACTIVE` · `valid_from ≤ now() < coalesce(valid_to, ∞)`) อย่างน้อย 1 แถว ที่ `core.role_permissions(a.role_code, p)` มี scope และ:

| scope | แถวที่มี `branch_id` | ลูกค้า (ไม่มี `branch_id`) |
|---|---|---|
| `O` OWN | `branch_id = a.branch_id` **และ** (`owner_staff_id` = ตน **หรือ** owner ว่างและ `created_by` = ตน) | owner = ตน **และ** ลูกค้าเชื่อมกับ `a.branch_id` (`customer_branches` หรือ `first_branch_id`) |
| `T` TEAM | `branch_id = a.branch_id` **และ** `owner_staff_id` ∈ สมาชิกทีม (ในสาขานั้น) ที่ตนเป็น `is_leader` | owner ∈ สมาชิกทีม **และ** เชื่อมกับ `a.branch_id` |
| `B` BRANCH | `branch_id = a.branch_id` | เชื่อมกับ `a.branch_id` |
| `G` ORGANIZATION | `organization_id` = ขององค์กรผู้ใช้ | เหมือนกัน |
| `S` SYSTEM | เฉพาะวัตถุระบบ (บัญชี · settings เชิงเทคนิค · integration) ไม่รวมข้อมูลลูกค้า | – |

- **ห้ามยุบ scope ข้ามสาขา:** คนที่เป็น `BRANCH_MANAGER`@JP1 และ `STAFF`@JP2 ได้ `B` ที่ JP1 และ `O` ที่ JP2 เท่านั้น
- **MFA:** assignment ของบทบาท `requires_mfa = true` ไม่ถูกนับเมื่อ `coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'` · สิทธิ์ที่ติด 🔐 (`role_permissions.requires_aal2 = true`) ไม่ถูกนับเมื่อไม่ใช่ aal2 (สิทธิ์จากบทบาท STAFF ยังใช้ได้ที่ aal1)
- **ห้ามฝังบทบาท/สิทธิ์ลง JWT** ตรวจสดจากตารางเท่านั้น
- `lead.assign` และ `task.assign` ที่ scope **T** รวมรายการที่ **owner ว่าง** ในสาขาที่ตนเป็นหัวหน้าทีมด้วย (เพื่อรับเรื่อง `LEAD_UNASSIGNED`)
- scope ที่สูงกว่ารวมเงื่อนไขของ scope ที่ต่ำกว่าเสมอ (รวมแถวไม่มี owner ที่ตนสร้าง)
- `transaction_refs` ไม่มี owner → scope O ประเมินจาก `created_by`
- **สิทธิ์ `*.create` และ `transaction.link` ประเมินกับแถวแม่:** quotation → opportunity · task → opportunity/lead ถ้ามี มิฉะนั้นลูกค้า · opportunity → lead ถ้ามี มิฉะนั้นลูกค้า · lead/interaction/visit → ลูกค้า (ถ้ามี) · `branch_id` ของแถวลูกต้องเท่าแถวแม่ (ถ้าไม่มีแม่ต้องอยู่ในสาขาของ assignment **และ** ต้องเป็นสาขาที่ลูกค้าเชื่อมอยู่แล้วใน `customer_branches`/`first_branch_id` เว้นแต่ scope ORGANIZATION — กันการผูกลูกค้าข้ามสาขาโดยไม่ผ่าน `api.link_customer_to_branch`)
- **สิทธิ์ที่ขึ้นกับคอลัมน์ที่เปลี่ยน** (assign · close · reopen · ย้ายสาขา · แก้หลังส่ง) ตรวจใน trigger ข้อ 9.4.2

### 8.1 ตารางสิทธิ์

**ST** STAFF · **SV** SUPERVISOR · **BM** BRANCH_MANAGER · **OP** OPERATIONS · **MK** MARKETING · **EX** EXECUTIVE · **BA** BUSINESS_ADMIN · **SA** SYSTEM_ADMIN · 🔐 = ต้อง aal2 ในเซสชันนี้

| permission | ความหมาย | ST | SV | BM | OP | MK | EX | BA | SA |
|---|---|---|---|---|---|---|---|---|---|
| `customer.read` | ดูลูกค้า/Customer 360 | B | B | B | B | – | G | G | – |
| `customer.create` | สร้างลูกค้า (ผ่าน quick_capture) | B | B | B | – | – | – | G | – |
| `customer.update` | แก้ข้อมูลลูกค้า/ช่องทางติดต่อ/tag | O | T | B | – | – | – | G | – |
| `customer.assign` | เปลี่ยนผู้ดูแลลูกค้า | – | T | B | – | – | – | G | – |
| `customer.merge` 🔐 | รวมลูกค้าซ้ำ/ยืนยันคนละคน | – | T | B | – | – | – | G | – |
| `customer.pii.reveal` | เปิดค่าเต็มของช่องทางติดต่อ (บันทึกทุกครั้ง) | B | B | B | – | – | G🔐 | G🔐 | – |
| `customer.export` 🔐 | ส่งออกข้อมูลลูกค้า (ข้อ 8.2) | – | – | B | – | G | G | G | – |
| `customer.consent.manage` | บันทึกความยินยอม (append-only) | B | B | B | – | – | – | G | – |
| `customer.anonymize` 🔐 | ทำข้อมูลนิรนาม (ข้อ 10.4) | – | – | – | – | – | – | G | – |
| `note.create` | เพิ่มโน้ต | B | B | B | – | – | – | G | – |
| `note.update` | แก้โน้ตของตน (24 ชม.) | O | O | O | – | – | – | G | – |
| `visit.read` | ดู visit/คิว | B | B | B | B | – | G | G | – |
| `visit.create` | รับลูกค้า/เปิด visit | B | B | B | – | – | – | – | – |
| `visit.update` | รับคิว/แก้/ปิด visit | O | T | B | – | – | – | G | – |
| `interaction.read` | ดูประวัติการติดต่อ | B | B | B | B | – | G | G | – |
| `interaction.create` | บันทึกการติดต่อ | B | B | B | – | – | – | G | – |
| `interaction.update` | แก้บันทึกการติดต่อ (ภายใน 24 ชม.) | O | T | B | – | – | – | – | – |
| `lead.read` | ดู lead | B | B | B | B | – | G | G | – |
| `lead.create` | สร้าง lead | B | B | B | – | – | – | G | – |
| `lead.update` | แก้/เปลี่ยนสถานะ/ปิด lead (แปลงต้องมี `opportunity.create` ด้วย) | O | T | B | – | – | – | G | – |
| `lead.assign` | มอบ/เปลี่ยนผู้รับผิดชอบ lead | – | T | B | – | – | – | G | – |
| `lead.reopen` | เปิด lead ที่ปิดแล้ว | – | – | B | – | – | – | G | – |
| `opportunity.read` | ดูโอกาสขาย/Pipeline | B | B | B | B | – | G | G | – |
| `opportunity.create` | สร้างโอกาสขาย | B | B | B | – | – | – | – | – |
| `opportunity.update` | แก้/เลื่อนขั้น | O | T | B | – | – | – | G | – |
| `opportunity.assign` | เปลี่ยนผู้รับผิดชอบ | – | T | B | – | – | – | G | – |
| `opportunity.close` | ปิด WON/LOST | O | T | B | – | – | – | G | – |
| `opportunity.reopen` | เปิดรายการที่ปิดแล้ว | – | – | B | – | – | – | G | – |
| `quotation.read` | ดูใบเสนอราคา | B | B | B | B | – | G | G | – |
| `quotation.create` | สร้างใบเสนอราคา (ประเมินกับ opportunity แม่) | O | T | B | – | – | – | – | – |
| `quotation.update` | แก้ DRAFT · ส่ง · เปลี่ยนสถานะ | O | T | B | – | – | – | – | – |
| `task.read` | ดูงาน (**ไม่มี read-through ผ่านลูกค้า**) | O | T | B | B | – | G | G | – |
| `task.create` | สร้างงาน | O | T | B | – | – | – | G | – |
| `task.update` | แก้/ปิดงาน | O | T | B | – | – | – | G | – |
| `task.assign` | มอบงานให้คนอื่น | – | T | B | – | – | – | G | – |
| `transaction.read` | ดูประวัติธุรกรรม | B | B | B | B | – | G | G | – |
| `transaction.link` | ผูกเลขธุรกรรม (ด้วยมือ V1) | O | T | B | – | – | – | G | – |
| `tag.manage` | สร้าง/แก้ tag | – | – | – | – | G | – | G | – |
| `campaign.read` | ดูแคมเปญ | – | – | B | B | G | G | G | – |
| `campaign.manage` | จัดการแคมเปญ | – | – | – | – | G | – | G | – |
| `dashboard.view` | ดู Dashboard (ตัวเลขรวม) | O | T | B | B | G | G | G | – |
| `report.view` | ดูรายงาน (ตัวเลขรวม ไม่มี PII) | – | T | B | B | G | G | G | – |
| `report.staff_performance` | ดูผลงานรายพนักงาน | – | T | B | B | – | G | G | – |
| `report.export` | ส่งออกรายงานตัวเลขรวม (ไม่มี PII) | – | T | B | B | G | G | G | – |
| `data_quality.view` | ดูศูนย์คุณภาพข้อมูล | O | T | B | B | – | G | G | – |
| `data_quality.resolve` | แก้รายการคุณภาพข้อมูล (ยกเว้นข้อมูลซ้ำ ใช้ `customer.merge`) | O | T | B | – | – | – | G | – |
| `dsr.create` | รับคำขอเจ้าของข้อมูลที่หน้าร้าน | B | B | B | – | – | – | G | – |
| `dsr.manage` 🔐 | ดำเนินการคำขอเจ้าของข้อมูล | – | – | – | – | – | – | G | – |
| `master_data.manage` 🔐 | จัดการ Master Data | – | – | – | – | – | – | G | – |
| `team.manage` | จัดการทีม/สมาชิกทีม | – | – | B | – | – | – | G | – |
| `user.read` | ดูรายชื่อผู้ใช้ | – | T | B | B | – | G | G | S |
| `user.invite` | เชิญผู้ใช้ | – | – | B | – | – | – | G | S¹ |
| `user.update` | แก้โปรไฟล์ผู้ใช้ | – | – | B | – | – | – | G | S¹ |
| `user.disable` 🔐 | ปิดใช้งานผู้ใช้ | – | – | B | – | – | – | G | S¹ |
| `role.assign` 🔐 | มอบ/ถอนบทบาท (ข้อ 7.2) | – | – | B | – | – | – | G | – |
| `role.request` | ยื่นคำขอบทบาทสูง | – | – | – | – | – | – | – | S |
| `role.decide` 🔐 | อนุมัติคำขอบทบาทสูง | – | – | – | – | – | G | – | – |
| `export.approve` 🔐 | อนุมัติคำขอส่งออก (ตามข้อ 8.2) | – | – | – | – | – | G | G | – |
| `audit.read` | ค้น audit log ธุรกิจ (ค่าปิดบัง) | – | – | – | – | – | G | G | – |
| `security_log.read` | ดู log เข้าสู่ระบบ/สิทธิ์ | – | – | – | – | – | G | G | S |
| `settings.business` 🔐 | ตั้งค่าเกณฑ์ธุรกิจ/ความปลอดภัย (ข้อ 11.2) | – | – | – | – | – | – | G | – |
| `settings.system` 🔐 | ตั้งค่าเชิงเทคนิค | – | – | – | – | – | – | – | S |
| `integration.manage` 🔐 | จัดการ integration (ส่งข้อมูลออกนอกระบบต้องให้ EX อนุมัติ) | – | – | – | – | – | – | – | S |

¹ SYSTEM_ADMIN: เชิญได้เฉพาะบัญชีสาย SYSTEM_ADMIN (ต้องผ่านคำขอ) · แก้/ปิดใช้งานได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ

- ไม่มี `customer.delete` ในระบบ (A16) · การลบจริงทำผ่าน `customer.anonymize` ตามข้อ 10.4
- `data_quality.resolve` ระดับ O ใช้ได้เฉพาะ `MISSING_PHONE` `INVALID_PHONE` `INCOMPLETE_CUSTOMER` ของลูกค้าที่ตนดูแล
- BUSINESS_ADMIN ใช้หน้า Quick Capture ได้เฉพาะ "เพิ่มลูกค้า" (ไม่มีปุ่มรับลูกค้า) · EXECUTIVE เปิดหน้า users เพื่อดูและอนุมัติคำขอบทบาทเท่านั้น · MARKETING เปิดหน้า master-data เฉพาะแท็บ Tag และแคมเปญ

### 8.2 การส่งออกข้อมูลลูกค้า (A33 · B22) **[รอยืนยันตัวเลข]**

| ยื่นในบทบาท | แถวสูงสุด/ครั้ง | ครั้ง/วัน | ผู้อนุมัติ | คอลัมน์ที่ได้ |
|---|---:|---:|---|---|
| BRANCH_MANAGER | 500 | 3 | ไม่ต้อง · **เกินเพดาน = ปฏิเสธ** | `customer_no` · `display_name` · `lifecycle_stage` · `first_channel_code` · `province_code` · `last_activity_at` · เบอร์ปิดบัง |
| MARKETING | 5,000 | 2 | BUSINESS_ADMIN **ทุกครั้ง** | `customer_no` · `display_name` + PHONE เมื่อยินยอมช่องทาง `PHONE`/`SMS` · EMAIL เมื่อ `EMAIL` · LINE เมื่อ `LINE` |
| BUSINESS_ADMIN | 5,000 | 5 | EXECUTIVE | โปรไฟล์ + ช่องทางติดต่อ + tag + ความยินยอมปัจจุบัน |
| EXECUTIVE | 5,000 | 5 | BUSINESS_ADMIN **[รอยืนยัน Q23]** | โปรไฟล์ + ช่องทางติดต่อ + tag + ความยินยอมปัจจุบัน |

- ไม่มีบทบาทใดได้โน้ต สรุปการติดต่อ สรุปธุรกรรม หรือ IMEI
- เหตุผลที่ `ref.export_reasons.is_marketing = true` → กรองเฉพาะลูกค้าที่ยินยอม `MARKETING` **ทุกบทบาท**
- ครั้ง/วัน นับทุกคำขอที่ยื่นในวันธุรกิจ (Asia/Bangkok) ต่อผู้ขอและ `requested_as_role` **รวมที่ถูกปฏิเสธ** · คำขอของ BRANCH_MANAGER ที่ไม่เกินเพดาน = `APPROVED` ทันที (`approved_by` NULL)
- CHECK `approved_by <> requested_by` · ผู้อนุมัติกำหนดตาม `requested_as_role` · แจ้งเตือนเฉพาะผู้อนุมัติที่มีสิทธิ์ตามกติกานี้ · ห้ามถือ MARKETING ร่วมกับ BUSINESS_ADMIN ในบัญชีเดียว **[รอยืนยัน Q22]**
- สร้างไฟล์: Edge Function `generate-export` (service_role) → `app.build_export_dataset(export_id)` ตรวจซ้ำ: สถานะ, ผู้ขอยัง ACTIVE และมี `customer.export`, ขอบเขตสาขาและตัวกรองที่บันทึกตอนยื่น, whitelist คอลัมน์
- ลายน้ำ `ส่งออกโดย {staff_code} · {export_no} · {วันเวลา}` ในแถวหัวไฟล์และชื่อไฟล์
- `app.job_expire_exports` เปลี่ยน `GENERATED`/`DOWNLOADED` ที่สร้างไฟล์เกิน `export.link_ttl_hours` เป็น `EXPIRED` และลบไฟล์ · จำนวนครั้งดาวน์โหลดคงไว้
- ดาวน์โหลด: หน้า `/exports/EX-…` ในแอป → `api.record_export_download(export_id)` (ผู้ขอเท่านั้น · ACTIVE · aal2 · สถานะ GENERATED/DOWNLOADED · ดาวน์โหลดแล้ว < 3 ครั้ง · ภายใน 24 ชม. หลังสร้าง) → signed URL อายุ 60 วินาที · ไฟล์ถูกลบเมื่อครบ 24 ชม.

### 8.3 สิทธิ์ของตารางย่อย (สืบจากแถวแม่)

| ตาราง | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `customer_contacts` · `customer_addresses` | ลูกค้าอ่านได้ (column grant) | RPC `api.save_contact` / `api.save_address` | – |
| `customer_notes` | ลูกค้าอ่านได้ | `note.create` / `note.update` | – |
| `customer_tags` | ลูกค้าอ่านได้ | `customer.update` บนลูกค้า · tag ต้อง `is_active` | `customer.update` (audit บันทึก) |
| `customer_consents` | ลูกค้าอ่านได้ | RPC `api.record_consent` (append-only) | – |
| `customer_branches` · `lead_status_history` · `opportunity_stage_history` · `ownership_changes` · `customer_merges` | แถวแม่อ่านได้ | trigger/RPC เท่านั้น | – |
| `duplicate_decisions` | `data_quality.view` บนลูกค้าทั้งสองราย | RPC เท่านั้น | – |
| `notifications` | `recipient_staff_id` = ตน | UPDATE เฉพาะ `read_at` ของตน (column grant) | – |
| `task_comments` | `task.read` บน task | `task.update` บน task | – |
| `opportunity_items` · `quotation_items` | แถวแม่อ่านได้ | สิทธิ์ update ของแม่ | ได้เมื่อ opportunity ยังเปิด / quotation ยังเป็น DRAFT |
| `data_subject_requests` | `dsr.manage` (ผู้รับคำขอเห็นของตน) | `dsr.create` · ดำเนินการด้วย `dsr.manage` | – |
| `ref.*` | ผู้ใช้ที่เข้าสู่ระบบ (`is_active` หรือมี `master_data.manage`) | `master_data.manage` | – |
| `core.staff_profiles` (เฉพาะคอลัมน์ `id` `staff_code` `display_name` `nickname` `status` ผ่าน column grant) · `core.teams` · `core.branches` | ผู้ใช้ ACTIVE ในองค์กรเดียวกัน | RPC เท่านั้น | – |
| คอลัมน์อื่นของ `core.staff_profiles` · `core.staff_role_assignments` · `core.team_members` | `user.read` (ผ่าน `api.list_staff`) | RPC เท่านั้น | – |

---

## 9. ความปลอดภัย (A29–A36 · B20–B22)

### 9.1 สมมติฐานภัยคุกคาม (ตรึง)

`Browser` → `Supabase Auth (JWT)` → `Next.js Server Action/Route Handler` → `PostgREST/RPC ด้วย JWT ผู้ใช้` → **`RLS + trigger + RPC ตรวจสิทธิ์`** → `PostgreSQL`

**ผู้ใช้ทุกคนเรียก PostgREST/RPC ตรงด้วย JWT ของตนได้** ดังนั้นการควบคุมทุกข้อ (สิทธิ์ · ปิดบัง · บันทึกการเข้าถึง · อัตรา · การเปลี่ยนสถานะ) ต้องอยู่ในฐานข้อมูล · Server Action ตรวจซ้ำเพื่อ UX ได้แต่ไม่ถือเป็นการตรวจสิทธิ์ · UI ซ่อนปุ่มเพื่อความสะดวกเท่านั้น (A29)

### 9.2 การเข้าสู่ระบบและเซสชัน (A34) **[รอยืนยันตัวเลขและแพ็กเกจ Q6]**

| หัวข้อ | ค่า |
|---|---|
| วิธีเข้าสู่ระบบ | อีเมล + รหัสผ่าน · หรือ `staff_code` (`ST-NNNN`) + รหัสผ่านผ่าน Edge Function `staff-code-login` (ทำ password grant ฝั่ง server คืน session เท่านั้น **ไม่คืนอีเมล** · ข้อความผิดพลาดเหมือนกันทุกกรณี) · Google/Microsoft ข้อ 9.2.1 |
| Public sign-up | ปิด (Dashboard "Allow new users to sign up" = off · CLI `[auth] enable_signup = false`) + Before User Created hook อนุญาตเฉพาะอีเมลที่มีแถว `core.staff_invitations` |
| รหัสผ่าน | ≥ 12 ตัวอักษร · เปิด leaked password protection · เปิด Secure password change · **ไม่มีกติกา "ห้ามซ้ำ 5 ครั้ง"** (บังคับไม่ได้บน Supabase Auth · D43) |
| MFA | TOTP · บังคับตาม `roles.requires_mfa` (ข้อ 7) · ผู้ใช้บทบาทนี้ที่ aal1 ได้สิทธิ์เท่ากับไม่มีบทบาท → UI บังคับยืนยัน MFA หลังล็อกอิน · ถ้ายังไม่มี factor บังคับลงทะเบียนก่อน |
| เข้าผิด | **Team plan:** Password Verification Attempt hook ล็อกตาม (บัญชี, IP) · **Pro plan:** นับใน Server Action/`staff-code-login` (best-effort เพราะเรียก `/auth/v1/token` ตรงได้) · จำกัดต่อ IP 20 ครั้ง/15 นาที · หน่วงเวลาเพิ่มขึ้นแทนการล็อกบัญชีจากทุกที่ · ถูกล็อกเกิน 3 ครั้ง/วัน → แจ้ง BUSINESS_ADMIN |
| Access token | 15 นาที · refresh token rotation เปิด · reuse interval 10 วินาที |
| Session | idle 2 ชม. · สูงสุด 12 ชม. (Pro ขึ้นไป · ตรวจตอน refresh จึงยาวได้อีก ≤ 15 นาที) |
| อุปกรณ์ counter ใช้ร่วมกัน | ลงทะเบียนใน `core.devices(device_id, branch_id, is_shared_counter)` โดย BRANCH_MANAGER · idle 10 นาที → ล็อกหน้าจอและต้องล็อกอินใหม่ |
| "จดจำฉันไว้" (mockup A01) | จำเฉพาะอีเมล/รหัสพนักงานในช่องกรอก · **ไม่ยืดอายุ session** · ไม่ติ๊กไว้ก่อน · ซ่อนบนอุปกรณ์ counter |
| ลิงก์อีเมล | Supabase ใช้อายุ OTP/ลิงก์ค่าเดียว → ตั้ง 3600 วินาที · คำเชิญอายุ 24 ชม. ตาม `staff_profiles.invite_expires_at` โดย `invite-staff` ออกลิงก์ใหม่ได้ภายในกรอบนี้ |
| ลืมรหัสผ่าน | กรอกอีเมลหรือ `ST-NNNN` → Edge Function `password-reset` ส่งลิงก์ (อายุ 1 ชม.) ไปอีเมลที่ลงทะเบียน เฉพาะบัญชี ACTIVE · ตอบข้อความเดียวกันเสมอ · เพิกถอน session ทั้งหมดหลังตั้งรหัสใหม่ |
| Logout | ล้าง Cache Storage · IndexedDB · sessionStorage · localStorage (ยกเว้น `device_id` และค่าที่ "จดจำ" `login_id`) |
| PWA | service worker **ห้าม** cache route ที่ต้องล็อกอิน และห้าม cache `/rest/v1` `/rpc` `/auth` · response ข้อมูลลูกค้า `Cache-Control: no-store` |
| Cookie | HttpOnly · Secure · SameSite=Lax · CSP แบบ strict |
| บันทึก | เหตุการณ์ล็อกอินทั้งหมด (password · SSO · MFA · refresh · lockout) อยู่ที่ `audit.login_events` แหล่งเดียว · `ip`/`device_id` เป็นข้อมูลประกอบ ห้ามใช้ตัดสินสิทธิ์ |

#### 9.2.1 SSO

Microsoft: Azure แบบ single-tenant ขององค์กร · Google: ยอมรับเฉพาะ `hd` ∈ `app.settings['allowed_sso_domains']` ตรวจใน Custom Access Token Hook · SSO ใช้กับบัญชี `ACTIVE` เท่านั้น (บัญชี INVITED ต้องจบ flow คำเชิญก่อน) · ถ้าองค์กรไม่มี Workspace/M365 → ซ่อนปุ่ม SSO **[รอยืนยัน Q5]**

### 9.3 Helper ตรวจสิทธิ์ (schema `app` · SECURITY DEFINER · STABLE · `SET search_path = ''` · GRANT EXECUTE ให้ authenticated)

| ฟังก์ชัน | คืนค่า |
|---|---|
| `app.current_staff_id()` | `uuid` ของ staff `ACTIVE` ที่ผูก `auth.uid()` · ไม่มี → `NULL` |
| `app.is_aal2()` | `coalesce(auth.jwt()->>'aal','aal1') = 'aal2'` |
| `app.clock()` | นาฬิการายงาน (ข้อ 1.2) |
| `app.scope_branch_ids(p_permission text, p_min_scope core.data_scope)` | `uuid[]` สาขาที่ผู้ใช้มีสิทธิ์นี้ที่ scope **≥** `p_min_scope` (ไม่นับ SYSTEM · assignment ระดับ ORGANIZATION ขยายเป็นทุกสาขาขององค์กร) · ใช้กติกา MFA ข้อ 8.0 · `p_min_scope = 'OWN'` = สาขาที่มีสิทธิ์นี้ที่ scope ใดก็ได้ |
| `app.team_member_staff_ids(p_permission text)` | `uuid[]` สมาชิกทีมที่ผู้ใช้เป็นหัวหน้า ในสาขาที่สิทธิ์นี้เป็น scope TEAM |
| `app.has_permission(p_permission text)` | มีสิทธิ์นี้ในบางขอบเขตหรือไม่ (ใช้ซ่อนปุ่ม/ตรวจใน RPC) |
| `app.customer_ids_in_scope(p_permission text)` | `SETOF uuid` ลูกค้าที่ผ่านสิทธิ์นี้ตามข้อ 8.0 |
| `app.readable_customer_ids()` | `= app.customer_ids_in_scope('customer.read')` |
| `app.can_access_record(p_permission, p_branch_id, p_owner_staff_id, p_created_by)` | ตัดสินแถวเดียว **ใช้ใน trigger และ RPC เท่านั้น ห้ามใช้ใน policy** |
| `app.can_access_customer(p_permission, p_customer_id)` | ตัดสินลูกค้ารายเดียว **ใช้ใน trigger และ RPC เท่านั้น** |
| `app.staff_has_branch_assignment(p_staff_id, p_branch_id)` | boolean · ใช้ใน trigger/RPC เท่านั้น |
| `app.team_scope_pairs(p_permission text)` | `TABLE(branch_id uuid, staff_id uuid)` คู่ (สาขา, สมาชิกทีม) ที่ผู้ใช้เป็นหัวหน้าในสาขานั้นและสิทธิ์นี้เป็น scope TEAM · policy ใช้ `(branch_id, owner_staff_id) IN (SELECT … FROM app.team_scope_pairs(p))` แทนการเทียบสองเงื่อนไขแยกกัน |
| `app.current_organization_id()` | องค์กรของผู้ใช้ (ใช้เป็น DEFAULT ของ `organization_id`) |

### 9.4 รูปแบบ RLS มาตรฐาน (A30)

**กติกา:**
1. เปิด RLS ทุกตารางใน `core` `ref` `crm` (FORCE เปิดได้แต่ไม่ใช่ชั้นป้องกันจริงเพราะ owner = postgres)
2. **ใน policy ห้ามเรียกฟังก์ชันที่รับคอลัมน์ของแถว** — ใช้เฉพาะฟังก์ชันที่ argument เป็นค่าคงที่ ห่อด้วย `(SELECT …)` แล้วเทียบกับคอลัมน์
3. policy ของตาราง X ห้ามอ้างตาราง X (หรือตารางที่อ้าง X กลับ) — ถ้าจำเป็นใช้ฟังก์ชัน DEFINER ที่คืน `SETOF uuid`
4. **ทุก view ในทุก schema** สร้าง `WITH (security_invoker = true)` · ห้าม materialized view ใน schema ที่เปิด API · CI check ต้องคืน 0 แถว
5. ห้าม DELETE ตารางธุรกิจสำหรับ authenticated ยกเว้นตามข้อ 8.3
6. ตารางที่เขียนโดย trigger/RPC เท่านั้น (ไม่มี GRANT INSERT/UPDATE/DELETE): `crm.customers` (INSERT) · `crm.visits` (INSERT) · `crm.customer_contacts` · `crm.customer_addresses` · `crm.customer_consents` · `crm.customer_branches` · `crm.lead_status_history` · `crm.opportunity_stage_history` · `crm.ownership_changes` · `crm.customer_merges` · `crm.duplicate_decisions` · `crm.notifications` (INSERT) · `audit.*` · `app.*`
7. คอลัมน์ระบบ (`organization_id` `created_by` `created_at` `updated_by` `updated_at` `*_no` `first_seen_at` `first_channel_code` `first_source_code` `first_branch_id` `lifecycle_stage` `last_activity_at` `last_channel_code` `last_branch_id` `has_open_followup` `has_new_lead` `note_summary` `created_via` `record_status` `merged_into_id` `legal_hold` `expected_amount` `is_visit_root` `is_next_action` `closed_by_system` `queue_no` `outcome_code` `converted_opportunity_id`) ไม่อยู่ใน column grant ของ UPDATE · `legal_hold` เปลี่ยนผ่าน `api.set_legal_hold` · `outcome_code` ผ่าน `api.close_visit` · การแปลง lead ผ่าน `api.convert_lead`

```sql
-- ตัวอย่าง: crm.leads
CREATE POLICY leads_select ON crm.leads FOR SELECT TO authenticated USING (
     branch_id = ANY ((SELECT app.scope_branch_ids('lead.read','BRANCH')))       -- BRANCH และ ORGANIZATION
  OR (branch_id = ANY ((SELECT app.scope_branch_ids('lead.read','TEAM')))
      AND owner_staff_id = ANY ((SELECT app.team_member_staff_ids('lead.read'))))
  OR (branch_id = ANY ((SELECT app.scope_branch_ids('lead.read','OWN')))
      AND coalesce(owner_staff_id, created_by) = (SELECT app.current_staff_id()))
  OR customer_id IN (SELECT app.readable_customer_ids())                          -- read-through (Customer 360)
);
CREATE POLICY leads_insert ON crm.leads FOR INSERT TO authenticated WITH CHECK (
  customer_id IN (SELECT app.customer_ids_in_scope('lead.create'))
  AND branch_id = ANY ((SELECT app.scope_branch_ids('lead.create','OWN')))
);
CREATE POLICY leads_update ON crm.leads FOR UPDATE TO authenticated
  USING (<รูปเดียวกับ select ด้วย 'lead.update' ไม่มี read-through>)
  WITH CHECK (<เหมือน USING> AND customer_id IN (SELECT app.readable_customer_ids()));

-- crm.customers (INSERT…RETURNING ผ่าน quick_capture ซึ่งเป็น DEFINER)
CREATE POLICY customers_select ON crm.customers FOR SELECT TO authenticated
  USING (id IN (SELECT app.readable_customer_ids()));
```

- ตัวอย่างนี้แสดงรูปแบบ ไม่ใช่ข้อความ SQL สุดท้าย · ผู้เขียน migration ต้องให้ผลตรงข้อ 8.0 และผ่าน test ข้อ 13.13
- `crm.visits` **รับคิว** (ข้อ 4.1) เป็น clause แยกใน `visits_update`: `OR (status = 'WAITING' AND owner_staff_id IS NULL AND branch_id = ANY ((SELECT app.scope_branch_ids('visit.update','OWN'))))` และ WITH CHECK ต้องได้ `owner_staff_id = (SELECT app.current_staff_id())`
- **read-through ผ่านลูกค้า** ใช้กับ `visits` `interactions` `leads` `opportunities` `opportunity_items` `quotations` `quotation_items` `transaction_refs` `customer_notes` เท่านั้น · **`tasks` และ `task_comments` ไม่มี read-through** (ใช้ `task.read` อย่างเดียว) · Customer 360 แสดง "นัดติดตามถัดไป" จาก next action ของ lead/opportunity แทน
- ลูกค้า `ANONYMIZED` ยังผ่าน RLS ได้ (ไม่มี PII แล้ว) · UI ซ่อนจากรายการด้วยตัวกรอง
- `audit.*` ไม่มี GRANT ให้ authenticated · อ่านผ่าน `api.search_audit` · `api.get_entity_history`

#### 9.4.1 KPI และรายงาน

KPI/Dashboard/รายงานให้บริการผ่าน RPC SECURITY DEFINER เท่านั้น: `api.get_kpis(p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_group_by text)` · `api.get_report(p_code text, p_preset text, p_start date, p_end date, p_branch_ids uuid[], p_params jsonb)`
- `p_preset` ∈ รหัสข้อ 12.0 · ช่วงปัจจุบันและช่วงเปรียบเทียบคำนวณจาก `p_preset` (ถ้า `CUSTOM` ใช้ `p_start`/`p_end`) · `p_group_by` ∈ `NONE` `BRANCH` `TEAM` `STAFF` `CHANNEL` `STATUS`
- เมื่อผู้เรียกมีเพียง scope TEAM/OWN: KPI ที่ข้อ 12.4 ไม่มีการผูกพนักงาน (`–`) คืน `NULL` และหน้าจอแสดง `–` · อัตราที่ตัวตั้งหรือตัวหารเป็น `NULL` คืน `NULL`
- ตรวจ `dashboard.view` หรือ `report.view` (`report.staff_performance` สำหรับรายงานรายพนักงาน) → ตัด `p_branch_ids` ด้วยสาขาของสิทธิ์นั้น → scope `TEAM`/`OWN` กรองตาม owner ที่ผูกไว้ในข้อ 12.4
- คืนเฉพาะตัวเลขรวม ไม่มี `customer_id` ชื่อ หรือเบอร์ · รวมลูกค้า `ANONYMIZED` และ `MERGED` (นับที่ survivor) เสมอ
- view ใน `analytics` ใช้ภายใน RPC เท่านั้น · drill-down ถึงรายชื่อลูกค้าเปิดหน้ารายการลูกค้าด้วยตัวกรอง ซึ่งผ่าน RLS ปกติ

#### 9.4.2 สิทธิ์ที่ขึ้นกับการเปลี่ยนแปลง — `app.enforce_row_transition()` (BEFORE UPDATE · SECURITY INVOKER)

ติดทุกตาราง `customers` `visits` `interactions` `leads` `opportunities` `quotations` `tasks` ทั้ง **BEFORE INSERT และ BEFORE UPDATE** (INSERT ตรวจสถานะเริ่มต้นที่อนุญาตและ owner ที่ไม่ใช่ตนต้องมี `*.assign`) · ลำดับ BEFORE trigger: `trg_05_running_number` → `trg_10_enforce_transition` → `trg_20_guard_text` → `trg_90_stamp_row` · ข้ามเมื่อ `current_user <> 'authenticated'` (service_role/งานระบบ) · mapping คอลัมน์→สิทธิ์ฉบับเต็มอยู่ใน `docs/04-security/rls-spec.md` และมี test ทุกแถว

| การเปลี่ยน | ต้องมี |
|---|---|
| visit `WAITING → IN_SERVICE` ที่ owner เดิมว่างและ owner ใหม่ = ผู้กด | ข้อ 4.1 เท่านั้น (ไม่ต้องมี assign) |
| `owner_staff_id` หรือ `team_id` เปลี่ยน (**ทำผ่าน `api.assign_owner` เท่านั้น** เพื่อส่งเหตุผล · คอลัมน์ owner ไม่อยู่ใน column grant ของ UPDATE ยกเว้นการรับคิวของ visit) | lead/opportunity/task ใช้ `*.assign` · ลูกค้าใช้ `customer.assign` · visit ใช้ `visit.update` scope T/B · interaction/quotation **เปลี่ยน owner ไม่ได้** · owner ใหม่ต้องมี assignment ในสาขาของแถว (`app.staff_has_branch_assignment`) · บันทึก `ownership_changes` |
| `branch_id` เปลี่ยน (lead/opportunity/task เท่านั้น · visit/interaction เปลี่ยนไม่ได้) | `*.assign` ทั้งสาขาต้นทางและปลายทาง · บันทึก `ownership_changes` เหตุผล `BRANCH_TRANSFER` |
| stage/status → `WON`/`LOST` | `opportunity.close` (lead ใช้ `lead.update`) |
| ออกจาก `WON`/`LOST`/`CONVERTED` | `opportunity.reopen` / `lead.reopen` |
| quotation ที่ `status <> 'DRAFT'` | เปลี่ยนได้เฉพาะ `status` |
| interaction ที่ `created_at < now() − 24 ชม.` | ปฏิเสธทุกการแก้ |
| visit รับคิว | ข้อ 4.1 |
| คอลัมน์ระบบ (ข้อ 9.4 กติกา 7) | ปฏิเสธเสมอ |

### 9.5 Audit (A32 · B21)

`audit.audit_logs` — append-only

คอลัมน์: `id bigint identity` · `occurred_at` · `organization_id` · `actor_type` · `actor_staff_id` · `actor_staff_code` · `actor_label` (เช่น `SYSTEM:close_stale_visits`) · `actor_roles text[]` · `aal` · `action` · `entity_type` · `entity_id` · `entity_ref` · `branch_id` · `before jsonb` · `after jsonb` · `changed_fields text[]` · `reason` · `ip` · `user_agent` · `device_id` · `request_id`

- `before`/`after` = **ภาพทั้งแถว** (ปิดบัง PII) · `changed_fields` = คอลัมน์ที่เปลี่ยน · `entity_id` เป็น `text` · `entity_type` ∈ `CUSTOMER` `CONTACT` `ADDRESS` `NOTE` `CONSENT` `VISIT` `INTERACTION` `LEAD` `OPPORTUNITY` `QUOTATION` `TASK` `TRANSACTION_REF` `STAFF` `ROLE_ASSIGNMENT` `ROLE_GRANT_REQUEST` `TEAM` `EXPORT` `DSR` `SETTING` `REF` `DUPLICATE_DECISION`
- เมื่อ Edge Function เขียนด้วย service_role: เรียก `api.svc_*` ซึ่งตั้ง `set_config('app.actor_staff_id', <sub จาก JWT ที่ verify แล้ว>, true)` และ trigger ใช้ค่านี้เมื่อ `auth.role() = 'service_role'`
- trigger `audit.log_row_change()` (SECURITY DEFINER) ติด **INSERT/UPDATE/DELETE** บนตารางใน `crm` `core` `ref` **ยกเว้น** `crm.notifications` · `crm.lead_status_history` · `crm.opportunity_stage_history` · `crm.ownership_changes` · `crm.customer_branches`
- ไม่บันทึกเมื่อคอลัมน์ที่เปลี่ยนมีแค่ `updated_at` `updated_by` `last_activity_at` `last_channel_code` `last_branch_id` `has_open_followup` `has_new_lead` `lifecycle_stage` `first_seen_at` `note_summary`
- **คอลัมน์ที่ data dictionary ติดป้าย `pii` บันทึกเป็นค่าปิดบัง + hash** `{"masked":"081-XXX-1234","sha256":"…"}` ไม่เก็บค่าเต็ม · การกู้ข้อมูลใช้ PITR ไม่ใช้ audit · `crm.customer_merges.snapshot` ใช้กติกาเดียวกัน
- `actor_type`: `STAFF` จาก `app.current_staff_id()` · `SYSTEM` งานตามเวลา · `INTEGRATION` · `aal` จาก JWT
- `ip` `user_agent` `device_id` `request_id` อ่านจาก `current_setting('request.headers', true)::jsonb` คีย์ `x-client-ip` `x-client-ua` `x-device-id` `x-request-id` ที่ Next.js ส่งต่อ (ถือเป็นค่า "ที่รายงาน" ไม่ใช่หลักฐาน)
- REVOKE UPDATE/DELETE/TRUNCATE จากทุก role · trigger `audit.deny_change()` ปฏิเสธ UPDATE/DELETE/TRUNCATE ยกเว้น DELETE เมื่อ `current_user = 'audit_retention'` (งาน retention รัน `SET ROLE audit_retention`) และ UPDATE คอลัมน์ `before`/`after` เมื่อ `app.audit_redaction = 'on'` (ใช้โดย `app.anonymize_customer`)
- action ตั้งชื่อ `{ENTITY}_{VERB}`: `CUSTOMER_CREATED` `CUSTOMER_UPDATED` `CUSTOMER_CONTACT_UPDATED` `CUSTOMER_TAG_REMOVED` `CUSTOMER_MERGED` `CUSTOMER_ANONYMIZED` `LEAD_ASSIGNED` `OPPORTUNITY_WON` `ROLE_GRANTED` `ROLE_REVOKED` `ROLE_GRANT_REQUESTED` `ROLE_GRANT_DECIDED` `PERMISSION_CHANGED` `STAFF_INVITED` `STAFF_UPDATED` `STAFF_DISABLED` `MFA_ENROLLED` `MFA_RESET` `SETTINGS_UPDATED` `INTEGRATION_UPDATED` `EXPORT_REQUESTED` `EXPORT_DECIDED` `EXPORT_DOWNLOADED` `REPORT_EXPORTED` `CONSENT_RECORDED` `DSR_CREATED` `DSR_COMPLETED`
- `audit.access_logs` (ไม่เก็บค่า PII · เก็บ `contact_id`/hash): `CUSTOMER_VIEWED` · `CONTACT_REVEALED` · `CUSTOMER_CANDIDATE_SEARCH` · `CUSTOMER_SEARCH` · `CUSTOMER_LINKED_TO_BRANCH`
- `audit.login_events` · `audit.export_requests` · `audit.integration_logs`
- `security_log.read` คืนเฉพาะ `login_events` + `audit_logs` ที่ action ∈ {`ROLE_*` `PERMISSION_CHANGED` `STAFF_*` `MFA_*` `SETTINGS_UPDATED` `INTEGRATION_UPDATED`} · ไม่คืน access_logs หรือรายการที่ `entity_type` เป็นลูกค้า
- ใครดูได้: หน้า Audit (`audit.read`) · แท็บประวัติการแก้ไขของลูกค้ารายนั้น (`customer.update` บนลูกค้า) · ทุกทางคืนค่าปิดบังจากฐานข้อมูล

### 9.6 ฟังก์ชันของระบบ (ทุกตัว owner = postgres · `SET search_path = ''` · ตรวจสิทธิ์บรรทัดแรก)

**RPC ที่หน้าจอเรียก (schema `api` · GRANT EXECUTE ให้ authenticated)**

| ฟังก์ชัน | security | volatility | ต้องมี |
|---|---|---|---|
| `api.quick_capture(p jsonb)` | DEFINER | VOLATILE | `customer.create` (+ `visit.create` เมื่อเปิด visit) |
| `api.search_customers(p_term)` | DEFINER | VOLATILE | ผู้ใช้ ACTIVE · อัตรา |
| `api.find_customer_candidates(...)` | DEFINER | VOLATILE | `customer.create` · ข้อ 6.5 |
| `api.link_customer_to_branch(p_customer_id, p_visit_id)` | DEFINER | VOLATILE | ข้อ 6.6 |
| `api.get_customer_360(p_customer_id)` | DEFINER | VOLATILE | `customer.read` · เขียน `CUSTOMER_VIEWED` |
| `api.reveal_contact(p_contact_id, p_purpose)` | DEFINER | VOLATILE | `customer.pii.reveal` |
| `api.save_contact(...)` · `api.save_address(...)` | DEFINER | VOLATILE | `customer.update` |
| `api.record_consent(...)` | DEFINER | VOLATILE | `customer.consent.manage` |
| `api.merge_customers(...)` · `api.decide_duplicate(...)` | DEFINER | VOLATILE | `customer.merge` 🔐 |
| `api.get_kpis(p_preset, p_start, p_end, p_branch_ids, p_group_by)` · `api.get_report(p_code, p_preset, p_start, p_end, p_branch_ids, p_params)` | DEFINER | STABLE | `dashboard.view` / `report.view` |
| `api.request_export(...)` · `api.decide_export(...)` · `api.record_export_download(...)` | DEFINER | VOLATILE | ข้อ 8.2 |
| `api.search_audit(...)` · `api.get_entity_history(...)` | DEFINER | STABLE | `audit.read` / `customer.update` บนลูกค้า |
| `api.can_assign_role(...)` | DEFINER | STABLE | – (คืน true/false) |
| `api.assign_role(...)` · `api.revoke_role(...)` | DEFINER | VOLATILE | `role.assign` 🔐 |
| `api.request_role_grant(...)` · `api.decide_role_grant(...)` | DEFINER | VOLATILE | `role.request` / `role.decide` 🔐 |
| `api.disable_staff(...)` | DEFINER | VOLATILE | `user.disable` 🔐 |
| `api.activate_self()` | DEFINER | VOLATILE | ผู้ใช้ INVITED ของตนเอง |
| `api.create_dsr(...)` · `api.build_dsr_package(...)` · `api.anonymize_customer(...)` | DEFINER | VOLATILE | `dsr.create` / `dsr.manage` 🔐 / `customer.anonymize` 🔐 |
| `api.set_legal_hold(p_customer_id, p_on, p_reason)` | DEFINER | VOLATILE | `dsr.manage` 🔐 |
| `api.open_visit(p jsonb)` · `api.close_visit(p_visit_id, p_outcome_code, p jsonb)` | DEFINER | VOLATILE | `visit.create` / `visit.update` · สร้าง interaction ต้นทาง (ข้อ 3.3) และบังคับผลของ outcome (ข้อ 4.2) |
| `api.convert_lead(p_lead_id, p jsonb)` | DEFINER | VOLATILE | `lead.update` บน lead **และ** `opportunity.create` ประเมินกับ lead |
| `api.list_data_quality_issues(p_issue_code, p_branch_ids)` | DEFINER | STABLE | `data_quality.view` |
| `api.search_security_log(...)` | DEFINER | STABLE | `security_log.read` |
| `api.list_staff(...)` · `api.update_staff(...)` | DEFINER | STABLE / VOLATILE | `user.read` / `user.update` |
| `api.save_team(...)` · `api.set_team_member(...)` | DEFINER | VOLATILE | `team.manage` |
| `api.update_setting(p_key, p_value)` | DEFINER | VOLATILE | `settings.business` / `settings.system` ตาม `editable_by` |
| `api.get_my_access()` | DEFINER | STABLE | ผู้ใช้ที่เข้าสู่ระบบ · คืนโปรไฟล์ของตน บทบาท/สาขา `(permission_code, scope, branch_id, requires_aal2)` `requires_mfa` และ aal ปัจจุบัน (ใช้สร้างเมนูและซ่อนปุ่ม) |
| `api.assign_owner(p_entity_type, p_entity_id, p_to_staff_id, p_reason_code, p_note, p_to_branch_id)` | DEFINER | VOLATILE | `*.assign` / `customer.assign` ตามข้อ 9.4.2 |
| `api.acknowledge_unrecorded_visit(p_visit_id)` | DEFINER | VOLATILE | `visit.update` (ตั้ง `visits.unrecorded_ack_by/_at`) |
| `api.list_export_requests(...)` · `api.list_role_grant_requests(...)` · `api.get_settings()` · `api.list_integration_logs(...)` · `api.list_dsr(...)` | DEFINER | STABLE | `customer.export`/`export.approve` · `role.request`/`role.decide`/`user.read` · `settings.*` · `integration.manage` · `dsr.manage` |
| `api.update_dsr(p_dsr_id, p_status, p jsonb)` | DEFINER | VOLATILE | `dsr.manage` 🔐 |
| `api.record_report_export(p_code, p_params)` | DEFINER | VOLATILE | `report.export` · เขียน `REPORT_EXPORTED` |
| `api.register_device(p_device_id, p_branch_id, p_is_shared_counter)` | DEFINER | VOLATILE | `user.update` scope B ของสาขานั้น |
| `api.reveal_address(p_address_id, p_purpose)` | DEFINER | VOLATILE | `customer.pii.reveal` |

**RPC สำหรับ Edge Function เท่านั้น (schema `api` · ชื่อขึ้นต้น `svc_` · GRANT EXECUTE ให้ `service_role` เท่านั้น · ตรวจ `auth.role() = 'service_role'` บรรทัดแรก):** `api.svc_build_export_dataset(p_export_id)` · `api.svc_mark_export_generated(p_export_id, p_file_path)` · `api.svc_prepare_invite(...)` · `api.svc_finalize_disable(...)` · `api.svc_resolve_staff_code(p_staff_code)` (คืน user_id ภายในฟังก์ชัน Edge เท่านั้น ห้ามส่งอีเมลออก) · `api.svc_reset_mfa_authorize(...)` · `api.svc_expired_export_files()`

**ภายใน (schema `app` · ไม่ GRANT ให้ authenticated นอกจาก helper ข้อ 9.3)**
trigger: `audit.log_row_change` · `audit.deny_change` · `app.trg_assign_running_number` · `app.trg_write_status_history` · `app.trg_write_ownership_change` · `app.trg_link_customer_branch` · `app.trg_touch_customer_activity` · `app.trg_refresh_lifecycle` · `app.trg_sync_next_action_task` · `app.trg_emit_notification` · `app.enforce_row_transition` (INVOKER) · `app.trg_guard_restricted_text`
งานระบบ (เรียกโดย cron ด้วย service_role): `app.job_close_stale_visits(p_as_of)` · `app.job_notifications(p_as_of)` · `app.job_expire_quotations(p_as_of)` · `app.job_retention(p_as_of)` · `app.job_expire_exports(p_as_of)`
อื่น ๆ: `app.refresh_customer_lifecycle` · `app.build_export_dataset` · `app.rate_limit_hit`

migration ที่เรียก `cron.schedule` แยกไฟล์ `supabase/migrations/*_cron.sql` (PGlite runner ข้าม) · pg_cron รันในฐานข้อมูลในฐานะ `postgres` · ตารางเวลา (Asia/Bangkok → cron UTC): `job_close_stale_visits` 00:05 (`5 17 * * *`) · `job_expire_quotations` 00:10 (`10 17 * * *`) · `job_retention` 02:00 (`0 19 * * *`) · `job_expire_exports` ทุกชั่วโมงนาทีที่ 15 (`15 * * * *`) · `job_notifications` ทุก 5 นาที (`*/5 * * * *`) · การลบไฟล์ใน Storage ทำโดย Edge Function `cron-export-cleanup` ที่อ่าน `api.svc_expired_export_files()` **[รอยืนยัน]**

### 9.7 Environment · Backup (A35 · A36 · B24) **[รอยืนยัน]**

| หัวข้อ | ค่า |
|---|---|
| Environment | `dev` · `staging` · `prod` = Supabase project แยก 3 project · secret แยก · `app.settings['env']` บังคับตรง |
| ข้อมูลใน dev/staging | seed สังเคราะห์ (`supabase/seed.sql`) เท่านั้น · หรือสำเนา prod ที่ผ่านขั้นตอนด้านล่าง |
| สำเนา prod เพื่อทดสอบ | restore ไป project แยก region เดียวกัน → รัน `tools/db/anonymize.sql` (ครอบคลุม `crm.*` · truncate `audit.*` · อีเมลใน `auth.users` เป็น `@example.com` · truncate `login_events`) → สคริปต์ตรวจว่าไม่พบเบอร์/อีเมลจริง → dump → ลบ project ภายใน 24 ชม. · บันทึกผู้ทำใน runbook |
| Backup | Supabase daily backup + **PITR 7 วัน** (prod) · logical dump รายสัปดาห์ **เข้ารหัสฝั่งต้นทาง** (age/GPG · กุญแจถือโดยคนที่ไม่ใช่ผู้ดูแล storage) ไป storage ที่เปิด versioning/object lock เก็บ 90 วัน · ทบทวนรายชื่อผู้เข้าถึงทุกไตรมาส |
| Restore test | ทุกเดือน restore ไป project ทดสอบ: (A) ตรวจความครบของข้อมูลจริง (จำนวนแถว · เลขอ้างอิงสูงสุดก่อนเวลา T · invariant) (B) ล้างข้อมูลแล้วโหลด `seed.sql` รัน `acceptance.sql` + `rls_*.sql` ต้องผ่าน · ลบ project ภายใน 24 ชม. · บันทึกผล |
| เป้าหมาย | RPO ≤ 5 นาที · RTO ≤ 4 ชม. |
| Monitoring | แจ้งเมื่อ backup ล้มเหลว · พื้นที่ DB > 80% · error rate RPC > 2% |
| สิทธิ์ Supabase organization Owner/Admin ของ prod | บุคคลที่ระบุชื่อ ≤ 2 คน ใช้แบบ break-glass มีบันทึกเหตุผล **[รอยืนยัน Q25]** |

### 9.8 service_role และ Edge Functions

service_role ใช้ได้เฉพาะ Edge Functions: `invite-staff` · `disable-staff` · `reset-mfa` · `staff-code-login` · `password-reset` · `generate-export` · `integration-*` · `cron-*`
ทุกฟังก์ชันที่มีผู้เรียกเป็นผู้ใช้ต้อง (1) verify JWT (2) เรียก RPC ตรวจสิทธิ์ด้วย **JWT ของผู้เรียก** ก่อนใช้ service_role (3) ไม่รับ actor/staff_id จาก body (4) เขียน audit ด้วย actor จาก JWT · service_role key อยู่ใน secret ของ Edge Function เท่านั้น ห้ามอยู่ใน Next.js หรือมนุษย์ถือ · Edge Function เรียกฐานข้อมูลผ่าน `api.svc_*` (ไม่ใช้ connection string ตรง) · bucket `exports` ไม่มี storage policy ให้ authenticated · signed URL 60 วินาทีออกโดย `generate-export` หลัง `api.record_export_download` สำเร็จด้วย JWT ของผู้ขอเท่านั้น

---

## 10. ข้อมูลส่วนบุคคลและ PDPA (A31 · B23)

> ส่วนนี้เป็นการออกแบบระบบ **ไม่ใช่คำแนะนำทางกฎหมาย** ทุกข้อที่มีป้าย [รอยืนยัน DPO] ต้องให้ DPO/ที่ปรึกษากฎหมายตรวจก่อนใช้งานจริง

### 10.1 ระดับชั้นข้อมูล

| ระดับ | ตัวอย่างในระบบนี้ | การควบคุม |
|---|---|---|
| Public | ชื่อแคมเปญที่ประกาศแล้ว · ชื่อสาขา | – |
| Internal | ตัวเลข Dashboard รวม · master data · ชื่อพนักงาน | ต้องเข้าสู่ระบบ |
| Confidential | โปรไฟล์ลูกค้า · ช่องทางติดต่อ · timeline · โน้ต · ยอดซื้อ · IMEI | RLS ข้อ 8 · column grant + reveal · access log · ป้าย `pii` ใน data dictionary |
| Restricted | เลขบัตรประชาชน · สำเนาบัตร · สัญญาผ่อน · เอกสารรายได้ | schema `restricted` · **ปิดใช้งานใน V1** · ไม่เก็บใน CRM |

- V1 **ไม่มีการอัปโหลดไฟล์ของลูกค้า** · แท็บเอกสารตามข้อ 6.8
- trigger `app.trg_guard_restricted_text` บนคอลัมน์ข้อความอิสระ (`customer_notes.body` · `interactions.summary` · `tasks.title/description` · `task_comments.body` · `leads/opportunities.next_action` `lost_note` · `quotations.terms_note`) **ปฏิเสธข้อความที่มีเลข 13 หลักรูปแบบเลขบัตรประชาชนไทยที่ checksum ถูกต้อง**

### 10.2 ประกาศความเป็นส่วนตัวและความยินยอม **[รอยืนยัน DPO]**

| purpose | ป้ายไทยบนฟอร์ม | ฐานที่ออกแบบไว้ | ค่าเริ่มต้น |
|---|---|---|---|
| `PRIVACY_NOTICE` | แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว | สัญญา/ประโยชน์โดยชอบด้วยกฎหมาย (บันทึกว่า "แจ้งแล้ว" ไม่ใช่ขอความยินยอม) | **บังคับ** |
| `MARKETING` | ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ) | ความยินยอม | **ไม่ติ๊กไว้ก่อน** · เลือกช่องทาง `LINE` `SMS` `PHONE` `EMAIL` |

- `crm.customer_consents` **append-only** (ไม่มี UPDATE/DELETE · ไม่มีคอลัมน์ `withdrawn_at` · ถอน = แถวใหม่ `WITHDRAWN`): `customer_id` · `purpose_code` · `status` · `notice_version` (เช่น `PN-2026-01`) · `channels text[]` · `captured_via` · `captured_by` · `captured_at` · `evidence text NOT NULL` (version + ช่องทาง + ข้อความ/ลิงก์ที่ส่ง)
- สถานะปัจจุบัน = แถวล่าสุดต่อ purpose (view `crm.customer_consent_current` · security_invoker)
- ช่องทางออนไลน์/โทร: `PRIVACY_NOTICE` บันทึกได้เมื่อส่งลิงก์ประกาศแล้ว (`captured_via = 'LINK_SENT'`)
- `MARKETING` บังคับติ๊กเพิ่ม "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม"
- ถ้า JAUNPHONE กับ JAUN POWER MONEY เป็นคนละนิติบุคคล (Q17): แยก purpose `MARKETING_JAUNPHONE` · `MARKETING_JPM` และระบุ `controller_entity`

### 10.3 ระยะเวลาเก็บ **[รอยืนยัน DPO]**

| ข้อมูล | เก็บ | เมื่อครบ |
|---|---|---|
| ลูกค้าที่ไม่เคยซื้อและไม่มีกิจกรรม | 24 เดือนนับจาก `last_activity_at` | anonymize (แจ้ง BUSINESS_ADMIN ล่วงหน้า 30 วัน) · ข้ามถ้า `legal_hold` |
| ลูกค้าที่เคยซื้อ | 10 ปีนับจากธุรกรรมล่าสุด | anonymize · ข้ามถ้า `legal_hold` |
| Visit ที่ไม่ผูกลูกค้า | เก็บไว้ (ไม่มี PII) | – |
| `audit.audit_logs` | 5 ปี | ลบโดย role `audit_retention` |
| `audit.access_logs` · `audit.login_events` | 1 ปี (ไม่ต่ำกว่า 90 วันตาม พ.ร.บ.คอมพิวเตอร์) | ลบ |
| ไฟล์ export | 24 ชม. | ลบไฟล์ · เก็บ metadata ตาม audit |
| backup | PITR 7 วัน · dump 90 วัน | หมดไปตามรอบ · ระบุในประกาศความเป็นส่วนตัว |

### 10.4 คำขอของเจ้าของข้อมูล (DSR) และการทำข้อมูลนิรนาม **[รอยืนยัน DPO]**

`crm.data_subject_requests(request_no, customer_id NULL ได้, requester_name, requester_contact_masked, request_type, status, received_at, received_by, due_at = received_at + 30 วัน, verification_method, verified_by, extended_until, extension_reason, completed_at, note)`
- `verification_method`: `IN_PERSON_ID_SIGHTED` เห็นบัตรต่อหน้า · `OTP_TO_REGISTERED_CONTACT` · `OTHER` — **ห้ามเก็บสำเนาบัตร**
- รับคำขอที่หน้าร้าน: `dsr.create` (ST/SV/BM) · ดำเนินการ: `dsr.manage` (BA)
- `ACCESS`/`PORTABILITY` → `api.build_dsr_package(dsr_id)` สร้างไฟล์ JSON/CSV ของลูกค้ารายเดียว (ไม่ผ่านเพดาน export)
- `WITHDRAW_CONSENT`/`OBJECTION` → เขียน consent `WITHDRAWN` และตัดออกจาก campaign members และ export ที่ยังไม่สร้างไฟล์
- `DELETION` → `api.anonymize_customer(customer_id, dsr_id)`:
  - ต้องมี DSR สถานะ `VERIFIED` ที่ `verified_by` ≠ ผู้ดำเนินการ (หรือเรียกจากงาน retention · actor `SYSTEM:retention`) · ข้ามถ้า `legal_hold` · ≤ 20 รายการ/วัน/ผู้ใช้
  - `first_name = 'ลูกค้านิรนาม ' || customer_no` · `last_name` `nickname` `province_code` = NULL · ลบ contacts/addresses · ล้างคอลัมน์ `pii` ทุกตารางที่อ้างลูกค้า (โน้ต · summary · title · next_action · lost_note · `transaction_refs.summary` `device_imei` `device_serial` · `notifications.title/body` · snapshot ของ merge · `duplicate_decisions.override_note` · `customer_consents.evidence`)
  - ตั้ง `app.audit_redaction = 'on'` แล้วแทนค่าใน `audit.audit_logs.before/after` ของลูกค้านั้นเป็น `"[ANONYMIZED]"`
  - คง visit/lead/opportunity/transaction ref (ไม่มี PII) → **KPI ย้อนหลังไม่เปลี่ยน** · `record_status = 'ANONYMIZED'` · บันทึก `CUSTOMER_ANONYMIZED`

---

## 11. การแจ้งเตือน (A27 · B9)

### 11.1 รายการแจ้งเตือน

| code | ป้ายไทย (title) | เงื่อนไข | ผู้รับ | ช่องทาง |
|---|---|---|---|---|
| `FOLLOWUP_DUE` | ถึงเวลาติดตามลูกค้า | task `FOLLOW_UP` ถึง `remind_at` | owner | in-app + push |
| `FOLLOWUP_OVERDUE` | ติดตามเกินกำหนด | task `FOLLOW_UP` ยังไม่ปิดเมื่อ `due_at` ผ่าน | owner · +24 ชม. หัวหน้าทีมของ owner · +48 ชม. ผู้จัดการสาขา | in-app |
| `TASK_OVERDUE` | งานเกินกำหนด | task ประเภทอื่นเลย `due_at` | owner · +24 ชม. หัวหน้าทีม | in-app |
| `LEAD_UNASSIGNED` | Lead ยังไม่มีผู้รับผิดชอบ | lead เปิดอยู่ไม่มี owner เกิน 15 นาที (ในเวลาทำการ) | SUPERVISOR และ BRANCH_MANAGER ที่ ACTIVE ทุกคนของสาขา lead | in-app + push |
| `LEAD_NOT_CONTACTED` | Lead ยังไม่ถูกติดต่อ | สถานะ `NEW` เกิน 30 นาที (ในเวลาทำการ) | owner · หัวหน้าทีม | in-app |
| `LEAD_ASSIGNED` · `OPPORTUNITY_ASSIGNED` · `TASK_ASSIGNED` | ได้รับมอบหมายรายการใหม่ | owner เปลี่ยนเป็นตน (โดยคนอื่น) | owner ใหม่ | in-app |
| `OPPORTUNITY_STALE` | โอกาสขายไม่มีความเคลื่อนไหว | ไม่มี interaction/การเปลี่ยนขั้น 7 วัน | owner · 14 วันเพิ่มผู้จัดการสาขา | in-app |
| `DUPLICATE_SUSPECTED` | อาจมีลูกค้าซ้ำ | สรุป `duplicate_decisions` PENDING ใหม่ของวัน | SUPERVISOR/BRANCH_MANAGER ของสาขา (18:00) | in-app |
| `VISITOR_WAITING_LONG` | ลูกค้ารอนานเกินไป | visit `WAITING` เกิน 15 นาที | SUPERVISOR และ BRANCH_MANAGER ของสาขา (ในเวลาทำการ) | in-app + push |
| `VISIT_OUTCOME_MISSING` | ยังไม่บันทึกผลการให้บริการ | `IN_SERVICE` เกิน 60 นาที → ผู้รับ · ปิดเป็น `UNRECORDED` → สรุปสิ้นวันให้ผู้จัดการ | ผู้รับ · ผู้จัดการสาขา | in-app |
| `DATA_MISSING` | ข้อมูลลูกค้าไม่ครบ | รายการคุณภาพข้อมูลที่เป็นของตน | owner 09:00 ทุกวัน · ผู้จัดการรายสัปดาห์ | in-app |
| `EXPORT_APPROVAL_REQUIRED` · `EXPORT_DECIDED` | มีคำขอส่งออกรออนุมัติ · คำขอส่งออกได้รับการตัดสินแล้ว | ข้อ 8.2 | ผู้อนุมัติตามกติกา · ผู้ขอ | in-app + email |
| `ROLE_GRANT_APPROVAL_REQUIRED` | มีคำขอมอบบทบาทรออนุมัติ | SYSTEM_ADMIN ยื่นคำขอ | EXECUTIVE ทุกคน (ยกเว้นผู้รับ) | in-app + email |
| `REVEAL_LIMIT_EXCEEDED` · `SEARCH_LIMIT_EXCEEDED` | การเปิดดู/ค้นหาเกินเกณฑ์ | ข้อ 6.4–6.5 | BUSINESS_ADMIN | in-app + email |
| `RETENTION_ANONYMIZE_UPCOMING` | ข้อมูลใกล้ครบระยะเก็บ | ข้อ 10.3 (สรุปรายวันทั้งองค์กร) | BUSINESS_ADMIN | in-app |
| `LOCKOUT_REPEATED` | บัญชีถูกล็อกซ้ำ | ถูกล็อกเกิน 3 ครั้ง/วัน (ข้อ 9.2) | BUSINESS_ADMIN | in-app + email |
| `LINK_LIMIT_EXCEEDED` | ผูกลูกค้าข้ามสาขาเกินเกณฑ์ | เกิน `security.link_per_day` (ข้อ 6.6) | BRANCH_MANAGER ของสาขานั้น | in-app |
| `CUSTOMER_VIEW_LIMIT_EXCEEDED` | เปิดดูลูกค้าจำนวนมาก | เกิน `security.customer_view_per_hour` (**แจ้งเท่านั้น ไม่บล็อก**) | BUSINESS_ADMIN | in-app |
| `EXPORT_READY` | ไฟล์ส่งออกพร้อมดาวน์โหลด | คำขอเปลี่ยนเป็น `GENERATED` | ผู้ขอ | in-app |
| `ROLE_GRANT_DECIDED` | คำขอบทบาทได้รับการตัดสินแล้ว | `api.decide_role_grant` | ผู้ยื่นคำขอ | in-app + email |
| `DSR_DUE_SOON` | คำขอเจ้าของข้อมูลใกล้ครบกำหนด | 7 วันก่อน `due_at` และยังไม่ `COMPLETED`/`REJECTED` | BUSINESS_ADMIN | in-app + email |

- ข้อความเต็ม (มีชื่อลูกค้า) อยู่ใน `crm.notifications` เท่านั้น · push/email ใช้ title + เลขอ้างอิง (เช่น `TK-2026-012508`) + deep link
- body มาตรฐาน: `{ชื่อลูกค้า} · {ชื่องาน/รายการ} · {เวลาครบกำหนด}` เช่น "คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00"
- `dedupe_key = '{code}:{entity_id}:{escalation_level}:{วันที่ Asia/Bangkok ของจุดยึดของรายการ}'` (จุดยึด = `due_at` · `due_at + 24 ชม.` · เวลาที่ lead เริ่มไม่มี owner · วันที่ของสรุป) — **ไม่ใช่วันที่ job รัน** จึงไม่แจ้งซ้ำทุกวัน · UNIQUE(`recipient_staff_id`, `dedupe_key`)
- "ในเวลาทำการ": `LEAD_UNASSIGNED` `LEAD_NOT_CONTACTED` นับเฉพาะนาทีในเวลาทำการและส่งเฉพาะในเวลาทำการ · `VISITOR_WAITING_LONG` นับนาทีปฏิทินและส่งเฉพาะในเวลาทำการ · `business_hours` รองรับคีย์รหัสสาขาทับค่า `default` · ยังไม่มีวันหยุด
- SUPERVISOR เป็นผู้รับได้เมื่อเป็นหัวหน้าทีมในสาขานั้น · การยกระดับไม่ส่งกลับไปที่ owner · ระดับที่ไม่มีผู้รับให้ข้าม · `TASK_ASSIGNED` ไม่ส่งสำหรับ task `is_next_action` · ไม่ส่ง `*_ASSIGNED` เมื่อ `app.bulk = on`
- `DATA_MISSING` สรุปรายสัปดาห์ของผู้จัดการ = วันจันทร์ 09:00
- "หัวหน้าทีม" = หัวหน้าทีมปัจจุบันของ owner · Staff ได้เฉพาะของตน · หัวหน้า/ผู้จัดการได้ของทีม/สาขา (A27)
- สร้างโดย trigger (เหตุการณ์ทันที) และ `app.job_notifications(p_as_of)` ทุก 5 นาที

### 11.2 `app.settings(key text PK, value jsonb, editable_by text, updated_by, updated_at)` **[รอยืนยันค่า]**

| key | ค่าเริ่มต้น | ผู้แก้ |
|---|---|---|
| `env` | `"dev"` / `"staging"` / `"prod"` | SA (`settings.system`) |
| `clock` | `{"as_of": null}` (seed/test: `"2026-09-11T10:24:00+07:00"` · prod ต้อง null) | SA |
| `allowed_sso_domains` | `[]` | SA |
| `business_hours` | `{"default":["10:00","21:00"]}` | BA (`settings.business`) |
| `sla.followup_remind_min` · `sla.lead_unassigned_min` · `sla.lead_not_contacted_min` · `sla.visitor_waiting_min` · `sla.visit_in_service_min` | 15 · 15 · 30 · 15 · 60 | BA |
| `sla.opportunity_stale_days` · `escalation.overdue_hours` | `[7,14]` · `[24,48]` | BA |
| `dq.lead_without_outcome_days` · `dq.won_without_txn_days` · `dq.visit_unrecorded_days` | 14 · 3 · 7 | BA |
| `badge.new_customer_days` · `quotation.valid_days` | 30 · 7 | BA |
| `notify.duplicate_digest_time` · `notify.data_missing_time` | `"18:00"` · `"09:00"` | BA |
| `export.limits` · `export.link_ttl_hours` · `export.max_downloads` | ตามข้อ 8.2 · 24 · 3 | BA |
| `security.reveal_per_hour` · `security.search_per_hour` · `security.search_miss_per_hour` · `security.link_per_day` · `security.customer_view_per_hour` | 30 · 60 · 20 · 10 · 100 | BA |
| `session.shared_counter_idle_min` | 10 | BA |
| `pdpa.current_notice_version` | `"PN-2026-01"` | BA |
| `security.login_ip_per_15min` · `dsr.anonymize_per_day` | 20 · 20 | BA |

---

## 12. สูตร KPI (A20 · A21 · A42 · B16 · B17)

### 12.0 ช่วงเวลาและการเปรียบเทียบ

| preset | ป้ายไทย | ช่วง `[p_start, p_end)` (Asia/Bangkok) | ช่วงเปรียบเทียบ |
|---|---|---|---|
| `TODAY` | วันนี้ | วันนี้ | วันเดียวกันสัปดาห์ก่อน ถึงเวลาเดียวกันของ `app.clock()` |
| `YESTERDAY` | เมื่อวาน | เมื่อวาน | วันเดียวกันสัปดาห์ก่อนเมื่อวาน (ทั้งวัน) |
| `LAST_7_DAYS` | 7 วันล่าสุด | ข้อ 1.2 | 7 วันก่อนหน้าทั้งช่วง |
| `THIS_WEEK` | สัปดาห์นี้ | จันทร์–วันนี้ **[รอยืนยัน Q18 วันเริ่มสัปดาห์]** | ช่วงวันเดียวกันของสัปดาห์ก่อน |
| `LAST_30_DAYS` | **30 วันล่าสุด (ค่าเริ่มต้น)** | ข้อ 1.2 | 30 วันก่อนหน้าทั้งช่วง |
| `THIS_MONTH` | เดือนนี้ | วันที่ 1–วันนี้ | ช่วงวันเดียวกันของเดือนก่อน |
| `LAST_MONTH` | เดือนที่แล้ว | ทั้งเดือน | เดือนก่อนหน้านั้น |
| `THIS_QUARTER` | ไตรมาสนี้ | ไตรมาสปฏิทิน ถึงวันนี้ **[รอยืนยัน Q18 ปีบัญชี]** | ช่วงวันเดียวกันของไตรมาสก่อน |
| `CUSTOM` | กำหนดเอง | ≤ 366 วัน | ช่วงยาวเท่ากันที่จบก่อน `p_start` |

- ป้ายการ์ด **ห้ามเขียน "เดือนนี้"** เว้นแต่ preset = `THIS_MONTH` (mockup ใช้ "เดือนนี้" กับตัวเลขชุด 30 วัน → D27)
- ช่วงที่ยังไม่จบ (รวมวันนี้) เทียบกับช่วงก่อนหน้าทั้งช่วงสำหรับ preset แบบ "N วันล่าสุด" · tooltip บอกว่า "ช่วงปัจจุบันรวมวันนี้ที่ยังไม่จบ"
- `TODAY` เทียบ `[วันเดียวกันสัปดาห์ก่อน 00:00, app.clock() − 7 วัน)` (ขอบบน `<`) · `THIS_WEEK`/`THIS_MONTH`/`THIS_QUARTER` เทียบแบบทั้งวัน ช่วงวันที่ตรงกัน ตัดที่สิ้นเดือนถ้าเดือนก่อนสั้นกว่า · `CUSTOM` ส่ง `p_end` แบบ exclusive (UI ส่งวันที่เลือก + 1)
- `api.get_report` รหัส `p_code`: `OVERVIEW` · `CUSTOMERS` · `SALES` · `CHANNELS` · `STAFF` · `BRANCHES` · `LOST_REASONS` · `DATA_QUALITY`
- prototype เปิดใช้เฉพาะ `TODAY` และ `LAST_30_DAYS` · preset อื่นแสดงแบบปิดพร้อม tooltip "ไม่มีข้อมูลตัวอย่างสำหรับช่วงนี้"

### 12.1 KPI หลัก

ขอบเขต S = สาขาที่ผู้ใช้เลือกและมีสิทธิ์ · visit `CANCELLED` ถูกตัดออกทุกสูตร · ลูกค้า `MERGED` นับที่ survivor · ลูกค้า `ANONYMIZED` นับเสมอ

| code | ชื่อบนหน้าจอ | สูตร |
|---|---|---|
| `VISITS` | ผู้มาติดต่อ (Visitor) | count(visits) `started_at ∈ P` |
| `WALKIN_VISITS` | ลูกค้าเข้าร้าน (Walk-in) | `VISITS` ที่ `channel_code = 'WALK_IN'` |
| `IDENTIFIED_VISITS` | ระบุตัวตนได้ | `VISITS` ที่ `customer_id IS NOT NULL` |
| `UNIQUE_CUSTOMERS` | ลูกค้าไม่ซ้ำ | ข้อ 3.1 |
| `NEW_CUSTOMERS` · `RETURNING_CUSTOMERS` | ลูกค้าใหม่ · ลูกค้าเก่า | ข้อ 3.1 |
| `LEADS` | Leads | count(leads) `created_at ∈ P` |
| `OPPORTUNITIES` | Opportunities | count(opportunities) `created_at ∈ P` |
| `SALES` | ปิดการขาย (Sales) | count(opportunities) `stage='WON'` และ `won_at ∈ P` |
| `SALES_AMOUNT` | ยอดขาย (บาท) | sum(`won_amount`) ของ `SALES` (V1) · Phase 4 เปลี่ยนเป็นยอดจาก transaction ref ของ POS (D-log) |
| `LOST_OPPORTUNITIES` · `LOST_LEADS` · `LOST_TOTAL` | ไม่สำเร็จ | `stage/status='LOST'` และ `closed_at ∈ P` · `LOST_TOTAL` = ผลบวก (ใช้กับกราฟเหตุผล) |
| `BUYERS` · `REPEAT_BUYERS` | ผู้ซื้อ · ผู้ซื้อซ้ำ | ข้อ 3.1 |
| `OPEN_FOLLOWUP_CUSTOMERS` | ลูกค้าที่ต้องติดตาม | ลูกค้าไม่ซ้ำที่มี task `FOLLOW_UP` สถานะ `OPEN`/`IN_PROGRESS` ณ `app.clock()` |
| `OPEN_LEADS` | Lead เปิดอยู่ | count(leads) สถานะ `NEW`/`CONTACTED`/`QUALIFIED` ณ `app.clock()` (แยกสถานะด้วย `p_group_by = 'STATUS'`) |
| `OPEN_OPPORTUNITIES` · `OPEN_PIPELINE_AMOUNT` | โอกาสขายเปิดอยู่ · มูลค่า | stage `INTERESTED`/`QUOTATION`/`FOLLOW_UP` ณ `app.clock()` · sum(`expected_amount`) (แยกขั้นด้วย `STATUS`) |
| `WON_LAST_7_DAYS` · `WON_LAST_7_DAYS_AMOUNT` | ปิดการขาย 7 วัน | `SALES` และ `SALES_AMOUNT` ในช่วง "7 วันล่าสุด" |
| `TASKS_TODAY` · `TASKS_OVERDUE` | งานวันนี้ · เกินกำหนด | ข้อ 4.7 ณ `app.clock()` |
| `OPEN_VISITS` | visit เปิดอยู่ | สถานะ `WAITING`/`IN_SERVICE` ณ `app.clock()` |

### 12.2 อัตรา (ห้ามแสดงคำว่า "Conversion" เดี่ยว ๆ)

| code | ชื่อบนหน้าจอ | สูตร |
|---|---|---|
| `LEAD_RATE` | อัตรา Lead | `LEADS / VISITS` |
| `OPPORTUNITY_RATE` | อัตราโอกาสขาย | `OPPORTUNITIES / LEADS` |
| `CLOSE_RATE` | อัตราปิดการขาย | `SALES / (SALES + LOST_OPPORTUNITIES)` |
| `LOST_RATE` | อัตราไม่สำเร็จ | `LOST_OPPORTUNITIES / (SALES + LOST_OPPORTUNITIES)` |
| `CONV_LEAD_TO_SALE` | Conversion (Lead → ขาย) | `SALES / LEADS` |
| `CONV_VISIT_TO_SALE` | Conversion (ผู้มาติดต่อ → ขาย) | `SALES / VISITS` |
| `WALKIN_CONVERSION` | Walk-in Conversion | `SALES` ที่ `origin_channel_code = 'WALK_IN'` / `WALKIN_VISITS` |
| `CAPTURE_RATE` | อัตราบันทึกตัวตนลูกค้า | `IDENTIFIED_VISITS / VISITS` |
| `REPEAT_RATE` | อัตราซื้อซ้ำ | `REPEAT_BUYERS / BUYERS` |
| `LEAD_RESPONSE_MIN` | เวลาตอบกลับ Lead (มัธยฐาน) | ฐาน = lead ที่ `created_at ∈ P` · `channel_code` เป็นช่องทางข้อความ (`ref.channels.is_live = false`) · `first_contacted_at IS NOT NULL` · ค่า = `round(percentile_cont(0.5) WITHIN GROUP (ORDER BY นาทีปฏิทินจาก created_at ถึง first_contacted_at))` **[รอยืนยัน นาทีปฏิทินหรือนาทีเวลาทำการ]** · แสดงคู่กับ "ยังไม่ติดต่อ N" = lead ช่องทางข้อความที่สร้างใน P และยังไม่มี `first_contacted_at` |
| `FOLLOWUP_COMPLETION` | ติดตามตรงเวลา | ตัวหาร = task `FOLLOW_UP` ที่ `due_at ∈ P` ไม่ `CANCELLED` **ตัดออก**ถ้ายังไม่ `DONE` และ `due_at + 24 ชม. > app.clock()` · ตัวตั้ง = ในตัวหารที่ `DONE` และ `completed_at ≤ due_at + 24 ชม.` |
| `OUTCOME_COMPLETION` | บันทึกผลการให้บริการครบ | visit ที่ `started_at ∈ P` สถานะ `COMPLETED`/`LEFT` และ `outcome_code <> 'UNRECORDED'` / visit ที่ `started_at ∈ P` สถานะ `COMPLETED`/`LEFT` |

> Close Rate: A20 เขียน `Won / Opportunity` ระบบใช้ `Won / (Won + Lost)` เพราะแบบ period-based ตัวหารไม่ได้มาจากกลุ่มเดียวกับตัวตั้ง (D4) · ในข้อมูลตัวอย่างสองสูตรให้ 58.4% เท่ากัน **เฉพาะระดับองค์กร** (รายสาขาไม่เท่า)

### 12.3 คุณภาพข้อมูล (A21 · A40 · B17)

| code | ชื่อบนหน้าจอ | สูตร | เป้าหมาย |
|---|---|---|---|
| `CAPTURE_RATE` | อัตราบันทึกตัวตนลูกค้า | ข้อ 12.2 | ≥ 95% |
| `OUTCOME_COMPLETION` | บันทึกผลการให้บริการครบ | ข้อ 12.2 | ≥ 95% |
| `FOLLOWUP_COMPLETION` | ติดตามตรงเวลา | ข้อ 12.2 | ≥ 90% |
| `DUPLICATE_RATE` | อัตราข้อมูลซ้ำ | count(distinct `duplicate_decisions.customer_id`) ที่ `status='PENDING'` และลูกค้าทั้งสองรายยัง `ACTIVE` / ลูกค้า `ACTIVE` ทั้งหมด | < 2% |
| `MISSING_REQUIRED_RATE` | ข้อมูลจำเป็นไม่ครบ | ลูกค้า `ACTIVE` ไม่ซ้ำที่ติด `MISSING_PHONE` หรือ `INCOMPLETE_CUSTOMER` / ลูกค้า `ACTIVE` ทั้งหมด | < 2% |

รายการในศูนย์คุณภาพข้อมูล (`analytics.data_quality_issues` · อ่านผ่าน RPC ตามสิทธิ์ `data_quality.view` · รายการระดับลูกค้าผูกสาขาด้วย `first_branch_id`)

| issue code | ป้ายไทย | เงื่อนไข | แก้โดย |
|---|---|---|---|
| `DUPLICATE_SUSPECTED` | ลูกค้าอาจซ้ำ | `duplicate_decisions` `PENDING` (นับเป็นแถว) | `customer.merge` 🔐 · ผู้ตัดสิน ≠ ผู้สร้างแถว |
| `MISSING_PHONE` | ไม่มีเบอร์โทร | ลูกค้า `ACTIVE` ไม่มี contact `PHONE` ที่ `is_active` และ `first_channel_code IN ('WALK_IN','PHONE')` | `data_quality.resolve` |
| `INVALID_PHONE` | เบอร์ไม่ถูกต้อง | มี contact `PHONE` ที่ `is_active` และ `is_valid = false` | `data_quality.resolve` |
| `LEAD_WITHOUT_OWNER` | Lead ไม่มีผู้รับผิดชอบ | lead เปิดอยู่ `owner_staff_id IS NULL` | `lead.assign` |
| `LEAD_WITHOUT_OUTCOME` | Lead ค้างไม่มีผล | lead เปิดอยู่ `created_at < app.clock() − 14 วัน` | `lead.update` |
| `OVERDUE_FOLLOWUP` | ติดตามเกินกำหนด | task `FOLLOW_UP` กลุ่ม "เกินกำหนด" (ข้อ 4.7) | `task.update` |
| `INCOMPLETE_CUSTOMER` | ข้อมูลลูกค้าไม่ครบ | ขาด `last_name` **และ** `province_code` **และ** ไม่มี lead/opportunity ที่ระบุ `interest_code` | `data_quality.resolve` |
| `WON_WITHOUT_TRANSACTION` | ปิดขายแต่ไม่มีเลขธุรกรรม | opportunity `WON` ที่ `won_at < app.clock() − 3 วัน` และไม่มี transaction ref ผูก | `transaction.link` |
| `VISIT_UNRECORDED` | ไม่ได้บันทึกผลการให้บริการ | visit outcome `UNRECORDED` ที่ `started_at` อยู่ใน "7 วันล่าสุด" | `visit.update` (แก้ outcome ไม่ได้หลังข้ามวัน → รับทราบ) |

### 12.4 มิติ การผูกผลงาน และ drill-down

| มิติ | VISITS | LEADS | OPPS · SALES · LOST_OPP | UNIQUE · NEW · RETURNING | FOLLOWUP_COMPLETION |
|---|---|---|---|---|---|
| สาขา | `visits.branch_id` | `leads.branch_id` (ปัจจุบัน) | `opportunities.branch_id` (ปัจจุบัน) | สาขาของกิจกรรม | `tasks.branch_id` |
| ทีม | ทีมปัจจุบันของ owner | ทีมปัจจุบันของ owner | ทีมปัจจุบันของ owner | – | ทีมปัจจุบันของ owner |
| พนักงาน | `visits.owner_staff_id` (ผู้รับ) | `owner_staff_id` ปัจจุบัน | `owner_staff_id` ปัจจุบัน | – | `tasks.owner_staff_id` |
| ช่องทาง | `visits.channel_code` | `leads.channel_code` | `origin_channel_code` | `first_channel_code` | – |

- KPI ภายใต้ scope TEAM/OWN ผูกด้วย **owner เท่านั้น** (ไม่ใช้ `created_by` สำรอง) · ถ้าผู้เรียกมีบางสาขาเป็น TEAM/OWN KPI ที่ไม่มีการผูกพนักงานคืน `NULL` · `BUYERS` `REPEAT_*` `DUPLICATE_RATE` `MISSING_REQUIRED_RATE` ไม่มีการผูกพนักงาน · `OPEN_FOLLOWUP_CUSTOMERS` ผูกด้วย owner ของ task · owner ที่อยู่หลายทีมนับในทุกทีม
- `DUPLICATE_RATE`/`MISSING_REQUIRED_RATE` รายสาขา ใช้ `first_branch_id` ทั้งตัวตั้งและตัวหาร (seed: ไม่มีลูกค้า ACTIVE ที่ `first_branch_id = JPON`)
- Drill-down: องค์กร → สาขา → ทีม → พนักงาน (ต้องมี `report.staff_performance`) → รายชื่อลูกค้า (ต้องมี `customer.read`) · MARKETING ไปได้ถึงระดับทีม
- Phase: ช่วงเวลา + สาขา = Phase 1 · ทีม/พนักงาน/ช่องทาง + drill-down = Phase 3

---

## 13. ชุดข้อมูลตัวอย่าง (seed · prototype · test)

> ข้อมูลในข้อนี้เป็น **ข้อมูลสมมติ** ทั้งหมด · อีเมลใช้โดเมน `example.com` เสมอ
> **"ตอนนี้" = 11 ก.ย. 2569 10:24 น.** (`2026-09-11T10:24:00+07:00`) · **P = "30 วันล่าสุด" = [13 ส.ค. 2569, 12 ก.ย. 2569)** · **ช่วงก่อนหน้า = [14 ก.ค. 2569, 13 ส.ค. 2569)**

### 13.0 สัญญาของ seed

1. `supabase/seed.sql` เป็นข้อมูลระดับแถว **deterministic** (สร้างด้วย `generate_series` + modulo หรือสร้างล่วงหน้าด้วย `tools/db/gen-seed.mjs` ที่ใช้ PRNG seed คงที่ `20260911` แล้ว commit ไฟล์ผลลัพธ์) · ห้าม `random()` ขณะโหลด
2. KPI ทุกตัวในข้อ 13.1–13.12 ต้อง **คำนวณได้จากแถวจริง** ผ่าน `api.get_kpis`/`api.get_report` ไม่ใช่เก็บยอดสำเร็จรูป
3. ประชากร: ลูกค้า `ACTIVE` **14,962** = สร้างปี 2026 ที่ยัง ACTIVE 6,836 (`CUS-2026-000001…006852` หัก `MERGED` 16 ราย ซึ่งมีเลข < 006044) + ลูกค้าก่อนปี 2026 นำเข้า 8,126 ราย (`CUS-2025-000001…008126` · `created_via = 'IMPORT'`) · **ลูกค้าใหม่ใน P = `CUS-2026-006044…006852` ทั้ง 809 เลขพอดี**
4. แถวครอบคลุม P และช่วงก่อนหน้าครบ · ประวัติเก่ากว่านั้นมีเท่าที่จำเป็น (first_seen ของลูกค้าเก่า · การซื้อก่อนหน้าของผู้ซื้อซ้ำ · รายการที่ระบุชื่อ)
5. ทุกรายการที่ระบุชื่อในข้อ 13.5–13.14 มีอยู่จริงด้วยค่าตามที่พิมพ์ · ข้อมูลเติมใช้ชื่อจากรายการคงที่ เบอร์ช่วง `080-000-0000`–`080-099-9999` และต้องไม่ชนรายการที่ระบุชื่อ
6. opportunity `WON` ทุกรายการมี transaction ref (`source_system_code = 'MANUAL'`) **ยกเว้น** 12 รายการของ `WON_WITHOUT_TRANSACTION` · ไม่มี ref ที่ไม่ผูก opportunity
7. seed ตั้ง `app.bulk = on` และ `app.seed_mode = on` (มีผลเฉพาะ `current_user = postgres`): ข้าม audit trigger และการสร้าง notification · trigger ประวัติสถานะยังทำงาน · จบด้วย refresh lifecycle ของลูกค้าทุกราย · แถว audit/notification มีเฉพาะตัวอย่างข้อ 13.14
8. `app.running_numbers` หลัง seed: `CUS:2026`=6852 · `CUS:2025`=8126 · `LD:2026`=7545 · `OP:2026`=3121 · `QT:2026`=1772 · `TK:2026`=12660 · `EX:2026`=31 · `MG:2026`=16 · `RG:2026`=3 · `ST`=51 · `VISIT:JP1:20260911`=7 · `VISIT:JP2:20260911`=4 · `VISIT:JP3:20260911`=4 · `VISIT:JP4:20260911`=2 · `QUEUE:JP1:20260911`=4 · `QUEUE:JP2:20260911`=2 · `QUEUE:JP3:20260911`=2 · `QUEUE:JP4:20260911`=1 · และทุกคู่ (สาขา, วัน) ที่ seed มี visit ต้องมีแถว `VISIT:`/`QUEUE:` เท่ากับเลขสูงสุดของวันนั้น · เลขลำดับเรียงตาม `created_at` เสมอ (LD: ถึง `LD-2026-006650` 12 ส.ค. 19:40 = 6,650 + หลังจากนั้นในวันเดียวกัน 3 + ใน P 892 = 7,545)
9. `supabase/tests/acceptance.sql` assert **ทุกตัวเลขที่พิมพ์ในข้อ 13** (ข้อมูลเติมไม่ assert)
10. `prototype/assets/data.js` เก็บเฉพาะตัวเลขที่พิมพ์และรายการที่ระบุชื่อ (ไม่สร้างข้อมูลเติม) · รายการยาวแสดงแถวที่ระบุชื่อ + "แสดง 1–N จาก {ยอดรวม}"

### 13.1 ทั้งองค์กร (P)

| KPI | ค่า | ช่วงก่อนหน้า | แสดง |
|---|---:|---:|---|
| `VISITS` | 3,125 | 2,790 | +12% |
| `WALKIN_VISITS` | 2,525 | | |
| `IDENTIFIED_VISITS` | 2,719 | | |
| `UNIQUE_CUSTOMERS` | 1,284 | 1,146 | +12% |
| `NEW_CUSTOMERS` · `RETURNING_CUSTOMERS` | 809 (63.0%) · 475 (37.0%) | | |
| `LEADS` | 892 | 826 | +8% |
| `OPPORTUNITIES` | 368 | 323 | +14% |
| `SALES` | 215 | 182 | +18% |
| `SALES_AMOUNT` | ฿3,332,700 | ฿3,051,760 | +9% |
| `LOST_OPPORTUNITIES` · `LOST_LEADS` · `LOST_TOTAL` | 153 · 143 · 296 | | |
| `BUYERS` | 209 (ซื้อ 1 ครั้งใน P 203 ราย + 2 ครั้ง 6 ราย) | | |
| `REPEAT_BUYERS` | 41 (ซื้อ 2 ครั้งใน P 6 ราย + เคยซื้อก่อน P 35 ราย) | | |
| `LEAD_RATE` · `OPPORTUNITY_RATE` | 28.5% · 41.3% | | |
| `CLOSE_RATE` · `LOST_RATE` | 58.4% · 41.6% | | |
| `CONV_LEAD_TO_SALE` | 24.1% | 22.0% | +2.1 pp |
| `CONV_VISIT_TO_SALE` | 6.9% | | |
| `WALKIN_CONVERSION` | 6.3% (158 / 2,525) | | |
| `REPEAT_RATE` | 19.6% (41 / 209) | | |
| `LEAD_RESPONSE_MIN` | 18 นาที (ฐาน 214 lead · ยังไม่ติดต่อ 9) | | |
| `CAPTURE_RATE` | 87.0% | เป้า ≥ 95% | **ต่ำกว่าเป้า** |
| `OUTCOME_COMPLETION` | 95.4% (2,977 / 3,121) | เป้า ≥ 95% | ผ่าน |
| `FOLLOWUP_COMPLETION` | 85.0% (889 / 1,046) · ตัวหาร = ตรงเวลา 889 + เสร็จช้า 138 + ยังเปิดและพ้นระยะผ่อนผัน 19 · (ตัดออก 21 = เกินกำหนด [due ก่อน 11 ก.ย. 00:00] ที่ยังในระยะผ่อนผัน 12 + งาน FOLLOW_UP เปิดอยู่ที่ due วันนี้ 9 [JP1: คุณขวัญ 3 (#7 #10 #12) + คุณคิม 6 · JP2–JP4 = 0]) | เป้า ≥ 90% | **ต่ำกว่าเป้า** |
| `DUPLICATE_RATE` | 0.1% (16 / 14,962) | เป้า < 2% | ผ่าน |
| `MISSING_REQUIRED_RATE` | 0.4% (61 / 14,962) | เป้า < 2% | ผ่าน |
| `OPEN_FOLLOWUP_CUSTOMERS` | 117 | | |

Funnel (ร้อยละเทียบ Visitor): Visitor 3,125 (100%) → Lead 892 (28.5%) → Opportunity 368 (11.8%) → Sale 215 (6.9%)
visit ที่ยังไม่ปิด ณ ตอนนี้ = 4 (ทั้งหมดอยู่คิว JP1)

### 13.2 รายสาขา (P · ตาราง Branch Performance ของ mockup B)

| สาขา | VISITS | Walk-in | ออนไลน์/โทร | Identified | ลูกค้าไม่ซ้ำ | ใหม่ | เก่า | Leads | Opps | Sales | Lost Opp | Lost Lead | ยอดขาย (บาท) | ยอดช่วงก่อน | เปลี่ยน |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| JAUNPHONE 1 | 1,008 | 812 | 196 | 891 | 412 | 262 | 150 | 298 | 120 | 82 | 51 | 45 | 1,245,000 | 1,111,600 | +12% |
| JAUNPHONE 2 | 842 | 694 | 148 | 740 | 356 | 222 | 134 | 241 | 98 | 61 | 40 | 38 | 906,500 | 839,350 | +8% |
| JAUNPHONE 3 | 694 | 521 | 173 | 596 | 280 | 176 | 104 | 187 | 86 | 45 | 36 | 33 | 712,300 | 678,380 | +5% |
| JAUNPHONE 4 | 581 | 498 | 83 | 492 | 236 | 149 | 87 | 166 | 64 | 27 | 26 | 27 | 468,900 | 422,430 | +11% |
| **รวม** | **3,125** | **2,525** | **600** | **2,719** | **1,284** | **809** | **475** | **892** | **368** | **215** | **153** | **143** | **3,332,700** | **3,051,760** | **+9%** |

- สมมติฐาน: ภายใน P และภายในช่วงก่อนหน้า ลูกค้าแต่ละคนมีกิจกรรมที่สาขาเดียวต่อช่วง (ผลรวมรายสาขา = ยอดองค์กร ทั้ง 1,284 และ 1,146) · ในข้อมูลจริงยอดรวมอาจน้อยกว่าผลบวก
- `JPON` ไม่มีรายการใน P (แถวที่เป็นศูนย์ทั้งแถวไม่แสดง) · กราฟ "ลูกค้าเข้าร้านแยกตามสาขา" (mockup A หน้า 09) = คอลัมน์ Walk-in

### 13.2b รายสาขา (ค่าประกอบและอัตรา · P)

| สาขา | Sales ต้นทาง Walk-in | ผู้ซื้อ | ผู้ซื้อซ้ำ | visit ปิดแล้ว | UNRECORDED | FOLLOW_UP ในตัวหาร | ตรงเวลา | เสร็จช้า | เปิด·พ้นผ่อนผัน | ตัดออก: เกินกำหนด (due < 11 ก.ย.)·ในผ่อนผัน | ตัดออก: เปิด·due วันนี้ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| JP1 | 60 | 80 | 16 | 1,004 | 44 | 352 | 305 | 47 | 0 | 6 | 9 |
| JP2 | 46 | 59 | 12 | 842 | 38 | 290 | 246 | 37 | 7 | 2 | 0 |
| JP3 | 31 | 44 | 8 | 694 | 34 | 226 | 190 | 30 | 6 | 2 | 0 |
| JP4 | 21 | 26 | 5 | 581 | 28 | 178 | 148 | 24 | 6 | 2 | 0 |
| **รวม** | **158** | **209** | **41** | **3,121** | **144** | **1,046** | **889** | **138** | **19** | **12** | **9** |

| สาขา | VISITS ก่อน | ลูกค้าไม่ซ้ำ ก่อน | Leads ก่อน | Opps ก่อน | Sales ก่อน | เปลี่ยน V · U · L · O · S |
|---|---:|---:|---:|---:|---:|---|
| JP1 | 900 | 368 | 276 | 105 | 69 | +12% · +12% · +8% · +14% · +19% |
| JP2 | 752 | 318 | 223 | 86 | 52 | +12% · +12% · +8% · +14% · +17% |
| JP3 | 620 | 250 | 173 | 76 | 38 | +12% · +12% · +8% · +13% · +18% |
| JP4 | 518 | 210 | 154 | 56 | 23 | +12% · +12% · +8% · +14% · +17% |
| **รวม** | **2,790** | **1,146** | **826** | **323** | **182** | +12% · +12% · +8% · +14% · +18% |

| สาขา | Lead rate | Opp rate | Close | Lost | Lead→ขาย (ก่อน · pp) | ผู้มาติดต่อ→ขาย | Walk-in Conv | Capture | Outcome | Follow-up | Repeat |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| JP1 | 29.6% | 40.3% | 61.7% | 38.3% | 27.5% (25.0% · +2.5 pp) | 8.1% | 7.4% | 88.4% | 95.6% | 86.6% | 20.0% |
| JP2 | 28.6% | 40.7% | 60.4% | 39.6% | 25.3% (23.3% · +2.0 pp) | 7.2% | 6.6% | 87.9% | 95.5% | 84.8% | 20.3% |
| JP3 | 26.9% | 46.0% | 55.6% | 44.4% | 24.1% (22.0% · +2.1 pp) | 6.5% | 6.0% | 85.9% | 95.1% | 84.1% | 18.2% |
| JP4 | 28.6% | 38.6% | 50.9% | 49.1% | 16.3% (14.9% · +1.3 pp) | 4.6% | 4.2% | 84.7% | 95.2% | 83.1% | 19.2% |
| **รวม** | 28.5% | 41.3% | 58.4% | 41.6% | 24.1% (22.0% · +2.1 pp) | 6.9% | 6.3% | 87.0% | 95.4% | 85.0% | 19.6% |

Funnel รายสาขา (% ของ Visitor): JP1 1,008 → 298 (29.6%) → 120 (11.9%) → 82 (8.1%) · JP2 842 → 241 (28.6%) → 98 (11.6%) → 61 (7.2%) · JP3 694 → 187 (26.9%) → 86 (12.4%) → 45 (6.5%) · JP4 581 → 166 (28.6%) → 64 (11.0%) → 27 (4.6%)
`LEAD_RESPONSE_MIN` รายสาขาไม่มีค่าตัวอย่าง (แสดง `–`)

### 13.3 แหล่งที่มาลูกค้า (ลูกค้าไม่ซ้ำตาม `first_channel_code`)

| สาขา | WALK_IN | LINE | FACEBOOK | INSTAGRAM | TIKTOK | PHONE | รวม |
|---|---:|---:|---:|---:|---:|---:|---:|
| JP1 | 147 | 116 | 66 | 33 | 29 | 21 | 412 |
| JP2 | 143 | 93 | 53 | 27 | 23 | 17 | 356 |
| JP3 | 64 | 95 | 54 | 27 | 24 | 16 | 280 |
| JP4 | 108 | 56 | 32 | 16 | 14 | 10 | 236 |
| **รวม** | **462 (36.0%)** | **360 (28.0%)** | **205 (16.0%)** | **103 (8.0%)** | **90 (7.0%)** | **64 (5.0%)** | **1,284** |

`WEBSITE` = 0 (ไม่แสดงบนกราฟ) · ส่วนของโดนัทต้องตรงกับแถวที่มากกว่า 0 เท่านั้น

### 13.4 เหตุผลที่ไม่สำเร็จ (`LOST_TOTAL` 296)

| code | JP1 | JP2 | JP3 | JP4 | รวม | ร้อยละ | ในนั้นเป็น Lead |
|---|---:|---:|---:|---:|---:|---:|---:|
| `PRICE` | 27 | 22 | 19 | 15 | 83 | 28.0% | 38 |
| `COMPARING` | 17 | 14 | 12 | 10 | 53 | 17.9% | 27 |
| `NOT_READY` | 15 | 12 | 11 | 9 | 47 | 15.9% | 26 |
| `DOCUMENTS` | 12 | 10 | 8 | 6 | 36 | 12.2% | 14 |
| `CHANGED_MIND` | 10 | 8 | 7 | 5 | 30 | 10.1% | 13 |
| อื่น ๆ (รวม) | 15 | 12 | 12 | 8 | 47 | 15.9% | 25 |
| ↳ `OUT_OF_STOCK` | 6 | 5 | 4 | 3 | 18 | | 9 |
| ↳ `FINANCE_REJECTED` | 4 | 3 | 3 | 1 | 11 | | 5 |
| ↳ `COMPETITOR` | 3 | 2 | 2 | 2 | 9 | | 3 |
| ↳ `UNREACHABLE` | 1 | 1 | 2 | 2 | 6 | | 6 |
| ↳ `PROMOTION` | 1 | 1 | 1 | 0 | 3 | | 2 |
| **รวม** | **96** | **78** | **69** | **53** | **296** | **100%** | **143** |

### 13.5 พนักงานและทีมตัวอย่าง

| staff_code | ชื่อที่แสดง | บทบาท @ ขอบเขต | ทีม | อีเมล | สถานะ |
|---|---|---|---|---|---|
| `ST-0001` | จ๋าอั๋น | `EXECUTIVE` @ องค์กร | – | ja@example.com | ACTIVE |
| `ST-0002` | คุณแพร | `BUSINESS_ADMIN` @ องค์กร | – | prae@example.com | ACTIVE |
| `ST-0003` | คุณต้น | `SYSTEM_ADMIN` | – | ton@example.com | ACTIVE |
| `ST-0010` | คุณปุ๊ก | `OPERATIONS` @ JP1 · JP2 · JP3 · JP4 | – | puk@example.com | ACTIVE |
| `ST-0011` | คุณมายด์ | `MARKETING` @ องค์กร | – | mind@example.com | ACTIVE |
| `ST-0020` | คุณเจ | `BRANCH_MANAGER` @ JP1 | – | jay@example.com | ACTIVE |
| `ST-0021` | คุณบอส | `BRANCH_MANAGER` @ JP2 | – | boss@example.com | ACTIVE |
| `ST-0022` | คุณหนึ่ง | `BRANCH_MANAGER` @ JP3 | – | nueng@example.com | ACTIVE |
| `ST-0023` | คุณเบียร์ | `BRANCH_MANAGER` @ JP4 | – | beer@example.com | ACTIVE |
| `ST-0030` | คุณนัท | `SUPERVISOR` @ JP1 | `JP1-SALES` (หัวหน้า) | nat@example.com | ACTIVE |
| `ST-0045` | คุณขวัญ | `STAFF` @ JP1 | `JP1-SALES` | kwan@example.com | ACTIVE |
| `ST-0046` | คุณคิม | `STAFF` @ JP1 | `JP1-SALES` | kim@example.com | ACTIVE |
| `ST-0050` | คุณฝน | `STAFF` @ JPON | `JPON-ADMIN` (ไม่มีหัวหน้า) | fon@example.com | ACTIVE |
| `ST-0051` | คุณโอ๊ต | (รอคำขอ `SYSTEM_ADMIN` RG-2026-0003) | – | oat@example.com | INVITED |

- ทีม `JP2-SALES` `JP3-SALES` `JP4-SALES` มีอยู่แต่ไม่มีสมาชิก · รายการของ JP2–JP4 ใน seed มี owner = ผู้จัดการสาขานั้น (ข้อสมมติเพื่อความง่าย) **ยกเว้น** lead เปิดอยู่ที่ไม่มี owner สาขาละ 2 รายการ (`LEAD_WITHOUT_OWNER`)
- ทุกบัญชีตัวอย่างที่ `requires_mfa` มี TOTP factor ที่ verified แล้ว · test ใช้ `aal2` เว้นแต่ระบุ
- ฝน (JPON) เห็นหน้าว่าง (empty state) ในทุกหน้าที่เป็นรายการ
- **ลูกค้าของฉันล่าสุด (คุณขวัญ · หน้า 02 STAFF และมือถือ):** คุณสมชาย ใจดี 11 ก.ย. 2569 10:24 · คุณมานพ รักงาน 10 ก.ย. 2569 16:40 · คุณพิมพ์ชนก ศรีสุข 10 ก.ย. 2569 14:05 · คุณชนากานต์ ใจงาม 10 ก.ย. 2569 11:20 · คุณอรอุมา แสนดี 9 ก.ย. 2569 15:10 = ลูกค้าที่ `owner_staff_id` = คุณขวัญ เรียง `last_activity_at DESC` (seed: ลูกค้ารายอื่นของคุณขวัญมี `last_activity_at` ก่อน 9 ก.ย. 2569 15:10 · ผู้ดูแลลูกค้าของคุณวิไลวรรณ ลูกค้าคิว 001 ลูกค้าออนไลน์รายการที่ 3 และลูกค้า OUTBOUND 3 รายของ JP1 วันนี้ = คุณคิม)
- **กิจกรรมล่าสุด (หน้า 02):** 5 แถวแรกของข้อ 13.8 (ชื่อ · ช่องทางล่าสุด · สาขา · เวลา) · BRANCH_MANAGER เห็นเฉพาะแถวของ JP1

### 13.6 ตัวเลขรายพนักงาน JP1 (P · owner ปัจจุบัน)

| ค่า | คุณขวัญ | คุณคิม | ไม่มี owner | รวม JP1 |
|---|---:|---:|---:|---:|
| Leads | 154 | 142 | 2 | 298 |
| Opportunities | 63 | 57 | – | 120 |
| Sales | 44 | 38 | – | 82 |
| ยอดขาย (บาท) | 668,400 | 576,600 | – | 1,245,000 |
| Lost Opp · Lost Lead | 26 · 23 | 25 · 22 | – | 51 · 45 |
| Lead เปิดอยู่ (ณ ตอนนี้) | 30 | 26 | 2 | 58 (NEW 14 · CONTACTED 29 · QUALIFIED 15) |
| Opportunity เปิดอยู่ (สนใจ · เสนอราคา · รอตัดสินใจ) | 34 (17 · 10 · 7) ฿731,600 | 28 (15 · 8 · 5) ฿595,500 | – | 62 ฿1,327,100 |
| ปิดการขายใน 7 วันล่าสุด | 4 ฿145,500 | 4 ฿139,900 | – | 8 ฿285,400 |
| งาน: วันนี้ · เกินกำหนด | 8 · 4 | 6 · 3 | – | – |

ข้อบังคับของ seed (lead/next action):
- lead JP1 สถานะ `NEW` 14 = สร้างก่อน P 6 รายการ (ช่องทางข้อความ · คือ `LEAD_WITHOUT_OUTCOME` JP1 ทั้ง 6) + สร้างใน P หลัง 28 ส.ค. 2569 10:24 จำนวน 8 รายการ
- "ยังไม่ติดต่อ 9" ของข้อ 13.1 = JP1 8 + JP4 1 (lead ของ `CUS-2026-006774`) · JP2 JP3 = 0 · ทั้ง 9 ยังเปิดสถานะ `NEW` · ไม่มี lead ช่องทางข้อความใน P ที่ปิดโดยไม่มี `first_contacted_at`
- lead เปิดอื่นของ JP1 สร้างหลัง 28 ส.ค. 2569 10:24 ทั้งหมด · lead ช่องทาง WALK_IN/PHONE ใน seed ไม่เป็น `NEW`
- `next_action_at` ของ lead/opportunity ที่เปิดอยู่ของคุณขวัญ/คุณคิมที่ไม่อยู่ในข้อ 13.10 ต้อง ≥ 12 ก.ย. 2569 00:00 (ไม่ใช้ค่าเริ่มต้น +30 นาที) · task next action ของรายการเหล่านั้นจึงไม่อยู่ในกลุ่มวันนี้/เกินกำหนด

ทีม `JP1-SALES` (มุมมองของคุณนัท): Leads 296 · Opportunities 120 · Sales 82 · ยอดขาย ฿1,245,000 · Conversion (Lead → ขาย) 27.7% · งานเกินกำหนดของทีม 7

### 13.7 ลูกค้าตัวอย่างหลัก — คุณสมชาย ใจดี (Customer 360 · ตรงกับ A6 และ A9)

| ช่อง | ค่า |
|---|---|
| `customer_no` | `CUS-2026-000297` |
| ชื่อ · Tag | สมชาย ใจดี · `VIP` `INSTALLMENT` `IPHONE_FAN` |
| ป้าย | ลูกค้าซื้อซ้ำ · VIP · ติดตามอยู่ |
| ติดต่อ | PHONE `081-234-5678` (`081-XXX-5678`) · LINE_ID `somchai_j` (`so***`) · EMAIL `somchai.j@example.com` (`s***@example.com`) |
| จังหวัด | `TH-10` กรุงเทพมหานคร |
| รู้จักครั้งแรก | 11 ม.ค. 2569 13:15 · `FACEBOOK` · แหล่งที่มา `FACEBOOK_PAGE` ("รู้จักร้านจาก Facebook") · สาขาแรก JP1 · "เป็นลูกค้ามา 8 เดือน" |
| ผู้ดูแล | คุณขวัญ (`ST-0045`) |
| ตัวเลขสรุป | ติดต่อ **7** · เข้าร้าน **3** · ซื้อ **2** · ยอดซื้อสะสม **52,800** บาท |
| สินค้าที่สนใจ | iPhone 17 Pro (สนใจมาก · `HOT`) · iPad Air (สนใจ · `WARM`) |
| นัดติดตามถัดไป | 18 ก.ย. 2569 10:00 · โทรติดตามเรื่องผ่อน · คุณขวัญ |
| ความยินยอม | `PRIVACY_NOTICE` 11 ม.ค. 2569 (`PN-2026-01` · `LINK_SENT`) · `MARKETING` 20 ม.ค. 2569 ช่องทาง `LINE` (`STAFF_FORM`) |
| โน้ตที่ปักหมุด | "ชอบให้ติดต่อทาง LINE หลัง 18:00" · คุณขวัญ · 8 ก.ย. 2569 |

Visit 6 ครั้ง + interaction 7 รายการ (ทุกรายการที่สาขา JP1)

| # | interaction (occurred_at) | ช่องทาง · ทิศทาง | ประเภท | visit | สรุป |
|---|---|---|---|---|---|
| 7 | 11 ก.ย. 2569 10:24 | LINE · INBOUND | `INQUIRY` | V-JP1-260911-007 · COMPLETED `NOT_YET` | สอบถาม iPhone 17 Pro และเงื่อนไขผ่อน |
| 6 | 8 ก.ย. 2569 16:10 | WALK_IN · INBOUND | `VISIT` | V-JP1-260908-017 · COMPLETED `FOLLOW_UP` | ทดลองเครื่อง / สนใจผ่อน · สร้าง LD-2026-007460 (iPad Air) |
| 5 | 1 ก.ย. 2569 14:22 | LINE · OUTBOUND | `QUOTATION_SENT` | – | ส่งใบเสนอราคา `QT-2026-001702` |
| 4 | 15 ส.ค. 2569 11:05 | WALK_IN · INBOUND | `PURCHASE` | COMPLETED `PURCHASED` | ปิดการขาย iPhone 16 128GB ฿28,900 |
| 3 | 12 ส.ค. 2569 19:40 | LINE · INBOUND | `INQUIRY` | COMPLETED `FOLLOW_UP` | สอบถามราคา iPhone 16 · สร้าง LD-2026-006650 |
| 2 | 20 ม.ค. 2569 15:30 | WALK_IN · INBOUND | `PURCHASE` | COMPLETED `PURCHASED` | ปิดการขาย iPhone 15 128GB ฿23,900 |
| 1 | 11 ม.ค. 2569 13:15 | FACEBOOK · INBOUND | `INQUIRY` | COMPLETED `FOLLOW_UP` | สอบถามราคา iPhone 15 · สร้าง LD-2026-000312 |

| รายการ | รายละเอียด |
|---|---|
| `LD-2026-000312` | 11 ม.ค. 2569 13:15 · `FACEBOOK` · `CONVERTED` → `OP-2026-000231` |
| `OP-2026-000231` | origin `FACEBOOK` · WON 20 ม.ค. 2569 15:30 · ฿23,900 · transaction ref `SALE` `MANUAL` |
| `LD-2026-006650` | 12 ส.ค. 2569 19:40 · `LINE` · `CONVERTED` → `OP-2026-002790` |
| `OP-2026-002790` | สร้างและ WON 15 ส.ค. 2569 11:05 · origin `LINE` (จึง**ไม่อยู่**ใน 158 ของ Walk-in) · ฿28,900 · transaction ref `SALE` `MANUAL` |
| `OP-2026-002998` | สร้างตรง 1 ก.ย. 2569 14:00 (ไม่มี lead) · origin `LINE` · owner คุณขวัญ · `INTERESTED` → `QUOTATION` 1 ก.ย. 14:22 → `FOLLOW_UP` 8 ก.ย. 16:10 (เปลี่ยนสินค้าเป็น iPhone 17 Pro ฿45,900 `HOT`) · ความสำคัญ `HIGH` · next action `CALL` "โทรติดตามเรื่องผ่อน" **18 ก.ย. 2569 10:00** |
| `QT-2026-001702` | ของ `OP-2026-002998` · iPhone 17 Pro Max 256GB ฿49,900 · SENT 1 ก.ย. 2569 ทาง LINE · `valid_until` 8 ก.ย. 2569 · `EXPIRED` 9 ก.ย. 2569 |
| `LD-2026-007460` | 8 ก.ย. 2569 16:10 · `WALK_IN` · `CONTACTED` · iPad Air `WARM` · owner คุณขวัญ · next action `FOLLOW_UP` 20 ก.ย. 2569 11:00 |
| `TK-2026-012508` | `CALL` · "โทรติดตามเรื่องผ่อน iPhone 17 Pro" · `is_next_action` ของ OP-2026-002998 · due 18 ก.ย. 2569 10:00 · สร้าง 8 ก.ย. 2569 16:40 · owner คุณขวัญ |
| task ติดตาม iPad Air | `FOLLOW_UP` · `is_next_action` ของ LD-2026-007460 · due 20 ก.ย. 2569 11:00 (ที่มาของป้าย "ติดตามอยู่") |

การซื้อ: 2 ครั้ง (20 ม.ค. ก่อน P + 15 ส.ค. ใน P) → เป็นหนึ่งใน 35 ผู้ซื้อซ้ำที่เคยซื้อก่อน P

### 13.8 รายการลูกค้า (หน้า 03 · ค่าเริ่มต้นกรอง "ติดต่อใน 30 วันล่าสุด" = 1,284 · เรียง `last_activity_at DESC, customer_no DESC`)

| # | customer_no | ชื่อ | เบอร์ (เต็ม → แสดง) | ช่องทางล่าสุด | ป้าย | สาขา | ติดต่อล่าสุด |
|---|---|---|---|---|---|---|---|
| 1 | `CUS-2026-000297` | คุณสมชาย ใจดี | 081-234-5678 → 081-XXX-5678 | LINE | ลูกค้าซื้อซ้ำ · VIP · ติดตามอยู่ | JAUNPHONE 1 | 11 ก.ย. 2569 10:24 |
| 2 | `CUS-2026-006851` | คุณณัฐชยา มากมี | 095-123-4567 → 095-XXX-4567 | Walk-in | สนใจซื้อ · ลูกค้าใหม่ | JAUNPHONE 2 | 11 ก.ย. 2569 10:20 |
| 3 | `CUS-2026-004127` | คุณกิตติพงษ์ กล้าหาญ | 090-987-6543 → 090-XXX-6543 | Facebook | มีโอกาสซื้อ · ติดตามอยู่ | JAUNPHONE 3 | 11 ก.ย. 2569 10:16 |
| 4 | `CUS-2026-006790` | คุณวิไลวรรณ สวยดี | 098-765-4321 → 098-XXX-4321 | Instagram | สนใจซื้อ · ลูกค้าใหม่ | JAUNPHONE 1 | 11 ก.ย. 2569 10:11 |
| 5 | `CUS-2026-006774` | คุณธนพล รุ่งเรือง | 081-456-7890 → 081-XXX-7890 | TikTok | สนใจซื้อ · ลูกค้าใหม่ · ยังไม่ได้ติดต่อ | JAUNPHONE 4 | 11 ก.ย. 2569 10:06 |

"ช่องทางล่าสุด" = `channel_code` ของ interaction ล่าสุดที่ไม่ใช่ INTERNAL · "สาขา" = สาขาของกิจกรรมล่าสุด · ปีนี้ออกเลขลูกค้าถึง `CUS-2026-006852`

### 13.9 Pipeline (หน้า 06 · JAUNPHONE 1 · รายการเปิดอยู่ + ปิดการขายใน 7 วันล่าสุด)

| คอลัมน์ | จำนวน | มูลค่า | การ์ดตัวอย่าง (ลูกค้า · สินค้า · มูลค่า · วันที่บนการ์ด · owner) |
|---|---:|---:|---|
| สนใจ | 32 | ฿426,800 | คุณอรอุมา แสนดี `CUS-2026-005980` · iPhone 17 · ฿32,900 · 11 ก.ย. · คุณขวัญ ／ คุณปกรณ์ ใจกว้าง `CUS-2026-006121` · iPad Air · ฿21,900 · 12 ก.ย. · คุณคิม |
| เสนอราคา | 18 | ฿512,300 | คุณพิมพ์ชนก ศรีสุข `CUS-2026-005412` · iPhone 17 Pro Max · ฿49,900 · 10 ก.ย. (เกินกำหนด) · คุณขวัญ ／ คุณวรเชษฐ์ มั่นคง `CUS-2026-004877` · iPhone 16 · ฿29,900 · 15 ก.ย. · คุณคิม |
| รอตัดสินใจ | 12 | ฿388,000 | คุณสมชาย ใจดี `CUS-2026-000297` · iPhone 17 Pro · ฿45,900 · 18 ก.ย. · คุณขวัญ ／ คุณสุภาวดี ดีมาก `CUS-2026-003966` · iPad Pro · ฿34,900 · 17 ก.ย. · คุณคิม |
| ปิดการขาย (7 วัน) | 8 | ฿285,400 | คุณมานพ รักงาน `CUS-2026-006310` · iPhone 16 128GB · ฿28,900 · won 10 ก.ย. · คุณขวัญ ／ คุณศิริพร พรมดี `CUS-2026-006455` · iPhone 15 · ฿25,900 · won 9 ก.ย. · คุณคิม |

- วันที่บนการ์ด = `next_action_at` (WON = `won_at`) · ขอบซ้ายสีตาม `priority_code` · มูลค่า = `expected_amount` (WON = `won_amount`)
- ความสำคัญของการ์ดตัวอย่าง: อรอุมา `HIGH` · ปกรณ์ `NORMAL` · พิมพ์ชนก `HIGH` · วรเชษฐ์ `NORMAL` · สมชาย `HIGH` · สุภาวดี `NORMAL` · มานพ `NORMAL` · ศิริพร `NORMAL`
- ใน Sales 82 รายการของ JP1: 8 รายการ `won_at ∈ [5 ก.ย., 12 ก.ย.)` รวม ฿285,400 · อีก 74 รายการรวม ฿959,600

### 13.10 งานของคุณขวัญ (หน้า 08 · มือถือ) — ทั้งหมด 12 = วันนี้ 8 + เกินกำหนด 4

| # | กลุ่ม | due | ประเภท | ลูกค้า | ชื่องาน | ความสำคัญ |
|---|---|---|---|---|---|---|
| 1 | เกินกำหนด | 10 ก.ย. 2569 13:00 | `CALL` | คุณจิราพร ทองดี `CUS-2025-007321` | โทรยืนยันวันรับเครื่อง | NORMAL |
| 2 | เกินกำหนด | 10 ก.ย. 2569 15:00 | `FOLLOW_UP` | คุณพิมพ์ชนก ศรีสุข `CUS-2026-005412` | ติดตามใบเสนอราคา iPhone 17 Pro Max | HIGH |
| 3 | เกินกำหนด | 10 ก.ย. 2569 17:30 | `FOLLOW_UP` | คุณสุนิสา แก้วใส `CUS-2026-005733` | ติดตามความสนใจ iPad | NORMAL |
| 4 | เกินกำหนด | 10 ก.ย. 2569 19:00 | `FOLLOW_UP` | คุณกมลชนก สายสุข `CUS-2026-006002` | ติดตามเรื่องเทิร์นเครื่อง | NORMAL |
| 5 | วันนี้ (เลยเวลา) | 10:00 | `CALL` | คุณมานพ รักงาน `CUS-2026-006310` | โทรขอเลขใบเสร็จ POS | NORMAL |
| 6 | วันนี้ | 10:30 | `SEND_QUOTATION` | คุณอรอุมา แสนดี `CUS-2026-005980` | ส่งใบเสนอราคา iPhone 17 | HIGH |
| 7 | วันนี้ | 11:30 | `FOLLOW_UP` | คุณธีรภัทร วงศ์ใหญ่ `CUS-2026-006511` | ติดตามการตัดสินใจ iPhone 16 | NORMAL |
| 8 | วันนี้ | 13:00 | `APPOINTMENT` | คุณชนากานต์ ใจงาม `CUS-2026-006840` | นัดเข้าร้านดูเครื่อง | NORMAL |
| 9 | วันนี้ | 14:30 | `DOCUMENT` | คุณพิมพ์ชนก ศรีสุข `CUS-2026-005412` | เตรียมเอกสารผ่อน | NORMAL |
| 10 | วันนี้ | 16:00 | `FOLLOW_UP` | คุณวีรยุทธ ชัยมงคล `CUS-2026-006702` | ติดตามราคา AirPods | LOW |
| 11 | วันนี้ | 17:30 | `CALL` | คุณจิราพร ทองดี `CUS-2025-007321` | โทรแจ้งเครื่องพร้อมรับ | NORMAL |
| 12 | วันนี้ | 19:00 | `FOLLOW_UP` | คุณปิยะนุช บุญมา `CUS-2026-006598` | ติดตามโปรโมชั่นผ่อน 0% | NORMAL |

ทุกลูกค้าในตารางเป็นลูกค้า JP1 ที่คุณขวัญดูแล · งานของคุณคิม: วันนี้ 6 + เกินกำหนด 3 (ทั้งหมด `FOLLOW_UP`) · งานของคุณสมชาย (18 ก.ย.) ไม่อยู่ในรายการวันนี้

### 13.11 วันนี้ ณ 10:24 น. และคิวหน้าร้าน

| สาขา | Walk-in | ออนไลน์/โทร | VISITS | Identified | ลูกค้าไม่ซ้ำวันนี้ | วันเดียวกันสัปดาห์ก่อน (ถึง 10:24) | เปลี่ยน | visit เปิดอยู่ |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| JP1 | 4 | 3 | 7 | 4 | 7 | 6 | +17% | 4 |
| JP2 | 2 | 2 | 4 | 4 | 4 | 4 | 0% | 0 |
| JP3 | 2 | 2 | 4 | 3 | 3 | 2 | +50% | 0 |
| JP4 | 1 | 1 | 2 | 2 | 2 | 2 | 0% | 0 |
| **รวม** | **9** | **8** | **17** | **13** | **16** | **14** | **+14%** | **4** |

คิว JAUNPHONE 1 (หน้า 07):

| คิว | เข้าคิว | สถานะ | วัตถุประสงค์ | ผู้รับ |
|---|---|---|---|---|
| 001 | 10:05 | กำลังให้บริการ | ซื้อเครื่อง | คุณขวัญ |
| 002 | 10:12 | รอรับบริการ | เทิร์นเครื่อง | – |
| 003 | 10:18 | รอรับบริการ | ซ่อม | – |
| 004 | 10:21 | รอรับบริการ | สอบถาม/โปรโมชั่น | – |

visit ออนไลน์ JP1 วันนี้ 3 รายการ (คุณสมชาย LINE 10:24 · คุณวิไลวรรณ Instagram 10:11 · อีก 1 รายการก่อน 10:06) ทำให้ `VISIT:JP1:20260911` = 7

ลูกค้าไม่ซ้ำวันนี้ JP1 7 = ลูกค้าของ visit ที่ระบุตัวตน 4 (คิว 001 10:05 · visit ออนไลน์รายการที่ 3 ก่อน 10:06 · คุณวิไลวรรณ 10:11 · คุณสมชาย 10:24) + ลูกค้า JP1 อีก 3 รายที่มีเฉพาะ interaction `OUTBOUND` วันนี้ก่อน 10:06 (ไม่สร้าง visit) · คิว 002–004 `customer_id` = NULL · กิจกรรมวันนี้ของลูกค้าทุกรายที่ไม่อยู่ในข้อ 13.8 ต้องเกิดก่อน 10:06

### 13.12 ศูนย์คุณภาพข้อมูล (หน้า 12)

| issue | JP1 | JP2 | JP3 | JP4 | รวม |
|---|---:|---:|---:|---:|---:|
| `DUPLICATE_SUSPECTED` | 5 | 4 | 4 | 3 | 16 |
| `MISSING_PHONE` | 7 | 6 | 5 | 5 | 23 |
| `INVALID_PHONE` | 2 | 2 | 1 | 1 | 6 |
| `LEAD_WITHOUT_OWNER` | 2 | 2 | 2 | 2 | 8 |
| `LEAD_WITHOUT_OUTCOME` | 6 | 5 | 4 | 4 | 19 |
| `OVERDUE_FOLLOWUP` | 6 | 9 | 8 | 8 | 31 |
| `INCOMPLETE_CUSTOMER` | 13 | 11 | 9 | 9 | 42 |
| `WON_WITHOUT_TRANSACTION` | 4 | 3 | 3 | 2 | 12 |
| `VISIT_UNRECORDED` (7 วัน) | 9 | 8 | 7 | 5 | 29 |

- ลูกค้า `MISSING_PHONE` 23 รายเป็นข้อมูลนำเข้า (`created_via = 'IMPORT'`) · 4 รายในนั้นติด `INCOMPLETE_CUSTOMER` ด้วย → ลูกค้าไม่ซ้ำที่ติดธง 61
- `DUPLICATE_SUSPECTED` 16 แถว = ลูกค้าที่สร้างใหม่ 16 รายไม่ซ้ำกัน · ไม่มีคู่อื่นใน seed ที่คะแนน ≥ 70
- `OVERDUE_FOLLOWUP` JP1 6 = ของคุณขวัญ 3 + คุณคิม 3

### 13.13 ผลที่คาดของการตรวจสิทธิ์ (test บังคับ · aal2 เว้นแต่ระบุ)

| ผู้ใช้ | อ่าน `CUS-2026-000297` | แก้ `CUS-2026-000297` | แก้ `OP-2026-002998` | อ่าน `TK-2026-012508` | เปิดเบอร์คุณสมชาย | `api.get_kpis` P ได้ผล |
|---|:--:|:--:|:--:|:--:|:--:|---|
| คุณขวัญ (ST@JP1 · aal1) | ✓ | ✓ | ✓ | ✓ | ✓ | ขอบเขตของตน (ข้อ 13.6 คอลัมน์คุณขวัญ) |
| คุณคิม (ST@JP1 · aal1) | ✓ | ✗ | ✗ | ✗ | ✓ | ขอบเขตของตน |
| คุณนัท (SV@JP1) | ✓ | ✓ | ✓ | ✓ | ✓ | ทีม JP1-SALES (ข้อ 13.6) |
| คุณนัท (SV@JP1 · **aal1**) | ✗ | ✗ | ✗ | ✗ | ✗ | ปฏิเสธ |
| คุณเจ (BM@JP1) | ✓ | ✓ | ✓ | ✓ | ✓ | แถว JAUNPHONE 1 |
| คุณบอส (BM@JP2) | ✗ | ✗ | ✗ | ✗ | ✗ | แถว JAUNPHONE 2 |
| คุณฝน (ST@JPON · aal1) | ✗ | ✗ | ✗ | ✗ | ✗ | จำนวนเป็น 0 · KPI ที่ไม่ผูกพนักงานและอัตรา 0/0 เป็น `NULL` |
| คุณปุ๊ก (OP@JP1–4) | ✓ | ✗ | ✗ | ✓ | ✗ | = ข้อ 13.1 |
| คุณมายด์ (MK) | ✗ | ✗ | ✗ | ✗ | ✗ | = ข้อ 13.1 |
| จ๋าอั๋น (EX) | ✓ | ✗ | ✗ | ✓ | ✓ | = ข้อ 13.1 |
| จ๋าอั๋น (EX · **aal1**) | ✗ | ✗ | ✗ | ✗ | ✗ | ปฏิเสธ |
| คุณแพร (BA) | ✓ | ✓ | ✓ | ✓ | ✓ | = ข้อ 13.1 |
| คุณต้น (SA) | ✗ | ✗ | ✗ | ✗ | ✗ | ปฏิเสธ |

test เพิ่มเติมที่บังคับ: ผู้ใช้ที่ไม่มีบทบาทอ่าน `crm.customers` ได้ 0 แถว · `current_setting('is_superuser') = 'off'` ขณะทดสอบ · คนที่เป็น BM@JP1 + ST@JP2 แก้ lead ของคนอื่นที่ JP2 ได้ 0 แถว · STAFF@JP2 INSERT visit ที่ `customer_id` เป็นลูกค้า JP1 อย่างเดียวถูกปฏิเสธ · `GET customer_contacts?select=value_raw` ถูกปฏิเสธ · SYSTEM_ADMIN ไม่มีสิทธิ์ `customer.*`

### 13.14 ตัวอย่างอื่น

**การเปลี่ยนผู้รับผิดชอบ (A28):** `LD-2026-007512` คุณวิไลวรรณ สวยดี · 10 ก.ย. 2569 18:05 · คุณขวัญ → คุณคิม · โดยคุณเจ · `SHIFT_CHANGE` "เปลี่ยนกะ"

**ตรวจซ้ำบนหน้า 04 (mockup A04):** กรอก `081-234-5678` + "สมชาย ใจดี" → 2 รายการ: `CUS-2026-000297` คะแนน 100 "เบอร์โทรตรงกัน" · `CUS-2026-004410` คุณสมชาย ใจดี `081-234-5679` JP1 มีโอกาสซื้อ · ติดตามอยู่ คะแนน 40 "ชื่อคล้าย + สาขาแรกเดียวกัน"

**คู่ซ้ำตัวอย่างแรกบนหน้า 12:** `CUS-2026-006633` คุณณัฐพล สุขใจ (สร้างโดยคุณคิม 3 ก.ย. 2569 · เหตุผล `FAMILY_SHARED_PHONE`) ↔ `CUS-2026-002118` คุณณัฐพร สุขใจ (ทั้งสองราย สาขาแรก JP1 · ผู้ดูแลคุณคิม) · คะแนน 100 "เบอร์โทรตรงกัน" · `PENDING`

**แจ้งเตือนที่ยังไม่อ่าน (กระดิ่ง):**
| ผู้ใช้ | จำนวน | รายการ |
|---|---:|---|
| คุณขวัญ | 6 | `FOLLOWUP_OVERDUE` ×3 (งาน #2 #3 #4) · `TASK_OVERDUE` ×2 (งาน #1 และ #5) · `DATA_MISSING` 11 ก.ย. 2569 09:00 |
| คุณคิม | 5 | `LEAD_ASSIGNED` LD-2026-007512 · 10 ก.ย. 2569 18:05 · `FOLLOWUP_OVERDUE` ×3 (งานเกินกำหนด 3 รายการ) · `DATA_MISSING` 11 ก.ย. 2569 09:00 |
| คุณนัท | 3 | `LEAD_UNASSIGNED` ×2 (lead JP1 ไม่มี owner) · `DUPLICATE_SUSPECTED` สรุป 10 ก.ย. 2569 18:00 |
| คุณเจ | 4 | สามรายการเดียวกับคุณนัท + `VISIT_OUTCOME_MISSING` สรุปวันที่ 10 ก.ย. 2569 |
| คุณแพร | 1 | `EXPORT_APPROVAL_REQUIRED` EX-2026-000031 |
| จ๋าอั๋น | 1 | `ROLE_GRANT_APPROVAL_REQUIRED` RG-2026-0003 |
| คนอื่น | 0 | – |

ตารางนี้คือแถว `crm.notifications` ที่ยังไม่อ่าน **ทั้งหมด** ที่ seed ใส่ (snapshot ไม่ใช่ผลของกติกาข้อ 11.1 ณ `app.clock()`) · acceptance และ prototype ใช้ตัวเลขนี้ตรง ๆ · test ของ `app.job_notifications` ต้องสร้างข้อมูลเองใน test

**คำขอส่งออก (หน้า 15):** `EX-2026-000031` · คุณมายด์ (MARKETING) · 10 ก.ย. 2569 16:20 · `MARKETING_CAMPAIGN` · 1,850 แถว (ยินยอม MARKETING) · `REQUESTED` รอคุณแพร ／ `EX-2026-000030` · คุณเจ (BRANCH_MANAGER) · 5 ก.ย. 2569 14:05 · `MANAGEMENT_REPORT` · 412 แถว · `EXPIRED` (ดาวน์โหลดแล้ว 1 ครั้ง · ไฟล์ถูกลบ 6 ก.ย. 2569)

**คำขอมอบบทบาท (หน้า 13):** `RG-2026-0003` · ยื่นโดยคุณต้น 11 ก.ย. 2569 09:12 · ขอ `SYSTEM_ADMIN` ให้คุณโอ๊ต (`ST-0051` · INVITED 10 ก.ย. 2569) · รอ EXECUTIVE

**Audit (หน้า 16):**
| เวลา | ผู้กระทำ | action | รายการ | รายละเอียด |
|---|---|---|---|---|
| 11 ก.ย. 2569 10:20 | ST-0045 คุณขวัญ | `CONTACT_REVEALED` (access log) | CUS-2026-000297 | purpose `CALL` |
| 11 ก.ย. 2569 09:12 | ST-0003 คุณต้น | `ROLE_GRANT_REQUESTED` | RG-2026-0003 | SYSTEM_ADMIN → ST-0051 |
| 10 ก.ย. 2569 18:42 | ST-0045 คุณขวัญ | `CUSTOMER_CONTACT_UPDATED` | CUS-2025-007321 | `081-XXX-1234` → `089-XXX-5678` (A32) |
| 10 ก.ย. 2569 18:05 | ST-0020 คุณเจ | `LEAD_ASSIGNED` | LD-2026-007512 | คุณขวัญ → คุณคิม · `SHIFT_CHANGE` |
| 10 ก.ย. 2569 16:20 | ST-0011 คุณมายด์ | `EXPORT_REQUESTED` | EX-2026-000031 | 1,850 แถว |

**คำขอเจ้าของข้อมูล (หน้า 17):** ไม่มี (empty state) · **Integration (หน้า 18):** `ref.source_systems` ทุกรายการ "ยังไม่เชื่อมต่อ (Phase 4)" ยกเว้น `MANUAL`

---

## 14. หน้าจอ · เมนู · Phase

### 14.1 รายการหน้าจอ prototype

ไฟล์ `prototype/NN-id.html` · `<body data-page="id" data-roles="STAFF SUPERVISOR …">` (รหัสบทบาทเต็ม คั่นด้วยช่องว่าง)

| # | id | ชื่อหน้าจอ | กลุ่มเมนู | บทบาทที่เข้าได้ | mockup | Phase |
|---|---|---|---|---|---|---|
| 01 | `login` | เข้าสู่ระบบ | – | (ก่อนเข้าสู่ระบบ) | A01 | 1 |
| 02 | `dashboard` | หน้าหลัก | หน้าหลัก | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS MARKETING EXECUTIVE BUSINESS_ADMIN | A02 · B | 1 พื้นฐาน / 3 เต็ม |
| 03 | `customers` | ลูกค้า | ลูกค้า | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | A03 | 1 |
| 04 | `quick-capture` | เพิ่มลูกค้า | ลูกค้า | STAFF SUPERVISOR BRANCH_MANAGER BUSINESS_ADMIN | A04 · B มือถือ | 1 |
| 05 | `customer-360` | ข้อมูลลูกค้า (Customer 360) | (เปิดจากรายการ) | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | A05 · B แท็บเล็ต | 1 |
| 06 | `pipeline` | โอกาสการขาย | การขาย | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | A06 | 2 |
| 07 | `reception` | รับลูกค้าเข้าร้าน | ลูกค้าเข้าร้าน | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS | A07 | 1 |
| 08 | `tasks` | งานที่ต้องติดตาม | ติดตามงาน | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | A08 | 2 |
| 09 | `reports` | รายงาน | รายงาน | SUPERVISOR BRANCH_MANAGER OPERATIONS MARKETING EXECUTIVE BUSINESS_ADMIN | A09 | 3 |
| 10 | `mobile` | ตัวอย่างหน้าจอมือถือ | (ลิงก์จาก index) | STAFF SUPERVISOR BRANCH_MANAGER | A10 | 1 |
| 11 | `leads` | Leads | การขาย | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | – | 2 |
| 12 | `data-quality` | ศูนย์คุณภาพข้อมูล | รายงาน | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | – | 1 / 2 |
| 13 | `users` | ผู้ใช้งานและสิทธิ์ | ตั้งค่าระบบ | SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN | – | 1 |
| 14 | `master-data` | Master Data | ตั้งค่าระบบ | MARKETING (แท็บ Tag · แคมเปญ) BUSINESS_ADMIN | – | 1 |
| 15 | `exports` | คำขอส่งออกข้อมูล | ตั้งค่าระบบ | BRANCH_MANAGER MARKETING EXECUTIVE BUSINESS_ADMIN | – | 3 |
| 16 | `audit` | ประวัติการใช้งาน | ตั้งค่าระบบ | EXECUTIVE BUSINESS_ADMIN SYSTEM_ADMIN (SA: security log) | – | 1 |
| 17 | `privacy` | PDPA: ความยินยอม · คำขอเจ้าของข้อมูล | ตั้งค่าระบบ | BUSINESS_ADMIN | – | 1 |
| 18 | `settings` | ตั้งค่าระบบ · Integration | ตั้งค่าระบบ | BUSINESS_ADMIN (เกณฑ์ธุรกิจ) SYSTEM_ADMIN (เชิงเทคนิค) | – | 1 |
| 19 | `quotations` | ใบเสนอราคา | การขาย | STAFF SUPERVISOR BRANCH_MANAGER OPERATIONS EXECUTIVE BUSINESS_ADMIN | – | 2 |

ข้อตกลงของ prototype:
- หน้า 01 และ `index.html` ใช้ `data-roles=""` (`data-page="login"` / `"index"`)
- `prototype/index.html` = หน้ารวมลิงก์ + ตัวสลับผู้ใช้ · เก็บ `localStorage['jcrm.staff']` = staff_code · บทบาทได้จากข้อ 13.5 · ค่าเริ่มต้น `ST-0001`
- ผู้ใช้ตัวแทนต่อบทบาท: STAFF→`ST-0045` · SUPERVISOR→`ST-0030` · BRANCH_MANAGER→`ST-0020` · OPERATIONS→`ST-0010` · MARKETING→`ST-0011` · EXECUTIVE→`ST-0001` · BUSINESS_ADMIN→`ST-0002` · SYSTEM_ADMIN→`ST-0003` (สลับเป็น `ST-0046` `ST-0021` `ST-0050` ได้จาก index)
- หน้าแรกหลังล็อกอิน: SYSTEM_ADMIN → `18-settings` · คนอื่น → `02-dashboard`
- เปิดหน้าที่เข้าไม่ได้ → การ์ด "ไม่มีสิทธิ์เข้าหน้านี้" บอกบทบาทที่เข้าได้ · ปุ่มที่ไม่มีสิทธิ์ต้องซ่อน หรือแสดงแบบปิดพร้อมเหตุผล
- หน้า 06 07 08 11 12 ของบทบาทหลายสาขา (EX BA OP) เริ่มที่ตัวกรองสาขา JP1 · "ทุกสาขา" แสดงยอดรวมเฉพาะที่มีในข้อ 13
- ค่าที่ไม่มีในข้อ 13 แสดง `–` (ห้ามคิดตัวเลข)
- ป้ายเมนูย่อย = ชื่อหน้าจอในตาราง

### 14.2 เมนูด้านข้าง (ภาษาไทยตาม mockup A) และการจับคู่กับ A18

| กลุ่ม | หน้า | จาก A18 |
|---|---|---|
| หน้าหลัก | dashboard | Dashboard |
| ลูกค้า | customers · quick-capture | Customers |
| ลูกค้าเข้าร้าน | reception | Visitors |
| การขาย | leads · pipeline · quotations | Leads · Opportunities (มุมมองรายการในหน้า pipeline) · Pipeline · Quotations |
| ติดตามงาน | tasks | Tasks · Follow-ups (ตัวกรองประเภท) · Calendar (มุมมองปฏิทินในหน้า tasks · Phase 2 **[รอยืนยัน]**) |
| รายงาน | reports · data-quality | Reports · Branch Performance (แท็บสาขา) · Staff Performance (แท็บพนักงาน) · Data Quality |
| ตั้งค่าระบบ | users · master-data · exports · audit · privacy · settings | Master Data · Sources (แท็บใน master-data) · Users & Permissions · Audit Logs · Settings |
| (ซ่อนใน V1) | – | Customer Segments (Phase 5) · Campaigns (Phase 4) |

กลุ่มที่ไม่มีหน้าที่ผู้ใช้เข้าได้ให้ซ่อนทั้งกลุ่ม

### 14.3 แถบบน (ทุกหน้า · A22 · A26)

ช่องค้นหากลาง placeholder **"ค้นหาชื่อ เบอร์ LINE Customer ID IMEI"** → `api.search_customers` (ข้อ 6.5 · ซ่อนสำหรับ MARKETING และ SYSTEM_ADMIN) · กระดิ่งแจ้งเตือน (จำนวนที่ยังไม่อ่าน) · ชื่อ/บทบาท/สาขา · ตัวเลือกสาขา (เฉพาะผู้มีหลายสาขา) · ตัวเลือกช่วงเวลา (ข้อ 12.0) **อยู่ในหัวหน้า 02 09 12 เท่านั้น** · Serial ค้นไม่ได้ใน V1 **[รอยืนยัน]**

### 14.4 แท็บเล็ตและมือถือ (A23 · A24)

- **แท็บเล็ต (768–1279px · counter):** sidebar ย่อเป็นไอคอน · Dashboard แสดงการ์ด KPI + Funnel + งานวันนี้ (ซ่อนกราฟแนวโน้ม Top Product ตารางสาขา) · ปุ่ม "+ รับลูกค้า" ลอยมุมขวาล่าง · Customer 360 สองคอลัมน์ · ปุ่มหลักสูง ≥ 48px
- **มือถือ (< 768px):** bottom navigation 5 ช่อง `หน้าแรก` · `ลูกค้า` · **`รับลูกค้า`** (ปุ่มกลมสีส้มตรงกลาง → ฟอร์มรับลูกค้าแบบย่อ) · `งาน` · `เพิ่มเติม`
  - หน้าแรก: การ์ด **"งานทั้งหมด 12 · เกินกำหนด 4"** (D20) · ปุ่มลัด รับลูกค้า / ค้นหาลูกค้า / งานของฉัน · "ลูกค้าที่ฉันรับล่าสุด" 5 ราย (เฉพาะลูกค้า JP1 ของคุณขวัญ)
  - `เพิ่มเติม` = โอกาสการขาย · Leads · ศูนย์คุณภาพข้อมูล · ออกจากระบบ
  - หน้า reports users master-data exports audit privacy settings บนมือถือแสดง "กรุณาใช้งานบนคอมพิวเตอร์"

### 14.5 Phase และความหมายของ "V1"

| Phase | เนื้อหา (B26 · A43) |
|---|---|
| 0 | Requirement · Workflow · Data Dictionary · ERD · Permission · UX/UI · prototype (ชุดเอกสารนี้) |
| 1 | Customer Master · Quick Capture · Visit/คิว · Interaction · Customer 360 · Search · Branch · Permission/RLS · Audit · Dashboard พื้นฐาน · PDPA notice/consent/DSR · Data Quality (ซ้ำ/ไม่ครบ) · Master Data (รวม Channel/Source) · User & Permission · System Settings · Transaction ref (ผูกด้วยมือ) → **Pilot สาขา JP1 [รอยืนยัน Q2]** |
| 2 | Lead · Opportunity · Quotation · Pipeline · Follow-up/Task · Notification · Lost Reason · Campaign table |
| 3 | Dashboard เต็ม · Reports · Analytics · Export ควบคุม · Staff Performance · มิติทีม/พนักงาน/ช่องทาง |
| 4 | LINE OA · Meta · POS/Repair/Installment/Contract integration · Campaign เต็ม · online_conversations · เอกสารใน restricted |
| 5 | Segmentation · Automation · AI · Loyalty · Win-back · ลูกค้าเก่าที่มีโอกาสซื้อซ้ำ |

> **V1 = จบ Phase 3** เพราะ Acceptance (A44 · B27) ต้องใช้ข้อมูลของ Phase 2–3 · Pilot หลัง Phase 1 ใช้ชุดคำถามย่อยที่ Phase 1 ตอบได้ (D26)

### 14.6 ตารางในฐานข้อมูล (รายการตรึง)

| schema.table | Phase | จากบรีฟ (**ตัวหนา** = เปลี่ยนชื่อ/รวม) |
|---|---|---|
| `core.organizations` · `core.business_units` · `core.branches` · `core.departments` · `core.teams` · `core.team_members` · `core.devices` | 1 | organizations · branches · departments |
| `core.staff_profiles` · `core.staff_invitations` · `core.roles` · `core.permissions` · `core.role_permissions(role_code, permission_code, scope, requires_aal2)` · `core.staff_role_assignments` · `core.role_grant_requests` | 1 | staff_profiles · roles · permissions · role_permissions · **staff_branch_access → staff_role_assignments** |
| `ref.channels` · `ref.sources` · `ref.interest_types` · `ref.product_types` · `ref.lost_reasons` · `ref.visit_outcomes` · `ref.interaction_types` · `ref.task_types` · `ref.priorities` · `ref.provinces` · `ref.ownership_change_reasons` · `ref.duplicate_override_reasons` · `ref.export_reasons` · `ref.consent_purposes` · `ref.transaction_types` · `ref.source_systems` | 1 | **interaction_channels → ref.channels** · **interaction_outcomes → ref.visit_outcomes** · **lost_reasons → ref.lost_reasons** |
| `crm.customers` · `crm.customer_contacts` · `crm.customer_addresses` · `crm.customer_branches` · `crm.customer_notes` · `crm.tags` · `crm.customer_tags` · `crm.customer_consents` · `crm.customer_merges` · `crm.duplicate_decisions` · `crm.data_subject_requests` | 1 | customers … **customer_merge_history → customer_merges** · **interaction_notes → customer_notes** |
| `crm.visits` · `crm.interactions` · `crm.transaction_refs` | 1 | **visitor_sessions → visits** · interactions · **transactions · transaction_items · payment_references · service_references → transaction_refs** |
| `crm.leads` · `crm.lead_status_history` · `crm.opportunities` · `crm.opportunity_items` · `crm.opportunity_stage_history` · `crm.quotations` · `crm.quotation_items` · `crm.campaigns` | 2 | leads · lead_status_history · opportunities · opportunity_items · **opportunity_status_history → opportunity_stage_history** · quotations · quotation_items · (A28 → ownership_changes) · campaigns · **campaign_sources → campaigns.channel_code** · **attribution → leads.campaign_id** |
| `crm.tasks` · `crm.task_comments` | 2 | tasks · task_comments · **followups → tasks** · **reminders → tasks.remind_at** |
| `crm.ownership_changes` · `crm.notifications` | 1 | (A28 → ownership_changes) · notifications |
| `crm.campaign_members` · `crm.online_conversations` · `restricted.customer_documents` | 4 | campaign_members · campaign_interactions · online_conversations · customer_documents |
| `crm.segments` | 5 | – |
| `audit.audit_logs` · `audit.access_logs` · `audit.login_events` · `audit.export_requests` · `audit.integration_logs` | 1 | audit_logs · access_logs · **export_logs → export_requests** · integration_logs · **data_change_logs → audit_logs** |
| `app.settings` · `app.running_numbers` · `app.rate_limit_counters` | 1 | – |

> คอลัมน์ Phase = Phase ที่**เปิดใช้งานหน้าจอ** · migration ของ Phase 0 สร้างทุกตาราง Phase 1–3 ครบ และเรียงไฟล์ตาม dependency (enum/ตาราง → view `analytics.*` → helper/RLS → trigger → RPC) ไม่ใช่ตาม Phase · ตาราง Phase 4–5 ยังไม่สร้าง

### 14.7 Dashboard ตามบทบาท (หน้า 02 · ช่วง "30 วันล่าสุด" · ป้ายเปลี่ยนแปลงแสดงเฉพาะที่ข้อ 13 มีค่าก่อนหน้า)

| ผู้ใช้ | การ์ด (ลำดับซ้าย→ขวา) | Widget |
|---|---|---|
| EXECUTIVE · BUSINESS_ADMIN · OPERATIONS · MARKETING (ทุกสาขา) | ลูกค้าไม่ซ้ำวันนี้ 16 (+14%) · ลูกค้าไม่ซ้ำ 1,284 (+12%) · Leads 892 (+8%) · Opportunities 368 (+14%) · ปิดการขาย 215 (+18%) · Conversion (Lead → ขาย) 24.1% (+2.1 pp) | Funnel ลูกค้า · แหล่งที่มาลูกค้า (โดนัท กลาง 1,284) · เหตุผลที่ไม่สำเร็จ (5 อันดับ + อื่น ๆ) · ผลงานรายสาขา (สาขา · ลูกค้าไม่ซ้ำ · Leads · Opportunities · Sales · Conversion (Lead → ขาย) · ยอดขาย (บาท) · เปลี่ยน) · กิจกรรมล่าสุด (ซ่อนสำหรับ MARKETING) · BUSINESS_ADMIN เพิ่มแถวคุณภาพข้อมูล (Capture 87.0% · Outcome 95.4% · Follow-up 85.0% · Duplicate 0.1% · Missing 0.4%) |
| BRANCH_MANAGER คุณเจ (JP1) | ลูกค้าไม่ซ้ำวันนี้ 7 (+17%) · ลูกค้าไม่ซ้ำ 412 (+12%) · Leads 298 (+8%) · Opportunities 120 (+14%) · ปิดการขาย 82 (+19%) · Conversion (Lead → ขาย) 27.5% (+2.5 pp) | Funnel JP1 · แหล่งที่มา JP1 · เหตุผลที่ไม่สำเร็จ JP1 · **ผลงานรายพนักงาน** (ข้อ 13.6) แทนตารางสาขา · กิจกรรมล่าสุด |
| SUPERVISOR คุณนัท (ทีม JP1-SALES) | Leads 296 · Opportunities 120 · ปิดการขาย 82 · ยอดขาย ฿1,245,000 · Conversion (Lead → ขาย) 27.7% · งานเกินกำหนดของทีม 7 | ผลงานรายพนักงานในทีม · งานเกินกำหนดของทีม |
| STAFF คุณขวัญ | งานวันนี้ 8 · เกินกำหนด 4 · Lead ที่ดูแล (เปิดอยู่) 30 · โอกาสขายที่ดูแล 34 (฿731,600) · ปิดการขาย 30 วัน 44 · ยอดขาย 30 วัน ฿668,400 | รายการงานวันนี้ · ลูกค้าล่าสุดของฉัน (JP1) · ไม่มี Funnel/ตารางสาขา |

- Phase 1 "พื้นฐาน" = การ์ดลูกค้า/visit · ลูกค้าใหม่/เก่า · Capture Rate · แหล่งที่มา
- กราฟแนวโน้มรายวัน (mockup A02) และ Top Product (B16) **ไม่อยู่ใน prototype Phase 0** เพราะไม่มีข้อมูลตัวอย่าง (D44) · Top Product (Phase 3) = 5 อันดับ `product_model` จาก opportunity_items ของ SALES
- Follow-up Performance (A19) = `FOLLOWUP_COMPLETION` + จำนวนเกินกำหนด ต่อสาขา/พนักงาน

### 14.8 หน้ารายงาน (หน้า 09 · แท็บตาม mockup A09)

`ภาพรวม` (VISITS · UNIQUE_CUSTOMERS · SALES · CONV_LEAD_TO_SALE · โดนัทลูกค้าใหม่/เก่า 63.0%/37.0% · Walk-in แยกสาขา) · `ลูกค้า` (NEW/RETURNING · REPEAT_RATE · CAPTURE_RATE · IDENTIFIED_VISITS) · `การขาย` (Funnel · CLOSE_RATE · LOST_RATE · เหตุผลที่ไม่สำเร็จ · SALES_AMOUNT) · `ช่องทาง` (ข้อ 13.3 · LEAD_RATE) · `พนักงาน` (`report.staff_performance` · ข้อ 13.6) · `สาขา` (ข้อ 13.2 · 13.2b) · ปุ่ม "ส่งออก" = `report.export` (ตัวเลขรวม ไม่มี PII · ลายน้ำ · audit `REPORT_EXPORTED` · ไม่ต้องอนุมัติ)

### 14.9 หน้าอื่นที่ต้องตรึง

- **รายการลูกค้า (03):** ตัวกรอง สาขา (ในสิทธิ์ · กรองด้วย `customer_branches` · คอลัมน์ "สาขา" แสดง `last_branch_id`) · สถานะ = lifecycle + ป้ายเสริม · ช่องทาง = ช่องทางล่าสุด · ช่วงวันที่ = `last_activity_at` · **ไม่มีปุ่ม "นำเข้า" ใน V1** (นำเข้าข้อมูลเดิมครั้งเดียวด้วยสคริปต์ตาม data-migration-plan) · เลือกหลายแถว = เพิ่ม tag / ขอส่งออก (ตามสิทธิ์)
- **รับลูกค้า (07):** จำนวนลูกค้า (stepper `party_size`) · รู้จักร้านจาก (`source_code`) · วัตถุประสงค์หลัก (ชิป 7 ค่า) · ระบุลูกค้า (ถ้ามี): ค้นหา หรือ "+ สร้างลูกค้าใหม่" (เปิด quick-capture ผูก visit) · ปุ่ม "รับเข้าคิว" / "เริ่มให้บริการ" · ขวา: คิววันนี้ (ข้อ 13.11)
- **Pipeline (06):** สลับ "มุมมอง Pipeline / มุมมองรายการ" · ตัวกรอง สาขา · ประเภทสินค้า · พนักงาน · ลากการ์ดได้ตามข้อ 4.4 (เสนอราคา → รอตัดสินใจ · สนใจ → เสนอราคา/รอตัดสินใจเฉพาะเมื่อส่งใบเสนอราคาแล้ว · ห้ามย้อนเป็นสนใจ · ทิศที่ไม่อนุญาตแสดง toast เหตุผล · เมนู "ย้ายไปขั้น…" แสดงเฉพาะปลายทางที่อนุญาต) · ปิด WON/LOST ผ่าน dialog บังคับกรอก · LOST ไม่มีคอลัมน์ (ดูในมุมมองรายการ) · มุมมองรายการ: OP no · ลูกค้า · สินค้า · ขั้น · มูลค่า · next action · วันที่ · owner · สาขา
- **ใบเสนอราคา (19):** รายการ + drawer สร้าง/แก้จาก opportunity · ฟิลด์ตามข้อ 6.10 · ปุ่ม "ส่ง" (DRAFT → SENT)

---

## 15. Design System (B19 · A22)

| token | ค่า | ใช้ทำอะไร |
|---|---|---|
| `--jaun-navy` | `#0B1E41` | sidebar · หัวข้อ · ตัวอักษรบนปุ่มส้ม |
| `--jaun-orange` | `#F86E0B` | CTA หลักเท่านั้น (+ รับลูกค้า · บันทึก · สร้าง Lead · ติดตาม) · **ไม่ใช้เป็นสีกราฟ** |
| `--support-blue` | `#21417E` | ปุ่มรอง · ลิงก์ · info |
| `--light-gray` | `#EAE8E7` | เส้นแบ่ง · พื้นหลังส่วนรอง |
| `--white` | `#FBFBFB` | พื้นหลังหลัก |
| `--dark-text` | `#101828` | ตัวอักษรหลัก |

- สัดส่วน White 60% · Navy 25% · Orange 10% · Support 5% · **ส้มห้ามเป็นพื้นหลังหลัก**
- **ปุ่มพื้นส้มใช้ตัวอักษร `#0B1E41`** (5.66:1 ผ่าน AA) — ตัวอักษรขาวบนส้มตาม mockup ได้ 2.81:1 ไม่ผ่าน (D10)
- ฟอนต์ **Kanit** self-host 300/400/500/600/700 (subset ไทย+ละติน · คัดจากระบบ KPI ขององค์กร · SIL OFL 1.1) ห้ามพึ่ง Google Fonts
- Breakpoint: มือถือ < 768px · แท็บเล็ต 768–1279px · เดสก์ท็อป ≥ 1280px · เป้าสัมผัส ≥ 44px (counter ≥ 48px)
- ตัวอักษร ≥ 4.5:1 · องค์ประกอบกราฟิก ≥ 3:1 บน `#FBFBFB` · ทุกสถานะมีข้อความกำกับ ไม่สื่อด้วยสีอย่างเดียว
- ใช้ token ร่วมกับระบบ JLAS (`../ระบบการประเมินคุณเก็ต/prototype/assets/app.css`) เพื่อให้ระบบภายใน JAUN หน้าตาเดียวกัน

สีกราฟ (ค่าเริ่มต้น · `docs/06-ux/design-system.md` ปรับได้ถ้าไม่ผ่านเกณฑ์ contrast แต่ต้องคงการจับคู่):

| token | ค่าเริ่มต้น | ใช้กับ |
|---|---|---|
| `--chart-1` | `#0B1E41` | Walk-in · Funnel ขั้น Visitor |
| `--chart-2` | `#2F6FD6` | LINE · Funnel ขั้น Lead · ลูกค้าใหม่ |
| `--chart-3` | `#C2410C` | Facebook · Funnel ขั้น Opportunity |
| `--chart-4` | `#B42359` | Instagram |
| `--chart-5` | `#7C3AED` | TikTok (D49) |
| `--chart-6` | `#5B6B8C` | โทรศัพท์ · Funnel ขั้น Sale |
| `--chart-7` | `#15803D` | เว็บไซต์ · ลูกค้าเก่า |

ทุกกราฟวงกลม/funnel มีเส้นคั่น 2px สี `#FBFBFB` · legend ข้อความ (ชื่อ · จำนวน · %) ตาม `sort_order` · ปุ่ม "ดูเป็นตาราง" · ปุ่มส้มหลักคือ CTA หลัก 1 ปุ่มต่อพื้นที่ตัดสินใจ (+ รับลูกค้าทั่วระบบ) ไม่ใช้กับการลบ อนุมัติ ส่งออก ตัวกรอง หรือการนำทาง · placeholder ใช้ `--gray-600` (5.17:1)
เหตุผลที่ไม่สำเร็จ = แท่งสีเดียว (`--support-blue`) เรียงตามค่า · ป้าย lifecycle: `REPEAT`/`CUSTOMER` success · `OPPORTUNITY` warning · `LEAD` info · `LOST` danger · `IDENTIFIED` neutral · ป้ายเสริมตามข้อ 3.5

---

## 16. การตัดสินใจเมื่อบรีฟ/mockup ขัดกัน (Decision log)

| # | ประเด็น | ต้นทาง | ตัดสิน |
|---|---|---|---|
| D1 | `visitor_sessions` นับเฉพาะหน้าร้าน แต่ Traffic ต้องรวมออนไลน์ | A4 · A5 · A10 | ตาราง `crm.visits` เดียวทุกช่องทาง · กติกาข้อ 3.3 |
| D2 | Mockup A หน้า 02 "ลูกค้าเข้าร้าน 3,125 · ลูกค้าใหม่ 1,284 · ลูกค้าเก่า 892 · ปิดการขาย 215" ขัดกับ mockup B และ A19 | mockup A vs B | ความหมายตาม mockup B/A19: 1,284 = ลูกค้าไม่ซ้ำ · 892 = Leads · ใหม่/เก่า = 809/475 · การเปลี่ยนแปลงตาม mockup B |
| D3 | กลางโดนัท "แหล่งที่มา" A = 3,125 · B = 1,284 | mockup | ลูกค้าไม่ซ้ำตามช่องทางแรก → 1,284 · ส่วนของโดนัทตรงกับแถวที่มากกว่า 0 เท่านั้น |
| D4 | Close Rate = Won / Opportunity | A20 | `SALES / (SALES + LOST_OPPORTUNITIES)` |
| D5 | "Conversion" สองความหมาย: mockup B 24.1% = Sale/Lead · A41 9.1% = Sale/Visitor | mockup B · A41 | แยก `CONV_LEAD_TO_SALE` · `CONV_VISIT_TO_SALE` · ห้ามใช้คำเดี่ยว |
| D6 | การ์ด Conversion "+3.2%" (B) และ "+5.2%" (A09) หน่วยผิดและคำนวณย้อนไม่ได้ | mockup | pp จากข้อมูล: +2.1 pp |
| D7 | `tasks` กับ `followups` แยกตาราง | A10 · B12 | รวมเป็น `crm.tasks` |
| D8 | สถานะ Lead ในบรีฟรวมขั้นของ opportunity | A7 · B8 | lead 5 สถานะ + opportunity 5 ขั้น (ข้อ 4.5) |
| D9 | เลขลูกค้า 4 รูปแบบ | A12 · B13 · mockup | `CUS-YYYY-NNNNNN` · เลขตัวอย่างสอดคล้องปริมาณจริง (คุณสมชาย = `CUS-2026-000297`) |
| D10 | ปุ่มส้มตัวอักษรขาว 2.81:1 · ส้มในกราฟ | mockup | ตัวอักษร navy 5.66:1 · กราฟใช้ `--chart-3` แทนส้ม |
| D11 | Checkbox "ยินยอมให้เก็บข้อมูล (PDPA)" | mockup A04 | "แจ้งประกาศความเป็นส่วนตัวแล้ว" (บังคับ) + "ยินยอมรับข่าวสาร" (ไม่บังคับ ไม่ติ๊กไว้ก่อน) · ฟอร์มมือถือ mockup B ต้องมีทั้งสองช่อง |
| D12 | Lost reason ใน mockup B มี "รอเปรียบเทียบ · ติดเรื่องเอกสาร · เปลี่ยนรุ่น/เปลี่ยนใจ" | mockup B | รวมเป็นชุดกลาง 14 ค่า · `COMPARING` รอยืนยัน |
| D13 | A45 "41 รายไม่มีสินค้า · สาขา 2 Conversion สูงสุด · ซื้อซ้ำ 164" และ A8 "87 ราย" | A8 · A45 | ตัวอย่างประกอบ · ข้อมูลยึด mockup B (JP1 สูงสุด · `OUT_OF_STOCK` 18) · ลูกค้าเก่าที่มีโอกาสซื้อซ้ำ = Phase 5 |
| D14 | ตัวอย่าง Manager A41 (812/562/421/189/74) | A41 | ตัวอย่างประกอบ · ใช้ข้อ 13.2 |
| D15 | Staff แก้ลูกค้าได้เฉพาะ Own | A16 · B11 | คงตามบรีฟ · คำถาม Q11 |
| D16 | Scope Branch ขัดกับการตรวจซ้ำข้ามสาขา | A13 · A16 | ค้นผู้สมัครทั้งองค์กรคืนการ์ดย่อ + ผูกสาขาด้วย visit (ข้อ 6.5–6.6) |
| D17 | Customer 360 ของ mockup B ขัดกันเอง | mockup B | ไม่ใช้เป็นข้อมูลตัวอย่าง |
| D18 | Mockup A08 งานพนักงานคนเดียวมีลูกค้าหลายสาขา · A07 คิวมีเวลาหลัง "ตอนนี้" · A06 การ์ดใช้ชื่ออื่นและคุณสมชายอยู่คอลัมน์เสนอราคา | mockup A | ปรับตามข้อ 13.9–13.11 |
| D19 | ลูกค้าซื้อ 2 ครั้งติดป้าย "ลูกค้าปัจจุบัน" | mockup A05 | `REPEAT` "ลูกค้าซื้อซ้ำ" |
| D20 | มือถือ "12 งานวันนี้" · A9 "วันนี้ต้องติดตาม 13 ราย" | mockup A10 · A9 | "งานทั้งหมด 12 · เกินกำหนด 4" ตามข้อ 4.7 |
| D21 | รายการออนไลน์ไม่มีสาขา แต่ RLS ต้องมีสาขา | A5 · A30 | หน่วย `JPON` |
| D22 | บรีฟไม่ระบุว่าใครมอบ Executive/Business Admin | B10 | SYSTEM_ADMIN ยื่นคำขอ + EXECUTIVE อนุมัติ |
| D23 | ปุ่ม Google/Microsoft อาจเปิดทางสมัครเอง | mockup A01 · B10 | SSO เฉพาะบัญชีที่เชิญแล้ว + จำกัดโดเมน (ข้อ 9.2.1) |
| D24 | ช่อง "อีเมล / ชื่อผู้ใช้" แต่ Supabase ไม่รองรับ username | mockup A01 | `ST-NNNN` ผ่าน Edge Function ที่ไม่คืนอีเมล |
| D25 | ตารางย่อยในบรีฟจำนวนมาก | A10 | รวม/เปลี่ยนชื่อตามข้อ 14.6 |
| D26 | Acceptance V1 ต้องใช้ Phase 2–3 | A43 · A44 | V1 = จบ Phase 3 |
| D27 | Mockup ใช้ป้าย "เดือนนี้ (ก.ย. 2569)" กับตัวเลขชุด 30 วัน · A42 ไม่มี "30 วันล่าสุด" | mockup A02 A09 B · A42 | เพิ่ม preset `LAST_30_DAYS` เป็นค่าเริ่มต้น · ป้าย "30 วันล่าสุด" |
| D28 | ผลของ Quick Capture ไม่ชัด (สร้าง visit/lead หรือไม่) · แท็บ A04 · ช่องมือถือ B | A25 · mockup | ข้อ 6.2 |
| D29 | ชิปวัตถุประสงค์ใน A07 ไม่มี "ผ่อน" และ "อุปกรณ์เสริม" | mockup A07 | แสดงครบ 7 ค่า |
| D30 | แท็บ Customer 360 ต่างกัน 3 แบบ (A05 · B · A10) | mockup | แท็บชุดเดียวตามข้อ 6.8 |
| D31 | แท็บ/การ์ด "เอกสาร" ใน A05 | mockup A05 | V1 แสดงเฉพาะเลขใบเสนอราคาและเลขสัญญา ไม่มีไฟล์ |
| D32 | แผงตรวจซ้ำ A04 แสดงเบอร์เต็ม + ปุ่ม "ดูข้อมูล" สำหรับทุกผู้สมัคร | mockup A04 | การ์ดตามข้อ 6.5 · "ดูข้อมูล" เฉพาะลูกค้าที่อ่านได้ |
| D33 | A03 A05 A10 แสดงเบอร์/อีเมลเต็ม | mockup | ปิดบังเป็นค่าเริ่มต้น · เปิดผ่าน reveal |
| D34 | "จดจำฉันไว้ในระบบ" ติ๊กไว้ก่อน | mockup A01 | ไม่ยืดอายุ session · ไม่ติ๊กไว้ก่อน |
| D35 | Sidebar mockup A แสดงกลุ่ม "การตลาด" | mockup A | ซ่อนใน V1 (Phase 4) |
| D36 | A09 การ์ด 24.1% อาจอ่านเป็น "อัตราปิดการขาย" · โดนัท "ประเภทลูกค้า" | mockup A09 | การ์ด = Conversion (Lead → ขาย) · โดนัท = ลูกค้าใหม่/เก่า |
| D37 | Mockup A06 ชื่อบนการ์ด | mockup A06 | ใช้ข้อ 13.9 |
| D38 | A03 มีปุ่ม "นำเข้า" | mockup A03 | ไม่มีใน V1 (สคริปต์นำเข้าครั้งเดียว) |
| D39 | "Service Type" ใน A14/B15 | A14 · B15 | ใช้ `ref.interest_types` + `ref.transaction_types` |
| D40 | A2/B2 มีขั้น "Identified" ใน funnel | A2 · A19 · B2 | Funnel 4 ขั้นตาม mockup B · IDENTIFIED_VISITS และ CAPTURE_RATE แสดงในรายงานแท็บลูกค้า |
| D41 | "ลูกค้าวันนี้ 42 +16%" ที่ 10:24 น. สูงเกินกว่าที่เกิดได้จริงใน 24 นาทีของเวลาทำการ | mockup B | ลูกค้าไม่ซ้ำวันนี้ 16 (+14%) ตามข้อ 13.11 |
| D42 | รูปถ่ายลูกค้าใน A05 A10 B | mockup | ไม่เก็บรูป · avatar ตัวอักษรย่อ |
| D43 | "Password Policy" และห้ามใช้รหัสซ้ำ | A34 | ตัดกติกาห้ามซ้ำ (บังคับไม่ได้บน Supabase Auth) · ใช้ความยาว + leaked password protection |
| D44 | กราฟแนวโน้มรายวัน (A02) และ Top Product (B16) | mockup A02 · B16 | ไม่อยู่ใน prototype Phase 0 · สเปกอยู่ข้อ 14.7 |
| D45 | ตัวอย่าง Audit A32 ลงวันที่ 15 ก.ย. หลัง "ตอนนี้" · A28 ตัวอย่าง "15 Sep ขวัญ → คิม" | A28 · A32 | ย้ายเป็น 10 ก.ย. 2569 ตามข้อ 13.14 |
| D46 | ลูกค้าแถว 5 ใน A03 ช่องทาง "โทรศัพท์" แต่ป้าย "ยังไม่ได้ติดต่อ" (โทรเข้ามาแปลว่าคุยสดแล้ว) | mockup A03 | เปลี่ยนช่องทางเป็น TikTok (ข้อ 4.3) |
| D47 | บรีฟไม่มีกติกาแยกช่องทางคุยสด/ข้อความสำหรับสถานะเริ่มต้นของ lead | A7 · A20 | ข้อ 4.3 และ `LEAD_RESPONSE_MIN` ใช้เฉพาะช่องทางข้อความ |
| D48 | ข้อ 14.9 (v2.1) ให้ลากการ์ดย้อนเป็น "สนใจ" ได้ ขัดกับนิยามขั้นในข้อ 4.4 | 14.9 · 4.4 | ห้ามย้อนเป็น INTERESTED · ลากได้เฉพาะทิศที่ข้อ 4.4 อนุญาต |
| D49 | `--chart-5` `#101828` แทบแยกจาก `--chart-1` ไม่ได้ (1.07:1) | ข้อ 15 (v2.1) | เปลี่ยน TikTok เป็น `#7C3AED` (5.51:1 บนพื้น) |
| D50 | ป้าย "รู้จักร้านจาก Facebook" ใน 13.7 ต่างจาก `ref.sources.FACEBOOK_PAGE` = "เพจ Facebook" | 6.8 · 13.7 | prototype แสดงตาม 13.7 · ระบบจริงใช้ `label_th` |
| D51 | acceptance ข้อ "สนใจอะไร" ไม่มี KPI รวม | A44 | ตอบระดับรายการ (Customer 360 · การ์ด pipeline · `interest_code`) ใน V1 · รายงานรวมตามความสนใจ = Phase 3 **[รอยืนยัน]** |
| D52 | ข้อ 6.2 ข้อ 3 สร้าง lead อัตโนมัติตอน Quick Capture แต่ Phase 1 เลื่อน Lead/Opportunity/Follow-up ไป Phase 2 | 6.2 · 20.3 · 20.12 | **Phase 1 ไม่สร้าง lead** — `api.quick_capture` รับ `create_lead = false` (ปิดได้อย่างเดียว) · เหตุผลชี้ขาด: lead ที่เกิดเองจะสร้าง task `is_next_action` ตามมาด้วย (trigger `trg_sync_next_action_task`) แต่หน้าจองานติดตาม (08) อยู่ Phase 2 พนักงานจึงมีงานค้างที่มองไม่เห็นและปิดไม่ได้ · ผลข้างเคียงที่ยอมรับ: ผล visit `FOLLOW_UP` ใช้ไม่ได้ใน Phase 1 |

---

## 17. คำถามที่ต้องให้เจ้าของโครงการยืนยัน

> **กติกาสถานะ (Direction 22 ก.ย. 2569):** แถวที่ยังเป็น 🟡 ใช้ "ค่าที่ใช้ไปก่อน" เดินงานต่อได้ แต่ยังเป็น **รอยืนยัน**
> **ห้ามเปลี่ยนสถานะเป็น Final Decision เอง** ไม่ว่าจะผ่านการทดสอบ การรีวิว หรือมีโค้ดที่ใช้ค่านั้นแล้วก็ตาม — ต้องให้เจ้าของโครงการยืนยันเป็นลายลักษณ์อักษรเท่านั้น

| # | คำถาม | ค่าที่ใช้ไปก่อน | สถานะ |
|---|---|---|---|
| Q1 | "ระบบ Login/สิทธิ์ที่กำลังพัฒนาอยู่" (A10) คือระบบใด และจะเป็นระบบกลางจริงหรือไม่ · พนักงานทุกคนมีรหัสพนักงาน HR หรือไม่ | CRM มี `core` ของตัวเอง ออกแบบให้ sync/แทนที่ได้ · `employee_code` NOT NULL (ห้ามซ้ำในบัญชีที่ไม่ใช่ DISABLED ตามข้อ 7.1) | 🟢 **ยืนยันทิศทางแล้ว 22 ก.ย. 2569** — ยึด Login กลาง · CRM ไม่มีโครงบัญชีซ้ำ · Technical detail แยกเป็น Identity Contract (ข้อ 20.2) |
| Q2 | สาขา pilot | JP1 | 🟢 **ยืนยันแล้ว 22 ก.ย. 2569** — pilot JAUNPHONE 1 สาขาเดียว (ข้อ 20.3) |
| Q3 | ทีมออนไลน์ส่วนกลางมีจริงหรือแอดมินสังกัดสาขา · การส่งต่อรายการจาก JPON ไปสาขาทำโดยใคร | มี `JPON` · ย้ายสาขาต้องมี assign ทั้งสองฝั่ง | 🟡 รอยืนยัน |
| Q4 | เวลาทำการของแต่ละสาขา | 10:00–21:00 | 🟡 รอยืนยัน |
| Q5 | บริษัทใช้ Google Workspace หรือ Microsoft 365 | รองรับทั้งสองแบบเฉพาะโดเมนที่อนุญาต | 🟡 รอยืนยัน |
| Q6 | แพ็กเกจ Supabase (Pro หรือ Team · lockout ด้วย hook ต้อง Team) และ region | Pro + PITR · Singapore | 🟡 รอยืนยัน |
| Q7 | เพดานการส่งออก (ข้อ 8.2) | ตามตาราง | 🟡 รอยืนยัน |
| Q8 | ระยะเวลาเก็บข้อมูล (ข้อ 10.3) และผู้ทำหน้าที่ DPO | ตามตาราง | 🟡 **ยังไม่ยืนยัน** — ผู้ทำหน้าที่ DPO เป็น Decision ด้าน Governance · **ห้ามบล็อกการพัฒนา Phase 1** (ข้อ 20.4) |
| Q9 | ข้อความประกาศความเป็นส่วนตัวฉบับ `PN-2026-01` | ต้องให้ฝ่ายกฎหมายร่าง | 🟡 รอยืนยัน |
| Q10 | `COMPARING` เป็นเหตุผลปิดหรือสถานะติดตาม | เหตุผลปิด | 🟡 รอยืนยัน |
| Q11 | ให้ Staff "เติมช่องที่ว่าง" ของลูกค้าที่ไม่ใช่ของตนได้หรือไม่ | ไม่ได้ | 🟡 รอยืนยัน |
| Q12 | SLA ตอบ Lead · รอคิว · opportunity ไม่เคลื่อนไหว | 30 นาที · 15 นาที · 7 วัน | 🟡 รอยืนยัน |
| Q13 | รายชื่อ sources · product types · tags · interaction types ที่ใช้จริง | ตามข้อ 5 | 🟡 รอยืนยัน |
| Q14 | ระบบ POS / ซ่อม / ผ่อน / สัญญา ที่มีอยู่ชื่ออะไร มี API หรือไม่ · รูปแบบเลขใบเสร็จ | `ref.source_systems` ตามข้อ 5.7 | 🟡 รอยืนยัน |
| Q15 | จำนวนบัญชี LINE OA / เพจ Facebook | รอยืนยัน | 🟡 รอยืนยัน |
| Q16 | ต้องเก็บเลขบัตรประชาชนใน CRM จริงหรือให้อยู่ระบบสัญญา | ไม่เก็บใน V1 | 🟡 รอยืนยัน |
| Q17 | JAUNPHONE กับ JAUN POWER MONEY เป็นนิติบุคคลเดียวกันหรือไม่ (ผลต่อ consent และการเปิดเผยข้อมูล) | ถือเป็น controller เดียว จนกว่ายืนยัน | 🟡 รอยืนยัน |
| Q18 | วันเริ่มสัปดาห์ · ปีบัญชี/ไตรมาส | จันทร์ · ไตรมาสปฏิทิน | 🟡 รอยืนยัน |
| Q19 | ต้องการให้ online visit เกิดเมื่อข้อความแรกของวัน หรือทุกบทสนทนาใหม่ | ข้อความแรกต่อช่องทางต่อวันธุรกิจ | 🟡 รอยืนยัน |
| Q20 | Phase 4 จะดึงข้อความ LINE/Meta อัตโนมัติหรือไม่ | รอยืนยัน | 🟡 รอยืนยัน |
| Q21 | นาที Lead Response นับนาทีปฏิทินหรือเวลาทำการ | นาทีปฏิทิน | 🟡 รอยืนยัน |
| Q22 | อนุญาตให้คนเดียวถือ MARKETING และ BUSINESS_ADMIN หรือไม่ | ไม่อนุญาต | 🟡 รอยืนยัน |
| Q23 | คำขอส่งออกของ EXECUTIVE ต้องให้ใครอนุมัติ | BUSINESS_ADMIN | 🟡 รอยืนยัน |
| Q24 | พนักงานที่ไม่มีอีเมลบริษัทจะรับคำเชิญและรีเซ็ตรหัสอย่างไร | ต้องมีอีเมล (ส่วนตัวได้) | 🟡 รอยืนยัน |
| Q25 | ใครถือสิทธิ์ Owner ของ Supabase organization (prod) | ≤ 2 คนที่ระบุชื่อ | 🟡 **ยังไม่ยืนยัน** — รอรายชื่อก่อนขึ้น production |
| Q26 | การลบข้อมูลตาม DSR ต้องมี BUSINESS_ADMIN ≥ 2 คน (ผู้ยืนยัน ≠ ผู้ดำเนินการ) · ยอมรับหรือให้ EXECUTIVE ยืนยันแทน | ต้องมี BA ≥ 2 คน | 🟢 **ยืนยันหลักการแล้ว 22 ก.ย. 2569** — ใช้ 2-person control · รายชื่อ BUSINESS_ADMIN 2 คนจะยืนยันก่อนขึ้น production (ข้อ 20.4) |
| Q27 | ระบบภายนอกควรเก็บ `customer_no` หรือ uuid เป็นกุญแจลูกค้า | `customer_no` (ลูกค้าที่ถูกรวมชี้ไป survivor) | 🟡 รอยืนยัน |
| Q28 | SUPERVISOR ควรมอบ lead ที่ไม่มี owner ได้ (v2.2 อนุญาตในสาขาที่เป็นหัวหน้าทีม) | อนุญาต | 🟡 รอยืนยัน |
| Q29 | การแก้/ยกเลิก transaction ref ที่ผูกผิด | V1 เพิ่มได้อย่างเดียว · แก้ด้วยสคริปต์ BA | 🟡 รอยืนยัน |
| Q30 | ขอบเขตการลบใน backup หลัง anonymize (restore แล้วต้องทำซ้ำ) | เก็บรายการ `customer_no` + เวลา anonymize นอกฐานข้อมูล แล้วรันซ้ำหลัง restore | 🟡 รอยืนยัน |

---

## 18. โครงสร้างไฟล์ของโครงการ (ส่งมอบ Phase 0)

```
JAUN CRM หน้าร้าน/
├── README.md · package.json
├── UX:UI/                              mockup ต้นฉบับ 2 ภาพ
├── docs/
│   ├── 00-brief/        REQUIREMENT.md · CANONICAL.md
│   ├── 01-requirement/  requirement-review.md (PRD+BRD) · user-flows.md (Workflow)
│   ├── 02-architecture/ system-architecture.md
│   ├── 03-data/         data-dictionary.md (สร้างจากฐานข้อมูล) · er-diagram.md · schema-notes.md
│   ├── 04-security/     permission-matrix.md · rls-spec.md · security-design.md (รวม Audit Spec) · pdpa.md
│   ├── 05-analytics/    kpi-definitions.md · notification-rules.md
│   ├── 06-ux/           design-system.md · sitemap-screen-specs.md
│   ├── 07-api/          api-spec.md
│   ├── 07-api/          api-spec.md · core-flow-contract.md (สัญญาสำหรับเขียน Core Flow)
│   └── 08-delivery/     roadmap.md · data-migration-plan.md · test-cases-uat.md · deployment-backup-recovery.md · phase1-plan.md · environment-setup.md
├── supabase/
│   ├── migrations/      0001_… ถึง 00NN_… (.sql) · *_cron.sql (Supabase เท่านั้น)
│   ├── seed.sql
│   └── tests/           00_harness.sql · rls_*.sql · acceptance.sql
├── prototype/           index.html · 01-login.html … 19-quotations.html · assets/
├── web/                 แอป Next.js 16 (Phase 1 · เริ่มจาก Core Flow) — โครงไฟล์ตาม architecture §6.1
│   ├── src/app/         (auth)/login · (app)/dashboard · (app)/reception · (app)/customers/new
│   ├── src/features/    auth · shell · reception · capture
│   ├── src/lib/         db/ (ทางเข้าฐานข้อมูลทางเดียว) · access.ts · env.ts · session.ts · labels.ts · format/
│   └── scripts/         sync-design.mjs (คัดลอก CSS + ฟอนต์จาก prototype ตอน build)
└── tools/
    ├── db/              run.mjs · supabase-shim.sql · gen-seed.mjs · gen-data-dictionary.mjs · anonymize.sql
    │                    dev-api.mjs (ฐานข้อมูลทดลองในเครื่อง · พูดภาษา PostgREST · ใช้ตอนพัฒนาเท่านั้น)
    └── check-prototype.mjs · check-canonical.mjs · serve-prototype.mjs
```

เอกสาร 20 ชุดตาม A45 ↔ ไฟล์: 01 PRD · 02 BRD → `requirement-review.md` · 03 → `permission-matrix.md` · 04 → `user-flows.md` · 05 · 06 → `sitemap-screen-specs.md` · 07 → `data-dictionary.md` · 08 → `er-diagram.md` · 09 → `supabase/migrations/` + `schema-notes.md` · 10 → `api-spec.md` · 11 → `rls-spec.md` · 12 → `security-design.md` · 13 → `pdpa.md` · 14 → `kpi-definitions.md` · 15 → `notification-rules.md` · 16 → `data-migration-plan.md` · 17 · 18 → `test-cases-uat.md` · 19 · 20 → `deployment-backup-recovery.md`

---

## 19. ข้อตัดสินรายละเอียดจากผู้สร้างรอบแรก (v2.2 · มีผลบังคับเท่ากับข้ออื่น)

ผู้สร้าง Phase 0 รอบแรกพบช่องว่าง ~180 จุดและเลือกทางที่สอดคล้องกับ CANONICAL ข้อที่ตัดสินแล้วแก้ในเนื้อหาข้างบน ส่วนที่เหลือถือเป็นมาตรฐานตามรายการนี้ · **ถ้าข้อ 19 ขัดกับข้ออื่น ให้ข้ออื่นชนะ**

### 19.1 ฐานข้อมูล (แหล่งจริง = `supabase/migrations/0001–0009`)

1. ชุดค่าปิดที่ไม่อยู่ในข้อ 4.8 (`lifecycle_stage` `created_via` `branch_type` `verification_method` `customer_type` สถานะคำขอบทบาท) ใช้ `text` + CHECK ชื่อคงที่
2. การยกเลิกสิทธิ์ EXECUTE ของ PUBLIC ใช้ `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` แบบทั้งฐาน → **ทุกฟังก์ชันที่ authenticated/service_role เรียกตรง (helper ใน policy · api RPC · ฟังก์ชันที่ INVOKER code เรียก) ต้อง GRANT EXECUTE เอง**
3. ป้าย `pii` เก็บเป็น COMMENT ที่ขึ้นต้น `[pii]` · data dictionary, audit masking และ anonymize อ่านจากป้ายนี้
4. `label_en` ว่างได้ (ว่าง = รอยืนยัน) · ค่า `is_system` ตาม `0003_ref.sql` · ธงความหมาย (`creates_lead` `counts_as_purchase` `is_live` `is_marketing` `controller_entity`) ตั้งตอนเพิ่มค่า แก้ภายหลังได้ด้วย migration เท่านั้น
5. `crm.customer_addresses`: คอลัมน์ซ่อน `address_line` `subdistrict` `postal_code` · แสดง `district` `province_code` `value_masked` (`{อำเภอ} · {จังหวัด}`) · เปิดเต็มผ่าน `api.reveal_address`
6. `customer_notes.branch_id NOT NULL` · `quotations.customer_id/branch_id` และ `tasks.due_at` NOT NULL (คัดลอกจากแม่ด้วย trigger)
7. `duplicate_decisions.matched_rules` เก็บข้อความเหตุผลบนการ์ด (รหัสกฎ **[รอยืนยัน]**) · CHECK `score >= 70`
8. `export.limits` = `{ROLE: {max_rows, per_day, approver_role}}`
9. ค่าที่ส่งเข้า trigger ผ่าน transaction-local setting: `app.status_reason` · `app.audit_reason` · `app.actor_type` · `app.actor_label` · `app.actor_staff_id` (service_role เท่านั้น) · `app.bulk` · `app.seed_mode` · `app.audit_redaction`
10. `app.is_seed_mode()` = `app.seed_mode = 'on'` และ role GUC = `none` และ session user เป็น superuser/postgres (PGlite ใช้ `web_user`)
11. เมื่อ `app.bulk = on` ข้าม: lifecycle · next-action sync · NEW→CONTACTED อัตโนมัติ · QUOTATION อัตโนมัติ · แคช `last_*`/`has_*` · การแจ้งเตือน `*_ASSIGNED` — งาน bulk เรียก `app.refresh_customer_activity` และ `app.refresh_customer_lifecycle` ท้ายงาน
12. visit: `COMPLETED`/`LEFT` ต้องมี `ended_at` · `WAITING` เฉพาะ WALK_IN · `IN_SERVICE` ต้องมี owner และ `service_started_at` · `UNRECORDED` เฉพาะ `closed_by_system`
13. audit: `audit_retention` ได้ SELECT/DELETE เฉพาะตาราง log · `deny_change` อนุญาต DELETE เมื่อแถวเก่ากว่าระยะเก็บเท่านั้น · `export_requests` เป็นตาราง workflow (ป้องกันด้วย GRANT + trigger สถานะ) · TRUNCATE ทำได้เฉพาะ project ทิ้งหลังปิด trigger

### 19.2 สิทธิ์และ RLS (แหล่งจริง = `docs/04-security/rls-spec.md`)

1. คอลัมน์ `organization_id` `created_by` `updated_*` เติมด้วย DEFAULT + trigger `trg_90_stamp_row`
2. visit/interaction: `channel_code` `started_at` `direction` `visit_id` เปลี่ยนไม่ได้ · visit ที่ปิดแล้วตั้ง `customer_id` ได้จาก NULL เท่านั้น (เปลี่ยนลูกค้าที่ระบุแล้วต้อง `visit.update` scope ≥ T) · interaction ต้นทางเปลี่ยน `customer_id` ไม่ได้
3. lead/opportunity ที่ปิดแล้วเป็นอ่านอย่างเดียวจนกว่าจะ reopen · task `DONE`/`CANCELLED` แก้ไม่ได้ · task `is_next_action` แก้ owner/branch/due/ประเภทตรงไม่ได้
4. `customer_id` และลิงก์แม่ของรายการกิจกรรมแก้ไม่ได้ (ย้ายได้เฉพาะ merge) · `leads.channel_code` `first_contacted_at` `quotations.sent_at` `valid_until` ตั้งโดยระบบ
5. interaction `INBOUND` ที่ INSERT ตรงต้องมี `visit_id` ของ visit ที่เปิดอยู่สาขาเดียวกัน · นอกนั้นใช้ `api.open_visit`
6. `transaction_refs` INSERT ได้อย่างเดียว (`source_system_code = 'MANUAL'`)
7. `core.roles` `core.permissions` `core.role_permissions` อ่านได้โดยพนักงาน ACTIVE ทุกคน · `campaign.read` ทุก scope เห็นแคมเปญทั้งองค์กร
8. CI ตรวจ view `security_invoker` เฉพาะ schema ของโครงการ (`api` `crm` `core` `ref` `app` `analytics` `audit` `restricted`)

### 19.3 เวิร์กโฟลว์ (แหล่งจริง = `docs/01-requirement/user-flows.md`)

1. `api.open_visit` แนบหรือเปิด visit: จับคู่ `customer_id` (หรือ visit นิรนามที่พนักงานเลือก) + `channel_code` + `branch_id` + วันธุรกิจ กับ visit `IN_SERVICE` · ไม่สร้าง lead อัตโนมัติ (UI เสนอปุ่ม "สร้าง Lead")
2. `api.quick_capture` รับ `visit_id` ของ visit ที่เปิดอยู่ได้ (หน้า 07 "+ สร้างลูกค้าใหม่" → หน้า 04 `?visit={visit_no}`) และคำนวณผู้สมัครซ้ำใหม่ฝั่ง server
3. `api.close_visit` กับ `NOT_INTERESTED` รับ `lost_reason_code` แล้วปิด lead ที่เปิดจาก visit นั้นเป็น LOST ในทรานแซกชันเดียว (ไม่มีเหตุผล = ปฏิเสธ) · `LEFT` = `api.close_visit` ด้วย `LEFT_BEFORE_SERVICE` · แก้ outcome วันเดียวกัน = เรียกซ้ำ
4. โหมด "เพิ่มลูกค้า" (ไม่มี visit) ปุ่ม "ใช้ลูกค้าเดิม" ของลูกค้านอกขอบเขตแสดงแบบปิดพร้อมเหตุผล "ผูกลูกค้าจากสาขาอื่นได้เฉพาะตอนรับลูกค้า"
5. ส่งใบเสนอราคา = UPDATE `status = 'SENT'` + `sent_channel_code` → trigger ตั้ง `sent_at` `valid_until` สร้าง interaction `QUOTATION_SENT` และเลื่อนขั้น
6. คำเชิญสร้าง assignment พร้อมคำเชิญ (มีผลเมื่อ ACTIVE) · บัญชีสาย SYSTEM_ADMIN ไม่มี assignment จนกว่าคำขอได้รับอนุมัติ · คำเชิญหมดอายุ = เชิญใหม่
7. merge จากเมนู Customer 360 ส่ง `p_duplicate_decision_id` เป็น NULL ได้ · ปฏิเสธลูกค้า `MERGED`/`ANONYMIZED` · ลูกค้า `legal_hold` **[รอยืนยัน]**

### 19.4 ความปลอดภัยและ PDPA (แหล่งจริง = `docs/04-security/`)

1. `app.job_retention` เป็น SECURITY INVOKER: anonymize ก่อน แล้ว `SET LOCAL ROLE audit_retention` แล้ว DELETE
2. anonymize ลูกค้าใดให้ anonymize แถว `MERGED` ที่ `merged_into_id` ชี้มาหาด้วย (วนซ้ำ) · แทนเฉพาะคีย์ PII ใน `before/after` · คอลัมน์ `reason` ของ audit ห้ามมี PII
3. ช่อง "อายุ ≥ 20 ปีหรือผู้ปกครองยินยอม" เก็บใน `evidence` · RPC ปฏิเสธ `MARKETING` GRANTED ถ้าไม่ติ๊ก
4. เซสชันเป็น HttpOnly cookie → ทุกการเรียก Supabase ที่ต้องใช้เซสชัน (รวม MFA enroll/challenge) ทำผ่าน Server Action/Route Handler
5. `MFA_ENROLLED` เขียนโดย trigger บน `auth.mfa_factors` · แพ็กเกจ DSR เก็บ bucket `exports` อายุ 24 ชม. ไม่แนบอีเมล
6. hash ใน access_logs เป็น sha256 ไม่ใส่ salt (ความเสี่ยงที่ยอมรับ · keyed hash พิจารณา Phase 3) และไม่ส่งออกนอกฐานข้อมูล

### 19.5 prototype และ UX (แหล่งจริง = `docs/06-ux/` และ `prototype/README.md`)

1. คีย์ป้ายเสริมใน data.js: `vip` · `followingUp` · `newCustomer` · `notContacted`
2. การ์ดที่ไม่มี priority ใช้ขอบกลาง `--priority-unknown` (ไม่ใช่สี NORMAL)
3. หน้า 10 แสดงมุมมองคุณขวัญเสมอพร้อมแถบอธิบาย · หน้าแรกมือถือของบทบาทอื่น = การ์ด KPI + widget แรกของบทบาทนั้น
4. วันเวลาในตารางไม่มี "น." · เวลาเดี่ยวมี "น." (`10:24 น.`)
5. `data.js` มีจังหวัดเฉพาะ `TH-10` (ฐานข้อมูลมีครบ 77)

---

## 20. Direction จากเจ้าของโครงการ · 22 ก.ย. 2569 (มีผลบังคับสูงสุด)

> ที่ใดที่ข้อนี้ขัดกับข้ออื่นในไฟล์ ให้ยึดข้อนี้ · ที่นี่คือ "สิ่งที่ยืนยันแล้ว" ส่วนที่เหลือยังเป็น **รอยืนยัน** ตามกติกาข้อ 17

### 20.1 สถานะของงานที่ส่งมอบ

Phase 0 คือ **Design + Proof เท่านั้น** ไม่ใช่ระบบ production · ฐานข้อมูล ชุดทดสอบ และ prototype ที่มีอยู่ใช้เพื่อพิสูจน์ว่ากติกาในไฟล์นี้ทำงานได้จริง ไม่ใช่ของที่จะยกขึ้นใช้งานจริงทันที

### 20.2 Identity · Login · การสร้างผู้ใช้ (แทนที่ค่าเริ่มต้นเดิมของ Q1)

**หลัก:** ยึด **ระบบ Login และสิทธิ์กลางขององค์กร** เป็นผู้มีอำนาจเรื่องตัวตนผู้ใช้ · CRM **ห้าม** สร้างโครงบัญชีผู้ใช้ซ้ำโดยไม่จำเป็น

| กติกา | ข้อกำหนด |
|---|---|
| การสมัคร | พนักงาน **ไม่สมัครเอง** · ไม่มี public sign-up (ตรงกับข้อ 1) |
| ผู้สร้างบัญชี | ผู้จัดการสร้าง/เชิญบัญชีพนักงานได้ **เฉพาะสาขาที่ตนรับผิดชอบ** |
| Branch Scope | ระบบ **ล็อกสาขาให้อัตโนมัติ** จากขอบเขตของผู้สร้าง · ห้ามพิมพ์เลือกสาขาอื่น |
| เพดานบทบาท | ผู้จัดการ **ห้ามสร้าง Role ที่สูงกว่าตัวเอง** และ **ห้ามสร้างผู้ใช้ข้ามสาขา** |
| การบังคับใช้ | บังคับที่ **ฐานข้อมูล** (RPC + RLS) ไม่ใช่ที่หน้าจอ — ดูข้อ 9 และ `docs/04-security/rls-spec.md` |

**Identity Contract (IC) — กันไม่ให้ CRM ผูกตายกับ Auth ตัวใดตัวหนึ่ง**
เทคนิคการเชื่อมกับระบบกลางยังตกลงไม่จบ จึงตรึง *สัญญา* ไว้ก่อน แล้วค่อยเลือกวิธีต่อท่อ

| # | สัญญา | ผลต่อโค้ด |
|---|---|---|
| IC-1 | CRM รู้จักผู้ใช้ผ่าน **`app.current_staff_id()`** เท่านั้น | ห้ามเรียก `auth.uid()` ตรง ๆ นอก `app.current_staff_id()` |
| IC-2 | สิทธิ์ทั้งหมดอ่านจาก **`api.get_my_access()`** (บทบาท + ขอบเขต + สาขา) | Frontend ห้ามคำนวณสิทธิ์เอง · ใช้เพื่อ "ซ่อนปุ่ม" ได้ แต่ของจริงตัดสินที่ DB |
| IC-3 | ข้อมูลที่ระบบกลางต้องส่งมาขั้นต่ำ | ตัวระบุผู้ใช้ที่ไม่ซ้ำและไม่เปลี่ยน · `employee_code` · อีเมล · สถานะทำงาน · ระดับการยืนยันตัวตน (มี MFA หรือไม่) |
| IC-4 | ข้อมูลที่ยังเป็นของ CRM | บทบาท ขอบเขต สาขา ทีม และการมอบหมายงาน (`core.*`) — เพราะเป็นความหมายเชิงธุรกิจของ CRM ไม่ใช่ของ HR |
| IC-5 | การเปลี่ยนวิธีต่อท่อ | ต้องไม่แก้ RLS หรือ RPC ใด ๆ · แก้ได้เฉพาะ `app.current_staff_id()` และงาน sync |

**ทางเลือกการต่อท่อ (ยังไม่ตัดสิน · Q1)**
A. ระบบกลางเป็น IdP → Supabase Auth ต่อผ่าน SSO/OIDC
B. ระบบกลางเป็นเจ้าของ token → CRM ตรวจ JWT ของระบบกลางโดยตรง
C. **✅ ยืนยันแล้ว 23 ก.ย. 2569 — ใช้ทางเลือกนี้ใน Phase 1** — บัญชีอยู่ใน CRM (invite-only) แล้วย้ายไป A หรือ B เมื่อระบบกลางพร้อม · เหมาะกับ pilot สาขาเดียว ผู้ใช้ไม่กี่คน และ IC-1…IC-5 ทำให้ย้ายทีหลังได้โดยไม่แตะ RLS

**ข้อบังคับที่มากับการยืนยัน:** Frontend และ RLS อ้างตัวตนผ่าน `app.current_staff_id()` / `api.get_my_access()` เท่านั้น · **ห้ามผูก Business Logic กับ Supabase Auth โดยตรง** · การใช้ทางเลือก C เป็นเรื่องชั่วคราว ไม่ใช่การยกเลิกแผนเชื่อมระบบกลาง

### 20.3 ขอบเขต Phase 1 และ Pilot

| หัวข้อ | ค่า |
|---|---|
| Pilot | **JAUNPHONE 1 สาขาเดียว** (Q2 ยืนยันแล้ว) |
| Phase 1 มี | Workflow รับลูกค้าหน้าร้าน · Visitor · Customer Master · Customer 360 · Permission · Audit · **PDPA** · Data Quality · **Dashboard พื้นฐาน** |
| Phase 1 ไม่มี | **Lead · Opportunity · Follow-up → เลื่อนเป็น Phase 2** |
| เหตุผล | ให้ของที่พนักงานหน้าร้านใช้จริงทุกวันขึ้นก่อน แล้วค่อยต่อยอดงานขาย |

หมายเหตุ: โครงฐานข้อมูลของ Lead/Opportunity/Follow-up **คงไว้ตามเดิม** (ข้อ 4 · 6 · 14.6) เพราะเวิร์กโฟลว์รับลูกค้าอ้างถึง และการตัดออกภายหลังแพงกว่า — ที่เลื่อนคือ **หน้าจอและการใช้งาน** ไม่ใช่โครงข้อมูล

### 20.4 Data Governance · PDPA

| กติกา | ข้อกำหนด |
|---|---|
| แยกบทบาท | **`BUSINESS_ADMIN` แยกขาดจาก `SYSTEM_ADMIN`** |
| System Admin | **ไม่ได้สิทธิ์ดูข้อมูลลูกค้าโดยอัตโนมัติ** — ไม่มีสิทธิ์แถวข้อมูลลูกค้าเลย (มี test คุมใน `rls_08`) |
| ลบ / ทำนิรนาม | **2-person control** — ผู้ยืนยัน ≠ ผู้ดำเนินการ · ทั้งคู่ต้องเป็น `BUSINESS_ADMIN` (Q26) |
| รายชื่อ BA 2 คน | **ยังไม่ระบุ** — เจ้าของโครงการจะยืนยันก่อนขึ้น production |
| DPO | เป็น Decision ด้าน Governance · **ห้ามใช้เป็นเหตุบล็อกการพัฒนา Phase 1** (Q8 ยังเป็นรอยืนยัน) |

### 20.5 สถานะคำถาม Q1–Q30

เรื่องอื่นที่มีค่า Default **เดินหน้าได้** แต่ต้องคง **"รอยืนยัน"** ไว้ตามเดิม
**ห้ามเปลี่ยนให้กลายเป็น Final Decision โดยอัตโนมัติ** — การที่ค่านั้นถูกใช้ในโค้ด ใน seed หรือผ่านการทดสอบแล้ว **ไม่นับเป็นการยืนยัน**

### 20.6 รอบ Review ก่อนเริ่ม Development จริง

ก่อนเขียน Frontend ต้องส่งให้เจ้าของโครงการ review **1 รอบ** ครอบคลุม 6 หัวข้อ

1. Scope Phase 1
2. หน้าจอที่จะทำ
3. Workflow หน้างาน
4. Permission Matrix
5. Acceptance Criteria
6. ลำดับ Pilot

เอกสารรอบนี้: `docs/08-delivery/phase1-plan.md`
**สถานะ: ✅ อนุมัติแล้ว 23 ก.ย. 2569** — ผลการอนุมัติและเงื่อนไขที่มาพร้อมกันอยู่ในข้อ 20.8 · เริ่มเขียน Frontend ได้

### 20.7 หลักการที่ห้ามเปลี่ยน

1. เก็บลูกค้า **ทุก Contact Point**
2. **Capture First – Enrich Later**
3. **Security อยู่ที่ Database/RLS** ไม่ใช่ที่หน้าจอ
4. ข้อมูลส่วนบุคคล **เปิดเผยเท่าที่จำเป็น**
5. **ทุก KPI คำนวณจาก Event จริง** — ห้าม Frontend คิดตัวเลขเอง

### 20.8 ผลการรีวิว Phase 1 — ✅ อนุมัติแล้ว 23 ก.ย. 2569

เจ้าของโครงการรีวิว `docs/08-delivery/phase1-plan.md` แล้วยืนยันครบทั้ง 5 ข้อ · จุดอ้างอิงในประวัติ git = tag **`phase1-plan-approved`** (Phase 1 Plan Approved / Pre-Frontend Baseline)

| # | หัวข้อ | ผล |
|---|---|---|
| 1 | ขอบเขต Phase 1 | ✅ ยืนยันตามเอกสาร · **ไม่เพิ่ม** Lead/Opportunity/Follow-up เข้ามา |
| 2 | หน้าจอ Phase 1 | ✅ ยืนยันทั้งชุด **ไม่ตัดออก** แต่ให้ทำตามลำดับ (ข้อ 20.9) · นับตามข้อ 14.1 ได้ **หน้าจอ 12 หน้า** (เอกสารรีวิวพิมพ์ 11 หน้า เป็นตัวเลขคลาดเคลื่อน รายชื่อหน้าไม่เปลี่ยน) |
| 3 | Login / Identity | ✅ ทางเลือก **C** สำหรับ pilot · ยึด Identity Contract IC-1…IC-5 ทั้งหมด |
| 4 | เกณฑ์ pilot | ✅ ยืนยัน · **เพิ่มเป้าองค์กร Capture Rate ≥ 95%** หลังระบบและพนักงานนิ่งแล้ว |
| 5 | ผู้ร่วม pilot | ✅ JAUNPHONE 1 ตามเดิม · **รายชื่อ Manager และพนักงานจะยืนยันก่อนขั้นตอนสร้าง Account/Training** |

Q อื่นที่ยังเป็น "รอยืนยัน" เดินตามค่า default ได้ตามเดิม · **ห้ามเปลี่ยนสถานะเป็น Final Decision เอง** (ย้ำจากข้อ 20.5)

### 20.9 ลำดับการพัฒนา Frontend (ตรึงตามที่อนุมัติ)

ไม่ทำ 11 หน้าพร้อมกัน — แบ่งเป็น 2 ชุด

**ชุดที่ 1 · Core Flow ของพนักงานหน้างาน (ทำก่อน)**

| ลำดับ | หน้า | รหัสหน้าใน prototype |
|---|---|---|
| 1 | เข้าสู่ระบบ | 01 |
| 2 | รับลูกค้าเข้าร้าน | 07 |
| 3 | เพิ่มลูกค้า (Quick Capture) | 04 |
| 4 | รายการลูกค้า | 03 |
| 5 | Customer 360 | 05 |

**ชุดที่ 2 · ต่อจาก Core Flow**

Dashboard (02) → ศูนย์คุณภาพข้อมูล (12) → ผู้ใช้งานและสิทธิ์ (13) → ประวัติการใช้งาน/Audit (16) → PDPA (17) → Master Data (14) + ตั้งค่าระบบ (18)

**งานที่เริ่มทันทีหลัง baseline:** Environment Setup แล้วต่อด้วย Core Flow `รับลูกค้า + Quick Capture`

### 20.10 เกณฑ์ Capture Rate (ตรึงตามที่อนุมัติ)

| ช่วง | เกณฑ์ |
|---|---|
| ทดลองคู่กับกระดาษ (pilot ขั้น 3) | **≥ 80%** |
| ใช้งานจริงเต็มสาขา (pilot ขั้น 4) | **≥ 90%** |
| หลังระบบและพนักงานนิ่งแล้ว (เป้าองค์กร) | **≥ 95%** |

เกณฑ์อื่นคงเดิม: บันทึกผล visit **≥ 90%** · ส่วนต่างจากการนับมือ **< 5%** · **ไม่มี blocker ค้าง**

### 20.11 สถานะการพัฒนา (ปรับทุกครั้งที่มีของขึ้นจริง · ล่าสุด 23 ก.ย. 2569)

**ชุดที่ 1 · Core Flow หน้างาน** — ครบทั้ง 5 หน้าแล้ว (เหลือเก็บงาน Login/MFA)

| ลำดับ | หน้า | สถานะ | หมายเหตุ |
|---|---|---|---|
| 1 | เข้าสู่ระบบ (01) | 🟡 ใช้ได้บางส่วน | ฟอร์มอีเมล+รหัสผ่านพร้อม · **ยังขาด** ยืนยัน MFA · ลงทะเบียน TOTP · รับคำเชิญ/ตั้งรหัสผ่าน · เข้าด้วย `ST-NNNN` (ต้องมี Edge Function `staff-code-login`) |
| 2 | รับลูกค้าเข้าร้าน (07) | 🟢 ใช้งานได้ | รับลูกค้าด่วน · รับเข้าคิว · เริ่มให้บริการ · รับคิว · บันทึกผลปิดคิว · สรุปวันนี้จาก `api.get_kpis` · ใช้บนมือถือได้ |
| 3 | Quick Capture (04) | 🟢 ใช้งานได้ | ตรวจซ้ำอัตโนมัติ · ใช้ลูกค้าเดิม/สร้างใหม่ · consent PDPA · สร้าง Lead อัตโนมัติตามความสนใจ |
| 4 | รายการลูกค้า (03) | 🟢 ใช้งานได้ | ค้นหา · กรองสาขา/สถานะ/ช่องทาง/ติดต่อล่าสุด · เบอร์ปิดบัง · เลื่อนหน้า · ลิงก์เข้า Customer 360 |
| 5 | Customer 360 (05) | 🟢 ใช้งานได้ | ไทม์ไลน์รวม visit+interaction · ตัวเลข 4 ช่องจาก RPC · เปิดเบอร์ผ่าน `api.reveal_contact` · ความยินยอม · ประวัติการแก้ไข · แท็บ Phase 2 ปิดพร้อมป้าย |

**ชุดที่ 2** ยังไม่เริ่มทั้งหมด (02 · 12 · 13 · 16 · 17 · 14 · 18)

**สิ่งที่ยังขาดและไม่ใช่หน้าจอ**

| เรื่อง | สถานะ | ใครทำ |
|---|---|---|
| Supabase project dev/staging/prod | ยังไม่มี | เจ้าของโครงการ/IT (ต้องใช้บัญชีองค์กร) |
| `supabase/config.toml` (`supabase init`) | ยังไม่มี | ทีม Dev เมื่อมี project |
| Edge Functions 8 ตัว (ข้อ 9.8) | ยังไม่เขียน | ทีม Dev |
| `web/src/types/database.ts` | ยังไม่สร้าง | ต้องมี Supabase project ก่อน (`supabase gen types`) |
| Service worker / PWA (ข้อ 9.2) | ยังไม่ทำ | ทีม Dev |
| รายชื่อ BUSINESS_ADMIN 2 คน · ผู้จัดการและพนักงาน pilot | รอยืนยัน | เจ้าของโครงการ (ข้อ 20.8) |

**ฐานข้อมูลทดลองในเครื่อง** — `tools/db/dev-api.mjs` ยก PostgreSQL 17 (PGlite) พร้อม migration · RLS · RPC ชุดเดียวกับของจริง
ทำให้เขียนและทดสอบ Core Flow ได้โดยไม่ต้องมี Docker หรือ Supabase · **ห้ามใช้บน staging/production** (`web/src/lib/env.ts` บังคับไว้)

### 20.12 Anonymous และ Lead ใน Phase 1 — ยืนยัน 23 ก.ย. 2569

**หลักที่ตรึง: `Anonymous = Visit/Visitor` · `Customer ≠ Lead`**

| เรื่อง | ข้อกำหนด |
|---|---|
| คนที่ยังไม่รู้ตัวตน | นับเป็น **Visitor** ด้วยปุ่ม **"รับลูกค้าด่วน"** ในหน้ารับลูกค้าเข้าร้าน (07) — เปิด visit ได้ทันทีโดยไม่กรอกอะไร |
| สร้าง `Customer` | ต่อเมื่อมี **ข้อมูลระบุตัวตนขั้นต่ำ** ตามข้อ 6.2 (ชื่อหรือชื่อเล่น + ช่องทางติดต่ออย่างน้อย 1) — กติกาเดิม **ไม่แก้** |
| ปุ่ม "บันทึกแบบไม่ระบุตัวตน" ในหน้า 04 | **ตัดออก** — ขัดกับกติกาข้างบนและทำให้เกิดระเบียนลูกค้าที่ไม่มีข้อมูลระบุตัวตน ซึ่งรวมกับใครไม่ได้และทำให้ Capture Rate ดูดีเกินจริง |
| Lead อัตโนมัติตอน Quick Capture | **ปิดใน Phase 1** — `api.quick_capture` ส่ง `create_lead = false` (D52) |
| ผล visit `FOLLOW_UP` ("นัดติดตาม") | **ใช้ไม่ได้ใน Phase 1** เพราะ `api.close_visit` บังคับว่าต้องมี lead/โอกาสขายที่เปิดอยู่ · หน้าจอแสดงไว้แต่กดไม่ได้ พร้อมป้าย "(เปิดใช้ใน Phase 2)" |
| Phase 2 | กำหนด **กติกา promote** เองว่า interaction แบบใดจึงกลายเป็น Lead (เช่น สนใจซื้อ/ผ่อน · ขอใบเสนอราคา · ขอให้ติดตาม) แล้วเปิด `create_lead` คืน |

**เหตุผลทางเทคนิคที่ทำให้ต้องปิด (ไม่ใช่แค่เรื่องขอบเขต)**
lead ที่เกิดเองมี `next_action_at = now() + 30 นาที` และ trigger `app.trg_sync_next_action_task` จะสร้าง **งานติดตาม (`crm.tasks`)** ตามมาทุกใบ
Phase 1 ไม่มีหน้าจองานติดตาม (08) พนักงานจึงสะสมงานค้างที่มองไม่เห็นและปิดไม่ได้ · การแจ้งเตือน `LEAD_RESPONSE` ก็จะยิงโดยไม่มีใครรับผิดชอบ
มี test คุมแล้วที่ `supabase/tests/api_01_customer.sql` (Q20a–Q20c)
