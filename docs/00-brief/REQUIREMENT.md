# REQUIREMENT — JAUN CRM / Customer 360 (ต้นฉบับจากเจ้าของโครงการ)

> ไฟล์นี้เก็บบรีฟตามที่เจ้าของโครงการส่งมา **คำต่อคำ** เพื่อใช้ตรวจย้อนความครบถ้วน
> ห้ามแก้เนื้อหาในไฟล์นี้ ถ้าต้องการตีความหรือตัดสินค่า ให้ทำใน `CANONICAL.md` และ `docs/01-requirement/requirement-review.md`
>
> ได้รับเมื่อ: 15 ก.ย. 2569
> ภาพ mockup ที่แนบมา 2 ภาพ อยู่ในโฟลเดอร์ `UX:UI/` (ใน Finder แสดงเป็น `UX/UI`)
> - `UX:UI/875a3a6b-57a4-41bf-9b53-fb4bd7bad3e4.png` — **Mockup A** "ตัวอย่างหน้าจอระบบ JAUN CRM" 10 หน้าจอ (01 หน้าเข้าสู่ระบบ … 10 หน้าจอมือถือ)
> - `UX:UI/02739c58-3fd3-4e66-a0f9-82ea2b40cba7.png` — **Mockup B** ภาพ hero คอมพิวเตอร์ + แท็บเล็ต (Customer 360) + มือถือ (รับลูกค้าใหม่)
>
> ต้นฉบับมี 2 ส่วน
> - **ส่วน A** โครงสร้างทั้งระบบ 45 หัวข้อ (แนวคิดและเหตุผล)
> - **ส่วน B** สรุป Requirement สำหรับทีม Dev 27 หัวข้อ (ฉบับที่ใช้เป็น Business Direction หลัก)

---

# ส่วน A — โครงสร้างทั้งระบบ

ครับ ถ้าต้องการ "โครงสร้างทั้งระบบ" ผมแนะนำให้เรามองระบบนี้เป็นระบบกลางขององค์กร ไม่ใช่แค่หน้าเก็บชื่อลูกค้า โดยผมจะวางให้ตั้งแต่ ลูกค้าเข้ามา → เก็บข้อมูล → ติดตาม → ปิดการขาย → ซื้อซ้ำ → วิเคราะห์ระดับผู้บริหาร พร้อมโครง Database, Workflow, Permission, UI/UX, Security และแผนพัฒนา

ผมขอตั้งชื่อโครงงานชั่วคราวว่า JAUN Customer 360 / CRM ครับ

## A1. ภาพรวมสถาปัตยกรรมทั้งระบบ

```
┌──────────────────────────────────────────────────────────┐
│                   CUSTOMER CHANNELS                      │
│                                                          │
│ Walk-in │ LINE │ Facebook │ IG │ TikTok │ Phone │ Web   │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                CUSTOMER CAPTURE LAYER                    │
│                                                          │
│ Visitor │ Quick Capture │ Search │ Duplicate Detection   │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                     CRM CORE                             │
│                                                          │
│ Customer 360 │ Interaction │ Lead │ Opportunity │ Tags   │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                 SALES & FOLLOW-UP                        │
│                                                          │
│ Quote │ Follow-up │ Task │ Won │ Lost │ Transaction     │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│             CUSTOMER LIFECYCLE / RETENTION               │
│                                                          │
│ Repeat │ Segment │ Campaign │ Loyalty │ Win-back         │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│                 DATA & ANALYTICS                         │
│                                                          │
│ Branch │ Staff │ Channel │ Funnel │ Sales │ Conversion   │
└──────────────────────────┬───────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│               EXECUTIVE MANAGEMENT                       │
│                                                          │
│ CEO Dashboard │ Manager Dashboard │ Reports │ Alerts     │
└──────────────────────────────────────────────────────────┘

ทุกชั้นครอบด้วย
AUTHENTICATION │ PERMISSION │ RLS │ AUDIT │ PDPA │ BACKUP
```

หัวใจคือ ทุก Contact Point ต้องมีข้อมูลในระบบ แม้ลูกค้าจะยังไม่ซื้อก็ตาม

## A2. ต้องนิยาม "ลูกค้า" ให้ชัดก่อน

นี่เป็นส่วนสำคัญมาก เพราะปัญหาปัจจุบันคือเวลาถามว่า

"เดือนนี้เรามีลูกค้ากี่คน?"

แต่คำว่า "ลูกค้า" ยังไม่มี Definition กลาง

ผมจะแยกเป็นดังนี้

| ระดับ | ความหมาย |
|---|---|
| Visitor | คนเข้าร้าน/ติดต่อเข้ามา แต่ยังไม่ทราบตัวตน |
| Identified Customer | รู้ว่าเป็นใครแล้ว เช่น มีชื่อ/เบอร์/LINE |
| Lead | มีความสนใจสินค้า/บริการ |
| Opportunity | มีโอกาสเกิดการซื้อจริง |
| Customer | เกิด Transaction แล้ว |
| Repeat Customer | เคยซื้อและกลับมาใช้บริการอีก |
| Lost | เคยมีโอกาสซื้อแต่ไม่สำเร็จ |

ตัวอย่างเช่น วันที่หนึ่งมีคนเดินเข้าร้าน 80 คน

```
Visitor                  80
↓
ระบุตัวตนได้             61
↓
Lead                      45
↓
Opportunity               24
↓
Sale                      11
```

ดังนั้นเราจะไม่พูดว่า "วันนี้มีลูกค้า 11 คน"

แต่พูดได้ว่า

วันนี้มี Traffic 80 คน
มี Lead 45 คน
มี Opportunity 24 คน
ปิดการขาย 11 คน

ข้อมูลแบบนี้ถึงจะนำไปบริหารร้านได้จริง

## A3. Module ทั้งระบบ

| Module | หน้าที่ |
|---|---|
| Executive Dashboard | ภาพรวมทุกกิจการ/สาขา |
| Branch Dashboard | ภาพรวมเฉพาะสาขา |
| Customer Master | ฐานข้อมูลลูกค้ากลาง |
| Customer 360 | ประวัติลูกค้าครบทุกมิติ |
| Visitor Management | นับลูกค้าเข้าร้าน |
| Interaction | บันทึกทุกการติดต่อ |
| Leads | จัดการลูกค้าเป้าหมาย |
| Opportunities | จัดการโอกาสขาย |
| Sales Pipeline | ติดตามขั้นตอนการขาย |
| Follow-up | นัดติดตามลูกค้า |
| Tasks | งานของพนักงาน |
| Quotation | บันทึกข้อเสนอ/ราคา |
| Transactions | ประวัติธุรกรรม |
| Campaign | แคมเปญการตลาด |
| Customer Segment | แบ่งกลุ่มลูกค้า |
| Channel Management | Online / Offline Source |
| Reports | รายงาน |
| Data Quality | ตรวจข้อมูลผิด/ซ้ำ/ไม่ครบ |
| Consent / PDPA | บริหาร Consent |
| Audit Log | ประวัติการใช้งาน |
| User & Permission | ผู้ใช้และสิทธิ์ |
| Master Data | ค่ากลางของระบบ |
| System Settings | การตั้งค่าระบบ |

