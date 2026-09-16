# Design System — JAUN CRM · Customer 360

**ระบบ:** JAUN CRM · Customer 360 (JAUNPHONE 1–4 · ทีมออนไลน์ส่วนกลาง · JAUN POWER MONEY)
**เอกสาร:** A45 ส่วน UX · คู่กับ `docs/06-ux/sitemap-screen-specs.md`
**วันที่จัดทำ:** 16 ก.ย. 2569 · อ้างอิง **CANONICAL v2.2** (ปรับจากฉบับ v2.1 ตาม `docs/00-brief/changes/CANONICAL-v2.1-to-v2.2.diff`)
**ผู้ใช้เอกสาร:** นักพัฒนา Next.js 16 และผู้สร้าง `prototype/` — ทุก token component และกติกาข้อความในหน้าจอต้องมาจากเอกสารนี้

> **ความสัมพันธ์กับ CANONICAL**
> - สี CI 6 ค่า ฟอนต์ breakpoint เป้าสัมผัส และเกณฑ์ contrast มาจาก (CANONICAL ข้อ 15) — **ห้ามแก้ค่า** เอกสารนี้ขยายเป็น ramp และ component เท่านั้น
> - ป้าย รหัส ตัวเลข และสูตรทั้งหมดมาจาก CANONICAL · ถ้าเอกสารนี้ต้องใช้ค่าที่ CANONICAL ไม่มี เขียนว่า **รอยืนยัน** หรือระบุเป็น **ข้อเสนอของผู้ออกแบบ** ชัดเจน
> - token ramp navy/orange/gray · semantic · spacing · radius · shadow · z-index · motion · font stack **ใช้ค่าชุดเดียวกับระบบ JLAS** (`../ระบบการประเมินคุณเก็ต/prototype/assets/app.css` · ตรวจชื่อและค่าเทียบไฟล์จริงแล้ว) ตาม (CANONICAL ข้อ 15) — จุดที่ CRM ต่างจาก JLAS ติดป้าย **[CRM]** และมีเหตุผลกำกับ
> - เอกสารนี้กับ `prototype/README.md` เป็นแหล่งจริงร่วมของ prototype และ UX (CANONICAL ข้อ 19.5) · ชื่อ token ที่ `prototype/assets/app.css` ใช้ต่างจากเอกสารนี้ (กลุ่มตัวอักษร · control · layout · z-index · motion) และรายการค่าที่ต้องตรงตาม v2.2 อยู่ใน **ภาคผนวก B** — ผู้สร้างหน้าจอใช้ตารางนั้น ไม่ต้องเดา

> **สิ่งที่เปลี่ยนจากฉบับ v2.1**
> 1. `--chart-5` (TikTok) = `#7C3AED` (D49) · คำนวณตาราง contrast ใหม่ทั้งชุดด้วยสคริปต์ภาคผนวก A (ข้อ 2.6 · 2.7)
> 2. กติกากราฟ (เส้นคั่น 2px `#FBFBFB` · legend ข้อความ ชื่อ · จำนวน · % ตาม `sort_order` · ปุ่ม "ดูเป็นตาราง") · กติกาปุ่มส้ม · placeholder `--gray-600` เป็นข้อตรึงของ (CANONICAL ข้อ 15) แล้ว (ข้อ 2.2 · 2.6 · 7.1 · 7.20)
> 3. ป้ายไทยของ `audit.export_status` `crm.dsr_status` `crm.duplicate_status` `crm.consent_status` `crm.consent_capture_via` `core.role_grant_status` `crm.dsr_verification_method` มาจาก (CANONICAL ข้อ 4.8) แล้ว (ข้อ 2.5 ข)
> 4. การ์ดที่ไม่มี priority ใช้ `--priority-unknown` · คีย์ป้ายเสริม `vip` `followingUp` `newCustomer` `notContacted` · วันเวลาในตารางไม่มี "น." (CANONICAL ข้อ 19.5) (ข้อ 7.4 · 7.17 · 10.1)
> 5. การลากการ์ด Pipeline ตามข้อ 4.4 (D48) · ค้นหากลางซ่อนสำหรับ MARKETING/SYSTEM_ADMIN · เปิดดูข้อมูลติดต่อเกินเกณฑ์ = ปฏิเสธ · KPI ที่เป็น `NULL` แสดง `–` · เงินแสดงสตางค์เมื่อไม่ใช่จำนวนเต็ม (ข้อ 7.8 · 7.9 · 7.17 · 10.2)
> 6. dialog เปลี่ยนผู้รับผิดชอบผ่าน `api.assign_owner` (ข้อ 7.12) · ภาคผนวก B จับคู่กับ `prototype/assets/app.css`

---

## สารบัญ

