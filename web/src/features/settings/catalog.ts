/* แคตตาล็อกค่าตั้ง — "คีย์นี้คืออะไร แก้แล้วอะไรเปลี่ยน และของจริงบังคับใช้ที่ไหน"

   ทำไมต้องมีไฟล์นี้ ทั้งที่ api.get_settings() คืนคีย์กับค่ามาให้อยู่แล้ว:

   1. เจ้าของโครงการตั้งเกณฑ์ไว้ว่า "Settings ต้องเปลี่ยน behavior ของระบบจริง ไม่ใช่แค่เก็บค่า"
      ตารางค่าตั้งจึงต้องมีคอลัมน์ "มีผลกับ" ที่เขียนเป็นภาษาคน และต้องบอกได้ว่าค่านั้น
      ถูกใช้ที่บรรทัดไหนของระบบ — ข้อมูลนี้ไม่มีใน RPC จึงต้องเขียนไว้ที่เดียวตรงนี้
   2. `live` เป็นคำสารภาพ ไม่ใช่โฆษณา: คีย์ที่ระบบยังไม่ได้อ่านไปใช้จริงต้องขึ้นจอว่า
      "แก้แล้วยังไม่มีผล" ไม่ใช่ปล่อยให้ผู้ดูแลแก้แล้วนั่งรอผลที่ไม่มีวันมา
   3. `kind` เป็นตัวบอกว่าฟอร์มแก้ค่าจะเป็นช่องแบบไหนและตรวจค่าอย่างไร
      ฝั่งเซิร์ฟเวอร์เปิดไฟล์นี้ด้วย key ที่ส่งมา แล้วใช้ kind ของ "ฝั่งเรา" เสมอ
      ไม่ใช้ค่าที่ฟอร์มส่งมา เพื่อไม่ให้ฟอร์มที่ถูกแก้เลือกวิธีตรวจค่าเองได้

   ทุกบรรทัดของ `enforcedAt` อ้างจุดใช้งานจริงที่ตรวจแล้วใน supabase/migrations/*.sql
   ห้ามเดา — ถ้าไม่เจอจุดใช้งาน ให้ตั้ง live = "pending" แล้วเขียนเหตุผลใน effect

   ไฟล์นี้ไม่มี "server-only" เพราะฟอร์มฝั่ง client ใช้ป้ายและกติกาตรวจค่าชุดเดียวกัน */

/** ชนิดค่า → รูปแบบช่องกรอกและวิธีตรวจ */
export type SettingKind = "int" | "pair" | "time" | "text" | "hours" | "limits" | "env" | "clock" | "domains";

/** แก้แล้วมีผลจริงหรือยัง — ขึ้นเป็นป้ายบนตาราง ห้ามโกหกผู้ใช้ */
export type LiveState =
  /** ระบบอ่านค่านี้ไปใช้จริงทุกจุดที่ควรใช้ */
  | "live"
  /** ใช้จริงบางจุด แต่ยังมีจุดที่ฝังค่าไว้ในโค้ด (เขียนบอกใน gap) */
  | "partial"
  /** ยังไม่มีใครอ่านค่านี้ไปใช้ — แก้แล้วไม่มีผล */
  | "pending";

export type GroupId =
  | "hours"
  | "sla"
  | "quality"
  | "badge"
  | "notify"
  | "export"
  | "security"
  | "session"
  | "pdpa"
  | "technical";

export type SettingSpec = {
  key: string;
  label: string;
  group: GroupId;
  kind: SettingKind;
  /** หน่วยที่แสดงต่อท้ายค่าและในป้ายของช่องกรอก (นาที · วัน · ครั้ง …) */
  unit?: string;
  /** ชื่อของสองขั้นเมื่อ kind = "pair" */
  names?: [string, string];
  min?: number;
  max?: number;
  /** คอลัมน์ "มีผลกับ" — เปลี่ยนค่านี้แล้วอะไรเปลี่ยน เขียนให้คนที่ไม่ได้เขียนโค้ดอ่านรู้เรื่อง */
  effect: string;
  /** ของจริงบังคับใช้ที่ไหน — ผู้ดูแลจะได้รู้ว่าไปดูผลได้ที่หน้าไหน/งานไหน */
  enforcedAt: string;
  live: LiveState;
  /** ข้อจำกัดที่ต้องรู้ก่อนแก้ เช่น "ของเดิมไม่คำนวณใหม่" */
  gap?: string;
};