## A4. Workflow ลูกค้าเข้าหน้าร้าน

ส่วนนี้ผมอยากออกแบบให้ ง่ายที่สุดสำหรับพนักงาน

เพราะถ้ากรอกยาก สุดท้ายข้อมูลจะไม่ถูกเก็บ

```
ลูกค้าเข้าร้าน
      ↓
กด "รับลูกค้า"
      ↓
สร้าง Visitor Session
      ↓
ลูกค้าเคยมาแล้วหรือไม่?
      ↓
 ┌───────────────┐
 │ ค้นหาเบอร์/ชื่อ │
 └───────┬───────┘
         ↓
พบลูกค้าเดิม? ─────────→ เปิด Customer 360
         │
         No
         ↓
สร้าง Customer
         ↓
เลือกความต้องการ
         ↓
ซื้อ / ขาย / เทิร์น / ซ่อม / ผ่อน / สอบถาม
         ↓
มีโอกาสซื้อ?
         ↓
สร้าง Lead
         ↓
สร้าง Opportunity
         ↓
เสนอราคา
         ↓
┌─────────────────────────┐
│ ซื้อ │ นัดติดตาม │ ไม่ซื้อ │
└─────────────────────────┘
       ↓
บันทึก Outcome
       ↓
จบ Interaction
```

สิ่งสำคัญคือ แม้ไม่รู้ชื่อ ไม่รู้เบอร์ ระบบก็ยังต้องนับเป็น Visitor ได้

ไม่อย่างนั้นตัวเลข Traffic จะผิดตั้งแต่ต้น

## A5. Workflow ลูกค้าออนไลน์

```
LINE / Facebook / IG / TikTok
            ↓
       ข้อความเข้ามา
            ↓
ค้นหา Customer เดิม
            ↓
       ┌──────────┐
       │ พบ / ไม่พบ │
       └────┬─────┘
            ↓
สร้าง Interaction
            ↓
Admin / Sales รับผิดชอบ
            ↓
Lead
            ↓
Opportunity
            ↓
Follow-up
            ↓
นัดเข้าร้าน / ซื้อออนไลน์
            ↓
Transaction
```

เป้าหมายระยะยาวคือ

Online Customer + Walk-in Customer ต้องเป็นคนเดียวกัน

ไม่ใช่ฐานข้อมูลคนละชุด

## A6. Customer 360

นี่ควรเป็นหน้าที่สำคัญที่สุดของ CRM

เมื่อเปิดลูกค้าหนึ่งคน ควรเห็น

```
Customer Profile
│
├── ข้อมูลพื้นฐาน
├── ช่องทางติดต่อ
├── Tags
├── Source
├── สาขาที่เคยใช้บริการ
│
├── Timeline
│    ├── LINE
│    ├── Walk-in
│    ├── โทรศัพท์
│    ├── Follow-up
│    ├── ใบเสนอราคา
│    └── Transaction
│
├── สินค้าที่สนใจ
├── ประวัติการซื้อ
├── ประวัติการซ่อม
├── ประวัติ Trade-in
├── ประวัติผ่อน
│
├── Tasks
├── Notes
├── Documents
└── Consent
```

เช่น เปิดคุณ A แล้วระบบบอกว่า

```
รู้จักร้านจาก Facebook
เคยติดต่อ 7 ครั้ง
เคยเข้าร้าน 3 ครั้ง
เคยซื้อ 2 ครั้ง
ยอดซื้อสะสม 52,800 บาท
ล่าสุดสนใจ iPhone 17 Pro
พนักงานเจ้าของลูกค้า: คุณขวัญ
นัดติดตามวันที่ 18 ก.ย.
```

นี่คือ Customer 360 จริง

## A7. Lead Management

Lead ต้องมีสถานะกลางขององค์กร

```
NEW
 ↓
CONTACTED
 ↓
QUALIFIED
 ↓
OPPORTUNITY
 ↓
QUOTATION
 ↓
FOLLOW-UP
 ↓
WON / LOST
```

ผมไม่แนะนำให้พนักงานสร้างสถานะเอง

เพราะสุดท้ายจะเกิดคำแบบ

รอติดต่อ
รอลูกค้า
ลูกค้าคิดก่อน
รอตัดสินใจ
รอเงิน
ตามอีกที

แล้ววิเคราะห์ไม่ได้

## A8. Lost Reason

ถ้าขายไม่ได้ ต้องรู้ ทำไม

ระบบต้องมี Lost Reason กลาง เช่น

| Reason | ตัวอย่าง |
|---|---|
| Price | ราคาแพง |
| Stock | ไม่มีสินค้าที่ต้องการ |
| Competitor | ซื้อร้านอื่น |
| Finance | ผ่อนไม่ผ่าน |
| Down Payment | เงินดาวน์ไม่พอ |
| Promotion | Promotion ไม่ตรง |
| Product | ไม่มีรุ่น/สี |
| Timing | ยังไม่พร้อมซื้อ |
| Contact | ติดต่อไม่ได้ |
| Service | ประสบการณ์บริการ |
| Other | อื่น ๆ |

Executive Dashboard จะบอกได้ว่า

เดือนนี้เสียลูกค้าเพราะ "ไม่มีสินค้า" 87 ราย

จากนั้นฝ่ายจัดซื้อถึงจะเอาข้อมูลไปใช้ได้

## A9. Task / Follow-up Engine

ทุก Opportunity ที่ยังไม่จบต้องมี

Next Action
Next Follow-up Date
Owner
Priority

ตัวอย่าง

```
คุณ A
สนใจ iPhone 17 Pro

Owner: ขวัญ
สถานะ: รอตัดสินใจ
Next action: โทรติดตาม
วันที่: 18 ก.ย.
```

เมื่อ Login ตอนเช้า พนักงานเห็นเลยว่า

วันนี้ต้องติดตาม 13 ราย
เกินกำหนด 4 ราย

Manager เห็นว่าใครมีงานค้าง

## A10. โครงสร้าง Database

