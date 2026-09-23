# JAUN CRM · Customer 360

ชุดส่งมอบ **Phase 0** ของระบบข้อมูลลูกค้าและ CRM สำหรับ JAUN (JAUNPHONE สาขา 1–4 และ JAUN POWER MONEY)
**สถานะ: แผน Phase 1 อนุมัติแล้ว 23 ก.ย. 2569** — จุดอ้างอิง `phase1-plan-approved` · ขอบเขตและลำดับงานอยู่ใน `docs/08-delivery/phase1-plan.md` และ `CANONICAL.md` ข้อ 20
เป้าหมายของระบบไม่ใช่ "ฐานรายชื่อลูกค้า" แต่คือการตอบคำถามผู้บริหารจากฐานข้อมูลจริงว่า
**วันนี้มีคนเข้ามากี่คน · มาจากช่องทางไหน · สนใจอะไร · ใครดูแล · ซื้อหรือไม่ซื้อ · ถ้าไม่ซื้อเพราะอะไร · ใครต้องติดตามต่อ · แต่ละสาขา Conversion เท่าไร**

> เอกสารทุกฉบับ ทุกไฟล์ SQL และ prototype ยึดค่าจาก **`docs/00-brief/CANONICAL.md`** เท่านั้น
> ถ้าค่าไหนยังไม่ถูกยืนยันจะเขียนว่า **"รอยืนยัน"** พร้อมหมายเลขคำถาม (Q1–Q30) ไม่มีการเดาค่าเอง

---

## เริ่มต้นใช้งาน

```bash
npm run check                             # ตรวจทั้งชุด: CANONICAL + prototype + ฐานข้อมูล
npm run db:test                           # รัน migration + seed + ชุดทดสอบ (ไม่ต้องติดตั้ง Postgres)
node tools/serve-prototype.mjs            # เปิด prototype ที่ http://localhost:8788
```

`supabase/seed.sql` (14 MB) ไม่เก็บใน git เพราะสร้างซ้ำได้เหมือนเดิมทุกไบต์ — คำสั่งข้างบนสร้างให้อัตโนมัติ หรือสั่งเองด้วย `npm run db:seed`

ต้องมี **Node.js 22 ขึ้นไป** อย่างเดียว · ชุดทดสอบรันบน **PGlite (PostgreSQL 17 ใน WASM)** จึงไม่ต้องติดตั้งฐานข้อมูลหรือ Docker
คำสั่งลัดอื่นอยู่ใน `package.json` (`npm run db:test`, `npm run check`)

---

## โครงสร้างไฟล์

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `docs/00-brief/` | `REQUIREMENT.md` บรีฟต้นฉบับของเจ้าของโครงการ · **`CANONICAL.md`** ข้อเท็จจริงกลาง (นิยาม · รหัส · สูตร KPI · สิทธิ์ · ข้อมูลตัวอย่าง · decision log · คำถามรอยืนยัน) |
| `docs/01-requirement/` | PRD/BRD + traceability ทุกข้อของบรีฟ · user flow ทุกกระบวนการ |
| `docs/02-architecture/` | สถาปัตยกรรมระบบ · โครง Next.js + Supabase · ADR |
| `docs/03-data/` | Data dictionary (สร้างจากฐานข้อมูลจริง) · ER diagram · schema notes |
| `docs/04-security/` | Permission matrix · RLS spec · Security design (รวม Audit) · PDPA |
| `docs/05-analytics/` | นิยาม KPI ทุกตัว · กติกาการแจ้งเตือน |
| `docs/06-ux/` | Design system · Sitemap + Screen spec ทั้ง 19 หน้า |
| `docs/07-api/` | API specification (RPC · Edge Function · Server Action) |
| `docs/08-delivery/` | Roadmap · แผนย้ายข้อมูล · Test case + UAT · Deployment/Backup · **แผน Phase 1 (อนุมัติแล้ว)** |
| `supabase/migrations/` | โครงฐานข้อมูลทั้งหมด (schema · RLS · RPC · analytics · jobs) |
| `supabase/tests/` | ชุดทดสอบ: schema · สิทธิ์รายบทบาท · RPC · acceptance |
| `prototype/` | ต้นแบบคลิกได้ 19 หน้า (คอม · แท็บเล็ต · มือถือ) ไม่ต้องต่อเน็ต |
| `tools/` | ตัวรันฐานข้อมูล · ตัวสร้าง seed/data dictionary · ตัวตรวจ prototype · ตัวตรวจ CANONICAL · เซิร์ฟเวอร์ดู prototype |

---

## หลักการที่ระบบยึด

1. **นับให้ถูกก่อนวิเคราะห์** — แยก Visit · Lead · Opportunity · Sale · Lost ออกจากกันชัดเจน (CANONICAL ข้อ 3)
2. **Capture First, Enrich Later** — รับลูกค้าด้วยข้อมูลขั้นต่ำก่อน แล้วค่อยเติม (ข้อ 6.2)
3. **ความปลอดภัยอยู่ที่ฐานข้อมูล ไม่ใช่หน้าจอ** — RLS + ตรวจสิทธิ์ทุกแถว ต่อให้เรียก API ตรงก็ผ่านไม่ได้ (ข้อ 9)
4. **เบอร์ลูกค้าปิดบังเป็นค่าเริ่มต้น** — เปิดดูได้แต่ถูกบันทึกทุกครั้ง (ข้อ 6.4)
5. **ผู้ดูแลระบบ ≠ ผู้ดูแลข้อมูลธุรกิจ** — System Admin ไม่มีสิทธิ์อ่านข้อมูลลูกค้าเลย (ข้อ 7)
6. **Master Data ห้ามพิมพ์เอง** — ช่องทาง เหตุผลที่ไม่สำเร็จ สถานะ ล้วนเลือกจากค่ากลาง เพื่อให้ Dashboard เชื่อถือได้ (ข้อ 5)

---

## เกณฑ์ผ่านของ V1

V1 = จบ Phase 3 · ถือว่าผ่านเมื่อตอบคำถาม 11 ข้อของบรีฟได้จากฐานข้อมูลจริง (ไม่ใช่จากหน้าจอตัวอย่าง)
ดูรายละเอียดและการแมปคำถาม → KPI → หน้าจอ ได้ที่ `docs/01-requirement/requirement-review.md` และ `docs/05-analytics/kpi-definitions.md`

## สิ่งที่ต้องให้เจ้าของโครงการยืนยัน

รวมไว้ที่ `docs/00-brief/CANONICAL.md` ข้อ 17 (Q1–Q30) เช่น ระบบ Login กลางขององค์กร · สาขาที่จะ pilot · เวลาทำการ · แพ็กเกจ Supabase · เพดานการส่งออกข้อมูล · ระยะเวลาเก็บข้อมูลและผู้ทำหน้าที่ DPO · นิติบุคคลของ JAUNPHONE กับ JAUN POWER MONEY