export type GroupSpec = {
  id: GroupId;
  title: string;
  subtitle: string;
  tab: "business" | "system";
};

/** กลุ่มตามความหมาย (ข้อกำหนดของงานนี้ ข้อ 1) — ไม่ได้จัดกลุ่มตามว่าใครแก้ได้ */
export const GROUPS: GroupSpec[] = [
  { id: "hours", tab: "business", title: "เวลาทำการ", subtitle: "ตัดสินว่านาทีไหน “อยู่ในเวลาทำการ” ตอนนับ SLA และส่งแจ้งเตือน" },
  { id: "sla", tab: "business", title: "SLA และการยกระดับ", subtitle: "รอนานแค่ไหนจึงเตือน และเตือนใครก่อนหลัง" },
  { id: "quality", tab: "business", title: "คุณภาพข้อมูล", subtitle: "เกณฑ์วันที่ทำให้รายการขึ้นในศูนย์คุณภาพข้อมูล (12)" },
  { id: "badge", tab: "business", title: "ป้ายและเอกสาร", subtitle: "ป้ายบนหน้าจอลูกค้า และอายุใบเสนอราคา" },
  { id: "notify", tab: "business", title: "การแจ้งเตือนสรุปประจำวัน", subtitle: "เวลาส่งสรุป (Asia/Bangkok)" },
  { id: "export", tab: "business", title: "การส่งออก", subtitle: "เพดาน ผู้อนุมัติ และอายุไฟล์ของคำขอส่งออก (ข้อ 8.2)" },
  { id: "security", tab: "business", title: "ความปลอดภัย", subtitle: "เพดานการใช้งานต่อคนต่อช่วงเวลา — เกินแล้วฐานข้อมูลปฏิเสธเองที่ RPC" },
  { id: "session", tab: "business", title: "เซสชันและอุปกรณ์ร่วม", subtitle: "พฤติกรรมของเครื่อง counter ที่พนักงานใช้ร่วมกัน" },
  { id: "pdpa", tab: "business", title: "PDPA", subtitle: "ฉบับประกาศที่ผูกกับความยินยอม และเพดานการทำข้อมูลนิรนาม (ข้อ 10)" },
  { id: "technical", tab: "system", title: "ค่าเชิงเทคนิค", subtitle: "สภาพแวดล้อม นาฬิกาอ้างอิงของรายงาน และโดเมน SSO (ข้อ 1.2 · 9.2.1)" },
];