ผมเสนอให้แบ่ง Database เป็น Domain แทนที่จะเอาทุกอย่างลง Customers ตารางเดียว

**Identity / Organization**

| Table |
|---|
| organizations |
| branches |
| departments |
| staff_profiles |
| roles |
| permissions |
| role_permissions |
| staff_branch_access |

ส่วนนี้ถ้าจะต่อกับระบบ Login/สิทธิ์ที่กำลังพัฒนาอยู่ ผมแนะนำว่า ไม่ต้องสร้างระบบ Authentication ซ้ำ แต่ใช้ Staff / Role / Permission / Branch Scope จากระบบกลาง แล้วให้ CRM อ้างอิงข้อมูลชุดเดียวกัน

**Customer**

| Table | หน้าที่ |
|---|---|
| customers | Customer Master |
| customer_contacts | โทรศัพท์ / LINE / Email |
| customer_addresses | Address |
| customer_tags | Tag |
| tags | Master Tag |
| customer_notes | Notes |
| customer_consents | Consent |
| customer_documents | เอกสารเฉพาะกรณี |
| customer_merge_history | ประวัติรวม Duplicate |

**Customer Activity**

| Table |
|---|
| visitor_sessions |
| interactions |
| interaction_channels |
| interaction_outcomes |
| online_conversations |
| interaction_notes |

**CRM**

| Table |
|---|
| leads |
| lead_status_history |
| opportunities |
| opportunity_items |
| opportunity_status_history |
| quotations |
| quotation_items |
| lost_reasons |

**Work Management**

| Table |
|---|
| tasks |
| task_comments |
| followups |
| reminders |
| notifications |

**Transaction**

| Table |
|---|
| transactions |
| transaction_items |
| payment_references |
| service_references |

ไม่จำเป็นต้องเก็บข้อมูล Transaction ทั้งหมดซ้ำ ถ้าอนาคตมีระบบ POS / Repair / Contract แยกอยู่แล้ว

สามารถเก็บแค่

```
customer_id
transaction_id
transaction_type
source_system
```

แล้ว Link กัน

**Marketing**

| Table |
|---|
| campaigns |
| campaign_sources |
| campaign_members |
| campaign_interactions |
| attribution |

**Governance**

| Table |
|---|
| audit_logs |
| access_logs |
| export_logs |
| data_change_logs |
| integration_logs |

## A11. Relationship สำคัญ

```
CUSTOMER
   │
   ├──< INTERACTION
   │
   ├──< LEAD
   │
   ├──< OPPORTUNITY
   │       │
   │       └──< OPPORTUNITY_ITEM
   │
   ├──< TASK
   │
   ├──< TRANSACTION
   │
   ├──< CUSTOMER_TAG
   │
   └──< CUSTOMER_CONSENT
```

คือ Customer หนึ่งคนสามารถมี

Interaction หลายครั้ง
Lead หลายครั้ง
Opportunity หลายครั้ง
Transaction หลายครั้ง

นี่เป็นเหตุผลที่ไม่ควรเอาทุกอย่างลง customers

## A12. Standard Customer ID

ผมแนะนำให้มี ID ภายในระบบสองแบบ

Database ใช้

UUID

แต่ User เห็น

CUS-2026-00001284

เช่น

CUS-2026-001284

อ่านง่ายและให้ Call Center ใช้อ้างอิงได้

## A13. Duplicate Detection

ก่อนสร้าง Customer ต้องค้นหา

Phone
LINE ID
Email
ชื่อ + เบอร์

ถ้าระบบสงสัยว่าซ้ำ

"พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน"

ให้พนักงานเลือก Customer เดิม

ไม่ควร Merge อัตโนมัติแบบ 100% เพราะคนในครอบครัวอาจใช้เบอร์เดียวกันได้

การ Merge ควรเป็นสิทธิ์ Supervisor/Manager

## A14. Master Data

ข้อมูลประเภทนี้ห้ามพนักงานพิมพ์เอง

ต้องเลือกจากระบบ เช่น

Channel
Source
Lead Status
Opportunity Status
Lost Reason
Service Type
Product Type
Branch
Campaign
Customer Segment
Priority
Outcome

นี่คือสิ่งที่จะทำให้ Dashboard เชื่อถือได้

## A15. Permission Model

ผมแนะนำให้แยกออกเป็น

Role + Permission + Data Scope

แทนการสร้าง Role เป็นสิบ ๆ แบบ

ตัวอย่าง

| User | Permission | Scope |
|---|---|---|
| Staff | Customer Read/Create | Own / Branch |
| Supervisor | Customer Manage | Team |
| Branch Manager | CRM Manage | Branch |
| Operations | CRM Read | Multi-Branch |
| Marketing | Analytics | Organization |
| Executive | Executive | Organization |
| System Admin | System Manage | System |

เช่น

คุณ A เป็น

Role = Manager
Scope = JAUNPHONE 2

คุณ B

Role = Manager
Scope = JAUNPHONE 4

Permission เหมือนกัน แต่เห็นข้อมูลคนละสาขา

แนวทางนี้จะเข้ากับโครง Login/Permission ที่คุณกำลังทำอยู่ได้ดีกว่าการเพิ่ม Role ใหม่ทุกครั้งที่มีตำแหน่งใหม่

## A16. Permission ระดับข้อมูล

มี 4 Scope หลัก

OWN
TEAM
BRANCH
ORGANIZATION

ตัวอย่าง Staff

```
Customer Create     ✓
Customer Read       Branch
Customer Edit       Own
Customer Delete     ✕
Export              ✕
Merge               ✕
```

Branch Manager

```
Customer Read       Branch
Customer Edit       Branch
Lead Reassign       Branch
Export              Limited
Merge               ✓
Dashboard           Branch
```

Executive

```
Dashboard           All
Reports             All
Customer Read       All
Export              Controlled
```

## A17. System Admin ≠ Business Admin

อันนี้สำคัญมาก

คนที่ดูแล Server หรือ Code

ไม่ควรได้รับสิทธิ์อ่านข้อมูลลูกค้าโดยอัตโนมัติ

แยกเป็น

System Administrator

กับ

Business Administrator

เพื่อลดความเสี่ยงข้อมูล

## A18. Navigation ของระบบ

Desktop

```
JAUN CRM

Dashboard

CUSTOMER
 ├ Customers
 ├ Visitors
 └ Customer Segments

SALES
 ├ Leads
 ├ Opportunities
 ├ Pipeline
 └ Quotations

ACTIVITY
 ├ Tasks
 ├ Follow-ups
 └ Calendar

MARKETING
 ├ Campaigns
 └ Sources

ANALYTICS
 ├ Reports
 ├ Branch Performance
 └ Staff Performance

ADMIN
 ├ Master Data
 ├ Data Quality
 ├ Users & Permissions
 ├ Audit Logs
 └ Settings
```