1. [หลักการ](#1-หลักการ)
2. [สี](#2-สี)
3. [ตัวอักษร](#3-ตัวอักษร)
4. [ระยะ · มุม · เงา · ขนาด control · layout](#4-ระยะ--มุม--เงา--ขนาด-control--layout)
5. [Breakpoint · z-index · motion](#5-breakpoint--z-index--motion)
6. [CSS custom properties ฉบับเต็ม](#6-css-custom-properties-ฉบับเต็ม)
7. [Components](#7-components)
8. [Responsive](#8-responsive)
9. [Accessibility](#9-accessibility)
10. [ข้อความภาษาไทยและรูปแบบตัวเลข](#10-ข้อความภาษาไทยและรูปแบบตัวเลข)
11. [Do / Don't จาก mockup](#11-do--dont-จาก-mockup)
12. [หมายเหตุผู้เขียนและรายการรอยืนยัน](#12-หมายเหตุผู้เขียนและรายการรอยืนยัน)
13. [ภาคผนวก A · สคริปต์คำนวณ contrast](#ภาคผนวก-a--สคริปต์คำนวณ-contrast)
14. [ภาคผนวก B · จับคู่กับ prototype/assets/app.css](#ภาคผนวก-b--จับคู่กับ-prototypeassetsappcss)

---

## 1. หลักการ

| # | หลักการ | ที่มา |
|---|---|---|
| 1 | สัดส่วนสี White 60% · Navy 25% · Orange 10% · Support 5% · **ส้มห้ามเป็นพื้นหลังหลัก** | CANONICAL ข้อ 15 · A22 · B19 |
| 2 | ส้มใช้กับ **CTA หลัก 1 ปุ่มต่อพื้นที่ตัดสินใจ** (+ ปุ่ม "+ รับลูกค้า" ทั่วระบบ) · ไม่ใช้กับการลบ อนุมัติ ส่งออก ตัวกรอง หรือการนำทาง — ตัวอักษรบนส้มเป็น `#0B1E41` เสมอ (5.66:1) · **ไม่ใช้ส้มในกราฟ** | CANONICAL ข้อ 15 · D10 |
| 3 | ตัวอักษร ≥ 4.5:1 · องค์ประกอบกราฟิก/ขอบ control ≥ 3:1 บน `#FBFBFB` · ทุกคู่สีที่ใช้จริงอยู่ในตารางข้อ 2.7 | CANONICAL ข้อ 15 |
| 4 | **ไม่สื่อด้วยสีอย่างเดียว** — ทุกป้าย สถานะ ความสำคัญ และการเปลี่ยนแปลงมีข้อความหรือสัญลักษณ์กำกับ | CANONICAL ข้อ 15 |
| 5 | ข้อมูลติดต่อแสดงแบบปิดบังเป็นค่าเริ่มต้น · ค่าเต็มได้ทางเดียวผ่านปุ่ม reveal ที่บันทึกทุกครั้ง · ห้ามฝังค่าเต็มใน HTML | CANONICAL ข้อ 6.4 · D33 |
| 6 | ตัวเลขที่ไม่มีค่า แสดง `–` (U+2013) ไม่แสดง 0 แทน และไม่แสดงป้ายเปลี่ยนแปลง | CANONICAL ข้อ 1.3 · 14.1 |
| 7 | ฟอนต์ Kanit self-host 300–700 · ห้ามพึ่ง Google Fonts | CANONICAL ข้อ 15 |
| 8 | มือถือไม่ใช่เดสก์ท็อปย่อส่วน — bottom navigation + ปุ่มรับลูกค้ากลาง · แท็บเล็ตคือ counter ปุ่มใหญ่ ≥ 48px | CANONICAL ข้อ 14.4 · A23 · A24 |

---

## 2. สี

### 2.1 สี CI (ตรึง) → ตำแหน่งใน ramp

| token ใน CANONICAL | hex | ตรึงที่ ramp | ใช้ทำอะไร (CANONICAL ข้อ 15) |
|---|---|---|---|
| `--jaun-navy` | `#0B1E41` | `--navy-900` | sidebar · หัวข้อ · ตัวอักษรบนปุ่มส้ม |
| `--jaun-orange` | `#F86E0B` | `--orange-500` | CTA หลักเท่านั้น |
| `--support-blue` | `#21417E` | `--navy-700` | ปุ่มรอง · ลิงก์ · info · แท่งเหตุผลที่ไม่สำเร็จ |
| `--light-gray` | `#EAE8E7` | `--gray-200` | เส้นแบ่ง · พื้นหลังส่วนรอง |
| `--white` | `#FBFBFB` | `--gray-50` | พื้นหลังหลัก · พื้นการ์ด · พื้นกราฟ |
| `--dark-text` | `#101828` | `--gray-900` | ตัวอักษรหลัก |

ค่าที่เหลือใน ramp ไล่จาก 6 ค่านี้และ **เป็นค่าเดียวกับ JLAS ทุกค่า**

### 2.2 Ramp

#### Navy (โครงสร้าง · หัวข้อ · ลิงก์ · info)

| token | hex | ใช้ใน CRM |
|---|---|---|
| `--navy-50` | `#F2F5FA` | พื้นป้าย info · พื้น hover ของปุ่มรอง/ghost · พื้นไอคอนการ์ด KPI · พื้นเลขคิว |
| `--navy-100` | `#E1E8F3` | แถวที่ถูกเลือกในตาราง · avatar ตัวอักษรย่อ |
| `--navy-200` | `#C3D0E6` | ขอบป้าย info · หัวกลุ่มเมนูใน sidebar · ขอบการ์ดขณะ hover |
| `--navy-300` | `#94A9CE` | ข้อความลำดับสามบนพื้น navy (ไม่ใช้บนพื้นสว่าง) |
| `--navy-400` | `#5E7AAE` | ขอบ drop zone ของ kanban (ขีดประ) |
| `--navy-500` | `#3A5992` | สำรอง (ไม่มีการใช้ใน V1) |
| `--navy-600` | `#2A4A85` | ลิงก์ hover |
| `--navy-700` | `#21417E` | **`--support-blue`** · ลิงก์ · ปุ่มรอง · focus ring · ป้าย info · priority NORMAL · แท่งเหตุผลที่ไม่สำเร็จ · เมนูที่เลือก |
| `--navy-800` | `#16305E` | hover ของปุ่ม navy และเมนู |
| `--navy-900` | `#0B1E41` | **`--jaun-navy`** · พื้น sidebar · หัวข้อ · ค่า KPI · ปุ่ม navy · ตัวอักษรบนส้ม · ป้าย VIP |

#### Orange (CTA เท่านั้น · ≤ 10%)

| token | hex | ใช้ใน CRM |
|---|---|---|
| `--orange-50` | `#FFF6ED` | แถบเน้นบางเบา (≤ 1 บล็อกต่อหน้า) |
| `--orange-100` | `#FFE9D5` | สำรอง |
| `--orange-200` | `#FDCFA5` | สำรอง |
| `--orange-300` | `#FBB06B` | **focus ring บนพื้น navy** (sidebar · หน้าล็อก counter) |
| `--orange-400` | `#FA8C36` | hover ของปุ่มส้ม (สว่างขึ้น ไม่เข้มลง) |
| `--orange-500` | `#F86E0B` | **`--jaun-orange`** · พื้นปุ่มส้ม · FAB · ปุ่มกลาง bottom nav · แถบบอกเมนูที่เลือกใน sidebar |
| `--orange-600` | `#DC5A08` | ห้ามใช้เป็นพื้นปุ่มที่มีตัวอักษร navy (4.31:1) |
| `--orange-700` | `#B54708` | = `--warning-text` |
| `--orange-800` · `--orange-900` | `#92380A` · `#7A2F0B` | สำรอง |

#### Gray (พื้นผิว · ตัวอักษร · เส้น)

| token | hex | ใช้ใน CRM |
|---|---|---|
| `--gray-50` | `#FBFBFB` | **`--white`** · พื้นหน้า · การ์ด · กราฟ · top bar · bottom nav |
| `--gray-100` | `#F4F3F2` | หัวตาราง · แถว hover · พื้นคอลัมน์ kanban · แถบตัวกรอง · input ที่ปิด · ป้าย neutral |
| `--gray-200` | `#EAE8E7` | **`--light-gray`** · เส้นแบ่ง · ขอบการ์ด · track ของแถบความคืบหน้า · skeleton |
| `--gray-300` | `#D6D3D1` | ขอบป้าย neutral · ขอบซ้ายการ์ดที่ไม่มีค่า priority (ตกแต่ง) |
| `--gray-400` | `#B5B1AE` | ไอคอนตกแต่งที่ปิดใช้งาน (ห้ามเป็นตัวอักษร) |
| `--gray-500` | `#8A8683` | **ขอบ input/checkbox** (3.48:1) · ขอบ priority LOW · **ห้ามเป็นตัวอักษร** |
| `--gray-600` | `#6E6A68` | ข้อความรอง · **placeholder (CANONICAL ข้อ 15)** · แท็บที่ไม่เลือก · พื้นป้าย `+N` — ตัวอักษรบนพื้น `gray-50`/`gray-100`/พื้น semantic เท่านั้น |
| `--gray-700` | `#4E4B4A` | หัวคอลัมน์ตาราง · ข้อความรองบน `gray-200` · ป้ายแกนกราฟ · ข้อความป้าย neutral |
| `--gray-800` | `#26272B` | ป้าย label ของฟอร์ม |
| `--gray-900` | `#101828` | **`--dark-text`** · เนื้อความหลัก · tooltip |

> **placeholder:** (CANONICAL ข้อ 15) ตรึง `--gray-600` (5.17:1 · T09) · JLAS ยังใช้ `--gray-500` (3.48:1 ไม่ผ่านเกณฑ์ตัวอักษร · T15) → CRM ประกาศ `--text-placeholder: var(--gray-600)` ทับ และควรแจ้งทีม JLAS ให้ปรับตาม · `--text-disabled` ห้ามใช้เป็นสี placeholder

### 2.3 Semantic

แต่ละสถานะมี 5 ค่า: `bg` (พื้นป้าย/แถบ) · `border` (ขอบป้าย · ตกแต่ง) · `text` (ตัวอักษร/ไอคอนบน bg หรือบนพื้นหน้า) · `solid` (พื้นทึบ · จุด · เส้นขอบที่สื่อความหมาย) · `on-solid` (ตัวอักษรบน solid)

| สถานะ | bg | border | text | solid | on-solid | ใช้กับ |
|---|---|---|---|---|---|---|
| `success` | `#ECFDF3` | `#ABEFC6` | `#05603A` | `#067647` | `--gray-50` (5.49:1) | ลูกค้าซื้อซ้ำ · ลูกค้าปัจจุบัน · ผ่านเป้า · ตัวเลขเพิ่มขึ้น · บันทึกสำเร็จ |
| `warning` | `#FFFAEB` | `#FEDF89` | `#B54708` | `#DC6803` | **`--navy-900` (4.72:1)** · ห้ามขาว (3.36:1) | มีโอกาสซื้อ · ติดตามอยู่ · priority สูง · เลยเวลา · รอนาน |
| `danger` | `#FEF3F2` | `#FECDCA` | `#B42318` | `#D92D20` | `--gray-50` (4.66:1) | ไม่สำเร็จ · ยังไม่ได้ติดต่อ · priority ด่วน · เกินกำหนด · ต่ำกว่าเป้า · ตัวเลขลดลง · error |
| `info` | `--navy-50` | `--navy-200` | `--navy-700` | `--navy-700` | `--gray-50` (9.56:1) | สนใจซื้อ · ลูกค้าใหม่ · priority ปกติ · ข้อความแนะนำ |
| `neutral` | `--gray-100` | `--gray-300` | `--gray-700` | `--gray-600` | `--gray-50` (5.17:1) | รู้จักแล้ว · priority ต่ำ · ยกเลิก/หมดอายุ · `+N` |

- ค่า success/warning/danger เป็นค่าเดียวกับ JLAS (JLAS ตั้งชื่อ `critical`) · CRM ประกาศ `--danger-*` เป็น alias ของ `--critical-*` ในบล็อกข้อ 6 เพื่อให้ใช้ไฟล์ร่วมกันได้
- เขียว/แดงอยู่ในโควตา Support 5% · ใช้บอกสถานะของรายการ **ไม่ใช้บอกคุณค่าของพนักงาน** (ตารางผลงานรายพนักงานไม่ระบายสีแถว)

### 2.4 Surface · Text · Border

| token | ค่า | ใช้ |
|---|---|---|
| `--surface-page` | `--gray-50` | พื้นหน้า |
| `--surface-card` | `--gray-50` | การ์ด · drawer · dialog (แยกด้วยขอบ `--border-subtle` + `--shadow-1`) |
| `--surface-subtle` | `--gray-100` | หัวตาราง · แถบตัวกรอง · คอลัมน์ kanban · แถว hover |
| `--surface-sunken` | `--gray-200` | skeleton · track |
| `--surface-nav` | `--navy-900` | sidebar |
| `--surface-nav-hover` | `--navy-800` | เมนู hover |
| `--surface-nav-active` | `--navy-700` | เมนูที่เลือก |
| `--surface-selected` | `--navy-100` | แถวที่เลือก |
| `--surface-overlay` | `rgba(11, 30, 65, 0.55)` | scrim ของ drawer/dialog |
| `--text-primary` | `--gray-900` | เนื้อความ |
| `--text-heading` | `--navy-900` | หัวข้อ · ค่า KPI |
| `--text-secondary` | `--gray-600` | ข้อความรองบน `gray-50`/`gray-100` |
| `--text-secondary-sunk` | `--gray-700` | ข้อความรองบน `gray-200` · หัวคอลัมน์ |
| `--text-label` | `--gray-800` | label ฟอร์ม |
| `--text-link` / `--text-link-hover` | `--navy-700` / `--navy-600` | ลิงก์ |
| `--text-on-nav` / `--text-on-nav-2` | `--gray-50` / `--navy-200` | sidebar |
| `--text-on-accent` | `--navy-900` | **ตัวอักษรบนส้ม (บังคับ)** |
| `--text-placeholder` | `--gray-600` (CANONICAL ข้อ 15 · ต่างจาก JLAS) | placeholder ของ input/textarea/select |
| `--text-disabled` | `--gray-600` | control ที่ปิด (ยกเว้นจากเกณฑ์ WCAG แต่ยังอ่านได้) |
| `--border-subtle` | `--gray-200` | ขอบการ์ด · เส้นแบ่ง (ตกแต่ง) |
| `--border-default` | `--gray-300` | ขอบป้าย neutral |
| `--border-strong` | `--gray-500` | ขอบ input · checkbox (3.48:1) |
| `--border-focus` | `--navy-700` | ขอบ input ขณะ focus |

### 2.5 สีตามโดเมน

#### ก. ป้ายที่ CANONICAL กำหนดสี (ตรึง)

| กลุ่ม | code → ป้ายไทย → สถานะสี | ที่มา |
|---|---|---|
| lifecycle | `REPEAT` ลูกค้าซื้อซ้ำ → success · `CUSTOMER` ลูกค้าปัจจุบัน → success · `OPPORTUNITY` มีโอกาสซื้อ → warning · `LEAD` สนใจซื้อ → info · `LOST` ไม่สำเร็จ → danger · `IDENTIFIED` รู้จักแล้ว → neutral | ข้อ 3.4 · 15 |
| ป้ายเสริม (ลำดับตายตัว) | 1 VIP → **navy** (ทึบ `--navy-900` ตัวอักษร `--gray-50`) · 2 ติดตามอยู่ → warning · 3 ลูกค้าใหม่ → info · 4 ยังไม่ได้ติดต่อ → danger | ข้อ 3.5 |
| priority | `LOW` ต่ำ → neutral (ขอบ `--gray-500`) · `NORMAL` ปกติ → info (`--navy-700`) · `HIGH` สูง → warning (`--warning-solid`) · `URGENT` ด่วน → danger (`--danger-solid`) | ข้อ 4.7 |

`REPEAT` กับ `CUSTOMER` สีเดียวกัน และ `OPPORTUNITY` กับ "ติดตามอยู่" สีเดียวกัน — แยกด้วยข้อความและรูปทรง (ข้อ 7.4) ไม่ใช่สี

#### ข. ป้ายสถานะอื่น — ป้ายไทยตาม (CANONICAL ข้อ 4 · 4.8) · **สีเป็นข้อเสนอของผู้ออกแบบ** (CANONICAL ไม่กำหนดสี)

| enum | ค่า → สถานะสี |
|---|---|
| `crm.visit_status` | `WAITING` รอรับบริการ → warning · `IN_SERVICE` กำลังให้บริการ → info · `COMPLETED` เสร็จสิ้น → success · `LEFT` ออกก่อนรับบริการ → neutral · `CANCELLED` ยกเลิก (สร้างผิด) → neutral |
| `crm.lead_status` | `NEW` ใหม่ → danger · `CONTACTED` ติดต่อแล้ว → info · `QUALIFIED` คัดกรองแล้ว → info · `CONVERTED` แปลงเป็นโอกาสขาย → success · `LOST` ไม่สำเร็จ → danger |
| `crm.opportunity_stage` | `INTERESTED` สนใจ → info · `QUOTATION` เสนอราคา → info · `FOLLOW_UP` รอตัดสินใจ → warning · `WON` ปิดการขาย → success · `LOST` ไม่สำเร็จ → danger |
| `crm.quotation_status` | `DRAFT` ร่าง → neutral · `SENT` ส่งแล้ว → info · `ACCEPTED` ตอบรับ → success · `REJECTED` ปฏิเสธ → danger · `EXPIRED` หมดอายุ → neutral |
| `crm.task_status` | `OPEN` เปิด → info · `IN_PROGRESS` กำลังทำ → info · `DONE` เสร็จ → success · `CANCELLED` ยกเลิก → neutral · ป้ายคำนวณ "เกินกำหนด" → danger · "เลยเวลา" → warning (ข้อ 4.7) |
| `core.staff_status` | `INVITED` เชิญแล้ว → warning · `ACTIVE` ใช้งาน → success · `DISABLED` ปิดใช้งาน → neutral |
| `crm.interest_level` | `HOT` สนใจมาก → warning · `WARM` สนใจ → info · `COLD` สนใจน้อย → neutral |
| เป้าคุณภาพข้อมูล | "ผ่าน" → success · "ต่ำกว่าเป้า" → danger (ข้อ 12.3 · เทียบค่าที่ยังไม่ปัด) |
| `audit.export_status` | `REQUESTED` รออนุมัติ → warning · `APPROVED` อนุมัติแล้ว → info · `REJECTED` ไม่อนุมัติ → danger · `GENERATED` พร้อมดาวน์โหลด → success · `DOWNLOADED` ดาวน์โหลดแล้ว → success (ยังดาวน์โหลดซ้ำได้ภายในเงื่อนไขข้อ 8.2) · `EXPIRED` หมดอายุ → neutral |
| `crm.dsr_status` | `RECEIVED` รับคำขอแล้ว → info · `VERIFIED` ยืนยันตัวตนแล้ว → info · `IN_PROGRESS` กำลังดำเนินการ → warning · `COMPLETED` เสร็จสิ้น → success · `REJECTED` ปฏิเสธคำขอ → danger · ป้ายคำนวณ "ใกล้ครบกำหนด" (7 วันก่อน `due_at` · `DSR_DUE_SOON`) → warning · "เกินกำหนด" → danger |
| `crm.dsr_type` | ป้ายข้อความ neutral: `ACCESS` ขอดู/ขอสำเนา · `CORRECTION` ขอแก้ไข · `DELETION` ขอลบ · `OBJECTION` คัดค้าน · `WITHDRAW_CONSENT` ถอนความยินยอม · `PORTABILITY` ขอโอนย้าย |
| `crm.dsr_verification_method` | ข้อความ (ไม่มีป้ายสี): `IN_PERSON_ID_SIGHTED` เห็นบัตรต่อหน้า · `OTP_TO_REGISTERED_CONTACT` รหัส OTP ไปช่องทางที่ลงทะเบียน · `OTHER` อื่น ๆ |
| `crm.duplicate_status` | `PENDING` รอตัดสิน → warning · `MERGED` รวมแล้ว → success · `NOT_DUPLICATE` ยืนยันคนละคน → neutral |
| `crm.consent_status` | `GRANTED` ยินยอม/แจ้งแล้ว → success · `WITHDRAWN` ถอนแล้ว → neutral |
| `crm.consent_capture_via` | ข้อความ (ไม่มีป้ายสี): `STAFF_FORM` พนักงานบันทึก · `LINK_SENT` ส่งลิงก์ประกาศ · `LINE_OA` ผ่าน LINE OA · `WEB` ผ่านเว็บไซต์ |
| `core.role_grant_status` | `REQUESTED` รออนุมัติ → warning · `APPROVED` อนุมัติแล้ว → success · `REJECTED` ไม่อนุมัติ → danger · ชนิดคำขอ (ป้าย neutral): `GRANT` มอบ · `REVOKE` ถอน |
| สถานะระบบต้นทาง (หน้า 18 · ข้อ 13.14) | `MANUAL` "ใช้งานอยู่" → success (**ป้ายรอยืนยัน** · CANONICAL เขียนเพียงว่ายกเว้น MANUAL) · ระบบอื่น "ยังไม่เชื่อมต่อ (Phase 4)" → neutral |

#### ค. ช่องทาง (ไอคอนในไทม์ไลน์และรายการ)

`--channel-WALK_IN` … `--channel-WEBSITE` = alias ของ `--chart-1` … `--chart-7` ตามข้อ 5.1 · ใช้เป็นสีวงไอคอนขนาดเล็กเท่านั้น **และต้องมีชื่อช่องทางเป็นข้อความเสมอ**

#### ง. การเปลี่ยนแปลง (delta)

| ทิศ | สัญลักษณ์ + ข้อความ | สี (chip) |
|---|---|---|
| เพิ่มขึ้น | `▲ +12%` · `▲ +2.1 pp` | text `--success-text` บน `--success-bg` |
| ลดลง | `▼ −5%` · `▼ −0.4 pp` | text `--danger-text` บน `--danger-bg` |
| เท่าเดิม | `0%` (ไม่มีลูกศร) | text `--gray-700` บน `--gray-100` |
| ไม่มีค่าก่อนหน้า/ก่อนหน้าเป็น 0 | ไม่แสดง chip | – |

KPI ทุกตัวที่แสดง delta ใน Phase 0 เป็นแบบ "มากดี" · ถ้าอนาคตมี KPI แบบ "น้อยดี" ให้กลับสีแต่คงลูกศรและเครื่องหมายตามทิศของตัวเลข (ติด `data-inverse="true"`)

### 2.6 สีกราฟ

**ค่า (CANONICAL ข้อ 15 v2.2):** `--chart-5` (TikTok) เปลี่ยนเป็น **`#7C3AED`** ตาม D49 เพราะค่าเดิม `#101828` แทบแยกจาก `--chart-1` ไม่ได้ · ทั้ง 7 ค่าผ่าน ≥ 3:1 บน `#FBFBFB` (G01–G07 ข้อ 2.7) · การจับคู่ช่องทาง/ขั้น funnel → token คงเดิม

| token | hex | ช่องทาง (ข้อ 5.1) | Funnel | อื่น | บน `#FBFBFB` |
|---|---|---|---|---|---:|
| `--chart-1` | `#0B1E41` | Walk-in (หน้าร้าน) | Visitor | กราฟ "ลูกค้าเข้าร้านแยกตามสาขา" | 15.90:1 |
| `--chart-2` | `#2F6FD6` | LINE | Lead | ลูกค้าใหม่ | 4.64:1 |
| `--chart-3` | `#C2410C` | Facebook | Opportunity | – | 5.00:1 |
| `--chart-4` | `#B42359` | Instagram | – | – | 6.10:1 |
| `--chart-5` | `#7C3AED` | TikTok (D49) | – | – | 5.50:1 |
| `--chart-6` | `#5B6B8C` | โทรศัพท์ | Sale | – | 5.16:1 |
| `--chart-7` | `#15803D` | เว็บไซต์ | – | ลูกค้าเก่า | 4.84:1 |
| `--chart-lost` | `--support-blue` | – | – | เหตุผลที่ไม่สำเร็จ (แท่งสีเดียว · ข้อ 15) | 9.56:1 |

> ค่า 5.50:1 ของ `--chart-5` ในเอกสารนี้ตัดทศนิยมลง · D49 เขียน 5.51:1 (ปัด) — ค่าเดียวกัน (5.5069)

**กติกาบังคับของกราฟวงกลม/funnel/แท่งทุกตัว** — ข้อ 1–3 ตรึงใน (CANONICAL ข้อ 15 v2.2) · ข้อ 4–5 เป็นรายละเอียดของเอกสารนี้ · เหตุผล: สีที่อยู่ติดกันหลายคู่ยังต่ำกว่า 3:1 (ตาราง ค ข้อ 2.7 · เช่น A04 1.10:1 · A05 1.06:1 · A07 2.88:1)

1. **เส้นคั่น `2px` สี `#FBFBFB`** (`--chart-separator`) ระหว่างส่วนของโดนัท/ขั้น funnel/แท่งที่ติดกัน — ทุกส่วนจึงอยู่ติดสี `#FBFBFB` ซึ่งผ่าน ≥ 3:1 (G01–G07)
2. **legend เป็นข้อความ "ชื่อ · จำนวน · %"** ของทุกส่วน เรียงตาม `sort_order` ของ lookup (ช่องทาง = `ref.channels.sort_order` · ลูกค้าใหม่ก่อนลูกค้าเก่า · ขั้น funnel ตามลำดับขั้น) — ลำดับส่วนของโดนัทตามเข็มนาฬิกาจาก 12 นาฬิกาเท่ากับลำดับ legend (ไม่เรียงตามค่า เพื่อให้สีคงตำแหน่ง) · ยกเว้นกราฟแท่งเหตุผลที่ไม่สำเร็จเรียงตามค่า (ข้อ 5.5 · 15)
3. **ปุ่ม "ดูเป็นตาราง"** บนหัวการ์ดกราฟทุกใบ (ข้อ 7.20)
4. hover/focus บนส่วนหรือบนรายการ legend ทำให้ส่วนอื่นจาง (opacity `--chart-dim-opacity` 0.35) และแสดง tooltip ชื่อ + ค่า
5. Funnel แยกขั้นด้วยตำแหน่งแนวตั้ง + ชื่อขั้นเป็นข้อความ ไม่พึ่งสี · ส่วนที่ค่าเป็น 0 ไม่วาดและไม่อยู่ใน legend (ข้อ 13.3 · D3)

### 2.7 ตาราง contrast (คำนวณจริง)

คำนวณด้วยสูตร WCAG 2.x `(L1 + 0.05) / (L2 + 0.05)` ด้วยสคริปต์ภาคผนวก A (Node) · ค่าตัดทศนิยมลง 2 ตำแหน่ง (ไม่ปัดขึ้นให้ผ่าน · CANONICAL ข้อ 15/D10 เขียนแบบปัด เช่น T23 = 2.81:1) · **รันใหม่ 16 ก.ย. 2569 ด้วยค่าชุด v2.2** · ผลสคริปต์: "จำนวนคู่ที่ไม่ผ่านโดยไม่มีข้อยกเว้นกำกับ (ตาราง ก–ข): 0" · T53 T54 G27 G28 A12 A13 เป็นแถวใหม่ของฉบับนี้

#### ก. ตัวอักษร

| id | ใช้ที่ | ตัวหน้า | พื้น | ratio | เกณฑ์ | ผล |
|---|---|---|---|---:|---:|---|
| T01 | เนื้อความหลัก · ค่าในตาราง | `--gray-900` #101828 | `--gray-50` #FBFBFB | 17.14:1 | 4.5:1 | ผ่าน |
| T02 | เนื้อความบนพื้นรอง (หัวตาราง · แถว hover · คอลัมน์ kanban) | `--gray-900` #101828 | `--gray-100` #F4F3F2 | 16.01:1 | 4.5:1 | ผ่าน |
| T03 | เนื้อความบน `--light-gray` | `--gray-900` #101828 | `--gray-200` #EAE8E7 | 14.53:1 | 4.5:1 | ผ่าน |
| T04 | หัวข้อหน้า · ค่า KPI | `--navy-900` #0B1E41 | `--gray-50` #FBFBFB | 15.90:1 | 4.5:1 | ผ่าน |
| T05 | หัวข้อบนพื้นรอง | `--navy-900` #0B1E41 | `--gray-100` #F4F3F2 | 14.84:1 | 4.5:1 | ผ่าน |
| T06 | ลิงก์ · ปุ่มรอง · ข้อความ info | `--navy-700` #21417E | `--gray-50` #FBFBFB | 9.56:1 | 4.5:1 | ผ่าน |
| T07 | ลิงก์บนพื้นรอง | `--navy-700` #21417E | `--gray-100` #F4F3F2 | 8.92:1 | 4.5:1 | ผ่าน |
| T08 | ป้าย info (ลูกค้าใหม่ · สนใจซื้อ · ปกติ) | `--navy-700` #21417E | `--navy-50` #F2F5FA | 9.05:1 | 4.5:1 | ผ่าน |
| T09 | ข้อความรอง · แท็บที่ไม่เลือก · **placeholder (CANONICAL ข้อ 15)** | `--gray-600` #6E6A68 | `--gray-50` #FBFBFB | 5.17:1 | 4.5:1 | ผ่าน |
| T10 | ข้อความรอง/placeholder บนพื้นรอง | `--gray-600` #6E6A68 | `--gray-100` #F4F3F2 | 4.82:1 | 4.5:1 | ผ่าน |
| T11 | ข้อความรองบน `--light-gray` | `--gray-600` #6E6A68 | `--gray-200` #EAE8E7 | 4.38:1 | 4.5:1 | **ไม่ผ่าน** — ห้ามใช้ ให้ใช้ T12 |
| T12 | ข้อความรองบน `--light-gray` | `--gray-700` #4E4B4A | `--gray-200` #EAE8E7 | 7.07:1 | 4.5:1 | ผ่าน |
| T13 | หัวคอลัมน์ตาราง · ป้าย neutral | `--gray-700` #4E4B4A | `--gray-100` #F4F3F2 | 7.80:1 | 4.5:1 | ผ่าน |
| T14 | ป้ายแกน/ป้ายกำกับกราฟ | `--gray-700` #4E4B4A | `--gray-50` #FBFBFB | 8.35:1 | 4.5:1 | ผ่าน |
| T15 | gray-500 เป็นตัวอักษร/placeholder | `--gray-500` #8A8683 | `--gray-50` #FBFBFB | 3.48:1 | 4.5:1 | **ไม่ผ่าน** — ห้ามใช้เป็นตัวอักษรหรือ placeholder (เส้นขอบเท่านั้น) |
| T16 | ตัวอักษรใน sidebar · ป้าย VIP | `--gray-50` #FBFBFB | `--navy-900` #0B1E41 | 15.90:1 | 4.5:1 | ผ่าน |
| T17 | หัวกลุ่มเมนูใน sidebar | `--navy-200` #C3D0E6 | `--navy-900` #0B1E41 | 10.56:1 | 4.5:1 | ผ่าน |
| T18 | เมนูที่เลือกอยู่ · ปุ่มพื้น support-blue | `--gray-50` #FBFBFB | `--navy-700` #21417E | 9.56:1 | 4.5:1 | ผ่าน |
| T19 | เมนู hover · ปุ่ม navy hover | `--gray-50` #FBFBFB | `--navy-800` #16305E | 12.53:1 | 4.5:1 | ผ่าน |
| T20 | **ปุ่มส้ม (CTA)** | `--navy-900` #0B1E41 | `--orange-500` #F86E0B | 5.66:1 | 4.5:1 | ผ่าน |
| T21 | ปุ่มส้ม hover | `--navy-900` #0B1E41 | `--orange-400` #FA8C36 | 6.94:1 | 4.5:1 | ผ่าน |
| T22 | ปุ่มส้มเข้ม orange-600 | `--navy-900` #0B1E41 | `--orange-600` #DC5A08 | 4.31:1 | 4.5:1 | **ไม่ผ่าน** — ห้ามใช้เป็นสถานะกด ใช้ orange-500 + เงาใน |
| T23 | ตัวอักษรขาวบนส้ม (แบบ mockup) | `--gray-50` #FBFBFB | `--orange-500` #F86E0B | 2.80:1 | 4.5:1 | **ไม่ผ่าน** — ห้าม (D10) |
| T24 | ปุ่ม navy · ชิปที่เลือก | `--gray-50` #FBFBFB | `--navy-900` #0B1E41 | 15.90:1 | 4.5:1 | ผ่าน |
| T25 | ป้าย success (ลูกค้าซื้อซ้ำ · ลูกค้าปัจจุบัน · ผ่าน) | `--success-text` #05603A | `--success-bg` #ECFDF3 | 7.26:1 | 4.5:1 | ผ่าน |
| T26 | ตัวเลขเปลี่ยนแปลงขึ้น (ไม่มีพื้น) | `--success-text` #05603A | `--gray-50` #FBFBFB | 7.40:1 | 4.5:1 | ผ่าน |
| T27 | ป้าย warning (มีโอกาสซื้อ · ติดตามอยู่ · สูง · เลยเวลา) | `--warning-text` #B54708 | `--warning-bg` #FFFAEB | 5.20:1 | 4.5:1 | ผ่าน |
| T28 | ข้อความ warning บนพื้นหน้า | `--warning-text` #B54708 | `--gray-50` #FBFBFB | 5.24:1 | 4.5:1 | ผ่าน |
| T29 | ป้าย danger (ไม่สำเร็จ · ยังไม่ได้ติดต่อ · ด่วน · เกินกำหนด) | `--danger-text` #B42318 | `--danger-bg` #FEF3F2 | 6.04:1 | 4.5:1 | ผ่าน |
| T30 | ข้อความ error · ตัวเลขเปลี่ยนแปลงลง | `--danger-text` #B42318 | `--gray-50` #FBFBFB | 6.35:1 | 4.5:1 | ผ่าน |
| T31 | ชิปเปลี่ยนแปลงในเซลล์ตารางพื้นรอง (ขึ้น) | `--success-text` #05603A | `--gray-100` #F4F3F2 | 6.91:1 | 4.5:1 | ผ่าน |
| T32 | ชิปเปลี่ยนแปลงในเซลล์ตารางพื้นรอง (ลง) | `--danger-text` #B42318 | `--gray-100` #F4F3F2 | 5.93:1 | 4.5:1 | ผ่าน |
| T33 | ข้อความ warning บนพื้นรอง | `--warning-text` #B54708 | `--gray-100` #F4F3F2 | 4.89:1 | 4.5:1 | ผ่าน |
| T34 | ตัวอักษรบน success ทึบ | `--gray-50` #FBFBFB | `--success-solid` #067647 | 5.49:1 | 4.5:1 | ผ่าน |
| T35 | ตัวอักษรบน warning ทึบ | `--navy-900` #0B1E41 | `--warning-solid` #DC6803 | 4.72:1 | 4.5:1 | ผ่าน |
| T36 | ตัวอักษรขาวบน warning ทึบ | `--gray-50` #FBFBFB | `--warning-solid` #DC6803 | 3.36:1 | 4.5:1 | **ไม่ผ่าน** — ห้าม |
| T37 | ปุ่ม danger · จำนวนแจ้งเตือนบนกระดิ่ง | `--gray-50` #FBFBFB | `--danger-solid` #D92D20 | 4.66:1 | 4.5:1 | ผ่าน |
| T38 | ปุ่ม danger hover | `--gray-50` #FBFBFB | `--danger-text` #B42318 | 6.35:1 | 4.5:1 | ผ่าน |
| T39 | ป้าย neutral ทึบ (+N) | `--gray-50` #FBFBFB | `--gray-600` #6E6A68 | 5.17:1 | 4.5:1 | ผ่าน |
| T40 | tooltip | `--gray-50` #FBFBFB | `--gray-900` #101828 | 17.14:1 | 4.5:1 | ผ่าน |
| T41 | แถวที่เลือกในตาราง | `--gray-900` #101828 | `--navy-100` #E1E8F3 | 14.39:1 | 4.5:1 | ผ่าน |
| T42 | ข้อความรองบนพื้น info | `--gray-600` #6E6A68 | `--navy-50` #F2F5FA | 4.89:1 | 4.5:1 | ผ่าน |
| T43 | ข้อความรองบนพื้น warning (แถบคำเตือน PII) | `--gray-600` #6E6A68 | `--warning-bg` #FFFAEB | 5.12:1 | 4.5:1 | ผ่าน |
| T44 | ข้อความรองบนพื้น danger | `--gray-600` #6E6A68 | `--danger-bg` #FEF3F2 | 4.92:1 | 4.5:1 | ผ่าน |
| T45 | ข้อความบนแถบเน้นส้มอ่อน | `--navy-900` #0B1E41 | `--orange-50` #FFF6ED | 15.40:1 | 4.5:1 | ผ่าน |
| T46 | ป้ายกำกับในแท่ง/ส่วนกราฟ chart-1 | `--gray-50` #FBFBFB | `--chart-1` #0B1E41 | 15.90:1 | 4.5:1 | ผ่าน |
| T47 | ป้ายกำกับในแท่ง chart-2 | `--gray-50` #FBFBFB | `--chart-2` #2F6FD6 | 4.64:1 | 4.5:1 | ผ่าน |
| T48 | ป้ายกำกับในแท่ง chart-3 | `--gray-50` #FBFBFB | `--chart-3` #C2410C | 5.00:1 | 4.5:1 | ผ่าน |
| T49 | ป้ายกำกับในแท่ง chart-4 | `--gray-50` #FBFBFB | `--chart-4` #B42359 | 6.10:1 | 4.5:1 | ผ่าน |
| T50 | ป้ายกำกับในแท่ง chart-5 (TikTok · D49) | `--gray-50` #FBFBFB | `--chart-5` #7C3AED | 5.50:1 | 4.5:1 | ผ่าน |
| T51 | ป้ายกำกับในแท่ง chart-6 | `--gray-50` #FBFBFB | `--chart-6` #5B6B8C | 5.16:1 | 4.5:1 | ผ่าน |
| T52 | ป้ายกำกับในแท่ง chart-7 | `--gray-50` #FBFBFB | `--chart-7` #15803D | 4.84:1 | 4.5:1 | ผ่าน |
| T53 | ค่าที่เปิดดูชั่วคราวบนพื้นส้มอ่อน | `--gray-900` #101828 | `--orange-50` #FFF6ED | 16.61:1 | 4.5:1 | ผ่าน |
| T54 | ตัวอักษรขาวบน gray-500 (เช่นพื้น `--neutral-solid` ของ prototype) | `--gray-50` #FBFBFB | `--gray-500` #8A8683 | 3.48:1 | 4.5:1 | **ไม่ผ่าน** — ห้าม · ใช้ T39 |

#### ข. องค์ประกอบกราฟิกและขอบของ control

| id | ใช้ที่ | ตัวหน้า | พื้น | ratio | เกณฑ์ | ผล |
|---|---|---|---|---:|---:|---|
| G01 | Walk-in · Funnel Visitor | `--chart-1` #0B1E41 | `--gray-50` #FBFBFB | 15.90:1 | 3:1 | ผ่าน |
| G02 | LINE · Funnel Lead · ลูกค้าใหม่ | `--chart-2` #2F6FD6 | `--gray-50` #FBFBFB | 4.64:1 | 3:1 | ผ่าน |
| G03 | Facebook · Funnel Opportunity | `--chart-3` #C2410C | `--gray-50` #FBFBFB | 5.00:1 | 3:1 | ผ่าน |
| G04 | Instagram | `--chart-4` #B42359 | `--gray-50` #FBFBFB | 6.10:1 | 3:1 | ผ่าน |
| G05 | TikTok (D49) | `--chart-5` #7C3AED | `--gray-50` #FBFBFB | 5.50:1 | 3:1 | ผ่าน |
| G06 | โทรศัพท์ · Funnel Sale | `--chart-6` #5B6B8C | `--gray-50` #FBFBFB | 5.16:1 | 3:1 | ผ่าน |
| G07 | เว็บไซต์ · ลูกค้าเก่า | `--chart-7` #15803D | `--gray-50` #FBFBFB | 4.84:1 | 3:1 | ผ่าน |
| G08 | แท่งเหตุผลที่ไม่สำเร็จ (`--support-blue`) | `--navy-700` #21417E | `--gray-50` #FBFBFB | 9.56:1 | 3:1 | ผ่าน |
| G09 | ขอบ input · checkbox · stepper | `--gray-500` #8A8683 | `--gray-50` #FBFBFB | 3.48:1 | 3:1 | ผ่าน |
| G10 | ขอบ input บนพื้นรอง | `--gray-500` #8A8683 | `--gray-100` #F4F3F2 | 3.25:1 | 3:1 | ผ่าน |
| G11 | ขอบซ้ายการ์ด priority LOW | `--gray-500` #8A8683 | `--gray-50` #FBFBFB | 3.48:1 | 3:1 | ผ่าน |
| G12 | ขอบซ้ายการ์ด priority NORMAL · จุดยังไม่อ่าน | `--navy-700` #21417E | `--gray-50` #FBFBFB | 9.56:1 | 3:1 | ผ่าน |
| G13 | ขอบซ้ายการ์ด priority HIGH · ขอบคิวรอนาน | `--warning-solid` #DC6803 | `--gray-50` #FBFBFB | 3.36:1 | 3:1 | ผ่าน |
| G14 | ขอบซ้ายการ์ด priority URGENT · วงจำนวนแจ้งเตือน | `--danger-solid` #D92D20 | `--gray-50` #FBFBFB | 4.66:1 | 3:1 | ผ่าน |
| G15 | จุดสถานะ success | `--success-solid` #067647 | `--gray-50` #FBFBFB | 5.49:1 | 3:1 | ผ่าน |
| G16 | แถบความคืบหน้า KPI คุณภาพ (fill เทียบ track) | `--navy-700` #21417E | `--gray-200` #EAE8E7 | 8.10:1 | 3:1 | ผ่าน |
| G17 | เส้นเป้าหมายบนแถบ | `--gray-900` #101828 | `--gray-200` #EAE8E7 | 14.53:1 | 3:1 | ผ่าน |
| G18 | focus ring บนพื้นสว่าง | `--navy-700` #21417E | `--gray-50` #FBFBFB | 9.56:1 | 3:1 | ผ่าน |
| G19 | focus ring บนพื้น navy | `--orange-300` #FBB06B | `--navy-900` #0B1E41 | 9.02:1 | 3:1 | ผ่าน |
| G20 | แถบบอกเมนูที่เลือก (sidebar) | `--orange-500` #F86E0B | `--navy-900` #0B1E41 | 5.66:1 | 3:1 | ผ่าน |
| G21 | เส้นใต้แท็บที่เลือก · ตัวบอกช่อง bottom nav | `--navy-900` #0B1E41 | `--gray-50` #FBFBFB | 15.90:1 | 3:1 | ผ่าน |
| G22 | ไอคอนบนปุ่มส้ม/FAB | `--navy-900` #0B1E41 | `--orange-500` #F86E0B | 5.66:1 | 3:1 | ผ่าน |
| G23 | ขอบปุ่มส้ม/FAB เทียบพื้นหน้า | `--orange-500` #F86E0B | `--gray-50` #FBFBFB | 2.80:1 | 3:1 | **ไม่ผ่าน** — ไม่ใช่ข้อมูลที่ต้องแยก · ปุ่มระบุด้วยตัวอักษร T20 + เงา `--shadow-3` |
| G24 | ขอบ drop zone ของ kanban | `--navy-400` #5E7AAE | `--gray-100` #F4F3F2 | 3.89:1 | 3:1 | ผ่าน |
| G25 | เส้นขอบการ์ด/เส้นแบ่ง (ตกแต่ง) | `--gray-200` #EAE8E7 | `--gray-50` #FBFBFB | 1.18:1 | 3:1 | **ไม่ผ่าน** — ตกแต่งเท่านั้น ห้ามใช้สื่อสถานะ |
| G26 | ขอบ drop zone บนพื้นหน้า | `--navy-400` #5E7AAE | `--gray-50` #FBFBFB | 4.16:1 | 3:1 | ผ่าน |
| G27 | ขอบกรอบค่าที่เปิดดูชั่วคราว (orange-600) | `--orange-600` #DC5A08 | `--gray-50` #FBFBFB | 3.68:1 | 3:1 | ผ่าน |
| G28 | ขอบซ้ายการ์ดไม่มี priority (`--priority-unknown`) | `--gray-300` #D6D3D1 | `--gray-50` #FBFBFB | 1.43:1 | 3:1 | **ไม่ผ่าน** — ตกแต่งเท่านั้น (ข้อ 19.5) · ไม่สื่อความหมาย จึงไม่มีป้าย priority |

#### ค. สีกราฟที่อยู่ติดกัน (ข้อมูลประกอบ · ไม่ใช่เกณฑ์ของ CANONICAL ข้อ 15)

| id | ใช้ที่ | ตัวหน้า | พื้น | ratio | เกณฑ์ | ผล |
|---|---|---|---|---:|---:|---|
| A01 | โดนัท WALK_IN ↔ LINE | `--chart-1` #0B1E41 | `--chart-2` #2F6FD6 | 3.42:1 | 3:1 | ผ่าน |
| A02 | โดนัท LINE ↔ FACEBOOK | `--chart-2` #2F6FD6 | `--chart-3` #C2410C | 1.07:1 | 3:1 | **ไม่ผ่าน** |
| A03 | โดนัท FACEBOOK ↔ INSTAGRAM | `--chart-3` #C2410C | `--chart-4` #B42359 | 1.21:1 | 3:1 | **ไม่ผ่าน** |
| A04 | โดนัท INSTAGRAM ↔ TIKTOK | `--chart-4` #B42359 | `--chart-5` #7C3AED | 1.10:1 | 3:1 | **ไม่ผ่าน** |
| A05 | โดนัท TIKTOK ↔ PHONE | `--chart-5` #7C3AED | `--chart-6` #5B6B8C | 1.06:1 | 3:1 | **ไม่ผ่าน** |
| A06 | โดนัท PHONE ↔ WALK_IN (วนรอบ · WEBSITE = 0) | `--chart-6` #5B6B8C | `--chart-1` #0B1E41 | 3.07:1 | 3:1 | ผ่าน |
| A07 | สัญลักษณ์ legend WALK_IN เทียบ TIKTOK (D49) | `--chart-1` #0B1E41 | `--chart-5` #7C3AED | 2.88:1 | 3:1 | **ไม่ผ่าน** |
| A08 | โดนัทลูกค้าใหม่ ↔ ลูกค้าเก่า | `--chart-2` #2F6FD6 | `--chart-7` #15803D | 1.04:1 | 3:1 | **ไม่ผ่าน** |
| A09 | Funnel Visitor ↔ Lead | `--chart-1` #0B1E41 | `--chart-2` #2F6FD6 | 3.42:1 | 3:1 | ผ่าน |
| A10 | Funnel Lead ↔ Opportunity | `--chart-2` #2F6FD6 | `--chart-3` #C2410C | 1.07:1 | 3:1 | **ไม่ผ่าน** |
| A11 | Funnel Opportunity ↔ Sale | `--chart-3` #C2410C | `--chart-6` #5B6B8C | 1.03:1 | 3:1 | **ไม่ผ่าน** |
| A12 | โดนัท PHONE ↔ WEBSITE (เมื่อ WEBSITE > 0) | `--chart-6` #5B6B8C | `--chart-7` #15803D | 1.06:1 | 3:1 | **ไม่ผ่าน** |
| A13 | โดนัท WEBSITE ↔ WALK_IN (วนรอบ เมื่อ WEBSITE > 0) | `--chart-7` #15803D | `--chart-1` #0B1E41 | 3.28:1 | 3:1 | ผ่าน |

> เมนูที่เลือกใน sidebar: พื้น `--navy-700` บน `--navy-900` ต่างกันเพียง 1.66:1 → **ต้องมี** แถบซ้าย 4px `--orange-500` (G20) + น้ำหนักตัวอักษร 600 + `aria-current="page"` จึงไม่พึ่งสีพื้นอย่างเดียว
> ตาราง ค เป็นข้อมูลประกอบ: `--chart-5` ใหม่แยกจาก `--chart-1` ด้วยสีสัน (ม่วง/กรมท่า) ชัดขึ้นมาก แต่ความต่างความสว่างยัง 2.88:1 (A07) และคู่ข้างเคียงหลายคู่ต่ำกว่า 3:1 → กติกา 5 ข้อในข้อ 2.6 ยังบังคับทุกกราฟ

---

## 3. ตัวอักษร

### 3.1 ฟอนต์

```css
--font-sans: "Kanit", "Noto Sans Thai", "Sarabun", "Leelawadee UI",
             -apple-system, "Segoe UI", system-ui, sans-serif;   /* ชุดเดียวกับ JLAS */
```

- ไฟล์: `prototype/assets/fonts/` (subset ไทย+ละติน · 300/400/500/600/700 · SIL OFL 1.1) ประกาศใน `prototype/assets/kanit-faces.css` · แอปจริงใช้ `next/font/local` ชี้ไฟล์ชุดเดียวกัน · `font-display: swap`
- `font-synthesis: none` (ห้ามสร้างตัวหนา/เอียงปลอม) · ห้ามโหลดจาก Google Fonts (CANONICAL ข้อ 15) · CSP ของแอปจึงไม่ต้องอนุญาตโดเมนฟอนต์ภายนอก

### 3.2 น้ำหนัก

| น้ำหนัก | token | ใช้ | ห้าม |
|---|---|---|---|
| 300 | `--font-weight-light` | ตัวเลขประดับขนาด ≥ 32px เท่านั้น (ไม่มีการใช้ใน V1) | ข้อความไทย < 24px (เส้นบางอ่านยาก) |
| 400 | `--font-weight-regular` | เนื้อความ · เซลล์ตาราง · helper | – |
| 500 | `--font-weight-medium` | label ฟอร์ม · ปุ่ม · ป้าย · หัวคอลัมน์ · legend | – |
| 600 | `--font-weight-semibold` | หัวข้อ h1–h4 · ค่า KPI · เมนูที่เลือก · แท็บที่เลือก | ย่อหน้ายาว |
| 700 | `--font-weight-bold` **[CRM]** | wordmark "JAUN CRM" · เลขคิว · แถวรวมของตาราง | ข้อความยาว · หัวข้อทั่วไป |

### 3.3 สเกล (ขนาดเดียวกับ JLAS + token ตัวเลขของ CRM)

| token | ขนาด | line-height | น้ำหนัก | ใช้ใน CRM |
|---|---|---|---|---|
| `display` | 40px `2.5rem` | 1.40 | 600 | แผงแบรนด์หน้าเข้าสู่ระบบ |
| `h1` | 32px `2rem` | 1.45 | 600 | ชื่อหน้า (เดสก์ท็อป) · มือถือลดเป็น `h2` |
| `h2` | 26px `1.625rem` | 1.46 | 600 | ชื่อหน้า (แท็บเล็ต/มือถือ) · ชื่อลูกค้าบนหัว Customer 360 |
| `h3` | 20px `1.25rem` | 1.60 | 600 | หัวการ์ด/widget · หัว drawer/dialog |
| `h4` | 17px `1.0625rem` | 1.65 | 600 | หัวคอลัมน์ kanban · หัวกลุ่มงาน · หัวส่วนในฟอร์ม |
| `body-lg` | 18px `1.125rem` | 1.78 | 400 | ข้อความสำคัญในหน้าว่าง/หน้าไม่มีสิทธิ์ |
| `body` | 16px `1rem` | 1.75 | 400 | เนื้อความ · input · ปุ่ม (500) |
| `body-sm` | 14px `0.875rem` | 1.71 | 400 | เซลล์ตาราง · meta · label ฟอร์ม (500) |
| `caption` | 12px `0.75rem` | 1.67 | 400/500 | ป้าย · helper · legend · เวลาในรายการ — **ขนาดต่ำสุดของระบบ** |
| `num` | 15px `0.9375rem` | 1.47 | 500 | ตัวเลขในการ์ดย่อยและ legend |
| `kpi` **[CRM]** | 32px `2rem` | 1.25 | 600 | ค่า KPI เดสก์ท็อป · ศูนย์กลางโดนัท |
| `kpi-sm` **[CRM]** | 24px `1.5rem` | 1.33 | 600 | ค่า KPI แท็บเล็ต/มือถือ · ตัวเลขสรุป 4 ช่องของ Customer 360 · เลขคิว (700) |

### 3.4 กติกาภาษาไทย

1. **line-height ต่ำสุด:** ข้อความไทยหลายบรรทัด ≥ 1.6 · หัวข้อ ≥ 1.4 · control บรรทัดเดียว (ปุ่ม ป้าย input) ใช้ line-height 1.5 และความสูงจาก padding — **ห้ามกำหนด `height` ตายตัวร่วมกับ `overflow: hidden`** เพราะวรรณยุกต์และสระบน/ล่างจะถูกตัด
2. `letter-spacing: 0` สำหรับไทยเสมอ · `text-transform: uppercase` ใช้ได้เฉพาะละตินที่ต้องการ (ห้ามกับรหัส `CUS-…` ที่เป็นตัวใหญ่อยู่แล้ว)
3. ภาษาไทยไม่มีช่องว่างระหว่างคำ → ใช้ `word-break: normal; overflow-wrap: anywhere;` ในเซลล์ที่แคบ · ตัดบรรทัดเดียวด้วย `text-overflow: ellipsis` ได้เฉพาะชื่อสินค้า/ชื่องาน และต้องมี `title` หรือ tooltip แสดงข้อความเต็ม · **ห้ามตัดชื่อลูกค้า รหัสอ้างอิง และตัวเลข**
4. รหัส (`CUS-2026-000297` `OP-2026-002998` `V-JP1-260911-007` `ST-0045`) · เวลา · ตัวเลข: `white-space: nowrap` + `font-variant-numeric: tabular-nums` (ถ้าฟอนต์ไม่มี tnum ให้จัดชิดขวาในตาราง)
5. ข้อความในปุ่มไม่เกิน 2 คำ/1 บรรทัด · ห้ามขึ้นบรรทัดใหม่ในปุ่ม (ปุ่มขยายกว้างแทน)
6. `<html lang="th">` ทุกหน้า · ข้อความอังกฤษในประโยคไม่ต้องใส่ `lang="en"` ยกเว้นย่อหน้าอังกฤษทั้งย่อหน้า

---

## 4. ระยะ · มุม · เงา · ขนาด control · layout

### 4.1 Spacing (base 4px · ค่าเดียวกับ JLAS)

`--space-0` 0 · `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48 · `--space-16` 64 · `--space-20` 80 (px)

| บริบท | ค่า |
|---|---|
| ช่องว่างภายในการ์ด | 16 (มือถือ) · 20 (แท็บเล็ต/เดสก์ท็อป) |
| ระยะระหว่างการ์ดในกริด | 16 · เดสก์ท็อป ≥ 1440px ใช้ 24 |
| ระยะระหว่าง section ในหน้า | 24 (มือถือ) · 32 |
| ระยะ label → input | 4 · input → helper 4 · ฟิลด์ → ฟิลด์ 16 |
| ขอบหน้า (`--page-px`) | 32 เดสก์ท็อป **[CRM]** (JLAS 48) · 24 แท็บเล็ต · 16 มือถือ |

### 4.2 Radius

`--radius-sm` 4px (ป้ายเสริม · ชิปในเซลล์) · `--radius-md` 8px (ปุ่ม · input · การ์ดย่อย · kanban card) · `--radius-lg` 12px (การ์ด · drawer · dialog · คอลัมน์ kanban) · `--radius-xl` 16px **[CRM]** (bottom sheet มือถือ · กรอบโทรศัพท์ในหน้า 10) · `--radius-full` 9999px (ป้าย lifecycle · avatar · FAB · ปุ่มกลาง bottom nav)

### 4.3 เงา (ค่าเดียวกับ JLAS)

| token | ใช้ |
|---|---|
| `--shadow-1` | การ์ดทั่วไป · top bar เมื่อเลื่อน |
| `--shadow-2` | dropdown · popover · การ์ด kanban ขณะ hover |
| `--shadow-3` | FAB · ปุ่มกลาง bottom nav · การ์ดขณะลาก · toast |
| `--shadow-4` | dialog · drawer |
| `--shadow-inset-press` | สถานะกดของปุ่มทุกชนิด |

### 4.4 ขนาด control

| token | ค่า | ใช้ |
|---|---|---|
| `--control-h-sm` | 32px | ปุ่ม/ชิปในตารางเดสก์ท็อปเท่านั้น (pointer ละเอียด) |
| `--control-h-md` | 40px | ปุ่ม · input · select เดสก์ท็อป |
| `--control-h-lg` | 48px | ปุ่มหลักบนแท็บเล็ต · ฟอร์มมือถือ · ปุ่ม "รับเข้าคิว" "เริ่มให้บริการ" |
| `--control-min-touch` | **44px [CRM]** (JLAS 40) | เป้าสัมผัสต่ำสุดเมื่อ `(pointer: coarse)` (CANONICAL ข้อ 15) |
| `--control-min-touch-counter` | **48px [CRM]** | อุปกรณ์ counter (`html[data-device="counter"]`) และปุ่มหลักบนแท็บเล็ต (CANONICAL ข้อ 14.4) |
| `--icon-sm` · `--icon-md` · `--icon-lg` | 16 · 20 · 24px | ไอคอนในเซลล์ · ในปุ่ม/เมนู · bottom nav |

### 4.5 Layout

| token | ค่า | ใช้ |
|---|---|---|
| `--sidebar-w` | 264px | sidebar เต็ม (เดสก์ท็อป) |
| `--sidebar-w-collapsed` | 72px | sidebar ไอคอน (แท็บเล็ต) |
| `--header-h` | 64px | top bar |
| `--bottom-nav-h` **[CRM]** | 64px + `env(safe-area-inset-bottom)` | bottom navigation มือถือ |
| `--layout-max` | 1440px | ความกว้างสูงสุดของเนื้อหา (ตาราง/แดชบอร์ด) |
| `--drawer-w` **[CRM]** | 480px (ฟอร์ม) · 640px (รายละเอียด) | drawer เดสก์ท็อป/แท็บเล็ต |
| `--dialog-w-sm` · `--dialog-w-md` **[CRM]** | 400px · 560px | dialog ยืนยัน · dialog ที่มีฟอร์ม |
| `--kanban-col-w` **[CRM]** | 280px (ต่ำสุด) | คอลัมน์ Pipeline |

---

## 5. Breakpoint · z-index · motion

### 5.1 Breakpoint (CANONICAL ข้อ 15)

| ชื่อ | ช่วง | media query | shell |
|---|---|---|---|
| มือถือ | < 768px | `@media (max-width: 767.98px)` | ไม่มี sidebar · top bar ย่อ · bottom nav 5 ช่อง |
| แท็บเล็ต (counter) | 768–1279px | `@media (min-width: 768px) and (max-width: 1279.98px)` | sidebar ไอคอน 72px · FAB "+ รับลูกค้า" · ปุ่มหลัก ≥ 48px |
| เดสก์ท็อป | ≥ 1280px | `@media (min-width: 1280px)` | sidebar เต็ม 264px · ปุ่ม "+ รับลูกค้า" ในหัวหน้า |

CSS custom property ใช้ใน media query ไม่ได้ → ค่าคงที่ใน JS/TS: `BREAKPOINT = { tablet: 768, desktop: 1280 }`

### 5.2 z-index (ค่าเดียวกับ JLAS + [CRM])

`--z-base` 0 · `--z-sticky` 100 (หัวตาราง · แถบตัวกรอง) · `--z-sidebar` 200 · `--z-bottom-nav` 210 **[CRM]** · `--z-fab` 220 **[CRM]** · `--z-dropdown` 300 · `--z-drawer` 400 · `--z-modal-scrim` 500 · `--z-modal` 510 · `--z-toast` 600 · `--z-tooltip` 700 · `--z-lock` 800 **[CRM]** (หน้าล็อก counter อยู่เหนือทุกอย่าง)

### 5.3 Motion

| token | ค่า | ใช้ |
|---|---|---|
| `--duration-fast` | 120ms | hover · focus · ชิป |
| `--duration-base` | 160ms | dropdown · toast เข้า/ออก · แท็บ |
| `--duration-slow` | 240ms | drawer · bottom sheet · dialog |
| `--ease-standard` / `--ease-out` / `--ease-in` | `cubic-bezier(0.2,0,0,1)` / `(0,0,0.2,1)` / `(0.4,0,1,1)` | – |

- `@media (prefers-reduced-motion: reduce)` → ทุก transition/animation ≤ 0.01ms · skeleton ไม่ shimmer · kanban ไม่มีแอนิเมชันย้ายการ์ด
- ห้ามแอนิเมชันตัวเลข KPI นับขึ้น (ทำให้ผู้อ่านหน้าจออ่านค่าผิด และภาพหน้าจอผิด)
- นับถอยหลังของค่าที่เปิดดู (30 วินาที) แสดงเป็นข้อความ ไม่ใช้วงกลมหมุนอย่างเดียว

---

## 6. CSS custom properties ฉบับเต็ม

บล็อก `:root` ของแอปจริง (Next.js) ต้องมีครบตามนี้ · **ค่า hex ปรากฏได้เฉพาะในบล็อกนี้** ที่เหลืออ้าง `var(--token)` · `prototype/assets/app.css` ใช้ชื่อต่างกันบางกลุ่ม → ชื่อที่ต้องใช้ใน `<style>` ของหน้า prototype และรายการค่าที่ต้องตรง v2.2 อยู่ใน **ภาคผนวก B**

```css
:root {
  /* ---- Ramp: navy (= JLAS) ---- */
  --navy-50:#F2F5FA; --navy-100:#E1E8F3; --navy-200:#C3D0E6; --navy-300:#94A9CE; --navy-400:#5E7AAE;
  --navy-500:#3A5992; --navy-600:#2A4A85; --navy-700:#21417E; --navy-800:#16305E; --navy-900:#0B1E41;
  /* ---- Ramp: orange (= JLAS) ---- */
  --orange-50:#FFF6ED; --orange-100:#FFE9D5; --orange-200:#FDCFA5; --orange-300:#FBB06B; --orange-400:#FA8C36;
  --orange-500:#F86E0B; --orange-600:#DC5A08; --orange-700:#B54708; --orange-800:#92380A; --orange-900:#7A2F0B;
  /* ---- Ramp: gray (= JLAS) ---- */
  --gray-50:#FBFBFB; --gray-100:#F4F3F2; --gray-200:#EAE8E7; --gray-300:#D6D3D1; --gray-400:#B5B1AE;
  --gray-500:#8A8683; --gray-600:#6E6A68; --gray-700:#4E4B4A; --gray-800:#26272B; --gray-900:#101828;

  /* ---- CI alias (CANONICAL ข้อ 15) ---- */
  --jaun-navy:var(--navy-900); --jaun-orange:var(--orange-500); --support-blue:var(--navy-700);
  --light-gray:var(--gray-200); --white:var(--gray-50); --dark-text:var(--gray-900);

  /* ---- Semantic (= JLAS · danger เป็น alias ของ critical) ---- */
  --success-bg:#ECFDF3; --success-border:#ABEFC6; --success-text:#05603A; --success-solid:#067647; --success-on-solid:var(--gray-50);
  --warning-bg:#FFFAEB; --warning-border:#FEDF89; --warning-text:#B54708; --warning-solid:#DC6803; --warning-on-solid:var(--navy-900);
  --critical-bg:#FEF3F2; --critical-border:#FECDCA; --critical-text:#B42318; --critical-solid:#D92D20; --critical-on-solid:var(--gray-50);
  --danger-bg:var(--critical-bg); --danger-border:var(--critical-border); --danger-text:var(--critical-text);
  --danger-solid:var(--critical-solid); --danger-on-solid:var(--critical-on-solid);
  --info-bg:var(--navy-50); --info-border:var(--navy-200); --info-text:var(--navy-700); --info-solid:var(--navy-700); --info-on-solid:var(--gray-50);
  --neutral-bg:var(--gray-100); --neutral-border:var(--gray-300); --neutral-text:var(--gray-700); --neutral-solid:var(--gray-600); --neutral-on-solid:var(--gray-50);

  /* ---- Surface / text / border ---- */
  --surface-page:var(--gray-50); --surface-card:var(--gray-50); --surface-subtle:var(--gray-100); --surface-sunken:var(--gray-200);
  --surface-nav:var(--navy-900); --surface-nav-hover:var(--navy-800); --surface-nav-active:var(--navy-700);
  --surface-selected:var(--navy-100); --surface-overlay:rgba(11,30,65,0.55);
  --text-primary:var(--gray-900); --text-heading:var(--navy-900); --text-secondary:var(--gray-600); --text-secondary-sunk:var(--gray-700);
  --text-label:var(--gray-800); --text-link:var(--navy-700); --text-link-hover:var(--navy-600);
  --text-on-nav:var(--gray-50); --text-on-nav-2:var(--navy-200); --text-on-accent:var(--navy-900);
  --text-placeholder:var(--gray-600); --text-disabled:var(--gray-600);
  --border-subtle:var(--gray-200); --border-default:var(--gray-300); --border-strong:var(--gray-500); --border-focus:var(--navy-700);
  --focus-ring-width:2px; --focus-ring-offset:2px; --focus-ring-color:var(--navy-700); --focus-ring-color-on-dark:var(--orange-300);

  /* ---- Domain ---- */
  --badge-vip-bg:var(--navy-900); --badge-vip-text:var(--gray-50);
  --priority-low:var(--gray-500); --priority-normal:var(--navy-700); --priority-high:var(--warning-solid); --priority-urgent:var(--danger-solid);
  --priority-unknown:var(--gray-300);  /* การ์ดที่ไม่มี priority_code — ตกแต่งเท่านั้น ไม่ใช่สี NORMAL (CANONICAL ข้อ 19.5) */
  --reveal-bg:var(--orange-50); --reveal-border:var(--orange-600);  /* กรอบค่าที่เปิดดูชั่วคราว (T53 · G27) */
  --delta-up-text:var(--success-text); --delta-up-bg:var(--success-bg);
  --delta-down-text:var(--danger-text); --delta-down-bg:var(--danger-bg);
  --delta-flat-text:var(--gray-700); --delta-flat-bg:var(--gray-100);

  /* ---- Chart (CANONICAL ข้อ 15 v2.2 · ผ่าน ≥ 3:1 ทุกค่า · chart-5 = D49) ---- */
  --chart-1:#0B1E41; --chart-2:#2F6FD6; --chart-3:#C2410C; --chart-4:#B42359;
  --chart-5:#7C3AED; --chart-6:#5B6B8C; --chart-7:#15803D;
  --chart-lost:var(--support-blue); --chart-separator:var(--gray-50); --chart-track:var(--gray-200);
  --chart-axis-label:var(--gray-700); --chart-dim-opacity:0.35;
  --channel-WALK_IN:var(--chart-1); --channel-LINE:var(--chart-2); --channel-FACEBOOK:var(--chart-3); --channel-INSTAGRAM:var(--chart-4);
  --channel-TIKTOK:var(--chart-5); --channel-PHONE:var(--chart-6); --channel-WEBSITE:var(--chart-7);

  /* ---- Typography ---- */
  --font-sans:"Kanit","Noto Sans Thai","Sarabun","Leelawadee UI",-apple-system,"Segoe UI",system-ui,sans-serif;
  --font-weight-light:300; --font-weight-regular:400; --font-weight-medium:500; --font-weight-semibold:600; --font-weight-bold:700;
  --font-size-display:2.5rem; --line-height-display:1.40;
  --font-size-h1:2rem;       --line-height-h1:1.45;
  --font-size-h2:1.625rem;   --line-height-h2:1.46;
  --font-size-h3:1.25rem;    --line-height-h3:1.60;
  --font-size-h4:1.0625rem;  --line-height-h4:1.65;
  --font-size-body-lg:1.125rem; --line-height-body-lg:1.78;
  --font-size-body:1rem;     --line-height-body:1.75;
  --font-size-body-sm:0.875rem; --line-height-body-sm:1.71;
  --font-size-caption:0.75rem;  --line-height-caption:1.67;
  --font-size-num:0.9375rem; --line-height-num:1.47;
  --font-size-kpi:2rem;      --line-height-kpi:1.25;
  --font-size-kpi-sm:1.5rem; --line-height-kpi-sm:1.33;
  --line-height-control:1.5;

  /* ---- Spacing / radius / shadow ---- */
  --space-0:0; --space-1:0.25rem; --space-2:0.5rem; --space-3:0.75rem; --space-4:1rem; --space-5:1.25rem;
  --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem; --space-12:3rem; --space-16:4rem; --space-20:5rem;
  --radius-sm:4px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px; --radius-full:9999px;
  --shadow-1:0 1px 2px 0 rgba(11,30,65,0.06),0 1px 3px 0 rgba(11,30,65,0.08);
  --shadow-2:0 2px 4px -1px rgba(11,30,65,0.08),0 4px 8px -2px rgba(11,30,65,0.10);
  --shadow-3:0 4px 8px -2px rgba(11,30,65,0.10),0 12px 20px -4px rgba(11,30,65,0.14);
  --shadow-4:0 8px 16px -4px rgba(11,30,65,0.12),0 24px 40px -8px rgba(11,30,65,0.20);
  --shadow-inset-press:inset 0 2px 4px 0 rgba(11,30,65,0.22);

  /* ---- Control / layout ---- */
  --control-h-sm:32px; --control-h-md:40px; --control-h-lg:48px;
  --control-min-touch:44px; --control-min-touch-counter:48px;
  --icon-sm:16px; --icon-md:20px; --icon-lg:24px;
  --sidebar-w:264px; --sidebar-w-collapsed:72px; --header-h:64px; --bottom-nav-h:64px;
  --layout-max:1440px; --drawer-w:480px; --drawer-w-wide:640px; --dialog-w-sm:400px; --dialog-w-md:560px; --kanban-col-w:280px;
  --page-px:var(--space-8); --page-px-tablet:var(--space-6); --page-px-mobile:var(--space-4);

  /* ---- z-index / motion ---- */
  --z-base:0; --z-sticky:100; --z-sidebar:200; --z-bottom-nav:210; --z-fab:220; --z-dropdown:300;
  --z-drawer:400; --z-modal-scrim:500; --z-modal:510; --z-toast:600; --z-tooltip:700; --z-lock:800;
  --duration-fast:120ms; --duration-base:160ms; --duration-slow:240ms;
  --ease-standard:cubic-bezier(0.2,0,0,1); --ease-out:cubic-bezier(0,0,0.2,1); --ease-in:cubic-bezier(0.4,0,1,1);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
```

---

## 7. Components

รหัส component (`C-…`) ถูกอ้างใน `sitemap-screen-specs.md` · ทุก component ต้องทำงานด้วยคีย์บอร์ดและมีสถานะ hover · focus-visible · active · disabled

### 7.1 ปุ่ม `C-BTN`

สเปกหน้าจอ (`sitemap-screen-specs.md`) เรียกปุ่มด้วยคำไทยในวงเล็บคอลัมน์แรก **"ส้ม" · "navy" · "รอง" · "ghost" · "danger" · "danger-outline"** และคลาสใน prototype/แอปจริงคือ `.btn--{variant}` ตามคอลัมน์สุดท้าย (ชื่อชุดเดียวกับ JLAS · `JCRM.ui.button({variant})` รับชื่อเดียวกัน)

| variant (คำในสเปกหน้าจอ) | พื้น | ตัวอักษร | ขอบ | hover | กด | ใช้กับ | คลาส |
|---|---|---|---|---|---|---|---|
| `accent` (**ส้ม**) | `--orange-500` | `--navy-900` 600 | – | `--orange-400` | `--orange-500` + `--shadow-inset-press` | CTA หลัก (กติกาด้านล่าง) | `.btn--accent` |
| `primary` (**navy**) | `--navy-900` | `--gray-50` | – | `--navy-800` | + inset | การยืนยันที่ไม่ใช่ CTA หลัก: อนุมัติ · ยืนยัน · รับทราบ · ส่งคำขอ · ส่ง (ใบเสนอราคา) · ส่งออก (ยืนยันใน dialog) · ปิดการขาย · แปลงเป็นโอกาสขาย | `.btn--primary` |
| `secondary` (**รอง**) | `--gray-50` | `--navy-700` | 1px `--navy-700` | พื้น `--navy-50` | + inset | ปุ่มรอง: รับเข้าคิว · ขอส่งออก/ส่งออก (ปุ่มเปิด dialog) · แก้ไข · ตรวจสอบซ้ำ · ปุ่มระดับหน้าที่ไม่ใช่ CTA หลัก | `.btn--secondary` |
| `ghost` | โปร่ง | `--navy-700` | – | พื้น `--navy-50` | + inset | ยกเลิก · ล้างตัวกรอง · ดูเป็นตาราง · ปุ่มในแถวตาราง | `.btn--ghost` |
| `danger` | `--danger-solid` | `--gray-50` | – | `--danger-text` | + inset | ปิดใช้งานผู้ใช้ · รวมลูกค้า (ยืนยันขั้นสุดท้าย) · ทำข้อมูลนิรนาม · บันทึกไม่สำเร็จ · ยกเลิกคิว (ยืนยัน) | `.btn--danger` |
| `danger-outline` | `--gray-50` | `--danger-text` | 1px `--danger-text` | พื้น `--danger-bg` | + inset | ปฏิเสธ · ไม่อนุมัติ · ไม่สำเร็จ (ปุ่มเปิด dialog) · ถอนบทบาท · ออกก่อนรับบริการ | `.btn--danger-outline` |
| `icon` | ตาม variant | ไอคอน 20px | – | – | – | ต้องมี `aria-label` ภาษาไทยเสมอ | `.icon-btn` |

prototype มีคลาสเสริม `.btn--outline` (ขอบ `--border-strong` ตัวอักษร `--text-heading`) สำหรับปุ่มกลาง ๆ ที่ไม่ใช่การกระทำหลัก (เช่น "ดูข้อมูล" ในการ์ดตรวจซ้ำ) — ไม่ใช่ปุ่มส้มและนับเป็น "รอง" ในกติกาข้างล่าง

**ขนาด:** `sm` 32px (ในตารางเดสก์ท็อปเท่านั้น) · `md` 40px · `lg` 48px · padding แนวนอน 12/16/20px · ตัวอักษร `body` 500 (sm ใช้ `body-sm`) · radius `--radius-md` · เมื่อ `(pointer: coarse)` ความสูงต่ำสุด 44px · counter/แท็บเล็ตสำหรับปุ่มหลัก 48px

**กติกาปุ่มส้ม (CANONICAL ข้อ 15 v2.2)**
1. **ปุ่มส้มหลัก = CTA หลัก 1 ปุ่มต่อพื้นที่ตัดสินใจ** (+ ปุ่ม "+ รับลูกค้า" ทั่วระบบ) — พื้นที่ตัดสินใจ = หัวหน้า 1 พื้นที่ · ท้าย drawer 1 · ท้าย dialog 1 · แถบการกระทำของแท็บ/ส่วน 1 · ปุ่ม "+ รับลูกค้า" ส่วนกลาง (หัวหน้า 02/03 · FAB · ช่องกลาง bottom nav) นับแยกและเป็นส้มเสมอ
2. ตัวอย่างที่เป็นส้ม (ข้อ 15 + mockup): `+ รับลูกค้า` · `เริ่มให้บริการ` · `บันทึก` / `บันทึกลูกค้า` / `บันทึกผล` · `+ สร้าง Lead` · `+ นัดติดตาม` / `+ เพิ่มงาน` · `+ เพิ่มลูกค้า` · `+ สร้างโอกาสขาย` · `+ สร้างใบเสนอราคา` · `ทำเสร็จ` · `ส่งคำเชิญ` · `เข้าสู่ระบบ`
3. **ห้ามส้ม (ตรึง):** การลบ/ทำลาย/ปฏิเสธ · **อนุมัติ** · **ส่งออก** (รวมขอส่งออกและดาวน์โหลด) · **ตัวกรอง** · **การนำทาง** (เข้าหน้าแรก · ดูรายการ · ดูข้อมูล · ลิงก์ · แท็บ) — เพิ่มเติมของเอกสารนี้: ปุ่มเปิดข้อมูลติดต่อ · ปุ่มในแถวตาราง/คิว
4. ตัวอักษร `--navy-900` เสมอ (T20) · ห้ามขาว (T23) · สถานะกดห้ามใช้ `--orange-600` (T22)
5. หน้าที่มีปุ่มหัวหน้าหลายปุ่ม: ปุ่มที่ไม่ใช่ CTA หลักเป็น "รอง" หรือ "navy" เช่นหน้า 03 `[ขอส่งออก](รอง) [+ เพิ่มลูกค้า](รอง) [+ รับลูกค้า](ส้ม)` · BUSINESS_ADMIN (ไม่มีรับลูกค้า) `[ขอส่งออก](รอง) [+ เพิ่มลูกค้า](ส้ม)`

**สถานะอื่น**
- **กำลังทำงาน:** spinner 16px ซ้ายข้อความ + เปลี่ยนข้อความเป็น "กำลังบันทึก…" · คงความกว้าง · `aria-busy="true"` · กันกดซ้ำ
- **ปิดพร้อมเหตุผล:** ใช้ `aria-disabled="true"` (ไม่ใช้ attribute `disabled`) เพื่อให้ยัง focus ได้ · พื้น `--gray-200` ตัวอักษร `--gray-600` · มี tooltip + ข้อความ helper ใต้ปุ่มบอกเหตุผล (ข้อ 7.15)
- **ซ่อน vs ปิด (CANONICAL ข้อ 14.1):** ซ่อนเมื่อบทบาทไม่มีสิทธิ์นั้นเลย · แสดงแบบปิดพร้อมเหตุผลเมื่อมีสิทธิ์แต่เงื่อนไขไม่ครบ (ไม่ใช่เจ้าของรายการ · สถานะไม่อนุญาต · ยังไม่ยืนยัน MFA · เกินเพดาน)

### 7.2 App shell `C-SHELL`

```
เดสก์ท็อป ≥1280                         แท็บเล็ต 768–1279                 มือถือ <768
┌────────┬───────────────────────────┐  ┌──┬────────────────────────┐   ┌──────────────────┐
│SIDEBAR │ TOP BAR (64)               │  │SB│ TOP BAR                 │   │ TOP BAR (56)      │
│ 264    ├───────────────────────────┤  │72├────────────────────────┤   ├──────────────────┤
│ navy   │ PAGE HEADER                │  │  │ PAGE HEADER             │   │ PAGE HEADER       │
│        │ เนื้อหา (max 1440)         │  │  │ เนื้อหา                 │   │ เนื้อหา            │
│        │                            │  │  │               [+ รับลูกค้า]│   │                  │
└────────┴───────────────────────────┘  └──┴────────────────────────┘   ├──────────────────┤
                                                                         │ BOTTOM NAV (64)   │
                                                                         └──────────────────┘
```

**Sidebar** — พื้น `--surface-nav` · โลโก้ "JAUN CRM" (700) + "CUSTOMER 360" (caption) สูง 64px · กลุ่มเมนูตาม (CANONICAL ข้อ 14.2) เป็น accordion: หัวกลุ่ม `body-sm` 500 `--text-on-nav-2` + ไอคอน + chevron · รายการ สูง 44px ไอคอน 20px ข้อความ `body` `--text-on-nav` · hover `--surface-nav-hover` · ที่เลือก `--surface-nav-active` + แถบซ้าย 4px `--orange-500` + 600 + `aria-current="page"` · กลุ่ม "หน้าหลัก" ไม่มีหัวกลุ่ม (เป็นรายการเดี่ยว) · **ซ่อนกลุ่มที่ไม่มีหน้าที่ผู้ใช้เข้าได้** · focus ring `--focus-ring-color-on-dark` · แท็บเล็ต: เหลือไอคอน 72px + tooltip ชื่อเมนู + flyout รายการย่อยเมื่อ hover/focus/แตะ

**Top bar (CANONICAL ข้อ 14.3)** — พื้น `--gray-50` ขอบล่าง `--border-subtle` · ซ้าย: ปุ่มเมนู (แท็บเล็ต/มือถือ `aria-label="เปิดเมนู"`) · กลาง: `C-SEARCH` (**ไม่แสดงเลย** สำหรับผู้ใช้ที่บทบาทที่นับได้มีเพียง MARKETING หรือ SYSTEM_ADMIN) · ขวา: ตัวเลือกสาขา (`C-FILTER` แบบ select · เฉพาะผู้มีหลายสาขา) · กระดิ่ง `C-NOTIF` · โปรไฟล์ (avatar + ชื่อ + ป้ายบทบาท + สาขา → เมนู "ออกจากระบบ") · **ไม่มีตัวเลือกช่วงเวลาบน top bar**

**Page header** — ชื่อหน้า `h1` `--text-heading` · คำอธิบาย `body-sm` `--text-secondary` · ขวา: ตัวเลือกช่วงเวลา `C-PERIOD` **เฉพาะหน้า 02 09 12** (CANONICAL ข้อ 14.3) · ปุ่มระดับหน้า (ส้ม ≤ 1 ตามข้อ 7.1) · มือถือ: ปุ่มระดับหน้าย้ายเป็นไอคอน/เมนู ⋮

**ออกจากระบบ (CANONICAL ข้อ 9.2)** — ล้าง Cache Storage · IndexedDB · sessionStorage · localStorage **ยกเว้น** `device_id` และค่าที่ "จดจำ" `login_id` → ไปหน้า 01

### 7.3 การ์ด KPI `C-KPI`

```
┌──────────────────────────────┐
│ [ไอคอน] ลูกค้าไม่ซ้ำ          │  label  body-sm 500 --text-secondary
│         30 วันล่าสุด          │  period caption --text-secondary
│ 1,284            ▲ +12%       │  value  kpi 600 --text-heading · delta chip
└──────────────────────────────┘
```

| ส่วน | สเปก |
|---|---|
| กล่อง | พื้น `--surface-card` · ขอบ 1px `--border-subtle` · `--radius-lg` · padding 16/20 · min-height 112px · `--shadow-1` |
| ไอคอน | วง 32px พื้น `--navy-50` ไอคอน `--navy-700` · `aria-hidden="true"` (ตกแต่ง) |
| label | ชื่อ KPI ตาม (CANONICAL ข้อ 12.1–12.3) หรือป้ายการ์ดตาม (CANONICAL ข้อ 14.7) ตรงตัว |
| period | ป้าย preset (ข้อ 12.0) · การ์ดที่เป็นค่า "ณ ตอนนี้" (งานวันนี้ · Lead เปิดอยู่) เขียน "ณ 11 ก.ย. 2569 10:24 น." · **ห้ามเขียน "เดือนนี้"** เว้นแต่ preset = `THIS_MONTH` |
| value | จำนวน `3,125` · เงิน `฿3,332,700` (สตางค์ 2 ตำแหน่งเฉพาะเมื่อไม่ใช่จำนวนเต็ม `฿28,900.50`) · อัตรา `24.1%` · **RPC คืน `NULL` หรือไม่มีค่า → `–`** สี `--text-secondary` (CANONICAL ข้อ 1.3 · 9.4.1 · 13.13) · จำนวนที่เป็นศูนย์จริงแสดง `0` / `฿0` (ไม่ใช่ `–`) |
| delta | chip `caption` 500 · padding 2/8 · `--radius-full` · สีข้อ 2.5 ง · ไม่แสดงเมื่อค่าปัจจุบันหรือช่วงก่อนหน้าเป็น `NULL`/0 · tooltip: "เทียบ 14 ก.ค. – 12 ส.ค. 2569" (ช่วงก่อนหน้า แสดงวันสุดท้ายแบบรวม) + บรรทัดที่สอง "ช่วงปัจจุบันรวมวันนี้ที่ยังไม่จบ" สำหรับ preset แบบ N วันล่าสุด · preset `TODAY`: "เทียบวันเดียวกันสัปดาห์ก่อน ({วันที่}) ถึง {HH:mm} น." เช่น "เทียบวันเดียวกันสัปดาห์ก่อน (4 ก.ย. 2569) ถึง 10:24 น." (ช่วงเทียบ `[วันเดียวกันสัปดาห์ก่อน 00:00, app.clock() − 7 วัน)` · CANONICAL ข้อ 12.0) |
| ข้อความสำหรับผู้อ่านหน้าจอ | กล่องทั้งใบเป็น `role="group"` + `aria-label` เช่น "ลูกค้าไม่ซ้ำ 30 วันล่าสุด 1,284 เพิ่มขึ้น 12 เปอร์เซ็นต์ จากช่วงก่อนหน้า" · pp อ่านว่า "จุดเปอร์เซ็นต์" · `–` อ่านว่า "ไม่มีข้อมูล" |
| คลิกได้ (drill-down) | ทั้งการ์ดเป็นลิงก์ · hover ขอบ `--navy-200` + `--shadow-2` · มี chevron ขวา |

**variant เป้าหมาย (`C-KPI-TARGET` · หน้า 02 แถว BA และหน้า 12):** เพิ่มบรรทัด "เป้า ≥ 95%" (`caption`) + ป้าย "ผ่าน" (success) / "ต่ำกว่าเป้า" (danger) + แถบ 8px track `--chart-track` fill `--navy-700` (G16) เส้นเป้า 2px `--gray-900` (G17) · ตัดสินผ่าน/ไม่ผ่านด้วย**ค่าที่ยังไม่ปัด** (CANONICAL ข้อ 1.3) · ไม่มี delta chip · ตัวชี้วัดแบบ "น้อยกว่า" (`< 2%`) แถบแสดงค่าเทียบสเกล 0–10% และข้อความเป้าเขียน "เป้า < 2%"

**กริด:** เดสก์ท็อป 1280–1439px 3 คอลัมน์ · ≥ 1440px 6 คอลัมน์ · แท็บเล็ต 3 คอลัมน์ · มือถือ 2 คอลัมน์ (ค่าใช้ `kpi-sm`)

### 7.4 ป้าย `C-BADGE`

| ชนิด | รูปทรง | สเปก |
|---|---|---|
| lifecycle `C-BADGE-LIFECYCLE` | pill `--radius-full` + จุดนำ 6px สี `*-solid` | พื้น `*-bg` · ขอบ 1px `*-border` · ตัวอักษร `*-text` · `caption` 500 · padding 2/10 · min-height 24px |
| ป้ายเสริม `C-BADGE-SUPP` | สี่เหลี่ยม `--radius-sm` ไม่มีจุด | VIP: พื้น `--badge-vip-bg` ตัวอักษร `--badge-vip-text` + ไอคอนดาว 12px · อื่น ๆ: `*-bg` / `*-text` · padding 2/8 |
| ล้น `+N` | `--radius-sm` | พื้น `--neutral-solid` ตัวอักษร `--neutral-on-solid` (T39) · `aria-label="ป้ายเพิ่มเติม: {รายชื่อ}"` + tooltip รายชื่อ |
| สถานะรายการ `C-BADGE-STATUS` | pill ไม่มีจุด | สีตามข้อ 2.5 ข |
| priority `C-BADGE-PRIORITY` | สี่เหลี่ยม `--radius-sm` + ไอคอนธง 12px | ป้ายไทย ต่ำ/ปกติ/สูง/ด่วน · สีข้อ 2.5 ก |
| จำนวน `C-BADGE-COUNT` | วงรี min 18px | พื้น `--danger-solid` ตัวอักษร `--gray-50` `caption` 600 · > 99 แสดง `99+` |

**ลำดับการแสดงป้ายลูกค้า (CANONICAL ข้อ 3.5):** `[lifecycle] [VIP] [ติดตามอยู่] [ลูกค้าใหม่] [ยังไม่ได้ติดต่อ]` — แสดงป้ายเสริมทุกป้ายที่เข้าเงื่อนไขตามลำดับนี้ **สูงสุด 3 ป้าย** เกินแสดง `+N` · ป้ายอ่านจากคอลัมน์แคช `crm.customers.lifecycle_stage` `has_open_followup` `has_new_lead` `first_seen_at` และ tag `VIP` เท่านั้น (CANONICAL ข้อ 6.3)

**คีย์ป้ายเสริม (CANONICAL ข้อ 19.5):** `vip` VIP (navy) · `followingUp` ติดตามอยู่ (warning) · `newCustomer` ลูกค้าใหม่ (info) · `notContacted` ยังไม่ได้ติดต่อ (danger) — ใช้ใน `prototype/assets/data.js` (`supplementaryBadges`) · `data-badge="{คีย์}"` · และเป็นชื่อคีย์ของแอปจริง

### 7.5 Avatar ตัวอักษรย่อ `C-AVATAR`

- ขนาด 32 (รายการ) · 40 (top bar/การ์ด) · 64px (หัว Customer 360) · วงกลม พื้น `--navy-100` ตัวอักษร `--navy-900` 600 · **ไม่มีรูปถ่ายลูกค้า** (CANONICAL ข้อ 3.5 · D42)
- ตัวอักษรย่อ: ลูกค้า = พยัญชนะตัวแรกของ `first_name` + พยัญชนะตัวแรกของ `last_name` (ข้ามสระหน้า เ แ โ ใ ไ) เช่น สมชาย ใจดี → "สจ" · มีแต่ `nickname` → พยัญชนะตัวแรกของ nickname · ชื่อละติน → อักษรแรกตัวใหญ่ · ลูกค้า `ANONYMIZED` → ไอคอนคน
- พนักงาน: ตัด "คุณ" ออกจาก `display_name` ก่อน เช่น คุณขวัญ → "ข" · จ๋าอั๋น → "จ"
- `aria-hidden="true"` เมื่อมีชื่อเป็นข้อความอยู่ข้าง ๆ

### 7.6 ตาราง `C-TABLE`

| ส่วน | สเปก |
|---|---|
| หัวตาราง | พื้น `--surface-subtle` · `body-sm` 500 `--text-secondary-sunk` · สูง 44px · sticky (`--z-sticky`) · หัวคอลัมน์เงินเขียน "(บาท)" เช่น "ยอดขาย (บาท)" |
| แถว | สูง 52px (เดสก์ท็อป) · 56px (แท็บเล็ต) · `body-sm` `--text-primary` · เส้นแบ่ง 1px `--border-subtle` · hover `--surface-subtle` · เลือก `--surface-selected` (T41) |
| ตัวเลข/เงิน/อัตรา | ชิดขวา · tabular · เงินในตารางไม่มี `฿` (`1,245,000`) |
| รหัส | `nowrap` · คลิกได้เมื่อเปิดรายการได้ (ลิงก์ `--text-link`) |
| แถวรวม | ตัวอักษร 700 · ขอบบน 2px `--border-default` · ป้าย "รวม" |
| เรียงลำดับ | ปุ่มในหัวคอลัมน์ + ลูกศร ▲/▼ + `aria-sort` · ค่าเริ่มต้นระบุต่อหน้า |
| เลือกหลายแถว | checkbox คอลัมน์แรก (เป้า 44px) · แถบการกระทำลอยด้านบนตาราง "เลือก N รายการ" + ปุ่มตามสิทธิ์ |
| ท้ายตาราง | `C-PAGINATION` · ข้อความ "แสดง 1–5 จาก 1,284 รายการ" |
| มือถือ | ตารางรายการ (ลูกค้า Lead ใบเสนอราคา คำขอส่งออก) เปลี่ยนเป็น **การ์ดรายการ** 1 คอลัมน์ · ตารางตัวเลข (รายงาน ผลงานรายสาขา) เลื่อนแนวนอนได้โดยคอลัมน์แรก sticky |
| ว่าง | แถวเดียวเต็มความกว้างแสดง `C-STATE-EMPTY` |

### 7.7 ตัวกรอง `C-FILTER` และตัวเลือกช่วงเวลา `C-PERIOD`

**แถบตัวกรอง** — พื้น `--surface-subtle` · `--radius-lg` · padding 12 · select สูง 40px เรียงแนวนอน gap 12 ขึ้นบรรทัดใหม่ได้ · ปุ่ม ghost "ล้างตัวกรอง" ท้ายแถบ (แสดงเมื่อค่าไม่ใช่ค่าเริ่มต้น) · มือถือ: ปุ่ม "ตัวกรอง (N)" เปิด bottom sheet · ค่าตัวกรองเก็บใน query string ได้เฉพาะรหัส (`branch=JP1`) **ห้ามมีคำค้นหรือข้อมูลส่วนบุคคลใน URL**

**ตัวเลือกสาขา** — ตัวเลือก "ทุกสาขา" + สาขาในสิทธิ์ของผู้ใช้ (`core.branches` ที่ `app.scope_branch_ids(<permission ของหน้า>,'OWN')` คืน) แสดงชื่อ "JAUNPHONE 1" … "ทีมออนไลน์ส่วนกลาง" · ผู้มีสาขาเดียว: ไม่แสดง select แสดงชื่อสาขาเป็นข้อความ · ค่าเริ่มต้นตามหน้า (CANONICAL ข้อ 14.1: หน้า 06 07 08 11 12 ของบทบาทหลายสาขาเริ่มที่ JP1)

**ตัวเลือกช่วงเวลา** — ปุ่ม secondary `[ไอคอนปฏิทิน] 30 วันล่าสุด ▾` + บรรทัดรอง "13 ส.ค. – 11 ก.ย. 2569" · เมนูแสดง preset 9 ค่าตาม (CANONICAL ข้อ 12.0) ตามลำดับ: วันนี้ · เมื่อวาน · 7 วันล่าสุด · สัปดาห์นี้ · 30 วันล่าสุด · เดือนนี้ · เดือนที่แล้ว · ไตรมาสนี้ · กำหนดเอง — แต่ละรายการมีช่วงวันที่แบบรวมวันสุดท้ายเป็นบรรทัดรอง · `role="menu"` + `menuitemradio` · **prototype เปิดใช้เฉพาะ "วันนี้" และ "30 วันล่าสุด"** preset อื่น `aria-disabled="true"` + tooltip **"ไม่มีข้อมูลตัวอย่างสำหรับช่วงนี้"** · "กำหนดเอง" เปิดตัวเลือกวันที่ 2 ช่อง (เริ่ม · สิ้นสุด แบบรวมวันสุดท้าย) ห้ามเกิน 366 วัน ข้อความผิด "เลือกช่วงได้ไม่เกิน 366 วัน" · **ส่ง RPC:** `p_preset` = รหัส preset · `CUSTOM` ส่ง `p_start` = วันเริ่ม และ `p_end` = **วันสิ้นสุดที่เลือก + 1 วัน** (exclusive · CANONICAL ข้อ 12.0)
- **ตำแหน่ง:** page header ของหน้า 02 09 12 เท่านั้น (CANONICAL ข้อ 14.3) · หน้าอื่นที่มีตัวกรองวันที่ (เช่น "ติดต่อล่าสุด" หน้า 03 · "ตั้งแต่/ถึง" หน้า 16) ใช้ select/ช่องวันที่ในแถบตัวกรองของหน้า ไม่ใช่ `C-PERIOD`

### 7.8 ช่องค้นหากลาง `C-SEARCH`

| หัวข้อ | สเปก |
|---|---|
| placeholder | **"ค้นหาชื่อ เบอร์ LINE Customer ID IMEI"** (CANONICAL ข้อ 14.3) · สี `--text-placeholder` |
| ใครเห็น | ผู้ใช้ ACTIVE ทุกบทบาท **ยกเว้น MARKETING และ SYSTEM_ADMIN** (ไม่แสดงช่อง ไม่แสดงไอคอน ไม่มีทางลัด `/` · CANONICAL ข้อ 14.3) · คนที่ถือบทบาทอื่นร่วมด้วยเห็นตามบทบาทนั้น |
| ค้นอะไรได้ | ชื่อ (trigram ≥ 3 ตัวอักษร) · `CUS-` `LD-` `OP-` `QT-` ตรงทั้งค่า · เบอร์/อีเมล/LINE ID/IMEI 15 หลัก/เลขธุรกรรม ตรงทั้งค่า (CANONICAL ข้อ 6.5) · **Serial ค้นไม่ได้ใน V1 [รอยืนยัน]** |
| ขนาด | เดสก์ท็อปกว้างสูงสุด 480px สูง 40px · แท็บเล็ตเป็นไอคอนที่ขยายเต็ม top bar · มือถือเปิดหน้าค้นหาเต็มจอ |
| การส่ง | กด Enter หรือปุ่ม "ค้นหา" เท่านั้น (**ไม่ค้นขณะพิมพ์** เพราะทุกครั้งบันทึก `CUSTOMER_SEARCH` และจำกัด 60 ครั้ง/ชม.) · ขั้นต่ำ 3 ตัวอักษร (น้อยกว่า: helper "พิมพ์อย่างน้อย 3 ตัวอักษร") |
| แหล่ง | `api.search_customers(p_term)` |
| ผลลัพธ์ | dropdown กว้าง 560px จัดกลุ่ม **ลูกค้า · Lead · โอกาสขาย · ใบเสนอราคา · ธุรกรรม** (หัวกลุ่ม + จำนวน) · รายการลูกค้า: avatar · "คุณ"+ชื่อ · `customer_no` · `value_masked` · ป้าย lifecycle · รายการอื่น: เลขอ้างอิง + ชื่อลูกค้า + สถานะ · สูงสุด 5 รายการต่อกลุ่ม + "ดูผลทั้งหมด" (ไปหน้า 03 โดยส่งคำค้นผ่าน state ไม่ใช่ URL) |
| คีย์บอร์ด | `/` โฟกัสช่องค้นหา · ↑↓ เลือก · Enter เปิด · Esc ปิด · `role="combobox"` + `aria-expanded` + `aria-activedescendant` |
| ไม่พบ | "ไม่พบผลลัพธ์สำหรับ “{คำค้น}”" + helper "เบอร์โทร อีเมล LINE ID IMEI และเลขธุรกรรมต้องพิมพ์ครบทั้งค่า" |
| เกินอัตรา | เกิน `security.search_per_hour` (60) → toast danger **"ค้นหาครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณารอสักครู่แล้วลองใหม่"** · RPC ตอบว่าถูกระงับจากการค้นด้วยตัวระบุที่ไม่พบผลเกิน `security.search_miss_per_hour` (20 · กติกาของข้อ 6.5 ที่ใช้กับ `api.find_customer_candidates` · `api.search_customers` ใช้ด้วยหรือไม่ยึด api-spec) → ระงับ 1 ชม. + แจ้ง `SEARCH_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN → toast danger **"ระงับการค้นหาชั่วคราว 1 ชั่วโมงเนื่องจากค้นหาไม่พบหลายครั้ง"** (CANONICAL ข้อ 6.5 · 11.1 · 11.2) · ข้อความไม่บอกว่ามีลูกค้าอยู่หรือไม่ |
| ความเป็นส่วนตัว | คำค้นไม่ลง URL · localStorage · console · analytics · ล้างเมื่อออกจากระบบ |

### 7.9 ข้อมูลติดต่อแบบปิดบัง + ปุ่มเปิดดู `C-CONTACT`

```
[ไอคอน] โทรศัพท์   081-XXX-5678        [แสดง] [โทร] [คัดลอก]
[ไอคอน] LINE ID    so***               [แสดง] [คัดลอก] [เปิด LINE]
[ไอคอน] อีเมล      s***@example.com    [แสดง] [คัดลอก]
การเปิดดู โทร หรือคัดลอก จะถูกบันทึกในประวัติการเข้าถึง          ← caption --text-secondary
```

| หัวข้อ | สเปก |
|---|---|
| ค่าเริ่มต้น | แสดง `value_masked` เท่านั้น (column grant · CANONICAL ข้อ 6.4) · LINE_USER_ID แสดง `—` ไม่มีปุ่ม |
| ปุ่มต่อชนิด | PHONE: แสดง · โทร · คัดลอก · LINE_ID: แสดง · คัดลอก · เปิด LINE · EMAIL / FACEBOOK / INSTAGRAM / TIKTOK: แสดง · คัดลอก · ปุ่ม `ghost` `sm` (เดสก์ท็อป) · ไอคอน 44px + `aria-label` (มือถือ) |
| การเรียก | ทุกปุ่มเรียก `api.reveal_contact(p_contact_id, p_purpose)` ก่อนเสมอ · `p_purpose`: แสดง=`VIEW` · โทร=`CALL` · คัดลอก=`COPY` · เปิด LINE=`LINE_OPEN` |
| แสดง | แทนข้อความด้วยค่าเต็ม + ป้าย info "แสดงอยู่ · ซ่อนใน 30 วินาที" (นับถอยหลังเป็นข้อความ) · ปุ่มเปลี่ยนเป็น "ซ่อน" · ครบ 30 วินาที **[รอยืนยัน]** หรือเปลี่ยนหน้า/แท็บเบราว์เซอร์ถูกซ่อน → กลับเป็นค่าปิดบังและลบค่าออกจาก DOM/state · `aria-live="polite"` ประกาศครั้งเดียว "แสดงข้อมูลติดต่อแล้ว จะซ่อนอัตโนมัติใน 30 วินาที" |
| โทร | ได้ค่าแล้วเปิด `tel:` ทันที (ไม่แสดงค่าบนจอ) → เมื่อกลับมาที่หน้า เปิด dialog "บันทึกการโทร" เป็นร่าง interaction `OUTBOUND` ช่องทาง PHONE ให้ยืนยัน (CANONICAL ข้อ 6.4) ปุ่ม "บันทึก" (ส้ม) · "ไม่บันทึก" (ghost) |
| คัดลอก | `navigator.clipboard.writeText` · toast "คัดลอกแล้ว" (ไม่แสดงค่าใน toast) |
| เปิด LINE | เปิดลิงก์ LINE ด้วย LINE ID · รูปแบบลิงก์ **รอยืนยัน** · prototype แสดง toast "เปิด LINE (prototype)" |
| ไม่มีสิทธิ์ `customer.pii.reveal` | ไม่แสดงปุ่ม · caption "บทบาทของคุณดูได้เฉพาะค่าที่ปิดบัง" |
| มีสิทธิ์แต่ต้อง aal2 (EX · BA ที่ aal1) | ปุ่มแบบปิดพร้อมเหตุผล "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน" |
| เกินเกณฑ์ (CANONICAL ข้อ 6.4 v2.2) | เกิน `security.reveal_per_hour` (30 ครั้ง/ชม.) → RPC **ปฏิเสธ** โดยคืนผลแบบไม่ raise (ไม่มีค่าเต็ม · ตัวนับและการแจ้ง `REVEAL_LIMIT_EXCEEDED` ถึง BUSINESS_ADMIN ถูก commit) → UI ไม่เปิด `tel:`/LINE ไม่คัดลอก · ค่าคงปิดบัง · toast danger (อยู่จนกดปิด) **"เปิดดูข้อมูลติดต่อครบ 30 ครั้งในชั่วโมงนี้แล้ว ระบบไม่แสดงข้อมูลและแจ้งผู้ดูแลข้อมูลธุรกิจแล้ว"** · ปุ่มเปิดดูทุกปุ่มบนหน้าเป็นแบบปิดพร้อมเหตุผล "เปิดดูข้อมูลติดต่อครบจำนวนต่อชั่วโมงแล้ว" จนโหลดหน้าใหม่ · ตัวเลข 30 อ่านจาก `api.get_settings()`/ค่าที่ RPC คืน ไม่ฝังในโค้ด |
| error อื่น | "เปิดข้อมูลไม่สำเร็จ กรุณาลองใหม่" |
| ที่อยู่ `C-ADDRESS` (CANONICAL ข้อ 19.1 ข้อ 5) | แสดง `crm.customer_addresses.value_masked` รูป `{อำเภอ} · {จังหวัด}` · ปุ่ม "แสดง" เรียก `api.reveal_address(p_address_id, 'VIEW')` (สิทธิ์ `customer.pii.reveal`) · กติกาซ่อนกลับ 30 วินาที · เกินเกณฑ์ · ไม่มีสิทธิ์ เหมือนช่องทางติดต่อ · ไม่มีปุ่มคัดลอก/โทร |
| ห้าม | ใส่ค่าเต็มใน HTML ตอนโหลด · `console.log` ค่า · autocomplete · เก็บใน storage · ใส่ใน URL |

### 7.10 แท็บ `C-TABS`

- เส้นใต้แบบ underline: แท็บสูง 44px · `body` 500 `--text-secondary` · ที่เลือก `--text-heading` 600 + เส้นใต้ 3px `--navy-900` (G21) · จำนวนต่อท้าย "(12)"
- ล้นความกว้าง: เลื่อนแนวนอน + เงาจางที่ขอบ + ปุ่มลูกศรซ้าย/ขวา (เดสก์ท็อป) · มือถือใช้ป้ายย่อที่หน้าจอกำหนด
- `role="tablist"` / `tab` / `tabpanel` · ←→ Home End ย้าย · Enter/Space เลือก (manual activation เพราะแท็บโหลดข้อมูล) · แท็บที่ไม่มีสิทธิ์ **ไม่แสดง**
- โหลดข้อมูลของแผงเมื่อเลือกครั้งแรก · แสดง skeleton ในแผง

### 7.11 Drawer `C-DRAWER`

- เลื่อนจากขวา กว้าง `--drawer-w` (ฟอร์ม) / `--drawer-w-wide` (รายละเอียดรายการ) · สูงเต็มจอ · `--shadow-4` · scrim `--surface-overlay` · มือถือเป็น bottom sheet เต็มจอ มุมบน `--radius-xl`
- หัว: ชื่อ `h3` + เลขอ้างอิง (ถ้ามี) + ปุ่มปิด `aria-label="ปิด"` · ท้าย sticky: ปุ่มรองซ้าย ปุ่มหลักขวา
- `role="dialog"` `aria-modal="true"` `aria-labelledby` · focus trap · Esc ปิด · ปิดเมื่อมีการแก้ไขที่ยังไม่บันทึก → dialog "ยกเลิกการแก้ไข?" ปุ่ม "ยกเลิกการแก้ไข" (danger-outline) · "กลับไปแก้ไข" (secondary) · คืน focus ไปที่ปุ่มที่เปิด

### 7.12 Dialog `C-DIALOG`

- กว้าง `--dialog-w-sm` (ยืนยัน) / `--dialog-w-md` (มีฟอร์ม: ปิดการขาย · ไม่สำเร็จ · บันทึกผลการให้บริการ · ขอส่งออก) · `--radius-lg` · `--shadow-4` · มือถือเต็มความกว้างชิดล่าง
- ปุ่มยืนยันต้องเขียนการกระทำจริง ("ปิดใช้งานผู้ใช้" "รวมลูกค้า") **ห้าม "ตกลง"** · การกระทำที่ย้อนไม่ได้ (รวมลูกค้า · ทำข้อมูลนิรนาม) ต้องมี checkbox "ฉันเข้าใจว่าย้อนกลับไม่ได้" ก่อนปุ่มจะใช้งานได้
- ฟิลด์เหตุผลที่มีรายการกลาง (เหตุผลไม่สำเร็จ `ref.lost_reasons` · เหตุผลเปลี่ยนผู้รับผิดชอบ `ref.ownership_change_reasons` · เหตุผลสร้างลูกค้าซ้ำ `ref.duplicate_override_reasons` · เหตุผลการส่งออก `ref.export_reasons`) เป็น select ไม่ใช่ข้อความอิสระ · `OTHER` บังคับหมายเหตุเฉพาะชุดที่ CANONICAL ระบุ: เหตุผลไม่สำเร็จ (บังคับ `lost_note`) · เหตุผลสร้างลูกค้าซ้ำ · เหตุผลการส่งออก (ข้อ 5.5 · 5.8) · เหตุผลยกเลิกคิว (`cancel_reason`) เป็นข้อความ + `C-PII-WARN`
- focus เริ่มที่ฟิลด์แรก (ถ้ามี) หรือปุ่มที่ไม่ทำลาย · Esc = ยกเลิก

**Dialog เปลี่ยนผู้รับผิดชอบ `C-DIALOG-ASSIGN`** (CANONICAL ข้อ 9.4.2 · 9.6 — คอลัมน์ owner ไม่อยู่ใน column grant ของ UPDATE จึง **เปลี่ยนได้ทางเดียวผ่าน `api.assign_owner`**)

| ส่วน | สเปก |
|---|---|
| หัว | "เปลี่ยนผู้รับผิดชอบ {เลขอ้างอิง}" (ลูกค้า: "เปลี่ยนผู้ดูแล {customer_no}" · visit: "เปลี่ยนผู้รับคิว {NNN}") · บรรทัดรอง "ปัจจุบัน: {ชื่อ}" หรือ "ปัจจุบัน: ยังไม่มีผู้รับผิดชอบ" |
| "ผู้รับผิดชอบใหม่" * | select พนักงานที่ ACTIVE และมี assignment ในสาขาของรายการ (`app.staff_has_branch_assignment`) · ไม่มีตัวเลือกผู้รับผิดชอบคนเดิม · ลูกค้า (ไม่มี `branch_id`) = พนักงานในสาขาที่ลูกค้าเชื่อมและผู้ใช้มี `customer.assign` |
| "เหตุผล" * | `ref.ownership_change_reasons` ตาม `sort_order`: เปลี่ยนกะ · กระจายงาน · พนักงานลาออก · ลูกค้าขอเปลี่ยน · ย้ายสาขา · อื่น ๆ · ข้อความผิด "เลือกเหตุผล" · "ย้ายสาขา" ตั้งอัตโนมัติเมื่อเปลี่ยนสาขา และไม่ให้เลือกเองเมื่อสาขาไม่เปลี่ยน |
| "สาขาปลายทาง" | แสดงเฉพาะ lead/opportunity/task และผู้ใช้มี `*.assign` ทั้งสาขาต้นทางและปลายทาง · ค่าเริ่มต้น = สาขาเดิม |
| "หมายเหตุ" | ไม่บังคับ · ≤ 1 บรรทัด + `C-PII-WARN` |
| ปุ่ม | "ยกเลิก" (ghost) · **"บันทึก"** (ส้ม) |
| RPC | `api.assign_owner(p_entity_type, p_entity_id, p_to_staff_id, p_reason_code, p_note, p_to_branch_id)` · `p_entity_type` ∈ `CUSTOMER` `VISIT` `LEAD` `OPPORTUNITY` `TASK` (ค่าตรงตาม api-spec) · `p_to_branch_id` = NULL เมื่อไม่ย้ายสาขา |
| ผล | บันทึก `crm.ownership_changes` (+ `BRANCH_TRANSFER` เมื่อย้ายสาขา) · แจ้ง `LEAD_ASSIGNED`/`OPPORTUNITY_ASSIGNED`/`TASK_ASSIGNED` ถึงผู้รับใหม่ (ยกเว้น task `is_next_action`) · toast success "เปลี่ยนผู้รับผิดชอบ {เลขอ้างอิง} เป็น {ชื่อ} แล้ว" |
| ใช้ไม่ได้ | interaction · quotation (เปลี่ยน owner ไม่ได้ · ไม่มีปุ่ม) · task `is_next_action` (ปุ่มปิดพร้อมเหตุผล "เปลี่ยนผู้รับผิดชอบที่ Lead/โอกาสขายต้นทางแทน" · ข้อ 19.2) · รายการที่ปิดแล้ว (อ่านอย่างเดียว) |

**Dialog รับทราบ `C-DIALOG-ACK`** (visit ที่ระบบปิดเป็น `UNRECORDED` · CANONICAL ข้อ 12.3 · 9.6) — หัว "รับทราบว่าไม่ได้บันทึกผล {visit_no}" · ข้อความ "ผลการให้บริการของ visit ที่ข้ามวันแล้วแก้ไม่ได้ การรับทราบจะบันทึกชื่อและเวลาของคุณ" · ปุ่ม "ยกเลิก" (ghost) · **"รับทราบ"** (navy) → `api.acknowledge_unrecorded_visit(p_visit_id)` ตั้ง `visits.unrecorded_ack_by` `unrecorded_ack_at` · สิทธิ์ `visit.update`

### 7.13 Toast `C-TOAST`

- ตำแหน่ง: เดสก์ท็อปมุมขวาล่าง 24px · แท็บเล็ตเหนือ FAB · มือถือเหนือ bottom nav 12px · กว้าง 360px · `--shadow-3` · สูงสุด 3 อันซ้อน
- variant success/info/warning/danger: แถบซ้าย 4px `*-solid` + ไอคอน + ข้อความ `body-sm` บนพื้น `--surface-card`
- success/info หายเอง 5 วินาที (หยุดเมื่อ hover/focus) · warning/danger อยู่จนกดปิด · `role="status"` (danger ใช้ `role="alert"`)
- **ห้ามมีเบอร์ อีเมล หรือ LINE ID** ใน toast · ใช้เลขอ้างอิงแทน เช่น "ปิดการขาย OP-2026-002998 แล้ว"

### 7.14 ฟอร์ม `C-FORM`

| control | สเปก |
|---|---|
| label | อยู่เหนือช่อง · `body-sm` 500 `--text-label` · ช่องบังคับ `*` สี `--danger-text` + ข้อความซ่อน "(จำเป็น)" |
| input/select | สูง 40px (เดสก์ท็อป) · 48px (มือถือ/counter) · ขอบ 1px `--border-strong` · `--radius-md` · focus: ขอบ `--border-focus` + ring 2px · ปิด: พื้น `--gray-100` ตัวอักษร `--text-disabled` · placeholder `--text-placeholder` |
| error | ขอบ `--danger-solid` + ไอคอน + ข้อความ `body-sm` `--danger-text` ใต้ช่อง · `aria-invalid="true"` + `aria-describedby` |
| helper | `caption` `--text-secondary` ใต้ช่อง |
| textarea | นับตัวอักษร "0/2,000" ชิดขวา (โน้ต · CANONICAL ข้อ 6.9) |
| ชิปเลือกค่าเดียว `C-CHIPS` | `role="radiogroup"` · ชิปสูง 40px (48 counter) · ไม่เลือก: พื้น `--gray-50` ขอบ `--border-strong` ตัวอักษร `--text-primary` · เลือก: พื้น `--navy-900` ตัวอักษร `--gray-50` + ไอคอนถูก (T24) · ←→ ย้าย |
| stepper `C-STEPPER` | ปุ่ม − / + ขนาดเท่าความสูง control · ช่องตัวเลขกลาง · ค่าต่ำสุด 1 (ปุ่ม − ปิดเมื่อ 1) · `role="spinbutton"` |
| checkbox | กล่อง 20px ขอบ `--border-strong` · เลือก: พื้น `--navy-700` ถูกสีขาว · พื้นที่กด ≥ 44px รวม label |
| แถบคำเตือนข้อมูลอ่อนไหว `C-PII-WARN` | พื้น `--warning-bg` ขอบซ้าย 4px `--warning-solid` ไอคอน ข้อความ `body-sm` `--text-primary`: **"ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา"** (CANONICAL ข้อ 6.9) — แสดงเหนือช่องข้อความอิสระทุกช่อง (โน้ต · สรุปการติดต่อ · ชื่อ/รายละเอียดงาน · next action · หมายเหตุไม่สำเร็จ · เงื่อนไขใบเสนอราคา) |
| error จาก trigger ข้อความต้องห้าม | "ข้อความมีเลขที่อาจเป็นเลขบัตรประชาชน ระบบไม่อนุญาตให้บันทึก" (CANONICAL ข้อ 10.1) |

**จังหวะตรวจ:** ตรวจเมื่อออกจากช่อง (blur) และเมื่อกดบันทึก · กดบันทึกแล้วยังผิด → กล่องสรุปบนสุดของฟอร์ม `role="alert"` "กรุณาแก้ไข N ช่อง" + ลิงก์ไปแต่ละช่อง · ฟอร์มหลายแท็บ: แท็บที่มีช่องผิดแสดงจุด danger + ข้อความซ่อน "มีข้อผิดพลาด"

### 7.15 สถานะของหน้าและ widget `C-STATE`

| id | ใช้เมื่อ | รูปแบบ | ข้อความมาตรฐาน |
|---|---|---|---|
| `C-STATE-LOADING` | กำลังโหลด | skeleton ขนาดเท่าของจริง (การ์ด KPI · แถว 5 แถว · วงโดนัท · แท่ง) พื้น `--surface-sunken` · `aria-busy="true"` + ข้อความซ่อน "กำลังโหลด…" | – |
| `C-STATE-EMPTY` | ไม่มีรายการ | ไอคอนเส้น 48px `--gray-400` + หัว `h4` + คำอธิบาย `body-sm` + ปุ่ม (ถ้ามีสิทธิ์) | ต่อหน้า เช่น "ยังไม่มีลูกค้าในสาขาของคุณ" |
| `C-STATE-NORESULT` | ตัวกรองไม่พบ | เหมือน EMPTY + ปุ่ม "ล้างตัวกรอง" | "ไม่พบรายการตามเงื่อนไข" |
| `C-STATE-ERROR` | โหลดไม่สำเร็จ | การ์ดขอบ `--danger-border` ไอคอน danger + ปุ่ม "ลองอีกครั้ง" + `caption` "รหัสอ้างอิง {request_id}" | "โหลดข้อมูลไม่สำเร็จ" |
| `C-STATE-NOACCESS-PAGE` | เปิดหน้าที่บทบาทเข้าไม่ได้ (CANONICAL ข้อ 14.1) | การ์ดกลางหน้า ไอคอนกุญแจ | หัว **"ไม่มีสิทธิ์เข้าหน้านี้"** · "หน้านี้เปิดได้สำหรับ: {ป้ายไทยของบทบาทใน data-roles}" · "บทบาทของคุณ: {ป้ายบทบาท}" · ปุ่ม "กลับหน้าแรก" |
| `C-STATE-NOTFOUND` | เปิดรายการที่ไม่มีหรืออ่านไม่ได้ | การ์ดกลางหน้า | **"ไม่พบข้อมูล หรือคุณไม่มีสิทธิ์ดูรายการนี้"** (ไม่แยกสองกรณี เพื่อไม่บอกว่ามีรายการอยู่) |
| `C-STATE-LOCKED` | ฟีเจอร์ยังไม่เปิด | ไอคอนกุญแจ + ป้าย neutral "Phase N" | "ยังไม่เปิดใช้งานใน Phase นี้" |
| `C-STATE-DESKTOP-ONLY` | หน้า 09 13 14 15 16 17 18 บนมือถือ (CANONICAL ข้อ 14.4) | การ์ดกลางหน้า + ปุ่ม "กลับหน้าแรก" | **"กรุณาใช้งานบนคอมพิวเตอร์"** |
| `C-STATE-MFA` | มีสิทธิ์แต่เซสชันยังไม่ aal2 | แถบ warning บนหน้า + ปุ่ม "ยืนยันตัวตน" | "ต้องยืนยันตัวตนสองขั้นตอน (MFA) เพื่อใช้งานส่วนนี้" |
| `C-STATE-SAMPLE` **(prototype เท่านั้น)** | ข้อมูลตัวอย่างไม่ครบตามข้อ 13.0 ข้อ 10 | แถบ info บนรายการ/widget | "ข้อมูลตัวอย่างมีเฉพาะรายการที่ระบุชื่อ · แสดง {k} จาก {N} รายการ" หรือ "ไม่มีข้อมูลตัวอย่างสำหรับ {ขอบเขต}" (ถ้าไม่รู้ N เขียน "–") |

**ศูนย์ · ว่าง · NULL — ห้ามสลับกัน (CANONICAL ข้อ 1.3 · 9.4.1 · 13.13)**

| กรณี | การ์ด KPI/ตัวเลข | รายการ/widget | ตัวอย่าง |
|---|---|---|---|
| RPC คืนจำนวน 0 (ผู้ใช้มีขอบเขตแต่ไม่มีรายการ) | `0` · เงิน `฿0` · ไม่มี delta | `C-STATE-EMPTY` ข้อความของหน้า | คุณฝน (STAFF@JPON): งานวันนี้ `0` · ยอดขาย 30 วัน `฿0` · รายการงาน "ยังไม่มีงานวันนี้" |
| RPC คืน `NULL` (KPI ไม่ผูกพนักงานภายใต้ scope TEAM/OWN · อัตรา 0/0) | `–` สี `--text-secondary` + helper `caption` "ตัวเลขนี้ไม่ผูกกับพนักงาน จึงไม่แสดงสำหรับขอบเขตของคุณ" (กรณีไม่ผูกพนักงาน) หรือไม่มี helper (อัตรา 0/0) · ไม่มี delta · ผู้อ่านหน้าจอ "ไม่มีข้อมูล" | กราฟที่ทุกค่าเป็น `NULL` → `C-STATE-EMPTY` "ไม่มีข้อมูลสำหรับขอบเขตนี้" | คุณฝน: Conversion (Lead → ขาย) = 0/0 → `–` · ลูกค้าไม่ซ้ำ (ไม่ผูกพนักงาน) → `–` · คุณนัท (TEAM): ลูกค้าไม่ซ้ำ `–` |
| ค่าไม่มีในข้อมูลตัวอย่าง (prototype) | `–` | `C-STATE-SAMPLE` | ยอดรวมทุกช่วงเวลาของ Pipeline "จาก – รายการ" |

### 7.16 ไทม์ไลน์ `C-TIMELINE`

```
11 ก.ย. 2569 ─────────────────────────────────────────── (หัววัน sticky · caption 500)
 (◯) สอบถาม                                          10:24
  │  LINE · ลูกค้าติดต่อมา · JAUNPHONE 1
  │  สอบถาม iPhone 17 Pro และเงื่อนไขผ่อน
  │  [V-JP1-260911-007] [เสร็จสิ้น · ยังไม่ซื้อ]
```

- เส้นแนวตั้ง 2px `--border-subtle` · โหนด 32px วงขอบ 2px `--channel-{code}` พื้น `--gray-50` ไอคอนช่องทาง 16px สีเดียวกัน
- บรรทัด 1: ป้ายประเภท (`ref.interaction_types.label_th`) `body` 600 · เวลา `caption` ชิดขวา (หัววันแสดงวันที่แล้วจึงแสดงเฉพาะ `HH:mm`)
- บรรทัด 2: `{ช่องทาง} · {ทิศทาง} · {สาขา}` — ทิศทาง: INBOUND "ลูกค้าติดต่อมา" · OUTBOUND "พนักงานติดต่อไป" · INTERNAL "บันทึกภายใน" (CANONICAL ข้อ 4.8)
- บรรทัด 3: `summary` · บรรทัด 4: ชิปลิงก์ `visit_no` + ป้ายสถานะ/ผล · เลข LD/OP/QT ที่เกี่ยวข้อง · "โดย {พนักงาน}" เมื่อ `owner_staff_id` มีค่า
- ตัวกรองเหนือไทม์ไลน์: ช่องทาง (หลายค่า) · ประเภท (หลายค่า) · ปุ่ม "แสดงเพิ่ม" โหลดทีละ 20 รายการ
- โครงสร้าง `<ol>` เรียงใหม่→เก่า · แต่ละรายการเป็น `<li>` ที่มี `<time datetime>`
- interaction ที่ผูก visit `CANCELLED` ไม่แสดงในไทม์ไลน์และไม่นับใน "จำนวนการติดต่อ" (CANONICAL ข้อ 3.1 · 3.3 ข้อ 5 v2.2)

### 7.17 Kanban `C-KANBAN` · การ์ดโอกาสขาย `C-KANBAN-CARD`

**คอลัมน์** — กว้างต่ำสุด `--kanban-col-w` · พื้น `--surface-subtle` · `--radius-lg` · padding 8 · หัว: ชื่อขั้น `h4` + "({N} รายการ)" `body-sm` + มูลค่า `num` 600 "฿426,800" · การ์ดห่าง 8px · เลื่อนแนวตั้งในคอลัมน์ได้

**การ์ด**
```
┃ คุณสมชาย ใจดี                       ⋮
┃ iPhone 17 Pro
┃ ฿45,900                   [สูง]
┃ [ปฏิทิน] 18 ก.ย.   (ป้ายเกินกำหนดถ้ามี)
┃ (ข) คุณขวัญ
```
- พื้น `--surface-card` · ขอบ 1px `--border-subtle` · **ขอบซ้าย 4px สีตาม `priority_code`** (`--priority-*` · G11–G14 · CANONICAL ข้อ 13.9) · การ์ดที่ `priority_code` ว่าง → ขอบ `--priority-unknown` (G28 · ตกแต่ง · **ไม่ใช่สี NORMAL** · CANONICAL ข้อ 19.5) และไม่แสดงป้าย priority · padding 12 · `--radius-md` · `data-priority="{code}"` (ว่าง = ไม่ใส่ attribute)
- บรรทัด: ชื่อลูกค้า ("คุณ"+ชื่อ) `body-sm` 600 `--text-heading` · สินค้า `body-sm` · มูลค่า `num` 600 (`expected_amount` หรือ `won_amount`) · ป้าย priority `C-BADGE-PRIORITY` (ข้อความ ต่ำ/ปกติ/สูง/ด่วน — ไม่พึ่งสีขอบ) · วันที่ (`next_action_at` หรือ `won_at` แบบย่อ "18 ก.ย." เมื่อเป็นปีเดียวกับ `app.clock()`) + ป้าย danger "เกินกำหนด" เมื่อ `next_action_at` < วันนี้ 00:00 · ผู้รับผิดชอบ avatar 20px + ชื่อ `caption`
- คลิก/Enter เปิด drawer รายละเอียด · ปุ่ม ⋮ มีเมนู "ย้ายไปขั้น…" (แสดงเฉพาะเมื่อมีปลายทางที่อนุญาต และแสดงเฉพาะปลายทางนั้น) · "ปิดการขาย" · "ไม่สำเร็จ" · "เปลี่ยนผู้รับผิดชอบ" (`opportunity.assign` · `C-DIALOG-ASSIGN`)

**การย้ายขั้น (ลากการ์ด + เมนู "ย้ายไปขั้น…") — CANONICAL ข้อ 4.4 · 14.9 v2.2 · D48**

| จากคอลัมน์ → ไปคอลัมน์ | ผล | ข้อความ (toast เมื่อวางในทิศที่ไม่อนุญาต · warning) |
|---|---|---|
| เสนอราคา (`QUOTATION`) → รอตัดสินใจ (`FOLLOW_UP`) | **อนุญาต** · UPDATE `stage` | toast success "ย้าย คุณ{ชื่อ} ไปขั้นรอตัดสินใจแล้ว" |
| สนใจ (`INTERESTED`) → เสนอราคา หรือ รอตัดสินใจ | **อนุญาตเฉพาะเมื่อ opportunity มี quotation ที่ `sent_at IS NOT NULL`** · ไม่มี → ไม่อนุญาต | "ต้องส่งใบเสนอราคาก่อน ระบบจะย้ายไปขั้นเสนอราคาให้อัตโนมัติเมื่อส่ง" + ปุ่มใน toast "สร้างใบเสนอราคา" (เมื่อมี `quotation.create`) |
| รอตัดสินใจ → เสนอราคา | ไม่อนุญาตด้วยมือ (ระบบย้ายเองเมื่อมีใบใหม่ `SENT`) | "ขั้นจะกลับเป็นเสนอราคาอัตโนมัติเมื่อส่งใบเสนอราคาใบใหม่" |
| เสนอราคา/รอตัดสินใจ → สนใจ | **ห้าม** | "ย้อนกลับไปขั้นสนใจไม่ได้" |
| คอลัมน์เปิดใดก็ได้ → ปิดการขาย (7 วัน) | ไม่รับการวาง · ใช้ปุ่ม "ปิดการขาย" (dialog) | "ปิดการขายผ่านปุ่ม ‘ปิดการขาย’ เพื่อกรอกยอดขาย" |
| การ์ดในคอลัมน์ปิดการขาย | ลากไม่ได้ (ไม่มี handle) | – |

- ลากได้เฉพาะการ์ดที่ผู้ใช้มี `opportunity.update` บนแถว (การ์ดอื่นไม่มี cursor grab · `aria-disabled="true"`) · ขณะลาก: `--shadow-3` · **คอลัมน์ที่วางได้ตามตาราง** ขอบประ 2px `--navy-400` (G24) พื้น `--navy-50` · คอลัมน์ที่วางไม่ได้ cursor `not-allowed` + tooltip ข้อความตามตาราง · วางในทิศที่ไม่อนุญาต → การ์ดกลับที่เดิม + toast warning ข้างบน (ไม่เรียก RPC) · RPC/trigger ปฏิเสธ → การ์ดกลับที่เดิม + toast danger "ย้ายขั้นไม่สำเร็จ กรุณาลองใหม่" · `aria-live` ประกาศผล
- ทางเลือกคีย์บอร์ด/สัมผัส = เมนู "ย้ายไปขั้น…" (บังคับมี) ซึ่งแสดงเฉพาะปลายทางที่อนุญาตตามตาราง · การ์ดสนใจที่ยังไม่ส่งใบเสนอราคาไม่มีรายการเมนูนี้ แสดง "สร้างใบเสนอราคา" แทน (เมื่อมี `quotation.create`)

### 7.18 รายการคิว `C-QUEUE`

```
┌─────┐ [กำลังให้บริการ]  ซื้อเครื่อง                       [บันทึกผล] ⋮
│ 001 │ เข้าคิว 10:05 · ผู้รับ คุณขวัญ
└─────┘
┌─────┐ [รอรับบริการ]  เทิร์นเครื่อง                         [รับคิว]  ⋮
│ 002 │ เข้าคิว 10:12 · รอ 12 นาที
└─────┘
```
- แถวสูง ≥ 72px · เลขคิว กล่อง 56px พื้น `--navy-50` ตัวเลข `kpi-sm` 700 `--text-heading` + ข้อความซ่อน "คิว"
- ป้ายสถานะ visit (ข้อ 2.5 ข) · วัตถุประสงค์ (`ref.interest_types.label_th`) · เวลาเข้าคิว `HH:mm` · สำหรับ `WAITING` แสดง "รอ {นาที} นาที" = นาทีเต็มจาก `started_at` ถึง `app.clock()` · เกิน `sla.visitor_waiting_min` (15) → ป้าย warning "รอนาน" + ขอบซ้าย 4px `--warning-solid` (G13)
- ปุ่มหลักของแถว (secondary `md`; counter 48px): `WAITING` → "รับคิว" · `IN_SERVICE` → "บันทึกผล" · เมนู ⋮: "ระบุลูกค้า" · "ออกก่อนรับบริการ" · "ยกเลิก (สร้างผิด)"
- เรียง `queue_no` น้อย→มาก · `<ol>` ที่มี `aria-label="คิววันนี้"`

### 7.19 รายการงาน `C-TASK`

- แถว ≥ 64px: checkbox "ทำเสร็จ" (เป้า 44px · `aria-label="ทำเสร็จ: {ชื่องาน}"`) · ชื่องาน `body` 500 · บรรทัดรอง `body-sm`: ป้ายประเภท (`ref.task_types.label_th`) · "คุณ{ลูกค้า}" · `customer_no` · ขวา: เวลา (`HH:mm` สำหรับวันนี้ · "10 ก.ย. 2569 13:00" สำหรับเกินกำหนด) · ป้าย priority · ป้าย "เกินกำหนด" (danger) หรือ "เลยเวลา" (warning)
- หัวกลุ่ม sticky `h4`: "เกินกำหนด (4)" ก่อน "วันนี้ (8)" · เรียง `due_at` น้อย→มากในกลุ่ม
- มุมมองทีม/สาขา: เพิ่ม avatar + ชื่อผู้รับผิดชอบ

### 7.20 กราฟ

**ร่วมทุกกราฟ `C-CHART`** — ข้อบังคับของ (CANONICAL ข้อ 15 v2.2) และข้อ 2.6: เส้นคั่น 2px `#FBFBFB` · legend ข้อความ "ชื่อ · จำนวน · %" ตาม `sort_order` · ปุ่ม "ดูเป็นตาราง"
- อยู่ในการ์ดพื้น `--gray-50` เสมอ (สีกราฟผ่านเกณฑ์บนพื้นนี้เท่านั้น) · หัว `h3` + ช่วงเวลา `caption` + ปุ่ม ghost **"ดูเป็นตาราง"** (สลับเป็น `<table>` ที่มีข้อมูลเดียวกัน คอลัมน์ ชื่อ · จำนวน · ร้อยละ · `aria-pressed` · ข้อความปุ่มเปลี่ยนเป็น "ดูเป็นกราฟ")
- กราฟวาดด้วย SVG · `<svg role="img" aria-labelledby="{title-id} {desc-id}">` + `<desc>` สรุปค่า เช่น "แหล่งที่มาลูกค้า 1,284 ราย: Walk-in (หน้าร้าน) 462 ราย 36.0% …"
- ส่วนของกราฟที่ชี้ได้ มี tooltip เมื่อ hover และเมื่อ focus ผ่านรายการ legend (legend เป็นปุ่ม)
- ห้ามส้ม `--orange-*` · ห้าม gradient/3D/เงา · เส้นคั่น `--chart-separator` 2px · ป้ายแกน `caption` `--chart-axis-label`
- ข้อมูลเป็น 0 ทั้งหมด → `C-STATE-EMPTY` "ยังไม่มีข้อมูลในช่วงนี้" · ไม่มีข้อมูลตัวอย่าง → `C-STATE-SAMPLE`
- ร้อยละในกราฟปัดแยกรายการ (ผลรวมอาจเป็น 99.9% หรือ 100.1% — ห้ามบังคับให้ครบ 100)

**โดนัท `C-CHART-DONUT`** — เส้นผ่านศูนย์กลาง 200px (เดสก์ท็อป) · 160px (แท็บเล็ต/มือถือ) · ความหนา 32px · เริ่ม 12 นาฬิกา ตามเข็ม ตาม `sort_order` · **ซ่อนส่วนที่ค่าเป็น 0** (เช่น WEBSITE · CANONICAL ข้อ 13.3) · กลางวง: ค่า `kpi` + ป้าย `caption` เช่น "ลูกค้าไม่ซ้ำ" · legend ด้านขวา (เดสก์ท็อป) / ด้านล่าง 2 คอลัมน์ (มือถือ): สัญลักษณ์ 12px · ชื่อ · จำนวน · ร้อยละ (ชิดขวา)

**Funnel `C-CHART-FUNNEL`**
```
ผู้มาติดต่อ (Visitor)   ████████████████████████████████  3,125  100.0%
Leads                   █████████                           892   28.5%
Opportunities           ████                                368   11.8%
ปิดการขาย (Sales)       ██                                  215    6.9%
```
- แถบแนวนอน 4 ขั้นเรียงบนลงล่าง กว้างตามสัดส่วนกับขั้นแรก (ต่ำสุด 4px) สี `--chart-1` `--chart-2` `--chart-3` `--chart-6` · เส้นคั่น 2px `--chart-separator` ระหว่างขั้น · ชื่อขั้นซ้าย (`body-sm` 500) · ค่า + "% ของผู้มาติดต่อ" ขวา · **ขั้นแรกแสดง `100.0%`** (1 ตำแหน่งเสมอ · CANONICAL ข้อ 1.3 v2.2)
- ไอคอน ⓘ ข้างหัวการ์ด เปิด tooltip (บังคับตาม CANONICAL ข้อ 3.1): **"นับแต่ละขั้นจากวันที่เหตุการณ์ของขั้นนั้นเกิดในช่วงเวลา (ไม่ใช่กลุ่มลูกค้าเดียวกัน) · ยอดปิดการขายในช่วงนี้อาจมาจาก Lead ของช่วงก่อน"**
- โครงสร้าง `<ol>` ที่อ่านได้โดยไม่มีกราฟ

**แท่งแนวนอน `C-CHART-HBAR`** — ใช้กับ "เหตุผลที่ไม่สำเร็จ" (สีเดียว `--chart-lost` · 5 อันดับเรียงมากไปน้อย ค่าเท่ากันเรียงตาม `sort_order` · "อื่น ๆ" อยู่ท้ายเสมอ · ค่าแสดง "83 · 28.0%") และ "ลูกค้าเข้าร้านแยกตามสาขา" (สี `--chart-1`) · แถบสูง 16px ห่าง 12px · ชื่อซ้ายกว้างคงที่ 160px · ค่าอยู่ขวาสุดของแถบ · ไม่มีเส้นกริด

**แท่งแนวตั้ง `C-CHART-BAR`** — สเปกสำรองสำหรับกราฟแนวโน้ม (Phase 3 · ไม่อยู่ใน prototype ตาม D44): แท่งกว้าง ≤ 32px ห่าง ≥ 8px · แกน Y เริ่ม 0 · เส้นกริดแนวนอน 1px `--border-subtle` (ตกแต่ง) · ป้ายแกน X เป็นวันที่แบบย่อ · หลายชุดข้อมูลใช้สีตาม token ของช่องทาง + legend ข้อความ

**Legend `C-LEGEND`** — รายการ `<ul>` เรียงตาม `sort_order` (CANONICAL ข้อ 15) · แต่ละรายการเป็น `<button>` สูง ≥ 32px (44 เมื่อสัมผัส) · สัญลักษณ์สี่เหลี่ยม 12px `--radius-sm` + **ข้อความ "ชื่อ · จำนวน · %"** เช่น "TikTok · 90 · 7.0%" · กดเพื่อเน้น (ไม่ซ่อนข้อมูล) · `aria-pressed` · ส่วนที่ค่าเป็น 0 ไม่อยู่ใน legend

### 7.21 Bottom navigation `C-BOTTOMNAV` (มือถือ)

```
┌──────────┬──────────┬───(  +  )───┬──────────┬──────────┐
│  หน้าแรก  │  ลูกค้า   │   รับลูกค้า   │   งาน    │  เพิ่มเติม  │
└──────────┴──────────┴─────────────┴──────────┴──────────┘
```
- สูง `--bottom-nav-h` + safe area · พื้น `--gray-50` ขอบบน `--border-subtle` · `<nav aria-label="เมนูหลัก">` · `--z-bottom-nav`
- ช่องละเท่ากัน · ไอคอน 24px + ป้าย `caption` 500 · ปกติ `--text-secondary` · ช่องปัจจุบัน `--text-heading` 600 + แถบบน 3px `--navy-900` + `aria-current="page"`
- ช่องกลาง **"รับลูกค้า"**: วงกลม 56px `--orange-500` ไอคอน "+" 28px `--navy-900` (G22) ยกขึ้น 16px · `--shadow-3` · ป้าย "รับลูกค้า" ใต้วง `--text-heading` → เปิดฟอร์มรับลูกค้าแบบย่อ (`04-quick-capture.html?mode=visit`)
- ป้ายช่องตาม (CANONICAL ข้อ 14.4) ตรงตัว · ช่องที่ผู้ใช้เข้าไม่ได้ให้ **ไม่แสดง** (เช่นบทบาทที่ไม่มี `visit.create` ไม่มีช่องกลาง) · "เพิ่มเติม" แสดงเสมอ (มี "ออกจากระบบ")
- "เพิ่มเติม" เปิด bottom sheet รายการ: โอกาสการขาย · Leads · ศูนย์คุณภาพข้อมูล · ออกจากระบบ (แสดงเฉพาะที่เข้าได้)

### 7.22 FAB `C-FAB` (แท็บเล็ต)

- ปุ่มยาว "+ รับลูกค้า" สูง 56px padding 0 20px `--radius-full` · พื้น `--orange-500` ตัวอักษร `--navy-900` `body` 600 · `--shadow-3` (ชดเชย G23) · ตรึงมุมขวาล่าง 24px · `--z-fab`
- แสดงเฉพาะบทบาทที่มี `visit.create` (STAFF SUPERVISOR BRANCH_MANAGER) · ซ่อนบนหน้า 04 และ 07 และขณะ drawer/dialog เปิด
- เดสก์ท็อปไม่ใช้ FAB (ปุ่มอยู่ในหัวหน้า) · มือถือไม่ใช้ FAB (ช่องกลาง bottom nav)

### 7.23 แผงแจ้งเตือน `C-NOTIF`

- ปุ่มกระดิ่ง 40px (44 สัมผัส) + `C-BADGE-COUNT` จำนวนที่ยังไม่อ่าน · `aria-label="การแจ้งเตือน ยังไม่อ่าน {N} รายการ"`
- dropdown กว้าง 400px (มือถือเต็มจอ) · หัว "การแจ้งเตือน" + ปุ่ม ghost "อ่านทั้งหมดแล้ว" · รายการ: จุด 8px `--navy-700` (ยังไม่อ่าน) · title (`crm.notifications.title` = ป้ายไทยตาม CANONICAL ข้อ 11.1 · ครบ 25 รหัสรวมรหัสใหม่ของ v2.2 `LOCKOUT_REPEATED` `LINK_LIMIT_EXCEEDED` `CUSTOMER_VIEW_LIMIT_EXCEEDED` `EXPORT_READY` `ROLE_GRANT_DECIDED` `DSR_DUE_SOON`) `body-sm` 600 · body `body-sm` · เลขอ้างอิง (`entity_ref`)/เวลา (`created_at` แบบ `11 ก.ย. 2569 09:00`) `caption` `--text-secondary`
- **body แสดงตามที่เก็บ** — `notifications.body` เป็นข้อความสำเร็จรูปที่มี "คุณ" หน้าชื่อลูกค้าอยู่แล้ว (CANONICAL ข้อ 3.5 v2.2) → UI **ห้ามเติม "คุณ" ซ้ำ** · body ว่าง → ไม่แสดงบรรทัด body
- ตารางรหัส → ป้าย → หน้าปลายทาง (deep link) อยู่ใน `sitemap-screen-specs.md` ข้อ 1.8
- กดรายการ → ไป deep link + ตั้ง `read_at` (UPDATE เฉพาะคอลัมน์ `read_at` ของตน) · ว่าง: "ไม่มีการแจ้งเตือนใหม่"

### 7.24 การแบ่งหน้า `C-PAGINATION`

ซ้าย: "แสดง {from}–{to} จาก {total} รายการ" (ตัวเลขคั่นหลักพัน) · ขวา: ปุ่ม "ก่อนหน้า" · เลขหน้า (สูงสุด 7 ช่องใช้ "…") · "ถัดไป" · ปุ่ม 40px (44 สัมผัส) · หน้าปัจจุบันพื้น `--navy-900` ตัวอักษร `--gray-50` + `aria-current="page"` · ขนาดหน้าเริ่มต้น 20 แถว (**ข้อเสนอของผู้ออกแบบ**)

### 7.25 หน้าล็อกอุปกรณ์ counter `C-LOCK`

อุปกรณ์ที่ลงทะเบียน `core.devices.is_shared_counter = true` ไม่มีการใช้งาน `session.shared_counter_idle_min` (10) นาที → ทับทั้งจอ พื้น `--navy-900` · `--z-lock` · ข้อความ `h2` `--gray-50` **"หน้าจอถูกล็อกเนื่องจากไม่มีการใช้งาน"** · ปุ่มส้ม "เข้าสู่ระบบอีกครั้ง" → หน้า 01 · ล้างข้อมูลที่แสดงบนจอก่อนแสดงหน้าล็อก (CANONICAL ข้อ 9.2)

### 7.26 กรอบโทรศัพท์ `C-PHONE-FRAME` (เฉพาะหน้า 10)

กรอบ 375×812px · มุม `--radius-xl` ×2 · ขอบ 8px `--gray-900` · แถบสถานะด้านบนแสดงเวลา "10:24" · เนื้อหาภายในใช้ component มือถือจริงด้านบน (ไม่วาดเป็นภาพ) · มีหัวใต้กรอบ `h4` บอกชื่อหน้าจอ

---

## 8. Responsive

### 8.1 ตารางเปรียบเทียบ

| หัวข้อ | เดสก์ท็อป ≥ 1280 | แท็บเล็ต 768–1279 (counter) | มือถือ < 768 |
|---|---|---|---|
| ผู้ใช้หลัก (B18) | ผู้บริหาร · ผู้จัดการ · งานวิเคราะห์ | counter หน้าร้าน | พนักงาน · รับลูกค้าหน้างาน |
| เมนู | sidebar 264px | sidebar ไอคอน 72px | bottom nav 5 ช่อง |
| "+ รับลูกค้า" | ปุ่มส้มในหัวหน้า 02 และ 03 | FAB มุมขวาล่าง | ช่องกลาง bottom nav |
| ปุ่มหลัก | 40px | **≥ 48px** | 48px (เป้าสัมผัส ≥ 44px) |
| หน้า 02 | ครบตาม (CANONICAL ข้อ 14.7) | การ์ด KPI + Funnel + งานวันนี้ · **ซ่อน** กราฟแนวโน้ม · Top Product · ตารางสาขา (CANONICAL ข้อ 14.4) | บทบาท STAFF: การ์ด "งานทั้งหมด 12 · เกินกำหนด 4" + ปุ่มลัด + ลูกค้าที่ฉันรับล่าสุด (ข้อ 14.4 · 13.5) · บทบาทอื่น: การ์ด KPI + widget แรกของบทบาทนั้น (CANONICAL ข้อ 19.5) · รายละเอียดใน `sitemap-screen-specs.md` หน้า 02 |
| Customer 360 | หัว + 2 คอลัมน์ (ซ้าย 320px) | 2 คอลัมน์ (ซ้าย 280px) | 1 คอลัมน์ · แท็บชุดเดียวกัน ป้ายย่อ |
| ตารางรายการ | ตารางเต็ม | ตารางซ่อนคอลัมน์รอง | การ์ดรายการ |
| drawer | 480/640px | 480px | bottom sheet เต็มจอ |
| หน้า 09 13 14 15 16 17 18 | ใช้ได้ | ใช้ได้ | `C-STATE-DESKTOP-ONLY` "กรุณาใช้งานบนคอมพิวเตอร์" |

### 8.2 กติกา

1. ออกแบบมือถือเป็นหน้าจอของตัวเอง (ลำดับฟิลด์ ปุ่มลัด ป้ายย่อ) ไม่ใช่ย่อ layout เดสก์ท็อป (A24)
2. เนื้อหาไม่ถูกบังด้วย bottom nav/FAB: `padding-bottom` ของเนื้อหา = ความสูงของ bottom nav + 16px (มือถือ) · 96px (แท็บเล็ต ที่มี FAB)
3. ฟอร์มยาวบนมือถือ: ปุ่มบันทึกติดล่าง (sticky) เหนือ safe area · เมื่อแป้นพิมพ์เปิด ปุ่มยังเห็นได้
4. `html[data-device="counter"]` (ตั้งจาก `core.devices`) บังคับเป้าสัมผัส 48px ทุกหน้า · ซ่อน "จดจำฉันไว้" · เปิด `C-LOCK`
5. ห้ามเลื่อนแนวนอนทั้งหน้า · ตารางตัวเลขเลื่อนแนวนอนได้ในกล่องของตัวเองเท่านั้น
6. ภาพและกราฟใช้หน่วยสัมพัทธ์ · โดนัทลดขนาดตามข้อ 7.20 · Kanban บนมือถือเปลี่ยนเป็นแท็บขั้น + รายการการ์ด (หน้า 06)

---

## 9. Accessibility

เป้าหมาย WCAG 2.2 ระดับ AA

| หัวข้อ | กติกา |
|---|---|
| Focus | ทุก element ที่โต้ตอบได้มี `:focus-visible` = outline 2px `--focus-ring-color` offset 2px (บนพื้น navy ใช้ `--focus-ring-color-on-dark`) · ห้าม `outline: none` โดยไม่มีตัวแทน · focus ไม่ถูกบังด้วย top bar/bottom nav (`scroll-padding`) |
| ลำดับ | ลำดับ DOM = ลำดับการอ่าน · มีลิงก์ "ข้ามไปเนื้อหาหลัก" เป็น element แรก · landmark `header` `nav` `main` |
| คีย์บอร์ด | ทุกการกระทำทำได้ด้วยคีย์บอร์ด รวมการย้ายการ์ด kanban (เมนู "ย้ายไปขั้น…") · ทางลัด `/` ค้นหา · ไม่มีกับดัก focus นอก dialog/drawer · Esc ปิด overlay |
| สีไม่ใช่ช่องทางเดียว | ป้ายมีข้อความ · delta มีลูกศร + เครื่องหมาย · priority มีป้ายข้อความนอกจากสีขอบ · สถานะผ่านเป้ามีคำ "ผ่าน/ต่ำกว่าเป้า" · กราฟมี legend ข้อความ + ตาราง · error มีไอคอน + ข้อความ |
| เป้าสัมผัส | ≥ 44×44px เมื่อ `(pointer: coarse)` · counter ≥ 48px · ระยะห่างระหว่างเป้าอย่างน้อย 8px (CANONICAL ข้อ 15) |
| ข้อความสำหรับผู้อ่านหน้าจอ | ปุ่มไอคอนมี `aria-label` ไทย · ตัวเลข: "+2.1 pp" อ่าน "เพิ่มขึ้น 2.1 จุดเปอร์เซ็นต์" · "−5%" อ่าน "ลดลง 5 เปอร์เซ็นต์" · "–" อ่าน "ไม่มีข้อมูล" · ค่าปิดบัง "081-XXX-5678" มี `aria-label` "เบอร์โทรที่ปิดบัง ลงท้าย 5678" |
| การประกาศเปลี่ยนแปลง | `aria-live="polite"` สำหรับ toast · ผลค้นหา ("พบ 2 รายการ") · การย้ายการ์ด · นับถอยหลังของค่าที่เปิดดู (ประกาศครั้งเดียว) · error ของฟอร์มใช้ `role="alert"` |
| ฟอร์ม | label ผูกกับ input (`for`/`id`) · ช่องบังคับมี `aria-required` · error ผูกด้วย `aria-describedby` · กลุ่ม checkbox/ชิปใช้ `fieldset` + `legend` |
| ตาราง | `<th scope>` · `caption` ซ่อนที่บอกชื่อตาราง · ตารางเลื่อนแนวนอนมี `tabindex="0"` + `aria-label` |
| motion | เคารพ `prefers-reduced-motion` (ข้อ 5.3) · ไม่มีเนื้อหากะพริบ |
| ขยายตัวอักษร | ใช้ `rem` · หน้าจอยังใช้งานได้เมื่อขยาย 200% และที่ความกว้าง 320px (reflow) |
| เวลา | การซ่อนค่าอัตโนมัติ 30 วินาทีเป็นการควบคุมความปลอดภัย (ยกเว้นตาม WCAG 2.2.1) แต่ผู้ใช้เปิดดูใหม่ได้เสมอ · หน้าล็อก counter แจ้งเหตุผลชัด |
| ภาษา | `lang="th"` |

---

## 10. ข้อความภาษาไทยและรูปแบบตัวเลข

### 10.1 วันที่และเวลา (CANONICAL ข้อ 1.2)

| บริบท | รูปแบบ | ตัวอย่าง |
|---|---|---|
| วันที่ | วัน เดือนย่อ พ.ศ. | `11 ก.ย. 2569` |
| วันที่+เวลาในตาราง/รายการ | ไม่มี "น." (CANONICAL ข้อ 19.5) | `11 ก.ย. 2569 10:24` |
| เวลาเดี่ยวในประโยค/การ์ด/รายการ widget | 24 ชม. + "น." (CANONICAL ข้อ 19.5) | `10:24 น.` |
| เวลาในรายการที่มีหัววันแล้ว (คิว · งานวันนี้ · ไทม์ไลน์) | `HH:mm` | `10:05` |
| วันที่ย่อบนการ์ด kanban (ปีเดียวกับ `app.clock()`) | วัน เดือนย่อ | `18 ก.ย.` |
| ช่วงวันที่ | วันแรก – วันสุดท้ายแบบรวม | `13 ส.ค. – 11 ก.ย. 2569` |
| ข้อมูล ณ | "ณ" + วันที่ + เวลา | `ณ 11 ก.ย. 2569 10:24 น.` |

- เดือนย่อ: ม.ค. · ก.พ. · มี.ค. · เม.ย. · พ.ค. · มิ.ย. · ก.ค. · ส.ค. · ก.ย. · ต.ค. · พ.ย. · ธ.ค.
- แปลงเวลาเป็น `Asia/Bangkok` เสมอ · "วันนี้" "N วันล่าสุด" "เกินกำหนด" "เลยเวลา" "ลูกค้าใหม่" คำนวณจาก `app.clock()` ไม่ใช่นาฬิกาเครื่อง (prototype: 11 ก.ย. 2569 10:24 น.)
- **ไม่ใช้เวลาสัมพัทธ์** ("3 นาทีที่แล้ว" ในภาพ mockup B) — ใช้เวลาจริงตามตาราง
- `Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })` ให้รูปแบบ `11 ก.ย. 2569` · เวลาใช้ `{ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`

### 10.2 ตัวเลข (CANONICAL ข้อ 1.3)

| ชนิด | รูปแบบ | ตัวอย่าง |
|---|---|---|
| จำนวน | คั่นหลักพัน · เลขอารบิก | `3,125` |
| เงินในการ์ด/ข้อความ | `฿` ติดตัวเลข | `฿3,332,700` |
| เงินในตาราง | ไม่มี `฿` · หัวคอลัมน์มี "(บาท)" | `1,245,000` |
| เงินที่มีสตางค์ | 2 ตำแหน่งเฉพาะเมื่อไม่ใช่จำนวนเต็ม (CANONICAL ข้อ 1.3 v2.2 · เก็บ `numeric(12,2)`) | `฿28,900.50` · ตาราง `28,900.50` |
| อัตรา/สัดส่วน | 1 ตำแหน่งเสมอ รวมขั้นแรกของ funnel | `24.1%` · `36.0%` · `100.0%` |
| ค่า `NULL` จาก RPC (KPI ไม่ผูกพนักงานใต้ scope TEAM/OWN · อัตรา 0/0) | `–` ไม่ใช่ `0` (ข้อ 7.15) | `–` |
| ส่วนต่างของอัตรา | `pp` 1 ตำแหน่ง มีเครื่องหมาย · คำนวณจากอัตราที่ยังไม่ปัด | `+2.1 pp` · `−0.4 pp` |
| ส่วนต่างของจำนวน | % จำนวนเต็ม มีเครื่องหมาย | `+12%` · `−5%` · `0%` |
| เครื่องหมายลบ | **U+2212 `−`** (ไม่ใช่ขีด `-`) | `−5%` |
| ไม่มีค่า | **U+2013 `–`** | `–` |
| ค่าปิดบัง LINE_USER_ID | **U+2014 `—`** (CANONICAL ข้อ 6.4) | `—` |
| นาที | จำนวนเต็ม + "นาที" | `18 นาที` |
| วิธีปัด | half away from zero · **ห้าม `Math.round` บน float** | ด้านล่าง |

```ts
// src/lib/format.ts — ใช้ร่วม prototype และแอป (BigInt เพื่อหลีกเลี่ยงความคลาดเคลื่อนของ float)
const MINUS = '−', DASH = '–';
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** ปัด half away from zero บนสตริงทศนิยม (PostgREST ส่ง numeric เป็น string) */
export function roundDecimal(value: string, digits: number): string {
  const neg = value.trim().startsWith('-');
  const [i, f = ''] = value.trim().replace(/^[-+]/, '').split('.');
  const keep = BigInt(i + f.padEnd(digits, '0').slice(0, digits));
  const next = Number((f + '0'.repeat(digits + 1))[digits]);      // หลักถัดไปหลักเดียวพอสำหรับ half-away
  const q = next >= 5 ? keep + 1n : keep;
  const s = q.toString().padStart(digits + 1, '0');
  const out = digits ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s;
  return (neg && q !== 0n ? '-' : '') + out;
}
/** อัตรา 1 ตำแหน่งจากตัวตั้ง/ตัวหารจำนวนเต็ม: rate(215, 892) → "24.1%" */
export function fmtRate(num: number | null, den: number | null): string {
  if (num == null || den == null || den === 0) return DASH;
  const t = (2n * BigInt(num) * 1000n + BigInt(den)) / (2n * BigInt(den));   // tenths, ปัดครึ่งขึ้น (ค่าไม่ติดลบ)
  return `${group((t / 10n).toString())}.${t % 10n}%`;
}
/** ส่วนต่าง pp จากอัตราที่ยังไม่ปัด: pp(215,892, 182,826) → "+2.1 pp" */
export function fmtPp(a: number, b: number, c: number, d: number): string {
  if (!b || !d) return DASH;
  const n = (BigInt(a) * BigInt(d) - BigInt(c) * BigInt(b)) * 1000n, den = BigInt(b) * BigInt(d);
  const abs = n < 0n ? -n : n, t = (2n * abs + den) / (2n * den);
  const sign = t === 0n ? '' : n < 0n ? MINUS : '+';
  return `${sign}${t / 10n}.${t % 10n} pp`;
}
/** ส่วนต่างจำนวนเป็น % จำนวนเต็ม: delta(3125, 2790) → "+12%" · ก่อนหน้า 0/null → null (ไม่แสดง chip) */
export function fmtDeltaPct(cur: number, prev: number | null): string | null {
  if (prev == null || prev === 0) return null;
  const n = BigInt(cur - prev) * 100n, d = BigInt(prev), abs = n < 0n ? -n : n;
  const q = (2n * abs + d) / (2n * d);
  return q === 0n ? '0%' : `${n < 0n ? MINUS : '+'}${q}%`;
}
export const fmtInt = (n: number | null) => (n == null ? DASH : group(String(n)));
export const fmtBaht = (v: string | null, inTable = false) =>
  v == null ? DASH : (inTable ? '' : '฿') + (/\.00$/.test(roundDecimal(v, 2)) ? group(roundDecimal(v, 0)) : (() => { const [i, f] = roundDecimal(v, 2).split('.'); return `${group(i)}.${f}`; })());
/** เทียบเป้าด้วยค่าที่ยังไม่ปัด: passTarget(2977, 3121, '>=', 95) → true */
export const passTarget = (num: number, den: number, op: '>=' | '<', pct: number) =>
  op === '>=' ? num * 100 >= pct * den : num * 100 < pct * den;
```

ตรวจกับข้อมูลตัวอย่าง: `fmtRate(215, 892)` = `24.1%` · `fmtPp(215, 892, 182, 826)` = `+2.1 pp` · `fmtDeltaPct(3125, 2790)` = `+12%` · `fmtDeltaPct(4, 4)` = `0%` · `fmtDeltaPct(3, 2)` = `+50%` · `passTarget(2977, 3121, '>=', 95)` = ผ่าน

### 10.3 ชื่อคนและคำนำหน้า

| กรณี | กติกา | ตัวอย่าง |
|---|---|---|
| ลูกค้า | เติม "คุณ" หน้า `display_name` **ที่ UI เท่านั้น** ไม่เก็บในคอลัมน์ชื่อ (CANONICAL ข้อ 3.5) | `คุณสมชาย ใจดี` |
| ข้อความสำเร็จรูปที่เก็บไว้ (`notifications.body`) | มี "คุณ" อยู่แล้ว (CANONICAL ข้อ 3.5 v2.2) → **แสดงตามที่เก็บ ห้ามเติมซ้ำ** | `คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00` |
| ลูกค้านอกขอบเขตในแผงตรวจซ้ำ | "คุณ" + ชื่อ + อักษรแรกของนามสกุล + "." (CANONICAL ข้อ 6.5) | `คุณสมชาย ใ.` |
| ลูกค้า `ANONYMIZED` | **ไม่เติม "คุณ"** แสดง `first_name` ตามที่ระบบตั้ง | `ลูกค้านิรนาม CUS-2026-000297` |
| พนักงาน | ใช้ `core.staff_profiles.display_name` ตามที่เก็บ (มี "คุณ" อยู่แล้ว) **ห้ามเติมซ้ำ** | `คุณขวัญ` · `จ๋าอั๋น` |
| พนักงานคู่รหัส | `{staff_code} {display_name}` | `ST-0045 คุณขวัญ` |
| คำทักทายหน้าแรก | "สวัสดี" + `display_name` — ไม่ใช้คำลงท้าย "ครับ/ค่ะ" ในข้อความระบบ (**ข้อเสนอของผู้ออกแบบ** · mockup ใช้ "สวัสดีครับ") | `สวัสดี คุณขวัญ` |

### 10.4 คำศัพท์ที่ตรึง

| ใช้ | ห้ามใช้ | ที่มา |
|---|---|---|
| "30 วันล่าสุด" (หรือป้าย preset จริง) | "เดือนนี้" กับตัวเลขชุด 30 วัน | ข้อ 12.0 · D27 |
| "Conversion (Lead → ขาย)" · "Conversion (ผู้มาติดต่อ → ขาย)" · "Walk-in Conversion" | "Conversion" หรือ "Conversion Rate" เดี่ยว ๆ | ข้อ 12.2 · D5 |
| "อัตราปิดการขาย" = Sales / (Sales + Lost) | "Close Rate" ที่หารด้วย Opportunity | D4 |
| "ลูกค้าไม่ซ้ำ" (1,284) · "ลูกค้าใหม่" (809) · "ลูกค้าเก่า" (475) | "ลูกค้าใหม่ 1,284" · "ลูกค้าเก่า 892" (mockup A02) | D2 |
| "ผู้มาติดต่อ (Visitor)" | "ลูกค้าเข้าร้าน" กับยอดรวมทุกช่องทาง | ข้อ 12.1 |
| "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว" + "ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ)" | "ยินยอมให้เก็บข้อมูล (PDPA)" | ข้อ 10.2 · D11 |
| "ลูกค้าซื้อซ้ำ" (ซื้อ ≥ 2 ครั้ง) | "ลูกค้าปัจจุบัน" กับคนที่ซื้อ 2 ครั้ง | D19 |
| "งานทั้งหมด 12 · เกินกำหนด 4" | "12 งานวันนี้" | D20 |
| ป้ายไทยของ ENUM ตาม CANONICAL ข้อ 4 · lookup ตาม `label_th` ข้อ 5 | ป้ายที่แต่งเอง | ข้อ 4 · 5 |

### 10.5 น้ำเสียงของข้อความระบบ

- สุภาพ กระชับ บอกสิ่งที่เกิดขึ้นและสิ่งที่ทำต่อได้ เช่น "บันทึกผลการให้บริการแล้ว" · "ต้องระบุลูกค้าก่อนบันทึกว่าซื้อแล้ว"
- error ไม่กล่าวโทษผู้ใช้ และไม่เปิดเผยข้อมูลที่ไม่มีสิทธิ์ (ข้อความเข้าสู่ระบบผิดเหมือนกันทุกกรณี: **"อีเมล/รหัสพนักงาน หรือรหัสผ่านไม่ถูกต้อง"** · CANONICAL ข้อ 9.2)
- push และอีเมลห้ามมีชื่อ เบอร์ หรือข้อมูลลูกค้า — ใช้ป้ายการแจ้งเตือน + เลขอ้างอิง (CANONICAL ข้อ 1.4 · 11.1)

---

## 11. Do / Don't จาก mockup

| # | Don't (ตามภาพ mockup) | Do (ตาม CANONICAL) | อ้างอิง |
|---|---|---|---|
| 1 | ปุ่มพื้นส้มตัวอักษรขาว ("+ รับลูกค้าใหม่" · "บันทึก" · "เข้าสู่ระบบ") | ตัวอักษร `--navy-900` บนส้ม (5.66:1) · สถานะกดใช้เงาใน ไม่ใช้ส้มเข้ม | D10 · T20 T22 T23 |
| 2 | ใช้ส้มเป็นสีส่วนของกราฟ (Funnel · โดนัท) | ใช้ `--chart-1..7` ตามช่องทาง · Funnel ขั้น Opportunity ใช้ `--chart-3` | D10 · ข้อ 2.6 |
| 3 | checkbox เดียว "ยินยอมให้เก็บข้อมูล (PDPA)" (A04) · ฟอร์มมือถือ (B) ไม่มี checkbox เลย | สองช่องแยก: **"แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว"** (บังคับ) + **"ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ)"** ไม่ติ๊กไว้ก่อน + ช่องทาง LINE · SMS · โทรศัพท์ · อีเมล + "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" · **ทั้งฟอร์มเดสก์ท็อปและมือถือ** | D11 · ข้อ 10.2 |
| 4 | แผงตรวจซ้ำแสดงเบอร์เต็มและปุ่ม "ดูข้อมูล" ในทุกการ์ด (A04) | การ์ดลูกค้าที่อ่านได้: เบอร์ปิดบัง + "ดูข้อมูล" + "ใช้ลูกค้าเดิม" · การ์ดลูกค้านอกขอบเขต: ชื่อ + นามสกุลย่อ + เบอร์ปิดบังเฉพาะเมื่อตรงด้วยเบอร์ + "ใช้ลูกค้าเดิม" เท่านั้น · ไม่แสดง lifecycle/สาขา/วันที่ | D32 · ข้อ 6.5 |
| 5 | ตารางลูกค้า Customer 360 และหน้ามือถือแสดงเบอร์/อีเมลเต็ม (A03 A05 A10) | แสดง `value_masked` เป็นค่าเริ่มต้น · ค่าเต็มผ่าน `C-CONTACT` ที่บันทึกทุกครั้งและซ่อนใน 30 วินาที | D33 · ข้อ 6.4 |
| 6 | "จดจำฉันไว้ในระบบ" ติ๊กไว้ก่อน (A01) | ไม่ติ๊กไว้ก่อน · จำเฉพาะอีเมล/รหัสพนักงานในช่องกรอก ไม่ยืดอายุ session · ซ่อนบนอุปกรณ์ counter | D34 · ข้อ 9.2 |
| 7 | การ์ด "ลูกค้าวันนี้ 42 +16%" ณ 10:24 น. (B) | "ลูกค้าไม่ซ้ำวันนี้ 16 (+14%)" ตามข้อมูลตัวอย่าง · ตัวเลขทุกตัวต้องมาจากข้อ 13 | D41 · ข้อ 13.11 |
| 8 | รูปถ่ายลูกค้าในหัว Customer 360 และรายการ (A05 A10 B) | avatar ตัวอักษรย่อ (`C-AVATAR`) · ไม่มีช่องอัปโหลดรูป | D42 · ข้อ 3.5 |
| 9 | ป้ายการ์ด "เดือนนี้ (ก.ย. 2569)" กับตัวเลข 30 วัน (A02 A09 B) | ป้าย "30 วันล่าสุด" + ช่วงวันที่ | D27 |
| 10 | การ์ด "Conversion Rate 24.1% +3.2%" (B) | "Conversion (Lead → ขาย) 24.1%" + chip "+2.1 pp" | D5 · D6 |
| 11 | กลางโดนัทแหล่งที่มา "3,125" (A02) · ส่วน "เว็บไซต์ 0%" ในโดนัท | กลางวง 1,284 "ลูกค้าไม่ซ้ำ" · ไม่แสดงส่วนที่เป็น 0 | D3 · ข้อ 13.3 |
| 12 | กลุ่มเมนู "การตลาด" ใน sidebar (A) · ปุ่ม "นำเข้า" หน้า 03 | ซ่อนใน V1 | D35 · D38 |
| 13 | กราฟแนวโน้มรายวันและ Top Product | ไม่อยู่ใน prototype Phase 0 | D44 |
| 14 | เวลาสัมพัทธ์ "3 นาทีที่แล้ว" ในกิจกรรมล่าสุด (B) | เวลาจริง `10:24 น.` | ข้อ 1.2 |
| 15 | TikTok ใช้สีเกือบเท่า Walk-in (`#101828` · CANONICAL v2.1) | `--chart-5` `#7C3AED` + เส้นคั่น · legend ข้อความ · ปุ่ม "ดูเป็นตาราง" | D49 · ข้อ 2.6 |
| 16 | ลากการ์ด Pipeline ย้อนกลับเป็น "สนใจ" หรือข้ามการส่งใบเสนอราคา | ลากได้ตามตารางข้อ 7.17 เท่านั้น · ทิศที่ไม่อนุญาตแสดง toast เหตุผล | D48 · ข้อ 4.4 · 14.9 |
| 17 | ข้อความ "รู้จักร้านจาก Facebook" ในแอปจริง | แอปจริงใช้ `ref.sources.label_th` ("รู้จักร้านจากเพจ Facebook") · prototype แสดงข้อความข้อ 13.7 ตรงตัว | D50 · ข้อ 6.8 |
| 18 | ปุ่มส้มหลายปุ่มในหัวหน้าเดียว (A03 "นำเข้า" + "เพิ่มลูกค้า") · ปุ่มส้มสำหรับอนุมัติ/ส่งออก | ส้ม 1 ปุ่มต่อพื้นที่ตัดสินใจ (+ รับลูกค้า) · อนุมัติ = navy · ส่งออก = รอง/navy | ข้อ 15 · ข้อ 7.1 |

---

## 12. หมายเหตุผู้เขียนและรายการรอยืนยัน

| # | หัวข้อ | สิ่งที่เอกสารนี้ตัดสิน | สถานะ |
|---|---|---|---|
| N1 | `--chart-1` (Walk-in) กับ `--chart-5` (TikTok) แยกกันไม่ได้ | CANONICAL v2.2 เปลี่ยน `--chart-5` เป็น `#7C3AED` (D49) · ความต่างความสว่างยัง 2.88:1 (A07) จึงคงกติกาข้อ 2.6 | **ปิดแล้ว (D49)** |
| N2 | CANONICAL กำหนดสีเฉพาะ lifecycle · ป้ายเสริม · priority | สีของสถานะอื่นในข้อ 2.5 ข เป็นข้อเสนอของผู้ออกแบบ (ป้ายไทยมาจากข้อ 4.8 แล้ว) | ใช้ได้ทันที · ยืนยันก่อน production |
| N3 | ขอบเขตของ "CTA หลักเท่านั้น" | CANONICAL ข้อ 15 v2.2 ตรึง: 1 ปุ่มต่อพื้นที่ตัดสินใจ (+ รับลูกค้า) · ไม่ใช้กับลบ อนุมัติ ส่งออก ตัวกรอง นำทาง (ข้อ 7.1) | **ปิดแล้ว (ข้อ 15)** |
| N4 | placeholder ของ JLAS ใช้ `--gray-500` ไม่ผ่าน 4.5:1 | CANONICAL ข้อ 15 v2.2 ตรึง `--gray-600` สำหรับ CRM | ปิดแล้วสำหรับ CRM · แจ้งทีม JLAS |
| N5 | เวลาซ่อนค่าที่เปิดดู 30 วินาที | ตาม CANONICAL ข้อ 6.4 ที่ติด [รอยืนยัน] | รอยืนยัน |
| N6 | รูปแบบลิงก์ "เปิด LINE" | ไม่กำหนด · prototype แสดง toast | รอยืนยัน |
| N7 | ขนาดหน้าเริ่มต้นของตาราง · การแสดงสตางค์ | 20 แถว (ข้อเสนอของผู้ออกแบบ) · สตางค์แสดงเมื่อไม่ใช่จำนวนเต็ม (**ปิดแล้ว · CANONICAL ข้อ 1.3 v2.2**) | ข้อเสนอของผู้ออกแบบ (ขนาดหน้า) |
| N8 | คำทักทาย "สวัสดีครับ" ใน mockup | "สวัสดี {display_name}" ไม่มีคำลงท้าย | ข้อเสนอของผู้ออกแบบ |
| N9 | ป้ายไทยของ `audit.export_status` `crm.dsr_status` `crm.duplicate_status` `crm.consent_status` | CANONICAL ข้อ 4.8 v2.2 มีป้ายครบ (ข้อ 2.5 ข) · เหลือป้ายสถานะ `MANUAL` ของหน้า 18 "ใช้งานอยู่" | ปิดแล้ว · ป้าย MANUAL รอยืนยัน |
| N10 | ป้ายค่าที่เปิดดูชั่วคราว | กรอบ `--reveal-border` (G27) พื้น `--reveal-bg` (T53) + ข้อความ "แสดงอยู่ · ซ่อนใน 30 วินาที" | ข้อเสนอของผู้ออกแบบ |
| N11 | ข้อความเมื่อเปิดดูข้อมูลติดต่อ/ค้นหาเกินเกณฑ์ | CANONICAL กำหนดพฤติกรรม (ปฏิเสธ + แจ้ง) แต่ไม่กำหนดข้อความ → ข้อความในข้อ 7.8 · 7.9 | ข้อเสนอของผู้ออกแบบ |
| N12 | interaction ของ visit `CANCELLED` ในไทม์ไลน์ | ไม่แสดง (สอดคล้องกับตัวนับข้อ 3.3 ข้อ 5 และนิยามกิจกรรมข้อ 3.1 v2.2) | ข้อเสนอของผู้ออกแบบ |

---

## ภาคผนวก A · สคริปต์คำนวณ contrast

สคริปต์เต็มที่สร้างตารางข้อ 2.7 (รันด้วย Node ≥ 18 · ผลลัพธ์เป็น markdown ที่วางในข้อ 2.7 ได้ตรง ๆ) — แนะนำให้วางเป็น `tools/check-contrast.mjs` เพื่อให้ CI รันซ้ำเมื่อ token เปลี่ยน · แถวที่ไม่ผ่านต้องมีข้อความข้อยกเว้นกำกับ มิฉะนั้นนับเป็นความผิดพลาด

```js
// node check-contrast.mjs — WCAG 2.x (L1 + 0.05) / (L2 + 0.05) · ตัดทศนิยมลง 2 ตำแหน่ง (ไม่ปัดขึ้นให้ผ่าน)
const T = {
  'gray-50':'#FBFBFB','gray-100':'#F4F3F2','gray-200':'#EAE8E7','gray-300':'#D6D3D1','gray-500':'#8A8683',
  'gray-600':'#6E6A68','gray-700':'#4E4B4A','gray-900':'#101828',
  'navy-50':'#F2F5FA','navy-100':'#E1E8F3','navy-200':'#C3D0E6','navy-400':'#5E7AAE','navy-700':'#21417E',
  'navy-800':'#16305E','navy-900':'#0B1E41',
  'orange-50':'#FFF6ED','orange-300':'#FBB06B','orange-400':'#FA8C36','orange-500':'#F86E0B','orange-600':'#DC5A08',
  'success-bg':'#ECFDF3','success-text':'#05603A','success-solid':'#067647',
  'warning-bg':'#FFFAEB','warning-text':'#B54708','warning-solid':'#DC6803',
  'danger-bg':'#FEF3F2','danger-text':'#B42318','danger-solid':'#D92D20',
  'chart-1':'#0B1E41','chart-2':'#2F6FD6','chart-3':'#C2410C','chart-4':'#B42359',
  'chart-5':'#7C3AED','chart-6':'#5B6B8C','chart-7':'#15803D',
};
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = h => { const n = h.slice(1);
  return 0.2126 * lin(parseInt(n.slice(0, 2), 16)) + 0.7152 * lin(parseInt(n.slice(2, 4), 16)) + 0.0722 * lin(parseInt(n.slice(4, 6), 16)); };
const ratio = (a, b) => { const [x, y] = [lum(T[a]), lum(T[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const f2 = r => (Math.floor(r * 100) / 100).toFixed(2);
let fails = 0;
const table = (title, min, rows, informational = false) => {
  console.log(`\n#### ${title}\n`);
  console.log('| id | ใช้ที่ | ตัวหน้า | พื้น | ratio | เกณฑ์ | ผล |'); console.log('|---|---|---|---|---:|---:|---|');
  for (const [id, use, fg, bg, flag] of rows) {
    const r = ratio(fg, bg), ok = r >= min;
    if (!ok && !flag && !informational) fails++;
    console.log(`| ${id} | ${use} | \`--${fg}\` ${T[fg]} | \`--${bg}\` ${T[bg]} | ${f2(r)}:1 | ${min}:1 | ${ok ? 'ผ่าน' : '**ไม่ผ่าน**'}${flag ? ' — ' + flag : ''} |`);
  }
};
table('ก. ตัวอักษร', 4.5, [
  ['T01','เนื้อความหลัก · ค่าในตาราง','gray-900','gray-50'],
  ['T02','เนื้อความบนพื้นรอง (หัวตาราง · แถว hover · คอลัมน์ kanban)','gray-900','gray-100'],
  ['T03','เนื้อความบน `--light-gray`','gray-900','gray-200'],
  ['T04','หัวข้อหน้า · ค่า KPI','navy-900','gray-50'],
  ['T05','หัวข้อบนพื้นรอง','navy-900','gray-100'],
  ['T06','ลิงก์ · ปุ่มรอง · ข้อความ info','navy-700','gray-50'],
  ['T07','ลิงก์บนพื้นรอง','navy-700','gray-100'],
  ['T08','ป้าย info (ลูกค้าใหม่ · สนใจซื้อ · ปกติ)','navy-700','navy-50'],
  ['T09','ข้อความรอง · แท็บที่ไม่เลือก · **placeholder (CANONICAL ข้อ 15)**','gray-600','gray-50'],
  ['T10','ข้อความรอง/placeholder บนพื้นรอง','gray-600','gray-100'],
  ['T11','ข้อความรองบน `--light-gray`','gray-600','gray-200','ห้ามใช้ ให้ใช้ T12'],
  ['T12','ข้อความรองบน `--light-gray`','gray-700','gray-200'],
  ['T13','หัวคอลัมน์ตาราง · ป้าย neutral','gray-700','gray-100'],
  ['T14','ป้ายแกน/ป้ายกำกับกราฟ','gray-700','gray-50'],
  ['T15','gray-500 เป็นตัวอักษร/placeholder','gray-500','gray-50','ห้ามใช้เป็นตัวอักษรหรือ placeholder (เส้นขอบเท่านั้น)'],
  ['T16','ตัวอักษรใน sidebar · ป้าย VIP','gray-50','navy-900'],
  ['T17','หัวกลุ่มเมนูใน sidebar','navy-200','navy-900'],
  ['T18','เมนูที่เลือกอยู่ · ปุ่มพื้น support-blue','gray-50','navy-700'],
  ['T19','เมนู hover · ปุ่ม navy hover','gray-50','navy-800'],
  ['T20','**ปุ่มส้ม (CTA)**','navy-900','orange-500'],
  ['T21','ปุ่มส้ม hover','navy-900','orange-400'],
  ['T22','ปุ่มส้มเข้ม orange-600','navy-900','orange-600','ห้ามใช้เป็นสถานะกด ใช้ orange-500 + เงาใน'],
  ['T23','ตัวอักษรขาวบนส้ม (แบบ mockup)','gray-50','orange-500','ห้าม (D10)'],
  ['T24','ปุ่ม navy · ชิปที่เลือก','gray-50','navy-900'],
  ['T25','ป้าย success (ลูกค้าซื้อซ้ำ · ลูกค้าปัจจุบัน · ผ่าน)','success-text','success-bg'],
  ['T26','ตัวเลขเปลี่ยนแปลงขึ้น (ไม่มีพื้น)','success-text','gray-50'],
  ['T27','ป้าย warning (มีโอกาสซื้อ · ติดตามอยู่ · สูง · เลยเวลา)','warning-text','warning-bg'],
  ['T28','ข้อความ warning บนพื้นหน้า','warning-text','gray-50'],
  ['T29','ป้าย danger (ไม่สำเร็จ · ยังไม่ได้ติดต่อ · ด่วน · เกินกำหนด)','danger-text','danger-bg'],
  ['T30','ข้อความ error · ตัวเลขเปลี่ยนแปลงลง','danger-text','gray-50'],
  ['T31','ชิปเปลี่ยนแปลงในเซลล์ตารางพื้นรอง (ขึ้น)','success-text','gray-100'],
  ['T32','ชิปเปลี่ยนแปลงในเซลล์ตารางพื้นรอง (ลง)','danger-text','gray-100'],
  ['T33','ข้อความ warning บนพื้นรอง','warning-text','gray-100'],
  ['T34','ตัวอักษรบน success ทึบ','gray-50','success-solid'],
  ['T35','ตัวอักษรบน warning ทึบ','navy-900','warning-solid'],
  ['T36','ตัวอักษรขาวบน warning ทึบ','gray-50','warning-solid','ห้าม'],
  ['T37','ปุ่ม danger · จำนวนแจ้งเตือนบนกระดิ่ง','gray-50','danger-solid'],
  ['T38','ปุ่ม danger hover','gray-50','danger-text'],
  ['T39','ป้าย neutral ทึบ (+N)','gray-50','gray-600'],
  ['T40','tooltip','gray-50','gray-900'],
  ['T41','แถวที่เลือกในตาราง','gray-900','navy-100'],
  ['T42','ข้อความรองบนพื้น info','gray-600','navy-50'],
  ['T43','ข้อความรองบนพื้น warning (แถบคำเตือน PII)','gray-600','warning-bg'],
  ['T44','ข้อความรองบนพื้น danger','gray-600','danger-bg'],
  ['T45','ข้อความบนแถบเน้นส้มอ่อน','navy-900','orange-50'],
  ['T46','ป้ายกำกับในแท่ง/ส่วนกราฟ chart-1','gray-50','chart-1'],
  ['T47','ป้ายกำกับในแท่ง chart-2','gray-50','chart-2'],
  ['T48','ป้ายกำกับในแท่ง chart-3','gray-50','chart-3'],
  ['T49','ป้ายกำกับในแท่ง chart-4','gray-50','chart-4'],
  ['T50','ป้ายกำกับในแท่ง chart-5 (TikTok · D49)','gray-50','chart-5'],
  ['T51','ป้ายกำกับในแท่ง chart-6','gray-50','chart-6'],
  ['T52','ป้ายกำกับในแท่ง chart-7','gray-50','chart-7'],
  ['T53','ค่าที่เปิดดูชั่วคราวบนพื้นส้มอ่อน','gray-900','orange-50'],
  ['T54','ตัวอักษรขาวบน gray-500 (เช่นพื้น `--neutral-solid` ของ prototype)','gray-50','gray-500','ห้าม · ใช้ T39'],
]);
table('ข. องค์ประกอบกราฟิกและขอบของ control', 3, [
  ['G01','Walk-in · Funnel Visitor','chart-1','gray-50'],
  ['G02','LINE · Funnel Lead · ลูกค้าใหม่','chart-2','gray-50'],
  ['G03','Facebook · Funnel Opportunity','chart-3','gray-50'],
  ['G04','Instagram','chart-4','gray-50'],
  ['G05','TikTok (D49)','chart-5','gray-50'],
  ['G06','โทรศัพท์ · Funnel Sale','chart-6','gray-50'],
  ['G07','เว็บไซต์ · ลูกค้าเก่า','chart-7','gray-50'],
  ['G08','แท่งเหตุผลที่ไม่สำเร็จ (`--support-blue`)','navy-700','gray-50'],
  ['G09','ขอบ input · checkbox · stepper','gray-500','gray-50'],
  ['G10','ขอบ input บนพื้นรอง','gray-500','gray-100'],
  ['G11','ขอบซ้ายการ์ด priority LOW','gray-500','gray-50'],
  ['G12','ขอบซ้ายการ์ด priority NORMAL · จุดยังไม่อ่าน','navy-700','gray-50'],
  ['G13','ขอบซ้ายการ์ด priority HIGH · ขอบคิวรอนาน','warning-solid','gray-50'],
  ['G14','ขอบซ้ายการ์ด priority URGENT · วงจำนวนแจ้งเตือน','danger-solid','gray-50'],
  ['G15','จุดสถานะ success','success-solid','gray-50'],
  ['G16','แถบความคืบหน้า KPI คุณภาพ (fill เทียบ track)','navy-700','gray-200'],
  ['G17','เส้นเป้าหมายบนแถบ','gray-900','gray-200'],
  ['G18','focus ring บนพื้นสว่าง','navy-700','gray-50'],
  ['G19','focus ring บนพื้น navy','orange-300','navy-900'],
  ['G20','แถบบอกเมนูที่เลือก (sidebar)','orange-500','navy-900'],
  ['G21','เส้นใต้แท็บที่เลือก · ตัวบอกช่อง bottom nav','navy-900','gray-50'],
  ['G22','ไอคอนบนปุ่มส้ม/FAB','navy-900','orange-500'],
  ['G23','ขอบปุ่มส้ม/FAB เทียบพื้นหน้า','orange-500','gray-50','ไม่ใช่ข้อมูลที่ต้องแยก · ปุ่มระบุด้วยตัวอักษร T20 + เงา `--shadow-3`'],
  ['G24','ขอบ drop zone ของ kanban','navy-400','gray-100'],
  ['G25','เส้นขอบการ์ด/เส้นแบ่ง (ตกแต่ง)','gray-200','gray-50','ตกแต่งเท่านั้น ห้ามใช้สื่อสถานะ'],
  ['G26','ขอบ drop zone บนพื้นหน้า','navy-400','gray-50'],
  ['G27','ขอบกรอบค่าที่เปิดดูชั่วคราว (orange-600)','orange-600','gray-50'],
  ['G28','ขอบซ้ายการ์ดไม่มี priority (`--priority-unknown`)','gray-300','gray-50','ตกแต่งเท่านั้น (ข้อ 19.5) · ไม่สื่อความหมาย จึงไม่มีป้าย priority'],
]);
table('ค. สีกราฟที่อยู่ติดกัน (ข้อมูลประกอบ · ไม่ใช่เกณฑ์ของ CANONICAL ข้อ 15)', 3, [
  ['A01','โดนัท WALK_IN ↔ LINE','chart-1','chart-2'],
  ['A02','โดนัท LINE ↔ FACEBOOK','chart-2','chart-3'],
  ['A03','โดนัท FACEBOOK ↔ INSTAGRAM','chart-3','chart-4'],
  ['A04','โดนัท INSTAGRAM ↔ TIKTOK','chart-4','chart-5'],
  ['A05','โดนัท TIKTOK ↔ PHONE','chart-5','chart-6'],
  ['A06','โดนัท PHONE ↔ WALK_IN (วนรอบ · WEBSITE = 0)','chart-6','chart-1'],
  ['A07','สัญลักษณ์ legend WALK_IN เทียบ TIKTOK (D49)','chart-1','chart-5'],
  ['A08','โดนัทลูกค้าใหม่ ↔ ลูกค้าเก่า','chart-2','chart-7'],
  ['A09','Funnel Visitor ↔ Lead','chart-1','chart-2'],
  ['A10','Funnel Lead ↔ Opportunity','chart-2','chart-3'],
  ['A11','Funnel Opportunity ↔ Sale','chart-3','chart-6'],
  ['A12','โดนัท PHONE ↔ WEBSITE (เมื่อ WEBSITE > 0)','chart-6','chart-7'],
  ['A13','โดนัท WEBSITE ↔ WALK_IN (วนรอบ เมื่อ WEBSITE > 0)','chart-7','chart-1'],
], true);
console.log(`\nจำนวนคู่ที่ไม่ผ่านโดยไม่มีข้อยกเว้นกำกับ (ตาราง ก–ข): ${fails}`);
```

ผลรัน 16 ก.ย. 2569 (ค่าชุด v2.2): ตาราง ก 54 แถว · ข 28 แถว · ค 13 แถว · บรรทัดท้าย "จำนวนคู่ที่ไม่ผ่านโดยไม่มีข้อยกเว้นกำกับ (ตาราง ก–ข): 0" · ค่าหลัก T20 = 5.66:1 · T23 = 2.80:1 · G05/T50 (`--chart-5`) = 5.50:1 · T09 (placeholder) = 5.17:1

---

## ภาคผนวก B · จับคู่กับ prototype/assets/app.css

ตรวจกับไฟล์จริงเมื่อ 16 ก.ย. 2569 (ไฟล์กำลังปรับเป็น v2.2 โดยเจ้าของ prototype) · **กติกา:** ใน `<style>` ของหน้า prototype ใช้ชื่อคอลัมน์ "prototype" เมื่อ app.css ยังไม่มีชื่อของเอกสารนี้ · ถ้ามีทั้งสองชื่อให้ใช้ชื่อของเอกสารนี้ · ห้ามพิมพ์ hex

### B.1 ชื่อที่ต่างกัน

| กลุ่ม | เอกสารนี้ (JLAS · แอปจริง) | prototype `app.css` |
|---|---|---|
| น้ำหนักตัวอักษร | `--font-weight-light/regular/medium/semibold/bold` | `--fw-light/regular/medium/semibold/bold` |
| ขนาดตัวอักษร | `--font-size-display/h1/h2/h3/h4/body/body-sm/caption/kpi/kpi-sm` | `--fs-display/h1/h2/h3/h4/body/sm/xs/kpi` (ไม่มี body-lg · num · kpi-sm) |
| line-height | `--line-height-{ขนาด}` · `--line-height-control` | `--lh-tight` · `--lh-heading` · `--lh-body` |
| พื้นรอง | `--surface-subtle` | `--surface-subtle` และ `--surface-raised` (ค่าเดียวกัน `--gray-100`) |
| ตัวอักษรบนพื้นทึบ | `--success-on-solid` `--danger-on-solid` `--info-on-solid` `--neutral-on-solid` | `--on-solid` (ขาว) · `--on-warning-solid` (navy) |
| focus | `--focus-ring-color` · `--focus-ring-color-on-dark` | `--focus-ring` · `--focus-ring-on-dark` |
| กราฟ | `--chart-lost` · `--chart-axis-label` · `--chart-separator` · `--chart-track` | `--chart-lost` (+ ชื่อเดิม `--chart-bar`) · `--chart-label` · `--chart-separator` · `--chart-track` · `--chart-grid` |
| control/สัมผัส | `--control-h-md` · `--control-min-touch` (44) · `--control-min-touch-counter` (48) | `--control-h` · `--touch-min` · `--touch-counter` |
| layout | `--header-h` · `--layout-max` (`--drawer-w` `--drawer-w-wide` `--dialog-w-sm` `--dialog-w-md` `--kanban-col-w` ชื่อเดียวกันทั้งสองชุด) | `--topbar-h` · `--page-max` |
| ไม่มีใน prototype | `--space-0` `--space-20` · `--chart-dim-opacity` · `--text-link-hover` · `--delta-up/down/flat-*` · `--success-on-solid` ฯลฯ | ใช้ค่าตรงของข้อ 6 ผ่านคลาสที่มี (`.delta--up/down/flat` · `.chart` ) หรือขอเพิ่ม token กับผู้ดูแล app.css · ห้ามพิมพ์ hex |
| z-index | `--z-dropdown` · `--z-modal-scrim` `--z-modal` | `--z-popover` · `--z-sheet` · `--z-dialog` |
| motion | `--duration-fast/base/slow` · `--ease-standard/out/in` | `--dur-fast/base` · `--ease` |
| เงา | `--shadow-1..4` · `--shadow-inset-press` | ชื่อเดียวกัน (ตรวจค่าตามข้อ 6) |

### B.2 ค่าที่ต้องตรงตาม CANONICAL v2.2 (รายการตรวจของผู้ดูแล app.css และ `tools/check-prototype.mjs`)

| # | ค่า | ที่มา |
|---|---|---|
| 1 | `--chart-5: #7C3AED` · `--channel-TIKTOK: var(--chart-5)` | ข้อ 15 · D49 |
| 2 | `--chart-separator` = `#FBFBFB` 2px ระหว่างส่วนโดนัท/funnel/แท่ง · legend ข้อความ "ชื่อ · จำนวน · %" ตาม `sort_order` · ปุ่ม "ดูเป็นตาราง" ในกราฟทุกตัว (`JCRM.chart.*`) | ข้อ 15 |
| 3 | `::placeholder` ใช้ `--text-placeholder` = `--gray-600` (ห้าม `--gray-500`) | ข้อ 15 (T09 · T15) |
| 4 | `--priority-unknown` = `--gray-300` เป็นสีขอบเริ่มต้นของ `.kanban-card`/`.task-item` ที่ไม่มี `data-priority` · ห้ามใช้สี NORMAL แทน | ข้อ 19.5 (G28) |
| 5 | ตัวอักษรบนพื้น `--neutral-solid` ต้อง ≥ 4.5:1 → พื้นป้ายทึบที่มีตัวอักษรขาวใช้ `--gray-600` (T39) ไม่ใช่ `--gray-500` (T54) | ข้อ 15 |
| 6 | `.btn--accent` = ส้ม + ตัวอักษร `--navy-900` · `.btn--primary` = navy · ห้ามตัวอักษรขาวบนส้ม | ข้อ 15 · D10 (T20 · T23) |
| 7 | ตัวเลือกช่วงเวลาอยู่ใน page header ของหน้า 02 09 12 เท่านั้น (ไม่อยู่บน top bar ของหน้าอื่น) · ช่องค้นหากลางไม่แสดงสำหรับ MARKETING/SYSTEM_ADMIN | ข้อ 14.3 |
| 8 | Logout ไม่ลบ `device_id` และค่าที่จดจำ `login_id` | ข้อ 9.2 |

### B.3 ค่าที่ต่างจาก JLAS แต่ไม่ขัด CANONICAL โดยตรง

สเกลตัวอักษรของ prototype (`--fs-h1` 1.75rem · `--fs-body` 0.9375rem · `--fs-kpi` 1.875rem) เล็กกว่าข้อ 3.3 (h1 2rem · body 1rem · kpi 2rem ตาม JLAS) · ข้อ 15 ให้ใช้ token ร่วมกับ JLAS → แอปจริงใช้ข้อ 3.3 · prototype ใช้ค่าปัจจุบันได้ (ภาพเล็กลงเล็กน้อย ไม่กระทบ contrast หรือเป้าสัมผัส) จนกว่าผู้ดูแล app.css จะปรับหรือบันทึกเหตุผล **[CRM]**