export const CATALOG: SettingSpec[] = [
  /* ---------------------------------------------------------------- เวลาทำการ */
  {
    key: "business_hours",
    label: "เวลาทำการ",
    group: "hours",
    kind: "hours",
    effect:
      "นาทีที่อยู่นอกเวลาทำการจะไม่ถูกนับเป็นเวลารอ และไม่มีการแจ้งเตือน SLA — ขยายเวลาทำการแล้วจะเริ่มเตือนเร็วขึ้นและบ่อยขึ้น",
    enforcedAt: "app.branch_business_hours() → app.job_notifications (รันทุก 5 นาที)",
    live: "live",
    gap: "ค่าเฉพาะสาขาทับค่าเริ่มต้น · ยังไม่รองรับวันหยุด (ข้อ 11.1)",
  },

  /* ------------------------------------------------------------- SLA · ยกระดับ */
  {
    key: "sla.followup_remind_min",
    label: "เตือนล่วงหน้าก่อนถึงเวลานัดติดตาม",
    group: "sla",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 1440,
    effect: "งานติดตามที่สร้างหลังจากนี้ จะตั้งเวลาเตือน = เวลานัด ลบด้วยค่านี้",
    enforcedAt: "trigger ของ crm.tasks (0009_business_triggers.sql) ตอนสร้างงานใหม่",
    live: "live",
    gap: "งานที่สร้างไว้ก่อนแก้ค่าจะไม่ถูกคำนวณเวลาเตือนใหม่",
  },
  {
    key: "sla.lead_unassigned_min",
    label: "Lead ยังไม่มีผู้รับผิดชอบนานเกิน",
    group: "sla",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 1440,
    effect: "ครบเวลานี้แล้ว Lead จะถูกแจ้งเตือนขึ้นไปหาหัวหน้าทีม/ผู้จัดการสาขา",
    enforcedAt: "app.job_notifications (0013_jobs.sql) รอบถัดไป",
    live: "live",
  },
  {
    key: "sla.lead_not_contacted_min",
    label: "Lead ยังไม่ถูกติดต่อนานเกิน",
    group: "sla",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 1440,
    effect: "ครบเวลานี้แล้วแจ้งผู้รับผิดชอบว่ายังไม่ได้ติดต่อลูกค้า",
    enforcedAt: "app.job_notifications (0013_jobs.sql) รอบถัดไป",
    live: "live",
  },
  {
    key: "sla.visitor_waiting_min",
    label: "ลูกค้ารอคิวนานเกิน",
    group: "sla",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 480,
    effect: "เกณฑ์เดียวที่ตัดสินว่าคิวไหน “รอนาน” — ทั้งการแจ้งเตือนหน้าร้าน และป้ายสีบนหน้ารับลูกค้า (07)",
    enforcedAt: "app.job_notifications (0013_jobs.sql) · หน้ารับลูกค้า (07) อ่านผ่าน api.get_display_settings()",
    live: "live",
  },
  {
    key: "sla.visit_in_service_min",
    label: "ให้บริการนานเกินโดยยังไม่บันทึกผล",
    group: "sla",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 480,
    effect: "visit ที่อยู่สถานะกำลังให้บริการนานเกินค่านี้ จะถูกแจ้งเตือนให้บันทึกผล",
    enforcedAt: "app.job_notifications (0013_jobs.sql) รอบถัดไป",
    live: "live",
  },
  {
    key: "sla.opportunity_stale_days",
    label: "โอกาสขายไม่มีความเคลื่อนไหว",
    group: "sla",
    kind: "pair",
    unit: "วัน",
    names: ["แจ้งผู้รับผิดชอบเมื่อครบ", "แจ้งผู้จัดการสาขาเมื่อครบ"],
    min: 1,
    max: 365,
    effect: "ขั้นแรกเตือนผู้รับผิดชอบ ขั้นที่สองยกระดับขึ้นไปหาผู้จัดการสาขา",
    enforcedAt: "app.job_notifications (0013_jobs.sql) รอบถัดไป",
    live: "live",
  },
  {
    key: "escalation.overdue_hours",
    label: "งานเกินกำหนดแล้วส่งต่อ",
    group: "sla",
    kind: "pair",
    unit: "ชั่วโมง",
    names: ["แจ้งหัวหน้าทีมเมื่อเกิน", "แจ้งผู้จัดการสาขาเมื่อเกิน"],
    min: 1,
    max: 720,
    effect: "งานที่เลยกำหนดจะถูกส่งต่อขึ้นไปสองขั้นตามเวลานี้",
    enforcedAt: "app.job_notifications (0013_jobs.sql) รอบถัดไป",
    live: "live",
  },

  /* ------------------------------------------------------------ คุณภาพข้อมูล */
  {
    key: "dq.lead_without_outcome_days",
    label: "Lead ค้างไม่มีผลเมื่อเกิน",
    group: "quality",
    kind: "int",
    unit: "วัน",
    min: 1,
    max: 365,
    effect: "ลดค่านี้ = รายการในศูนย์คุณภาพข้อมูล (12) เพิ่มขึ้นทันทีที่โหลดหน้าใหม่ · เพิ่มค่า = ลดลง",
    enforcedAt: "analytics.v_data_quality (0012_analytics.sql) → api.list_data_quality_issues",
    live: "live",
  },
  {
    key: "dq.won_without_txn_days",
    label: "ปิดการขายแล้วไม่มีเลขธุรกรรมเมื่อเกิน",
    group: "quality",
    kind: "int",
    unit: "วัน",
    min: 1,
    max: 365,
    effect: "เกณฑ์วันที่ทำให้ดีลที่ปิดแล้วแต่ยังไม่ผูกเลขธุรกรรมขึ้นในศูนย์คุณภาพข้อมูล (12)",
    enforcedAt: "analytics.v_data_quality (0012_analytics.sql) → api.list_data_quality_issues",
    live: "live",
  },
  {
    key: "dq.visit_unrecorded_days",
    label: "ช่วงย้อนหลังของ “ไม่ได้บันทึกผลการให้บริการ”",
    group: "quality",
    kind: "int",
    unit: "วัน",
    min: 1,
    max: 365,
    effect: "กำหนดว่าย้อนดูปัญหานี้กี่วัน — กว้างขึ้นแล้วรายการและตัวนับในศูนย์คุณภาพข้อมูลเพิ่มขึ้นทันที",
    enforcedAt: "analytics.v_data_quality (0012_analytics.sql) → api.list_data_quality_issues",
    live: "live",
  },

  /* --------------------------------------------------------- ป้ายและเอกสาร */
  {
    key: "badge.new_customer_days",
    label: "ป้าย “ลูกค้าใหม่” นับถึงกี่วัน",
    group: "badge",
    kind: "int",
    unit: "วัน",
    min: 1,
    max: 365,
    effect: "ลูกค้าที่พบครั้งแรกภายในกี่วันจึงยังติดป้าย “ลูกค้าใหม่” บนหน้า Customer 360 (05)",
    enforcedAt: "api.get_customer_360() คืนธงมาให้ · api.get_display_settings() คืนขอบล่างของวันให้หน้าอื่น — หน้าจอไม่ได้นับวันเอง",
    live: "live",
  },
  {
    key: "quotation.valid_days",
    label: "อายุใบเสนอราคา",
    group: "badge",
    kind: "int",
    unit: "วัน",
    min: 1,
    max: 365,
    effect: "ใบเสนอราคาที่ส่งหลังจากนี้ จะใช้ได้ถึง = วันที่ส่ง + ค่านี้",
    enforcedAt: "trigger ของ crm.quotations (0009_business_triggers.sql) ตอนเปลี่ยนเป็น “ส่งแล้ว”",
    live: "live",
    gap: "ใบที่ส่งไปแล้วคงวันหมดอายุเดิม",
  },

  /* ----------------------------------------------------- แจ้งเตือนสรุปประจำวัน */
  {
    key: "notify.duplicate_digest_time",
    label: "เวลาส่งสรุป “ลูกค้าอาจซ้ำ”",
    group: "notify",
    kind: "time",
    effect: "ย้ายเวลาที่ระบบรวบรวมรายชื่อลูกค้าที่อาจซ้ำแล้วส่งให้ผู้ดูแล",
    enforcedAt: "app.job_notifications (0013_jobs.sql) · เวลา Asia/Bangkok",
    live: "live",
  },
  {
    key: "notify.data_missing_time",
    label: "เวลาส่งแจ้ง “ข้อมูลลูกค้าไม่ครบ”",
    group: "notify",
    kind: "time",
    effect: "ย้ายเวลาที่ระบบแจ้งพนักงานว่ายังมีลูกค้าที่ข้อมูลไม่ครบ",
    enforcedAt: "app.job_notifications (0013_jobs.sql) · เวลา Asia/Bangkok",
    live: "live",
  },

  /* --------------------------------------------------------------- ส่งออก */
  {
    key: "export.limits",
    label: "เพดานการส่งออกของแต่ละบทบาท",
    group: "export",
    kind: "limits",
    effect:
      "จำนวนแถวต่อครั้ง · จำนวนครั้งต่อวัน · บทบาทผู้อนุมัติ ของคำขอส่งออก — บทบาทที่ไม่มีผู้อนุมัติ ถ้าขอเกินเพดานจะถูกปฏิเสธทันที",
    enforcedAt: "api.request_export() และ api.decide_export() (0011_api.sql)",
    live: "live",
  },
  {
    key: "export.link_ttl_hours",
    label: "อายุลิงก์ไฟล์ส่งออก",
    group: "export",
    kind: "int",
    unit: "ชั่วโมง",
    min: 1,
    max: 720,
    effect: "ไฟล์ที่พร้อมดาวน์โหลดจะหมดอายุหลังจากนี้ แล้วงานล้างไฟล์จะลบไฟล์ทิ้ง",
    enforcedAt: "api.record_export_download() · app.job_expire_exports (รายชั่วโมง)",
    live: "live",
  },
  {
    key: "export.max_downloads",
    label: "ดาวน์โหลดไฟล์เดิมได้สูงสุด",
    group: "export",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 100,
    effect: "ดาวน์โหลดไฟล์เดียวกันเกินค่านี้แล้วฐานข้อมูลจะปฏิเสธ",
    enforcedAt: "api.record_export_download() (0011_api.sql)",
    live: "live",
  },

  /* ---------------------------------------------------------- ความปลอดภัย */
  {
    key: "security.reveal_per_hour",
    label: "เปิดดูข้อมูลติดต่อฉบับเต็มต่อชั่วโมง",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 1000,
    effect: "ต่อผู้ใช้หนึ่งคน — เกินแล้วฐานข้อมูลปฏิเสธการเปิดเบอร์/อีเมลฉบับเต็ม และบันทึกลงประวัติการใช้งาน",
    enforcedAt: "api.reveal_contact() และ api.reveal_address() ผ่าน app.rate_limit_hit (0011_api.sql)",
    live: "live",
  },
  {
    key: "security.search_per_hour",
    label: "ค้นหาลูกค้าต่อชั่วโมง",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 2000,
    effect: "ต่อผู้ใช้หนึ่งคน — เกินแล้วค้นหาไม่ได้จนกว่าจะขึ้นชั่วโมงใหม่",
    enforcedAt: "api.find_customer_candidates() และ api.search_customers() ผ่าน app.rate_limit_hit (0011_api.sql)",
    live: "live",
  },
  {
    key: "security.search_miss_per_hour",
    label: "ค้นหาไม่พบต่อชั่วโมงก่อนระงับ",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 1000,
    effect: "ค้นไม่พบติดกันเกินค่านี้ = ระงับการค้นหาของผู้ใช้คนนั้น 1 ชั่วโมง (กันการกวาดข้อมูล)",
    enforcedAt: "api.find_customer_candidates() และ api.search_customers() ผ่าน app.rate_limit_block (0011_api.sql)",
    live: "live",
  },
  {
    key: "security.link_per_day",
    label: "ผูกลูกค้าข้ามสาขาต่อวัน",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 1000,
    effect: "เกินค่านี้แล้วระบบแจ้งผู้จัดการ — ใช้จับพฤติกรรมดึงลูกค้าข้ามสาขาผิดปกติ",
    enforcedAt: "api.link_customer_to_branch() ผ่าน app.rate_limit_hit (0011_api.sql)",
    live: "live",
  },
  {
    key: "security.customer_view_per_hour",
    label: "เปิดดูลูกค้าต่อชั่วโมงก่อนแจ้งเตือน",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 5000,
    effect: "เกินแล้ว “แจ้งเตือนอย่างเดียว ไม่บล็อก” — ตั้งต่ำเกินไปจะได้แจ้งเตือนรบกวนทั้งวัน",
    enforcedAt: "api.get_customer_360() ผ่าน app.rate_limit_hit (0011_api.sql)",
    live: "live",
  },
  {
    key: "security.login_ip_per_15min",
    label: "ลองเข้าสู่ระบบต่อ IP ต่อ 15 นาที",
    group: "security",
    kind: "int",
    unit: "ครั้ง",
    min: 1,
    max: 1000,
    effect: "ตั้งใจให้คุมจำนวนครั้งที่ลองเข้าสู่ระบบจาก IP เดียวกัน",
    enforcedAt: "ยังไม่มีใครอ่านค่านี้ — Edge Function อ่านจากตัวแปรสภาพแวดล้อม LOGIN_IP_PER_15MIN แทน",
    live: "pending",
    gap: "แก้ค่านี้แล้วยังไม่มีผล ต้องให้ supabase/functions/_shared/rate-limit.ts อ่าน app.settings ก่อน",
  },

  /* ------------------------------------------------------ เซสชัน · อุปกรณ์ร่วม */
  {
    key: "session.shared_counter_idle_min",
    label: "ล็อกหน้าจออุปกรณ์ร่วมเมื่อไม่มีการใช้งาน",
    group: "session",
    kind: "int",
    unit: "นาที",
    min: 1,
    max: 240,
    effect: "เครื่อง counter ที่ใช้ร่วมกันจะล็อกหน้าจอเมื่อไม่มีการแตะครบเวลานี้ และต้องยืนยันตัวตนใหม่",
    enforcedAt: "api.get_display_settings() → CounterLock ของทุกหน้า (มีผลเมื่อผู้ใช้โหลดหน้าใหม่)",
    live: "live",
  },

  /* ----------------------------------------------------------------- PDPA */
  {
    key: "pdpa.current_notice_version",
    label: "ฉบับประกาศความเป็นส่วนตัวปัจจุบัน",
    group: "pdpa",
    kind: "text",
    effect: "ความยินยอมที่รับหลังจากนี้จะถูกบันทึกว่าอ้างอิงประกาศฉบับนี้ — ของเดิมคงฉบับเดิมไว้เป็นหลักฐาน",
    enforcedAt: "api.quick_capture() และ api.record_consent() (0011_api.sql)",
    live: "live",
    gap: "เปลี่ยนเลขฉบับแล้วต้องมีเนื้อความประกาศฉบับใหม่จริงรองรับ ไม่ใช่เปลี่ยนแต่เลข",
  },
  {
    key: "dsr.anonymize_per_day",
    label: "ทำข้อมูลนิรนามได้สูงสุดต่อวัน",
    group: "pdpa",
    kind: "int",
    unit: "ราย",
    min: 1,
    max: 1000,
    effect: "ต่อผู้ใช้หนึ่งคนต่อวัน — เกินแล้วฐานข้อมูลปฏิเสธ (การลบข้อมูลย้อนกลับไม่ได้ จึงต้องมีเพดาน)",
    enforcedAt: "api.anonymize_customer() ผ่าน app.rate_limit_hit (0011_api.sql)",
    live: "live",
  },

  /* ----------------------------------------------------------- เชิงเทคนิค */
  {
    key: "env",
    label: "สภาพแวดล้อม",
    group: "technical",
    kind: "env",
    effect:
      "ไม่ใช่ prod → ตัวเลขทุกหน้าใช้ “นาฬิกาอ้างอิง” ข้างล่างแทนเวลาจริง · prod → ใช้เวลาปัจจุบันเสมอ ไม่ว่านาฬิกาอ้างอิงจะตั้งไว้เท่าไร",
    enforcedAt: "app.clock() (0001_foundation.sql) ซึ่ง KPI รายงาน และ SLA ทุกตัวเรียกใช้",
    live: "live",
  },
  {
    key: "clock",
    label: "นาฬิกาอ้างอิงของรายงาน",
    group: "technical",
    kind: "clock",
    effect: "เลื่อน “วันนี้” ของทั้งระบบ — KPI ช่วงเวลา ป้ายเกินกำหนด และเกณฑ์วันทุกตัวขยับตาม (ใช้เมื่อสภาพแวดล้อมไม่ใช่ prod)",
    enforcedAt: "app.clock() (0001_foundation.sql)",
    live: "live",
    gap: "prod ต้องเป็น “เวลาจริง” เสมอ (ข้อ 1.2)",
  },
  {
    key: "allowed_sso_domains",
    label: "โดเมนที่อนุญาตให้ใช้ SSO",
    group: "technical",
    kind: "domains",
    effect: "ตั้งใจให้จำกัดว่าบัญชีอีเมลโดเมนไหนเข้าสู่ระบบด้วย SSO ได้",
    enforcedAt: "ยังไม่มีใครอ่านค่านี้ — ระบบเข้าสู่ระบบปัจจุบันใช้รหัสพนักงาน/อีเมล + รหัสผ่าน ไม่มี SSO",
    live: "pending",
    gap: "แก้ค่านี้แล้วยังไม่มีผล จนกว่าจะเปิดใช้ SSO (ข้อ 9.2.1)",
  },
];

const BY_KEY = new Map(CATALOG.map((s) => [s.key, s]));

/** หาคำอธิบายของคีย์ — คีย์ที่ฐานข้อมูลมีแต่แคตตาล็อกยังไม่รู้จัก จะได้ null แล้วหน้าจอแสดงแบบดิบ */
export function specOf(key: string): SettingSpec | null {
  return BY_KEY.get(key) ?? null;
}

export function groupOf(id: GroupId): GroupSpec | null {
  return GROUPS.find((g) => g.id === id) ?? null;
}

export const LIVE_LABEL: Record<LiveState, string> = {
  live: "มีผลจริง",
  partial: "มีผลบางส่วน",
  pending: "ยังไม่มีผล",
};

export const LIVE_BADGE: Record<LiveState, string> = {
  live: "badge--success",
  partial: "badge--warning",
  pending: "badge--neutral",
};