## A19. Dashboard CEO

หน้าแรกของผู้บริหารผมอยากให้เห็นประมาณนี้

```
┌─────────────────────────────────────────────┐
│ CUSTOMER THIS MONTH                         │
│                                             │
│ Visitor     Identified    Leads    Sales    │
│ 3,125       1,284         892      215      │
└─────────────────────────────────────────────┘

┌──────────────────┐ ┌────────────────────────┐
│ Funnel           │ │ Customer Sources       │
│ Visitor          │ │ Walk-in       36%      │
│ ↓                │ │ LINE          28%      │
│ Lead             │ │ Facebook      16%      │
│ ↓                │ │ Instagram      8%      │
│ Opportunity      │ │ ...                    │
│ ↓                │ └────────────────────────┘
│ Sale             │
└──────────────────┘

┌─────────────────────────────────────────────┐
│ BRANCH PERFORMANCE                          │
│ Branch | Visitors | Leads | Sales | Conv.   │
└─────────────────────────────────────────────┘

┌──────────────────┐ ┌────────────────────────┐
│ Lost Reasons     │ │ Follow-up Performance  │
└──────────────────┘ └────────────────────────┘
```

## A20. KPI ที่ระบบต้องคำนวณ

ไม่ควรมีแค่ Sales

ควรมี

| KPI | สูตร |
|---|---|
| Visitor Count | จำนวน Visit |
| Unique Customer | Customer ID ไม่ซ้ำ |
| New Customer | First Seen อยู่ในช่วงนั้น |
| Returning Customer | เคยมีประวัติก่อนหน้า |
| Lead Rate | Lead / Visitor |
| Opportunity Rate | Opportunity / Lead |
| Close Rate | Won / Opportunity |
| Walk-in Conversion | Sale / Visitor |
| Lead Response Time | เวลา Lead → Contact |
| Follow-up Completion | Completed / Scheduled |
| Lost Rate | Lost / Opportunity |
| Repeat Rate | Repeat / Customer |
| Data Capture Rate | Captured Visitor / Visitor |

## A21. Data Capture KPI

ผมอยากให้มี KPI ระบบเฉพาะ

เช่น

```
Customer Capture Rate ≥ 95%
Outcome Completion ≥ 95%
Follow-up Completion ≥ 90%
Duplicate Rate < 2%
Missing Required Data < 2%
```

เพราะระบบ CRM จะไม่มีค่าเลย ถ้าพนักงานไม่บันทึก

## A22. UI/UX Desktop

Desktop เน้น

Dashboard + Table + Analysis

โครง

```
Sidebar
      │
      ├──────────── Header
      │              Search
      │              Notification
      │              Profile
      │
      └──────────── Content
                     KPI Cards
                     Chart
                     Table
```

ใช้ CI ที่คุณส่งมา

```
White 60%
JAUN Navy 25%
JAUN Orange 10%
Support 5%
```

Orange ใช้กับ Action สำคัญ

```
+ รับลูกค้า
บันทึก
สร้าง Lead
ติดตาม
```

## A23. Tablet

เหมาะกับ Counter

เน้น

Quick Customer Search
Customer 360
Quick Capture
Opportunity
Follow-up

ลด Chart ลง

เพิ่มปุ่ม Action ใหญ่ขึ้น

## A24. Mobile

Mobile ต้องไม่ย่อ Desktop ลงมาตรง ๆ

ควรออกแบบใหม่ให้พนักงานกดง่าย

Bottom Navigation

```
Home
Customer
     +
Tasks
More
```

ปุ่มตรงกลาง

+ รับลูกค้า

เป็น Action หลัก

## A25. Quick Capture

ผมแนะนำว่าหน้าแรกไม่ควรให้พนักงานกรอก 20 ช่อง

ขั้นแรกเอาแค่

Phone
Name
Interest
Channel

แล้วกด

รับลูกค้า

จากนั้นค่อยเติมข้อมูล

แนวคิดคือ

Capture First, Enrich Later.

## A26. Search กลางของระบบ

ด้านบนทุกหน้าควรมี Global Search

ค้นได้จาก

ชื่อ
นามสกุล
เบอร์โทร
Customer ID
LINE
IMEI
Serial
เลข Transaction
เลข Contract

## A27. Notification Engine

ระบบแจ้งเตือนอย่างน้อย

```
Follow-up ถึงกำหนด
Follow-up เกินกำหนด
Lead ไม่มี Owner
Opportunity ไม่มี Activity
Customer ซ้ำ
Task เกินกำหนด
Customer Waiting Too Long
Data Missing
```

Manager มี Notification ของทีม

Staff มีเฉพาะของตัวเอง

## A28. Customer Ownership

ทุก Lead/Opportunity ควรมี

```
owner_staff_id
branch_id
team_id
```

และต้องมีประวัติการเปลี่ยน Owner

เช่น

```
15 Sep
ขวัญ → คิม

Changed by Manager
Reason: Shift Change
```

## A29. Security Architecture

ฐานข้อมูลลูกค้าต้องใช้แนวคิด

Zero Trust + Least Privilege

โครง

```
Frontend
   ↓
Authentication
   ↓
Authorization
   ↓
API
   ↓
RLS
   ↓
PostgreSQL
```

ไม่ใช่

```
Frontend
↓
Database
↓
เชื่อ UI ว่าจะไม่แสดงข้อมูล
```

UI ไม่ใช่ Security

## A30. Row Level Security

ตัวอย่าง Logic

Staff

```
branch_id = current_user.branch_id
```

Manager

```
branch_id IN current_user.allowed_branches
```

Executive

```
organization_id = current_organization
```

และทุก Query สำคัญควรผ่าน RLS

## A31. Sensitive Data

ข้อมูลแบ่งเป็น 4 ระดับ

| Level | ตัวอย่าง |
|---|---|
| Public | ชื่อ Campaign |
| Internal | Sales Statistics |
| Confidential | Customer Profile |
| Restricted | เลขบัตร / Contract / เอกสารสำคัญ |

โดยเฉพาะเลขบัตรประชาชน

ไม่ควรเก็บใน Customer Master เพียงเพราะ "เผื่อใช้"

ควรเก็บเฉพาะกรณีธุรกรรมที่จำเป็นจริง และเก็บแยกจาก CRM Profile ทั่วไป

## A32. Audit Log

