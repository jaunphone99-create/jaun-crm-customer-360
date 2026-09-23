# Runbook ขั้นที่ 2 — Master Data และ JAUNPHONE 1

> คู่กับ `pilot-deployment-checklist.md` §4 (ที่นั่นบอก "ต้องทำอะไร ใครทำ") · ที่นี่บอก **"พิมพ์อะไร ตามลำดับไหน"**
> ทำหลังขั้นที่ 1 จบ (`pilot-step1-runbook.md`) และ **ก่อน** ขั้นที่ 3 (บัญชี Manager/Staff)
>
> ผู้ถือเอกสาร: **ผู้ดูแลระบบ (IT)** → ส่งต่อ **ผู้ดูแลข้อมูลธุรกิจ (BUSINESS_ADMIN)** ที่ §4
> สถานะ: **ร่าง — ยังไม่ได้รันบน environment จริง**

---

## 0. สิ่งที่ migration ให้มาแล้ว และสิ่งที่ยังต้องทำ

ตรวจของจริงแล้ว ไม่ใช่เดา:

| เรื่อง | สถานะหลัง `supabase db push` | ต้องทำอะไรในขั้นนี้ |
|---|---|---|
| ข้อมูลอ้างอิง `ref.*` **16 ตาราง** | 🟢 `0003_ref.sql` ใส่มาให้ครบทุกตาราง | **ตรวจและปรับ** ไม่ใช่สร้างใหม่ (§3) |
| `app.settings` **30 คีย์** | 🟢 migration ใส่ครบพร้อมค่าเริ่มต้น | ปรับค่าธุรกิจตามที่ BA ยืนยัน (§4) |
| `core.organizations` · `core.business_units` · `core.branches` | 🔴 **ไม่มีแถวใดเลย** | สร้างด้วย `bootstrap-pilot.sql` (§2) |
| `core.teams` | 🔴 ไม่มี | **ไม่ใช่ขั้นนี้** — ผู้จัดการสาขาสร้างเองในขั้นที่ 3 ผ่าน `api.save_team` |

> **จุดที่พลาดกันบ่อย:** องค์กรและสาขามีอยู่เฉพาะใน `supabase/seed.sql` ซึ่งเป็นข้อมูลสมมติและ
> **ห้ามใช้บน staging/prod** · ถ้าข้ามขั้นนี้ไป ขั้นที่ 3 จะเชิญพนักงานไม่ได้เพราะไม่มีสาขาให้ผูก

---

## 1. ยืนยันว่ากำลังต่ออยู่กับ environment ที่ตั้งใจ

```bash
cat supabase/.temp/project-ref      # ต้องตรงกับ environment ที่จะทำ
```

ถ้าไม่ตรง `supabase link --project-ref <ref ที่ถูก>` ก่อน — **ทุกคำสั่งในขั้นนี้เขียนข้อมูล**

---

## 2. สร้างองค์กร หน่วยธุรกิจ และสาขา

เปิด `tools/db/bootstrap-pilot.sql` แล้ว **แก้สามค่าบนหัวไฟล์**

| ตัวแปร | ตั้งเป็นอะไร |
|---|---|
| `v_env` | `'staging'` หรือ `'prod'` ให้ตรง project ที่ link อยู่ |
| `v_open_all` | `false` = สร้างเฉพาะ **JP1** (ค่าเริ่มต้น · สาขาที่เปิด Pilot) · `true` = สร้าง JP1–JP4 และ JPON |
| `v_notice` | เลขฉบับประกาศความเป็นส่วนตัวที่ DPO อนุมัติ · ปล่อย `NULL` ได้ถ้ายังไม่ได้ (C-13) |

> **`v_open_all` ยังรอยืนยัน C-14** · ข้อเสนอคือ `false` — เปิดสาขาที่ยังไม่มีพนักงาน
> ไม่ได้เสียหายด้านความปลอดภัย (RLS จำกัดตาม assignment อยู่แล้ว) แต่ทำให้ตัวเลือกสาขา
> บนหน้าจอมีสาขาที่ยังไม่มีข้อมูล ซึ่งชวนให้ผู้ใช้เข้าใจผิดว่าระบบเปิดใช้หลายสาขาแล้ว

คัดลอกทั้งไฟล์ไปวางใน **SQL editor** ของ project แล้วรัน

**สคริปต์นี้รันซ้ำได้** ทุกคำสั่งเป็น `ON CONFLICT DO NOTHING` — รันสองครั้งไม่สร้างซ้ำ

### ตรวจผล

สี่คำสั่งท้ายไฟล์รันให้อัตโนมัติแล้ว อ่านผลทีละชุด:

