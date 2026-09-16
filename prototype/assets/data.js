/* ============================================================================
   JAUN CRM · Customer 360 — prototype/assets/data.js
   window.JCRM_DATA = ข้อมูลตัวอย่างของ prototype

   กติกา (CANONICAL ข้อ 13.0 ข้อ 10 · ข้อ 14.1)
     · เก็บเฉพาะตัวเลขที่พิมพ์ใน CANONICAL และรายการที่ระบุชื่อ — ไม่มีข้อมูลเติม (filler)
     · key เป็นภาษาอังกฤษ camelCase · ค่าเป็นรหัสตาม CANONICAL · ป้ายไทยตรงตัวอักษร
     · ค่าที่ CANONICAL ไม่มี = null (หน้าจอแสดง "–")
     · เวลาทั้งหมดเป็น ISO มี +07:00 (ข้อ 1.2) · เงินเป็นตัวเลขบาท (ไม่มีสัญลักษณ์)
     · ค่าเต็มของช่องทางติดต่ออยู่ในไฟล์นี้เพราะ prototype ไม่มีเซิร์ฟเวอร์ ระบบจริงได้ค่าเต็มทาง
       api.reveal_contact เท่านั้น (ข้อ 6.4) — หน้าจอต้องแสดงค่าปิดบังเสมอจนกว่าจะกดเปิดดู
   ตรวจความถูกต้อง: node tools/check-prototype.mjs
   ========================================================================= */