ต้องรู้ว่า

ใคร
ทำอะไร
ข้อมูลไหน
เมื่อไร
จากอุปกรณ์ไหน
ก่อนแก้คืออะไร
หลังแก้คืออะไร

เช่น

```
USER: ST-0045
ACTION: CUSTOMER_PHONE_UPDATE

OLD: 081-xxx-1234
NEW: 089-xxx-5678

TIME: 2026-09-15 18:42
```

## A33. Export Security

การ Export Excel/CSV เป็นจุดเสี่ยงมาก

ควรกำหนด

```
Export Permission
Export Reason
Export Limit
Watermark/User
Audit Log
```

Staff ปกติไม่ควร Export Database ทั้งหมดได้

## A34. Login Security

ผมแนะนำ

```
MFA
Session Expiration
Failed Login Limit
Device Logging
Password Policy
Token Rotation
Role Change Log
```

Admin / Executive ควรบังคับ MFA

## A35. Environment

ต้องแยก

```
Development
Staging
Production
```

และห้ามเอา Production Customer Database ไปใส่ Dev ตรง ๆ

ถ้าต้องใช้ข้อมูลทดสอบให้

Mask / Anonymize

## A36. Backup

อย่างน้อยต้องมี

```
Automated Backup
Point-in-Time Recovery
Restore Test
Backup Monitoring
```

Backup อย่างเดียวไม่พอ

ต้องเคยทดสอบ Restore ด้วย

## A37. Technical Architecture ที่ผมแนะนำ

จากทิศทางระบบที่คุณกำลังทำ ผมมอง Stack นี้เหมาะ

```
FRONTEND
Next.js / React
Responsive Web / PWA

        ↓

AUTH
Supabase Auth

        ↓

APPLICATION
API / Server Actions / Edge Functions

        ↓

DATABASE
PostgreSQL / Supabase

        ↓

SECURITY
RLS
Policies
Functions
Audit

        ↓

STORAGE
Supabase Storage

        ↓

INTEGRATION
LINE
Meta
POS
Repair
Accounting
Other Systems

        ↓

ANALYTICS
Views
Materialized Views
Dashboard
```

## A38. Integration Layer

อนาคตระบบ CRM ไม่ควรทำงานโดด ๆ

ควรเชื่อม

```
CRM
 │
 ├── POS / Sales
 ├── Repair System
 ├── Installment System
 ├── Contract System
 ├── LINE OA
 ├── Facebook / Meta
 ├── Accounting
 └── Marketing
```

แต่ระบบหลักทั้งหมดต้องใช้

Customer ID เดียวกัน

นี่คือ Master Customer Key ขององค์กร

## A39. อย่าให้ CRM กลายเป็น POS

นี่เป็นข้อที่อยากเน้นกับทีม Dev

CRM ทำหน้าที่

```
ใครคือ Customer
เขาติดต่ออะไร
สนใจอะไร
พนักงานคนไหนดูแล
โอกาสซื้อเท่าไร
```

POS ทำหน้าที่

```
ซื้ออะไร
ราคาเท่าไร
จ่ายอย่างไร
```

Repair ทำหน้าที่

```
ซ่อมอะไร
อาการอะไร
สถานะอะไร
```

แต่ทั้งหมดต้อง Link ผ่าน

customer_id

## A40. Data Quality Center

ผมอยากให้มีหน้าหนึ่งโดยเฉพาะ

Data Quality

เช่น

```
Duplicate Customer        16
Missing Phone             23
Lead Without Owner         8
Lead Without Outcome      19
Overdue Follow-up         31
Invalid Phone              6
Incomplete Customer       42
```

Manager กดเข้าไปแก้ได้

## A41. Manager Daily Dashboard

เวลาคุณถามผู้จัดการร้าน

เดือนนี้ลูกค้าเป็นยังไง?

เขาควรตอบจาก Dashboard ได้เลย

ตัวอย่าง

```
เดือนกันยายน

Visitor            812
Identified         562
Lead               421
Opportunity        189
Sale                74

Conversion         9.1%

New Customer       63%
Returning          37%

Top Lost Reason
1. ราคา
2. ไม่มีสินค้า
3. เงินดาวน์
```

ไม่ต้องรอให้ใครไปนับ Excel

## A42. Executive Dashboard

คุณควรสลับได้

```
Today
Yesterday
This Week
This Month
Last Month
Quarter
Custom
```

และเลือก

```
All Branches
Branch 1
Branch 2
Branch 3
Branch 4
```

แล้ว Drill Down

```
Company
↓
Branch
↓
Team
↓
Staff
↓
Customer
```

## A43. Phase การพัฒนา

ถ้าผมเป็นคนวางโครงการนี้ ผมจะแบ่งเป็น 5 Phase

| Phase | ระบบ |
|---|---|
| Phase 0 | Requirement + Data Dictionary + UX |
| Phase 1 | Customer / Visitor / Interaction |
| Phase 2 | Lead / Opportunity / Follow-up |
| Phase 3 | Dashboard / Reporting |
| Phase 4 | Online Channel / Integration |
| Phase 5 | Segmentation / Automation / AI |

Phase 1 ต้องให้ได้ก่อน

```
Customer Master
Visitor
Interaction
Customer 360
Search
Branch
Permission
Basic Dashboard
Audit
```

จากนั้น Pilot หนึ่งสาขาก่อน

ไม่ควรเปิดทุกสาขาพร้อมกันทันที

## A44. Acceptance Criteria ของ V1

ผมจะยังไม่ถือว่า "ระบบเสร็จ" เพียงเพราะหน้าเว็บเปิดได้

V1 ต้องสามารถตอบคำถามพวกนี้จาก Database จริงได้

| คำถาม | ต้องตอบได้ |
|---|---|
| วันนี้มีคนเข้าร้านกี่คน | ✓ |
| เดือนนี้มีลูกค้าไม่ซ้ำกี่คน | ✓ |
| ลูกค้าใหม่กี่คน | ✓ |
| ลูกค้าเก่ากี่คน | ✓ |
| มาจากช่องทางใด | ✓ |
| สนใจอะไร | ✓ |
| ใครดูแล | ✓ |
| ซื้อหรือไม่ซื้อ | ✓ |
| ถ้าไม่ซื้อ เพราะอะไร | ✓ |
| ใครต้องติดตามต่อ | ✓ |
| แต่ละสาขา Conversion เท่าไร | ✓ |

ถ้ายังตอบไม่ได้ข้อใดข้อหนึ่ง ถือว่า Module ที่เกี่ยวข้องยังไม่ผ่าน Acceptance