| ชุด | ต้องได้อะไร |
|---|---|
| 1 | มีแถวสาขาตามที่ตั้ง `v_open_all` · `organization = JAUN` · `business_unit = JAUNPHONE` |
| 2 | `env` ตรง environment · **prod ต้องได้ `clock = {"as_of": null}`** |
| 3 | `app.clock()` ใกล้เคียง `now()` — ถ้าเป็น 11 ก.ย. 2569 แปลว่ามีนาฬิกาค้าง = เหตุวิกฤต **AL-07** |
| 4 | ตาราง `ref.*` ครบ 16 ตาราง |

เพิ่มอีกหนึ่งชุดเพื่อยืนยันว่า audit ทำงาน:

```sql
SELECT actor_type, actor_label, action, entity_type, entity_ref, occurred_at
  FROM audit.audit_logs
 WHERE actor_label = 'bootstrap-pilot'
 ORDER BY id;
```

ต้องเห็น `ORGANIZATION_CREATED` · `BUSINESS_UNIT_CREATED` ×2 · `BRANCH_CREATED`
ทุกแถว `actor_type = 'SYSTEM'` — **ไม่ใช่ชื่อพนักงานคนใด** เพราะยังไม่มีพนักงานในระบบ

---

## 3. ตรวจข้อมูลอ้างอิง `ref.*`

`0003_ref.sql` ใส่ข้อมูลมาให้ครบแล้ว ขั้นนี้คือ **อ่านของจริงแล้วตัดสินว่าตรงกับธุรกิจไหม**

```sql
SELECT 'channels' t, code, label_th, sort_order, is_active FROM ref.channels
UNION ALL SELECT 'sources',        code, label_th, sort_order, is_active FROM ref.sources
UNION ALL SELECT 'interest_types', code, label_th, sort_order, is_active FROM ref.interest_types
UNION ALL SELECT 'product_types',  code, label_th, sort_order, is_active FROM ref.product_types
UNION ALL SELECT 'lost_reasons',   code, label_th, sort_order, is_active FROM ref.lost_reasons
UNION ALL SELECT 'visit_outcomes', code, label_th, sort_order, is_active FROM ref.visit_outcomes
ORDER BY 1, sort_order;
```

ให้ **BUSINESS_ADMIN อ่านทุกแถวและตอบว่าใช้คำนี้จริงไหม** โดยเฉพาะหกตารางที่ยังติด [รอยืนยัน] (C-12):
`ref.sources` · `ref.product_types` · `ref.interaction_types` · `ref.transaction_types` ·
`ref.source_systems` · `ref.export_reasons`

**ถ้าต้องแก้**

| ต้องการ | ทำอย่างไร | ห้ามทำ |
|---|---|---|
| เปลี่ยนคำไทยที่แสดง | `UPDATE ref.<ตาราง> SET label_th = '…' WHERE code = '…'` | – |
| เลิกใช้ค่าหนึ่ง | `UPDATE … SET is_active = false` | **ห้าม `DELETE`** — รายการเดิมที่อ้างรหัสนั้นจะพัง |
| เพิ่มค่าใหม่ | `INSERT` พร้อม `sort_order` ที่ไม่ชนของเดิม | – |
| เปลี่ยน `code` | **อย่าทำ** — `code` เป็นคีย์ที่โค้ดและ KPI อ้างถึง | – |

> การแก้ `ref.*` มี audit trigger อยู่แล้ว (0008 ครอบทุกตารางใน `ref`) จึงตามย้อนได้ที่หน้า 16

---

## 4. ตั้งค่า `app.settings`

**ห้ามแก้ด้วย SQL editor** (กติกา M10) — ยกเว้น `env` และ `clock` ที่ `bootstrap-pilot.sql` ตั้งไปแล้ว
ที่เหลือแก้ผ่านหน้า **ตั้งค่าระบบ (18)** หรือ `api.update_setting` เท่านั้น เพื่อให้มี audit `SETTINGS_UPDATED`

**ใครแก้อะไรได้** (ตรวจจากระบบจริงแล้ว)

| ผู้ใช้ | แก้ได้กี่คีย์ | คีย์ไหน |
|---|---:|---|
| `SYSTEM_ADMIN` | 3 | `env` · `clock` · `allowed_sso_domains` (`editable_by = settings.system`) |
| `BUSINESS_ADMIN` | 27 | ค่าธุรกิจทั้งหมด (`editable_by = settings.business`) |

ขั้นนี้ยังทำไม่ได้จนกว่าจะมีบัญชี BUSINESS_ADMIN (ขั้นที่ 3) — **ตั้งใจให้เป็นอย่างนั้น**
ค่าเริ่มต้นจาก migration ใช้งานได้ทันที จึงไม่บล็อกการเปิด Pilot