(function () {
  "use strict";
  var D = {};

  /* -------------------------------------------------------------------------
     1. META · ช่วงเวลา (ข้อ 1.2 · 12.0 · 13)
     ---------------------------------------------------------------------- */
  D.meta = {
    system: "JAUN CRM · Customer 360",
    canonicalVersion: "v2.2",
    documentDate: "16 ก.ย. 2569",
    now: "2026-09-11T10:24:00+07:00",
    storageKey: "jcrm.staff",
    aalStorageKey: "jcrm.aal",
    loginIdStorageKey: "jcrm.login_id",
    branchSessionKey: "jcrm.branch",
    revealSessionKey: "jcrm.reveals",
    /* Logout ล้าง storage ยกเว้น device_id และค่าที่ "จดจำ" login_id (ข้อ 9.2 v2.2) */
    logoutKeepKeys: ["device_id", "jcrm.login_id"],
    defaultStaffCode: "ST-0001",
    defaultPreset: "LAST_30_DAYS",
    searchPlaceholder: "ค้นหาชื่อ เบอร์ LINE Customer ID IMEI",
    /* ช่องค้นหากลางซ่อนสำหรับ MARKETING และ SYSTEM_ADMIN (ข้อ 14.3 v2.2) */
    searchHiddenRoles: ["MARKETING", "SYSTEM_ADMIN"],
    /* ตัวเลือกช่วงเวลาอยู่ในหัวหน้า 02 09 12 เท่านั้น (ข้อ 14.3 v2.2) — ตรงกับ screens[].periodPicker */
    periodPickerScreens: ["dashboard", "reports", "data-quality"],
    landing: { SYSTEM_ADMIN: "18-settings.html", other: "02-dashboard.html" },
    periods: {
      LAST_30_DAYS: { start: "2026-08-13", endExclusive: "2026-09-12", labelTh: "30 วันล่าสุด" },
      LAST_30_DAYS_PREVIOUS: { start: "2026-07-14", endExclusive: "2026-08-13", labelTh: "30 วันก่อนหน้าทั้งช่วง" },
      TODAY: { start: "2026-09-11", endExclusive: "2026-09-12", labelTh: "วันนี้" },
      TODAY_PREVIOUS: { start: "2026-09-04", endExclusive: "2026-09-05", untilTime: "10:24", labelTh: "วันเดียวกันสัปดาห์ก่อน ถึงเวลาเดียวกัน" },
      LAST_7_DAYS_WON: { start: "2026-09-05", endExclusive: "2026-09-12", labelTh: "7 วันล่าสุด" }
    },
    presets: [
      { code: "TODAY", labelTh: "วันนี้", rangeTh: "วันนี้", compareTh: "วันเดียวกันสัปดาห์ก่อน ถึงเวลาเดียวกันของ app.clock()", enabled: true },
      { code: "YESTERDAY", labelTh: "เมื่อวาน", rangeTh: "เมื่อวาน", compareTh: "วันเดียวกันสัปดาห์ก่อนเมื่อวาน (ทั้งวัน)", enabled: false },
      { code: "LAST_7_DAYS", labelTh: "7 วันล่าสุด", rangeTh: "7 วันล่าสุด รวมวันนี้", compareTh: "7 วันก่อนหน้าทั้งช่วง", enabled: false },
      { code: "THIS_WEEK", labelTh: "สัปดาห์นี้", rangeTh: "จันทร์–วันนี้ (รอยืนยัน Q18)", compareTh: "ช่วงวันเดียวกันของสัปดาห์ก่อน", enabled: false },
      { code: "LAST_30_DAYS", labelTh: "30 วันล่าสุด", rangeTh: "13 ส.ค. 2569 – 11 ก.ย. 2569", compareTh: "30 วันก่อนหน้าทั้งช่วง (14 ก.ค. 2569 – 12 ส.ค. 2569)", enabled: true, isDefault: true },
      { code: "THIS_MONTH", labelTh: "เดือนนี้", rangeTh: "วันที่ 1–วันนี้", compareTh: "ช่วงวันเดียวกันของเดือนก่อน", enabled: false },
      { code: "LAST_MONTH", labelTh: "เดือนที่แล้ว", rangeTh: "ทั้งเดือน", compareTh: "เดือนก่อนหน้านั้น", enabled: false },
      { code: "THIS_QUARTER", labelTh: "ไตรมาสนี้", rangeTh: "ไตรมาสปฏิทิน ถึงวันนี้ (รอยืนยัน Q18)", compareTh: "ช่วงวันเดียวกันของไตรมาสก่อน", enabled: false },
      { code: "CUSTOM", labelTh: "กำหนดเอง", rangeTh: "≤ 366 วัน", compareTh: "ช่วงยาวเท่ากันที่จบก่อน p_start", enabled: false }
    ],
    texts: {
      presetDisabled: "ไม่มีข้อมูลตัวอย่างสำหรับช่วงนี้",
      openPeriod: "ช่วงปัจจุบันรวมวันนี้ที่ยังไม่จบ",
      funnelPeriodBased: "Funnel นับแบบตามช่วงเวลา (period-based) ไม่ใช่ cohort — แต่ละขั้นนับจากวันที่เหตุการณ์ของขั้นนั้นเกิดในช่วงเวลา Sale ในช่วงนี้อาจมาจาก Lead ของช่วงก่อน อัตราระหว่างขั้นจึงเป็นอัตรากิจกรรม",
      contactRevealedToast: "บันทึกการเปิดดูแล้ว (CONTACT_REVEALED)",
      noPermissionTitle: "ไม่มีสิทธิ์เข้าหน้านี้",
      desktopOnly: "กรุณาใช้งานบนคอมพิวเตอร์",
      customerPrefix: "คุณ",
      noteWarning: "ห้ามบันทึกเลขบัตรประชาชน รายได้ ข้อมูลสุขภาพหรือศาสนา",
      documentsTab: "เอกสารอยู่ในระบบสัญญา",
      duplicatePanelTitle: "พบข้อมูลที่อาจเป็นลูกค้าคนเดียวกัน N รายการ",
      duplicateCreateAnyway: "ยังต้องการสร้างลูกค้าใหม่",
      ssoInvitedOnly: "เฉพาะบัญชีที่ได้รับเชิญ",
      showingRange: "แสดง 1–N จาก {ยอดรวม}",
      /* ข้อความมาตรฐานของ UI (sitemap-screen-specs ข้อ 1.5 · design-system ข้อ 7.9 7.15) — ไม่ใช่ตัวเลข/รหัสของ CANONICAL */
      reasonOwn: "แก้ได้เฉพาะรายการที่คุณเป็นผู้รับผิดชอบ",
      reasonTeam: "แก้ได้เฉพาะรายการของสมาชิกในทีมคุณ",
      reasonMfa: "ต้องยืนยันตัวตนสองขั้นตอน (MFA) ก่อน",
      reasonOutOfBranch: "รายการนี้อยู่นอกสาขาในสิทธิ์ของคุณ",
      reasonStatus: "สถานะนี้แก้ไขไม่ได้",
      reasonLimit: "เกินจำนวนที่กำหนด",
      rpcDenied: "คุณไม่มีสิทธิ์ทำรายการนี้",
      stateEmpty: "ยังไม่มีรายการ",
      stateNoResult: "ไม่พบรายการตามเงื่อนไข",
      stateError: "โหลดข้อมูลไม่สำเร็จ",
      stateNotFound: "ไม่พบข้อมูล หรือคุณไม่มีสิทธิ์ดูรายการนี้",
      stateLocked: "ยังไม่เปิดใช้งานใน Phase นี้",
      stateMfa: "ต้องยืนยันตัวตนสองขั้นตอน (MFA) เพื่อใช้งานส่วนนี้",
      stateLoading: "กำลังโหลด…",
      stateSampleShowing: "ข้อมูลตัวอย่างมีเฉพาะรายการที่ระบุชื่อ · แสดง {k} จาก {N} รายการ",
      stateSampleNone: "ไม่มีข้อมูลตัวอย่างสำหรับ{ขอบเขต}",
      teamScopeNull: "ตัวเลขนี้ไม่ผูกกับพนักงาน จึงไม่แสดงสำหรับขอบเขตทีม",
      contactNoPermission: "บทบาทของคุณดูได้เฉพาะค่าที่ปิดบัง",
      contactLogged: "การเปิดดู โทร หรือคัดลอก จะถูกบันทึกในประวัติการเข้าถึง",
      revealLimitToast: "เปิดดูข้อมูลติดต่อเกินจำนวนที่กำหนดต่อชั่วโมง",
      irreversibleAck: "ฉันเข้าใจว่าย้อนกลับไม่ได้",
      tableToggleOn: "ดูเป็นตาราง",
      tableToggleOff: "ดูเป็นกราฟ",
      discardTitle: "ยกเลิกการแก้ไข?",
      discardConfirm: "ยกเลิกการแก้ไข",
      discardBack: "กลับไปแก้ไข",
      formSummary: "กรุณาแก้ไข {N} ช่อง",
      thaiIdRejected: "ข้อความมีเลขที่อาจเป็นเลขบัตรประชาชน ระบบไม่อนุญาตให้บันทึก"
    }
  };

  /* -------------------------------------------------------------------------
     2. องค์กร · หน่วยธุรกิจ · สาขา · ทีม (ข้อ 2 · 13.5)
     ---------------------------------------------------------------------- */
  D.organization = { code: "JAUN", type: "organization", name: "JAUN" };
  D.businessUnits = [
    { code: "JAUNPHONE", type: "business_unit", name: "JAUN PHONE" },
    { code: "JPM", type: "business_unit", name: "JAUN POWER MONEY", note: "V1 เชื่อมผ่าน transaction ref เท่านั้น · รอยืนยัน Q17 นิติบุคคลเดียวกันหรือไม่" }
  ];
  D.branchTypes = ["store", "online_team"];
  D.branches = [
    { code: "JP1", name: "JAUNPHONE 1", type: "store", businessUnit: "JAUNPHONE" },
    { code: "JP2", name: "JAUNPHONE 2", type: "store", businessUnit: "JAUNPHONE" },
    { code: "JP3", name: "JAUNPHONE 3", type: "store", businessUnit: "JAUNPHONE" },
    { code: "JP4", name: "JAUNPHONE 4", type: "store", businessUnit: "JAUNPHONE" },
    { code: "JPON", name: "ทีมออนไลน์ส่วนกลาง", type: "online_team", businessUnit: "JAUNPHONE", note: "รอยืนยัน Q3 · ไม่มีรายการใน P (แถวศูนย์ทั้งแถวไม่แสดง)" }
  ];
  /* ชื่อทีมตามข้อ 2 (v2.2 พิมพ์ครบทั้ง 5 ทีม) */
  D.teams = [
    { code: "JP1-SALES", name: "ทีมขาย JAUNPHONE 1", branch: "JP1" },
    { code: "JP2-SALES", name: "ทีมขาย JAUNPHONE 2", branch: "JP2" },
    { code: "JP3-SALES", name: "ทีมขาย JAUNPHONE 3", branch: "JP3" },
    { code: "JP4-SALES", name: "ทีมขาย JAUNPHONE 4", branch: "JP4" },
    { code: "JPON-ADMIN", name: "ทีมแอดมินออนไลน์", branch: "JPON" }
  ];
  D.teamMembers = [
    { team: "JP1-SALES", staff: "ST-0030", isLeader: true },
    { team: "JP1-SALES", staff: "ST-0045", isLeader: false },
    { team: "JP1-SALES", staff: "ST-0046", isLeader: false },
    { team: "JPON-ADMIN", staff: "ST-0050", isLeader: false }
  ];

  /* -------------------------------------------------------------------------
     3. บทบาท (ข้อ 7)
     ---------------------------------------------------------------------- */
  D.roles = [
    { code: "STAFF", abbr: "ST", labelTh: "พนักงานขาย/แอดมิน", rank: 10, who: "พนักงานหน้าร้าน · แอดมินออนไลน์", requiresMfa: false, isBranchRole: true },
    { code: "SUPERVISOR", abbr: "SV", labelTh: "หัวหน้าทีม", rank: 20, who: "หัวหน้าทีมขาย/หัวหน้าแอดมิน", requiresMfa: true, isBranchRole: true },
    { code: "BRANCH_MANAGER", abbr: "BM", labelTh: "ผู้จัดการสาขา", rank: 30, who: "ผู้จัดการร้าน", requiresMfa: true, isBranchRole: true },
    { code: "MARKETING", abbr: "MK", labelTh: "ฝ่ายการตลาด", rank: 30, who: "ทีมการตลาด", requiresMfa: true, isBranchRole: false },
    { code: "OPERATIONS", abbr: "OP", labelTh: "ฝ่ายปฏิบัติการ", rank: 40, who: "ดูแลหลายสาขา (อ่านอย่างเดียว)", requiresMfa: true, isBranchRole: true },
    { code: "BUSINESS_ADMIN", abbr: "BA", labelTh: "ผู้ดูแลข้อมูลธุรกิจ", rank: 50, who: "master data · ผู้ใช้ · คุณภาพข้อมูล · PDPA", requiresMfa: true, isBranchRole: false },
    { code: "EXECUTIVE", abbr: "EX", labelTh: "ผู้บริหาร", rank: 60, who: "ผู้บริหารระดับองค์กร", requiresMfa: true, isBranchRole: false },
    { code: "SYSTEM_ADMIN", abbr: "SA", labelTh: "ผู้ดูแลระบบ (IT)", rank: null, who: "ดูแลระบบ · integration", requiresMfa: true, isBranchRole: false }
  ];
  D.roleGrantRules = [
    { actor: "BRANCH_MANAGER", can: ["STAFF", "SUPERVISOR"], scopeTh: "เฉพาะสาขาที่ตนเป็นผู้จัดการ (ระบบล็อก)" },
    { actor: "BUSINESS_ADMIN", can: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "MARKETING", "OPERATIONS"], scopeTh: "ทุกสาขา" },
    { actor: "SYSTEM_ADMIN", requestOnly: ["SYSTEM_ADMIN", "EXECUTIVE", "BUSINESS_ADMIN"], scopeTh: "ยื่นคำขอผ่าน api.request_role_grant" },
    { actor: "EXECUTIVE", decides: true, scopeTh: "อนุมัติ/ปฏิเสธคำขอด้วย api.decide_role_grant (aal2)" }
  ];

  /* -------------------------------------------------------------------------
     4. สิทธิ์ × ขอบเขต (ข้อ 8.0 · 8.1)
     รูปแบบผลลัพธ์: D.permissions[permission][ROLE] = { scope, aal2, note? }
     แหล่ง: ตาราง 8.1 คอลัมน์ ST SV BM OP MK EX BA SA · "!" = G🔐 เฉพาะช่อง · "S1" = S¹
     ---------------------------------------------------------------------- */
  D.scopeCodes = { O: "OWN", T: "TEAM", B: "BRANCH", G: "ORGANIZATION", S: "SYSTEM" };
  D.scopeOrder = ["OWN", "TEAM", "BRANCH", "ORGANIZATION", "SYSTEM"];
  D.scopeLabels = { OWN: "ของตนเอง", TEAM: "ทีมที่ตนเป็นหัวหน้า", BRANCH: "สาขา", ORGANIZATION: "ทั้งองค์กร", SYSTEM: "วัตถุระบบเท่านั้น" };
  D.permissionColumns = ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "MARKETING", "EXECUTIVE", "BUSINESS_ADMIN", "SYSTEM_ADMIN"];
  var MATRIX = [
    ["customer.read", "ดูลูกค้า/Customer 360", 0, "B B B B – G G –"],
    ["customer.create", "สร้างลูกค้า (ผ่าน quick_capture)", 0, "B B B – – – G –"],
    ["customer.update", "แก้ข้อมูลลูกค้า/ช่องทางติดต่อ/tag", 0, "O T B – – – G –"],
    ["customer.assign", "เปลี่ยนผู้ดูแลลูกค้า", 0, "– T B – – – G –"],
    ["customer.merge", "รวมลูกค้าซ้ำ/ยืนยันคนละคน", 1, "– T B – – – G –"],
    ["customer.pii.reveal", "เปิดค่าเต็มของช่องทางติดต่อ (บันทึกทุกครั้ง)", 0, "B B B – – G! G! –"],
    ["customer.export", "ส่งออกข้อมูลลูกค้า (ข้อ 8.2)", 1, "– – B – G G G –"],
    ["customer.consent.manage", "บันทึกความยินยอม (append-only)", 0, "B B B – – – G –"],
    ["customer.anonymize", "ทำข้อมูลนิรนาม (ข้อ 10.4)", 1, "– – – – – – G –"],
    ["note.create", "เพิ่มโน้ต", 0, "B B B – – – G –"],
    ["note.update", "แก้โน้ตของตน (24 ชม.)", 0, "O O O – – – G –"],
    ["visit.read", "ดู visit/คิว", 0, "B B B B – G G –"],
    ["visit.create", "รับลูกค้า/เปิด visit", 0, "B B B – – – – –"],
    ["visit.update", "รับคิว/แก้/ปิด visit", 0, "O T B – – – G –"],
    ["interaction.read", "ดูประวัติการติดต่อ", 0, "B B B B – G G –"],
    ["interaction.create", "บันทึกการติดต่อ", 0, "B B B – – – G –"],
    ["interaction.update", "แก้บันทึกการติดต่อ (ภายใน 24 ชม.)", 0, "O T B – – – – –"],
    ["lead.read", "ดู lead", 0, "B B B B – G G –"],
    ["lead.create", "สร้าง lead", 0, "B B B – – – G –"],
    ["lead.update", "แก้/เปลี่ยนสถานะ/ปิด lead (แปลงต้องมี opportunity.create ด้วย)", 0, "O T B – – – G –"],
    ["lead.assign", "มอบ/เปลี่ยนผู้รับผิดชอบ lead", 0, "– T B – – – G –"],
    ["lead.reopen", "เปิด lead ที่ปิดแล้ว", 0, "– – B – – – G –"],
    ["opportunity.read", "ดูโอกาสขาย/Pipeline", 0, "B B B B – G G –"],
    ["opportunity.create", "สร้างโอกาสขาย", 0, "B B B – – – – –"],
    ["opportunity.update", "แก้/เลื่อนขั้น", 0, "O T B – – – G –"],
    ["opportunity.assign", "เปลี่ยนผู้รับผิดชอบ", 0, "– T B – – – G –"],
    ["opportunity.close", "ปิด WON/LOST", 0, "O T B – – – G –"],
    ["opportunity.reopen", "เปิดรายการที่ปิดแล้ว", 0, "– – B – – – G –"],
    ["quotation.read", "ดูใบเสนอราคา", 0, "B B B B – G G –"],
    ["quotation.create", "สร้างใบเสนอราคา (ประเมินกับ opportunity แม่)", 0, "O T B – – – – –"],
    ["quotation.update", "แก้ DRAFT · ส่ง · เปลี่ยนสถานะ", 0, "O T B – – – – –"],
    ["task.read", "ดูงาน (ไม่มี read-through ผ่านลูกค้า)", 0, "O T B B – G G –"],
    ["task.create", "สร้างงาน", 0, "O T B – – – G –"],
    ["task.update", "แก้/ปิดงาน", 0, "O T B – – – G –"],
    ["task.assign", "มอบงานให้คนอื่น", 0, "– T B – – – G –"],
    ["transaction.read", "ดูประวัติธุรกรรม", 0, "B B B B – G G –"],
    ["transaction.link", "ผูกเลขธุรกรรม (ด้วยมือ V1)", 0, "O T B – – – G –"],
    ["tag.manage", "สร้าง/แก้ tag", 0, "– – – – G – G –"],
    ["campaign.read", "ดูแคมเปญ", 0, "– – B B G G G –"],
    ["campaign.manage", "จัดการแคมเปญ", 0, "– – – – G – G –"],
    ["dashboard.view", "ดู Dashboard (ตัวเลขรวม)", 0, "O T B B G G G –"],
    ["report.view", "ดูรายงาน (ตัวเลขรวม ไม่มี PII)", 0, "– T B B G G G –"],
    ["report.staff_performance", "ดูผลงานรายพนักงาน", 0, "– T B B – G G –"],
    ["report.export", "ส่งออกรายงานตัวเลขรวม (ไม่มี PII)", 0, "– T B B G G G –"],
    ["data_quality.view", "ดูศูนย์คุณภาพข้อมูล", 0, "O T B B – G G –"],
    ["data_quality.resolve", "แก้รายการคุณภาพข้อมูล (ยกเว้นข้อมูลซ้ำ ใช้ customer.merge)", 0, "O T B – – – G –"],
    ["dsr.create", "รับคำขอเจ้าของข้อมูลที่หน้าร้าน", 0, "B B B – – – G –"],
    ["dsr.manage", "ดำเนินการคำขอเจ้าของข้อมูล", 1, "– – – – – – G –"],
    ["master_data.manage", "จัดการ Master Data", 1, "– – – – – – G –"],
    ["team.manage", "จัดการทีม/สมาชิกทีม", 0, "– – B – – – G –"],
    ["user.read", "ดูรายชื่อผู้ใช้", 0, "– T B B – G G S"],
    ["user.invite", "เชิญผู้ใช้", 0, "– – B – – – G S1"],
    ["user.update", "แก้โปรไฟล์ผู้ใช้", 0, "– – B – – – G S1"],
    ["user.disable", "ปิดใช้งานผู้ใช้", 1, "– – B – – – G S1"],
    ["role.assign", "มอบ/ถอนบทบาท (ข้อ 7.2)", 1, "– – B – – – G –"],
    ["role.request", "ยื่นคำขอบทบาทสูง", 0, "– – – – – – – S"],
    ["role.decide", "อนุมัติคำขอบทบาทสูง", 1, "– – – – – G – –"],
    ["export.approve", "อนุมัติคำขอส่งออก (ตามข้อ 8.2)", 1, "– – – – – G G –"],
    ["audit.read", "ค้น audit log ธุรกิจ (ค่าปิดบัง)", 0, "– – – – – G G –"],
    ["security_log.read", "ดู log เข้าสู่ระบบ/สิทธิ์", 0, "– – – – – G G S"],
    ["settings.business", "ตั้งค่าเกณฑ์ธุรกิจ/ความปลอดภัย (ข้อ 11.2)", 1, "– – – – – – G –"],
    ["settings.system", "ตั้งค่าเชิงเทคนิค", 1, "– – – – – – – S"],
    ["integration.manage", "จัดการ integration (ส่งข้อมูลออกนอกระบบต้องให้ EX อนุมัติ)", 1, "– – – – – – – S"]
  ];
  D.permissionFootnotes = {
    S1: "SYSTEM_ADMIN: เชิญได้เฉพาะบัญชีสาย SYSTEM_ADMIN (ต้องผ่านคำขอ) · แก้/ปิดใช้งานได้เฉพาะบัญชีที่ไม่มีบทบาทธุรกิจ",
    dataQualityOwn: "data_quality.resolve ระดับ O ใช้ได้เฉพาะ MISSING_PHONE INVALID_PHONE INCOMPLETE_CUSTOMER ของลูกค้าที่ตนดูแล",
    pageNotes: "BUSINESS_ADMIN ใช้หน้า Quick Capture ได้เฉพาะ \"เพิ่มลูกค้า\" (ไม่มีปุ่มรับลูกค้า) · EXECUTIVE เปิดหน้า users เพื่อดูและอนุมัติคำขอบทบาทเท่านั้น · MARKETING เปิดหน้า master-data เฉพาะแท็บ Tag และแคมเปญ"
  };
  D.permissions = {};
  D.permissionMeta = {};
  MATRIX.forEach(function (row) {
    var cells = row[3].split(" ");
    var perRole = {};
    D.permissionColumns.forEach(function (role, i) {
      var c = cells[i];
      if (!c || c === "–") { return; }
      var cell = { scope: D.scopeCodes[c.charAt(0)], aal2: row[2] === 1 || c.indexOf("!") !== -1 };
      if (c === "S1") { cell.note = D.permissionFootnotes.S1; }
      perRole[role] = cell;
    });
    D.permissions[row[0]] = perRole;
    D.permissionMeta[row[0]] = { labelTh: row[1], requiresAal2Row: row[2] === 1 };
  });

  /* -------------------------------------------------------------------------
     5. หน้าจอ (ข้อ 14.1) · เมนู (ข้อ 14.2) · มือถือ (ข้อ 14.4)
     roles = รหัสบทบาทเต็มตามลำดับในตาราง 14.1 (ต้องตรงกับ <body data-roles>)
     ---------------------------------------------------------------------- */
  D.screens = [
    { no: "01", id: "login", file: "01-login.html", title: "เข้าสู่ระบบ", group: null, groupNote: "–", roles: [], roleNote: "(ก่อนเข้าสู่ระบบ)", mockup: "A01", phase: "1", icon: "login", isPublic: true },
    { no: "02", id: "dashboard", file: "02-dashboard.html", title: "หน้าหลัก", group: "หน้าหลัก", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "MARKETING", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A02 · B", phase: "1 พื้นฐาน / 3 เต็ม", icon: "home", periodPicker: true },
    { no: "03", id: "customers", file: "03-customers.html", title: "ลูกค้า", group: "ลูกค้า", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A03", phase: "1", icon: "users" },
    { no: "04", id: "quick-capture", file: "04-quick-capture.html", title: "เพิ่มลูกค้า", group: "ลูกค้า", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "BUSINESS_ADMIN"], roleNote: "BUSINESS_ADMIN ใช้ได้เฉพาะ \"เพิ่มลูกค้า\" (ไม่มีปุ่มรับลูกค้า)", mockup: "A04 · B มือถือ", phase: "1", icon: "userPlus" },
    { no: "05", id: "customer-360", file: "05-customer-360.html", title: "ข้อมูลลูกค้า (Customer 360)", group: null, groupNote: "(เปิดจากรายการ)", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A05 · B แท็บเล็ต", phase: "1", icon: "idCard" },
    { no: "06", id: "pipeline", file: "06-pipeline.html", title: "โอกาสการขาย", group: "การขาย", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A06", phase: "2", icon: "kanban", multiBranchDefault: "JP1" },
    { no: "07", id: "reception", file: "07-reception.html", title: "รับลูกค้าเข้าร้าน", group: "ลูกค้าเข้าร้าน", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS"], mockup: "A07", phase: "1", icon: "store", multiBranchDefault: "JP1" },
    { no: "08", id: "tasks", file: "08-tasks.html", title: "งานที่ต้องติดตาม", group: "ติดตามงาน", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A08", phase: "2", icon: "check", multiBranchDefault: "JP1" },
    { no: "09", id: "reports", file: "09-reports.html", title: "รายงาน", group: "รายงาน", roles: ["SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "MARKETING", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "A09", phase: "3", icon: "chart", desktopOnly: true, periodPicker: true },
    { no: "10", id: "mobile", file: "10-mobile.html", title: "ตัวอย่างหน้าจอมือถือ", group: null, groupNote: "(ลิงก์จาก index)", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER"], mockup: "A10", phase: "1", icon: "phone" },
    { no: "11", id: "leads", file: "11-leads.html", title: "Leads", group: "การขาย", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "–", phase: "2", icon: "target", multiBranchDefault: "JP1" },
    { no: "12", id: "data-quality", file: "12-data-quality.html", title: "ศูนย์คุณภาพข้อมูล", group: "รายงาน", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "–", phase: "1 / 2", icon: "shield", multiBranchDefault: "JP1", periodPicker: true },
    { no: "13", id: "users", file: "13-users.html", title: "ผู้ใช้งานและสิทธิ์", group: "ตั้งค่าระบบ", roles: ["SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN", "SYSTEM_ADMIN"], roleNote: "EXECUTIVE ดูและอนุมัติคำขอบทบาทเท่านั้น", mockup: "–", phase: "1", icon: "key", desktopOnly: true },
    { no: "14", id: "master-data", file: "14-master-data.html", title: "Master Data", group: "ตั้งค่าระบบ", roles: ["MARKETING", "BUSINESS_ADMIN"], roleNote: "MARKETING (แท็บ Tag · แคมเปญ)", mockup: "–", phase: "1", icon: "list", desktopOnly: true },
    { no: "15", id: "exports", file: "15-exports.html", title: "คำขอส่งออกข้อมูล", group: "ตั้งค่าระบบ", roles: ["BRANCH_MANAGER", "MARKETING", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "–", phase: "3", icon: "download", desktopOnly: true },
    { no: "16", id: "audit", file: "16-audit.html", title: "ประวัติการใช้งาน", group: "ตั้งค่าระบบ", roles: ["EXECUTIVE", "BUSINESS_ADMIN", "SYSTEM_ADMIN"], roleNote: "SA: security log", mockup: "–", phase: "1", icon: "history", desktopOnly: true },
    { no: "17", id: "privacy", file: "17-privacy.html", title: "PDPA: ความยินยอม · คำขอเจ้าของข้อมูล", group: "ตั้งค่าระบบ", roles: ["BUSINESS_ADMIN"], mockup: "–", phase: "1", icon: "lock", desktopOnly: true },
    { no: "18", id: "settings", file: "18-settings.html", title: "ตั้งค่าระบบ · Integration", group: "ตั้งค่าระบบ", roles: ["BUSINESS_ADMIN", "SYSTEM_ADMIN"], roleNote: "BUSINESS_ADMIN (เกณฑ์ธุรกิจ) · SYSTEM_ADMIN (เชิงเทคนิค)", mockup: "–", phase: "1", icon: "gear", desktopOnly: true },
    { no: "19", id: "quotations", file: "19-quotations.html", title: "ใบเสนอราคา", group: "การขาย", roles: ["STAFF", "SUPERVISOR", "BRANCH_MANAGER", "OPERATIONS", "EXECUTIVE", "BUSINESS_ADMIN"], mockup: "–", phase: "2", icon: "file" }
  ];
  D.menuGroups = [
    { key: "home", label: "หน้าหลัก", icon: "home", screens: ["dashboard"], fromA18: "Dashboard" },
    { key: "customer", label: "ลูกค้า", icon: "users", screens: ["customers", "quick-capture"], fromA18: "Customers" },
    { key: "visit", label: "ลูกค้าเข้าร้าน", icon: "store", screens: ["reception"], fromA18: "Visitors" },
    { key: "sales", label: "การขาย", icon: "kanban", screens: ["leads", "pipeline", "quotations"], fromA18: "Leads · Opportunities (มุมมองรายการในหน้า pipeline) · Pipeline · Quotations" },
    { key: "activity", label: "ติดตามงาน", icon: "check", screens: ["tasks"], fromA18: "Tasks · Follow-ups (ตัวกรองประเภท) · Calendar (มุมมองปฏิทินในหน้า tasks · Phase 2 รอยืนยัน)" },
    { key: "analytics", label: "รายงาน", icon: "chart", screens: ["reports", "data-quality"], fromA18: "Reports · Branch Performance (แท็บสาขา) · Staff Performance (แท็บพนักงาน) · Data Quality" },
    { key: "admin", label: "ตั้งค่าระบบ", icon: "gear", screens: ["users", "master-data", "exports", "audit", "privacy", "settings"], fromA18: "Master Data · Sources (แท็บใน master-data) · Users & Permissions · Audit Logs · Settings" }
  ];
  D.menuHiddenInV1 = [
    { label: "Customer Segments", phase: "5" },
    { label: "Campaigns", phase: "4", note: "D35 กลุ่ม \"การตลาด\" ของ mockup A ซ่อนใน V1" }
  ];
  D.mobileNav = [
    { key: "home", label: "หน้าแรก", screen: "dashboard", icon: "home" },
    { key: "customers", label: "ลูกค้า", screen: "customers", icon: "users" },
    { key: "receive", label: "รับลูกค้า", screen: "quick-capture", query: "?mode=visit", icon: "plus", center: true, requires: ["customer.create", "visit.create"] },
    { key: "tasks", label: "งาน", screen: "tasks", icon: "check" },
    { key: "more", label: "เพิ่มเติม", sheet: true, icon: "more" }
  ];
  D.mobileMoreSheet = [
    { label: "โอกาสการขาย", screen: "pipeline", icon: "kanban" },
    { label: "Leads", screen: "leads", icon: "target" },
    { label: "ศูนย์คุณภาพข้อมูล", screen: "data-quality", icon: "shield" },
    { label: "ออกจากระบบ", action: "logout", icon: "logout" }
  ];
  /* FAB ซ่อนบนหน้า 04 และ 07 (design-system ข้อ 7.22) */
  D.tabletFab = { label: "+ รับลูกค้า", screen: "quick-capture", query: "?mode=visit", requires: ["customer.create", "visit.create"], hiddenOn: ["quick-capture", "reception"] };

  /* -------------------------------------------------------------------------
     6. พนักงานตัวอย่าง (ข้อ 13.5) · ผู้ใช้ตัวแทนต่อบทบาท (ข้อ 14.1)
     assignments: branch = null สำหรับบทบาทระดับองค์กร (ข้อ 7.1)
     ---------------------------------------------------------------------- */
  D.staff = [
    { staffCode: "ST-0001", displayName: "จ๋าอั๋น", email: "ja@example.com", status: "ACTIVE", assignments: [{ role: "EXECUTIVE", branch: null }], scopeTh: "องค์กร" },
    { staffCode: "ST-0002", displayName: "คุณแพร", email: "prae@example.com", status: "ACTIVE", assignments: [{ role: "BUSINESS_ADMIN", branch: null }], scopeTh: "องค์กร" },
    { staffCode: "ST-0003", displayName: "คุณต้น", email: "ton@example.com", status: "ACTIVE", assignments: [{ role: "SYSTEM_ADMIN", branch: null }], scopeTh: "–" },
    { staffCode: "ST-0010", displayName: "คุณปุ๊ก", email: "puk@example.com", status: "ACTIVE", assignments: [{ role: "OPERATIONS", branch: "JP1" }, { role: "OPERATIONS", branch: "JP2" }, { role: "OPERATIONS", branch: "JP3" }, { role: "OPERATIONS", branch: "JP4" }], scopeTh: "JP1 · JP2 · JP3 · JP4" },
    { staffCode: "ST-0011", displayName: "คุณมายด์", email: "mind@example.com", status: "ACTIVE", assignments: [{ role: "MARKETING", branch: null }], scopeTh: "องค์กร" },
    { staffCode: "ST-0020", displayName: "คุณเจ", email: "jay@example.com", status: "ACTIVE", assignments: [{ role: "BRANCH_MANAGER", branch: "JP1" }], scopeTh: "JP1" },
    { staffCode: "ST-0021", displayName: "คุณบอส", email: "boss@example.com", status: "ACTIVE", assignments: [{ role: "BRANCH_MANAGER", branch: "JP2" }], scopeTh: "JP2" },
    { staffCode: "ST-0022", displayName: "คุณหนึ่ง", email: "nueng@example.com", status: "ACTIVE", assignments: [{ role: "BRANCH_MANAGER", branch: "JP3" }], scopeTh: "JP3" },
    { staffCode: "ST-0023", displayName: "คุณเบียร์", email: "beer@example.com", status: "ACTIVE", assignments: [{ role: "BRANCH_MANAGER", branch: "JP4" }], scopeTh: "JP4" },
    { staffCode: "ST-0030", displayName: "คุณนัท", email: "nat@example.com", status: "ACTIVE", assignments: [{ role: "SUPERVISOR", branch: "JP1" }], scopeTh: "JP1", teamTh: "JP1-SALES (หัวหน้า)" },
    { staffCode: "ST-0045", displayName: "คุณขวัญ", email: "kwan@example.com", status: "ACTIVE", assignments: [{ role: "STAFF", branch: "JP1" }], scopeTh: "JP1", teamTh: "JP1-SALES" },
    { staffCode: "ST-0046", displayName: "คุณคิม", email: "kim@example.com", status: "ACTIVE", assignments: [{ role: "STAFF", branch: "JP1" }], scopeTh: "JP1", teamTh: "JP1-SALES" },
    { staffCode: "ST-0050", displayName: "คุณฝน", email: "fon@example.com", status: "ACTIVE", assignments: [{ role: "STAFF", branch: "JPON" }], scopeTh: "JPON", teamTh: "JPON-ADMIN (ไม่มีหัวหน้า)", note: "เห็นหน้าว่าง (empty state) ในทุกหน้าที่เป็นรายการ" },
    { staffCode: "ST-0051", displayName: "คุณโอ๊ต", email: "oat@example.com", status: "INVITED", assignments: [], scopeTh: "–", note: "รอคำขอ SYSTEM_ADMIN RG-2026-0003 · INVITED 10 ก.ย. 2569" }
  ];
  D.defaultPersonaByRole = { STAFF: "ST-0045", SUPERVISOR: "ST-0030", BRANCH_MANAGER: "ST-0020", OPERATIONS: "ST-0010", MARKETING: "ST-0011", EXECUTIVE: "ST-0001", BUSINESS_ADMIN: "ST-0002", SYSTEM_ADMIN: "ST-0003" };
  D.alternatePersonas = ["ST-0046", "ST-0021", "ST-0050"];
  D.mfaNote = "ทุกบัญชีตัวอย่างที่ requires_mfa มี TOTP factor ที่ verified แล้ว · prototype ถือว่าเซสชันเป็น aal2 เว้นแต่สลับเป็น aal1 เพื่อทดสอบ (ข้อ 13.5)";

  /* -------------------------------------------------------------------------
     7. สถานะ · ป้าย (ข้อ 3.4 · 3.5 · 4 · 15)
     tone ∈ success | warning | info | danger | neutral | navy (คลาส .badge--{tone})
     ---------------------------------------------------------------------- */
  D.lifecycleStages = [
    { order: 1, code: "REPEAT", labelTh: "ลูกค้าซื้อซ้ำ", tone: "success", rule: "เหตุการณ์การซื้อตลอดอายุ ≥ 2" },
    { order: 2, code: "CUSTOMER", labelTh: "ลูกค้าปัจจุบัน", tone: "success", rule: "เหตุการณ์การซื้อ = 1" },
    { order: 3, code: "OPPORTUNITY", labelTh: "มีโอกาสซื้อ", tone: "warning", rule: "ยังไม่เคยซื้อ · มี opportunity ที่ยังไม่ปิด" },
    { order: 4, code: "LEAD", labelTh: "สนใจซื้อ", tone: "info", rule: "ยังไม่เคยซื้อ · มี lead ที่ยังไม่ปิด" },
    { order: 5, code: "LOST", labelTh: "ไม่สำเร็จ", tone: "danger", rule: "ยังไม่เคยซื้อ · ไม่มีรายการเปิด · มี lead หรือ opportunity ที่ LOST อย่างน้อย 1" },
    { order: 6, code: "IDENTIFIED", labelTh: "รู้จักแล้ว", tone: "neutral", rule: "นอกเหนือจากข้างบน" }
  ];
  /* key = ชื่อภายใน prototype (CANONICAL ไม่มีรหัสของป้ายเสริม) · แสดงตามลำดับ สูงสุด 3 ป้าย เกินแสดง +N */
  D.supplementaryBadges = [
    { order: 1, key: "vip", labelTh: "VIP", tone: "navy", rule: "มี tag VIP", cacheColumn: null },
    { order: 2, key: "followingUp", labelTh: "ติดตามอยู่", tone: "warning", rule: "มี task FOLLOW_UP สถานะ OPEN/IN_PROGRESS", cacheColumn: "has_open_followup" },
    { order: 3, key: "newCustomer", labelTh: "ลูกค้าใหม่", tone: "info", rule: "first_seen_at อยู่ใน 30 วันล่าสุด (badge.new_customer_days)", cacheColumn: null },
    { order: 4, key: "notContacted", labelTh: "ยังไม่ได้ติดต่อ", tone: "danger", rule: "มี lead เปิดอยู่สถานะ NEW", cacheColumn: "has_new_lead" }
  ];
  D.supplementaryBadgeMax = 3;
  /* tone ของป้ายสถานะที่ CANONICAL ไม่กำหนดสี = ข้อเสนอของผู้ออกแบบ (design-system ข้อ 2.5 ข · sitemap-screen-specs หน้า 15 · 17)
     ป้ายไทยทุกค่ามาจาก CANONICAL ข้อ 4 · 4.8 · ป้ายที่ CANONICAL ไม่พิมพ์ = labelTh null (แสดงรหัส) */
  D.visitStatuses = [
    { code: "WAITING", labelTh: "รอรับบริการ", tone: "warning" },
    { code: "IN_SERVICE", labelTh: "กำลังให้บริการ", tone: "info" },
    { code: "COMPLETED", labelTh: "เสร็จสิ้น", tone: "success" },
    { code: "LEFT", labelTh: "ออกก่อนรับบริการ", tone: "neutral" },
    { code: "CANCELLED", labelTh: "ยกเลิก (สร้างผิด)", tone: "neutral" }
  ];
  D.visitOutcomes = [
    { code: "PURCHASED", labelTh: "ซื้อแล้ว", countsAsRecorded: true, isSystem: true },
    { code: "FOLLOW_UP", labelTh: "นัดติดตาม", countsAsRecorded: true, isSystem: true },
    { code: "NOT_YET", labelTh: "ยังไม่ซื้อ", countsAsRecorded: true, isSystem: true },
    { code: "NOT_INTERESTED", labelTh: "ไม่สนใจ", countsAsRecorded: true, isSystem: true },
    { code: "SERVICE_DONE", labelTh: "ให้บริการเสร็จ (ซ่อม/สอบถาม/ชำระ)", countsAsRecorded: true, isSystem: true, pending: "รอยืนยัน" },
    { code: "LEFT_BEFORE_SERVICE", labelTh: "ออกก่อนรับบริการ", countsAsRecorded: true, isSystem: true, pending: "รอยืนยัน" },
    { code: "UNRECORDED", labelTh: "ไม่ได้บันทึกผล (ระบบปิดให้)", countsAsRecorded: false, isSystem: true, pending: "รอยืนยัน" }
  ];
  D.leadStatuses = [
    { code: "NEW", labelTh: "ใหม่", isOpen: true, tone: "danger" },
    { code: "CONTACTED", labelTh: "ติดต่อแล้ว", isOpen: true, tone: "info" },
    { code: "QUALIFIED", labelTh: "คัดกรองแล้ว", isOpen: true, tone: "info" },
    { code: "CONVERTED", labelTh: "แปลงเป็นโอกาสขาย", isOpen: false, tone: "success" },
    { code: "LOST", labelTh: "ไม่สำเร็จ", isOpen: false, tone: "danger" }
  ];
  /* draggable = คอลัมน์ที่อยู่บนกระดาน (ลากได้เฉพาะทิศตาม D.opportunityMoveRules · ข้อ 4.4 v2.2) */
  D.opportunityStages = [
    { code: "INTERESTED", labelTh: "สนใจ", isOpen: true, draggable: true, tone: "info", hasSentQuotationByDefinition: false },
    { code: "QUOTATION", labelTh: "เสนอราคา", isOpen: true, draggable: true, tone: "info", hasSentQuotationByDefinition: true },
    { code: "FOLLOW_UP", labelTh: "รอตัดสินใจ", isOpen: true, draggable: true, tone: "warning", hasSentQuotationByDefinition: true },
    { code: "WON", labelTh: "ปิดการขาย", isOpen: false, draggable: false, tone: "success" },
    { code: "LOST", labelTh: "ไม่สำเร็จ", isOpen: false, draggable: false, noKanbanColumn: true, tone: "danger" }
  ];
  /* การเลื่อนขั้นของ opportunity (ข้อ 4.4 v2.2 · D48 · ข้อ 14.9)
     manual = ทิศที่ผู้ใช้ลาก/เลือก "ย้ายไปขั้น…" ได้ · automatic = ระบบทำเมื่อใบเสนอราคา SENT (ห้ามทำด้วยมือ)
     hasSentQuotationByDefinition (ข้างบน) = นิยามขั้นในตาราง 4.4: สนใจ "ยังไม่เสนอราคา" · เสนอราคา "มี quotation SENT ≥ 1" · รอตัดสินใจ "เสนอแล้ว" */
  D.opportunityMoveRules = {
    manual: [
      { from: "QUOTATION", to: "FOLLOW_UP", requiresSentQuotation: false },
      { from: "INTERESTED", to: "QUOTATION", requiresSentQuotation: true },
      { from: "INTERESTED", to: "FOLLOW_UP", requiresSentQuotation: true }
    ],
    automatic: [
      { from: "INTERESTED", to: "QUOTATION", triggerTh: "quotation ของ opportunity เปลี่ยนเป็น SENT" },
      { from: "FOLLOW_UP", to: "QUOTATION", triggerTh: "มีใบเสนอราคาใบใหม่ SENT" }
    ],
    neverManualTo: ["INTERESTED"],
    closeStages: ["WON", "LOST"],
    closePermission: "opportunity.close",
    movePermission: "opportunity.update",
    /* ข้อความเหตุผล (sitemap-screen-specs ข้อ 9.6 ปรับตาม v2.2) */
    reasonsTh: {
      toInterested: "ย้อนกลับไปขั้นสนใจไม่ได้",
      needSentQuotation: "ต้องส่งใบเสนอราคาก่อน ระบบจะย้ายไปขั้นเสนอราคาให้อัตโนมัติ",
      followUpToQuotation: "ย้ายกลับขั้นเสนอราคาเมื่อส่งใบเสนอราคาใบใหม่",
      toClosed: "ใช้ปุ่ม “ปิดการขาย” หรือ “ไม่สำเร็จ” เพื่อปิดรายการ",
      fromClosed: "รายการที่ปิดแล้วต้องเปิดโอกาสขายอีกครั้งก่อน",
      sameStage: "การ์ดอยู่ในขั้นนี้แล้ว",
      noPermission: "แก้ได้เฉพาะรายการที่คุณเป็นผู้รับผิดชอบ"
    },
    movedToastTh: "ย้าย {ลูกค้า} ไปขั้น{ขั้น}แล้ว"
  };
  D.salesPath = [
    { no: 1, briefLabel: "New", storedAt: "lead", code: "NEW" },
    { no: 2, briefLabel: "Contacted", storedAt: "lead", code: "CONTACTED" },
    { no: 3, briefLabel: "Qualified", storedAt: "lead", code: "QUALIFIED" },
    { no: 4, briefLabel: "Opportunity", storedAt: "opportunity", code: "INTERESTED" },
    { no: 5, briefLabel: "Quotation", storedAt: "opportunity", code: "QUOTATION" },
    { no: 6, briefLabel: "Follow-up", storedAt: "opportunity", code: "FOLLOW_UP" },
    { no: 7, briefLabel: "Won / Lost", storedAt: "opportunity (หรือ lead ที่ปิดก่อนเป็นโอกาสขาย)", code: "WON / LOST" }
  ];
  D.quotationStatuses = [
    { code: "DRAFT", labelTh: "ร่าง", tone: "neutral" }, { code: "SENT", labelTh: "ส่งแล้ว", tone: "info" }, { code: "ACCEPTED", labelTh: "ตอบรับ", tone: "success" },
    { code: "REJECTED", labelTh: "ปฏิเสธ", tone: "danger" }, { code: "EXPIRED", labelTh: "หมดอายุ", tone: "neutral" }
  ];
  D.taskStatuses = [
    { code: "OPEN", labelTh: "เปิด", tone: "info" }, { code: "IN_PROGRESS", labelTh: "กำลังทำ", tone: "info" },
    { code: "DONE", labelTh: "เสร็จ", tone: "success" }, { code: "CANCELLED", labelTh: "ยกเลิก", tone: "neutral" }
  ];
  D.taskTypes = [
    { code: "FOLLOW_UP", labelTh: "ติดตามลูกค้า" }, { code: "CALL", labelTh: "โทรหาลูกค้า" }, { code: "APPOINTMENT", labelTh: "นัดเข้าร้าน" },
    { code: "SEND_QUOTATION", labelTh: "ส่งใบเสนอราคา" }, { code: "DOCUMENT", labelTh: "ตามเอกสาร" }, { code: "OTHER", labelTh: "อื่น ๆ" }
  ];
  D.taskGroups = [
    { key: "today", labelTh: "วันนี้", rule: "OPEN/IN_PROGRESS และ due_at อยู่ในวันนี้ · เลยเวลาแล้วแสดงป้าย \"เลยเวลา\" แต่ยังนับในกลุ่มนี้" },
    { key: "overdue", labelTh: "เกินกำหนด", rule: "OPEN/IN_PROGRESS และ due_at ก่อน 00:00 ของวันนี้" }
  ];
  D.taskTimeBadges = { overdue: { labelTh: "เกินกำหนด", tone: "danger" }, pastDueToday: { labelTh: "เลยเวลา", tone: "warning" } };
  D.priorities = [
    { code: "LOW", labelTh: "ต่ำ", tone: "neutral" }, { code: "NORMAL", labelTh: "ปกติ", tone: "info" },
    { code: "HIGH", labelTh: "สูง", tone: "warning" }, { code: "URGENT", labelTh: "ด่วน", tone: "danger" }
  ];
  D.enums = {
    staffStatus: [{ code: "INVITED", labelTh: "เชิญแล้ว", tone: "warning" }, { code: "ACTIVE", labelTh: "ใช้งาน", tone: "success" }, { code: "DISABLED", labelTh: "ปิดใช้งาน", tone: "neutral" }],
    dataScope: ["OWN", "TEAM", "BRANCH", "ORGANIZATION", "SYSTEM"],
    customerRecordStatus: ["ACTIVE", "MERGED", "ANONYMIZED"],
    interactionDirection: [{ code: "INBOUND", labelTh: "ลูกค้าติดต่อมา" }, { code: "OUTBOUND", labelTh: "พนักงานติดต่อไป" }, { code: "INTERNAL", labelTh: "บันทึกภายใน" }],
    contactType: ["PHONE", "LINE_ID", "LINE_USER_ID", "FACEBOOK", "INSTAGRAM", "TIKTOK", "EMAIL"],
    /* ข้อ 4.8 v2.2 — ป้ายไทยตรงตัวอักษร */
    consentStatus: [{ code: "GRANTED", labelTh: "ยินยอม/แจ้งแล้ว", tone: "success" }, { code: "WITHDRAWN", labelTh: "ถอนแล้ว", tone: "neutral" }],
    consentCaptureVia: [{ code: "STAFF_FORM", labelTh: "พนักงานบันทึก" }, { code: "LINK_SENT", labelTh: "ส่งลิงก์ประกาศ" }, { code: "LINE_OA", labelTh: "ผ่าน LINE OA" }, { code: "WEB", labelTh: "ผ่านเว็บไซต์" }],
    customerLinkVia: ["CREATED", "VISIT", "INTERACTION", "LEAD", "OPPORTUNITY", "MANUAL_LINK", "MERGE"],
    customerLinkViaNote: "transaction ref ใช้ MANUAL_LINK ใน V1",
    duplicateStatus: [{ code: "PENDING", labelTh: "รอตัดสิน", tone: "warning" }, { code: "MERGED", labelTh: "รวมแล้ว", tone: "success" }, { code: "NOT_DUPLICATE", labelTh: "ยืนยันคนละคน", tone: "neutral" }],
    dsrType: [{ code: "ACCESS", labelTh: "ขอดู/ขอสำเนา" }, { code: "CORRECTION", labelTh: "ขอแก้ไข" }, { code: "DELETION", labelTh: "ขอลบ" }, { code: "OBJECTION", labelTh: "คัดค้าน" }, { code: "WITHDRAW_CONSENT", labelTh: "ถอนความยินยอม" }, { code: "PORTABILITY", labelTh: "ขอโอนย้าย" }],
    dsrStatus: [{ code: "RECEIVED", labelTh: "รับคำขอแล้ว", tone: "info" }, { code: "VERIFIED", labelTh: "ยืนยันตัวตนแล้ว", tone: "info" }, { code: "IN_PROGRESS", labelTh: "กำลังดำเนินการ", tone: "warning" }, { code: "COMPLETED", labelTh: "เสร็จสิ้น", tone: "success" }, { code: "REJECTED", labelTh: "ปฏิเสธคำขอ", tone: "danger" }],
    dsrVerificationMethod: [{ code: "IN_PERSON_ID_SIGHTED", labelTh: "เห็นบัตรต่อหน้า" }, { code: "OTP_TO_REGISTERED_CONTACT", labelTh: "รหัส OTP ไปช่องทางที่ลงทะเบียน" }, { code: "OTHER", labelTh: "อื่น ๆ" }],
    interestLevel: [{ code: "HOT", labelTh: "สนใจมาก", tone: "warning" }, { code: "WARM", labelTh: "สนใจ", tone: "info" }, { code: "COLD", labelTh: "สนใจน้อย", tone: "neutral" }],
    exportStatus: [{ code: "REQUESTED", labelTh: "รออนุมัติ", tone: "warning" }, { code: "APPROVED", labelTh: "อนุมัติแล้ว", tone: "info" }, { code: "REJECTED", labelTh: "ไม่อนุมัติ", tone: "danger" }, { code: "GENERATED", labelTh: "พร้อมดาวน์โหลด", tone: "success" }, { code: "DOWNLOADED", labelTh: "ดาวน์โหลดแล้ว", tone: "success" }, { code: "EXPIRED", labelTh: "หมดอายุ", tone: "neutral" }],
    roleGrantStatus: [{ code: "REQUESTED", labelTh: "รออนุมัติ", tone: "warning" }, { code: "APPROVED", labelTh: "อนุมัติแล้ว", tone: "success" }, { code: "REJECTED", labelTh: "ไม่อนุมัติ", tone: "danger" }],
    roleGrantType: [{ code: "GRANT", labelTh: "มอบ" }, { code: "REVOKE", labelTh: "ถอน" }],
    actorType: ["STAFF", "SYSTEM", "INTEGRATION"],
    revealPurpose: ["VIEW", "CALL", "COPY", "LINE_OPEN"],
    customerCreatedVia: ["QUICK_CAPTURE", "IMPORT", "MERGE_SURVIVOR"],
    customerType: ["INDIVIDUAL", "BUSINESS"],
    consentChannels: ["LINE", "SMS", "PHONE", "EMAIL"]
  };

  /* -------------------------------------------------------------------------
     8. Master Data (ข้อ 5)
     ---------------------------------------------------------------------- */
  D.channels = [
    { code: "WALK_IN", labelTh: "Walk-in (หน้าร้าน)", shortLabel: "Walk-in", group: "offline", isLive: true, chart: "--chart-1" },
    { code: "LINE", labelTh: "LINE", shortLabel: "LINE", group: "online", isLive: false, chart: "--chart-2" },
    { code: "FACEBOOK", labelTh: "Facebook", shortLabel: "Facebook", group: "online", isLive: false, chart: "--chart-3" },
    { code: "INSTAGRAM", labelTh: "Instagram", shortLabel: "Instagram", group: "online", isLive: false, chart: "--chart-4" },
    { code: "TIKTOK", labelTh: "TikTok", shortLabel: "TikTok", group: "online", isLive: false, chart: "--chart-5" },
    { code: "PHONE", labelTh: "โทรศัพท์", shortLabel: "โทรศัพท์", group: "offline", isLive: true, chart: "--chart-6" },
    { code: "WEBSITE", labelTh: "เว็บไซต์", shortLabel: "เว็บไซต์", group: "online", isLive: false, chart: "--chart-7" }
  ];
  /* shortLabel "Walk-in" ใช้ตามคอลัมน์ "ช่องทางล่าสุด" ของข้อ 13.8 และ legend ของ mockup */
  D.sources = [
    { code: "FACEBOOK_ADS", labelTh: "โฆษณา Facebook" }, { code: "FACEBOOK_PAGE", labelTh: "เพจ Facebook" }, { code: "TIKTOK", labelTh: "TikTok" },
    { code: "INSTAGRAM", labelTh: "Instagram" }, { code: "LINE_OA", labelTh: "LINE OA" }, { code: "GOOGLE_MAPS", labelTh: "Google Maps" },
    { code: "PASSING_BY", labelTh: "เดินผ่านหน้าร้าน" }, { code: "REFERRAL", labelTh: "เพื่อน/คนรู้จักแนะนำ" }, { code: "EXISTING_CUSTOMER", labelTh: "ลูกค้าเดิม" },
    { code: "EVENT", labelTh: "งานอีเวนต์/บูธ" }, { code: "OTHER", labelTh: "อื่น ๆ" }
  ];
  D.sourcesPending = "รอยืนยัน";
  D.interestTypes = [
    { code: "BUY", labelTh: "ซื้อเครื่อง", createsLead: true }, { code: "SELL", labelTh: "ขายเครื่อง (รับซื้อ)", createsLead: true },
    { code: "TRADE_IN", labelTh: "เทิร์นเครื่อง", createsLead: true }, { code: "INSTALLMENT", labelTh: "ผ่อน", createsLead: true },
    { code: "ACCESSORY", labelTh: "อุปกรณ์เสริม", createsLead: true }, { code: "REPAIR", labelTh: "ซ่อม", createsLead: false },
    { code: "INQUIRY", labelTh: "สอบถาม/โปรโมชั่น", createsLead: false }
  ];
  D.productTypes = [
    { code: "IPHONE", labelTh: "iPhone" }, { code: "IPAD", labelTh: "iPad" }, { code: "MAC", labelTh: "Mac" }, { code: "APPLE_WATCH", labelTh: "Apple Watch" },
    { code: "AIRPODS", labelTh: "AirPods" }, { code: "ANDROID", labelTh: "สมาร์ตโฟนอื่น" }, { code: "ACCESSORY", labelTh: "อุปกรณ์เสริม" }, { code: "OTHER", labelTh: "อื่น ๆ" }
  ];
  D.lostReasons = [
    { sort: 1, code: "PRICE", labelTh: "ราคาสูงไป", origin: "A8 Price · mockup B" },
    { sort: 2, code: "COMPARING", labelTh: "รอเปรียบเทียบ", origin: "mockup B", pending: "รอยืนยัน Q10" },
    { sort: 3, code: "NOT_READY", labelTh: "ลูกค้ายังไม่พร้อม", origin: "A8 Timing · mockup B" },
    { sort: 4, code: "DOCUMENTS", labelTh: "ติดเรื่องเอกสาร", origin: "mockup B" },
    { sort: 5, code: "CHANGED_MIND", labelTh: "เปลี่ยนรุ่น/เปลี่ยนใจ", origin: "mockup B" },
    { sort: 6, code: "OUT_OF_STOCK", labelTh: "ไม่มีสินค้า", origin: "A8 Stock" },
    { sort: 7, code: "NO_MODEL_COLOR", labelTh: "ไม่มีรุ่น/สีที่ต้องการ", origin: "A8 Product" },
    { sort: 8, code: "COMPETITOR", labelTh: "ซื้อร้านอื่น", origin: "A8" },
    { sort: 9, code: "FINANCE_REJECTED", labelTh: "ผ่อน/เครดิตไม่ผ่าน", origin: "A8 Finance" },
    { sort: 10, code: "DOWN_PAYMENT", labelTh: "เงินดาวน์ไม่พอ", origin: "A8" },
    { sort: 11, code: "PROMOTION", labelTh: "โปรโมชั่นไม่ตรง", origin: "A8" },
    { sort: 12, code: "UNREACHABLE", labelTh: "ติดต่อไม่ได้", origin: "A8 Contact" },
    { sort: 13, code: "SERVICE_EXPERIENCE", labelTh: "ประสบการณ์บริการ", origin: "A8 Service" },
    { sort: 14, code: "OTHER", labelTh: "อื่น ๆ", origin: "A8", requiresNote: true, noteTh: "บังคับ lost_note" }
  ];
  D.lostReasonOthersLabel = "อื่น ๆ";
  D.interactionTypes = [
    { code: "VISIT", labelTh: "เข้าร้าน/รับบริการหน้าร้าน" }, { code: "INQUIRY", labelTh: "สอบถาม" }, { code: "CALL", labelTh: "โทรติดตาม" },
    { code: "MESSAGE", labelTh: "ส่งข้อความ" }, { code: "QUOTATION_SENT", labelTh: "ส่งใบเสนอราคา" }, { code: "APPOINTMENT", labelTh: "นัดหมายเข้าร้าน" },
    { code: "PURCHASE", labelTh: "ปิดการขาย" }, { code: "SERVICE", labelTh: "ให้บริการ (ซ่อม/ชำระ)" }, { code: "COMPLAINT", labelTh: "ร้องเรียน" },
    { code: "NOTE", labelTh: "บันทึกภายใน", internalOnly: true }, { code: "OTHER", labelTh: "อื่น ๆ" }
  ];
  D.transactionTypes = [
    { code: "SALE", labelTh: "ขายเครื่อง/สินค้า", countsAsPurchase: true, tabGroup: "การซื้อ" },
    { code: "TRADE_IN_SALE", labelTh: "เทิร์นเครื่อง", countsAsPurchase: true, tabGroup: "Trade-in" },
    { code: "INSTALLMENT_CONTRACT", labelTh: "สัญญาผ่อน", countsAsPurchase: true, tabGroup: "ผ่อน" },
    { code: "ACCESSORY_SALE", labelTh: "ขายอุปกรณ์เสริม", countsAsPurchase: false, tabGroup: "การซื้อ" },
    { code: "BUYBACK", labelTh: "รับซื้อเครื่องจากลูกค้า", countsAsPurchase: false, tabGroup: "รับซื้อ" },
    { code: "REPAIR", labelTh: "งานซ่อม", countsAsPurchase: false, tabGroup: "ซ่อม" },
    { code: "INSTALLMENT_PAYMENT", labelTh: "ชำระค่างวด", countsAsPurchase: false, tabGroup: "ผ่อน (Phase 4)" },
    { code: "REFUND", labelTh: "คืนเงิน", countsAsPurchase: false, tabGroup: "การซื้อ" }
  ];
  D.sourceSystems = [
    { code: "MANUAL", labelTh: "บันทึกด้วยมือ", integrationStatusTh: null },
    { code: "POS", labelTh: "ระบบขายหน้าร้าน", integrationStatusTh: "ยังไม่เชื่อมต่อ (Phase 4)" },
    { code: "REPAIR", labelTh: "ระบบซ่อม", integrationStatusTh: "ยังไม่เชื่อมต่อ (Phase 4)" },
    { code: "JPM_INSTALLMENT", labelTh: "ระบบผ่อน JAUN POWER MONEY", integrationStatusTh: "ยังไม่เชื่อมต่อ (Phase 4)" },
    { code: "CONTRACT", labelTh: "ระบบสัญญา", integrationStatusTh: "ยังไม่เชื่อมต่อ (Phase 4)" },
    { code: "ACCOUNTING", labelTh: "ระบบบัญชี", integrationStatusTh: "ยังไม่เชื่อมต่อ (Phase 4)" }
  ];
  /* ref.provinces มี 77 จังหวัด (ISO 3166-2:TH) แต่ CANONICAL พิมพ์ชื่อไว้เพียงรายการเดียว */
  D.provinces = [{ code: "TH-10", labelTh: "กรุงเทพมหานคร" }];
  D.provincesNote = "ref.provinces มี 77 จังหวัด · prototype มีเฉพาะที่ CANONICAL พิมพ์ (TH-10)";
  D.exportReasons = [
    { code: "MARKETING_CAMPAIGN", labelTh: "แคมเปญการตลาด", isMarketing: true },
    { code: "MANAGEMENT_REPORT", labelTh: "รายงานผู้บริหาร", isMarketing: false },
    { code: "DATA_CLEANUP", labelTh: "ทำความสะอาดข้อมูล", isMarketing: false },
    { code: "INTERNAL_AUDIT", labelTh: "ตรวจสอบภายใน", isMarketing: false },
    { code: "OTHER", labelTh: "อื่น ๆ", isMarketing: false, requiresNote: true }
  ];
  D.duplicateOverrideReasons = [
    { code: "FAMILY_SHARED_PHONE", labelTh: "ใช้เบอร์ร่วมกันในครอบครัว" }, { code: "DIFFERENT_PERSON", labelTh: "คนละคน" },
    { code: "OTHER", labelTh: "อื่น ๆ", requiresNote: true }
  ];
  D.ownershipChangeReasons = [
    { code: "SHIFT_CHANGE", labelTh: "เปลี่ยนกะ" }, { code: "WORKLOAD", labelTh: "กระจายงาน" }, { code: "STAFF_LEFT", labelTh: "พนักงานลาออก" },
    { code: "CUSTOMER_REQUEST", labelTh: "ลูกค้าขอเปลี่ยน" }, { code: "BRANCH_TRANSFER", labelTh: "ย้ายสาขา" }, { code: "OTHER", labelTh: "อื่น ๆ" }
  ];
  D.consentPurposes = [
    { code: "PRIVACY_NOTICE", labelTh: "แจ้งประกาศความเป็นส่วนตัวแล้ว", formLabelTh: "แจ้งประกาศความเป็นส่วนตัวให้ลูกค้าแล้ว", required: true },
    { code: "MARKETING", labelTh: "ยินยอมรับข่าวสาร/โปรโมชั่น", formLabelTh: "ลูกค้ายินยอมรับข่าวสาร/โปรโมชั่น (ไม่บังคับ)", required: false, preChecked: false, extraCheckTh: "ลูกค้าอายุ 20 ปีขึ้นไป หรือผู้ใช้อำนาจปกครองยินยอม" }
  ];
  D.tags = [
    { code: "VIP", labelTh: "ลูกค้าคนสำคัญ (VIP)" }, { code: "INSTALLMENT", labelTh: "ผ่อนชำระ" }, { code: "STUDENT", labelTh: "นักศึกษา" },
    { code: "TRADE_IN", labelTh: "Trade-in" }, { code: "IPHONE_FAN", labelTh: "สาย iPhone", pending: "รอยืนยัน" }
  ];
  D.dataQualityIssues = [
    { code: "DUPLICATE_SUSPECTED", labelTh: "ลูกค้าอาจซ้ำ", fixPermission: "customer.merge", fixNote: "ผู้ตัดสิน ≠ ผู้สร้างแถว" },
    { code: "MISSING_PHONE", labelTh: "ไม่มีเบอร์โทร", fixPermission: "data_quality.resolve" },
    { code: "INVALID_PHONE", labelTh: "เบอร์ไม่ถูกต้อง", fixPermission: "data_quality.resolve" },
    { code: "LEAD_WITHOUT_OWNER", labelTh: "Lead ไม่มีผู้รับผิดชอบ", fixPermission: "lead.assign" },
    { code: "LEAD_WITHOUT_OUTCOME", labelTh: "Lead ค้างไม่มีผล", fixPermission: "lead.update" },
    { code: "OVERDUE_FOLLOWUP", labelTh: "ติดตามเกินกำหนด", fixPermission: "task.update" },
    { code: "INCOMPLETE_CUSTOMER", labelTh: "ข้อมูลลูกค้าไม่ครบ", fixPermission: "data_quality.resolve" },
    { code: "WON_WITHOUT_TRANSACTION", labelTh: "ปิดขายแต่ไม่มีเลขธุรกรรม", fixPermission: "transaction.link" },
    { code: "VISIT_UNRECORDED", labelTh: "ไม่ได้บันทึกผลการให้บริการ", fixPermission: "visit.update", fixNote: "แก้ outcome ไม่ได้หลังข้ามวัน → รับทราบ" }
  ];
  D.notificationTypes = [
    { code: "FOLLOWUP_DUE", titleTh: "ถึงเวลาติดตามลูกค้า", channels: "in-app + push" },
    { code: "FOLLOWUP_OVERDUE", titleTh: "ติดตามเกินกำหนด", channels: "in-app" },
    { code: "TASK_OVERDUE", titleTh: "งานเกินกำหนด", channels: "in-app" },
    { code: "LEAD_UNASSIGNED", titleTh: "Lead ยังไม่มีผู้รับผิดชอบ", channels: "in-app + push" },
    { code: "LEAD_NOT_CONTACTED", titleTh: "Lead ยังไม่ถูกติดต่อ", channels: "in-app" },
    { code: "LEAD_ASSIGNED", titleTh: "ได้รับมอบหมายรายการใหม่", channels: "in-app" },
    { code: "OPPORTUNITY_ASSIGNED", titleTh: "ได้รับมอบหมายรายการใหม่", channels: "in-app" },
    { code: "TASK_ASSIGNED", titleTh: "ได้รับมอบหมายรายการใหม่", channels: "in-app" },
    { code: "OPPORTUNITY_STALE", titleTh: "โอกาสขายไม่มีความเคลื่อนไหว", channels: "in-app" },
    { code: "DUPLICATE_SUSPECTED", titleTh: "อาจมีลูกค้าซ้ำ", channels: "in-app" },
    { code: "VISITOR_WAITING_LONG", titleTh: "ลูกค้ารอนานเกินไป", channels: "in-app + push" },
    { code: "VISIT_OUTCOME_MISSING", titleTh: "ยังไม่บันทึกผลการให้บริการ", channels: "in-app" },
    { code: "DATA_MISSING", titleTh: "ข้อมูลลูกค้าไม่ครบ", channels: "in-app" },
    { code: "EXPORT_APPROVAL_REQUIRED", titleTh: "มีคำขอส่งออกรออนุมัติ", channels: "in-app + email" },
    { code: "EXPORT_DECIDED", titleTh: "คำขอส่งออกได้รับการตัดสินแล้ว", channels: "in-app + email" },
    { code: "ROLE_GRANT_APPROVAL_REQUIRED", titleTh: "มีคำขอมอบบทบาทรออนุมัติ", channels: "in-app + email" },
    { code: "REVEAL_LIMIT_EXCEEDED", titleTh: "การเปิดดู/ค้นหาเกินเกณฑ์", channels: "in-app + email" },
    { code: "SEARCH_LIMIT_EXCEEDED", titleTh: "การเปิดดู/ค้นหาเกินเกณฑ์", channels: "in-app + email" },
    { code: "RETENTION_ANONYMIZE_UPCOMING", titleTh: "ข้อมูลใกล้ครบระยะเก็บ", channels: "in-app" },
    { code: "LOCKOUT_REPEATED", titleTh: "บัญชีถูกล็อกซ้ำ", channels: "in-app + email" },
    { code: "LINK_LIMIT_EXCEEDED", titleTh: "ผูกลูกค้าข้ามสาขาเกินเกณฑ์", channels: "in-app" },
    { code: "CUSTOMER_VIEW_LIMIT_EXCEEDED", titleTh: "เปิดดูลูกค้าจำนวนมาก", channels: "in-app" },
    { code: "EXPORT_READY", titleTh: "ไฟล์ส่งออกพร้อมดาวน์โหลด", channels: "in-app" },
    { code: "ROLE_GRANT_DECIDED", titleTh: "คำขอบทบาทได้รับการตัดสินแล้ว", channels: "in-app + email" },
    { code: "DSR_DUE_SOON", titleTh: "คำขอเจ้าของข้อมูลใกล้ครบกำหนด", channels: "in-app + email" }
  ];
  D.kpiLabels = {
    VISITS: "ผู้มาติดต่อ (Visitor)", WALKIN_VISITS: "ลูกค้าเข้าร้าน (Walk-in)", IDENTIFIED_VISITS: "ระบุตัวตนได้",
    UNIQUE_CUSTOMERS: "ลูกค้าไม่ซ้ำ", NEW_CUSTOMERS: "ลูกค้าใหม่", RETURNING_CUSTOMERS: "ลูกค้าเก่า", LEADS: "Leads", OPPORTUNITIES: "Opportunities",
    SALES: "ปิดการขาย (Sales)", SALES_AMOUNT: "ยอดขาย (บาท)", LOST_OPPORTUNITIES: "ไม่สำเร็จ", LOST_LEADS: "ไม่สำเร็จ", LOST_TOTAL: "ไม่สำเร็จ",
    BUYERS: "ผู้ซื้อ", REPEAT_BUYERS: "ผู้ซื้อซ้ำ", OPEN_FOLLOWUP_CUSTOMERS: "ลูกค้าที่ต้องติดตาม", OPEN_LEADS: "Lead เปิดอยู่",
    OPEN_OPPORTUNITIES: "โอกาสขายเปิดอยู่", OPEN_PIPELINE_AMOUNT: "มูลค่า", WON_LAST_7_DAYS: "ปิดการขาย 7 วัน", WON_LAST_7_DAYS_AMOUNT: "ปิดการขาย 7 วัน",
    TASKS_TODAY: "งานวันนี้", TASKS_OVERDUE: "เกินกำหนด", OPEN_VISITS: "visit เปิดอยู่",
    LEAD_RATE: "อัตรา Lead", OPPORTUNITY_RATE: "อัตราโอกาสขาย", CLOSE_RATE: "อัตราปิดการขาย", LOST_RATE: "อัตราไม่สำเร็จ",
    CONV_LEAD_TO_SALE: "Conversion (Lead → ขาย)", CONV_VISIT_TO_SALE: "Conversion (ผู้มาติดต่อ → ขาย)", WALKIN_CONVERSION: "Walk-in Conversion",
    CAPTURE_RATE: "อัตราบันทึกตัวตนลูกค้า", REPEAT_RATE: "อัตราซื้อซ้ำ", LEAD_RESPONSE_MIN: "เวลาตอบกลับ Lead (มัธยฐาน)",
    FOLLOWUP_COMPLETION: "ติดตามตรงเวลา", OUTCOME_COMPLETION: "บันทึกผลการให้บริการครบ", DUPLICATE_RATE: "อัตราข้อมูลซ้ำ", MISSING_REQUIRED_RATE: "ข้อมูลจำเป็นไม่ครบ"
  };
  /* เป้าหมายคุณภาพข้อมูล (ข้อ 12.3) · เทียบด้วยค่าที่ยังไม่ปัด (ข้อ 1.3) */
  D.kpiTargets = {
    CAPTURE_RATE: { op: ">=", pct: 95 }, OUTCOME_COMPLETION: { op: ">=", pct: 95 }, FOLLOWUP_COMPLETION: { op: ">=", pct: 90 },
    DUPLICATE_RATE: { op: "<", pct: 2 }, MISSING_REQUIRED_RATE: { op: "<", pct: 2 }
  };
  D.settings = [
    { key: "env", defaultValue: "\"dev\" / \"staging\" / \"prod\"", editableBy: "SA (settings.system)" },
    { key: "clock", defaultValue: "{\"as_of\": null} (seed/test: \"2026-09-11T10:24:00+07:00\" · prod ต้อง null)", editableBy: "SA" },
    { key: "allowed_sso_domains", defaultValue: "[]", editableBy: "SA" },
    { key: "business_hours", defaultValue: "{\"default\":[\"10:00\",\"21:00\"]}", editableBy: "BA (settings.business)" },
    { key: "sla.followup_remind_min · sla.lead_unassigned_min · sla.lead_not_contacted_min · sla.visitor_waiting_min · sla.visit_in_service_min", defaultValue: "15 · 15 · 30 · 15 · 60", editableBy: "BA" },
    { key: "sla.opportunity_stale_days · escalation.overdue_hours", defaultValue: "[7,14] · [24,48]", editableBy: "BA" },
    { key: "dq.lead_without_outcome_days · dq.won_without_txn_days · dq.visit_unrecorded_days", defaultValue: "14 · 3 · 7", editableBy: "BA" },
    { key: "badge.new_customer_days · quotation.valid_days", defaultValue: "30 · 7", editableBy: "BA" },
    { key: "notify.duplicate_digest_time · notify.data_missing_time", defaultValue: "\"18:00\" · \"09:00\"", editableBy: "BA" },
    { key: "export.limits · export.link_ttl_hours · export.max_downloads", defaultValue: "ตามข้อ 8.2 · 24 · 3", editableBy: "BA" },
    { key: "security.reveal_per_hour · security.search_per_hour · security.search_miss_per_hour · security.link_per_day · security.customer_view_per_hour", defaultValue: "30 · 60 · 20 · 10 · 100", editableBy: "BA" },
    { key: "session.shared_counter_idle_min", defaultValue: "10", editableBy: "BA" },
    { key: "pdpa.current_notice_version", defaultValue: "\"PN-2026-01\"", editableBy: "BA" },
    { key: "security.login_ip_per_15min · dsr.anonymize_per_day", defaultValue: "20 · 20", editableBy: "BA" }
  ];
  /* ค่าที่ prototype ใช้คำนวณพฤติกรรม (ข้อ 11.2 ค่าเริ่มต้น · รอยืนยันค่า) */
  D.settingValues = {
    "sla.visitor_waiting_min": 15, "sla.lead_not_contacted_min": 30, "badge.new_customer_days": 30, "quotation.valid_days": 7,
    "security.reveal_per_hour": 30, "security.search_per_hour": 60, "session.shared_counter_idle_min": 10, "export.max_downloads": 3, "export.link_ttl_hours": 24
  };
  D.exportLimits = [
    { role: "BRANCH_MANAGER", maxRows: 500, perDay: 3, approver: null, approverTh: "ไม่ต้อง · เกินเพดาน = ปฏิเสธ" },
    { role: "MARKETING", maxRows: 5000, perDay: 2, approver: "BUSINESS_ADMIN", approverTh: "BUSINESS_ADMIN ทุกครั้ง" },
    { role: "BUSINESS_ADMIN", maxRows: 5000, perDay: 5, approver: "EXECUTIVE", approverTh: "EXECUTIVE" },
    { role: "EXECUTIVE", maxRows: 5000, perDay: 5, approver: "BUSINESS_ADMIN", approverTh: "BUSINESS_ADMIN (รอยืนยัน Q23)" }
  ];
  /* กติกาเพิ่มของข้อ 8.2 (v2.2) */
  D.exportRulesTh = [
    "ไม่มีบทบาทใดได้โน้ต สรุปการติดต่อ สรุปธุรกรรม หรือ IMEI",
    "เหตุผลที่ is_marketing = true → กรองเฉพาะลูกค้าที่ยินยอม MARKETING ทุกบทบาท",
    "ครั้ง/วัน นับทุกคำขอที่ยื่นในวันธุรกิจ (Asia/Bangkok) ต่อผู้ขอและ requested_as_role รวมที่ถูกปฏิเสธ",
    "คำขอของ BRANCH_MANAGER ที่ไม่เกินเพดาน = APPROVED ทันที (approved_by NULL)",
    "ผู้อนุมัติ ≠ ผู้ขอ · ผู้อนุมัติกำหนดตาม requested_as_role",
    "ดาวน์โหลดได้เฉพาะผู้ขอ · ACTIVE · aal2 · สถานะ GENERATED/DOWNLOADED · ดาวน์โหลดแล้ว < 3 ครั้ง · ภายใน 24 ชม. หลังสร้าง"
  ];
  /* รหัสรายงานของ api.get_report (ข้อ 12.0 v2.2) */
  D.reportCodes = ["OVERVIEW", "CUSTOMERS", "SALES", "CHANNELS", "STAFF", "BRANCHES", "LOST_REASONS", "DATA_QUALITY"];

  /* -------------------------------------------------------------------------
     9. KPI (ข้อ 12 · 13.1–13.4 · 13.6 · 13.11 · 13.12)
     อัตราเก็บเป็น { num, den, display } — display คือข้อความที่ CANONICAL พิมพ์
     tools/check-prototype.mjs คำนวณ num/den ใหม่ด้วยการปัด half away from zero แล้วเทียบกับ display
     ---------------------------------------------------------------------- */
  function R(num, den, display) { return { num: num, den: den, display: display }; }
  var BR = ["JP1", "JP2", "JP3", "JP4"];

  D.population = { activeCustomers: 14962, active2026: 6836, imported2025: 8126, merged2026: 16, newInPFirstNo: "CUS-2026-006044", newInPLastNo: "CUS-2026-006852", lastCustomerNo2026: "CUS-2026-006852" };
  D.runningNumbers = {
    "CUS:2026": 6852, "CUS:2025": 8126, "LD:2026": 7545, "OP:2026": 3121, "QT:2026": 1772, "TK:2026": 12660, "EX:2026": 31, "MG:2026": 16, "RG:2026": 3, "ST": 51,
    "VISIT:JP1:20260911": 7, "VISIT:JP2:20260911": 4, "VISIT:JP3:20260911": 4, "VISIT:JP4:20260911": 2,
    "QUEUE:JP1:20260911": 4, "QUEUE:JP2:20260911": 2, "QUEUE:JP3:20260911": 2, "QUEUE:JP4:20260911": 1
  };

  D.kpis = {};
  /* 9.1 ทั้งองค์กร (ข้อ 13.1 · P = 30 วันล่าสุด) */
  D.kpis.org = {
    preset: "LAST_30_DAYS",
    values: {
      VISITS: 3125, WALKIN_VISITS: 2525, IDENTIFIED_VISITS: 2719, UNIQUE_CUSTOMERS: 1284, NEW_CUSTOMERS: 809, RETURNING_CUSTOMERS: 475,
      LEADS: 892, OPPORTUNITIES: 368, SALES: 215, SALES_AMOUNT: 3332700, LOST_OPPORTUNITIES: 153, LOST_LEADS: 143, LOST_TOTAL: 296,
      BUYERS: 209, REPEAT_BUYERS: 41, LEAD_RESPONSE_MIN: 18, OPEN_FOLLOWUP_CUSTOMERS: 117, OPEN_VISITS: 4, SALES_WALKIN_ORIGIN: 158
    },
    previous: { VISITS: 2790, UNIQUE_CUSTOMERS: 1146, LEADS: 826, OPPORTUNITIES: 323, SALES: 182, SALES_AMOUNT: 3051760 },
    growthDisplay: { VISITS: "+12%", UNIQUE_CUSTOMERS: "+12%", LEADS: "+8%", OPPORTUNITIES: "+14%", SALES: "+18%", SALES_AMOUNT: "+9%" },
    shares: { NEW_CUSTOMERS: R(809, 1284, "63.0%"), RETURNING_CUSTOMERS: R(475, 1284, "37.0%") },
    rates: {
      LEAD_RATE: R(892, 3125, "28.5%"), OPPORTUNITY_RATE: R(368, 892, "41.3%"), CLOSE_RATE: R(215, 368, "58.4%"), LOST_RATE: R(153, 368, "41.6%"),
      CONV_LEAD_TO_SALE: R(215, 892, "24.1%"), CONV_VISIT_TO_SALE: R(215, 3125, "6.9%"), WALKIN_CONVERSION: R(158, 2525, "6.3%"),
      REPEAT_RATE: R(41, 209, "19.6%"), CAPTURE_RATE: R(2719, 3125, "87.0%"), OUTCOME_COMPLETION: R(2977, 3121, "95.4%"),
      FOLLOWUP_COMPLETION: R(889, 1046, "85.0%"), DUPLICATE_RATE: R(16, 14962, "0.1%"), MISSING_REQUIRED_RATE: R(61, 14962, "0.4%")
    },
    ratesPrevious: { CONV_LEAD_TO_SALE: R(182, 826, "22.0%") },
    ppDisplay: { CONV_LEAD_TO_SALE: "+2.1 pp" },
    targetDisplay: { CAPTURE_RATE: "ต่ำกว่าเป้า", OUTCOME_COMPLETION: "ผ่าน", FOLLOWUP_COMPLETION: "ต่ำกว่าเป้า", DUPLICATE_RATE: "ผ่าน", MISSING_REQUIRED_RATE: "ผ่าน" },
    buyersBreakdown: { onceInP: 203, twiceInP: 6 },
    repeatBuyersBreakdown: { twiceInP: 6, boughtBeforeP: 35 },
    leadResponse: { medianMinutes: 18, base: 214, notContacted: 9, notContactedByBranch: { JP1: 8, JP2: 0, JP3: 0, JP4: 1 }, pending: "รอยืนยัน นาทีปฏิทินหรือนาทีเวลาทำการ (Q21)" },
    followupBreakdown: { onTime: 889, late: 138, openPastGrace: 19, excludedTotal: 21, excludedOverdueInGrace: 12, excludedOpenDueToday: 9, excludedOpenDueTodayDetail: "JP1: คุณขวัญ 3 (#7 #10 #12) + คุณคิม 6 · JP2–JP4 = 0" },
    note: "Close Rate: ในข้อมูลตัวอย่างสูตร Won/(Won+Lost) และ Won/Opportunity ให้ 58.4% เท่ากันเฉพาะระดับองค์กร (รายสาขาไม่เท่า)"
  };

  /* 9.2 Funnel (% ของ Visitor · ข้อ 13.1 · 13.2b) — stage token ตามข้อ 15 */
  D.funnelStages = [
    { key: "VISITS", labelTh: "Visitor", chart: "--chart-1" },
    { key: "LEADS", labelTh: "Lead", chart: "--chart-2" },
    { key: "OPPORTUNITIES", labelTh: "Opportunity", chart: "--chart-3" },
    { key: "SALES", labelTh: "Sale", chart: "--chart-6" }
  ];
  D.funnels = {
    ALL: { VISITS: 3125, LEADS: 892, OPPORTUNITIES: 368, SALES: 215, pctOfVisitors: { LEADS: "28.5%", OPPORTUNITIES: "11.8%", SALES: "6.9%" } },
    JP1: { VISITS: 1008, LEADS: 298, OPPORTUNITIES: 120, SALES: 82, pctOfVisitors: { LEADS: "29.6%", OPPORTUNITIES: "11.9%", SALES: "8.1%" } },
    JP2: { VISITS: 842, LEADS: 241, OPPORTUNITIES: 98, SALES: 61, pctOfVisitors: { LEADS: "28.6%", OPPORTUNITIES: "11.6%", SALES: "7.2%" } },
    JP3: { VISITS: 694, LEADS: 187, OPPORTUNITIES: 86, SALES: 45, pctOfVisitors: { LEADS: "26.9%", OPPORTUNITIES: "12.4%", SALES: "6.5%" } },
    JP4: { VISITS: 581, LEADS: 166, OPPORTUNITIES: 64, SALES: 27, pctOfVisitors: { LEADS: "28.6%", OPPORTUNITIES: "11.0%", SALES: "4.6%" } }
  };

  /* 9.3 รายสาขา (ข้อ 13.2) */
  function B(branch, visits, walkIn, onlinePhone, identified, unique, nw, ret, leads, opps, sales, lostOpp, lostLead, amount, amountPrev, amountGrowth) {
    return { branch: branch, visits: visits, walkInVisits: walkIn, onlinePhoneVisits: onlinePhone, identifiedVisits: identified, uniqueCustomers: unique,
      newCustomers: nw, returningCustomers: ret, leads: leads, opportunities: opps, sales: sales, lostOpportunities: lostOpp, lostLeads: lostLead,
      salesAmount: amount, salesAmountPrevious: amountPrev, salesAmountGrowthDisplay: amountGrowth };
  }
  D.kpis.branches = [
    B("JP1", 1008, 812, 196, 891, 412, 262, 150, 298, 120, 82, 51, 45, 1245000, 1111600, "+12%"),
    B("JP2", 842, 694, 148, 740, 356, 222, 134, 241, 98, 61, 40, 38, 906500, 839350, "+8%"),
    B("JP3", 694, 521, 173, 596, 280, 176, 104, 187, 86, 45, 36, 33, 712300, 678380, "+5%"),
    B("JP4", 581, 498, 83, 492, 236, 149, 87, 166, 64, 27, 26, 27, 468900, 422430, "+11%")
  ];
  D.kpis.branchesTotal = B("ALL", 3125, 2525, 600, 2719, 1284, 809, 475, 892, 368, 215, 153, 143, 3332700, 3051760, "+9%");
  D.kpis.branchesNote = "ภายใน P และช่วงก่อนหน้า ลูกค้าแต่ละคนมีกิจกรรมที่สาขาเดียวต่อช่วง (ผลรวมรายสาขา = ยอดองค์กร) · JPON ไม่มีรายการใน P (แถวศูนย์ทั้งแถวไม่แสดง)";

  /* 9.4 รายสาขา ค่าประกอบ (ข้อ 13.2b ตารางที่ 1) */
  function C(branch, salesWalkin, buyers, repeat, closed, unrecorded, fuDen, onTime, late, openPast, exclOverdue, exclToday) {
    return { branch: branch, salesWalkinOrigin: salesWalkin, buyers: buyers, repeatBuyers: repeat, visitsClosed: closed, visitsUnrecorded: unrecorded,
      followupDenominator: fuDen, followupOnTime: onTime, followupLate: late, followupOpenPastGrace: openPast,
      followupExcludedOverdueInGrace: exclOverdue, followupExcludedOpenDueToday: exclToday };
  }
  D.kpis.branchComponents = [
    C("JP1", 60, 80, 16, 1004, 44, 352, 305, 47, 0, 6, 9),
    C("JP2", 46, 59, 12, 842, 38, 290, 246, 37, 7, 2, 0),
    C("JP3", 31, 44, 8, 694, 34, 226, 190, 30, 6, 2, 0),
    C("JP4", 21, 26, 5, 581, 28, 178, 148, 24, 6, 2, 0)
  ];
  D.kpis.branchComponentsTotal = C("ALL", 158, 209, 41, 3121, 144, 1046, 889, 138, 19, 12, 9);

  /* 9.5 รายสาขา ช่วงก่อนหน้า (ข้อ 13.2b ตารางที่ 2) */
  function P(branch, visits, unique, leads, opps, sales, growth) {
    return { branch: branch, visits: visits, uniqueCustomers: unique, leads: leads, opportunities: opps, sales: sales,
      growthDisplay: { visits: growth[0], uniqueCustomers: growth[1], leads: growth[2], opportunities: growth[3], sales: growth[4] } };
  }
  D.kpis.branchPrevious = [
    P("JP1", 900, 368, 276, 105, 69, ["+12%", "+12%", "+8%", "+14%", "+19%"]),
    P("JP2", 752, 318, 223, 86, 52, ["+12%", "+12%", "+8%", "+14%", "+17%"]),
    P("JP3", 620, 250, 173, 76, 38, ["+12%", "+12%", "+8%", "+13%", "+18%"]),
    P("JP4", 518, 210, 154, 56, 23, ["+12%", "+12%", "+8%", "+14%", "+17%"])
  ];
  D.kpis.branchPreviousTotal = P("ALL", 2790, 1146, 826, 323, 182, ["+12%", "+12%", "+8%", "+14%", "+18%"]);

  /* 9.6 รายสาขา อัตรา (ข้อ 13.2b ตารางที่ 3) · LEAD_RESPONSE_MIN รายสาขาไม่มีค่าตัวอย่าง (null → "–") */
  D.kpis.branchRates = [
    { branch: "JP1", LEAD_RATE: R(298, 1008, "29.6%"), OPPORTUNITY_RATE: R(120, 298, "40.3%"), CLOSE_RATE: R(82, 133, "61.7%"), LOST_RATE: R(51, 133, "38.3%"),
      CONV_LEAD_TO_SALE: R(82, 298, "27.5%"), CONV_LEAD_TO_SALE_PREVIOUS: R(69, 276, "25.0%"), CONV_LEAD_TO_SALE_PP: "+2.5 pp",
      CONV_VISIT_TO_SALE: R(82, 1008, "8.1%"), WALKIN_CONVERSION: R(60, 812, "7.4%"), CAPTURE_RATE: R(891, 1008, "88.4%"),
      OUTCOME_COMPLETION: R(960, 1004, "95.6%"), FOLLOWUP_COMPLETION: R(305, 352, "86.6%"), REPEAT_RATE: R(16, 80, "20.0%"), LEAD_RESPONSE_MIN: null },
    { branch: "JP2", LEAD_RATE: R(241, 842, "28.6%"), OPPORTUNITY_RATE: R(98, 241, "40.7%"), CLOSE_RATE: R(61, 101, "60.4%"), LOST_RATE: R(40, 101, "39.6%"),
      CONV_LEAD_TO_SALE: R(61, 241, "25.3%"), CONV_LEAD_TO_SALE_PREVIOUS: R(52, 223, "23.3%"), CONV_LEAD_TO_SALE_PP: "+2.0 pp",
      CONV_VISIT_TO_SALE: R(61, 842, "7.2%"), WALKIN_CONVERSION: R(46, 694, "6.6%"), CAPTURE_RATE: R(740, 842, "87.9%"),
      OUTCOME_COMPLETION: R(804, 842, "95.5%"), FOLLOWUP_COMPLETION: R(246, 290, "84.8%"), REPEAT_RATE: R(12, 59, "20.3%"), LEAD_RESPONSE_MIN: null },
    { branch: "JP3", LEAD_RATE: R(187, 694, "26.9%"), OPPORTUNITY_RATE: R(86, 187, "46.0%"), CLOSE_RATE: R(45, 81, "55.6%"), LOST_RATE: R(36, 81, "44.4%"),
      CONV_LEAD_TO_SALE: R(45, 187, "24.1%"), CONV_LEAD_TO_SALE_PREVIOUS: R(38, 173, "22.0%"), CONV_LEAD_TO_SALE_PP: "+2.1 pp",
      CONV_VISIT_TO_SALE: R(45, 694, "6.5%"), WALKIN_CONVERSION: R(31, 521, "6.0%"), CAPTURE_RATE: R(596, 694, "85.9%"),
      OUTCOME_COMPLETION: R(660, 694, "95.1%"), FOLLOWUP_COMPLETION: R(190, 226, "84.1%"), REPEAT_RATE: R(8, 44, "18.2%"), LEAD_RESPONSE_MIN: null },
    { branch: "JP4", LEAD_RATE: R(166, 581, "28.6%"), OPPORTUNITY_RATE: R(64, 166, "38.6%"), CLOSE_RATE: R(27, 53, "50.9%"), LOST_RATE: R(26, 53, "49.1%"),
      CONV_LEAD_TO_SALE: R(27, 166, "16.3%"), CONV_LEAD_TO_SALE_PREVIOUS: R(23, 154, "14.9%"), CONV_LEAD_TO_SALE_PP: "+1.3 pp",
      CONV_VISIT_TO_SALE: R(27, 581, "4.6%"), WALKIN_CONVERSION: R(21, 498, "4.2%"), CAPTURE_RATE: R(492, 581, "84.7%"),
      OUTCOME_COMPLETION: R(553, 581, "95.2%"), FOLLOWUP_COMPLETION: R(148, 178, "83.1%"), REPEAT_RATE: R(5, 26, "19.2%"), LEAD_RESPONSE_MIN: null }
  ];

  /* 9.7 แหล่งที่มาลูกค้า (ข้อ 13.3 · ลูกค้าไม่ซ้ำตาม first_channel_code) */
  D.kpis.sources = {
    channels: ["WALK_IN", "LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "PHONE"],
    byBranch: {
      JP1: { WALK_IN: 147, LINE: 116, FACEBOOK: 66, INSTAGRAM: 33, TIKTOK: 29, PHONE: 21, total: 412 },
      JP2: { WALK_IN: 143, LINE: 93, FACEBOOK: 53, INSTAGRAM: 27, TIKTOK: 23, PHONE: 17, total: 356 },
      JP3: { WALK_IN: 64, LINE: 95, FACEBOOK: 54, INSTAGRAM: 27, TIKTOK: 24, PHONE: 16, total: 280 },
      JP4: { WALK_IN: 108, LINE: 56, FACEBOOK: 32, INSTAGRAM: 16, TIKTOK: 14, PHONE: 10, total: 236 }
    },
    total: { WALK_IN: 462, LINE: 360, FACEBOOK: 205, INSTAGRAM: 103, TIKTOK: 90, PHONE: 64, WEBSITE: 0, total: 1284 },
    totalShares: { WALK_IN: R(462, 1284, "36.0%"), LINE: R(360, 1284, "28.0%"), FACEBOOK: R(205, 1284, "16.0%"), INSTAGRAM: R(103, 1284, "8.0%"), TIKTOK: R(90, 1284, "7.0%"), PHONE: R(64, 1284, "5.0%") },
    note: "WEBSITE = 0 (ไม่แสดงบนกราฟ) · ส่วนของโดนัทต้องตรงกับแถวที่มากกว่า 0 เท่านั้น"
  };

  /* 9.8 เหตุผลที่ไม่สำเร็จ (ข้อ 13.4 · LOST_TOTAL 296) — 5 อันดับ + อื่น ๆ */
  function L(code, jp1, jp2, jp3, jp4, total, share, leads) {
    return { code: code, byBranch: { JP1: jp1, JP2: jp2, JP3: jp3, JP4: jp4 }, total: total, share: share, leads: leads };
  }
  D.kpis.lostReasons = {
    top: [
      L("PRICE", 27, 22, 19, 15, 83, R(83, 296, "28.0%"), 38),
      L("COMPARING", 17, 14, 12, 10, 53, R(53, 296, "17.9%"), 27),
      L("NOT_READY", 15, 12, 11, 9, 47, R(47, 296, "15.9%"), 26),
      L("DOCUMENTS", 12, 10, 8, 6, 36, R(36, 296, "12.2%"), 14),
      L("CHANGED_MIND", 10, 8, 7, 5, 30, R(30, 296, "10.1%"), 13)
    ],
    others: L("OTHERS", 15, 12, 12, 8, 47, R(47, 296, "15.9%"), 25),
    othersMembers: [
      L("OUT_OF_STOCK", 6, 5, 4, 3, 18, null, 9),
      L("FINANCE_REJECTED", 4, 3, 3, 1, 11, null, 5),
      L("COMPETITOR", 3, 2, 2, 2, 9, null, 3),
      L("UNREACHABLE", 1, 1, 2, 2, 6, null, 6),
      L("PROMOTION", 1, 1, 1, 0, 3, null, 2)
    ],
    total: { byBranch: { JP1: 96, JP2: 78, JP3: 69, JP4: 53 }, total: 296, share: "100%", leads: 143 }
  };

  /* 9.9 รายพนักงาน JP1 (ข้อ 13.6 · owner ปัจจุบัน) · null = ไม่มีค่า ("–") */
  function S(staff, o) { o.staff = staff; return o; }
  D.kpis.staffJP1 = {
    branch: "JP1",
    slices: [
      S("ST-0045", { leads: 154, opportunities: 63, sales: 44, salesAmount: 668400, lostOpportunities: 26, lostLeads: 23, openLeads: 30, openLeadsByStatus: null,
        openOpportunities: 34, openByStage: { INTERESTED: 17, QUOTATION: 10, FOLLOW_UP: 7 }, openPipelineAmount: 731600, wonLast7Days: 4, wonLast7DaysAmount: 145500, tasksToday: 8, tasksOverdue: 4 }),
      S("ST-0046", { leads: 142, opportunities: 57, sales: 38, salesAmount: 576600, lostOpportunities: 25, lostLeads: 22, openLeads: 26, openLeadsByStatus: null,
        openOpportunities: 28, openByStage: { INTERESTED: 15, QUOTATION: 8, FOLLOW_UP: 5 }, openPipelineAmount: 595500, wonLast7Days: 4, wonLast7DaysAmount: 139900, tasksToday: 6, tasksOverdue: 3 }),
      S(null, { labelTh: "ไม่มี owner", leads: 2, opportunities: null, sales: null, salesAmount: null, lostOpportunities: null, lostLeads: null, openLeads: 2, openLeadsByStatus: null,
        openOpportunities: null, openByStage: null, openPipelineAmount: null, wonLast7Days: null, wonLast7DaysAmount: null, tasksToday: null, tasksOverdue: null })
    ],
    total: { labelTh: "รวม JP1", leads: 298, opportunities: 120, sales: 82, salesAmount: 1245000, lostOpportunities: 51, lostLeads: 45, openLeads: 58,
      openLeadsByStatus: { NEW: 14, CONTACTED: 29, QUALIFIED: 15 }, openOpportunities: 62, openByStage: { INTERESTED: 32, QUOTATION: 18, FOLLOW_UP: 12 },
      openPipelineAmount: 1327100, wonLast7Days: 8, wonLast7DaysAmount: 285400, tasksToday: null, tasksOverdue: null },
    salesSplit: { inLast7Days: 8, inLast7DaysAmount: 285400, others: 74, othersAmount: 959600 }
  };
  D.kpis.teamJP1Sales = { team: "JP1-SALES", viewer: "ST-0030", leads: 296, opportunities: 120, sales: 82, salesAmount: 1245000, convLeadToSale: R(82, 296, "27.7%"), teamOverdueTasks: 7 };

  /* 9.9b KPI แบบ "ณ app.clock()" ตามรหัสข้อ 12.1 (OPEN_* · WON_LAST_7_DAYS* · TASKS_* · OPEN_VISITS · OPEN_FOLLOWUP_CUSTOMERS)
     เก็บเฉพาะค่าที่ CANONICAL พิมพ์ (13.1 · 13.6 · 13.9 · 13.11) · ไม่มีค่า = ไม่มี key (หน้าจอแสดง "–")
     tools/check-prototype.mjs เทียบกับ kpis.staffJP1 · pipelineJP1 · kpis.today */
  D.kpis.current = {
    asOf: "2026-09-11T10:24:00+07:00",
    org: { OPEN_VISITS: 4, OPEN_FOLLOWUP_CUSTOMERS: 117 },
    branches: {
      JP1: {
        OPEN_VISITS: 4,
        OPEN_LEADS: 58, OPEN_LEADS_BY_STATUS: { NEW: 14, CONTACTED: 29, QUALIFIED: 15 },
        OPEN_OPPORTUNITIES: 62, OPEN_OPPORTUNITIES_BY_STAGE: { INTERESTED: 32, QUOTATION: 18, FOLLOW_UP: 12 },
        OPEN_PIPELINE_AMOUNT: 1327100, OPEN_PIPELINE_AMOUNT_BY_STAGE: { INTERESTED: 426800, QUOTATION: 512300, FOLLOW_UP: 388000 },
        WON_LAST_7_DAYS: 8, WON_LAST_7_DAYS_AMOUNT: 285400
      },
      JP2: { OPEN_VISITS: 0 }, JP3: { OPEN_VISITS: 0 }, JP4: { OPEN_VISITS: 0 }
    },
    staff: {
      "ST-0045": { OPEN_LEADS: 30, OPEN_OPPORTUNITIES: 34, OPEN_OPPORTUNITIES_BY_STAGE: { INTERESTED: 17, QUOTATION: 10, FOLLOW_UP: 7 }, OPEN_PIPELINE_AMOUNT: 731600, WON_LAST_7_DAYS: 4, WON_LAST_7_DAYS_AMOUNT: 145500, TASKS_TODAY: 8, TASKS_OVERDUE: 4 },
      "ST-0046": { OPEN_LEADS: 26, OPEN_OPPORTUNITIES: 28, OPEN_OPPORTUNITIES_BY_STAGE: { INTERESTED: 15, QUOTATION: 8, FOLLOW_UP: 5 }, OPEN_PIPELINE_AMOUNT: 595500, WON_LAST_7_DAYS: 4, WON_LAST_7_DAYS_AMOUNT: 139900, TASKS_TODAY: 6, TASKS_OVERDUE: 3 }
    },
    unassigned: { JP1: { OPEN_LEADS: 2 } },
    teams: { "JP1-SALES": { TASKS_OVERDUE: 7 } }
  };

  /* 9.9c ขอบเขตที่ไม่มีข้อมูล — คุณฝน (ST@JPON · aal1) ตามข้อ 13.13 v2.2:
     "จำนวนเป็น 0 · KPI ที่ไม่ผูกพนักงานและอัตรา 0/0 เป็น NULL"
     · KPI ที่ไม่ผูกพนักงาน (ข้อ 12.4): UNIQUE_CUSTOMERS NEW_CUSTOMERS RETURNING_CUSTOMERS BUYERS REPEAT_BUYERS DUPLICATE_RATE MISSING_REQUIRED_RATE → null
     · อัตราทุกตัวมีตัวหาร 0 → null · ยอดเงินเป็นผลรวม coalesce 0 (docs/05-analytics/kpi-definitions.md) · LEAD_RESPONSE_MIN มัธยฐานของเซตว่าง → null */
  D.kpis.emptyScopes = {
    "ST-0050": {
      staff: "ST-0050", branch: "JPON", ruleRef: "13.13",
      values: {
        VISITS: 0, WALKIN_VISITS: 0, IDENTIFIED_VISITS: 0, UNIQUE_CUSTOMERS: null, NEW_CUSTOMERS: null, RETURNING_CUSTOMERS: null,
        LEADS: 0, OPPORTUNITIES: 0, SALES: 0, SALES_AMOUNT: 0, LOST_OPPORTUNITIES: 0, LOST_LEADS: 0, LOST_TOTAL: 0,
        BUYERS: null, REPEAT_BUYERS: null, OPEN_FOLLOWUP_CUSTOMERS: 0, OPEN_LEADS: 0, OPEN_OPPORTUNITIES: 0, OPEN_PIPELINE_AMOUNT: 0,
        WON_LAST_7_DAYS: 0, WON_LAST_7_DAYS_AMOUNT: 0, TASKS_TODAY: 0, TASKS_OVERDUE: 0, OPEN_VISITS: 0, LEAD_RESPONSE_MIN: null
      },
      rates: {
        LEAD_RATE: null, OPPORTUNITY_RATE: null, CLOSE_RATE: null, LOST_RATE: null, CONV_LEAD_TO_SALE: null, CONV_VISIT_TO_SALE: null,
        WALKIN_CONVERSION: null, CAPTURE_RATE: null, REPEAT_RATE: null, FOLLOWUP_COMPLETION: null, OUTCOME_COMPLETION: null,
        DUPLICATE_RATE: null, MISSING_REQUIRED_RATE: null
      },
      staffUnboundKpis: ["UNIQUE_CUSTOMERS", "NEW_CUSTOMERS", "RETURNING_CUSTOMERS", "BUYERS", "REPEAT_BUYERS", "DUPLICATE_RATE", "MISSING_REQUIRED_RATE"]
    }
  };

  /* 9.10 วันนี้ ณ 10:24 น. (ข้อ 13.11) */
  function T(branch, walkIn, online, visits, identified, unique, prevUnique, growth, open) {
    return { branch: branch, walkInVisits: walkIn, onlinePhoneVisits: online, visits: visits, identifiedVisits: identified, uniqueCustomers: unique,
      uniqueSameDayLastWeek: prevUnique, growthDisplay: growth, openVisits: open };
  }
  D.kpis.today = {
    asOf: "2026-09-11T10:24:00+07:00",
    rows: [T("JP1", 4, 3, 7, 4, 7, 6, "+17%", 4), T("JP2", 2, 2, 4, 4, 4, 4, "0%", 0), T("JP3", 2, 2, 4, 3, 3, 2, "+50%", 0), T("JP4", 1, 1, 2, 2, 2, 2, "0%", 0)],
    total: T("ALL", 9, 8, 17, 13, 16, 14, "+14%", 4)
  };

  /* 9.11 ศูนย์คุณภาพข้อมูล (ข้อ 13.12) */
  function Q(code, jp1, jp2, jp3, jp4, total) { return { code: code, byBranch: { JP1: jp1, JP2: jp2, JP3: jp3, JP4: jp4 }, total: total }; }
  D.kpis.dataQuality = {
    issues: [
      Q("DUPLICATE_SUSPECTED", 5, 4, 4, 3, 16), Q("MISSING_PHONE", 7, 6, 5, 5, 23), Q("INVALID_PHONE", 2, 2, 1, 1, 6),
      Q("LEAD_WITHOUT_OWNER", 2, 2, 2, 2, 8), Q("LEAD_WITHOUT_OUTCOME", 6, 5, 4, 4, 19), Q("OVERDUE_FOLLOWUP", 6, 9, 8, 8, 31),
      Q("INCOMPLETE_CUSTOMER", 13, 11, 9, 9, 42), Q("WON_WITHOUT_TRANSACTION", 4, 3, 3, 2, 12), Q("VISIT_UNRECORDED", 9, 8, 7, 5, 29)
    ],
    flaggedUniqueCustomers: 61,
    overlapMissingPhoneAndIncomplete: 4,
    overdueFollowupJP1: { "ST-0045": 3, "ST-0046": 3 },
    notes: [
      "ลูกค้า MISSING_PHONE 23 รายเป็นข้อมูลนำเข้า (created_via = 'IMPORT') · 4 รายในนั้นติด INCOMPLETE_CUSTOMER ด้วย → ลูกค้าไม่ซ้ำที่ติดธง 61",
      "DUPLICATE_SUSPECTED 16 แถว = ลูกค้าที่สร้างใหม่ 16 รายไม่ซ้ำกัน · ไม่มีคู่อื่นใน seed ที่คะแนน ≥ 70",
      "VISIT_UNRECORDED นับ visit ที่ started_at อยู่ใน 7 วันล่าสุด"
    ]
  };

  /* -------------------------------------------------------------------------
     10. ลูกค้าที่ระบุชื่อ (ข้อ 13.7–13.10 · 13.14)
     branch = สาขาที่ลูกค้าเชื่อม (ใช้ตัดสินสิทธิ์ใน prototype) · owner = ผู้ดูแลลูกค้า (null = CANONICAL ไม่ระบุ)
     lastBranch = สาขาของกิจกรรมล่าสุด (คอลัมน์ "สาขา" ข้อ 13.8 · 14.9) · firstBranch = สาขาแรก (ข้อ 13.7 · 13.14)
     contacts[].full มีเพื่อจำลอง api.reveal_contact เท่านั้น ห้ามแสดงก่อนกดเปิดดู
     ---------------------------------------------------------------------- */
  function CU(no, first, last, branch, owner, extra) {
    var o = { customerNo: no, firstName: first, lastName: last, displayName: first + " " + last, branch: branch, owner: owner,
      lifecycle: null, badges: [], contacts: [], lastChannel: null, lastActivityAt: null, source: null };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function PH(full, masked) { return { type: "PHONE", full: full, masked: masked }; }
  D.customers = [
    CU("CUS-2026-000297", "สมชาย", "ใจดี", "JP1", "ST-0045", { lifecycle: "REPEAT", badges: ["vip", "followingUp"], lastChannel: "LINE", lastActivityAt: "2026-09-11T10:24:00+07:00", lastBranch: "JP1", firstBranch: "JP1", source: "13.5 · 13.7 · 13.8",
      contacts: [PH("081-234-5678", "081-XXX-5678"), { type: "LINE_ID", full: "somchai_j", masked: "so***" }, { type: "EMAIL", full: "somchai.j@example.com", masked: "s***@example.com" }] }),
    CU("CUS-2026-006851", "ณัฐชยา", "มากมี", "JP2", null, { lifecycle: "LEAD", badges: ["newCustomer"], lastChannel: "WALK_IN", lastActivityAt: "2026-09-11T10:20:00+07:00", lastBranch: "JP2", source: "13.8", contacts: [PH("095-123-4567", "095-XXX-4567")] }),
    CU("CUS-2026-004127", "กิตติพงษ์", "กล้าหาญ", "JP3", null, { lifecycle: "OPPORTUNITY", badges: ["followingUp"], lastChannel: "FACEBOOK", lastActivityAt: "2026-09-11T10:16:00+07:00", lastBranch: "JP3", source: "13.8", contacts: [PH("090-987-6543", "090-XXX-6543")] }),
    CU("CUS-2026-006790", "วิไลวรรณ", "สวยดี", "JP1", "ST-0046", { lifecycle: "LEAD", badges: ["newCustomer"], lastChannel: "INSTAGRAM", lastActivityAt: "2026-09-11T10:11:00+07:00", lastBranch: "JP1", source: "13.5 (ผู้ดูแล = คุณคิม) · 13.8 · 13.11 · 13.14", contacts: [PH("098-765-4321", "098-XXX-4321")] }),
    CU("CUS-2026-006774", "ธนพล", "รุ่งเรือง", "JP4", null, { lifecycle: "LEAD", badges: ["newCustomer", "notContacted"], lastChannel: "TIKTOK", lastActivityAt: "2026-09-11T10:06:00+07:00", lastBranch: "JP4", source: "13.8", contacts: [PH("081-456-7890", "081-XXX-7890")] }),
    CU("CUS-2026-005980", "อรอุมา", "แสนดี", "JP1", "ST-0045", { lastActivityAt: "2026-09-09T15:10:00+07:00", source: "13.5 · 13.9 · 13.10" }),
    CU("CUS-2026-006121", "ปกรณ์", "ใจกว้าง", "JP1", null, { source: "13.9" }),
    CU("CUS-2026-005412", "พิมพ์ชนก", "ศรีสุข", "JP1", "ST-0045", { lastActivityAt: "2026-09-10T14:05:00+07:00", source: "13.5 · 13.9 · 13.10 · 11.1" }),
    CU("CUS-2026-004877", "วรเชษฐ์", "มั่นคง", "JP1", null, { source: "13.9" }),
    CU("CUS-2026-003966", "สุภาวดี", "ดีมาก", "JP1", null, { source: "13.9" }),
    CU("CUS-2026-006310", "มานพ", "รักงาน", "JP1", "ST-0045", { lastActivityAt: "2026-09-10T16:40:00+07:00", source: "13.5 · 13.9 · 13.10" }),
    CU("CUS-2026-006455", "ศิริพร", "พรมดี", "JP1", null, { source: "13.9" }),
    CU("CUS-2025-007321", "จิราพร", "ทองดี", "JP1", "ST-0045", { source: "13.10 · 13.14", contactHistoryMasked: { before: "081-XXX-1234", after: "089-XXX-5678" } }),
    CU("CUS-2026-005733", "สุนิสา", "แก้วใส", "JP1", "ST-0045", { source: "13.10" }),
    CU("CUS-2026-006002", "กมลชนก", "สายสุข", "JP1", "ST-0045", { source: "13.10" }),
    CU("CUS-2026-006511", "ธีรภัทร", "วงศ์ใหญ่", "JP1", "ST-0045", { source: "13.10" }),
    CU("CUS-2026-006840", "ชนากานต์", "ใจงาม", "JP1", "ST-0045", { lastActivityAt: "2026-09-10T11:20:00+07:00", source: "13.5 · 13.10" }),
    CU("CUS-2026-006702", "วีรยุทธ", "ชัยมงคล", "JP1", "ST-0045", { source: "13.10" }),
    CU("CUS-2026-006598", "ปิยะนุช", "บุญมา", "JP1", "ST-0045", { source: "13.10" }),
    /* หมายเหตุผู้เขียน: ข้อ 13.14 พิมพ์เฉพาะเบอร์เต็ม 081-234-5679 · ค่าปิดบังสร้างตามกติกาข้อ 6.4 */
    CU("CUS-2026-004410", "สมชาย", "ใจดี", "JP1", null, { lifecycle: "OPPORTUNITY", badges: ["followingUp"], firstBranch: "JP1", source: "13.14 ตรวจซ้ำ", contacts: [PH("081-234-5679", "081-XXX-5679")] }),
    /* คู่ซ้ำ (ข้อ 13.14 v2.2): ทั้งสองราย สาขาแรก JP1 · ผู้ดูแลคุณคิม */
    CU("CUS-2026-006633", "ณัฐพล", "สุขใจ", "JP1", "ST-0046", { firstBranch: "JP1", source: "13.14 คู่ซ้ำ", createdBy: "ST-0046", createdAt: "2026-09-03" }),
    CU("CUS-2026-002118", "ณัฐพร", "สุขใจ", "JP1", "ST-0046", { firstBranch: "JP1", source: "13.14 คู่ซ้ำ" })
  ];

  /* 10.1 Customer 360 — คุณสมชาย ใจดี (ข้อ 13.7) */
  function IX(no, at, channel, direction, type, visit, summary) {
    return { no: no, occurredAt: at, channel: channel, direction: direction, type: type, visit: visit, summary: summary, branch: "JP1", owner: null };
  }
  function VS(no, outcome) { return { visitNo: no, status: "COMPLETED", outcome: outcome }; }
  D.customer360 = {
    "CUS-2026-000297": {
      customerNo: "CUS-2026-000297",
      tags: ["VIP", "INSTALLMENT", "IPHONE_FAN"],
      lifecycle: "REPEAT", badges: ["vip", "followingUp"],
      province: "TH-10",
      firstSeenAt: "2026-01-11T13:15:00+07:00", firstChannel: "FACEBOOK", firstSource: "FACEBOOK_PAGE", firstBranch: "JP1",
      sourceTextTh: "รู้จักร้านจาก Facebook", tenureTextTh: "เป็นลูกค้ามา 8 เดือน", tenureMonths: 8,
      owner: "ST-0045", branchesUsed: ["JP1"],
      summary: { contacts: 7, storeVisits: 3, purchases: 2, lifetimeAmount: 52800 },
      summaryLabels: { contacts: "จำนวนการติดต่อ", storeVisits: "จำนวนครั้งเข้าร้าน", purchases: "จำนวนการซื้อ", lifetimeAmount: "ยอดซื้อสะสม (บาท)" },
      interestedProducts: [
        { model: "iPhone 17 Pro", level: "HOT", ref: "OP-2026-002998" },
        { model: "iPad Air", level: "WARM", ref: "LD-2026-007460" }
      ],
      nextFollowUp: { at: "2026-09-18T10:00:00+07:00", titleTh: "โทรติดตามเรื่องผ่อน", owner: "ST-0045", ref: "OP-2026-002998" },
      consents: [
        { purpose: "PRIVACY_NOTICE", status: "GRANTED", capturedAt: "2026-01-11", noticeVersion: "PN-2026-01", capturedVia: "LINK_SENT", channels: null },
        { purpose: "MARKETING", status: "GRANTED", capturedAt: "2026-01-20", noticeVersion: null, capturedVia: "STAFF_FORM", channels: ["LINE"] }
      ],
      pinnedNote: { body: "ชอบให้ติดต่อทาง LINE หลัง 18:00", by: "ST-0045", at: "2026-09-08" },
      visitCount: 6,
      interactions: [
        IX(7, "2026-09-11T10:24:00+07:00", "LINE", "INBOUND", "INQUIRY", VS("V-JP1-260911-007", "NOT_YET"), "สอบถาม iPhone 17 Pro และเงื่อนไขผ่อน"),
        IX(6, "2026-09-08T16:10:00+07:00", "WALK_IN", "INBOUND", "VISIT", VS("V-JP1-260908-017", "FOLLOW_UP"), "ทดลองเครื่อง / สนใจผ่อน · สร้าง LD-2026-007460 (iPad Air)"),
        IX(5, "2026-09-01T14:22:00+07:00", "LINE", "OUTBOUND", "QUOTATION_SENT", null, "ส่งใบเสนอราคา QT-2026-001702"),
        IX(4, "2026-08-15T11:05:00+07:00", "WALK_IN", "INBOUND", "PURCHASE", VS(null, "PURCHASED"), "ปิดการขาย iPhone 16 128GB ฿28,900"),
        IX(3, "2026-08-12T19:40:00+07:00", "LINE", "INBOUND", "INQUIRY", VS(null, "FOLLOW_UP"), "สอบถามราคา iPhone 16 · สร้าง LD-2026-006650"),
        IX(2, "2026-01-20T15:30:00+07:00", "WALK_IN", "INBOUND", "PURCHASE", VS(null, "PURCHASED"), "ปิดการขาย iPhone 15 128GB ฿23,900"),
        IX(1, "2026-01-11T13:15:00+07:00", "FACEBOOK", "INBOUND", "INQUIRY", VS(null, "FOLLOW_UP"), "สอบถามราคา iPhone 15 · สร้าง LD-2026-000312")
      ],
      leads: ["LD-2026-000312", "LD-2026-006650", "LD-2026-007460"],
      opportunities: ["OP-2026-000231", "OP-2026-002790", "OP-2026-002998"],
      quotations: ["QT-2026-001702"],
      tasks: ["TK-2026-012508", null],
      transactions: [
        { type: "SALE", sourceSystem: "MANUAL", opportunityNo: "OP-2026-000231", amount: 23900, transactedAt: "2026-01-20T15:30:00+07:00", externalNo: null },
        { type: "SALE", sourceSystem: "MANUAL", opportunityNo: "OP-2026-002790", amount: 28900, transactedAt: "2026-08-15T11:05:00+07:00", externalNo: null }
      ],
      purchaseNoteTh: "การซื้อ 2 ครั้ง (20 ม.ค. ก่อน P + 15 ส.ค. ใน P) → เป็นหนึ่งใน 35 ผู้ซื้อซ้ำที่เคยซื้อก่อน P"
    }
  };

  /* 10.2 Lead · Opportunity · Quotation · Task ที่ระบุชื่อ (ข้อ 13.7 · 13.14) */
  D.leads = [
    { leadNo: "LD-2026-000312", customerNo: "CUS-2026-000297", branch: "JP1", channel: "FACEBOOK", status: "CONVERTED", createdAt: "2026-01-11T13:15:00+07:00", convertedOpportunityNo: "OP-2026-000231", owner: null },
    { leadNo: "LD-2026-006650", customerNo: "CUS-2026-000297", branch: "JP1", channel: "LINE", status: "CONVERTED", createdAt: "2026-08-12T19:40:00+07:00", convertedOpportunityNo: "OP-2026-002790", owner: null, note: "เลขลำดับถึง LD-2026-006650 ณ 12 ส.ค. 19:40 = 6,650" },
    { leadNo: "LD-2026-007460", customerNo: "CUS-2026-000297", branch: "JP1", channel: "WALK_IN", status: "CONTACTED", createdAt: "2026-09-08T16:10:00+07:00", productModel: "iPad Air", interestLevel: "WARM", owner: "ST-0045",
      nextAction: { type: "FOLLOW_UP", at: "2026-09-20T11:00:00+07:00" } },
    { leadNo: "LD-2026-007512", customerNo: "CUS-2026-006790", branch: "JP1", channel: null, status: null, createdAt: null, owner: "ST-0046", note: "เปลี่ยนผู้รับผิดชอบ 10 ก.ย. 2569 18:05 คุณขวัญ → คุณคิม (ข้อ 13.14)" }
  ];
  D.opportunities = [
    { opportunityNo: "OP-2026-000231", customerNo: "CUS-2026-000297", branch: "JP1", leadNo: "LD-2026-000312", originChannel: "FACEBOOK", stage: "WON", wonAt: "2026-01-20T15:30:00+07:00", wonAmount: 23900, owner: null },
    { opportunityNo: "OP-2026-002790", customerNo: "CUS-2026-000297", branch: "JP1", leadNo: "LD-2026-006650", originChannel: "LINE", stage: "WON", createdAt: "2026-08-15T11:05:00+07:00", wonAt: "2026-08-15T11:05:00+07:00", wonAmount: 28900, owner: null, note: "origin LINE จึงไม่อยู่ใน 158 ของ Walk-in" },
    { opportunityNo: "OP-2026-002998", customerNo: "CUS-2026-000297", branch: "JP1", leadNo: null, originChannel: "LINE", stage: "FOLLOW_UP", createdAt: "2026-09-01T14:00:00+07:00", owner: "ST-0045",
      priority: "HIGH", expectedAmount: 45900, items: [{ productType: "IPHONE", productModel: "iPhone 17 Pro", unitPrice: 45900, interestLevel: "HOT" }],
      nextAction: { type: "CALL", titleTh: "โทรติดตามเรื่องผ่อน", at: "2026-09-18T10:00:00+07:00" },
      stageHistory: [
        { from: null, to: "INTERESTED", at: "2026-09-01T14:00:00+07:00" },
        { from: "INTERESTED", to: "QUOTATION", at: "2026-09-01T14:22:00+07:00" },
        { from: "QUOTATION", to: "FOLLOW_UP", at: "2026-09-08T16:10:00+07:00", noteTh: "เปลี่ยนสินค้าเป็น iPhone 17 Pro ฿45,900 HOT" }
      ] }
  ];
  D.quotations = [
    { quotationNo: "QT-2026-001702", opportunityNo: "OP-2026-002998", customerNo: "CUS-2026-000297", branch: "JP1", owner: null, status: "EXPIRED",
      items: [{ productType: "IPHONE", productModel: "iPhone 17 Pro Max", variant: "256GB", quantity: 1, unitPrice: 49900, discountAmount: null }],
      totalAmount: 49900, sentAt: "2026-09-01T14:22:00+07:00", sentChannel: "LINE", validUntil: "2026-09-08", expiredAt: "2026-09-09" }
  ];
  D.tasks = [
    { taskNo: "TK-2026-012508", type: "CALL", title: "โทรติดตามเรื่องผ่อน iPhone 17 Pro", customerNo: "CUS-2026-000297", branch: "JP1", owner: "ST-0045", opportunityNo: "OP-2026-002998", isNextAction: true,
      dueAt: "2026-09-18T10:00:00+07:00", createdAt: "2026-09-08T16:40:00+07:00", status: null, priority: null },
    { taskNo: null, type: "FOLLOW_UP", title: null, titleNoteTh: "task ติดตาม iPad Air", customerNo: "CUS-2026-000297", branch: "JP1", owner: "ST-0045", leadNo: "LD-2026-007460", isNextAction: true,
      dueAt: "2026-09-20T11:00:00+07:00", status: null, priority: null, noteTh: "ที่มาของป้าย \"ติดตามอยู่\"" }
  ];

  /* 10.3 รายการลูกค้า (ข้อ 13.8) */
  D.customerList = {
    defaultFilterTh: "ติดต่อใน 30 วันล่าสุด", total: 1284, sortTh: "last_activity_at DESC, customer_no DESC",
    rows: ["CUS-2026-000297", "CUS-2026-006851", "CUS-2026-004127", "CUS-2026-006790", "CUS-2026-006774"],
    noteTh: "\"ช่องทางล่าสุด\" = channel_code ของ interaction ล่าสุดที่ไม่ใช่ INTERNAL · \"สาขา\" = สาขาของกิจกรรมล่าสุด"
  };

  /* 10.3b ลูกค้าของฉันล่าสุด (ข้อ 13.5 v2.2 · หน้า 02 STAFF และมือถือ) = ลูกค้าที่ owner_staff_id = คุณขวัญ เรียง last_activity_at DESC */
  D.recentCustomers = {
    "ST-0045": {
      staff: "ST-0045", branch: "JP1", sortTh: "last_activity_at DESC",
      rows: [
        { customerNo: "CUS-2026-000297", lastActivityAt: "2026-09-11T10:24:00+07:00" },
        { customerNo: "CUS-2026-006310", lastActivityAt: "2026-09-10T16:40:00+07:00" },
        { customerNo: "CUS-2026-005412", lastActivityAt: "2026-09-10T14:05:00+07:00" },
        { customerNo: "CUS-2026-006840", lastActivityAt: "2026-09-10T11:20:00+07:00" },
        { customerNo: "CUS-2026-005980", lastActivityAt: "2026-09-09T15:10:00+07:00" }
      ],
      noteTh: "ลูกค้ารายอื่นของคุณขวัญมี last_activity_at ก่อน 9 ก.ย. 2569 15:10"
    }
  };

  /* 10.3c กิจกรรมล่าสุด (ข้อ 13.5 v2.2 · หน้า 02) = 5 แถวแรกของข้อ 13.8 (ชื่อ · ช่องทางล่าสุด · สาขา · เวลา)
     BRANCH_MANAGER เห็นเฉพาะแถวของสาขาตน (คุณเจ = JP1) · MARKETING ไม่มี widget นี้ (ข้อ 14.7) */
  D.recentActivity = {
    source: "13.8 แถว 1–5",
    columnsTh: ["ชื่อ", "ช่องทางล่าสุด", "สาขา", "เวลา"],
    rows: ["CUS-2026-000297", "CUS-2026-006851", "CUS-2026-004127", "CUS-2026-006790", "CUS-2026-006774"],
    branchManagerOnlyOwnBranch: true,
    hiddenForRoles: ["MARKETING"]
  };

  /* 10.4 Pipeline JAUNPHONE 1 (ข้อ 13.9) · cardDate = next_action_at (WON = won_at) */
  function PC(customerNo, product, amount, date, owner, extra) {
    var o = { customerNo: customerNo, product: product, amount: amount, cardDate: date, owner: owner, overdue: false, priority: null, opportunityNo: null };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  D.pipelineJP1 = {
    branch: "JP1",
    columns: [
      { stage: "INTERESTED", labelTh: "สนใจ", count: 32, amount: 426800, cards: [PC("CUS-2026-005980", "iPhone 17", 32900, "2026-09-11", "ST-0045", { priority: "HIGH" }), PC("CUS-2026-006121", "iPad Air", 21900, "2026-09-12", "ST-0046", { priority: "NORMAL" })] },
      { stage: "QUOTATION", labelTh: "เสนอราคา", count: 18, amount: 512300, cards: [PC("CUS-2026-005412", "iPhone 17 Pro Max", 49900, "2026-09-10", "ST-0045", { overdue: true, priority: "HIGH" }), PC("CUS-2026-004877", "iPhone 16", 29900, "2026-09-15", "ST-0046", { priority: "NORMAL" })] },
      { stage: "FOLLOW_UP", labelTh: "รอตัดสินใจ", count: 12, amount: 388000, cards: [PC("CUS-2026-000297", "iPhone 17 Pro", 45900, "2026-09-18", "ST-0045", { priority: "HIGH", opportunityNo: "OP-2026-002998" }), PC("CUS-2026-003966", "iPad Pro", 34900, "2026-09-17", "ST-0046", { priority: "NORMAL" })] },
      { stage: "WON", labelTh: "ปิดการขาย (7 วัน)", count: 8, amount: 285400, dateKind: "won", cards: [PC("CUS-2026-006310", "iPhone 16 128GB", 28900, "2026-09-10", "ST-0045", { priority: "NORMAL" }), PC("CUS-2026-006455", "iPhone 15", 25900, "2026-09-09", "ST-0046", { priority: "NORMAL" })] }
    ],
    noteTh: "ขอบซ้ายสีตาม priority_code (ข้อ 13.9 v2.2 ระบุครบ 8 การ์ด) · มูลค่า = expected_amount (WON = won_amount) · LOST ไม่มีคอลัมน์ (ดูในมุมมองรายการ) · ลากได้ตามข้อ 4.4 (D.opportunityMoveRules)"
  };

  /* 10.5 งานของคุณขวัญ (ข้อ 13.10) */
  function TK(no, group, due, type, customerNo, title, priority, pastDue) {
    return { no: no, group: group, dueAt: due, type: type, customerNo: customerNo, title: title, priority: priority, pastDueToday: !!pastDue, owner: "ST-0045", branch: "JP1" };
  }
  D.tasksKwan = {
    staff: "ST-0045", total: 12, today: 8, overdue: 4,
    rows: [
      TK(1, "overdue", "2026-09-10T13:00:00+07:00", "CALL", "CUS-2025-007321", "โทรยืนยันวันรับเครื่อง", "NORMAL"),
      TK(2, "overdue", "2026-09-10T15:00:00+07:00", "FOLLOW_UP", "CUS-2026-005412", "ติดตามใบเสนอราคา iPhone 17 Pro Max", "HIGH"),
      TK(3, "overdue", "2026-09-10T17:30:00+07:00", "FOLLOW_UP", "CUS-2026-005733", "ติดตามความสนใจ iPad", "NORMAL"),
      TK(4, "overdue", "2026-09-10T19:00:00+07:00", "FOLLOW_UP", "CUS-2026-006002", "ติดตามเรื่องเทิร์นเครื่อง", "NORMAL"),
      TK(5, "today", "2026-09-11T10:00:00+07:00", "CALL", "CUS-2026-006310", "โทรขอเลขใบเสร็จ POS", "NORMAL", true),
      TK(6, "today", "2026-09-11T10:30:00+07:00", "SEND_QUOTATION", "CUS-2026-005980", "ส่งใบเสนอราคา iPhone 17", "HIGH"),
      TK(7, "today", "2026-09-11T11:30:00+07:00", "FOLLOW_UP", "CUS-2026-006511", "ติดตามการตัดสินใจ iPhone 16", "NORMAL"),
      TK(8, "today", "2026-09-11T13:00:00+07:00", "APPOINTMENT", "CUS-2026-006840", "นัดเข้าร้านดูเครื่อง", "NORMAL"),
      TK(9, "today", "2026-09-11T14:30:00+07:00", "DOCUMENT", "CUS-2026-005412", "เตรียมเอกสารผ่อน", "NORMAL"),
      TK(10, "today", "2026-09-11T16:00:00+07:00", "FOLLOW_UP", "CUS-2026-006702", "ติดตามราคา AirPods", "LOW"),
      TK(11, "today", "2026-09-11T17:30:00+07:00", "CALL", "CUS-2025-007321", "โทรแจ้งเครื่องพร้อมรับ", "NORMAL"),
      TK(12, "today", "2026-09-11T19:00:00+07:00", "FOLLOW_UP", "CUS-2026-006598", "ติดตามโปรโมชั่นผ่อน 0%", "NORMAL")
    ],
    kim: { staff: "ST-0046", today: 6, overdue: 3, noteTh: "ทั้งหมด FOLLOW_UP (ไม่มีรายละเอียดรายการในข้อ 13.10)" },
    noteTh: "งานของคุณสมชาย (18 ก.ย.) ไม่อยู่ในรายการวันนี้"
  };

  /* 10.6 คิว JAUNPHONE 1 และ visit วันนี้ (ข้อ 13.11) */
  D.queueJP1 = [
    { queueNo: "001", queuedAt: "2026-09-11T10:05:00+07:00", status: "IN_SERVICE", interest: "BUY", receiver: "ST-0045", identified: true },
    { queueNo: "002", queuedAt: "2026-09-11T10:12:00+07:00", status: "WAITING", interest: "TRADE_IN", receiver: null, identified: false },
    { queueNo: "003", queuedAt: "2026-09-11T10:18:00+07:00", status: "WAITING", interest: "REPAIR", receiver: null, identified: false },
    { queueNo: "004", queuedAt: "2026-09-11T10:21:00+07:00", status: "WAITING", interest: "INQUIRY", receiver: null, identified: false }
  ];
  D.onlineVisitsJP1Today = [
    { customerNo: "CUS-2026-000297", channel: "LINE", at: "2026-09-11T10:24:00+07:00" },
    { customerNo: "CUS-2026-006790", channel: "INSTAGRAM", at: "2026-09-11T10:11:00+07:00" },
    { customerNo: null, channel: null, at: null, atNoteTh: "ก่อน 10:06" }
  ];
  D.todayNoteTh = "ลูกค้าไม่ซ้ำวันนี้ JP1 7 = ลูกค้าของ visit ที่ระบุตัวตน 4 (คิว 001 · visit ออนไลน์รายการที่ 3 · คุณวิไลวรรณ · คุณสมชาย) + ลูกค้า JP1 อีก 3 รายที่มีเฉพาะ interaction OUTBOUND วันนี้ก่อน 10:06";

  /* -------------------------------------------------------------------------
     11. ตัวอย่างอื่น (ข้อ 13.14)
     ---------------------------------------------------------------------- */
  /* target = ปลายทางเมื่อกดรายการ (sitemap-screen-specs ข้อ 1.8) · { screen, params } */
  D.notifications = {
    "ST-0045": [
      { code: "FOLLOWUP_OVERDUE", taskRow: 2, customerNo: "CUS-2026-005412", body: "คุณพิมพ์ชนก ศรีสุข · ติดตามใบเสนอราคา iPhone 17 Pro Max · ครบกำหนด 10 ก.ย. 2569 15:00", createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "FOLLOWUP_OVERDUE", taskRow: 3, customerNo: "CUS-2026-005733", body: "คุณสุนิสา แก้วใส · ติดตามความสนใจ iPad · ครบกำหนด 10 ก.ย. 2569 17:30", createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "FOLLOWUP_OVERDUE", taskRow: 4, customerNo: "CUS-2026-006002", body: "คุณกมลชนก สายสุข · ติดตามเรื่องเทิร์นเครื่อง · ครบกำหนด 10 ก.ย. 2569 19:00", createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "TASK_OVERDUE", taskRow: 1, customerNo: "CUS-2025-007321", body: "คุณจิราพร ทองดี · โทรยืนยันวันรับเครื่อง · ครบกำหนด 10 ก.ย. 2569 13:00", createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "TASK_OVERDUE", taskRow: 5, customerNo: "CUS-2026-006310", body: "คุณมานพ รักงาน · โทรขอเลขใบเสร็จ POS · ครบกำหนด 11 ก.ย. 2569 10:00", createdAt: null, target: { screen: "tasks", params: { group: "today" } } },
      { code: "DATA_MISSING", body: null, detailTh: null, createdAt: "2026-09-11T09:00:00+07:00", target: { screen: "data-quality", params: {} } }
    ],
    "ST-0046": [
      { code: "LEAD_ASSIGNED", entityRef: "LD-2026-007512", customerNo: "CUS-2026-006790", body: null, createdAt: "2026-09-10T18:05:00+07:00", target: { screen: "leads", params: { lead: "LD-2026-007512" } } },
      { code: "FOLLOWUP_OVERDUE", body: null, createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "FOLLOWUP_OVERDUE", body: null, createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "FOLLOWUP_OVERDUE", body: null, createdAt: null, target: { screen: "tasks", params: { group: "overdue" } } },
      { code: "DATA_MISSING", body: null, detailTh: null, createdAt: "2026-09-11T09:00:00+07:00", target: { screen: "data-quality", params: {} } }
    ],
    "ST-0030": [
      { code: "LEAD_UNASSIGNED", body: null, detailTh: "lead JP1 ไม่มี owner", createdAt: null, target: { screen: "leads", params: { owner: "none" } } },
      { code: "LEAD_UNASSIGNED", body: null, detailTh: "lead JP1 ไม่มี owner", createdAt: null, target: { screen: "leads", params: { owner: "none" } } },
      { code: "DUPLICATE_SUSPECTED", body: null, detailTh: "สรุป 10 ก.ย. 2569 18:00", createdAt: "2026-09-10T18:00:00+07:00", target: { screen: "data-quality", params: { issue: "DUPLICATE_SUSPECTED" } } }
    ],
    "ST-0020": [
      { code: "LEAD_UNASSIGNED", body: null, detailTh: "lead JP1 ไม่มี owner", createdAt: null, target: { screen: "leads", params: { owner: "none" } } },
      { code: "LEAD_UNASSIGNED", body: null, detailTh: "lead JP1 ไม่มี owner", createdAt: null, target: { screen: "leads", params: { owner: "none" } } },
      { code: "DUPLICATE_SUSPECTED", body: null, detailTh: "สรุป 10 ก.ย. 2569 18:00", createdAt: "2026-09-10T18:00:00+07:00", target: { screen: "data-quality", params: { issue: "DUPLICATE_SUSPECTED" } } },
      { code: "VISIT_OUTCOME_MISSING", body: null, detailTh: "สรุปวันที่ 10 ก.ย. 2569", createdAt: null, target: { screen: "data-quality", params: { issue: "VISIT_UNRECORDED" } } }
    ],
    "ST-0002": [{ code: "EXPORT_APPROVAL_REQUIRED", entityRef: "EX-2026-000031", body: null, createdAt: null, target: { screen: "exports", params: { ex: "EX-2026-000031" } } }],
    "ST-0001": [{ code: "ROLE_GRANT_APPROVAL_REQUIRED", entityRef: "RG-2026-0003", body: null, createdAt: null, target: { screen: "users", params: { tab: "requests" } } }]
  };
  D.notificationsNoteTh = "แถว crm.notifications ที่ยังไม่อ่านทั้งหมดที่ seed ใส่ (snapshot) · คนอื่น = 0 · push/อีเมลห้ามมีชื่อหรือข้อมูลลูกค้า · body รายการงานใช้รูปแบบมาตรฐานข้อ 11.1";
  D.ownershipChanges = [
    { entityType: "lead", entityRef: "LD-2026-007512", customerNo: "CUS-2026-006790", changedAt: "2026-09-10T18:05:00+07:00", fromStaff: "ST-0045", toStaff: "ST-0046", changedBy: "ST-0020", reason: "SHIFT_CHANGE", noteTh: "เปลี่ยนกะ" }
  ];
  D.duplicateCheckDemo = {
    input: { phone: "081-234-5678", nameTh: "สมชาย ใจดี" },
    candidates: [
      { customerNo: "CUS-2026-000297", score: 100, level: "สูง", reasonTh: "เบอร์โทรตรงกัน" },
      { customerNo: "CUS-2026-004410", score: 40, level: "ต่ำ", reasonTh: "ชื่อคล้าย + สาขาแรกเดียวกัน" }
    ]
  };
  D.duplicateRules = [
    { ruleTh: "เบอร์โทร (normalized) ตรงกัน", level: "สูง", score: 100 },
    { ruleTh: "LINE ID หรือ LINE userId ตรงกัน", level: "สูง", score: 100 },
    { ruleTh: "Email ตรงกัน", level: "สูง", score: 90 },
    { ruleTh: "ชื่อ+นามสกุลตรงกัน (name_search) และเบอร์ 4 ตัวท้ายตรงกัน", level: "กลาง", score: 70 },
    { ruleTh: "name_search คล้าย (threshold 0.6) และ first_branch_id = สาขาของผู้เรียก/visit", level: "ต่ำ", score: 40 }
  ];
  D.duplicatePairs = [
    { newCustomerNo: "CUS-2026-006633", candidateCustomerNo: "CUS-2026-002118", createdBy: "ST-0046", createdAt: "2026-09-03", overrideReason: "FAMILY_SHARED_PHONE", score: 100, reasonTh: "เบอร์โทรตรงกัน", status: "PENDING" }
  ];
  D.exportRequests = [
    { exportNo: "EX-2026-000031", requester: "ST-0011", requestedAsRole: "MARKETING", requestedAt: "2026-09-10T16:20:00+07:00", reason: "MARKETING_CAMPAIGN", rows: 1850, filterTh: "ยินยอม MARKETING", status: "REQUESTED", waitingFor: "ST-0002", downloads: null },
    { exportNo: "EX-2026-000030", requester: "ST-0020", requestedAsRole: "BRANCH_MANAGER", requestedAt: "2026-09-05T14:05:00+07:00", reason: "MANAGEMENT_REPORT", rows: 412, filterTh: null, status: "EXPIRED", waitingFor: null, downloads: 1, fileDeletedAt: "2026-09-06" }
  ];
  D.roleGrantRequests = [
    { requestNo: "RG-2026-0003", requestedBy: "ST-0003", requestedAt: "2026-09-11T09:12:00+07:00", role: "SYSTEM_ADMIN", target: "ST-0051", targetInvitedAt: "2026-09-10", status: null, statusTh: "รอ EXECUTIVE" }
  ];
  D.auditSamples = [
    { at: "2026-09-11T10:20:00+07:00", actor: "ST-0045", action: "CONTACT_REVEALED", log: "access_logs", entityRef: "CUS-2026-000297", detailTh: "purpose CALL" },
    { at: "2026-09-11T09:12:00+07:00", actor: "ST-0003", action: "ROLE_GRANT_REQUESTED", log: "audit_logs", entityRef: "RG-2026-0003", detailTh: "SYSTEM_ADMIN → ST-0051" },
    { at: "2026-09-10T18:42:00+07:00", actor: "ST-0045", action: "CUSTOMER_CONTACT_UPDATED", log: "audit_logs", entityRef: "CUS-2025-007321", detailTh: "081-XXX-1234 → 089-XXX-5678 (A32)" },
    { at: "2026-09-10T18:05:00+07:00", actor: "ST-0020", action: "LEAD_ASSIGNED", log: "audit_logs", entityRef: "LD-2026-007512", detailTh: "คุณขวัญ → คุณคิม · SHIFT_CHANGE" },
    { at: "2026-09-10T16:20:00+07:00", actor: "ST-0011", action: "EXPORT_REQUESTED", log: "audit_logs", entityRef: "EX-2026-000031", detailTh: "1,850 แถว" }
  ];
  D.dataSubjectRequests = [];
  D.dataSubjectRequestsEmptyTh = "ไม่มี (empty state)";

  /* -------------------------------------------------------------------------
     12. Dashboard ตามบทบาท (ข้อ 14.7 · ช่วง 30 วันล่าสุด)
     การ์ด: value = ตัวเลขดิบ · display = ข้อความที่ต้องแสดง · delta = ป้ายเปลี่ยนแปลง (null = ไม่แสดง)
     widget.ref = path ใน JCRM_DATA · ref null = CANONICAL ไม่มีข้อมูลตัวอย่าง
     ---------------------------------------------------------------------- */
  function K(key, label, value, display, delta, ref, preset) {
    return { key: key, labelTh: label, value: value, display: display, delta: delta, ref: ref, preset: preset || "LAST_30_DAYS" };
  }
  D.dashboards = [
    { key: "org", roles: ["EXECUTIVE", "BUSINESS_ADMIN", "OPERATIONS", "MARKETING"], scopeTh: "ทุกสาขา",
      cards: [
        K("uniqueToday", "ลูกค้าไม่ซ้ำวันนี้", 16, "16", "+14%", "kpis.today.total.uniqueCustomers", "TODAY"),
        K("unique", "ลูกค้าไม่ซ้ำ", 1284, "1,284", "+12%", "kpis.org.values.UNIQUE_CUSTOMERS"),
        K("leads", "Leads", 892, "892", "+8%", "kpis.org.values.LEADS"),
        K("opportunities", "Opportunities", 368, "368", "+14%", "kpis.org.values.OPPORTUNITIES"),
        K("sales", "ปิดการขาย", 215, "215", "+18%", "kpis.org.values.SALES"),
        K("convLeadToSale", "Conversion (Lead → ขาย)", null, "24.1%", "+2.1 pp", "kpis.org.rates.CONV_LEAD_TO_SALE")
      ],
      widgets: [
        { type: "funnel", titleTh: "Funnel ลูกค้า", ref: "funnels.ALL" },
        { type: "donut", titleTh: "แหล่งที่มาลูกค้า", ref: "kpis.sources.total", centerValue: 1284, centerLabelTh: "ลูกค้าไม่ซ้ำ" },
        { type: "lostReasons", titleTh: "เหตุผลที่ไม่สำเร็จ", ref: "kpis.lostReasons", top: 5 },
        { type: "branchTable", titleTh: "ผลงานรายสาขา", ref: "kpis.branches", columnsTh: ["สาขา", "ลูกค้าไม่ซ้ำ", "Leads", "Opportunities", "Sales", "Conversion (Lead → ขาย)", "ยอดขาย (บาท)", "เปลี่ยน"] },
        { type: "recentActivity", titleTh: "กิจกรรมล่าสุด", ref: "recentActivity", hiddenForRoles: ["MARKETING"] },
        { type: "dataQualityRow", titleTh: "คุณภาพข้อมูล", onlyForRoles: ["BUSINESS_ADMIN"], items: [
          { kpi: "CAPTURE_RATE", labelTh: "Capture", display: "87.0%" }, { kpi: "OUTCOME_COMPLETION", labelTh: "Outcome", display: "95.4%" },
          { kpi: "FOLLOWUP_COMPLETION", labelTh: "Follow-up", display: "85.0%" }, { kpi: "DUPLICATE_RATE", labelTh: "Duplicate", display: "0.1%" },
          { kpi: "MISSING_REQUIRED_RATE", labelTh: "Missing", display: "0.4%" }] }
      ] },
    { key: "branchManager", roles: ["BRANCH_MANAGER"], persona: "ST-0020", branch: "JP1", scopeTh: "JAUNPHONE 1",
      cards: [
        K("uniqueToday", "ลูกค้าไม่ซ้ำวันนี้", 7, "7", "+17%", "kpis.today.rows[JP1].uniqueCustomers", "TODAY"),
        K("unique", "ลูกค้าไม่ซ้ำ", 412, "412", "+12%", "kpis.branches[JP1].uniqueCustomers"),
        K("leads", "Leads", 298, "298", "+8%", "kpis.branches[JP1].leads"),
        K("opportunities", "Opportunities", 120, "120", "+14%", "kpis.branches[JP1].opportunities"),
        K("sales", "ปิดการขาย", 82, "82", "+19%", "kpis.branches[JP1].sales"),
        K("convLeadToSale", "Conversion (Lead → ขาย)", null, "27.5%", "+2.5 pp", "kpis.branchRates[JP1].CONV_LEAD_TO_SALE")
      ],
      widgets: [
        { type: "funnel", titleTh: "Funnel ลูกค้า", ref: "funnels.JP1" },
        { type: "donut", titleTh: "แหล่งที่มาลูกค้า", ref: "kpis.sources.byBranch.JP1", centerValue: 412, centerLabelTh: "ลูกค้าไม่ซ้ำ" },
        { type: "lostReasons", titleTh: "เหตุผลที่ไม่สำเร็จ", ref: "kpis.lostReasons", branch: "JP1", top: 5 },
        { type: "staffTable", titleTh: "ผลงานรายพนักงาน", ref: "kpis.staffJP1" },
        { type: "recentActivity", titleTh: "กิจกรรมล่าสุด", ref: "recentActivity", branch: "JP1" }
      ],
      otherPersonasNoteTh: "ผู้จัดการสาขาอื่นใช้โครงเดียวกันกับแถวสาขาของตนในข้อ 13.2 · 13.2b · 13.11 · ข้อมูลรายพนักงานมีเฉพาะ JP1 (ข้อ 13.6) สาขาอื่นแสดง –" },
    { key: "supervisor", roles: ["SUPERVISOR"], persona: "ST-0030", team: "JP1-SALES", scopeTh: "ทีม JP1-SALES",
      cards: [
        K("leads", "Leads", 296, "296", null, "kpis.teamJP1Sales.leads"),
        K("opportunities", "Opportunities", 120, "120", null, "kpis.teamJP1Sales.opportunities"),
        K("sales", "ปิดการขาย", 82, "82", null, "kpis.teamJP1Sales.sales"),
        K("salesAmount", "ยอดขาย", 1245000, "฿1,245,000", null, "kpis.teamJP1Sales.salesAmount"),
        K("convLeadToSale", "Conversion (Lead → ขาย)", null, "27.7%", null, "kpis.teamJP1Sales.convLeadToSale"),
        K("teamOverdue", "งานเกินกำหนดของทีม", 7, "7", null, "kpis.teamJP1Sales.teamOverdueTasks")
      ],
      widgets: [
        { type: "staffTable", titleTh: "ผลงานรายพนักงานในทีม", ref: "kpis.staffJP1" },
        { type: "teamOverdueTasks", titleTh: "งานเกินกำหนดของทีม", ref: "tasksKwan", noteTh: "รายละเอียดมีเฉพาะงานของคุณขวัญ 4 รายการ · คุณคิม 3 รายการไม่มีรายละเอียด" }
      ] },
    { key: "staff", roles: ["STAFF"], persona: "ST-0045", branch: "JP1", scopeTh: "ของฉัน",
      cards: [
        K("tasksToday", "งานวันนี้", 8, "8", null, "kpis.staffJP1.slices[ST-0045].tasksToday", "TODAY"),
        K("tasksOverdue", "เกินกำหนด", 4, "4", null, "kpis.staffJP1.slices[ST-0045].tasksOverdue", "TODAY"),
        K("openLeads", "Lead ที่ดูแล (เปิดอยู่)", 30, "30", null, "kpis.staffJP1.slices[ST-0045].openLeads"),
        K("openOpportunities", "โอกาสขายที่ดูแล", 34, "34 (฿731,600)", null, "kpis.staffJP1.slices[ST-0045].openOpportunities"),
        K("sales30", "ปิดการขาย 30 วัน", 44, "44", null, "kpis.staffJP1.slices[ST-0045].sales"),
        K("salesAmount30", "ยอดขาย 30 วัน", 668400, "฿668,400", null, "kpis.staffJP1.slices[ST-0045].salesAmount")
      ],
      widgets: [
        { type: "todayTasks", titleTh: "รายการงานวันนี้", ref: "tasksKwan" },
        { type: "myRecentCustomers", titleTh: "ลูกค้าล่าสุดของฉัน", ref: "recentCustomers.ST-0045", branch: "JP1" }
      ],
      noFunnel: true,
      otherPersonasNoteTh: "คุณคิม: งานวันนี้ 6 · เกินกำหนด 3 · Lead เปิดอยู่ 26 · โอกาสขาย 28 (฿595,500) · ปิดการขาย 38 · ยอดขาย ฿576,600 (ข้อ 13.6) · คุณฝน (JPON): การ์ดเป็น 0 / ฿0 และ KPI ที่ไม่ผูกพนักงานเป็น NULL (ข้อ 13.13 · kpis.emptyScopes) · widget เป็น empty state" }
  ];
  /* รหัส KPI ของการ์ด (ข้อ 12.1–12.2) · asOf = ค่า "ณ app.clock()" (ป้ายช่วงเวลาของการ์ดเขียน "ณ 11 ก.ย. 2569 10:24 น.")
     target = ปลายทางเมื่อกดการ์ด (sitemap-screen-specs ข้อ 5.3) */
  var CARD_META = {
    uniqueToday: { kpiCode: "UNIQUE_CUSTOMERS" }, unique: { kpiCode: "UNIQUE_CUSTOMERS" },
    leads: { kpiCode: "LEADS", target: { screen: "leads", params: {} } },
    opportunities: { kpiCode: "OPPORTUNITIES", target: { screen: "pipeline", params: {} } },
    sales: { kpiCode: "SALES", target: { screen: "pipeline", params: {} } },
    convLeadToSale: { kpiCode: "CONV_LEAD_TO_SALE" }, salesAmount: { kpiCode: "SALES_AMOUNT" },
    teamOverdue: { kpiCode: "TASKS_OVERDUE", asOf: true, target: { screen: "tasks", params: { group: "overdue" } } },
    tasksToday: { kpiCode: "TASKS_TODAY", asOf: true, target: { screen: "tasks", params: { group: "today" } } },
    tasksOverdue: { kpiCode: "TASKS_OVERDUE", asOf: true, target: { screen: "tasks", params: { group: "overdue" } } },
    openLeads: { kpiCode: "OPEN_LEADS", asOf: true, target: { screen: "leads", params: { owner: "me" } } },
    openOpportunities: { kpiCode: "OPEN_OPPORTUNITIES", secondaryKpiCode: "OPEN_PIPELINE_AMOUNT", asOf: true, target: { screen: "pipeline", params: { owner: "me" } } },
    sales30: { kpiCode: "SALES" }, salesAmount30: { kpiCode: "SALES_AMOUNT" }
  };
  D.dashboards.forEach(function (db) {
    db.cards.forEach(function (c) {
      var m = CARD_META[c.key] || {};
      c.kpiCode = m.kpiCode || null; c.secondaryKpiCode = m.secondaryKpiCode || null;
      c.asOf = !!m.asOf; c.target = m.target || null;
    });
  });
  D.dashboardNotesTh = [
    "Phase 1 \"พื้นฐาน\" = การ์ดลูกค้า/visit · ลูกค้าใหม่/เก่า · Capture Rate · แหล่งที่มา",
    "กราฟแนวโน้มรายวัน (mockup A02) และ Top Product (B16) ไม่อยู่ใน prototype Phase 0 (D44)",
    "ป้ายการ์ดห้ามเขียน \"เดือนนี้\" เว้นแต่ preset = THIS_MONTH (D27)"
  ];
  D.mobileHome = { taskCardTh: "งานทั้งหมด 12 · เกินกำหนด 4", quickActionsTh: ["รับลูกค้า", "ค้นหาลูกค้า", "งานของฉัน"], recentCustomersTh: "ลูกค้าที่ฉันรับล่าสุด 5 ราย (เฉพาะลูกค้า JP1 ของคุณขวัญ)", recentCustomersRef: "recentCustomers.ST-0045" };

  window.JCRM_DATA = D;
})();