## A45. เอกสารที่ควรส่งให้ทีม Dev

ก่อนเขียนจริง ผมแนะนำทำชุดเอกสารโครงการให้ครบดังนี้

```
01 Product Requirement Document
02 Business Requirement
03 User Role & Permission Matrix
04 Workflow
05 Sitemap
06 Screen Specification
07 Data Dictionary
08 ER Diagram
09 Database Schema
10 API Specification
11 RLS Specification
12 Audit Specification
13 PDPA / Consent Flow
14 Dashboard KPI Definition
15 Notification Rule
16 Data Migration Plan
17 Test Case
18 UAT Checklist
19 Deployment Plan
20 Backup / Recovery Plan
```

ถ้าทำ 20 ชุดนี้ก่อน ทีม Dev จะคุยกันง่ายขึ้นมาก และลดปัญหา "เขียนไปก่อนแล้วค่อยแก้ Requirement" ภายหลัง

**ภาพสุดท้ายของระบบที่ผมอยากให้ JAUN ได้**

ไม่ใช่แค่ระบบที่บอกว่า

"คุณสมชาย เบอร์อะไร"

แต่เป็นระบบที่ตอบผู้บริหารว่า

```
เดือนนี้มีคนเข้ามา 3,125 คน
มีลูกค้าเป้าหมาย 892 คน
มีโอกาสซื้อ 368 คน
ซื้อจริง 215 คน
เราเสียลูกค้า 83 คนเพราะราคา
41 คนเพราะไม่มีสินค้า
117 คนยังต้อง Follow-up
สาขา 2 Conversion สูงสุด
และมีลูกค้าเก่า 164 คนที่มีโอกาสซื้อซ้ำ
```

---

# ส่วน B — สรุป Requirement ระบบ JAUN CRM / Customer 360 (สำหรับทีม Dev)

สวัสดีครับทีม Dev ขอรวบรวมภาพรวม Requirement ของระบบจัดเก็บและบริหารข้อมูลลูกค้า เพื่อให้ทุกฝ่ายเข้าใจ Scope และทิศทางเดียวกันก่อนเริ่มออกแบบ Database และพัฒนาระบบจริงครับ

## B1. เป้าหมายหลักของระบบ

ปัจจุบันเรายังไม่สามารถตอบได้อย่างชัดเจนว่า ในแต่ละวันหรือแต่ละเดือนมีลูกค้าเข้ามากี่คน ลูกค้ามาจากช่องทางไหน สนใจอะไร ซื้อหรือไม่ซื้อ และถ้าไม่ซื้อเกิดจากสาเหตุอะไร

ระบบใหม่นี้จึงไม่ได้ต้องการเป็นเพียง "ระบบเก็บรายชื่อลูกค้า" แต่ต้องเป็น Customer Data + CRM Operations System ที่เก็บ Customer Journey ตั้งแต่ลูกค้าเริ่มติดต่อ จนถึงการติดตาม ปิดการขาย และกลับมาใช้บริการซ้ำ

ระบบต้องครอบคลุมทั้ง ลูกค้าหน้าร้านและลูกค้าออนไลน์ และในอนาคตต้องสามารถเชื่อมต่อระบบอื่นของบริษัทได้

## B2. นิยามลูกค้าในระบบ

ขอให้ระบบแยกสถานะให้ชัดเจน เพราะ "คนที่เข้าร้าน" ไม่ได้หมายความว่าเป็น "ลูกค้าที่ซื้อแล้ว"

Flow หลักคือ

Visitor → Identified Customer → Lead → Opportunity → Customer → Repeat Customer

ตัวอย่างเช่น มีคนเข้าร้าน 100 คน แต่ระบุตัวตนได้ 70 คน มี Lead 45 คน มี Opportunity 20 คน และขายได้จริง 10 คน ระบบต้องสามารถรายงานตัวเลขเหล่านี้แยกกันได้

## B3. Module หลักที่ต้องมี

ระบบควรประกอบด้วย Customer Master, Customer 360, Visitor Management, Interaction, Lead, Opportunity, Sales Pipeline, Follow-up, Tasks, Transaction Reference, Campaign, Customer Segment, Reports, Data Quality, Consent/PDPA, Audit Log, User & Permission, Master Data และ System Settings

ทุก Module ต้องเชื่อมผ่าน Customer ID กลาง เพื่อให้ลูกค้าคนเดียวกันไม่ถูกสร้างซ้ำหลายระบบ

## B4. Customer Master

Customer 1 คนต้องมี Master Record เดียว เช่น

Customer ID, ชื่อ-นามสกุล, ชื่อเล่น, เบอร์โทร, LINE, Social Media, Email, วันที่รู้จักร้านครั้งแรก, Source แรก, สาขาแรก, ผู้ดูแล, Tags, Customer Type และ Consent

เบอร์โทรควร Normalize ก่อนจัดเก็บ และต้องมีระบบตรวจ Duplicate ก่อนสร้างลูกค้าใหม่

## B5. Customer 360

เมื่อเปิดลูกค้าหนึ่งคน ต้องเห็นข้อมูลทั้งหมดในหน้าเดียว เช่น ประวัติการติดต่อ, Walk-in, LINE, Facebook, โทรศัพท์, สินค้าที่สนใจ, ใบเสนอราคา, Follow-up, Transaction, การซื้อ, การซ่อม, Trade-in, การผ่อน, Tasks, Notes, Documents และ Consent

เป้าหมายคือให้พนักงานหรือผู้จัดการสามารถเข้าใจลูกค้าคนนี้ได้ทันทีโดยไม่ต้องค้นหลายระบบ

## B6. Workflow ลูกค้าหน้าร้าน

เมื่อลูกค้าเข้าร้าน พนักงานต้องสามารถกด "รับลูกค้า" ได้ทันที

ระบบควรสร้าง Visitor Session ก่อน แม้ว่ายังไม่รู้ชื่อหรือเบอร์ เพื่อให้เราทราบจำนวน Traffic หน้าร้านจริง

หลังจากนั้นจึงค้นหาลูกค้าเดิมจากเบอร์โทรหรือข้อมูลอื่น หากพบให้เปิด Customer เดิม หากไม่พบจึงสร้างใหม่

พนักงานเลือกว่าลูกค้าสนใจอะไร เช่น ซื้อ, ขาย, Trade-in, ซ่อม, ผ่อน, Accessories หรือสอบถามโปรโมชั่น

ก่อนจบการให้บริการต้องมี Outcome เช่น ซื้อแล้ว / นัดติดตาม / ยังไม่ซื้อ / ไม่สนใจ