### ค่าที่ต้องยืนยันก่อนรับลูกค้าจริง

| คีย์ | ค่าเริ่มต้น | ต้องยืนยันเพราะ |
|---|---|---|
| `business_hours` | `{"default":["10:00","21:00"]}` | คุมการนับเวลารอและการแจ้งเตือน SLA ทั้งหมด (Q4) |
| `pdpa.current_notice_version` | `"PN-2026-01"` | ต้องตรงกับฉบับที่ DPO อนุมัติจริง (C-13) **ก่อนขอความยินยอมจากลูกค้ารายแรก** |
| `sla.*` 5 คีย์ | 15 · 15 · 30 · 15 · 60 นาที | คุมป้าย "รอนาน" และเวลาเตือน (Q12) |
| `dq.*` 3 คีย์ | 14 · 3 · 7 วัน | คุมว่ารายการไหนขึ้นศูนย์คุณภาพข้อมูล |
| `export.*` 3 คีย์ | ตามข้อ 8.2 | Phase 3 ยังไม่ใช้ · ตั้งทีหลังได้ (Q7 · Q23) |
| `dsr.anonymize_per_day` | 20 | เพดานการทำข้อมูลนิรนามต่อวัน (Q8) |

> **`pdpa.current_notice_version` เป็นคีย์เดียวในกลุ่มนี้ที่บล็อกการเปิดใช้จริง**
> ที่เหลือใช้ค่าเริ่มต้นไปก่อนแล้วปรับระหว่าง Pilot ได้ เพราะแก้แล้วมีผลทันที (D54)

---

## 5. ยืนยันว่าหน้าจอเห็นสิ่งที่เพิ่งตั้ง

หลังมีบัญชีในขั้นที่ 3 แล้ว ให้ย้อนกลับมาตรวจสองข้อนี้ — เป็นการพิสูจน์ว่า
master data ที่ตั้งไว้ไหลถึงหน้าจอจริง ไม่ใช่แค่มีแถวในตาราง

| ตรวจอะไร | ดูที่ไหน | ต้องเห็นอะไร |
|---|---|---|
| สาขา | หน้ารับลูกค้า (07) · ตัวเลือกสาขาบนหน้าหลัก (02) | มี **JAUNPHONE 1** และไม่มีสาขาที่ไม่ได้สร้าง |
| ช่องทาง | Quick Capture (04) ช่อง "รู้จักร้านจาก" | รายการตรงกับ `ref.sources` ที่ยืนยันแล้ว |
| วัตถุประสงค์ | หน้ารับลูกค้า (07) ชิปวัตถุประสงค์ | ตรงกับ `ref.interest_types` |
| ผลการให้บริการ | หน้ารับลูกค้า (07) ตอนปิดคิว | ตรงกับ `ref.visit_outcomes` |
| ค่าตั้งที่มีผลจริง | หน้าตั้งค่าระบบ (18) คอลัมน์ "มีผลกับ" | แถวที่แก้ได้ติดป้าย **มีผลจริง** ไม่ใช่ "ยังไม่มีผล" |

---

## 6. เสร็จขั้นนี้แล้วต้องได้อะไร

ติ๊ก `pilot-deployment-checklist.md` §4 ให้ครบ แล้วยืนยันสี่ข้อนี้ก่อนไปขั้นที่ 3:

- [ ] `SELECT code, name_th FROM core.branches` มี **JAUNPHONE 1**
- [ ] `SELECT key, value FROM app.settings WHERE key = 'env'` ตรง environment
- [ ] `SELECT app.clock()` เป็นเวลาจริง (prod)
- [ ] `audit.audit_logs` มีแถวของ `bootstrap-pilot` ครบตาม §2

**สิ่งที่ยังค้างได้และไม่บล็อกขั้นที่ 3**

| เรื่อง | เหตุผลที่รอได้ |
|---|---|
| ค่าธุรกิจที่ BA ต้องยืนยัน (C-11) | ต้องมีบัญชี BA ก่อน (ขั้นที่ 3) · ค่าเริ่มต้นใช้งานได้ |
| คำในตาราง `ref.*` ที่ยังรอยืนยัน (C-12) | แก้ระหว่าง Pilot ได้ · มี audit ทุกครั้ง |
| `v_open_all` เปิดสาขาอื่นหรือไม่ (C-14) | รันสคริปต์ซ้ำเพื่อเพิ่มสาขาได้ตลอด |
| `pdpa.current_notice_version` (C-13) | **บล็อกการรับลูกค้าจริง แต่ไม่บล็อกขั้นที่ 3** |