หากยังไม่ปิดการขาย ต้องมี Next Action และ Follow-up Date

## B7. Workflow ลูกค้าออนไลน์

ลูกค้าที่มาจาก LINE, Facebook, Instagram, TikTok, โทรศัพท์ หรือช่องทางออนไลน์อื่น ต้องเข้าฐาน Customer เดียวกับลูกค้าหน้าร้าน

เป้าหมายในอนาคตคือ Online Customer และ Walk-in Customer ต้องเป็นคนเดียวกัน ไม่ใช่แยกฐานข้อมูล

Version แรกสามารถให้พนักงานสร้าง Lead จากการสนทนาได้ก่อน และค่อยพัฒนา Integration API ใน Phase หลัง

## B8. Lead และ Opportunity

Lead ต้องมีสถานะกลางขององค์กร ไม่ให้แต่ละคนพิมพ์สถานะเอง

Flow แนะนำคือ

New → Contacted → Qualified → Opportunity → Quotation → Follow-up → Won / Lost

ถ้า Lost ต้องเลือก Lost Reason จาก Master Data เช่น ราคา, ไม่มีสินค้า, เครดิตไม่ผ่าน, เงินดาวน์ไม่พอ, ซื้อร้านอื่น, ยังไม่พร้อม, โปรโมชั่นไม่ตรง หรือ ติดต่อไม่ได้

ข้อมูลนี้จะเป็นตัวสำคัญในการวิเคราะห์ยอดขายตก

## B9. Follow-up และ Tasks

ทุก Opportunity ที่ยังไม่จบต้องมี Owner, Next Action, Follow-up Date และ Priority

พนักงานต้องเห็น "งานที่ต้องทำวันนี้" และ Manager ต้องเห็นงานค้างหรืองานเกินกำหนดของทีม

ระบบควรมี Notification สำหรับ Follow-up ถึงกำหนด, เกินกำหนด, Lead ไม่มี Owner, Opportunity ไม่มี Activity และข้อมูลไม่ครบ

## B10. ผู้ใช้งานและการสมัครระบบ

ระบบนี้ ไม่เปิด Public Sign-up และพนักงานไม่สมัครใช้งานเอง

ให้ ผู้จัดการเป็นผู้สร้างบัญชีพนักงานในสาขาของตัวเอง

Flow คือ Manager → ผู้ใช้งานในสาขา → เพิ่มผู้ใช้งาน → กรอกข้อมูล → เลือก Role → ระบบล็อก Branch ตาม Manager → ส่งคำเชิญ → พนักงานตั้งรหัสผ่าน → เริ่มใช้งาน

Manager จะสร้างผู้ใช้ได้เฉพาะขอบเขตสาขาที่ตัวเองรับผิดชอบ และไม่สามารถสร้าง Role ที่สูงกว่าตัวเอง เช่น System Admin หรือ Executive

เมื่อพนักงานลาออกให้ใช้ Disable Account ไม่ใช่ Delete เพื่อให้ Audit History ยังอยู่ครบ

## B11. Permission Model

ขอให้แยกเป็น 3 ส่วน

Role + Permission + Data Scope

Data Scope หลักคือ Own, Team, Branch และ Organization

ตัวอย่าง Staff อาจดูข้อมูลสาขาได้ แต่แก้ได้เฉพาะลูกค้าที่ตัวเองรับผิดชอบ ส่วน Branch Manager ดูและจัดการข้อมูลของสาขาตัวเองได้

System Admin กับ Business Admin ต้องแยกกัน คนที่ดูแลระบบหรือ Server ไม่ควรมีสิทธิ์อ่านข้อมูลลูกค้าโดยอัตโนมัติ

## B12. Database Structure

Database ไม่ควรเก็บทุกอย่างในตาราง `customers`

ควรแยก Domain เช่น Organization, Customer, Customer Activity, CRM, Work Management, Transaction, Marketing และ Governance

Table หลักควรมีประมาณ:

`customers`, `customer_contacts`, `customer_addresses`, `customer_tags`, `customer_consents`, `visitor_sessions`, `interactions`, `leads`, `lead_status_history`, `opportunities`, `opportunity_items`, `quotations`, `tasks`, `followups`, `transactions`, `campaigns`, `audit_logs`, `access_logs`, `export_logs`

Customer 1 คนสามารถมีหลาย Interaction, Lead, Opportunity และ Transaction

## B13. Customer ID

ภายใน Database ใช้ UUID

แต่หน้าจอผู้ใช้งานควรมีเลขที่อ่านง่าย เช่น

CUS-2026-001284

เพื่อใช้ค้นหาและอ้างอิงกับลูกค้าได้สะดวก

## B14. Duplicate Prevention

ก่อนสร้าง Customer ใหม่ให้ตรวจ Phone, LINE ID, Email และข้อมูลที่เกี่ยวข้องก่อน

หากพบข้อมูลใกล้เคียงให้แจ้งว่า "อาจเป็นลูกค้าคนเดียวกัน" และให้ผู้ใช้เลือก Customer เดิม

ไม่ควร Merge อัตโนมัติ และการ Merge ควรเป็นสิทธิ์ระดับ Supervisor/Manager

## B15. Master Data

ข้อมูลที่ใช้ทำรายงานต้องเลือกจาก Master Data ไม่ให้พิมพ์อิสระ เช่น Channel, Source, Lead Status, Opportunity Status, Lost Reason, Service Type, Product Type, Branch, Campaign, Customer Segment, Priority และ Outcome

เพื่อป้องกันข้อมูลแบบ Facebook / FB / เฟสบุ๊ก / facebook ที่ทำให้ Dashboard วิเคราะห์ไม่ได้

## B16. Dashboard

Executive Dashboard ต้องตอบได้อย่างน้อยว่า วันนี้และเดือนนี้มี Visitor, Unique Customer, New Customer, Returning Customer, Lead, Opportunity, Sale และ Conversion เท่าไร

ต้องดูได้ตาม Date, Branch, Team, Staff และ Channel

และควรมี Funnel, Customer Source, Lost Reason, Branch Performance, Follow-up Performance และ Top Product

Manager Dashboard ให้เน้นข้อมูลของสาขาตัวเอง

## B17. KPI ที่ระบบต้องคำนวณ

ระบบควรคำนวณ Visitor Count, Unique Customer, New Customer, Returning Customer, Lead Rate, Opportunity Rate, Close Rate, Walk-in Conversion, Response Time, Follow-up Completion, Lost Rate, Repeat Rate และ Data Capture Rate

เป้าหมายด้านคุณภาพข้อมูล เช่น Customer Capture Rate ≥ 95%, Outcome Completion ≥ 95%, Duplicate Rate < 2%

## B18. UX/UI

ระบบต้อง Responsive รองรับ Computer / Tablet / Mobile

Desktop เหมาะกับ Executive, Manager และงานวิเคราะห์

Tablet เหมาะกับ Counter

Mobile เหมาะกับ Staff และการรับลูกค้าหน้างาน

หน้าหลักที่ออกแบบไว้มี 10 หน้า คือ Login, Dashboard, Customers, Quick Capture, Customer 360, Pipeline, Visitor, Tasks, Analytics และ Mobile

Quick Capture ต้องใช้เวลาน้อยที่สุด แนวคิดคือ Capture First, Enrich Later

ข้อมูลขั้นแรกควรมีแค่ เบอร์โทร, ชื่อ, ความสนใจ และช่องทาง แล้วจึงค่อยเติมรายละเอียดภายหลัง

## B19. Design System

ใช้ CI ของบริษัท

JAUN Navy `#0B1E41`
JAUN Orange `#F86E0B`
Support Blue `#21417E`
Light Gray `#EAE8E7`
White `#FBFBFB`
Dark Text `#101828`

สัดส่วนหลัก White 60%, Navy 25%, Orange 10%, Support 5%

Orange ใช้เป็น Accent และ CTA ไม่ใช้เป็น Background หลัก

Typography ใช้ Kanit

## B20. Security

ขอให้ระบบออกแบบ Security ตั้งแต่ Database ไม่ใช่ซ่อนข้อมูลเฉพาะ UI

Architecture หลักควรเป็น

Authentication → Authorization → API → RLS → PostgreSQL

ใช้ Row Level Security ตาม Branch / Role / Data Scope

ต้องมี MFA สำหรับ Admin/Manager/Executive ตามความเหมาะสม, Session Management, Failed Login Protection, Rate Limit, Secure API, Secrets แยกจาก Source Code และ Production / Staging / Development แยกกัน

Production Data ห้ามนำไปใช้ใน Dev ตรง ๆ โดยไม่ Mask หรือ Anonymize

## B21. Audit Log

ระบบต้องบันทึกว่า

ใคร → ทำอะไร → กับข้อมูลไหน → เวลาใด → ก่อนแก้คืออะไร → หลังแก้คืออะไร

รวมถึง Login, Failed Login, Role Change, Permission Change, Export และการแก้ข้อมูลสำคัญ

Audit Log ไม่ควรถูกแก้ไขหรือลบโดย User ทั่วไป

## B22. Export Data

การ Export Customer Data ต้องเป็น Permission แยก

ไม่ควรให้ Staff ทั่วไป Export Customer Database ทั้งหมด

ควรมี Export Reason, จำนวนข้อมูล, ผู้ Export และ Audit Log

## B23. PDPA และ Sensitive Data

เก็บข้อมูลเท่าที่จำเป็นตามวัตถุประสงค์

ข้อมูลอย่างเลขบัตรประชาชนหรือเอกสารสำคัญไม่ควรอยู่ใน Customer Master ทั่วไป หากมีความจำเป็นต้องใช้กับสัญญาหรือธุรกรรมให้เก็บแยกและจำกัด Permission เพิ่มเติม

ระบบควรรองรับ Consent Record, Consent History, Retention, Data Correction และ Data Anonymization/Deletion Workflow

## B24. Backup / Recovery

ต้องมี Automated Backup, Point-in-Time Recovery และ Restore Test

ขอให้มีการทดสอบ Restore จริง ไม่ใช่มี Backup อย่างเดียว

## B25. Integration

ระยะยาว CRM ต้องเชื่อมกับระบบ Sales/POS, Repair, Installment, Contract, LINE OA, Meta, Accounting และระบบอื่น

แต่ทุกระบบต้องอ้างอิงผ่าน Customer ID กลาง

CRM ไม่ควรกลายเป็น POS หรือ Repair System ทั้งระบบ แต่ทำหน้าที่เป็นศูนย์กลางข้อมูลลูกค้าและ Customer Journey

## B26. Development Phase

แนะนำพัฒนาเป็น Phase

Phase 0: Requirement, Workflow, Data Dictionary, ERD, Permission, UX/UI
Phase 1: Customer, Visitor, Interaction, Customer 360, Search, Permission, Audit
Phase 2: Lead, Opportunity, Pipeline, Follow-up, Tasks
Phase 3: Dashboard, Reports, Analytics
Phase 4: Online Integration / Omnichannel
Phase 5: Segmentation, Automation, AI / Customer Intelligence

Phase 1 ควร Pilot กับบางสาขาก่อน ก่อน Rollout ทั้งองค์กร

## B27. Acceptance Criteria ของ Version 1

ก่อนถือว่า V1 พร้อมใช้งานจริง ระบบต้องสามารถตอบคำถามเหล่านี้จาก Database ได้ทันที:

* วันนี้มีคนเข้าร้านกี่คน
* เดือนนี้มีลูกค้า Unique กี่คน
* ลูกค้าใหม่/ลูกค้าเก่ากี่คน
* ลูกค้ามาจากช่องทางไหน
* สนใจสินค้า/บริการอะไร
* ใครเป็น Owner
* ซื้อหรือไม่ซื้อ
* ถ้าไม่ซื้อ เพราะอะไร
* ใครต้อง Follow-up ต่อ
* แต่ละสาขา Conversion เท่าไร
* มีข้อมูลซ้ำหรือข้อมูลไม่ครบเท่าไร

ถ้ายังตอบไม่ได้ แสดงว่า Module ที่เกี่ยวข้องยังไม่ถือว่าผ่านครับ

## สรุป Direction

สิ่งที่ต้องการจากระบบนี้ไม่ใช่แค่ "ฐานรายชื่อลูกค้า" แต่ต้องพัฒนาไปเป็น

JAUN Customer 360 → CRM → Customer Intelligence

เพื่อให้วันหนึ่งผู้บริหารสามารถเปิดระบบแล้วเห็นได้ทันทีว่า

เดือนนี้มีลูกค้าเข้ามากี่คน มาจากไหน สนใจอะไร พนักงานคนไหนดูแล ปิดการขายได้เท่าไร เสียลูกค้าเพราะอะไร มีลูกค้ากี่คนที่ต้องติดตาม และแต่ละสาขามี Conversion เท่าไร

ขอให้ทีม Dev ใช้ภาพรวมนี้เป็น Business Direction หลัก ก่อนลงรายละเอียด ERD, Database Schema, API, RLS และ Development Sprint ต่อไปครับ
