/* ============================================================================
   JAUN CRM · Customer 360 — prototype/assets/app.js
   window.JCRM = ตัวขับ prototype (ไม่มีไลบรารีภายนอก · ไม่มีการเรียกเครือข่าย) · CANONICAL v2.2

   ส่วนของไฟล์
     1. DOM helper + escape + ลิงก์              JCRM.$ · $$ · esc · html · raw · qs · param · link · storage · session · on
     2. ตัวเข้าถึงข้อมูล                           JCRM.screen · role · staff · branch · ref · label · enumItem · customer · get
     3. รูปแบบตัวเลข/วันที่ (ข้อ 1.2–1.3)           JCRM.fmt.*  — ปัดแบบ half away from zero ด้วยจำนวนเต็ม ไม่ใช้ Math.round กับ float
     4. ผู้ใช้ตัวอย่าง + สิทธิ์ (ข้อ 8.0)            JCRM.currentStaff · setStaff · aal · can · access · scopeBranches · canOpen · searchVisible · periodEnabled
     5. ไอคอน + component พื้นฐาน                 JCRM.icon · JCRM.ui.* (badge · kpi · state · button · pageHeader · tabs · stepper · chips …)
     6. รายการ/ตาราง/ไทม์ไลน์/คิว/งาน/ข้อมูลติดต่อ     JCRM.ui.table · JCRM.table.mount · ui.timeline · ui.queueList · ui.taskList · ui.contactRow
     7. overlay + ฟอร์ม                          JCRM.toast · dialog · drawer · confirm · reasonDialog · form.*
     8. กราฟ SVG                                JCRM.chart.donut · funnel · hbar · bar
     9. Pipeline (ข้อ 4.4 v2.2) + Kanban          JCRM.pipeline.* · JCRM.kanban.mount
    10. ตัวเลือกข้อมูลตาม persona                  JCRM.select.* (= JCRM.data.tasksFor(...) ฯลฯ)
    11. โครงหน้า + bootstrap                     JCRM.page({ id, render })

   หลัก: UI ซ่อนปุ่มเพื่อความสะดวกเท่านั้น ระบบจริงตรวจสิทธิ์ในฐานข้อมูล (ข้อ 9.1)
   คู่มือเต็ม: prototype/README.md
   ========================================================================= */
(function (root) {
  "use strict";

  var D = root.JCRM_DATA;
  var JCRM = {};
  var MINUS = "−";   /* − เครื่องหมายลบ (ข้อ 1.3) */
  var DASH = "–";    /* – ค่าว่าง/ไม่มีข้อมูล */
  var T = (D && D.meta && D.meta.texts) || {};

  /* =========================================================================
     1. DOM helper · ลิงก์ · storage · action registry
     ====================================================================== */
  function $(sel, ctx) { return (ctx || root.document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || root.document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* tagged template ที่ escape ค่าทุกตัว · ใช้ JCRM.raw(str) เมื่อค่าเป็น HTML ที่สร้างเองแล้ว */
  function Raw(s) { this.s = String(s); }
  Raw.prototype.toString = function () { return this.s; };
  function raw(s) { return new Raw(s); }
  function html(strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) {
      var v = arguments[i];
      if (Array.isArray(v)) { v = v.map(function (x) { return x instanceof Raw ? x.s : esc(x); }).join(""); }
      else { v = v instanceof Raw ? v.s : esc(v); }
      out += v + strings[i];
    }
    return raw(out);
  }
  function toHtml(v) { return v instanceof Raw ? v.s : String(v == null ? "" : v); }
  function isNil(v) { return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v)); }
  function find(list, key, value) {
    for (var i = 0; i < (list || []).length; i++) { if (list[i][key] === value) { return list[i]; } }
    return null;
  }
  function uid(prefix) { uid.n = (uid.n || 0) + 1; return (prefix || "jcrm") + "-" + uid.n; }

  function makeStore(kind) {
    return {
      get: function (key) { try { return root[kind].getItem(key); } catch (e) { return null; } },
      set: function (key, value) { try { root[kind].setItem(key, value); return true; } catch (e) { return false; } },
      remove: function (key) { try { root[kind].removeItem(key); } catch (e) { /* ไม่มี storage */ } },
      clear: function () { try { root[kind].clear(); } catch (e) { /* ไม่มี storage */ } }
    };
  }
  var storage = makeStore("localStorage");
  var session = makeStore("sessionStorage");

  function qs(name) {
    try { return new root.URLSearchParams(root.location.search).get(name); } catch (e) { return null; }
  }
  /* พารามิเตอร์ใน URL (sitemap-screen-specs ข้อ 1.1 · ใส่ได้เฉพาะรหัสอ้างอิง/รหัสตัวกรอง · ห้ามคำค้น/เบอร์/ชื่อ)
     ชื่อหลักตาม sitemap-screen-specs + ชื่อเดิมของ README ฉบับฐานเป็น alias */
  var PARAM_ALIASES = { c: ["c", "customer"], op: ["op", "opportunity"], qt: ["qt", "quotation"], lead: ["lead"], ex: ["ex"],
    issue: ["issue"], tab: ["tab"], group: ["group"], view: ["view"], mode: ["mode"], visit: ["visit"], branch: ["branch"], owner: ["owner"] };
  var MODE_ALIASES = { receive: "visit", add: "customer" };
  function param(name) {
    var keys = PARAM_ALIASES[name] || [name];
    for (var i = 0; i < keys.length; i++) {
      var v = qs(keys[i]);
      if (v !== null && v !== "") { return name === "mode" ? (MODE_ALIASES[v] || v) : v; }
    }
    return null;
  }
  /* link("customer-360", { c: "CUS-2026-000297" }) → "05-customer-360.html?c=CUS-2026-000297" */
  function link(screenId, params) {
    var sc = screen(screenId);
    if (!sc) { return "#"; }
    var q = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (!isNil(v)) { q.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); }
    });
    return sc.file + (q.length ? "?" + q.join("&") : "");
  }
  function linkTarget(target) { return target ? link(target.screen, target.params) : "#"; }

  /* action registry: ปุ่ม/แถวที่มี data-jcrm-action="ชื่อ" data-jcrm-id="รหัส" → handler(id, element, event) */
  var actions = {};
  function on(name, handler) { actions[name] = handler; return JCRM; }
  function dispatchAction(name, id, el, evt) {
    if (typeof actions[name] === "function") { actions[name](id, el, evt); return true; }
    if (root.console) { root.console.warn("JCRM: ยังไม่มี handler สำหรับ action \"" + name + "\" · ใช้ JCRM.on(\"" + name + "\", fn)"); }
    return false;
  }

  /* =========================================================================
     2. ตัวเข้าถึงข้อมูล
     ====================================================================== */
  function screen(id) { return find(D.screens, "id", id); }
  function role(code) { return find(D.roles, "code", code); }
  function staff(code) { return find(D.staff, "staffCode", code); }
  function branch(code) { return find(D.branches, "code", code); }
  function team(code) { return find(D.teams, "code", code); }
  function customer(no) { return find(D.customers, "customerNo", no); }
  /* ref("channels", "LINE") → แถว · ref("exportStatus", "EXPIRED") → แถวจาก D.enums */
  function ref(listName, code) {
    var list = D[listName] || (D.enums && D.enums[listName]);
    if (!list || !Array.isArray(list)) { return null; }
    var hit = find(list, "code", code);
    if (!hit && typeof list[0] === "string" && list.indexOf(code) !== -1) { return { code: code, labelTh: null }; }
    return hit;
  }
  function refList(listName) {
    var list = D[listName] || (D.enums && D.enums[listName]) || [];
    return list.map(function (x) { return typeof x === "string" ? { code: x, labelTh: null } : x; });
  }
  function label(listName, code) {
    var r = ref(listName, code);
    if (r && r.labelTh) { return r.labelTh; }
    if (r && r.titleTh) { return r.titleTh; }
    return isNil(code) ? DASH : (r ? String(code) : DASH);
  }
  function enumItem(listName, code) { return ref(listName, code); }
  function staffName(code) { var s = staff(code); return s ? s.displayName : DASH; }
  function branchName(code) { var b = branch(code); return b ? b.name : DASH; }
  /* get("kpis.org.values.VISITS") · get("recentCustomers.ST-0045") — path แบบจุด · รองรับ seg[key] = แถวที่ branch/staff/code ตรง */
  function get(path) {
    return String(path).split(".").reduce(function (o, seg) {
      if (o == null) { return undefined; }
      var m = /^([\w-]+)\[([^\]]+)\]$/.exec(seg);
      if (!m) { return o[seg]; }
      var arr = o[m[1]];
      return Array.isArray(arr) ? (find(arr, "branch", m[2]) || find(arr, "staff", m[2]) || find(arr, "code", m[2]) || undefined) : undefined;
    }, D);
  }
  function customerName(no, withPrefix) {
    var c = customer(no);
    if (!c) { return DASH; }
    return (withPrefix === false ? "" : T.customerPrefix) + c.displayName;
  }

  /* =========================================================================
     3. รูปแบบตัวเลขและวันที่ (ข้อ 1.2 · 1.3)
     ====================================================================== */
  /* แปลงเลขทศนิยม (number หรือ string) เป็นจำนวนเต็มคูณ 10^scale ด้วยการตัดสตริง
     แล้วปัด half away from zero จากหลักถัดไป — ตรงกับ round(x::numeric, n) ของ PostgreSQL */
  function toScaled(x, scale) {
    var s = typeof x === "number" ? String(x) : String(x).trim();
    if (/e/i.test(s)) { s = Number(s).toFixed(scale + 2); }
    var neg = s.charAt(0) === "-";
    if (neg || s.charAt(0) === "+") { s = s.slice(1); }
    var parts = s.split(".");
    var intPart = parts[0] || "0";
    var frac = (parts[1] || "") + "000000000000";
    var digits = intPart + frac.slice(0, scale);
    var n = parseInt(digits, 10) || 0;
    if (frac.charAt(scale) >= "5") { n += 1; }
    return neg && n !== 0 ? -n : n;
  }
  function pow10(n) { var p = 1; while (n-- > 0) { p *= 10; } return p; }
  /* หารจำนวนเต็มบวก a/b แล้วปัด half away from zero (ใช้เศษ ไม่ใช้ float) */
  function divRound(a, b) {
    var q = Math.floor(a / b);
    while (q * b > a) { q -= 1; }
    while ((q + 1) * b <= a) { q += 1; }
    var r = a - q * b;
    return (2 * r >= b) ? q + 1 : q;
  }
  function group3(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function scaledToText(absScaled, d, grouping) {
    var p = pow10(d);
    var ip = Math.floor(absScaled / p);
    var fp = absScaled - ip * p;
    var t = grouping ? group3(String(ip)) : String(ip);
    if (d > 0) { t += "." + String(fp + p).slice(1); }
    return t;
  }
  function signed(text, isNeg, isPos, withPlus) { return (isNeg ? MINUS : (isPos && withPlus ? "+" : "")) + text; }

  var fmt = {
    MINUS: MINUS,
    DASH: DASH,
    isNil: isNil,
    /* ปัดเป็นข้อความ d ตำแหน่ง: fmt.round(2.675, 2) → "2.68" */
    round: function (x, d) {
      if (isNil(x)) { return DASH; }
      var v = toScaled(x, d || 0);
      return signed(scaledToText(Math.abs(v), d || 0, false), v < 0, false, false);
    },
    /* 3,125 · ค่าลบใช้ − */
    int: function (n) {
      if (isNil(n)) { return DASH; }
      var v = toScaled(n, 0);
      return signed(group3(String(Math.abs(v))), v < 0, false, false);
    },
    /* การ์ด/ข้อความ ฿3,332,700 · มีสตางค์แสดง 2 ตำแหน่ง (฿28,900.50 · ข้อ 1.3 v2.2) */
    money: function (n) {
      if (isNil(n)) { return DASH; }
      return (toScaled(n, 2) < 0 ? MINUS : "") + "฿" + fmt.moneyTable(n).replace(MINUS, "");
    },
    /* ช่องตาราง 1,245,000 (หัวคอลัมน์ต้องมี "(บาท)") */
    moneyTable: function (n) {
      if (isNil(n)) { return DASH; }
      var v = toScaled(n, 2), a = Math.abs(v);
      var hasSatang = a % 100 !== 0;
      return signed(hasSatang ? scaledToText(a, 2, true) : group3(String(a / 100)), v < 0, false, false);
    },
    /* อัตรา/สัดส่วน num/den → "24.1%" · 1 ตำแหน่งเสมอ (รวม 100.0%) · ตัวหาร 0/ว่าง → "–" */
    pct: function (num, den, digits) {
      var d = digits === undefined ? 1 : digits;
      if (isNil(num) || isNil(den) || Number(den) === 0) { return DASH; }
      var a = toScaled(num, 2), b = toScaled(den, 2);
      var neg = (a < 0) !== (b < 0) && a !== 0;
      var q = divRound(Math.abs(a) * pow10(d + 2), Math.abs(b));
      return signed(scaledToText(q, d, true), neg && q !== 0, false, false) + "%";
    },
    /* อัตราที่เก็บเป็น {num, den, display} (data.js) → display หรือคำนวณ · null → "–" */
    rate: function (r) {
      if (!r) { return DASH; }
      if (r.display) { return r.display; }
      return fmt.pct(r.num, r.den);
    },
    /* ค่าร้อยละที่คำนวณแล้ว เช่น 95.4 → "95.4%" */
    pctValue: function (x, digits) {
      var d = digits === undefined ? 1 : digits;
      if (isNil(x)) { return DASH; }
      var v = toScaled(x, d);
      return signed(scaledToText(Math.abs(v), d, true), v < 0, false, false) + "%";
    },
    /* ส่วนต่างของจำนวน → "+12%" · "−5%" · "0%" · ก่อนหน้า 0/ว่าง → "–" */
    growth: function (current, previous) { return fmt.growthInfo(current, previous).text; },
    growthInfo: function (current, previous) {
      if (isNil(current) || isNil(previous) || Number(previous) === 0) { return { text: DASH, dir: "none" }; }
      var c = toScaled(current, 2), p = toScaled(previous, 2);
      var diff = c - p;
      var q = divRound(Math.abs(diff) * 100, Math.abs(p));
      var neg = (diff < 0) !== (p < 0);
      if (q === 0) { return { text: "0%", dir: "flat" }; }
      return { text: signed(String(q), neg, !neg, true) + "%", dir: neg ? "down" : "up" };
    },
    /* ส่วนต่างของอัตราเป็น pp จากอัตราที่ยังไม่ปัด → "+2.1 pp" */
    pp: function (n1, d1, n0, d0) { return fmt.ppInfo(n1, d1, n0, d0).text; },
    ppInfo: function (n1, d1, n0, d0) {
      if ([n1, d1, n0, d0].some(isNil) || Number(d1) === 0 || Number(d0) === 0) { return { text: DASH, dir: "none" }; }
      var A = toScaled(n1, 2), B = toScaled(d1, 2), C = toScaled(n0, 2), E = toScaled(d0, 2);
      var numer = A * E - C * B, denom = B * E;
      if (denom < 0) { numer = -numer; denom = -denom; }
      var q = divRound(Math.abs(numer) * 1000, denom);
      if (q === 0) { return { text: "0.0 pp", dir: "flat" }; }
      var neg = numer < 0;
      return { text: signed(scaledToText(q, 1, false), neg, !neg, true) + " pp", dir: neg ? "down" : "up" };
    },
    /* ข้อความป้ายเปลี่ยนแปลงที่เก็บไว้แล้ว ("+12%") → ทิศทาง up/down/flat/none */
    deltaDir: function (text) {
      if (isNil(text) || text === DASH) { return "none"; }
      var t = String(text).trim();
      if (t.charAt(0) === "+") { return "up"; }
      if (t.charAt(0) === MINUS || t.charAt(0) === "-") { return "down"; }
      return "flat";
    },
    /* เทียบเป้าหมายด้วยค่าที่ยังไม่ปัด (ข้อ 1.3): meetsTarget(2977, 3121, "OUTCOME_COMPLETION") → true */
    meetsTarget: function (num, den, kpiCode) {
      var t = D.kpiTargets[kpiCode];
      if (!t || isNil(num) || isNil(den) || Number(den) === 0) { return null; }
      var a = toScaled(num, 2) * 10000, b = toScaled(t.pct, 2) * toScaled(den, 2);
      return t.op === ">=" ? a >= b : a < b;
    },
    minutes: function (n) { return isNil(n) ? DASH : fmt.int(n) + " นาที"; },
    dash: function (v) { return isNil(v) ? DASH : String(v); },
    /* "แสดง 1–N จาก {ยอดรวม}" (ข้อ 13.0 ข้อ 10) · total ไม่รู้ → "–" · opts.unit เช่น "รายการ" */
    showing: function (shown, total, opts) {
      var unit = opts && opts.unit ? " " + opts.unit : "";
      var from = opts && opts.from ? opts.from : 1;
      var t = isNil(total) ? DASH : fmt.int(total);
      if (!shown) { return "แสดง 0 จาก " + t + unit; }
      return "แสดง " + fmt.int(from) + DASH + fmt.int(from + shown - 1) + " จาก " + t + unit;
    }
  };

  var TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  /* แยก ISO เป็นส่วนประกอบตามเวลา Asia/Bangkok โดยไม่พึ่ง timezone ของเครื่อง */
  function parseIso(iso) {
    if (isNil(iso)) { return null; }
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(String(iso));
    if (!m) { return null; }
    var p = { y: +m[1], mo: +m[2], d: +m[3], h: m[4] ? +m[4] : null, mi: m[5] ? +m[5] : null, s: m[6] ? +m[6] : 0 };
    if (m[7] && p.h !== null) {
      var off = 0;
      if (m[7] !== "Z") { var sg = m[7].charAt(0) === "-" ? -1 : 1; var hh = +m[7].substr(1, 2); var mm = +m[7].slice(-2); off = sg * (hh * 60 + mm); }
      if (off !== 420) {
        var t = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - off * 60000 + 420 * 60000;
        var dt = new Date(t);
        p = { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds() };
      }
    }
    return p;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function epochMinutes(p) { return Math.floor(Date.UTC(p.y, p.mo - 1, p.d, p.h || 0, p.mi || 0, 0) / 60000); }
  /* "11 ก.ย. 2569" */
  fmt.date = function (iso) { var p = parseIso(iso); return p ? p.d + " " + TH_MONTHS[p.mo - 1] + " " + (p.y + 543) : DASH; };
  /* "11 ก.ย." (การ์ด pipeline) */
  fmt.dayMonth = function (iso) { var p = parseIso(iso); return p ? p.d + " " + TH_MONTHS[p.mo - 1] : DASH; };
  /* "10:24 น." · opts.suffix=false → "10:24" (ข้อ 19.5 ข้อ 4: เวลาเดี่ยวมี "น.") */
  fmt.time = function (iso, opts) {
    var p = parseIso(iso);
    if (!p || p.h === null) { return DASH; }
    return pad2(p.h) + ":" + pad2(p.mi) + (opts && opts.suffix === false ? "" : " น.");
  };
  /* "11 ก.ย. 2569 10:24" (วันเวลาในตาราง/รายการไม่มี "น." · ข้อ 19.5 ข้อ 4) · opts.suffix=true → "… 10:24 น." */
  fmt.dateTime = function (iso, opts) {
    var p = parseIso(iso);
    if (!p) { return DASH; }
    if (p.h === null) { return fmt.date(iso); }
    return fmt.date(iso) + " " + fmt.time(iso, { suffix: !!(opts && opts.suffix) });
  };
  /* key วันที่ YYYY-MM-DD ตาม Asia/Bangkok — ใช้เทียบ "วันนี้" กับ D.meta.now */
  fmt.dayKey = function (iso) { var p = parseIso(iso); return p ? p.y + "-" + pad2(p.mo) + "-" + pad2(p.d) : null; };
  fmt.minutesOfDay = function (iso) { var p = parseIso(iso); return p && p.h !== null ? p.h * 60 + p.mi : null; };
  /* เทียบเวลาสองค่า (ISO) → −1 · 0 · 1 */
  fmt.compareIso = function (a, b) {
    var ka = fmt.dayKey(a), kb = fmt.dayKey(b);
    if (ka !== kb) { return ka < kb ? -1 : 1; }
    var ma = fmt.minutesOfDay(a) || 0, mb = fmt.minutesOfDay(b) || 0;
    return ma === mb ? 0 : (ma < mb ? -1 : 1);
  };
  /* นาทีเต็มจาก a ถึง b (จำนวนเต็ม · ใช้กับ "รอ {n} นาที") */
  fmt.minutesBetween = function (a, b) {
    var pa = parseIso(a), pb = parseIso(b);
    if (!pa || !pb) { return null; }
    return epochMinutes(pb) - epochMinutes(pa);
  };
  /* บวกวันให้ "YYYY-MM-DD" ด้วยจำนวนเต็ม */
  fmt.addDays = function (dayKey, n) {
    var p = parseIso(dayKey);
    if (!p) { return null; }
    var dt = new Date(Date.UTC(p.y, p.mo - 1, p.d) + n * 86400000);
    return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
  };
  /* ช่วงวันที่แบบรวมวันสุดท้าย เช่น "13 ส.ค. – 11 ก.ย. 2569" (design-system ข้อ 7.7) */
  fmt.rangeInclusive = function (startKey, endExclusiveKey) {
    var s = parseIso(startKey), e = parseIso(fmt.addDays(endExclusiveKey, -1));
    if (!s || !e) { return DASH; }
    var left = s.d + " " + TH_MONTHS[s.mo - 1] + (s.y !== e.y ? " " + (s.y + 543) : "");
    return left + " " + DASH + " " + e.d + " " + TH_MONTHS[e.mo - 1] + " " + (e.y + 543);
  };
  /* "ณ 11 ก.ย. 2569 10:24 น." */
  fmt.asOf = function (iso) { return "ณ " + fmt.dateTime(iso || D.meta.now, { suffix: true }); };

  /* =========================================================================
     4. ผู้ใช้ตัวอย่างและสิทธิ์ (ข้อ 7 · 8.0 · 8.1 · 13.5 · 13.13)
     ====================================================================== */
  function currentStaffCode() {
    var code = storage.get(D.meta.storageKey);
    return staff(code) ? code : D.meta.defaultStaffCode;
  }
  function currentStaff() { return staff(currentStaffCode()); }
  /* เปลี่ยนผู้ใช้ตัวอย่าง · ล้างค่า aal ที่จำลองไว้ · opts.reload = true โหลดหน้าใหม่ */
  function setStaff(code, opts) {
    if (!staff(code)) { return false; }
    storage.set(D.meta.storageKey, code);
    storage.remove(D.meta.aalStorageKey);
    session.remove(D.meta.branchSessionKey);
    if (opts && opts.reload && root.location) { root.location.reload(); }
    return true;
  }
  function requiresMfa(s) {
    return !!s && s.assignments.some(function (a) { var r = role(a.role); return r && r.requiresMfa; });
  }
  /* aal ของเซสชัน: บัญชีตัวอย่างที่ต้อง MFA ถือว่ายืนยัน TOTP แล้ว (aal2 · ข้อ 13.5) · STAFF ล้วน = aal1
     สลับจำลองได้ด้วย JCRM.setAal("aal1"|"aal2"|null) */
  function aal(s) {
    var o = storage.get(D.meta.aalStorageKey);
    if (o === "aal1" || o === "aal2") { return o; }
    return requiresMfa(s || currentStaff()) ? "aal2" : "aal1";
  }
  function setAal(value) {
    if (value === "aal1" || value === "aal2") { storage.set(D.meta.aalStorageKey, value); } else { storage.remove(D.meta.aalStorageKey); }
  }
  /* as = undefined | staffCode | { staffCode, aal } */
  function resolveAs(as) {
    if (as && typeof as === "object") { var s1 = staff(as.staffCode); return { staff: s1, aal: as.aal || aal(s1) }; }
    if (typeof as === "string") { var s2 = staff(as); return { staff: s2, aal: aal(s2) }; }
    var s3 = currentStaff();
    return { staff: s3, aal: aal(s3) };
  }
  /* สมาชิกทีม (รวมหัวหน้า) ของทีมในสาขา b ที่ staffCode เป็น is_leader */
  function ledTeamMembers(staffCode, b) {
    var led = D.teamMembers.filter(function (m) { var t = team(m.team); return m.staff === staffCode && m.isLeader && t && t.branch === b; })
      .map(function (m) { return m.team; });
    return D.teamMembers.filter(function (m) { return led.indexOf(m.team) !== -1; }).map(function (m) { return m.staff; });
  }
  function teamsOf(staffCode) {
    return D.teamMembers.filter(function (m) { return m.staff === staffCode; }).map(function (m) { return { team: team(m.team), isLeader: m.isLeader }; });
  }
  /* assignment ที่นับได้: staff ACTIVE · บทบาทที่ requires_mfa ต้อง aal2 · SUPERVISOR@X ต้องเป็นหัวหน้าทีมใน X (ข้อ 7.1 · 8.0) */
  function effectiveAssignments(as) {
    var who = resolveAs(as);
    if (!who.staff || who.staff.status !== "ACTIVE") { return []; }
    return who.staff.assignments.filter(function (a) {
      var r = role(a.role);
      if (!r) { return false; }
      if (r.requiresMfa && who.aal !== "aal2") { return false; }
      if (a.role === "SUPERVISOR" && ledTeamMembers(who.staff.staffCode, a.branch).length === 0) { return false; }
      return true;
    });
  }
  function roleCodes(as) {
    var out = [];
    effectiveAssignments(as).forEach(function (a) { if (out.indexOf(a.role) === -1) { out.push(a.role); } });
    return out;
  }
  var READ_THROUGH = ["visit.read", "interaction.read", "lead.read", "opportunity.read", "quotation.read", "transaction.read"];

  /* can(permission, ctx, as) — ตัดสินสิทธิ์สำหรับซ่อน/ปิดปุ่มตามข้อ 8.0
     ctx ว่าง                                → มีสิทธิ์นี้ในบางขอบเขตหรือไม่ (= app.has_permission)
     ctx.branch, ctx.owner, ctx.createdBy    → แถวที่มี branch_id (lead · opportunity · task · visit ...)
     ctx.viaCustomer = { branches, owner }   → read-through เฉพาะ *.read ของตาราง 9.4 (ไม่รวม task)
     ctx.customer = { branches, owner }      → แถวลูกค้า (เชื่อมสาขาผ่าน customer_branches)
     ctx.system = true                       → วัตถุระบบ (บัญชี · settings · integration) */
  function can(permission, ctx, as) {
    var perm = D.permissions[permission];
    var who = resolveAs(as);
    if (!perm || !who.staff) { return false; }
    var c = ctx || {};
    var hasCtx = c.branch !== undefined || !!c.customer || !!c.system;
    var list = effectiveAssignments({ staffCode: who.staff.staffCode, aal: who.aal });
    for (var i = 0; i < list.length; i++) {
      var a = list[i], cell = perm[a.role];
      if (!cell) { continue; }
      if (cell.aal2 && who.aal !== "aal2") { continue; }
      if (!hasCtx) { return true; }
      if (scopeMatches(cell.scope, a, c, who.staff.staffCode, permission)) { return true; }
    }
    if (c.viaCustomer && READ_THROUGH.indexOf(permission) !== -1) {
      return can("customer.read", { customer: c.viaCustomer }, { staffCode: who.staff.staffCode, aal: who.aal });
    }
    return false;
  }
  function scopeMatches(scope, a, c, me, permission) {
    if (scope === "SYSTEM") { return !!c.system; }
    if (scope === "ORGANIZATION") { return true; }
    if (c.customer) {
      var linked = (c.customer.branches || []).indexOf(a.branch) !== -1;
      if (!linked) { return false; }
      if (scope === "BRANCH") { return true; }
      if (scope === "TEAM") { return ledTeamMembers(me, a.branch).indexOf(c.customer.owner) !== -1; }
      return c.customer.owner === me;
    }
    if (c.branch === undefined || c.branch !== a.branch) { return false; }
    if (scope === "BRANCH") { return true; }
    if (scope === "TEAM") {
      /* lead.assign · task.assign ที่ T รวมรายการที่ owner ว่างในสาขาที่ตนเป็นหัวหน้าทีม (ข้อ 8.0 v2.2) */
      if (!c.owner && (permission === "lead.assign" || permission === "task.assign")) { return true; }
      if (!c.owner && c.createdBy === me) { return true; }
      return ledTeamMembers(me, a.branch).indexOf(c.owner) !== -1;
    }
    return c.owner === me || (!c.owner && c.createdBy === me);
  }
  /* สาขาที่มีสิทธิ์ p ที่ scope ≥ minScope (ไม่นับ SYSTEM · ORGANIZATION ขยายเป็นทุกสาขา) = app.scope_branch_ids */
  function scopeBranches(permission, minScope, as) {
    var perm = D.permissions[permission];
    var who = resolveAs(as);
    var min = D.scopeOrder.indexOf(minScope || "OWN");
    var out = [];
    if (!perm || !who.staff) { return out; }
    effectiveAssignments({ staffCode: who.staff.staffCode, aal: who.aal }).forEach(function (a) {
      var cell = perm[a.role];
      if (!cell || cell.scope === "SYSTEM" || (cell.aal2 && who.aal !== "aal2")) { return; }
      if (D.scopeOrder.indexOf(cell.scope) < min) { return; }
      var bs = cell.scope === "ORGANIZATION" ? D.branches.map(function (b) { return b.code; }) : [a.branch];
      bs.forEach(function (b) { if (out.indexOf(b) === -1) { out.push(b); } });
    });
    return out;
  }
  /* scope สูงสุดของสิทธิ์ p (ไม่ดูแถว) → "OWN" | "TEAM" | "BRANCH" | "ORGANIZATION" | "SYSTEM" | null */
  function topScope(permission, as) {
    var perm = D.permissions[permission];
    var who = resolveAs(as);
    var best = -1;
    if (!perm || !who.staff) { return null; }
    effectiveAssignments({ staffCode: who.staff.staffCode, aal: who.aal }).forEach(function (a) {
      var cell = perm[a.role];
      if (!cell || (cell.aal2 && who.aal !== "aal2")) { return; }
      best = Math.max(best, D.scopeOrder.indexOf(cell.scope));
    });
    return best < 0 ? null : D.scopeOrder[best];
  }
  /* access(permission, ctx, as) → { visible, allowed, reason }
     ข้อ 14.1 + sitemap-screen-specs ข้อ 1.5: บทบาทไม่มีสิทธิ์นั้นเลย → visible false (ซ่อน)
     มีสิทธิ์แต่แถวไม่ผ่านขอบเขต/ยังไม่ aal2 → visible true · allowed false · reason (แสดงแบบปิดพร้อมเหตุผล) */
  function access(permission, ctx, as) {
    var perm = D.permissions[permission];
    var who = resolveAs(as);
    var none = { visible: false, allowed: false, reason: null };
    if (!perm || !who.staff || who.staff.status !== "ACTIVE") { return none; }
    var holding = who.staff.assignments.filter(function (a) { return !!perm[a.role]; });
    if (!holding.length) { return none; }
    if (can(permission, ctx, { staffCode: who.staff.staffCode, aal: who.aal })) { return { visible: true, allowed: true, reason: null }; }
    var mfaBlocked = who.aal !== "aal2" && holding.some(function (a) { var r = role(a.role); return (r && r.requiresMfa) || perm[a.role].aal2; });
    var effective = effectiveAssignments({ staffCode: who.staff.staffCode, aal: who.aal }).filter(function (a) { return perm[a.role] && !(perm[a.role].aal2 && who.aal !== "aal2"); });
    if (!effective.length) { return { visible: true, allowed: false, reason: mfaBlocked ? T.reasonMfa : T.reasonOutOfBranch }; }
    var c = ctx || {};
    var rowBranches = c.customer ? (c.customer.branches || []) : (c.branch !== undefined ? [c.branch] : []);
    var inBranch = effective.filter(function (a) { return perm[a.role].scope === "ORGANIZATION" || rowBranches.indexOf(a.branch) !== -1; });
    if (!inBranch.length) { return { visible: true, allowed: false, reason: mfaBlocked ? T.reasonMfa : T.reasonOutOfBranch }; }
    var scopes = inBranch.map(function (a) { return perm[a.role].scope; });
    if (scopes.indexOf("TEAM") !== -1) { return { visible: true, allowed: false, reason: T.reasonTeam }; }
    if (scopes.indexOf("OWN") !== -1) { return { visible: true, allowed: false, reason: T.reasonOwn }; }
    return { visible: true, allowed: false, reason: mfaBlocked ? T.reasonMfa : T.reasonOutOfBranch };
  }
  /* เปิดหน้าได้หรือไม่: บทบาทที่นับได้ ∩ รายการบทบาทของหน้า (ข้อ 14.1) */
  function canOpen(screenIdOrRoles, as) {
    var roles = Array.isArray(screenIdOrRoles) ? screenIdOrRoles : (screen(screenIdOrRoles) || { roles: [] }).roles;
    var sc = Array.isArray(screenIdOrRoles) ? null : screen(screenIdOrRoles);
    if (sc && sc.isPublic) { return true; }
    return roleCodes(as).some(function (r) { return roles.indexOf(r) !== -1; });
  }
  function landingFile(as) {
    var codes = roleCodes(as);
    return codes.length === 1 && codes[0] === "SYSTEM_ADMIN" ? D.meta.landing.SYSTEM_ADMIN : D.meta.landing.other;
  }
  /* ช่องค้นหากลาง: ซ่อนเมื่อบทบาทของบัญชีมีเฉพาะ MARKETING/SYSTEM_ADMIN (ข้อ 14.3 v2.2) */
  function searchVisible(as) {
    var who = resolveAs(as);
    if (!who.staff || !who.staff.assignments.length) { return false; }
    return who.staff.assignments.some(function (a) { return D.meta.searchHiddenRoles.indexOf(a.role) === -1; });
  }
  /* ตัวเลือกช่วงเวลาอยู่ในหัวหน้า 02 09 12 เท่านั้น (ข้อ 14.3 v2.2) */
  function periodEnabled(screenId) {
    var sc = screen(screenId);
    return !!(sc && sc.periodPicker);
  }
  /* ข้อความบทบาท @ สาขา ของผู้ใช้ เช่น "ฝ่ายปฏิบัติการ @ JP1 · JP2 · JP3 · JP4" */
  function assignmentText(s, opts) {
    if (!s || !s.assignments.length) { return s && s.status === "INVITED" ? "ยังไม่มีบทบาท (INVITED)" : DASH; }
    var byRole = {};
    var order = [];
    s.assignments.forEach(function (a) {
      if (!byRole[a.role]) { byRole[a.role] = []; order.push(a.role); }
      if (a.branch) { byRole[a.role].push(opts && opts.branchNames ? branchName(a.branch) : a.branch); }
    });
    return order.map(function (rc) {
      var r = role(rc);
      var scope = byRole[rc].length ? byRole[rc].join(" · ") : (rc === "SYSTEM_ADMIN" ? "" : "องค์กร");
      return (r ? r.labelTh : rc) + (scope ? " @ " + scope : "");
    }).join(" / ");
  }
  function customerCtx(no) {
    var c = typeof no === "object" && no ? no : customer(no);
    return c ? { branches: c.branch ? [c.branch] : [], owner: c.owner } : { branches: [], owner: null };
  }

  /* =========================================================================
     5. ไอคอน (SVG เส้น 24×24 · currentColor) + component พื้นฐาน
     ====================================================================== */
  var ICONS = {
    home: ["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
    users: ["c:9,8,4", "M2 21c0-3.5 3-6 7-6s7 2.5 7 6", "M16 4a4 4 0 0 1 0 8", "M22 21c0-3-2-5-5-5.8"],
    user: ["c:12,8,4", "M4 21c0-4 3.6-7 8-7s8 3 8 7"],
    userPlus: ["c:9,8,4", "M2 21c0-3.5 3-6 7-6s7 2.5 7 6", "M19 8v6M16 11h6"],
    idCard: ["r:3,5,18,14,2", "c:9,11,2", "M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2", "M14 10h4M14 14h3"],
    kanban: ["r:3,4,5,16,1", "r:10,4,5,10,1", "r:17,4,4,13,1"],
    store: ["M4 10v10h16V10", "M2 10l2-6h16l2 6z", "M10 20v-5h4v5"],
    check: ["r:4,4,16,16,2", "M8 12l3 3 5-6"],
    tick: ["M5 12l5 5 9-10"],
    chart: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
    phone: ["r:7,2,10,20,2", "M11 18h2"],
    target: ["c:12,12,9", "c:12,12,5", "c:12,12,1"],
    shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"],
    key: ["c:8,15,4", "M11 12l9-9M17 6l3 3M15 8l2 2"],
    list: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
    download: ["M12 3v12M7 10l5 5 5-5M4 21h16"],
    history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 7v5l3 2"],
    lock: ["r:5,11,14,10,2", "M8 11V7a4 4 0 0 1 8 0v4"],
    gear: ["c:12,12,3", "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"],
    file: ["M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z", "M14 3v5h5", "M9 13h6M9 17h6"],
    login: ["M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4", "M10 17l5-5-5-5", "M15 12H3"],
    logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
    search: ["c:11,11,7", "M21 21l-4.3-4.3"],
    bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.9 1.9 0 0 0 3.4 0"],
    plus: ["M12 5v14M5 12h14"],
    more: ["M5 12h.01M12 12h.01M19 12h.01"],
    moreV: ["M12 5h.01M12 12h.01M12 19h.01"],
    calendar: ["r:3,4,18,17,2", "M8 2v4M16 2v4M3 10h18"],
    clock: ["c:12,12,9", "M12 7v5l3 2"],
    eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "c:12,12,3"],
    eyeOff: ["M3 3l18 18", "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2", "M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
    call: ["M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"],
    copy: ["r:9,9,12,12,2", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
    chat: ["M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"],
    mail: ["r:3,5,18,14,2", "M3 7l9 6 9-6"],
    globe: ["c:12,12,9", "M3 12h18", "M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"],
    chevron: ["M6 9l6 6 6-6"],
    arrowLeft: ["M19 12H5", "M12 19l-7-7 7-7"],
    x: ["M18 6L6 18M6 6l12 12"],
    info: ["c:12,12,9", "M12 16v-4M12 8h.01"],
    alert: ["M12 3l10 18H2z", "M12 10v4M12 17h.01"],
    building: ["r:4,3,16,18,1", "M9 21v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01"],
    money: ["r:2,6,20,12,2", "c:12,12,2", "M6 12h.01M18 12h.01"],
    filter: ["M3 5h18l-7 8v6l-4 2v-8z"],
    refresh: ["M21 12a9 9 0 1 1-2.6-6.4", "M21 3v6h-6"],
    drag: ["M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"],
    monitor: ["r:2,4,20,13,2", "M8 21h8M12 17v4"]
  };
  function icon(name, cls) {
    var parts = ICONS[name] || ICONS.info;
    var inner = parts.map(function (p) {
      var n;
      if (p.indexOf("c:") === 0) { n = p.slice(2).split(","); return '<circle cx="' + n[0] + '" cy="' + n[1] + '" r="' + n[2] + '"></circle>'; }
      if (p.indexOf("r:") === 0) { n = p.slice(2).split(","); return '<rect x="' + n[0] + '" y="' + n[1] + '" width="' + n[2] + '" height="' + n[3] + '" rx="' + n[4] + '"></rect>'; }
      return '<path d="' + p + '"></path>';
    }).join("");
    return '<svg class="' + esc(cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (name === "more" || name === "moreV" ? "3" : "1.8") +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }
  var CHANNEL_ICON = { WALK_IN: "store", LINE: "chat", FACEBOOK: "chat", INSTAGRAM: "chat", TIKTOK: "chat", PHONE: "call", WEBSITE: "globe" };
  var CONTACT_ICON = { PHONE: "call", LINE_ID: "chat", LINE_USER_ID: "chat", FACEBOOK: "chat", INSTAGRAM: "chat", TIKTOK: "chat", EMAIL: "mail" };
  var CONTACT_LABEL = { PHONE: "โทรศัพท์", LINE_ID: "LINE ID", LINE_USER_ID: "LINE userId", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", EMAIL: "อีเมล" };

  var ui = {};
  ui.badge = function (text, tone, extra, attrs) {
    return '<span class="badge badge--' + esc(tone || "neutral") + (extra ? " " + esc(extra) : "") + '"' + (attrs ? " " + attrs : "") + ">" + esc(text) + "</span>";
  };
  /* ป้าย lifecycle (ข้อ 3.4 · สีข้อ 15) */
  ui.lifecycle = function (code) {
    var s = find(D.lifecycleStages, "code", code);
    return s ? ui.badge(s.labelTh, s.tone, "badge--lifecycle") : "";
  };
  /* ป้ายเสริมตามลำดับข้อ 3.5 สูงสุด 3 ป้าย เกินแสดง +N */
  ui.supplementary = function (keys) {
    var list = D.supplementaryBadges.filter(function (b) { return (keys || []).indexOf(b.key) !== -1; });
    var shown = list.slice(0, D.supplementaryBadgeMax);
    var hidden = list.slice(D.supplementaryBadgeMax);
    var out = shown.map(function (b) { return ui.badge(b.labelTh, b.tone, "badge--supp" + (b.key === "vip" ? " badge--vip" : "")); }).join("");
    if (hidden.length) {
      var names = hidden.map(function (b) { return b.labelTh; }).join(" · ");
      out += '<span class="badge badge--more" data-tooltip="' + esc(names) + '" aria-label="ป้ายเพิ่มเติม: ' + esc(names) + '">+' + hidden.length + "</span>";
    }
    return out;
  };
  ui.customerBadges = function (c) {
    var cu = typeof c === "string" ? customer(c) : c;
    if (!cu) { return ""; }
    return '<span class="badge-row">' + ui.lifecycle(cu.lifecycle) + ui.supplementary(cu.badges) + "</span>";
  };
  /* ป้ายสถานะจากรายการที่มี tone · ui.status("exportStatus", "EXPIRED") · รองรับ D.enums */
  ui.status = function (listName, code) {
    if (isNil(code)) { return '<span class="t-muted">' + DASH + "</span>"; }
    var r = ref(listName, code);
    return ui.badge(r && r.labelTh ? r.labelTh : code, (r && r.tone) || "neutral", "badge--square");
  };
  ui.statusBadge = ui.status;
  /* ป้ายความสำคัญ (C-BADGE-PRIORITY) · null → "" (การ์ดตัวอย่างที่ไม่มี priority ไม่แสดงป้าย) */
  ui.priority = function (code) {
    var p = find(D.priorities, "code", code);
    return p ? '<span class="priority" data-priority="' + esc(code) + '">' + esc(p.labelTh) + "</span>" : "";
  };
  ui.priorityBadge = function (code) {
    var p = find(D.priorities, "code", code);
    return p ? ui.badge(p.labelTh, p.tone, "badge--priority") : "";
  };
  ui.interestLevel = function (code) { return isNil(code) ? "" : ui.status("interestLevel", code); };
  ui.channel = function (code, opts) {
    var ch = find(D.channels, "code", code);
    if (!ch) { return DASH; }
    var text = opts && opts.short ? ch.shortLabel : ch.labelTh;
    return '<span class="row nowrap" style="gap:var(--space-1)"><span class="channel-dot has-channel" data-channel="' + esc(code) + '" aria-hidden="true"></span>' + esc(text) + "</span>";
  };
  /* อักษรย่อ (C-AVATAR · design-system ข้อ 7.5): ลูกค้า "สมชาย ใจดี" → "สจ" · พนักงาน "คุณขวัญ" → "ข" · ข้ามสระหน้า เ แ โ ใ ไ */
  ui.initials = function (name) {
    var words = String(name || "").replace(/^คุณ/, "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return words.map(function (w) {
      for (var i = 0; i < w.length; i++) {
        var ch = w.charAt(i);
        if ("เแโใไ".indexOf(ch) === -1) { return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch; }
      }
      return "";
    }).join("") || "?";
  };
  ui.avatar = function (name, size, opts) {
    return '<span class="avatar' + (size ? " avatar--" + esc(size) : "") + (opts && opts.solid ? " avatar--solid" : "") + '" aria-hidden="true">' + esc(ui.initials(name)) + "</span>";
  };
  /* ป้ายเปลี่ยนแปลงจากข้อความที่คำนวณแล้ว ("+12%" · "−0.4 pp" · "0%" · "–" = ไม่แสดง) */
  ui.delta = function (text, note) {
    if (isNil(text) || text === DASH) { return ""; }
    var dir = fmt.deltaDir(text);
    return '<span class="delta delta--' + dir + '"' + (note ? ' data-tooltip="' + esc(note) + '" tabindex="0"' : "") + ">" + esc(text) + "</span>";
  };
  /* ป้ายเทียบเป้า (ข้อ 12.3) ใช้ค่าที่ยังไม่ปัด */
  ui.target = function (num, den, kpiCode) {
    var t = D.kpiTargets[kpiCode];
    var ok = fmt.meetsTarget(num, den, kpiCode);
    if (ok === null || !t) { return ""; }
    var goal = "เป้า " + (t.op === ">=" ? "≥ " : "< ") + t.pct + "%";
    return '<span class="target target--' + (ok ? "pass" : "fail") + '">' + (ok ? "ผ่าน" : "ต่ำกว่าเป้า") + " · " + esc(goal) + "</span>";
  };
  function presetOf(code) { return find(D.meta.presets, "code", code); }
  /* tooltip ของ delta ตาม preset (design-system ข้อ 7.3) */
  ui.deltaTooltip = function (preset) {
    if (preset === "TODAY") { return "เทียบวันเดียวกันสัปดาห์ก่อน ถึง " + fmt.time(D.meta.now); }
    var prev = D.meta.periods[(preset || "LAST_30_DAYS") + "_PREVIOUS"];
    return prev ? "เทียบ " + fmt.rangeInclusive(prev.start, prev.endExclusive) + " · " + T.openPeriod : null;
  };
  /* การ์ด KPI (C-KPI · C-KPI-TARGET)
     o = { label, value (number) | display (ข้อความ), format: "int"|"money"|"pct", preset: "LAST_30_DAYS"|"TODAY", asOf: true,
           period (ข้อความแทน), delta, deltaNote, target: { num, den, kpi }, sub, note, href, icon, tooltip, compact } */
  ui.kpiCard = function (o) {
    var v = o.display;
    if (isNil(v)) {
      if (o.format === "pct" && o.rate) { v = fmt.rate(o.rate); }
      else if (typeof o.value === "string") { v = o.value; }
      else { v = o.format === "money" ? fmt.money(o.value) : fmt.int(o.value); }
    }
    var isNull = v === DASH;
    var period = o.period || (o.asOf ? fmt.asOf() : (o.preset ? (presetOf(o.preset) || {}).labelTh + (o.preset === "TODAY" ? " ถึง " + fmt.time(D.meta.now) : "") : ""));
    var foot = "";
    if (o.delta) { foot += ui.delta(o.delta, o.deltaNote || ui.deltaTooltip(o.preset)); }
    var targetHtml = "";
    if (o.target) {
      var t = D.kpiTargets[o.target.kpi];
      var ok = fmt.meetsTarget(o.target.num, o.target.den, o.target.kpi);
      if (t && ok !== null) {
        var scaleMax = t.op === ">=" ? 100 : 10;
        var valPct = Number(o.target.num) * 100 / Number(o.target.den);
        var fillW = Math.min(100, Math.max(0, valPct * 100 / scaleMax));
        var goalW = Math.min(100, t.pct * 100 / scaleMax);
        targetHtml = '<div class="kpi-target__bar" aria-hidden="true"><span class="kpi-target__fill" style="width:' + num1(fillW) + '%"></span><span class="kpi-target__goal" style="left:' + num1(goalW) + '%"></span></div>';
        foot += ui.target(o.target.num, o.target.den, o.target.kpi);
      }
    }
    if (o.foot) { foot += toHtml(o.foot); }
    var tag = o.href ? "a" : "div";
    var aria = [o.label, period, v].filter(Boolean).join(" ") + (o.delta ? " เปลี่ยนแปลง " + o.delta : "");
    return "<" + tag + ' class="kpi-card' + (o.compact ? " kpi-card--compact" : "") + '"' + (o.href ? ' href="' + esc(o.href) + '"' : "") + ' role="group" aria-label="' + esc(aria) + '">' +
      '<div class="kpi-card__head">' + (o.icon ? '<span class="kpi-card__icon">' + icon(o.icon) + "</span>" : "") +
      '<span class="kpi-card__label">' + esc(o.label) + "</span>" +
      (o.tooltip ? ' <span class="info-dot" tabindex="0" data-tooltip="' + esc(o.tooltip) + '" aria-label="' + esc(o.tooltip) + '">i</span>' : "") + "</div>" +
      (period ? '<div class="kpi-card__period">' + esc(period) + "</div>" : "") +
      '<div class="kpi-card__value' + (isNull ? " is-null" : "") + '">' + esc(v) + (o.unit ? "<small>" + esc(o.unit) + "</small>" : "") + "</div>" +
      (o.sub ? '<div class="kpi-card__sub">' + esc(o.sub) + "</div>" : "") + targetHtml +
      '<div class="kpi-card__foot">' + foot + "</div>" + (o.note ? '<p class="kpi-card__note">' + esc(o.note) + "</p>" : "") + "</" + tag + ">";
  };
  /* การ์ดจาก D.dashboards[].cards[] (ข้อ 14.7) */
  ui.kpiFromCard = function (card, opts) {
    return ui.kpiCard({ label: card.labelTh, display: card.display, delta: card.delta, preset: card.asOf ? null : card.preset, asOf: card.asOf,
      href: opts && opts.links === false ? null : (card.target ? linkTarget(card.target) : null), note: card.noteTh });
  };
  ui.kpiGrid = function (cards) { return '<div class="kpi-grid">' + (cards || []).map(toHtml).join("") + "</div>"; };

  /* สถานะของหน้า/วิดเจ็ต (C-STATE-*) · ui.state("empty", { title, text, action }) */
  var STATE_DEF = {
    empty: { icon: "list", title: function () { return T.stateEmpty; } },
    noresult: { icon: "filter", title: function () { return T.stateNoResult; } },
    error: { icon: "alert", title: function () { return T.stateError; }, cls: "state--error" },
    notfound: { icon: "search", title: function () { return T.stateNotFound; }, cls: "state--card" },
    locked: { icon: "lock", title: function () { return T.stateLocked; } },
    "desktop-only": { icon: "monitor", title: function () { return T.desktopOnly; }, cls: "state--card" }
  };
  ui.state = function (kind, o) {
    o = o || {};
    if (kind === "loading") {
      return '<div class="state state--compact" aria-busy="true"><span class="skeleton" style="width:60%"></span><span class="skeleton" style="width:80%"></span><span class="sr-only">' + esc(T.stateLoading) + "</span></div>";
    }
    if (kind === "noaccess") { return ui.noPermission(o); }
    if (kind === "mfa") {
      return '<div class="state-bar state-bar--mfa" role="alert">' + icon("lock", "nav-icon") + "<span>" + esc(o.text || T.stateMfa) + "</span></div>";
    }
    if (kind === "sample") { return ui.sampleNote(o); }
    var def = STATE_DEF[kind] || STATE_DEF.empty;
    var action = o.action ? toHtml(o.action) : "";
    if (kind === "noresult" && !o.action && o.clearAction) { action = ui.button({ label: "ล้างตัวกรอง", variant: "ghost", action: o.clearAction }); }
    if (kind === "error" && !o.action && o.retryAction) { action = ui.button({ label: "ลองอีกครั้ง", variant: "secondary", action: o.retryAction }); }
    if (kind === "locked" && o.phase) { action = ui.badge("Phase " + o.phase, "neutral", "badge--square") + action; }
    if (kind === "desktop-only" && !o.action) { action = ui.button({ label: "กลับหน้าแรก", variant: "secondary", href: landingFile() }); }
    return '<div class="state ' + (def.cls || "") + (o.compact ? " state--compact" : "") + '"' + (kind === "error" ? ' role="alert"' : "") + ">" +
      '<span class="state__icon">' + icon(o.icon || def.icon) + "</span>" +
      '<p class="state__title">' + esc(o.title || def.title()) + "</p>" +
      (o.text ? '<p class="state__text">' + esc(o.text) + "</p>" : "") + action + "</div>";
  };
  ui.emptyState = function (o) { return ui.state("empty", o); };
  /* แถบข้อมูลตัวอย่าง (C-STATE-SAMPLE · prototype เท่านั้น)
     o = { shown, total } → "ข้อมูลตัวอย่างมีเฉพาะรายการที่ระบุชื่อ · แสดง k จาก N รายการ" · o = { scopeTh } → "ไม่มีข้อมูลตัวอย่างสำหรับ{ขอบเขต}" · o = { text } */
  ui.sampleNote = function (o) {
    o = o || {};
    var text = o.text;
    if (!text && o.scopeTh) { text = T.stateSampleNone.replace("{ขอบเขต}", o.scopeTh); }
    if (!text) { text = T.stateSampleShowing.replace("{k}", fmt.int(o.shown || 0)).replace("{N}", isNil(o.total) ? DASH : fmt.int(o.total)); }
    return '<p class="state-bar state-bar--sample" role="note">' + esc(text) + "</p>";
  };
  /* การ์ดไม่มีสิทธิ์ (ข้อ 14.1 · C-STATE-NOACCESS-PAGE) · o = { roles, text, inline } */
  ui.noPermission = function (o) {
    o = o || {};
    var roles = (o.roles || []).map(function (rc) { var r = role(rc); return '<span class="chip">' + esc(r ? r.labelTh : rc) + "</span>"; }).join("");
    return '<section class="no-permission' + (o.inline ? " no-permission--inline" : "") + '" role="alert">' +
      '<span class="no-permission__icon">' + icon("lock") + "</span>" +
      "<h2>" + esc(o.title || T.noPermissionTitle) + "</h2>" +
      (o.text ? '<p class="t-sm t-muted">' + esc(o.text) + "</p>" : "") +
      (roles ? '<p class="t-sm">หน้านี้เปิดได้สำหรับ</p><div class="no-permission__roles">' + roles + "</div>" : "") +
      (o.inline ? "" : '<div class="btn-group"><a class="btn btn--secondary" href="' + esc(landingFile()) + '">กลับหน้าแรก</a><a class="btn btn--ghost" href="index.html">สลับผู้ใช้ตัวอย่าง</a></div>') + "</section>";
  };
  /* แถบคำเตือนข้อมูลอ่อนไหว (C-PII-WARN · ข้อ 6.9) */
  ui.piiWarn = function () { return '<p class="pii-warn" role="note">' + icon("alert") + "<span>" + esc(T.noteWarning) + "</span></p>"; };

  /* ปุ่ม · o = { label, variant: "accent"|"primary"|"secondary"|"outline"|"ghost"|"danger"|"danger-outline", href, action, id, icon, size, block,
                 disabledReason, busy, attrs, iconOnly }
     มี disabledReason → aria-disabled + tooltip (กดแล้ว toast เหตุผล) · action → data-jcrm-action (ผูกด้วย JCRM.on) */
  ui.button = function (o) {
    var cls = "btn btn--" + (o.variant || "secondary") + (o.size ? " btn--" + o.size : "") + (o.block ? " btn--block" : "");
    var inner = (o.icon ? icon(o.icon) : "") + (o.iconOnly ? '<span class="sr-only">' + esc(o.label) + "</span>" : "<span>" + esc(o.label) + "</span>");
    var attrs = (o.attrs ? " " + o.attrs : "") + (o.action ? ' data-jcrm-action="' + esc(o.action) + '"' : "") + (!isNil(o.id) ? ' data-jcrm-id="' + esc(o.id) + '"' : "") +
      (o.busy ? ' aria-busy="true"' : "");
    if (o.disabledReason) {
      return '<button type="button" class="' + cls + '" aria-disabled="true" data-tooltip="' + esc(o.disabledReason) + '" aria-label="' +
        esc(o.label + " (" + o.disabledReason + ")") + '"' + attrs + ">" + inner + "</button>";
    }
    if (o.href) { return '<a class="' + cls + '" href="' + esc(o.href) + '"' + attrs + ">" + inner + "</a>"; }
    return '<button type="button" class="' + cls + '"' + attrs + (o.iconOnly ? ' aria-label="' + esc(o.label) + '"' : "") + ">" + inner + "</button>";
  };
  /* ปุ่มตามสิทธิ์ · o = ui.button options + { permission, ctx, as, reason (แทนเหตุผลมาตรฐาน), extra: { ok, reason } }
     ไม่มีสิทธิ์นั้นเลย → "" (ซ่อน) · มีแต่แถว/สถานะไม่ผ่าน → ปุ่มปิดพร้อมเหตุผล (ข้อ 14.1) */
  ui.permButton = function (o) {
    var a = access(o.permission, o.ctx, o.as);
    if (!a.visible) { return ""; }
    var copy = {};
    Object.keys(o).forEach(function (k) { copy[k] = o[k]; });
    if (!a.allowed) { copy.disabledReason = o.reason || a.reason; }
    else if (o.extra && o.extra.ok === false) { copy.disabledReason = o.extra.reason; }
    return ui.button(copy);
  };
  /* "แสดง 1–N จาก {ยอดรวม}" (ข้อ 13.0 ข้อ 10) */
  ui.showing = function (n, total, opts) { return fmt.showing(n, total, opts); };
  ui.pagination = function (o) {
    o = o || {};
    var pages = o.pages || 1, page = o.page || 1;
    var btns = "";
    if (pages > 1) {
      for (var i = 1; i <= pages; i++) {
        btns += '<button type="button" class="pagination__page"' + (i === page ? ' aria-current="page"' : "") + (o.action ? ' data-jcrm-action="' + esc(o.action) + '" data-jcrm-id="' + i + '"' : "") + ">" + i + "</button>";
      }
    }
    return '<div class="pagination"><span class="pagination__label">' + esc(fmt.showing(o.shown, o.total, { unit: o.unit, from: o.from })) + "</span>" +
      (btns ? '<div class="pagination__pages">' + btns + "</div>" : "") + "</div>";
  };

  /* ตัวเลือกช่วงเวลา (C-PERIOD) — ใช้ในหัวหน้า 02 09 12 เท่านั้น (ข้อ 14.3 v2.2) */
  ui.periodPicker = function (preset) {
    var p = presetOf(preset || state.preset) || presetOf(D.meta.defaultPreset);
    var range = p.code === "TODAY" ? fmt.date(D.meta.now) : (D.meta.periods[p.code] ? fmt.rangeInclusive(D.meta.periods[p.code].start, D.meta.periods[p.code].endExclusive) : "");
    return '<div class="popover-host"><button type="button" class="period-picker period-picker--header" data-jcrm-pop-trigger="period" aria-haspopup="menu" aria-expanded="false">' +
      icon("calendar") + '<span><span class="period-picker__label">' + esc(p.labelTh) + '</span><span class="period-picker__range">' + esc(range) + "</span></span>" + icon("chevron") + "</button></div>";
  };
  /* หัวหน้า (C-SHELL page header)
     o = { title, lead, back: { label, href }, breadcrumb: [{ label, href }], meta: html, actions: [html | ui.button options], period: true/false (ค่าเริ่มต้นตามหน้า) } */
  ui.pageHeader = function (o) {
    o = o || {};
    var showPeriod = o.period === undefined ? state.periodEnabled : (o.period && state.periodEnabled);
    var crumbs = (o.breadcrumb || []).length ? '<ol class="breadcrumb">' + o.breadcrumb.map(function (b) {
      return "<li>" + (b.href ? '<a href="' + esc(b.href) + '">' + esc(b.label) + "</a>" : esc(b.label)) + "</li>";
    }).join("") + "</ol>" : "";
    var acts = (o.actions || []).map(function (a) { return typeof a === "object" && !(a instanceof Raw) ? (a.permission ? ui.permButton(a) : ui.button(a)) : toHtml(a); }).join("");
    return '<header class="page-header">' +
      '<div class="page-header__main">' + (o.back ? '<a class="page-header__back" href="' + esc(o.back.href) + '">' + icon("arrowLeft") + esc(o.back.label) + "</a>" : "") + crumbs +
      '<h1 class="page-header__title">' + esc(o.title) + "</h1>" + (o.lead ? '<p class="page-header__lead">' + esc(o.lead) + "</p>" : "") +
      (o.meta ? '<div class="page-header__meta">' + toHtml(o.meta) + "</div>" : "") + "</div>" +
      ((showPeriod || acts) ? '<div class="page-header__actions">' + (showPeriod ? ui.periodPicker() : "") + acts + "</div>" : "") + "</header>";
  };
  /* select สาขาในหน้า (ตัวกรองของหน้า · ไม่ใช่แถบบน) · o = { id, permission, value, includeAll, label } */
  ui.branchSelect = function (o) {
    o = o || {};
    var list = scopeBranches(o.permission || "customer.read", "OWN");
    if (list.length <= 1) {
      return '<div class="field field--inline"><span class="label">' + esc(o.label || "สาขา") + '</span><span class="t-sm">' + esc(list.length ? branchName(list[0]) : DASH) + "</span></div>";
    }
    var opts = (o.includeAll === false ? [] : [{ code: "ALL", name: "ทุกสาขา" }]).concat(list.map(function (c) { return { code: c, name: branchName(c) }; }));
    return '<div class="field field--inline"><label class="label" for="' + esc(o.id || "branch-filter") + '">' + esc(o.label || "สาขา") + "</label>" +
      '<select class="select" id="' + esc(o.id || "branch-filter") + '"' + (o.action ? ' data-jcrm-change="' + esc(o.action) + '"' : "") + ">" + opts.map(function (b) {
        return '<option value="' + esc(b.code) + '"' + (b.code === (o.value || "ALL") ? " selected" : "") + ">" + esc(b.name) + "</option>";
      }).join("") + "</select></div>";
  };
  /* select preset ในตัวกรองของหน้า (เช่น "ติดต่อล่าสุด" หน้า 03) · เปิดเฉพาะ TODAY/LAST_30_DAYS (ข้อ 12.0) */
  ui.presetSelect = function (o) {
    o = o || {};
    return '<div class="field field--inline"><label class="label" for="' + esc(o.id || "preset-filter") + '">' + esc(o.label || "ช่วงเวลา") + "</label>" +
      '<select class="select" id="' + esc(o.id || "preset-filter") + '"' + (o.action ? ' data-jcrm-change="' + esc(o.action) + '"' : "") + ">" + D.meta.presets.map(function (p) {
        return '<option value="' + esc(p.code) + '"' + (p.code === (o.value || D.meta.defaultPreset) ? " selected" : "") + (p.enabled ? "" : " disabled") + ">" +
          esc(p.labelTh + (p.enabled ? "" : " — " + T.presetDisabled)) + "</option>";
      }).join("") + "</select></div>";
  };
  /* segmented control · o = { id, label, options: [{ value, label }], value, action } → กดแล้วเรียก action(value) */
  ui.segmented = function (o) {
    return '<div class="segmented" role="radiogroup" aria-label="' + esc(o.label || "") + '"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + ">" + o.options.map(function (op) {
      return '<button type="button" class="segmented__option" role="radio" aria-checked="' + (op.value === o.value) + '" data-jcrm-segment="' + esc(o.action || "") + '" data-value="' + esc(op.value) + '">' + esc(op.label) + "</button>";
    }).join("") + "</div>";
  };
  /* stepper (C-STEPPER) · o = { name, id, label, value, min, max, required } */
  ui.stepper = function (o) {
    var v = isNil(o.value) ? (o.min || 1) : o.value, min = isNil(o.min) ? 1 : o.min;
    var id = o.id || uid("stepper");
    return '<div class="field"><label class="label" for="' + esc(id) + '">' + esc(o.label || "") + (o.required ? '<span class="req" aria-hidden="true">*</span><span class="sr-only">(จำเป็น)</span>' : "") + "</label>" +
      '<div class="stepper" data-jcrm-stepper data-min="' + esc(min) + '"' + (isNil(o.max) ? "" : ' data-max="' + esc(o.max) + '"') + ">" +
      '<button type="button" class="stepper__btn" data-step="-1" aria-label="ลด"' + (v <= min ? " disabled" : "") + ">−</button>" +
      '<input class="stepper__value" id="' + esc(id) + '" name="' + esc(o.name || id) + '" type="number" inputmode="numeric" role="spinbutton" min="' + esc(min) + '"' + (isNil(o.max) ? "" : ' max="' + esc(o.max) + '"') + ' value="' + esc(v) + '">' +
      '<button type="button" class="stepper__btn" data-step="1" aria-label="เพิ่ม">+</button></div></div>';
  };
  /* กลุ่มชิป (C-CHIPS) · o = { name, label, options | ref, value (string | array), multiple, required, disabled } */
  ui.chipGroup = function (o) {
    var opts = o.options || refList(o.ref).filter(function (x) { return x.isActive !== false; }).map(function (x) { return { value: x.code, label: x.labelTh || x.code }; });
    var vals = Array.isArray(o.value) ? o.value : (isNil(o.value) ? [] : [o.value]);
    var type = o.multiple ? "checkbox" : "radio";
    return '<fieldset class="fieldset"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + "><legend>" + esc(o.label || "") + (o.required ? '<span class="req" aria-hidden="true">*</span><span class="sr-only">(จำเป็น)</span>' : "") + "</legend>" +
      '<div class="chip-group" role="' + (o.multiple ? "group" : "radiogroup") + '">' + opts.map(function (op) {
        return '<label class="chip-option"><input type="' + type + '" name="' + esc(o.name) + '" value="' + esc(op.value) + '"' + (vals.indexOf(op.value) !== -1 ? " checked" : "") +
          (o.disabled || op.disabled ? " disabled" : "") + "><span>" + esc(op.label) + "</span></label>";
      }).join("") + "</div></fieldset>";
  };
  /* แท็บ (C-TABS) · o = { id, label, tabs: [{ id, label, count, html, hidden }], selected, variant: "pill", param: "tab" }
     แท็บที่ hidden (ไม่มีสิทธิ์) ไม่แสดง · param → อ่าน/เขียน ?tab= · เปลี่ยนแท็บยิง jcrm:tabchange { tabsId, tab } */
  ui.tabs = function (o) {
    var tabs = (o.tabs || []).filter(function (t) { return !t.hidden; });
    var wanted = (o.param && qs(o.param)) || o.selected || (tabs[0] && tabs[0].id);
    if (!find(tabs, "id", wanted)) { wanted = tabs[0] && tabs[0].id; }
    return '<div class="tabs-block" data-jcrm-tabs="' + esc(o.id) + '"' + (o.param ? ' data-param="' + esc(o.param) + '"' : "") + ">" +
      '<div class="tabs' + (o.variant === "pill" ? " tabs--pill" : "") + '" role="tablist" aria-label="' + esc(o.label || "") + '">' + tabs.map(function (t) {
        var on = t.id === wanted;
        return '<button type="button" class="tab" role="tab" id="' + esc(o.id + "-tab-" + t.id) + '" aria-controls="' + esc(o.id + "-panel-" + t.id) + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-tab="' + esc(t.id) + '">' +
          esc(t.label) + (isNil(t.count) ? "" : '<span class="tab__count">' + esc(fmt.int(t.count)) + "</span>") + (t.error ? '<span class="badge badge--danger badge--square" aria-label="มีข้อผิดพลาด">!</span>' : "") + "</button>";
      }).join("") + "</div>" + tabs.map(function (t) {
        return '<div class="tabpanel" role="tabpanel" id="' + esc(o.id + "-panel-" + t.id) + '" aria-labelledby="' + esc(o.id + "-tab-" + t.id) + '"' + (t.id === wanted ? "" : " hidden") + ">" + toHtml(t.html || "") + "</div>";
      }).join("") + "</div>";
  };

  /* =========================================================================
     6. ตาราง · รายการการ์ด · ไทม์ไลน์ · คิว · งาน · ข้อมูลติดต่อ
     ====================================================================== */
  /* ค่าช่องตาราง ตาม format (null/undefined → "–" สีรอง)
     "int" · "money" (฿ · การ์ด) · "moneyTable" (ไม่มี ฿ · หัวคอลัมน์ต้องมี "(บาท)") · "rate" ({num,den,display}) · "pct" ([num,den])
     "date" · "dateTime" · "time" · "dayMonth" · "channel" · "branch" · "staff" · "customer" · "customerLink" · "lifecycle" · "badges"
     "priority" · "status:<listName>" · "code" · "text" (ค่าเริ่มต้น) */
  function formatCell(value, format, row) {
    if (typeof format === "function") { return toHtml(format(value, row)); }
    if (isNil(value) || (format === "rate" && !value)) { return '<span class="is-null">' + DASH + "</span>"; }
    var f = format || "text";
    if (f.indexOf("status:") === 0) { return ui.status(f.slice(7), value); }
    switch (f) {
      case "int": return esc(fmt.int(value));
      case "money": return esc(fmt.money(value));
      case "moneyTable": return esc(fmt.moneyTable(value));
      case "rate": return esc(fmt.rate(value));
      case "pct": return esc(Array.isArray(value) ? fmt.pct(value[0], value[1]) : fmt.pctValue(value));
      case "date": return esc(fmt.date(value));
      case "dateTime": return esc(fmt.dateTime(value));
      case "time": return esc(fmt.time(value));
      case "dayMonth": return esc(fmt.dayMonth(value));
      case "channel": return ui.channel(value);
      case "branch": return esc(branchName(value));
      case "staff": return esc(staffName(value));
      case "customer": return esc(customerName(value));
      case "customerLink": return customer(value) ? '<a href="' + esc(link("customer-360", { c: value })) + '">' + esc(customerName(value)) + "</a>" : esc(DASH);
      case "lifecycle": return ui.lifecycle(value);
      case "badges": return ui.customerBadges(value);
      case "priority": return ui.priorityBadge(value);
      case "code": return '<span class="code">' + esc(value) + "</span>";
      default: return esc(value);
    }
  }
  var NUMERIC_FORMATS = ["int", "money", "moneyTable", "rate", "pct"];
  /* ตาราง (C-TABLE) → HTML
     o = { id, caption, columns: [{ key, label, format, render(row, i), align: "end", hide: "tablet"|"mobile", sortable, sub(row) }],
           rows, rowKey, rowHref(row), rowAction: "ชื่อ action", totalRow: { label, values: { key: ค่า } } | row,
           selectable: true, selected: [key], bulkActions: [ui.button/permButton options ที่ action ได้ id = คีย์ที่เลือกคั่นด้วย ","],
           footer: { shown, total, unit } | false, empty: ui.state options, emptyKind: "empty"|"noresult", sample: ui.sampleNote options,
           mobileCard(row) → HTML (มือถือแสดงการ์ดแทนตาราง), sort: { key, dir }, compact, stickyFirst } */
  ui.table = function (o) {
    var cols = o.columns || [], rows = o.rows || [];
    var id = o.id || uid("table");
    var sel = o.selected || [];
    var keyOf = function (r, i) { return typeof o.rowKey === "function" ? o.rowKey(r) : (o.rowKey ? r[o.rowKey] : i); };
    cols.forEach(function (c) {
      if (c.format === "moneyTable" && String(c.label).indexOf("(บาท)") === -1 && root.console) { root.console.warn("JCRM.ui.table: คอลัมน์เงิน \"" + c.label + "\" ต้องมี \"(บาท)\" (ข้อ 1.3)"); }
    });
    var hideCls = function (c) { return c.hide === "tablet" ? " col-hide-tablet" : (c.hide === "mobile" ? " col-hide-mobile" : ""); };
    var alignAttr = function (c) { return (c.align === "end" || NUMERIC_FORMATS.indexOf(c.format) !== -1) ? " data-numeric" : ""; };
    var head = (o.selectable ? '<th class="table__check" scope="col"><span class="sr-only">เลือก</span></th>' : "") + cols.map(function (c) {
      var dir = o.sort && o.sort.key === c.key ? o.sort.dir : null;
      var ariaSort = dir ? ' aria-sort="' + (dir === "asc" ? "ascending" : "descending") + '"' : "";
      if (c.sortable) {
        return '<th scope="col" class="is-sortable' + hideCls(c) + '"' + alignAttr(c) + ariaSort + '><button type="button" class="table__sort" data-jcrm-sort="' + esc(id) + '" data-key="' + esc(c.key) + '"' + (dir ? ' data-dir="' + dir + '"' : "") + ">" + esc(c.label) + "</button></th>";
      }
      return '<th scope="col" class="' + hideCls(c).trim() + '"' + alignAttr(c) + ariaSort + ">" + esc(c.label) + "</th>";
    }).join("");
    var body;
    if (!rows.length) {
      body = '<tr><td class="table-empty-cell" colspan="' + (cols.length + (o.selectable ? 1 : 0)) + '">' + ui.state(o.emptyKind || "empty", o.empty) + "</td></tr>";
    } else {
      body = rows.map(function (r, i) {
        var key = keyOf(r, i);
        var href = o.rowHref ? o.rowHref(r) : null;
        var rowAttrs = (href ? ' data-href="' + esc(href) + '" tabindex="0"' : "") + (o.rowAction ? ' data-jcrm-row-action="' + esc(o.rowAction) + '" data-jcrm-id="' + esc(key) + '" tabindex="0"' : "") +
          (sel.indexOf(key) !== -1 ? ' aria-selected="true"' : "");
        var check = o.selectable ? '<td class="table__check"><input type="checkbox" data-jcrm-table-select="' + esc(id) + '" value="' + esc(key) + '"' + (sel.indexOf(key) !== -1 ? " checked" : "") +
          ' aria-label="เลือก ' + esc(key) + '"></td>' : "";
        return "<tr" + rowAttrs + ">" + check + cols.map(function (c) {
          var content = c.render ? toHtml(c.render(r, i)) : formatCell(r[c.key], c.format, r);
          var sub = c.sub ? '<span class="cell-sub">' + toHtml(c.sub(r)) + "</span>" : "";
          return '<td class="' + hideCls(c).trim() + '"' + alignAttr(c) + ">" + content + sub + "</td>";
        }).join("") + "</tr>";
      }).join("");
    }
    var foot = "";
    if (o.totalRow && rows.length) {
      var tr = o.totalRow.values ? o.totalRow.values : o.totalRow;
      foot = '<tfoot><tr class="is-total">' + (o.selectable ? "<td></td>" : "") + cols.map(function (c, ci) {
        if (ci === 0) { return '<th scope="row" class="' + hideCls(c).trim() + '">' + esc(o.totalRow.label || "รวม") + "</th>"; }
        var v = tr[c.key];
        return '<td class="' + hideCls(c).trim() + '"' + alignAttr(c) + ">" + (v === undefined ? "" : (c.render && o.totalRow.useRender ? toHtml(c.render(tr)) : formatCell(v, c.format, tr))) + "</td>";
      }).join("") + "</tr></tfoot>";
    }
    var toolbar = o.selectable && sel.length ? '<div class="data-table__toolbar" role="region" aria-label="การกระทำกับรายการที่เลือก"><strong>เลือก ' + esc(fmt.int(sel.length)) + " รายการ</strong>" +
      (o.bulkActions || []).map(function (b) { var copy = {}; Object.keys(b).forEach(function (k) { copy[k] = b[k]; }); copy.id = sel.join(","); copy.size = copy.size || "sm"; return copy.permission ? ui.permButton(copy) : ui.button(copy); }).join("") + "</div>" : "";
    var cards = o.mobileCard ? '<div class="list-cards">' + (rows.length ? rows.map(function (r) { return toHtml(o.mobileCard(r)); }).join("") : ui.state(o.emptyKind || "empty", o.empty)) + "</div>" : "";
    var footer = o.footer === false ? "" : ui.pagination({ shown: o.footer && o.footer.shown !== undefined ? o.footer.shown : rows.length, total: o.footer && o.footer.total !== undefined ? o.footer.total : rows.length, unit: o.footer && o.footer.unit });
    return '<div class="data-table' + (o.mobileCard ? " data-table--cards" : "") + '" id="' + esc(id) + '">' + toolbar + (o.sample ? ui.sampleNote(o.sample) : "") +
      '<div class="table-wrap"><table class="table' + (o.compact ? " table--compact" : "") + (o.stickyFirst ? " table--sticky-first" : "") + '">' +
      (o.caption ? '<caption class="sr-only">' + esc(o.caption) + "</caption>" : "") + "<thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody>" + foot + "</table></div>" +
      cards + footer + "</div>";
  };
  /* ตารางที่เรียง/เลือกได้: JCRM.table.mount(elementOrId, options) → controller { render(patch), selected(), options }
     เรียงด้วยค่าดิบของคอลัมน์ (ข้อความเทียบแบบไทย · ตัวเลขเทียบค่า) · options.onSort(key, dir) ถ้าต้องการเรียงเอง */
  var tables = {};
  var table = {
    mount: function (el, o) {
      var host = byId(el);
      if (!host) { return null; }
      o.id = o.id || (host.id ? host.id + "-table" : uid("table"));
      var ctl = {
        options: o,
        render: function (patch) {
          Object.keys(patch || {}).forEach(function (k) { o[k] = patch[k]; });
          var rows = (o.rows || []).slice();
          if (o.sort && !o.onSort) {
            var col = find(o.columns, "key", o.sort.key) || {};
            var val = col.sortValue || function (r) { return r[o.sort.key]; };
            rows.sort(function (a, b) {
              var x = val(a), y = val(b);
              if (x === y) { return 0; }
              if (isNil(x)) { return 1; }
              if (isNil(y)) { return -1; }
              var c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
              return o.sort.dir === "desc" ? -c : c;
            });
          }
          var copy = {};
          Object.keys(o).forEach(function (k) { copy[k] = o[k]; });
          copy.rows = rows;
          host.innerHTML = ui.table(copy);
        },
        selected: function () { return (o.selected || []).slice(); }
      };
      tables[o.id] = ctl;
      ctl.render();
      return ctl;
    },
    get: function (id) { return tables[id] || null; }
  };

  /* การ์ดรายการบนมือถือ (ใช้กับ mobileCard) · o = { href, action, id, avatar, title, meta: [ข้อความ], badges: html, side: html } */
  ui.listCard = function (o) {
    var tag = o.href ? "a" : "div";
    return "<" + tag + ' class="list-card"' + (o.href ? ' href="' + esc(o.href) + '"' : "") + (o.action ? ' data-jcrm-action="' + esc(o.action) + '" data-jcrm-id="' + esc(o.id) + '" role="button" tabindex="0"' : "") + ">" +
      (o.avatar ? ui.avatar(o.avatar, "sm") : "") + '<span class="list-card__main"><span class="list-card__title">' + esc(o.title) + "</span>" +
      (o.meta || []).filter(function (x) { return !isNil(x); }).map(function (m) { return '<span class="list-card__meta">' + esc(m) + "</span>"; }).join("") +
      (o.badges ? toHtml(o.badges) : "") + "</span>" + (o.side ? toHtml(o.side) : "") + "</" + tag + ">";
  };

  /* หน้าล็อกอุปกรณ์ counter (C-LOCK · ข้อ 9.2) · ปุ่มส้มไปหน้า 01 */
  ui.lockScreen = function () {
    return '<div class="lock-screen" role="alertdialog" aria-modal="true" aria-labelledby="jcrm-lock-title"><div class="stack" style="align-items:center">' + icon("lock") +
      '<h2 id="jcrm-lock-title">หน้าจอถูกล็อกเนื่องจากไม่มีการใช้งาน</h2>' + ui.button({ label: "เข้าสู่ระบบอีกครั้ง", variant: "accent", href: "01-login.html" }) + "</div></div>";
  };
  /* กรอบโทรศัพท์ (C-PHONE-FRAME · หน้า 10) · o = { title, html, href (ลิงก์ "เปิดหน้าจริง") } */
  ui.phoneFrame = function (o) {
    return '<figure class="stack-2" style="align-items:center"><div class="phone-frame"><div class="phone-frame__status">' + esc(fmt.time(D.meta.now, { suffix: false })) + '</div><div class="phone-frame__body">' +
      toHtml(o.html || "") + "</div></div><figcaption class=\"row\"><h4>" + esc(o.title || "") + "</h4>" + (o.href ? '<a href="' + esc(o.href) + '">เปิดหน้าจริง</a>' : "") + "</figcaption></figure>";
  };

  /* ไทม์ไลน์ (C-TIMELINE) · items: [{ at, type (ref.interaction_types) | typeLabel, channel, direction, branch, summary, chips: [html], by }]
     เรียงใหม่→เก่า · หัววันแยกตามวันที่ Asia/Bangkok */
  ui.timeline = function (o) {
    var items = (o.items || []).slice().sort(function (a, b) { return -fmt.compareIso(a.at, b.at); });
    if (!items.length) { return ui.state("empty", o.empty || { title: "ยังไม่มีประวัติการติดต่อ" }); }
    var lastDay = null, out = '<ol class="timeline" aria-label="' + esc(o.label || "ประวัติการติดต่อ") + '">';
    items.forEach(function (it) {
      var day = fmt.dayKey(it.at);
      if (day !== lastDay) { out += '<li class="timeline__day" aria-hidden="true">' + esc(fmt.date(it.at)) + "</li>"; lastDay = day; }
      var dirLabel = it.direction ? label("interactionDirection", it.direction) : null;
      out += '<li class="timeline__item"><span class="timeline__dot timeline__dot--ring" data-channel="' + esc(it.channel || "") + '">' + icon(CHANNEL_ICON[it.channel] || "chat") + "</span>" +
        '<div><div class="timeline__head"><span class="timeline__title">' + esc(it.typeLabel || label("interactionTypes", it.type)) + '</span><time class="timeline__time" datetime="' + esc(it.at) + '">' + esc(fmt.time(it.at, { suffix: false })) + "</time></div>" +
        '<p class="timeline__meta">' + esc([it.channel ? label("channels", it.channel) : null, dirLabel, it.branch ? branchName(it.branch) : null].filter(Boolean).join(" · ")) + "</p>" +
        (it.summary ? '<p class="timeline__body">' + esc(it.summary) + "</p>" : "") +
        ((it.chips || []).length ? '<div class="timeline__chips">' + it.chips.map(toHtml).join("") + "</div>" : "") +
        (it.by ? '<p class="timeline__meta">โดย ' + esc(staffName(it.by)) + "</p>" : "") + "</div></li>";
    });
    return out + "</ol>";
  };

  /* รายการคิว (C-QUEUE) · o = { rows: D.queueJP1 รูปแบบ, branch, now, as, empty, actions(row) → html (แทนปุ่มมาตรฐาน) }
     ปุ่มมาตรฐาน: WAITING → "รับคิว" (visit.update scope ใดก็ได้ในสาขา · ข้อ 4.1) action "queue-claim" ·
                 IN_SERVICE → "บันทึกผล" (visit.update บนแถว) action "queue-record" · ⋮ action "queue-menu" · id = queueNo */
  function canClaimQueue(branchCode, as) { return scopeBranches("visit.update", "OWN", as).indexOf(branchCode) !== -1; }
  ui.queueList = function (o) {
    var rows = (o.rows || []).slice().sort(function (a, b) { return String(a.queueNo).localeCompare(String(b.queueNo)); });
    if (!rows.length) { return ui.state("empty", o.empty || { title: "ยังไม่มีคิวที่เปิดอยู่" }); }
    var now = o.now || D.meta.now, longMin = D.settingValues["sla.visitor_waiting_min"];
    return '<ol class="queue-list" aria-label="' + esc(o.label || "คิววันนี้") + '">' + rows.map(function (r) {
      var waited = r.status === "WAITING" ? fmt.minutesBetween(r.queuedAt, now) : null;
      var isLong = waited !== null && waited > longMin;
      var meta = "เข้าคิว " + fmt.time(r.queuedAt, { suffix: false }) + (r.status === "WAITING" ? " · รอ " + fmt.int(waited) + " นาที" : "") + (r.receiver ? " · ผู้รับ " + staffName(r.receiver) : "");
      var actionsHtml;
      if (o.actions) { actionsHtml = toHtml(o.actions(r)); }
      else if (r.status === "WAITING") {
        actionsHtml = access("visit.update", { branch: o.branch }, o.as).visible ? (canClaimQueue(o.branch, o.as) ? ui.button({ label: "รับคิว", variant: "secondary", action: "queue-claim", id: r.queueNo }) :
          ui.button({ label: "รับคิว", variant: "secondary", disabledReason: T.reasonOutOfBranch })) : "";
      } else {
        actionsHtml = ui.permButton({ label: "บันทึกผล", variant: "secondary", action: "queue-record", id: r.queueNo, permission: "visit.update", ctx: { branch: o.branch, owner: r.receiver }, as: o.as,
          reason: "บันทึกผลได้เฉพาะคิวที่คุณรับ" });
      }
      var menu = access("visit.update", { branch: o.branch }, o.as).visible ? '<button type="button" class="icon-btn icon-btn--sm" data-jcrm-action="queue-menu" data-jcrm-id="' + esc(r.queueNo) + '" aria-label="เมนูคิว ' + esc(r.queueNo) + '">' + icon("moreV") + "</button>" : "";
      return '<li class="queue-item" data-status="' + esc(r.status) + '"' + (isLong ? ' data-waiting-long="true"' : "") + '><span class="queue-item__no"><span class="sr-only">คิว</span>' + esc(r.queueNo) + "</span>" +
        '<div><div class="row" style="gap:var(--space-2)">' + ui.status("visitStatuses", r.status) + '<span class="queue-item__title">' + esc(label("interestTypes", r.interest)) + "</span>" +
        (isLong ? ui.badge("รอนาน", "warning", "badge--square") : "") + "</div>" + '<p class="queue-item__meta">' + esc(meta) + "</p></div>" +
        '<div class="queue-item__actions">' + actionsHtml + menu + "</div></li>";
    }).join("") + "</ol>";
  };

  /* รายการงาน (C-TASK) · o = { groups: [{ key: "overdue"|"today", label, rows }], showOwner, now, as, empty, openAction }
     row = D.tasksKwan.rows รูปแบบ · checkbox action "task-complete" (id = taskNo หรือ "row-{no}") · ชื่อลูกค้าลิงก์ 05 */
  ui.taskKey = function (r) { return r.taskNo || ("row-" + r.no); };
  ui.taskList = function (o) {
    var now = o.now || D.meta.now;
    var groups = (o.groups || []).filter(function (g) { return g.rows && g.rows.length; });
    if (!groups.length) { return ui.state("empty", o.empty || { title: "ไม่มีงานที่ต้องทำวันนี้" }); }
    return groups.map(function (g) {
      return '<section aria-label="' + esc(g.label) + '"><h4 class="group-head">' + esc(g.label) + " (" + esc(fmt.int(isNil(g.count) ? g.rows.length : g.count)) + ")</h4>" +
        '<ul class="task-list">' + g.rows.map(function (r) {
          var key = ui.taskKey(r);
          var acc = access("task.update", { branch: r.branch, owner: r.owner }, o.as);
          var check = acc.visible ? '<span class="task-item__check"><input type="checkbox" data-jcrm-action="task-complete" data-jcrm-id="' + esc(key) + '" aria-label="ทำเสร็จ: ' + esc(r.title) + '"' +
            (acc.allowed ? "" : ' aria-disabled="true" data-tooltip="' + esc(acc.reason) + '"') + "></span>" : '<span class="task-item__check" aria-hidden="true">' + ui.priority(r.priority) + "</span>";
          var isOverdue = g.key === "overdue" || fmt.dayKey(r.dueAt) < fmt.dayKey(now);
          var pastDue = !isOverdue && fmt.compareIso(r.dueAt, now) < 0;
          var timeText = isOverdue ? fmt.dateTime(r.dueAt) : fmt.time(r.dueAt, { suffix: false });
          var badge = isOverdue ? ui.badge(D.taskTimeBadges.overdue.labelTh, D.taskTimeBadges.overdue.tone, "badge--square") : (pastDue ? ui.badge(D.taskTimeBadges.pastDueToday.labelTh, D.taskTimeBadges.pastDueToday.tone, "badge--square") : "");
          return '<li class="task-item" data-priority="' + esc(r.priority || "") + '">' + check +
            '<div><p class="task-item__title">' + (o.openAction ? '<a href="#" data-jcrm-action="' + esc(o.openAction) + '" data-jcrm-id="' + esc(key) + '">' + esc(r.title) + "</a>" : esc(r.title)) + "</p>" +
            '<p class="task-item__meta">' + ui.badge(label("taskTypes", r.type), "neutral", "badge--square") + " " +
            (r.customerNo ? '<a href="' + esc(link("customer-360", { c: r.customerNo })) + '">' + esc(customerName(r.customerNo)) + '</a> <span class="code">' + esc(r.customerNo) + "</span>" : "") +
            (o.showOwner && r.owner ? " · " + esc(staffName(r.owner)) : "") + "</p></div>" +
            '<div class="task-item__side"><span class="num t-sm">' + esc(timeText) + "</span>" + '<span class="badge-row">' + ui.priorityBadge(r.priority) + badge + "</span></div></li>";
        }).join("") + "</ul></section>";
    }).join("");
  };

  /* ---- ช่องทางติดต่อแบบปิดบัง (C-CONTACT · ข้อ 6.4 · D33) ---------------------------
     ui.contactRow({ customerNo, type }) → value_masked + ปุ่ม แสดง/โทร/คัดลอก/เปิด LINE
     ค่าเต็มไม่อยู่ใน HTML · ดึงจาก data.js ตอนกดเท่านั้น (จำลอง api.reveal_contact) · ซ่อนกลับใน 30 วินาที **[รอยืนยัน]**
     เกิน security.reveal_per_hour (30) ในชั่วโมงล่าสุดของแท็บนี้ → ปฏิเสธ + toast (จำลอง REVEAL_LIMIT_EXCEEDED · ข้อ 6.4 v2.2) */
  var REVEAL_MS = 30000;
  var CONTACT_ACTIONS = {
    PHONE: [["reveal", "eye", "แสดง"], ["call", "call", "โทร"], ["copy", "copy", "คัดลอก"]],
    LINE_ID: [["reveal", "eye", "แสดง"], ["copy", "copy", "คัดลอก"], ["line", "chat", "เปิด LINE"]],
    EMAIL: [["reveal", "eye", "แสดง"], ["copy", "copy", "คัดลอก"]],
    FACEBOOK: [["reveal", "eye", "แสดง"], ["copy", "copy", "คัดลอก"]],
    INSTAGRAM: [["reveal", "eye", "แสดง"], ["copy", "copy", "คัดลอก"]],
    TIKTOK: [["reveal", "eye", "แสดง"], ["copy", "copy", "คัดลอก"]],
    LINE_USER_ID: []
  };
  ui.contactRow = function (o) {
    var c = customer(o.customerNo);
    var ct = c ? find(c.contacts, "type", o.type) : null;
    var masked = o.type === "LINE_USER_ID" ? "—" : (ct ? ct.masked : DASH);
    var acc = access("customer.pii.reveal", { customer: customerCtx(o.customerNo) }, o.as);
    var buttons = ct && acc.visible ? (CONTACT_ACTIONS[o.type] || []).filter(function (a) { return !o.only || o.only.indexOf(a[0]) !== -1; }).map(function (a) {
      return '<button type="button" class="btn btn--ghost btn--sm contact-row__btn" data-jcrm-contact-action="' + a[0] + '"' +
        (acc.allowed ? "" : ' aria-disabled="true" data-tooltip="' + esc(acc.reason) + '"') + ">" + icon(a[1]) + '<span class="hide-mobile">' + esc(a[2]) + "</span>" + '<span class="sr-only show-mobile">' + esc(a[2]) + "</span></button>";
    }).join("") : "";
    return '<div class="contact-row" data-customer="' + esc(o.customerNo) + '" data-contact-type="' + esc(o.type) + '" data-revealed="false">' +
      '<span class="contact-row__icon">' + icon(CONTACT_ICON[o.type] || "info") + "</span>" +
      '<span class="contact-row__text"><span class="contact-row__type">' + esc(CONTACT_LABEL[o.type] || o.type) + "</span>" +
      '<span class="contact-row__value" aria-live="polite">' + esc(masked) + '</span><span class="contact-row__timer" hidden></span></span>' +
      '<span class="contact-row__actions">' + buttons + "</span></div>";
  };
  ui.contactList = function (customerNo, opts) {
    var c = customer(customerNo);
    if (!c || !c.contacts.length) { return '<p class="t-sm t-muted">' + DASH + "</p>"; }
    var acc = access("customer.pii.reveal", { customer: customerCtx(customerNo) }, opts && opts.as);
    return '<div class="contact-list">' + c.contacts.map(function (ct) { return ui.contactRow({ customerNo: customerNo, type: ct.type, as: opts && opts.as }); }).join("") +
      '<p class="t-xs t-muted">' + esc(acc.visible ? T.contactLogged : T.contactNoPermission) + "</p></div>";
  };
  function revealCount() {
    var raw1 = session.get(D.meta.revealSessionKey), list = [];
    try { list = JSON.parse(raw1 || "[]"); } catch (e) { list = []; }
    var cutoff = Date.now() - 3600000;
    return list.filter(function (t) { return t > cutoff; });
  }
  function hideReveal(row) {
    var no = row.getAttribute("data-customer"), type = row.getAttribute("data-contact-type");
    var c = customer(no), ct = c ? find(c.contacts, "type", type) : null;
    if (row._jcrmTimer) { root.clearInterval(row._jcrmTimer); row._jcrmTimer = null; }
    $(".contact-row__value", row).textContent = ct ? ct.masked : DASH;
    row.setAttribute("data-revealed", "false");
    $(".contact-row__timer", row).hidden = true;
    var rb = $('[data-jcrm-contact-action="reveal"] span', row);
    if (rb) { rb.textContent = "แสดง"; }
  }
  function onContactAction(btn) {
    var row = btn.closest(".contact-row");
    if (!row) { return; }
    var no = row.getAttribute("data-customer"), type = row.getAttribute("data-contact-type");
    var action = btn.getAttribute("data-jcrm-contact-action");
    var acc = access("customer.pii.reveal", { customer: customerCtx(no) });
    if (btn.getAttribute("aria-disabled") === "true" || !acc.allowed) { toast(acc.reason || T.contactNoPermission, "warning"); return; }
    if (action === "reveal" && row.getAttribute("data-revealed") === "true") { hideReveal(row); return; }
    var c = customer(no), ct = c ? find(c.contacts, "type", type) : null;
    if (!ct) { return; }
    var recent = revealCount();
    if (recent.length >= D.settingValues["security.reveal_per_hour"]) { toast(T.revealLimitToast, "danger", { title: "REVEAL_LIMIT_EXCEEDED · แจ้งผู้ดูแลข้อมูลธุรกิจ" }); return; }
    recent.push(Date.now());
    session.set(D.meta.revealSessionKey, JSON.stringify(recent));
    var purpose = { reveal: "VIEW", call: "CALL", copy: "COPY", line: "LINE_OPEN" }[action];
    if (action === "reveal") {
      var valueEl = $(".contact-row__value", row), timerEl = $(".contact-row__timer", row);
      valueEl.textContent = ct.full;
      row.setAttribute("data-revealed", "true");
      var rb = $("span", btn); if (rb) { rb.textContent = "ซ่อน"; }
      if (row._jcrmTimer) { root.clearInterval(row._jcrmTimer); }
      var left = REVEAL_MS / 1000;
      timerEl.hidden = false;
      timerEl.textContent = "แสดงอยู่ · ซ่อนใน " + left + " วินาที";
      row._jcrmTimer = root.setInterval(function () {
        left -= 1;
        if (left <= 0) { hideReveal(row); return; }
        timerEl.textContent = "แสดงอยู่ · ซ่อนใน " + left + " วินาที";
      }, 1000);
    }
    toast(T.contactRevealedToast, "success", { title: "purpose " + purpose });
    if (action === "copy") {
      try { root.navigator.clipboard.writeText(ct.full); toast("คัดลอกแล้ว", "info"); } catch (e) { toast("คัดลอกไม่ได้ในเบราว์เซอร์นี้", "warning"); }
    } else if (action === "call") {
      if (!dispatchSilently("contact-call", no, btn)) { toast("ระบบจริงจะโทรออก แล้วเปิดบันทึกการโทร (interaction OUTBOUND ช่องทางโทรศัพท์) แบบร่างให้ยืนยันหลังวางสาย", "info"); }
    } else if (action === "line") {
      if (!dispatchSilently("contact-line", no, btn)) { toast("เปิด LINE (prototype)", "info"); }
    }
  }
  function dispatchSilently(name, id, el) { if (typeof actions[name] === "function") { actions[name](id, el); return true; } return false; }

  /* =========================================================================
     7. overlay (toast · dialog · drawer · sheet · confirm) + ฟอร์ม
     ====================================================================== */
  function byId(idOrEl) { return typeof idOrEl === "string" ? root.document.getElementById(idOrEl) : idOrEl; }
  /* toast (C-TOAST) · tone: success|info (หายเอง 5 วินาที · หยุดเมื่อ hover) · warning|danger (อยู่จนกดปิด) · สูงสุด 3 อัน
     opts = { title, duration (ms · บังคับหายเอง), persist } · ห้ามใส่เบอร์/อีเมล/LINE ID ในข้อความ */
  function toast(message, tone, opts) {
    if (!root.document || !root.document.body) { return; }
    opts = opts || {};
    var stack = $(".toast-stack");
    if (!stack) { stack = root.document.createElement("div"); stack.className = "toast-stack"; stack.setAttribute("aria-live", "polite"); root.document.body.appendChild(stack); }
    while (stack.children.length >= 3) { stack.removeChild(stack.firstChild); }
    var el = root.document.createElement("div");
    var t = tone || "info";
    el.className = "toast toast--" + t;
    el.setAttribute("role", t === "danger" ? "alert" : "status");
    var sym = { success: "✓", warning: "!", danger: "✕", info: "i" }[t] || "i";
    el.innerHTML = '<span class="toast__icon" aria-hidden="true">' + sym + "</span><div>" +
      (opts.title ? '<p class="t-xs t-muted">' + esc(opts.title) + "</p>" : "") + "<p>" + esc(message) + "</p></div>" +
      '<button type="button" class="toast__close" aria-label="ปิดข้อความ">' + icon("x", "nav-icon") + "</button>";
    $(".toast__close", el).addEventListener("click", function () { el.remove(); });
    stack.appendChild(el);
    var auto = opts.duration || (!opts.persist && (t === "success" || t === "info") ? 5000 : 0);
    if (auto) {
      var timer = root.setTimeout(function () { if (el.parentNode) { el.remove(); } }, auto);
      el.addEventListener("mouseenter", function () { root.clearTimeout(timer); });
      el.addEventListener("mouseleave", function () { timer = root.setTimeout(function () { if (el.parentNode) { el.remove(); } }, 2000); });
    }
    return el;
  }
  var focusStack = [];
  function focusables(el) {
    return $$("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])", el)
      .filter(function (x) { return x.offsetParent !== null || x === root.document.activeElement; });
  }
  function focusFirst(el) {
    var f = el.querySelector("[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([aria-disabled=true])");
    if (f) { f.focus(); }
  }
  function trapFocus(el, e) {
    if (e.key !== "Tab") { return; }
    var list = focusables(el);
    if (!list.length) { return; }
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && root.document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && root.document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  /* dialog แบบเขียน HTML เอง: <div class="scrim scrim--dialog" id="x"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="…"> · ปุ่มปิดใส่ data-jcrm-close */
  function openDialog(id) {
    var el = byId(id); if (!el) { return; }
    focusStack.push(root.document.activeElement); el.hidden = false; el.classList.add("is-open"); focusFirst(el);
  }
  function closeDialog(id) {
    var el = byId(id); if (!el) { return; }
    if (el._jcrmCtl) { el._jcrmCtl.cancel(); return; }
    el.classList.remove("is-open");
    var f = focusStack.pop(); if (f && f.focus) { f.focus(); }
  }
  function scrimFor(el) {
    var id = el.id + "-scrim", s = root.document.getElementById(id);
    if (!s) {
      s = root.document.createElement("div"); s.id = id; s.className = "scrim" + (el.classList.contains("sheet") ? " scrim--sheet" : "");
      s.addEventListener("click", function () { closePanel(el); });
      el.parentNode.insertBefore(s, el);
    }
    return s;
  }
  /* drawer/sheet แบบเขียน HTML เอง: <aside class="drawer" id="x" role="dialog" aria-modal="true"> · <div class="sheet" id="x"> */
  function openPanel(id) {
    var el = byId(id); if (!el) { return; }
    focusStack.push(root.document.activeElement); el.hidden = false;
    scrimFor(el).classList.add("is-open");
    root.requestAnimationFrame(function () { el.classList.add("is-open"); focusFirst(el); });
  }
  function closePanel(id) {
    var el = byId(id); if (!el) { return; }
    if (el._jcrmCtl) { el._jcrmCtl.cancel(); return; }
    el.classList.remove("is-open"); scrimFor(el).classList.remove("is-open");
    var f = focusStack.pop(); if (f && f.focus) { f.focus(); }
  }
  /* tabs: markup จาก ui.tabs หรือ <div data-jcrm-tabs><div class="tabs" role="tablist"><button role="tab" aria-controls>… · ←→ Home End ย้าย focus · Enter/Space เลือก */
  function initTabs(scope) {
    $$("[data-jcrm-tabs]", scope).forEach(function (rootEl) {
      if (rootEl._jcrmTabs) { return; }
      rootEl._jcrmTabs = true;
      var tabs = $$('[role="tab"]', rootEl).filter(function (t) { return t.closest("[data-jcrm-tabs]") === rootEl; });
      var paramName = rootEl.getAttribute("data-param");
      function select(tab, silent) {
        tabs.forEach(function (t) {
          var sel = t === tab;
          t.setAttribute("aria-selected", sel ? "true" : "false");
          t.tabIndex = sel ? 0 : -1;
          var p = root.document.getElementById(t.getAttribute("aria-controls"));
          if (p) { p.hidden = !sel; }
        });
        if (paramName && !silent && tab.getAttribute("data-tab")) {
          try { var u = new root.URL(root.location.href); u.searchParams.set(paramName, tab.getAttribute("data-tab")); root.history.replaceState(null, "", u.toString()); } catch (e) { /* file:// บางเบราว์เซอร์ */ }
        }
        if (!silent) { rootEl.dispatchEvent(new root.CustomEvent("jcrm:tabchange", { detail: { tabsId: rootEl.getAttribute("data-jcrm-tabs"), tab: tab.getAttribute("data-tab") || tab.getAttribute("aria-controls") }, bubbles: true })); }
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(t); });
        t.addEventListener("keydown", function (e) {
          var k = { ArrowRight: 1, ArrowLeft: -1 }[e.key], n = null;
          if (k) { n = tabs[(i + k + tabs.length) % tabs.length]; }
          if (e.key === "Home") { n = tabs[0]; }
          if (e.key === "End") { n = tabs[tabs.length - 1]; }
          if (n) { e.preventDefault(); n.focus(); }
        });
      });
      var initial = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
      if (initial) { select(initial, true); }
    });
  }

  /* ---- ฟอร์ม (C-FORM) · JCRM.form.render / read / validate / showErrors -------------------
     field = { name, label, type, required, requiredWhen: { field, equals | in }, visibleWhen: { field, equals | in | truthy },
               ref: "lostReasons" (select/radio/chips/checkboxes จาก data.js · เรียง sort) | options: [{ value, label, disabled }],
               placeholder, help, value, min, max, maxLength, rows, unit, piiWarn, requiredMessage, validate(value, values) → ข้อความ | null,
               inline (กลุ่ม radio/checkbox แนวนอน), readonly, width: "full" | "half", html (type "static") }
     type: text · email · tel · textarea · number · money · select · radio · checkbox · checkboxes · chips · chipsMulti · date · datetime · time · stepper · static · hidden */
  function fieldOptions(f) {
    if (f.options) { return f.options; }
    return refList(f.ref).filter(function (x) { return x.isActive !== false; }).slice()
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (x) { return { value: x.code, label: x.labelTh || x.code }; });
  }
  function reqMark(f) { return f.required || f.requiredWhen ? '<span class="req" aria-hidden="true">*</span><span class="sr-only">(จำเป็น)</span>' : ""; }
  function renderField(f, values, formId) {
    var id = formId + "-" + f.name;
    var v = values && values[f.name] !== undefined ? values[f.name] : f.value;
    var describedBy = [f.help ? id + "-help" : null, id + "-error"].filter(Boolean).join(" ");
    var common = ' id="' + esc(id) + '" name="' + esc(f.name) + '" aria-describedby="' + esc(describedBy) + '"' + (f.readonly ? " readonly" : "") + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "");
    var control;
    var t = f.type || "text";
    if (t === "hidden") { return '<input type="hidden" name="' + esc(f.name) + '" value="' + esc(v) + '">'; }
    if (t === "static") { return '<div class="field form-static span-all" data-field="' + esc(f.name) + '">' + (f.label ? '<span class="label">' + esc(f.label) + "</span>" : "") + toHtml(f.html || "") + "</div>"; }
    if (t === "textarea") {
      control = (f.piiWarn ? ui.piiWarn() : "") + '<textarea class="textarea"' + common + (f.maxLength ? ' maxlength="' + esc(f.maxLength) + '"' : "") + ' rows="' + esc(f.rows || 3) + '">' + esc(v) + "</textarea>" +
        (f.maxLength ? '<span class="field__counter" data-counter-for="' + esc(id) + '">' + fmt.int(String(v || "").length) + "/" + fmt.int(f.maxLength) + "</span>" : "");
    } else if (t === "select") {
      control = '<select class="select"' + common + '><option value="">' + esc(f.placeholder || "เลือก" + (f.label || "")) + "</option>" + fieldOptions(f).map(function (op) {
        return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(v) ? " selected" : "") + (op.disabled ? " disabled" : "") + ">" + esc(op.label) + "</option>";
      }).join("") + "</select>";
    } else if (t === "radio" || t === "checkboxes") {
      var type = t === "radio" ? "radio" : "checkbox";
      var vals = Array.isArray(v) ? v : (isNil(v) ? [] : [v]);
      control = '<div class="' + type + '-group' + (f.inline ? " " + type + "-group--inline" : "") + '" role="' + (t === "radio" ? "radiogroup" : "group") + '" aria-labelledby="' + esc(id) + '-label">' + fieldOptions(f).map(function (op, i) {
        return '<label class="' + type + '"><input type="' + type + '" name="' + esc(f.name) + '" value="' + esc(op.value) + '"' + (i === 0 ? ' id="' + esc(id) + '"' : "") + (vals.indexOf(op.value) !== -1 ? " checked" : "") + (op.disabled ? " disabled" : "") +
          '><span class="' + type + '__text">' + esc(op.label) + (op.help ? "<small>" + esc(op.help) + "</small>" : "") + "</span></label>";
      }).join("") + "</div>";
    } else if (t === "chips" || t === "chipsMulti") {
      return '<div class="field span-all" data-field="' + esc(f.name) + '">' + ui.chipGroup({ id: id, name: f.name, label: f.label, options: fieldOptions(f), value: v, multiple: t === "chipsMulti", required: f.required }) +
        (f.help ? '<p class="help" id="' + esc(id) + '-help">' + esc(f.help) + "</p>" : "") + '<p class="error-text" id="' + esc(id) + '-error" hidden></p></div>';
    } else if (t === "checkbox") {
      return '<div class="field span-all" data-field="' + esc(f.name) + '"><label class="checkbox"><input type="checkbox"' + common + (v ? " checked" : "") + '><span class="checkbox__text">' + esc(f.label) + reqMark(f) +
        (f.help ? '<small id="' + esc(id) + '-help">' + esc(f.help) + "</small>" : "") + '</span></label><p class="error-text" id="' + esc(id) + '-error" hidden></p></div>';
    } else if (t === "stepper") {
      return '<div data-field="' + esc(f.name) + '">' + ui.stepper({ id: id, name: f.name, label: f.label, value: v, min: f.min, max: f.max, required: f.required }) + '<p class="error-text" id="' + esc(id) + '-error" hidden></p></div>';
    } else {
      var inputType = { number: "number", money: "number", date: "date", datetime: "datetime-local", time: "time", email: "email", tel: "tel" }[t] || "text";
      control = (f.piiWarn ? ui.piiWarn() : "") + (f.unit ? '<div class="input-group">' : "") + '<input class="input" type="' + inputType + '"' + common + ' value="' + esc(v) + '"' +
        (isNil(f.min) ? "" : ' min="' + esc(f.min) + '"') + (isNil(f.max) ? "" : ' max="' + esc(f.max) + '"') + (t === "money" ? ' step="0.01" inputmode="decimal"' : "") + (t === "number" ? ' inputmode="numeric"' : "") +
        (f.maxLength ? ' maxlength="' + esc(f.maxLength) + '"' : "") + ">" + (f.unit ? '<span class="t-sm t-muted" style="align-self:center">' + esc(f.unit) + "</span></div>" : "");
    }
    return '<div class="field' + (f.width === "half" ? "" : " span-all") + '" data-field="' + esc(f.name) + '">' +
      (f.label ? '<label class="label" id="' + esc(id) + '-label" for="' + esc(id) + '">' + esc(f.label) + reqMark(f) + "</label>" : "") + control +
      (f.help ? '<p class="help" id="' + esc(id) + '-help">' + esc(f.help) + "</p>" : "") + '<p class="error-text" id="' + esc(id) + '-error" hidden></p></div>';
  }
  function condMatch(cond, values) {
    if (!cond) { return true; }
    var v = values[cond.field];
    if (cond.truthy) { return Array.isArray(v) ? v.length > 0 : !!v; }
    if (cond.in) { return cond.in.indexOf(v) !== -1; }
    return v === cond.equals;
  }
  /* เลขบัตรประชาชนไทย 13 หลักที่ checksum ถูกต้อง (trigger ข้อ 10.1) */
  function containsThaiId(text) {
    var m = String(text || "").replace(/[\s-]/g, "").match(/\d{13}/g) || [];
    return m.some(function (d) {
      var sum = 0;
      for (var i = 0; i < 12; i++) { sum += Number(d.charAt(i)) * (13 - i); }
      return (11 - (sum % 11)) % 10 === Number(d.charAt(12));
    });
  }
  var form = {
    render: function (fields, values, formId) {
      var fid = formId || uid("form");
      return '<div class="form-summary alert alert--danger" role="alert" hidden></div><div class="form-grid">' + (fields || []).map(function (f) { return renderField(f, values, fid); }).join("") + "</div>";
    },
    read: function (rootEl, fields) {
      var out = {};
      (fields || []).forEach(function (f) {
        var els = $$('[name="' + f.name + '"]', rootEl);
        if (!els.length) { return; }
        var t = f.type || "text";
        if (t === "checkbox") { out[f.name] = !!els[0].checked; }
        else if (t === "checkboxes" || t === "chipsMulti") { out[f.name] = els.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); }
        else if (t === "radio" || t === "chips") { var hit = els.filter(function (x) { return x.checked; })[0]; out[f.name] = hit ? hit.value : ""; }
        else if (t === "number" || t === "stepper") { out[f.name] = els[0].value === "" ? null : parseInt(els[0].value, 10); }
        else if (t === "money") { out[f.name] = els[0].value === "" ? null : els[0].value; }
        else if (t !== "static") { out[f.name] = els[0].value; }
      });
      return out;
    },
    /* คืน { ชื่อช่อง: ข้อความผิด } · ช่องที่ visibleWhen ไม่ตรงไม่ตรวจ */
    validate: function (fields, values) {
      var errors = {};
      (fields || []).forEach(function (f) {
        if (!condMatch(f.visibleWhen, values)) { return; }
        var v = values[f.name];
        var empty = isNil(v) || v === false || (Array.isArray(v) && !v.length) || (typeof v === "string" && !v.trim());
        var required = f.required || (f.requiredWhen && condMatch(f.requiredWhen, values));
        var choose = ["select", "radio", "chips", "chipsMulti", "checkboxes"].indexOf(f.type) !== -1;
        if (required && empty) { errors[f.name] = f.requiredMessage || (f.type === "checkbox" ? "กรุณายืนยัน" : (choose ? "เลือก" : "กรอก") + (f.label || "ข้อมูลนี้")); return; }
        if (empty) { return; }
        if ((f.type === "number" || f.type === "money" || f.type === "stepper") && !isNil(f.min) && Number(v) < f.min) { errors[f.name] = f.minMessage || (f.label + "ต้องไม่น้อยกว่า " + fmt.int(f.min)); return; }
        if (f.maxLength && String(v).length > f.maxLength) { errors[f.name] = "ไม่เกิน " + fmt.int(f.maxLength) + " ตัวอักษร"; return; }
        if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { errors[f.name] = "รูปแบบอีเมลไม่ถูกต้อง"; return; }
        if ((f.piiWarn || f.type === "textarea") && containsThaiId(v)) { errors[f.name] = T.thaiIdRejected; return; }
        if (f.validate) { var m = f.validate(v, values); if (m) { errors[f.name] = m; } }
      });
      return errors;
    },
    showErrors: function (rootEl, fields, errors) {
      var names = Object.keys(errors || {});
      $$("[data-field]", rootEl).forEach(function (w) {
        var name = w.getAttribute("data-field"), msg = errors[name];
        var err = $(".error-text", w);
        w.classList.toggle("field--error", !!msg);
        if (err) { err.hidden = !msg; err.textContent = msg || ""; }
        $$("input, select, textarea", w).forEach(function (x) { x.setAttribute("aria-invalid", msg ? "true" : "false"); });
      });
      var sum = $(".form-summary", rootEl);
      if (sum) {
        sum.hidden = !names.length;
        sum.innerHTML = names.length ? "<div><p class=\"alert__title\">" + esc(T.formSummary.replace("{N}", names.length)) + "</p><ul>" + names.map(function (n) {
          var f = find(fields, "name", n) || { label: n };
          return '<li><a href="#" data-jcrm-focus="' + esc(n) + '">' + esc(f.label || n) + "</a>: " + esc(errors[n]) + "</li>";
        }).join("") + "</ul></div>" : "";
      }
      return names.length === 0;
    },
    /* แสดง/ซ่อนช่องตาม visibleWhen และอัปเดตตัวนับตัวอักษร */
    sync: function (rootEl, fields) {
      var values = form.read(rootEl, fields);
      (fields || []).forEach(function (f) {
        if (!f.visibleWhen) { return; }
        var w = $('[data-field="' + f.name + '"]', rootEl);
        if (w) { w.hidden = !condMatch(f.visibleWhen, values); }
      });
      $$("[data-counter-for]", rootEl).forEach(function (c) {
        var ta = root.document.getElementById(c.getAttribute("data-counter-for"));
        if (ta) { c.textContent = fmt.int(ta.value.length) + "/" + fmt.int(ta.getAttribute("maxlength")); }
      });
      return values;
    },
    containsThaiId: containsThaiId
  };

  /* ---- dialog / drawer ที่สร้างด้วยโค้ด ---------------------------------------------
     JCRM.dialog({ title, size: "sm"|"md"|"lg", intro (html), body (html), fields, values, submitLabel, submitVariant ("accent" | "primary" | "danger" | "danger-outline"),
                   cancelLabel, ack (ข้อความ checkbox ยืนยัน · บังคับติ๊กก่อนกดได้), typeToConfirm (ต้องพิมพ์ค่านี้), onSubmit(values, ctl) → true ปิด | false ค้าง | { errors },
                   onCancel(), dirtyCheck (ถามก่อนปิดเมื่อแก้ไขแล้ว) })
     → ctl = { el, close(), cancel(), setBusy(on), setErrors(errs), values() } */
  function buildOverlay(kind, o) {
    var id = o.id || uid(kind);
    var titleId = id + "-title";
    var fields = (o.fields || []).slice();
    if (o.typeToConfirm) { fields.push({ name: "__type", label: "พิมพ์ " + o.typeToConfirm + " เพื่อยืนยัน", type: "text", required: true, requiredMessage: "พิมพ์ " + o.typeToConfirm + " เพื่อยืนยัน", validate: function (v) { return v === o.typeToConfirm ? null : "ข้อความไม่ตรง"; } }); }
    if (o.ack) { fields.push({ name: "__ack", label: o.ack === true ? T.irreversibleAck : o.ack, type: "checkbox", required: true, requiredMessage: "ต้องติ๊กยืนยันก่อน" }); }
    var bodyHtml = (o.intro ? '<div class="dialog__intro">' + toHtml(o.intro) + "</div>" : "") + toHtml(o.body || "") + (fields.length ? form.render(fields, o.values, id + "-f") : "");
    var footer = o.footer !== undefined ? toHtml(o.footer) :
      ui.button({ label: o.cancelLabel || "ยกเลิก", variant: "ghost", attrs: "data-jcrm-overlay-cancel" }) + '<span class="spacer"></span>' +
      (o.onSubmit || o.submitLabel ? ui.button({ label: o.submitLabel || "บันทึก", variant: o.submitVariant || "accent", attrs: "data-jcrm-overlay-submit" }) : "");
    var wrap = root.document.createElement("div");
    if (kind === "dialog") {
      wrap.className = "scrim scrim--dialog is-open";
      wrap.id = id;
      wrap.innerHTML = '<form class="dialog dialog--' + esc(o.size || (fields.length ? "md" : "sm")) + '" role="dialog" aria-modal="true" aria-labelledby="' + esc(titleId) + '" novalidate>' +
        '<div class="dialog__header"><h2 class="dialog__title grow" id="' + esc(titleId) + '">' + esc(o.title) + '</h2><button type="button" class="icon-btn" data-jcrm-overlay-cancel aria-label="ปิด">' + icon("x") + "</button></div>" +
        '<div class="dialog__body">' + bodyHtml + '</div><div class="dialog__footer">' + footer + "</div></form>";
      root.document.body.appendChild(wrap);
    } else {
      wrap.className = "drawer-host";
      wrap.innerHTML = '<div class="scrim is-open"></div><form class="drawer' + (o.wide ? " drawer--wide" : "") + '" id="' + esc(id) + '" role="dialog" aria-modal="true" aria-labelledby="' + esc(titleId) + '" novalidate>' +
        '<div class="drawer__header"><div class="grow"><h2 class="drawer__title" id="' + esc(titleId) + '">' + esc(o.title) + "</h2>" + (o.ref ? '<p class="drawer__ref code">' + esc(o.ref) + "</p>" : "") + "</div>" +
        '<button type="button" class="icon-btn" data-jcrm-overlay-cancel aria-label="ปิด">' + icon("x") + "</button></div>" +
        '<div class="drawer__body">' + bodyHtml + '</div><div class="drawer__footer">' + footer + "</div></form>";
      root.document.body.appendChild(wrap);
    }
    var panel = kind === "dialog" ? $(".dialog", wrap) : $(".drawer", wrap);
    var initial = null;
    var ctl = {
      el: panel,
      values: function () { return form.read(panel, fields); },
      setBusy: function (on) { var b = $("[data-jcrm-overlay-submit]", panel); if (b) { if (on) { b.setAttribute("aria-busy", "true"); } else { b.removeAttribute("aria-busy"); } } },
      setErrors: function (errs) { return form.showErrors(panel, fields, errs || {}); },
      close: function () {
        root.document.removeEventListener("keydown", keyHandler, true);
        wrap.remove();
        var f = focusStack.pop(); if (f && f.focus) { f.focus(); }
      },
      cancel: function () {
        var dirty = o.dirtyCheck !== false && kind === "drawer" && fields.length && JSON.stringify(ctl.values()) !== initial;
        if (dirty && !o._confirmingDiscard) {
          o._confirmingDiscard = true;
          confirm({ title: T.discardTitle, message: "", confirmLabel: T.discardConfirm, variant: "danger-outline", cancelLabel: T.discardBack,
            onConfirm: function () { if (o.onCancel) { o.onCancel(); } ctl.close(); }, onCancel: function () { o._confirmingDiscard = false; } });
          return;
        }
        if (o.onCancel) { o.onCancel(); }
        ctl.close();
      }
    };
    (kind === "dialog" ? wrap : panel)._jcrmCtl = ctl;
    function keyHandler(e) {
      if (!wrap.parentNode) { return; }
      var topmost = $$(".scrim--dialog.is-open, .drawer-host").pop();
      if (topmost !== wrap) { return; }
      if (e.key === "Escape") { e.stopPropagation(); ctl.cancel(); return; }
      trapFocus(panel, e);
    }
    root.document.addEventListener("keydown", keyHandler, true);
    panel.addEventListener("click", function (e) {
      if (e.target.closest("[data-jcrm-overlay-cancel]")) { e.preventDefault(); ctl.cancel(); return; }
      var fl = e.target.closest("[data-jcrm-focus]");
      if (fl) { e.preventDefault(); var x = $('[name="' + fl.getAttribute("data-jcrm-focus") + '"]', panel); if (x) { x.focus(); } }
    });
    if (kind === "drawer") { $(".scrim", wrap).addEventListener("click", function () { ctl.cancel(); }); }
    else { wrap.addEventListener("click", function (e) { if (e.target === wrap) { ctl.cancel(); } }); }
    panel.addEventListener("input", function () { form.sync(panel, fields); });
    panel.addEventListener("change", function () { form.sync(panel, fields); });
    panel.addEventListener("submit", function (e) {
      e.preventDefault();
      var values = form.read(panel, fields);
      var errs = form.validate(fields, values);
      if (!form.showErrors(panel, fields, errs)) { var firstBad = $("[aria-invalid=true]", panel); if (firstBad) { firstBad.focus(); } return; }
      delete values.__ack; delete values.__type;
      var res = o.onSubmit ? o.onSubmit(values, ctl) : true;
      if (res && res.errors) { form.showErrors(panel, fields, res.errors); return; }
      if (res !== false) { ctl.close(); }
    });
    var submitBtn = $("[data-jcrm-overlay-submit]", panel);
    if (submitBtn) { submitBtn.setAttribute("type", "submit"); }
    focusStack.push(root.document.activeElement);
    form.sync(panel, fields);
    initial = JSON.stringify(ctl.values());
    if (kind === "drawer") { root.requestAnimationFrame(function () { panel.classList.add("is-open"); focusFirst(panel); }); } else { focusFirst(panel); }
    return ctl;
  }
  function dialog(o) { return buildOverlay("dialog", o || {}); }
  function drawer(o) { return buildOverlay("drawer", o || {}); }
  /* ยืนยันการกระทำ · o = { title, message, confirmLabel (ต้องเป็นกริยาจริง ห้าม "ตกลง"), variant: "danger"|"danger-outline"|"primary"|"accent", ack, typeToConfirm, cancelLabel, onConfirm, onCancel } */
  function confirm(o) {
    return dialog({ title: o.title, size: "sm", intro: o.message ? "<p>" + esc(o.message) + "</p>" : "", ack: o.ack, typeToConfirm: o.typeToConfirm,
      submitLabel: o.confirmLabel, submitVariant: o.variant || "primary", cancelLabel: o.cancelLabel,
      onSubmit: function (v, ctl) { if (o.onConfirm) { return o.onConfirm(v, ctl); } return true; }, onCancel: o.onCancel });
  }
  /* dialog เหตุผลบังคับจาก ref (เหตุผลไม่สำเร็จ · เหตุผลเปลี่ยนผู้รับผิดชอบ · เหตุผลสร้างซ้ำ ...) · ค่า OTHER บังคับหมายเหตุ (design-system ข้อ 7.12)
     o = { title, ref, label, requiredMessage, noteLabel, noteRequiredWhen: "OTHER", extraFields, submitLabel, submitVariant, intro, onSubmit(values) } */
  function reasonDialog(o) {
    var fields = [{ name: "reason", label: o.label || "เหตุผล", type: "select", ref: o.ref, required: true, requiredMessage: o.requiredMessage }]
      .concat(o.extraFields || [])
      .concat([{ name: "note", label: o.noteLabel || "หมายเหตุ", type: "textarea", piiWarn: true, maxLength: 2000, requiredWhen: { field: "reason", equals: o.noteRequiredWhen || "OTHER" }, requiredMessage: o.noteRequiredMessage || "กรอกหมายเหตุเมื่อเลือกอื่น ๆ" }]);
    return dialog({ title: o.title, size: "md", intro: o.intro, fields: fields, submitLabel: o.submitLabel || "บันทึก", submitVariant: o.submitVariant || "accent", onSubmit: o.onSubmit });
  }

  /* =========================================================================
     8. กราฟ SVG (C-CHART · ข้อ 15 v2.2)
        ทุกกราฟ: สีจาก token · เส้นคั่น 2px --chart-separator (= --white ตามข้อ 15) ของโดนัท/funnel · legend "ชื่อ · จำนวน · %" ตาม sort_order
        ปุ่ม "ดูเป็นตาราง" สลับเป็น <table> ข้อมูลเดียวกัน · <svg role="img"> + <desc> · ห้ามส้ม
     ====================================================================== */
  function num1(x) { return (Math.floor(x * 10) / 10).toString(); }   /* พิกัด SVG เท่านั้น ไม่ใช่ตัวเลขที่แสดง */
  function mount(el, markup) { var host = el && root.document ? byId(el) : null; if (host) { host.innerHTML = markup; } return markup; }
  function dataTable(caption, headers, rows) {
    return '<div class="table-wrap chart__table"><table class="table table--compact"><caption class="sr-only">' + esc(caption) + "</caption><thead><tr>" +
      headers.map(function (h, i) { return '<th scope="col"' + (i ? " data-numeric" : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return i ? "<td data-numeric>" + esc(c) + "</td>" : '<th scope="row">' + esc(c) + "</th>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function chartFrame(o, graphic, tableHtml, noteHtml) {
    var toggle = o.tableToggle === false ? "" : '<div class="chart__toolbar"><button type="button" class="btn btn--ghost btn--sm" data-jcrm-chart-toggle aria-pressed="false">' + esc(T.tableToggleOn) + "</button></div>";
    return '<figure class="chart" data-view="graph">' + toggle + '<div class="chart__graphic">' + graphic + "</div>" + tableHtml + (noteHtml || "") + "</figure>";
  }
  function emptyChart(o) {
    return o.sample ? ui.sampleNote(o.sample) : ui.state("empty", { title: (o.emptyTitle || "ยังไม่มีข้อมูลในช่วงนี้"), compact: true });
  }
  var chart = {};
  /* แหล่งที่มา (ข้อ 13.3) → segment ตามลำดับ ref.channels (sort_order) · label = labelTh */
  chart.sourceSegments = function (obj) {
    return D.channels.map(function (ch, i) { return { key: ch.code, label: ch.labelTh, value: obj ? (obj[ch.code] || 0) : 0, color: ch.chart, sort: i + 1 }; });
  };
  /* ลูกค้าใหม่/เก่า (ข้อ 13.1 · 13.2 · สี --chart-2 / --chart-7 ตามข้อ 15) · scope = "ALL" | "JP1".. */
  chart.newReturningSegments = function (scope) {
    var row = !scope || scope === "ALL" ? D.kpis.branchesTotal : find(D.kpis.branches, "branch", scope);
    if (!row) { return []; }
    return [{ key: "NEW_CUSTOMERS", label: D.kpiLabels.NEW_CUSTOMERS, value: row.newCustomers, color: "--chart-2", sort: 1 },
      { key: "RETURNING_CUSTOMERS", label: D.kpiLabels.RETURNING_CUSTOMERS, value: row.returningCustomers, color: "--chart-7", sort: 2 }];
  };
  /* Funnel stages ของขอบเขต ("ALL" | "JP1"..) · labels: "short" (Visitor · Lead · Opportunity · Sale ตาม 13.1) | "kpi" (ป้าย KPI ข้อ 12.1) */
  chart.funnelStages = function (scope, labels) {
    var f = D.funnels[scope || "ALL"];
    if (!f) { return []; }
    return D.funnelStages.map(function (s) { return { key: s.key, label: labels === "kpi" ? D.kpiLabels[s.key] : s.labelTh, value: f[s.key], color: s.chart }; });
  };
  /* ลูกค้าเข้าร้านแยกตามสาขา (13.2 คอลัมน์ Walk-in) · preset TODAY ใช้ 13.11 */
  chart.walkinByBranchItems = function (preset) {
    var rows = preset === "TODAY" ? D.kpis.today.rows : D.kpis.branches;
    return rows.map(function (r) { return { label: branchName(r.branch), value: preset === "TODAY" ? r.walkInVisits : r.walkInVisits, color: "--chart-1" }; });
  };

  /* โดนัท (C-CHART-DONUT) · o = { title, segments: [{ key, label, value, color, sort }], centerValue, centerLabel, desc, tableToggle, sample, legendAction }
     แสดงเฉพาะ segment > 0 (ข้อ 13.3 · D3) · ร้อยละคิดจากผลรวม segment · เรียงตาม sort */
  chart.donut = function (el, o) {
    var segs = (o.segments || []).filter(function (s) { return Number(s.value) > 0; }).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
    var total = segs.reduce(function (a, s) { return a + Number(s.value); }, 0);
    if (!segs.length) { return mount(el, emptyChart(o)); }
    var R = 84, W = 32, C = 2 * Math.PI * R, off = 0, cum = 0;
    var desc = o.desc || ((o.title || "") + " " + fmt.int(isNil(o.centerValue) ? total : o.centerValue) + ": " + segs.map(function (s) { return s.label + " " + fmt.int(s.value) + " " + fmt.pct(s.value, total); }).join(" · "));
    var tid = uid("chart");
    var svg = '<svg viewBox="0 0 200 200" role="img" aria-labelledby="' + tid + '-t ' + tid + '-d"><title id="' + tid + '-t">' + esc(o.title || "") + '</title><desc id="' + tid + '-d">' + esc(desc) + "</desc>" +
      '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="var(--chart-track)" stroke-width="' + W + '"></circle>';
    segs.forEach(function (s) {
      var len = C * Number(s.value) / total;
      svg += '<circle data-seg="' + esc(s.key || s.label) + '" cx="100" cy="100" r="' + R + '" fill="none" stroke="var(' + esc(s.color) + ')" stroke-width="' + W + '" stroke-dasharray="' +
        num1(len) + " " + num1(C - len) + '" stroke-dashoffset="' + num1(-off) + '" transform="rotate(-90 100 100)"></circle>';
      off += len;
    });
    if (segs.length > 1) {
      segs.forEach(function (s) {
        var ang = -Math.PI / 2 + 2 * Math.PI * cum / total;
        cum += Number(s.value);
        var r1 = R - W / 2 - 1, r2 = R + W / 2 + 1;
        svg += '<line x1="' + num1(100 + r1 * Math.cos(ang)) + '" y1="' + num1(100 + r1 * Math.sin(ang)) + '" x2="' + num1(100 + r2 * Math.cos(ang)) + '" y2="' + num1(100 + r2 * Math.sin(ang)) +
          '" stroke="var(--chart-separator)" stroke-width="2"></line>';
      });
    }
    svg += '<text x="100" y="100" text-anchor="middle" class="chart-text" font-size="28" font-weight="600" fill="var(--text-heading)">' + esc(fmt.int(isNil(o.centerValue) ? total : o.centerValue)) + "</text>" +
      '<text x="100" y="124" text-anchor="middle" class="chart-text" font-size="13" fill="var(--text-secondary)">' + esc(o.centerLabel || "") + "</text></svg>";
    var legend = '<ul class="chart-legend">' + segs.map(function (s) {
      return '<li><button type="button" class="legend-item legend-item--button" aria-pressed="false" data-jcrm-legend="' + esc(s.key || s.label) + '"><span class="legend-item__swatch" style="background:var(' + esc(s.color) + ')" aria-hidden="true"></span>' +
        '<span class="legend-item__label">' + esc(s.label) + '</span><span class="legend-item__value">' + esc(fmt.int(s.value)) + "<strong>" + esc(fmt.pct(s.value, total)) + "</strong></span></button></li>";
    }).join("") + "</ul>";
    var tbl = dataTable(o.title || "โดนัท", [o.tableLabel || "รายการ", "จำนวน", "ร้อยละ"], segs.map(function (s) { return [s.label, fmt.int(s.value), fmt.pct(s.value, total)]; }).concat([["รวม", fmt.int(total), fmt.pct(total, total)]]));
    return mount(el, chartFrame(o, '<div class="chart__row"><div class="chart__donut">' + svg + "</div>" + legend + "</div>", tbl));
  };
  /* Funnel (C-CHART-FUNNEL) · o = { title, stages: [{ label, value, color }], note, tableToggle, sample }
     ร้อยละเทียบขั้นแรก (ขั้นแรก 100.0% · ข้อ 1.3 v2.2) · เส้นคั่น 2px · tooltip period-based บังคับ (ข้อ 3.1) */
  chart.funnel = function (el, o) {
    var st = o.stages || [];
    if (!st.length || !Number(st[0].value)) { return mount(el, emptyChart(o)); }
    var first = Number(st[0].value), W = 440, rowH = 52, H = st.length * rowH, labelW = 150, valueW = 90, barMax = W - labelW - valueW;
    var tid = uid("chart");
    var desc = (o.title || "Funnel") + ": " + st.map(function (s) { return s.label + " " + fmt.int(s.value) + " " + fmt.pct(s.value, first); }).join(" → ");
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="' + tid + '-t ' + tid + '-d"><title id="' + tid + '-t">' + esc(o.title || "Funnel") + '</title><desc id="' + tid + '-d">' + esc(desc) + "</desc>";
    st.forEach(function (s, i) {
      var w = Math.max(barMax * Number(s.value) / first, 4), y = i * rowH + 4;
      svg += '<text x="0" y="' + (y + 27) + '" class="chart-text" font-size="14" font-weight="500" fill="var(--text-primary)">' + esc(s.label) + "</text>" +
        '<rect x="' + labelW + '" y="' + y + '" width="' + num1(w) + '" height="' + (rowH - 8) + '" rx="4" fill="var(' + esc(s.color) + ')" stroke="var(--chart-separator)" stroke-width="2"></rect>' +
        '<text x="' + (W - valueW + 12) + '" y="' + (y + 20) + '" class="chart-text" font-size="16" font-weight="600" fill="var(--text-heading)">' + esc(fmt.int(s.value)) + "</text>" +
        '<text x="' + (W - valueW + 12) + '" y="' + (y + 38) + '" class="chart-text" font-size="12" fill="var(--text-secondary)">' + esc(fmt.pct(s.value, first)) + "</text>";
    });
    svg += "</svg>";
    var noteText = o.note || T.funnelPeriodBased;
    var note = o.note === false ? "" : '<p class="chart__note"><span class="info-dot" tabindex="0" data-tooltip="' + esc(noteText) + '" aria-label="' + esc(noteText) + '">i</span> ร้อยละเทียบกับ ' + esc(st[0].label) + " · นับตามช่วงเวลา</p>";
    var tbl = dataTable(o.title || "Funnel", ["ขั้น", "จำนวน", "% ของ " + st[0].label], st.map(function (s) { return [s.label, fmt.int(s.value), fmt.pct(s.value, first)]; }));
    return mount(el, chartFrame(o, svg, tbl, note));
  };
  /* แท่งแนวนอน (C-CHART-HBAR) · o = { title, items: [{ label, value, display, color }], color: "--chart-lost" (เหตุผลไม่สำเร็จ) | "--chart-1" (walk-in แยกสาขา), max, tableToggle, valueLabel } */
  chart.hbar = function (el, o) {
    var items = o.items || [];
    if (!items.length) { return mount(el, emptyChart(o)); }
    var max = o.max || Math.max.apply(null, items.map(function (i) { return Number(i.value) || 0; })) || 1;
    var W = 440, rowH = 32, H = items.length * rowH, lw = 150, vw = 96, bmax = W - lw - vw;
    var tid = uid("chart");
    var desc = (o.title || "") + ": " + items.map(function (i) { return i.label + " " + (i.display || fmt.int(i.value)); }).join(" · ");
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="' + tid + '-t ' + tid + '-d"><title id="' + tid + '-t">' + esc(o.title || "") + '</title><desc id="' + tid + '-d">' + esc(desc) + "</desc>";
    items.forEach(function (it, i) {
      var w = Math.max(bmax * (Number(it.value) || 0) / max, 2), y = i * rowH;
      svg += '<text x="0" y="' + (y + 20) + '" class="chart-text" font-size="13" fill="var(--text-primary)">' + esc(it.label) + "</text>" +
        '<rect x="' + lw + '" y="' + (y + 8) + '" width="' + num1(w) + '" height="16" rx="3" fill="var(' + esc(it.color || o.color || "--chart-lost") + ')"></rect>' +
        '<text x="' + (W - vw + 10) + '" y="' + (y + 21) + '" class="chart-text" font-size="13" font-weight="600" fill="var(--text-heading)">' + esc(it.display || fmt.int(it.value)) + "</text>";
    });
    svg += "</svg>";
    var tbl = dataTable(o.title || "กราฟแท่ง", ["รายการ", o.valueLabel || "ค่า"], items.map(function (it) { return [it.label, it.display || fmt.int(it.value)]; }));
    return mount(el, chartFrame(o, svg, tbl));
  };
  /* แท่งแนวตั้ง (C-CHART-BAR · สำรอง) · o = { title, items, color } */
  chart.bar = function (el, o) {
    var items = o.items || [];
    if (!items.length) { return mount(el, emptyChart(o)); }
    var max = o.max || Math.max.apply(null, items.map(function (i) { return Number(i.value) || 0; })) || 1;
    var W = Math.max(items.length * 72, 240), H = 220, base = 180, top = 24, bw = 32;
    var tid = uid("chart");
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="' + tid + '-t"><title id="' + tid + '-t">' + esc(o.title || "") + "</title>" +
      '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="var(--chart-grid)"></line>';
    items.forEach(function (it, i) {
      var h = (base - top) * (Number(it.value) || 0) / max, cx = i * 72 + 36;
      svg += '<rect x="' + (cx - bw / 2) + '" y="' + num1(base - h) + '" width="' + bw + '" height="' + num1(h) + '" rx="4" fill="var(' + esc(it.color || o.color || "--chart-1") + ')"></rect>' +
        '<text x="' + cx + '" y="' + num1(base - h - 6) + '" text-anchor="middle" class="chart-text" font-size="12" font-weight="600" fill="var(--text-heading)">' + esc(it.display || fmt.int(it.value)) + "</text>" +
        '<text x="' + cx + '" y="' + (base + 18) + '" text-anchor="middle" class="chart-text" font-size="11" fill="var(--chart-label)">' + esc(it.label) + "</text>";
    });
    svg += "</svg>";
    var tbl = dataTable(o.title || "กราฟแท่ง", ["รายการ", o.valueLabel || "ค่า"], items.map(function (it) { return [it.label, it.display || fmt.int(it.value)]; }));
    return mount(el, chartFrame(o, svg, tbl));
  };
  /* ชื่อเดิม: chart.bars(el, { orientation: "vertical" | "horizontal" }) */
  chart.bars = function (el, o) { return o.orientation === "vertical" ? chart.bar(el, o) : chart.hbar(el, o); };
  /* เหตุผลที่ไม่สำเร็จ 5 อันดับ + อื่น ๆ ท้ายสุด (ข้อ 5.5 · 13.4) · ร้อยละคิดจากผลรวมของขอบเขต · ค่าเท่ากันเรียงตาม sort_order */
  chart.lostReasonItems = function (branchCode) {
    var L = D.kpis.lostReasons;
    var pick = function (r) { return branchCode && branchCode !== "ALL" ? r.byBranch[branchCode] : r.total; };
    var total = branchCode && branchCode !== "ALL" ? L.total.byBranch[branchCode] : L.total.total;
    var rows = L.top.map(function (r) { return { label: label("lostReasons", r.code), value: pick(r), sort: find(D.lostReasons, "code", r.code).sort }; });
    rows.sort(function (a, b) { return b.value - a.value || a.sort - b.sort; });
    rows.push({ label: D.lostReasonOthersLabel, value: pick(L.others) });
    return rows.map(function (r) { return { label: r.label, value: r.value, display: fmt.int(r.value) + " · " + fmt.pct(r.value, total), color: "--chart-lost" }; });
  };

  /* =========================================================================
     9. Pipeline — กติกาการเลื่อนขั้นด้วยมือ (ข้อ 4.4 v2.2 · D48 · 14.9) + Kanban (C-KANBAN)
     ====================================================================== */
  var MR = D.opportunityMoveRules;
  var pipeline = {
    rules: MR,
    stageLabel: function (code) { return label("opportunityStages", code); },
    /* มีใบเสนอราคา sent_at แล้วหรือไม่: ค่าที่ส่งมา (true/false) ชนะ · ไม่ส่ง = ตามนิยามขั้นในตาราง 4.4 */
    hasSentQuotation: function (stage, explicit) {
      if (explicit === true || explicit === false) { return explicit; }
      var s = find(D.opportunityStages, "code", stage);
      return !!(s && s.hasSentQuotationByDefinition);
    },
    /* ปลายทางที่ย้ายด้วยมือได้: QUOTATION → [FOLLOW_UP] · INTERESTED → [QUOTATION, FOLLOW_UP] เฉพาะเมื่อส่งใบเสนอราคาแล้ว · อื่น → [] */
    allowedTargets: function (fromStage, hasSentQuotation) {
      var sent = pipeline.hasSentQuotation(fromStage, hasSentQuotation);
      return MR.manual.filter(function (r) { return r.from === fromStage && (!r.requiresSentQuotation || sent); }).map(function (r) { return r.to; });
    },
    /* ตรวจการย้าย from → to · คืน { ok, reasonKey, reason, tone } (ไม่ตรวจสิทธิ์) */
    checkMove: function (fromStage, toStage, opts) {
      var sent = pipeline.hasSentQuotation(fromStage, opts && opts.hasSentQuotation);
      var R = MR.reasonsTh;
      var no = function (key, tone) { return { ok: false, reasonKey: key, reason: R[key], tone: tone || "warning" }; };
      if (fromStage === toStage) { return no("sameStage", "info"); }
      if (MR.closeStages.indexOf(fromStage) !== -1) { return no("fromClosed", "info"); }
      if (MR.closeStages.indexOf(toStage) !== -1) { return no("toClosed", "info"); }
      if (MR.neverManualTo.indexOf(toStage) !== -1) { return no("toInterested"); }
      if (pipeline.allowedTargets(fromStage, sent).indexOf(toStage) !== -1) { return { ok: true, reasonKey: null, reason: null, tone: "success" }; }
      if (fromStage === "INTERESTED") { return no("needSentQuotation"); }
      if (fromStage === "FOLLOW_UP" && toStage === "QUOTATION") { return no("followUpToQuotation", "info"); }
      return no("toInterested");
    },
    /* ตรวจทั้งกติกาและสิทธิ์ opportunity.update บนแถว (card = { stage, branch, owner, hasSentQuotation }) */
    canMoveCard: function (card, toStage, as) {
      var acc = access(MR.movePermission, { branch: card.branch, owner: card.owner }, as);
      if (!acc.allowed) { return { ok: false, reasonKey: "noPermission", reason: acc.visible ? acc.reason : MR.reasonsTh.noPermission, tone: "warning" }; }
      return pipeline.checkMove(card.stage, toStage, { hasSentQuotation: card.hasSentQuotation });
    },
    /* เหตุผลเมื่อการ์ดไม่มีปลายทางที่ย้ายได้ (ใช้ในเมนู "ย้ายไปขั้น…") */
    noTargetReason: function (card) {
      var R = MR.reasonsTh;
      if (MR.closeStages.indexOf(card.stage) !== -1) { return R.fromClosed; }
      if (card.stage === "INTERESTED") { return R.needSentQuotation; }
      if (card.stage === "FOLLOW_UP") { return R.followUpToQuotation; }
      return R.toInterested;
    },
    canDrag: function (card, as) {
      return access(MR.movePermission, { branch: card.branch, owner: card.owner }, as).allowed && pipeline.allowedTargets(card.stage, card.hasSentQuotation).length > 0;
    }
  };

  /* Kanban · JCRM.kanban.mount(elementOrId, o) → controller { render(), move(cardId, toStage), columns }
     o = { id, columns: [{ stage, labelTh, count, amount, cards: [card], footerTh }], as,
           openAction: "open-opportunity" (id = card.id),
           menuExtra(card) → [{ label, action, permission, ctx, reason }] (เช่น ปิดการขาย/ไม่สำเร็จ),
           onMove(card, toStage) → false เพื่อยกเลิก (ค่าเริ่มต้นย้ายในหน่วยความจำ + ปรับจำนวน/มูลค่าหัวคอลัมน์),
           mobileTabs: true }
     card = { id, customerNo, product, amount, cardDate, dateKind ("won"), overdue, owner, priority, stage, branch, hasSentQuotation, opportunityNo } */
  var boards = {};
  var kanban = {
    cardId: function (card) { return card.id || card.opportunityNo || card.customerNo; },
    renderCard: function (card, o) {
      var cid = kanban.cardId(card);
      var draggable = card.stage !== "WON" && pipeline.canDrag(card, o.as);
      var name = customerName(card.customerNo);
      var dateText = card.dateKind === "won" ? "ปิดการขาย " + fmt.dayMonth(card.cardDate) : fmt.dayMonth(card.cardDate);
      return '<article class="kanban-card" data-card-id="' + esc(cid) + '"' + (card.priority ? ' data-priority="' + esc(card.priority) + '"' : "") +
        ' draggable="' + draggable + '" tabindex="0" aria-label="' + esc(name + " · " + (card.product || "") + " · " + fmt.money(card.amount)) + '"' + (draggable ? "" : ' aria-disabled="true"') + ">" +
        '<div class="kanban-card__head">' + (o.openAction ? '<a href="#" class="kanban-card__name" data-jcrm-action="' + esc(o.openAction) + '" data-jcrm-id="' + esc(cid) + '">' + esc(name) + "</a>" : '<span class="kanban-card__name">' + esc(name) + "</span>") +
        '<div class="popover-host"><button type="button" class="icon-btn icon-btn--sm kanban-card__menu" data-jcrm-kanban-menu="' + esc(o.id) + '" data-card-id="' + esc(cid) + '" aria-haspopup="menu" aria-expanded="false" aria-label="เมนูการ์ด ' + esc(name) + '">' + icon("moreV") + "</button></div></div>" +
        '<span class="kanban-card__product">' + esc(card.product || DASH) + "</span>" +
        '<div class="row-between"><span class="kanban-card__amount">' + esc(fmt.money(card.amount)) + "</span>" + ui.priorityBadge(card.priority) + "</div>" +
        '<div class="kanban-card__foot"><span class="row" style="gap:var(--space-1)">' + icon("calendar", "nav-icon") + esc(dateText) + (card.overdue ? " " + ui.badge("เกินกำหนด", "danger", "badge--square") : "") + "</span>" +
        '<span class="kanban-card__owner">' + ui.avatar(staffName(card.owner), "xs") + esc(staffName(card.owner)) + "</span></div></article>";
    },
    mount: function (el, o) {
      var host = byId(el);
      if (!host) { return null; }
      o.id = o.id || (host.id ? host.id + "-kanban" : uid("kanban"));
      var ctl = {
        options: o,
        host: host,
        find: function (cid) {
          for (var i = 0; i < o.columns.length; i++) {
            var c = o.columns[i];
            for (var j = 0; j < c.cards.length; j++) { if (kanban.cardId(c.cards[j]) === cid) { return { col: c, card: c.cards[j], index: j }; } }
          }
          return null;
        },
        render: function () {
          var active = ctl.activeStage || (o.columns[0] && o.columns[0].stage);
          var tabs = o.mobileTabs === false ? "" : '<div class="kanban__tabs">' + ui.segmented({ label: "ขั้นของโอกาสขาย", action: "__kanban-tab:" + o.id, value: active, options: o.columns.map(function (c) {
            return { value: c.stage, label: c.labelTh + " " + (isNil(c.count) ? DASH : fmt.int(c.count)) };
          }) }) + "</div>";
          host.innerHTML = tabs + '<div class="kanban" id="' + esc(o.id) + '" data-active-stage="' + esc(active) + '" aria-live="polite">' + o.columns.map(function (c) {
            return '<section class="kanban__col' + (c.stage === active ? " is-active" : "") + '" data-stage="' + esc(c.stage) + '" aria-label="' + esc(c.labelTh) + '">' +
              '<header class="kanban__col-head"><h3 class="kanban__col-title">' + esc(c.labelTh) + '</h3><div class="kanban__col-meta"><span>(' + esc(isNil(c.count) ? DASH : fmt.int(c.count)) + ' รายการ)</span><span class="kanban__col-amount">' +
              esc(fmt.money(c.amount)) + "</span></div></header>" +
              '<div class="kanban__col-body">' + (c.cards.length ? c.cards.map(function (card) { return kanban.renderCard(card, o); }).join("") : '<p class="kanban__more">ไม่มีรายการ</p>') + "</div>" +
              '<p class="kanban__more">' + esc(c.footerTh || (isNil(c.count) ? "แสดง " + fmt.int(c.cards.length) + " จาก – รายการ" : "แสดง " + fmt.int(c.cards.length) + " จาก " + fmt.int(c.count) + " รายการ")) + "</p></section>";
          }).join("") + "</div>";
          bindBoard(ctl, host);
        },
        move: function (cid, toStage) {
          var hit = ctl.find(cid);
          if (!hit) { return false; }
          var check = pipeline.canMoveCard(hit.card, toStage, o.as);
          if (!check.ok) { toast(check.reason, check.tone); return false; }
          if (o.onMove && o.onMove(hit.card, toStage) === false) { return false; }
          var target = find(o.columns, "stage", toStage);
          hit.col.cards.splice(hit.index, 1);
          if (!isNil(hit.col.count)) { hit.col.count -= 1; }
          if (!isNil(hit.col.amount) && !isNil(hit.card.amount)) { hit.col.amount -= hit.card.amount; }
          hit.card.stage = toStage;
          target.cards.unshift(hit.card);
          if (!isNil(target.count)) { target.count += 1; }
          if (!isNil(target.amount) && !isNil(hit.card.amount)) { target.amount += hit.card.amount; }
          ctl.render();
          toast(MR.movedToastTh.replace("{ลูกค้า}", customerName(hit.card.customerNo)).replace("{ขั้น}", target.labelTh), "success");
          return true;
        }
      };
      boards[o.id] = ctl;
      ctl.render();
      return ctl;
    },
    get: function (id) { return boards[id] || null; },
    menuHtml: function (ctl, cid) {
      var hit = ctl.find(cid);
      if (!hit) { return ""; }
      var o = ctl.options, card = hit.card;
      var acc = access(MR.movePermission, { branch: card.branch, owner: card.owner }, o.as);
      var targets = card.stage === "WON" ? [] : pipeline.allowedTargets(card.stage, card.hasSentQuotation);
      var moveItems = !acc.visible ? "" : '<p class="menu-group-label">ย้ายไปขั้น…</p>' + (acc.allowed && targets.length ? targets.map(function (st) {
        return '<button type="button" class="menu-item" role="menuitem" data-jcrm-kanban-move="' + esc(o.id) + '" data-card-id="' + esc(cid) + '" data-stage="' + esc(st) + '">' + esc(pipeline.stageLabel(st)) + "</button>";
      }).join("") : (function () {
        var why = acc.allowed ? pipeline.noTargetReason(card) : acc.reason;
        return '<button type="button" class="menu-item" role="menuitem" aria-disabled="true" data-tooltip="' + esc(why) + '"><span>ไม่มีขั้นที่ย้ายได้<span class="menu-item__label-disabled">' + esc(why) + "</span></span></button>";
      })());
      var extra = (o.menuExtra ? o.menuExtra(card) : []).map(function (m) {
        var a = m.permission ? access(m.permission, m.ctx || { branch: card.branch, owner: card.owner }, o.as) : { visible: true, allowed: true };
        if (!a.visible) { return ""; }
        var reason = !a.allowed ? a.reason : m.reason;
        return '<button type="button" class="menu-item" role="menuitem"' + (reason ? ' aria-disabled="true" data-tooltip="' + esc(reason) + '"' : ' data-jcrm-action="' + esc(m.action) + '" data-jcrm-id="' + esc(cid) + '"') + "><span>" + esc(m.label) + "</span></button>";
      }).join("");
      return '<div role="menu">' + (o.openAction ? '<button type="button" class="menu-item" role="menuitem" data-jcrm-action="' + esc(o.openAction) + '" data-jcrm-id="' + esc(cid) + '">ดูรายละเอียด</button>' : "") + moveItems + extra + "</div>";
    }
  };
  function bindBoard(ctl, host) {
    var dragId = null;
    $$(".kanban-card[draggable=true]", host).forEach(function (card) {
      card.addEventListener("dragstart", function (e) {
        dragId = card.getAttribute("data-card-id");
        card.classList.add("is-dragging");
        try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* IE */ }
      });
      card.addEventListener("dragend", function () { card.classList.remove("is-dragging"); $$(".kanban__col", host).forEach(function (c) { c.removeAttribute("data-drop"); }); });
    });
    $$(".kanban__col", host).forEach(function (col) {
      col.addEventListener("dragover", function (e) {
        if (!dragId) { return; }
        e.preventDefault();
        var hit = ctl.find(dragId);
        var ok = hit && pipeline.canMoveCard(hit.card, col.getAttribute("data-stage"), ctl.options.as).ok;
        col.setAttribute("data-drop", ok ? "ok" : "no");
        if (!ok && hit && hit.card.stage !== col.getAttribute("data-stage") && !col.getAttribute("data-tip")) {
          col.setAttribute("data-tip", "1");
          col.title = pipeline.canMoveCard(hit.card, col.getAttribute("data-stage"), ctl.options.as).reason || "";
        }
      });
      col.addEventListener("dragleave", function () { col.removeAttribute("data-drop"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.removeAttribute("data-drop"); col.removeAttribute("data-tip"); col.title = "";
        var cid = dragId; dragId = null;
        if (!cid) { return; }
        var hit = ctl.find(cid);
        if (!hit || hit.card.stage === col.getAttribute("data-stage")) { return; }
        ctl.move(cid, col.getAttribute("data-stage"));
      });
    });
  }

  /* =========================================================================
     10. ตัวเลือกข้อมูลตาม persona — JCRM.select.* (มี alias บน JCRM.data เช่น JCRM.data.tasksFor("ST-0045"))
         คืนเฉพาะค่าที่ CANONICAL พิมพ์ · ไม่มีค่า = null (หน้าจอแสดง "–") · sample = ข้อความ C-STATE-SAMPLE (null = ไม่ต้องแสดง)
         as = staffCode | { staffCode, aal } | ไม่ส่ง (ผู้ใช้ปัจจุบัน)
     ====================================================================== */
  var BRANCHES4 = ["JP1", "JP2", "JP3", "JP4"];
  var select = {};
  /* ขอบเขตหลักของผู้ใช้จาก dashboard.view: "org" (G) | "branch" (B) | "team" (T) | "own" (O) | "none" */
  select.scope = function (as) {
    var who = resolveAs(as);
    var top = topScope("dashboard.view", as);
    var kind = { ORGANIZATION: "org", BRANCH: "branch", TEAM: "team", OWN: "own" }[top] || "none";
    var branches = scopeBranches("dashboard.view", "OWN", as);
    var t = who.staff ? teamsOf(who.staff.staffCode).filter(function (x) { return x.isLeader; })[0] : null;
    return { staff: who.staff, staffCode: who.staff ? who.staff.staffCode : null, aal: who.aal, roles: roleCodes(as), kind: kind, branches: branches,
      team: kind === "team" && t ? t.team.code : null, isEmptyScope: !!(who.staff && D.kpis.emptyScopes[who.staff.staffCode]) };
  };
  function normBranch(b) { return !b || b === "ALL" ? "ALL" : b; }

  /* การแจ้งเตือนที่ยังไม่อ่าน (ข้อ 13.14) → [{ code, titleTh, bodyTh, createdAt, href, entityRef }] */
  select.notificationsFor = function (as) {
    var who = resolveAs(as);
    return ((who.staff && D.notifications[who.staff.staffCode]) || []).map(function (n, i) {
      var t = find(D.notificationTypes, "code", n.code);
      var body = n.body || [n.customerNo ? customerName(n.customerNo) : null, n.entityRef || null, n.detailTh || null].filter(Boolean).join(" · ") || null;
      return { index: i, code: n.code, titleTh: t ? t.titleTh : n.code, bodyTh: body, createdAt: n.createdAt, href: linkTarget(n.target), entityRef: n.entityRef || null };
    });
  };

  /* การ์ดหน้า 02 ของสาขา b จากแถว 13.2 · 13.2b · 13.11 (ค่าที่พิมพ์ทั้งหมด) */
  function branchCards(b) {
    var row = find(D.kpis.branches, "branch", b), prev = find(D.kpis.branchPrevious, "branch", b), rate = find(D.kpis.branchRates, "branch", b), today = find(D.kpis.today.rows, "branch", b);
    if (!row) { return []; }
    var base = D.dashboards[1].cards;
    return [
      { key: "uniqueToday", labelTh: base[0].labelTh, display: fmt.int(today.uniqueCustomers), delta: today.growthDisplay, preset: "TODAY", kpiCode: "UNIQUE_CUSTOMERS" },
      { key: "unique", labelTh: base[1].labelTh, display: fmt.int(row.uniqueCustomers), delta: prev.growthDisplay.uniqueCustomers, preset: "LAST_30_DAYS", kpiCode: "UNIQUE_CUSTOMERS" },
      { key: "leads", labelTh: base[2].labelTh, display: fmt.int(row.leads), delta: prev.growthDisplay.leads, preset: "LAST_30_DAYS", kpiCode: "LEADS", target: base[2].target },
      { key: "opportunities", labelTh: base[3].labelTh, display: fmt.int(row.opportunities), delta: prev.growthDisplay.opportunities, preset: "LAST_30_DAYS", kpiCode: "OPPORTUNITIES", target: base[3].target },
      { key: "sales", labelTh: base[4].labelTh, display: fmt.int(row.sales), delta: prev.growthDisplay.sales, preset: "LAST_30_DAYS", kpiCode: "SALES", target: base[4].target },
      { key: "convLeadToSale", labelTh: base[5].labelTh, display: rate.CONV_LEAD_TO_SALE.display, delta: rate.CONV_LEAD_TO_SALE_PP, preset: "LAST_30_DAYS", kpiCode: "CONV_LEAD_TO_SALE" }
    ];
  }
  function staffCards(code) {
    var base = D.dashboards[3].cards;
    var empty = D.kpis.emptyScopes[code];
    var cur = D.kpis.current.staff[code], slice = find(D.kpis.staffJP1.slices, "staff", code);
    var v = function (k) { return empty ? empty.values[k] : null; };
    var vals = empty ? [v("TASKS_TODAY"), v("TASKS_OVERDUE"), v("OPEN_LEADS"), v("OPEN_OPPORTUNITIES"), v("SALES"), v("SALES_AMOUNT"), v("OPEN_PIPELINE_AMOUNT")] :
      (cur && slice ? [cur.TASKS_TODAY, cur.TASKS_OVERDUE, cur.OPEN_LEADS, cur.OPEN_OPPORTUNITIES, slice.sales, slice.salesAmount, cur.OPEN_PIPELINE_AMOUNT] : null);
    if (!vals) { return base.map(function (c) { return { key: c.key, labelTh: c.labelTh, display: DASH, delta: null, asOf: c.asOf, preset: c.preset, kpiCode: c.kpiCode, target: c.target }; }); }
    var disp = [fmt.int(vals[0]), fmt.int(vals[1]), fmt.int(vals[2]), fmt.int(vals[3]) + " (" + fmt.money(vals[6]) + ")", fmt.int(vals[4]), fmt.money(vals[5])];
    return base.map(function (c, i) { return { key: c.key, labelTh: c.labelTh, display: disp[i], delta: null, asOf: c.asOf, preset: c.preset, kpiCode: c.kpiCode, target: c.target }; });
  }
  /* หน้า 02 ตามบทบาท (ข้อ 14.7) → { layout: "org"|"branchManager"|"supervisor"|"staff"|"none", cards, widgets, scopeTh, branch, sample }
     opts.branch = ตัวเลือกสาขาบนแถบบน (ชุดองค์กร: เลือกสาขาเดียว → การ์ดของสาขานั้น) */
  select.dashboardFor = function (as, opts) {
    var sc = select.scope(as), b = normBranch(opts && opts.branch);
    if (!sc.staff || sc.kind === "none") { return { layout: "none", cards: [], widgets: [] }; }
    var roles = sc.roles, db;
    var hideActivity = roles.length && roles.every(function (r) { return r === "MARKETING"; });
    if (sc.kind === "org" || (roles.indexOf("OPERATIONS") !== -1)) {
      db = D.dashboards[0];
      var widgets = db.widgets.filter(function (w) { return !(w.onlyForRoles && !w.onlyForRoles.some(function (r) { return roles.indexOf(r) !== -1; })) && !(w.hiddenForRoles && hideActivity); });
      if (b === "ALL") { return { layout: "org", cards: db.cards, widgets: widgets, scopeTh: db.scopeTh, branch: "ALL", sample: null }; }
      return { layout: "org", cards: branchCards(b), widgets: widgets, scopeTh: branchName(b), branch: b, sample: BRANCHES4.indexOf(b) === -1 ? { scopeTh: branchName(b) } : null };
    }
    if (roles.indexOf("BRANCH_MANAGER") !== -1) {
      var myBranch = find(sc.staff.assignments, "role", "BRANCH_MANAGER").branch;
      db = D.dashboards[1];
      return { layout: "branchManager", cards: myBranch === db.branch ? db.cards : branchCards(myBranch), widgets: db.widgets, scopeTh: branchName(myBranch), branch: myBranch,
        sample: myBranch === "JP1" ? null : { text: "ข้อมูลตัวอย่างรายพนักงานมีเฉพาะ " + branchName("JP1") } };
    }
    if (sc.kind === "team") {
      db = D.dashboards[2];
      return { layout: "supervisor", cards: db.cards, widgets: db.widgets, scopeTh: db.scopeTh, branch: "JP1", team: sc.team, sample: null };
    }
    db = D.dashboards[3];
    var mine = sc.staffCode === db.persona;
    return { layout: "staff", cards: mine ? db.cards : staffCards(sc.staffCode), widgets: db.widgets, scopeTh: db.scopeTh, branch: sc.staff.assignments[0] && sc.staff.assignments[0].branch,
      empty: sc.isEmptyScope, sample: mine || sc.isEmptyScope ? null : { text: "ข้อมูลตัวอย่างไม่มีรายละเอียดรายการของ" + sc.staff.displayName } };
  };

  /* KPI ตามขอบเขต → { kind, preset, branch, values: { CODE: number|null }, rates: { CODE: {num,den,display}|null }, growth: { CODE: "+12%" }, pp: { CODE: "+2.1 pp" }, notes: [] }
     กติกา: scope TEAM/OWN → KPI ที่ไม่ผูกพนักงานเป็น null (ข้อ 9.4.1 · 12.4) · คุณฝน → ข้อ 13.13 · ค่าที่ข้อ 13 ไม่พิมพ์ → null */
  select.kpisFor = function (as, opts) {
    var sc = select.scope(as), b = normBranch(opts && opts.branch), preset = (opts && opts.preset) || D.meta.defaultPreset;
    var out = { kind: sc.kind, preset: preset, branch: b, values: {}, rates: {}, growth: {}, pp: {}, notes: [] };
    if (sc.kind === "none") { out.notes.push(T.rpcDenied); return out; }
    if (sc.isEmptyScope) {
      var e = D.kpis.emptyScopes[sc.staffCode];
      Object.keys(e.values).forEach(function (k) { out.values[k] = e.values[k]; });
      Object.keys(e.rates).forEach(function (k) { out.rates[k] = e.rates[k]; });
      out.notes.push("ข้อ 13.13: จำนวนเป็น 0 · KPI ที่ไม่ผูกพนักงานและอัตรา 0/0 เป็น NULL");
      return out;
    }
    if (preset === "TODAY") {
      var tr = b === "ALL" ? D.kpis.today.total : find(D.kpis.today.rows, "branch", b);
      if (tr && (sc.kind === "org" || sc.kind === "branch")) {
        out.values = { VISITS: tr.visits, WALKIN_VISITS: tr.walkInVisits, IDENTIFIED_VISITS: tr.identifiedVisits, UNIQUE_CUSTOMERS: tr.uniqueCustomers, OPEN_VISITS: tr.openVisits };
        out.growth.UNIQUE_CUSTOMERS = tr.growthDisplay;
      }
      return out;
    }
    if (sc.kind === "org" || sc.kind === "branch") {
      if (b === "ALL" && sc.kind === "org") {
        Object.keys(D.kpis.org.values).forEach(function (k) { out.values[k] = D.kpis.org.values[k]; });
        Object.keys(D.kpis.org.rates).forEach(function (k) { out.rates[k] = D.kpis.org.rates[k]; });
        out.growth = D.kpis.org.growthDisplay; out.pp = D.kpis.org.ppDisplay;
        Object.keys(D.kpis.current.org).forEach(function (k) { out.values[k] = D.kpis.current.org[k]; });
        return out;
      }
      var bb = b === "ALL" ? (sc.branches.length === 1 ? sc.branches[0] : null) : b;
      var row = bb && find(D.kpis.branches, "branch", bb);
      if (!row) { out.notes.push(T.stateSampleNone.replace("{ขอบเขต}", b === "ALL" ? "ทุกสาขาในสิทธิ์ของคุณ" : branchName(b))); return out; }
      var comp = find(D.kpis.branchComponents, "branch", bb), prev = find(D.kpis.branchPrevious, "branch", bb), rt = find(D.kpis.branchRates, "branch", bb);
      out.branch = bb;
      out.values = { VISITS: row.visits, WALKIN_VISITS: row.walkInVisits, IDENTIFIED_VISITS: row.identifiedVisits, UNIQUE_CUSTOMERS: row.uniqueCustomers, NEW_CUSTOMERS: row.newCustomers,
        RETURNING_CUSTOMERS: row.returningCustomers, LEADS: row.leads, OPPORTUNITIES: row.opportunities, SALES: row.sales, SALES_AMOUNT: row.salesAmount,
        LOST_OPPORTUNITIES: row.lostOpportunities, LOST_LEADS: row.lostLeads, LOST_TOTAL: row.lostOpportunities + row.lostLeads, BUYERS: comp.buyers, REPEAT_BUYERS: comp.repeatBuyers,
        LEAD_RESPONSE_MIN: null };
      ["LEAD_RATE", "OPPORTUNITY_RATE", "CLOSE_RATE", "LOST_RATE", "CONV_LEAD_TO_SALE", "CONV_VISIT_TO_SALE", "WALKIN_CONVERSION", "CAPTURE_RATE", "OUTCOME_COMPLETION", "FOLLOWUP_COMPLETION", "REPEAT_RATE"]
        .forEach(function (k) { out.rates[k] = rt[k] || null; });
      out.rates.DUPLICATE_RATE = null; out.rates.MISSING_REQUIRED_RATE = null;
      out.growth = { VISITS: prev.growthDisplay.visits, UNIQUE_CUSTOMERS: prev.growthDisplay.uniqueCustomers, LEADS: prev.growthDisplay.leads, OPPORTUNITIES: prev.growthDisplay.opportunities,
        SALES: prev.growthDisplay.sales, SALES_AMOUNT: row.salesAmountGrowthDisplay };
      out.pp = { CONV_LEAD_TO_SALE: rt.CONV_LEAD_TO_SALE_PP };
      var cur = D.kpis.current.branches[bb] || {};
      Object.keys(cur).forEach(function (k) { out.values[k] = cur[k]; });
      return out;
    }
    var unbound = D.kpis.emptyScopes["ST-0050"].staffUnboundKpis;
    unbound.forEach(function (k) { if (/RATE$/.test(k)) { out.rates[k] = null; } else { out.values[k] = null; } });
    out.notes.push(T.teamScopeNull);
    if (sc.kind === "team") {
      var tm = D.kpis.teamJP1Sales;
      out.values.LEADS = tm.leads; out.values.OPPORTUNITIES = tm.opportunities; out.values.SALES = tm.sales; out.values.SALES_AMOUNT = tm.salesAmount;
      out.values.TASKS_OVERDUE = D.kpis.current.teams[tm.team].TASKS_OVERDUE;
      out.rates.CONV_LEAD_TO_SALE = tm.convLeadToSale;
      return out;
    }
    var sl = find(D.kpis.staffJP1.slices, "staff", sc.staffCode), cs = D.kpis.current.staff[sc.staffCode];
    if (sl) {
      out.values.LEADS = sl.leads; out.values.OPPORTUNITIES = sl.opportunities; out.values.SALES = sl.sales; out.values.SALES_AMOUNT = sl.salesAmount;
      out.values.LOST_OPPORTUNITIES = sl.lostOpportunities; out.values.LOST_LEADS = sl.lostLeads;
      out.rates.CONV_LEAD_TO_SALE = { num: sl.sales, den: sl.leads, display: fmt.pct(sl.sales, sl.leads) };
    }
    Object.keys(cs || {}).forEach(function (k) { out.values[k] = cs[k]; });
    return out;
  };

  /* งาน (หน้า 08 · widget งาน) → { rows, counts: { total, today, overdue } | null, sample, empty, showOwner }
     opts = { branch, owner (staffCode | "none"), group: "all"|"today"|"overdue" } · task ไม่มี read-through (ข้อ 9.4) */
  select.tasksFor = function (as, opts) {
    opts = opts || {};
    var sc = select.scope(as), top = topScope("task.read", as);
    if (!top) { return null; }
    var K = D.tasksKwan, kim = K.kim;
    var res = { rows: [], counts: null, sample: null, empty: false, showOwner: top !== "OWN" };
    var b = normBranch(opts.branch);
    if (sc.isEmptyScope) { res.counts = { total: 0, today: 0, overdue: 0 }; res.empty = true; return res; }
    if (top === "OWN") {
      if (sc.staffCode === K.staff) { res.rows = K.rows.slice(); res.counts = { total: K.total, today: K.today, overdue: K.overdue }; }
      else if (sc.staffCode === kim.staff) { res.counts = { total: kim.today + kim.overdue, today: kim.today, overdue: kim.overdue }; res.sample = { text: "ข้อมูลตัวอย่างไม่มีรายละเอียดงานของคุณคิม · ทั้งหมด " + fmt.int(kim.today + kim.overdue) + " รายการ (ติดตามลูกค้าทั้งหมด)" }; }
      else { res.empty = true; res.counts = { total: 0, today: 0, overdue: 0 }; }
    } else if (top === "TEAM") {
      if (opts.owner === kim.staff) { res.counts = { total: kim.today + kim.overdue, today: kim.today, overdue: kim.overdue }; res.sample = { text: "ข้อมูลตัวอย่างไม่มีรายละเอียดงานของคุณคิม · ทั้งหมด " + fmt.int(kim.today + kim.overdue) + " รายการ" }; }
      else if (opts.owner === K.staff) { res.rows = K.rows.slice(); res.counts = { total: K.total, today: K.today, overdue: K.overdue }; }
      else {
        res.rows = K.rows.slice();
        var overdue = D.kpis.current.teams["JP1-SALES"].TASKS_OVERDUE, today = K.today + kim.today;
        res.counts = { total: today + overdue, today: today, overdue: overdue };
        res.sample = { shown: K.rows.length, total: today + overdue };
      }
    } else {
      var bb = b === "ALL" ? (sc.branches.length === 1 ? sc.branches[0] : "ALL") : b;
      if (bb === "JP1") {
        if (opts.owner === kim.staff) { res.counts = { total: kim.today + kim.overdue, today: kim.today, overdue: kim.overdue }; res.sample = { text: "ข้อมูลตัวอย่างไม่มีรายละเอียดงานของคุณคิม" }; }
        else { res.rows = K.rows.slice(); res.counts = opts.owner === K.staff ? { total: K.total, today: K.today, overdue: K.overdue } : null; res.sample = opts.owner === K.staff ? null : { text: "ข้อมูลตัวอย่างมีเฉพาะรายการที่ระบุชื่อ" }; }
      } else { res.sample = { scopeTh: bb === "ALL" ? "ทุกสาขา" : branchName(bb) }; }
    }
    if (opts.group === "today" || opts.group === "overdue") { res.rows = res.rows.filter(function (r) { return r.group === opts.group; }); }
    return res;
  };
  /* แบ่งกลุ่มสำหรับ ui.taskList: เกินกำหนดก่อน แล้ววันนี้ · เรียง due_at */
  select.groupTasks = function (rows, counts) {
    var sorted = (rows || []).slice().sort(function (a, b) { return fmt.compareIso(a.dueAt, b.dueAt); });
    return D.taskGroups.slice().reverse().map(function (g) {
      return { key: g.key, label: g.labelTh, rows: sorted.filter(function (r) { return r.group === g.key; }), count: counts ? counts[g.key] : null };
    });
  };

  /* รายการลูกค้า (หน้า 03 · ข้อ 13.8) → { rows (customer objects), total, sample, empty }
     opts = { branch, preset: "LAST_30_DAYS"|"TODAY", lifecycle: [codes], badges: [keys], channels: [codes] }
     ยอดรวม: ทุกสาขา = 1,284 / 16 · สาขา = ลูกค้าไม่ซ้ำ 13.2 / 13.11 · มีตัวกรองสถานะ/ช่องทาง → total null */
  select.customersFor = function (as, opts) {
    opts = opts || {};
    if (!can("customer.read", undefined, as)) { return null; }
    var sc = select.scope(as), b = normBranch(opts.branch), preset = opts.preset || D.meta.defaultPreset;
    var rows = D.customerList.rows.map(customer).filter(function (c) {
      /* ตัวกรองสาขาใช้ customer_branches (ข้อ 14.9 v2.2) = c.branch ใน prototype · คอลัมน์ "สาขา" แสดง lastBranch */
      return can("customer.read", { customer: customerCtx(c) }, as) && (b === "ALL" || c.branch === b);
    });
    var filtered = rows.filter(function (c) {
      return (!opts.lifecycle || !opts.lifecycle.length || opts.lifecycle.indexOf(c.lifecycle) !== -1) &&
        (!opts.badges || !opts.badges.length || opts.badges.some(function (k) { return c.badges.indexOf(k) !== -1; })) &&
        (!opts.channels || !opts.channels.length || opts.channels.indexOf(c.lastChannel) !== -1);
    });
    var hasFilter = (opts.lifecycle && opts.lifecycle.length) || (opts.badges && opts.badges.length) || (opts.channels && opts.channels.length);
    var total = null;
    var effB = b === "ALL" && sc.branches.length === 1 ? sc.branches[0] : b;
    if (!hasFilter) {
      if (effB === "ALL") { total = preset === "TODAY" ? D.kpis.today.total.uniqueCustomers : D.customerList.total; }
      else {
        var r = preset === "TODAY" ? find(D.kpis.today.rows, "branch", effB) : find(D.kpis.branches, "branch", effB);
        total = r ? r.uniqueCustomers : (sc.isEmptyScope ? 0 : null);
      }
    }
    var empty = !filtered.length && total === 0;
    return { rows: filtered, total: total, empty: empty, sample: !filtered.length && !empty && total ? { shown: 0, total: total } : null };
  };
  /* ลูกค้าของฉันล่าสุด (ข้อ 13.5 v2.2 · หน้า 02 STAFF และมือถือ) → { rows: [{ customer, lastActivityAt }], empty, sample } | null */
  select.recentCustomersFor = function (as) {
    var sc = select.scope(as);
    if (sc.kind !== "own") { return null; }
    var rc = D.recentCustomers[sc.staffCode];
    if (rc) { return { rows: rc.rows.map(function (r) { return { customer: customer(r.customerNo), customerNo: r.customerNo, lastActivityAt: r.lastActivityAt }; }), empty: false, sample: null }; }
    if (sc.isEmptyScope) { return { rows: [], empty: true, sample: null }; }
    return { rows: [], empty: false, sample: { text: "ไม่มีข้อมูลตัวอย่างลูกค้าล่าสุดของ" + sc.staff.displayName } };
  };
  /* กิจกรรมล่าสุด (ข้อ 13.5 v2.2 · หน้า 02) → { rows: [{ customer, channel, branch, at }] } | null (MARKETING ไม่มี widget)
     BRANCH_MANAGER เห็นเฉพาะแถวของสาขาตน · ชุดองค์กรกรองตามตัวเลือกสาขาบนแถบบน */
  select.recentActivityFor = function (as, opts) {
    var sc = select.scope(as);
    var roles = sc.roles;
    if (!roles.length || roles.every(function (r) { return D.recentActivity.hiddenForRoles.indexOf(r) !== -1 || r === "SYSTEM_ADMIN"; })) { return null; }
    if (sc.kind !== "org" && sc.kind !== "branch") { return null; }
    var b = normBranch(opts && opts.branch);
    var bm = find(sc.staff.assignments, "role", "BRANCH_MANAGER");
    if (bm && roles.indexOf("BRANCH_MANAGER") !== -1 && sc.kind === "branch" && roles.indexOf("OPERATIONS") === -1) { b = bm.branch; }
    var rows = D.recentActivity.rows.map(customer).filter(function (c) { return b === "ALL" || c.lastBranch === b; })
      .map(function (c) { return { customer: c, customerNo: c.customerNo, channel: c.lastChannel, branch: c.lastBranch, at: c.lastActivityAt }; });
    return { rows: rows, branch: b };
  };

  /* Pipeline (หน้า 06 · ข้อ 13.9) → { columns (พร้อมใช้กับ JCRM.kanban.mount), sample, empty, branch }
     opts = { branch, owner, productType } · card.stage/branch ถูกเติมให้ · hasSentQuotation ตามนิยามขั้น 4.4 */
  select.pipelineFor = function (as, opts) {
    opts = opts || {};
    if (!can("opportunity.read", undefined, as)) { return null; }
    var sc = select.scope(as), b = normBranch(opts.branch);
    var readable = scopeBranches("opportunity.read", "OWN", as);
    var effB = b === "ALL" && readable.length === 1 ? readable[0] : b;
    var P = D.pipelineJP1;
    var stageCounts = function (stage) {
      if (opts.owner) {
        var slice = find(D.kpis.staffJP1.slices, "staff", opts.owner);
        if (!slice) { return { count: null, amount: null }; }
        return stage === "WON" ? { count: slice.wonLast7Days, amount: slice.wonLast7DaysAmount } : { count: slice.openByStage ? slice.openByStage[stage] : null, amount: null };
      }
      var col = find(P.columns, "stage", stage);
      return { count: col.count, amount: col.amount };
    };
    var prodMatch = function (card) {
      if (!opts.productType) { return true; }
      var pt = find(D.productTypes, "code", opts.productType);
      return !!pt && String(card.product || "").indexOf(pt.labelTh) === 0;
    };
    var columns = P.columns.map(function (col) {
      var inScope = (effB === P.branch || effB === "ALL") && readable.indexOf(P.branch) !== -1;
      var cards = inScope ? col.cards.filter(function (c) { return (!opts.owner || c.owner === opts.owner) && prodMatch(c); }).map(function (c) {
        var copy = {}; Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
        copy.stage = col.stage; copy.branch = P.branch; copy.id = c.opportunityNo || c.customerNo; copy.dateKind = col.dateKind || null;
        copy.hasSentQuotation = pipeline.hasSentQuotation(col.stage);
        return copy;
      }) : [];
      var counts = inScope && effB === P.branch ? stageCounts(col.stage) : { count: null, amount: null };
      if (opts.productType) { counts = { count: null, amount: null }; }
      return { stage: col.stage, labelTh: col.labelTh, count: sc.isEmptyScope ? 0 : counts.count, amount: sc.isEmptyScope ? 0 : counts.amount, cards: cards };
    });
    var sample = null;
    if (sc.isEmptyScope) { return { columns: columns, empty: true, sample: null, branch: effB }; }
    if (effB !== P.branch) { sample = effB === "ALL" ? { text: "ข้อมูลตัวอย่างมีเฉพาะ " + branchName(P.branch) } : { scopeTh: branchName(effB) }; }
    return { columns: columns, empty: false, sample: sample, branch: effB };
  };

  /* คิวหน้าร้าน + ชิปสรุปวันนี้ (หน้า 07 · ข้อ 13.11) → { rows, chips: { walkIn, onlinePhone, visits, openVisits }, branch, readOnly } */
  select.queueFor = function (as, opts) {
    if (!can("visit.read", undefined, as)) { return null; }
    var readable = scopeBranches("visit.read", "OWN", as);
    var b = normBranch(opts && opts.branch);
    var effB = b === "ALL" ? (readable.indexOf("JP1") !== -1 ? "JP1" : readable[0]) : b;
    var tr = find(D.kpis.today.rows, "branch", effB);
    return { branch: effB, rows: effB === "JP1" ? D.queueJP1.slice() : [], readOnly: !can("visit.create", undefined, as),
      chips: tr ? { walkIn: tr.walkInVisits, onlinePhone: tr.onlinePhoneVisits, visits: tr.visits, openVisits: tr.openVisits } : { walkIn: 0, onlinePhone: 0, visits: 0, openVisits: 0 } };
  };

  /* Leads (หน้า 11) → { counts: { OPEN, NEW, CONTACTED, QUALIFIED } | null, rows (D.leads ที่อ่านได้), sample }
     opts = { branch, status: "OPEN"|"NEW"|"CONTACTED"|"QUALIFIED"|"CONVERTED"|"LOST", owner: staffCode|"none"|"me" } */
  select.leadsFor = function (as, opts) {
    opts = opts || {};
    if (!can("lead.read", undefined, as)) { return null; }
    var sc = select.scope(as), readable = scopeBranches("lead.read", "OWN", as), b = normBranch(opts.branch);
    var effB = b === "ALL" && readable.length === 1 ? readable[0] : b;
    var owner = opts.owner === "me" ? sc.staffCode : opts.owner;
    var cur = D.kpis.current, counts = null;
    if (sc.isEmptyScope) { counts = { OPEN: 0, NEW: 0, CONTACTED: 0, QUALIFIED: 0 }; }
    else if (effB === "JP1" && !owner) { counts = { OPEN: cur.branches.JP1.OPEN_LEADS, NEW: cur.branches.JP1.OPEN_LEADS_BY_STATUS.NEW, CONTACTED: cur.branches.JP1.OPEN_LEADS_BY_STATUS.CONTACTED, QUALIFIED: cur.branches.JP1.OPEN_LEADS_BY_STATUS.QUALIFIED }; }
    else if (effB === "JP1" && owner === "none") { counts = { OPEN: cur.unassigned.JP1.OPEN_LEADS, NEW: null, CONTACTED: null, QUALIFIED: null }; }
    else if (effB === "JP1" && cur.staff[owner]) { counts = { OPEN: cur.staff[owner].OPEN_LEADS, NEW: null, CONTACTED: null, QUALIFIED: null }; }
    var status = opts.status || "OPEN";
    var rows = D.leads.filter(function (l) {
      var openStatus = !l.status || find(D.leadStatuses, "code", l.status).isOpen;
      var statusOk = status === "OPEN" ? openStatus : l.status === status;
      return can("lead.read", { branch: l.branch, owner: l.owner, viaCustomer: customerCtx(l.customerNo) }, as) && (effB === "ALL" || l.branch === effB) && statusOk &&
        (!owner || (owner === "none" ? !l.owner : l.owner === owner));
    });
    var total = counts ? counts[status] : null;
    return { counts: counts, rows: rows, total: isNil(total) ? null : total, empty: sc.isEmptyScope, sample: !sc.isEmptyScope && (isNil(total) || rows.length < total) ? { shown: rows.length, total: total } : null };
  };
  /* ใบเสนอราคา (หน้า 19) → { rows, sample, empty } */
  select.quotationsFor = function (as, opts) {
    if (!can("quotation.read", undefined, as)) { return null; }
    var b = normBranch(opts && opts.branch), status = opts && opts.status;
    var rows = D.quotations.filter(function (q) {
      return can("quotation.read", { branch: q.branch, owner: q.owner, viaCustomer: customerCtx(q.customerNo) }, as) && (b === "ALL" || q.branch === b) && (!status || status === "ALL" || q.status === status);
    });
    return { rows: rows, empty: !rows.length, sample: rows.length ? { text: "ข้อมูลตัวอย่างมีเฉพาะรายการที่ระบุชื่อ" } : null };
  };
  /* ศูนย์คุณภาพข้อมูล (หน้า 12 · ข้อ 13.12 · 13.2b) → { targets: [{ kpi, rate|null }], issues: [{ code, labelTh, count|null, fixPermission }], empty } */
  select.dataQualityFor = function (as, opts) {
    if (!can("data_quality.view", undefined, as)) { return null; }
    var sc = select.scope(as), top = topScope("data_quality.view", as), b = normBranch(opts && opts.branch);
    var readable = scopeBranches("data_quality.view", "OWN", as);
    var effB = b === "ALL" && readable.length === 1 ? readable[0] : b;
    var targetCodes = ["CAPTURE_RATE", "OUTCOME_COMPLETION", "FOLLOWUP_COMPLETION", "DUPLICATE_RATE", "MISSING_REQUIRED_RATE"];
    var rateRow = effB === "ALL" ? D.kpis.org.rates : find(D.kpis.branchRates, "branch", effB);
    var bigScope = top === "BRANCH" || top === "ORGANIZATION";
    var targets = targetCodes.map(function (k) { return { kpi: k, labelTh: D.kpiLabels[k], rate: bigScope && rateRow && !sc.isEmptyScope ? (rateRow[k] || null) : null }; });
    var overdueByStaff = D.kpis.dataQuality.overdueFollowupJP1;
    var issues = D.dataQualityIssues.map(function (i) {
      var row = find(D.kpis.dataQuality.issues, "code", i.code);
      var count = null;
      if (sc.isEmptyScope) { count = 0; }
      else if (bigScope) { count = effB === "ALL" ? row.total : (row.byBranch[effB] === undefined ? null : row.byBranch[effB]); }
      else if (i.code === "OVERDUE_FOLLOWUP") { count = top === "TEAM" ? row.byBranch.JP1 : (overdueByStaff[sc.staffCode] === undefined ? null : overdueByStaff[sc.staffCode]); }
      return { code: i.code, labelTh: i.labelTh, count: count, fixPermission: i.fixPermission, fixNote: i.fixNote || null };
    });
    return { targets: targets, issues: issues, branch: effB, empty: sc.isEmptyScope };
  };
  /* คำขอส่งออก (หน้า 15 · ข้อ 8.2 · 13.14) → { mine: [...], pending: [...] | null } · ผู้อนุมัติตาม requested_as_role · ผู้อนุมัติ ≠ ผู้ขอ */
  select.exportsFor = function (as) {
    var sc = select.scope(as);
    if (!sc.staff) { return null; }
    var mine = can("customer.export", undefined, as) ? D.exportRequests.filter(function (x) { return x.requester === sc.staffCode; }) : null;
    var pending = null;
    if (can("export.approve", undefined, as)) {
      pending = D.exportRequests.filter(function (x) {
        var lim = find(D.exportLimits, "role", x.requestedAsRole);
        return x.status === "REQUESTED" && lim && lim.approver && sc.roles.indexOf(lim.approver) !== -1 && x.requester !== sc.staffCode;
      });
    }
    return { mine: mine, pending: pending };
  };
  /* รายชื่อผู้ใช้ (หน้า 13) ตาม user.read: T = สมาชิกทีมที่ตนเป็นหัวหน้า · B = ผู้มี assignment ในสาขา · G/S = ทั้งหมด */
  select.staffListFor = function (as) {
    var sc = select.scope(as), top = topScope("user.read", as);
    if (!top) { return null; }
    if (top === "ORGANIZATION" || top === "SYSTEM") { return D.staff.slice(); }
    if (top === "TEAM") {
      var members = [];
      effectiveAssignments(as).filter(function (a) { return a.role === "SUPERVISOR"; }).forEach(function (a) { ledTeamMembers(sc.staffCode, a.branch).forEach(function (m) { if (members.indexOf(m) === -1) { members.push(m); } }); });
      return D.staff.filter(function (s) { return members.indexOf(s.staffCode) !== -1; });
    }
    var bs = scopeBranches("user.read", "BRANCH", as);
    return D.staff.filter(function (s) { return s.assignments.some(function (a) { return a.branch && bs.indexOf(a.branch) !== -1; }); });
  };
  /* Customer 360 → { customer, detail (D.customer360 ของรายนั้น | null), readable, sample } */
  select.customer360For = function (as, customerNo) {
    var c = customer(customerNo || "CUS-2026-000297");
    if (!c) { return { customer: null, detail: null, readable: false, sample: null }; }
    var readable = can("customer.read", { customer: customerCtx(c) }, as);
    var detail = D.customer360[c.customerNo] || null;
    return { customer: c, detail: readable ? detail : null, readable: readable, sample: readable && !detail ? { text: "ไม่มีข้อมูลตัวอย่างของลูกค้ารายนี้" } : null };
  };
  /* ไทม์ไลน์ของลูกค้า (ข้อ 13.7) → items สำหรับ ui.timeline (ชิป: เลข visit · สถานะ · ผล · เลข LD/OP/QT ที่เกี่ยวข้อง) */
  select.timelineFor = function (customerNo) {
    var detail = D.customer360[customerNo];
    if (!detail) { return []; }
    return detail.interactions.map(function (ix) {
      var refs = (ix.summary.match(/\b(?:LD|OP|QT)-\d{4}-\d{6}\b/g) || []).slice();
      D.opportunities.forEach(function (op) { if (op.customerNo === customerNo && op.wonAt === ix.occurredAt && refs.indexOf(op.opportunityNo) === -1) { refs.push(op.opportunityNo); } });
      var chips = [];
      if (ix.visit) {
        if (ix.visit.visitNo) { chips.push('<span class="chip">' + esc(ix.visit.visitNo) + "</span>"); }
        chips.push(ui.status("visitStatuses", ix.visit.status));
        if (ix.visit.outcome) { chips.push('<span class="chip">' + esc(label("visitOutcomes", ix.visit.outcome)) + "</span>"); }
      }
      refs.forEach(function (r) { chips.push('<span class="chip code">' + esc(r) + "</span>"); });
      return { at: ix.occurredAt, type: ix.type, channel: ix.channel, direction: ix.direction, branch: ix.branch, summary: ix.summary, chips: chips, by: ix.owner };
    });
  };

  /* =========================================================================
     11. โครงหน้า: sidebar · topbar · ค้นหา · กระดิ่ง · ช่วงเวลา · สาขา · bottom nav · FAB · page()
     ====================================================================== */
  var state = { pageId: null, preset: D.meta.defaultPreset, branch: "ALL", opts: {}, periodEnabled: false, allowed: false, readNotifs: [] };

  function fileHref(sc, query) { return sc ? sc.file + (query || "") : "#"; }
  function activeMenuScreen(pageId) { return pageId === "customer-360" ? "customers" : pageId; }

  function renderSidebar(host, pageId) {
    var active = activeMenuScreen(pageId);
    var groups = D.menuGroups.map(function (g) {
      var items = g.screens.map(screen).filter(function (sc) { return sc && canOpen(sc.id); });
      if (!items.length) { return ""; }   /* กลุ่มที่ไม่มีหน้าที่เข้าได้ ซ่อนทั้งกลุ่ม (ข้อ 14.2) */
      var single = items.length === 1 && items[0].title === g.label;
      var links = items.map(function (sc) {
        return '<a class="nav-item' + (single ? "" : " nav-item--sub") + '" href="' + esc(sc.file) + '"' + (sc.id === active ? ' aria-current="page"' : "") +
          ' title="' + esc(sc.title) + '">' + icon(sc.icon, "nav-icon") + '<span class="nav-item__label">' + esc(sc.title) + "</span></a>";
      }).join("");
      return '<div class="nav-group">' + (single ? "" : '<div class="nav-group__label">' + icon(g.icon, "nav-icon") + "<span>" + esc(g.label) + "</span></div>") + links + "</div>";
    }).join("");
    host.className = "sidebar";
    host.setAttribute("aria-label", "เมนูหลัก");
    host.innerHTML =
      '<a class="sidebar__brand" href="' + esc(landingFile()) + '"><span class="brand-mark" aria-hidden="true">J</span>' +
      '<span class="sidebar__brand-text"><span class="sidebar__title">JAUN <span class="sidebar__title-accent">CRM</span></span><br><span class="sidebar__subtitle">CUSTOMER 360</span></span></a>' +
      '<nav class="sidebar__nav" aria-label="เมนูหลัก">' + groups + "</nav>" +
      '<div class="sidebar__footer"><p class="sidebar__bu"><strong>JAUN POWER MONEY</strong>เชื่อมผ่านเลขธุรกรรมใน V1</p>' +
      '<a class="nav-item" href="index.html" title="สารบัญ prototype">' + icon("list", "nav-icon") + '<span class="nav-item__label">สารบัญ prototype</span></a></div>';
  }

  function branchOptions(as) {
    var set = [];
    effectiveAssignments(as).forEach(function (a) {
      var bs = a.branch ? [a.branch] : (a.role === "SYSTEM_ADMIN" ? [] : D.branches.map(function (b) { return b.code; }));
      bs.forEach(function (b) { if (set.indexOf(b) === -1) { set.push(b); } });
    });
    return set;
  }

  function popover(hostEl, bodyHtml, cls) {
    closePopovers();
    var pop = root.document.createElement("div");
    pop.className = "popover " + (cls || "");
    pop.setAttribute("data-jcrm-popover", "");
    pop.innerHTML = bodyHtml;
    hostEl.appendChild(pop);
    return pop;
  }
  function closePopovers(except) {
    $$("[data-jcrm-popover]").forEach(function (p) { if (p !== except) { p.remove(); } });
    $$("[aria-expanded=true][data-jcrm-pop-trigger], [aria-expanded=true][data-jcrm-kanban-menu]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  }
  function togglePop(trigger, build, cls) {
    var host = trigger.parentNode;
    var open = $("[data-jcrm-popover]", host);
    if (open) { closePopovers(); return null; }
    var pop = popover(host, build(), cls);
    trigger.setAttribute("aria-expanded", "true");
    return pop;
  }

  /* ---- ค้นหากลาง (ข้อ 6.5 · 14.3) — prototype ค้นเฉพาะรายการที่ระบุชื่อในข้อ 13 · ส่งเมื่อกด Enter (design-system ข้อ 7.8) ---- */
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function searchAll(term, as) {
    var t = String(term || "").trim();
    var out = { customers: [], leads: [], opportunities: [], quotations: [], transactions: [] };
    if (t.length < 3) { return out; }
    var upper = t.toUpperCase(), lower = t.toLowerCase();
    var ph = digits(t);
    if (ph.indexOf("66") === 0 && ph.length === 11) { ph = "0" + ph.slice(2); }
    var isPhoneLike = /^[\d\s\-+()]+$/.test(t);
    D.customers.forEach(function (c) {
      var hit = c.customerNo === upper ||
        (!isPhoneLike && c.displayName.toLowerCase().indexOf(lower) !== -1) ||
        c.contacts.some(function (ct) {
          if (ct.type === "PHONE") { return isPhoneLike && digits(ct.full) === ph; }       /* เบอร์ต้องตรงทั้งค่า */
          if (ct.type === "EMAIL") { return ct.full.toLowerCase() === lower; }
          if (ct.type === "LINE_ID") { return ct.full.toLowerCase() === lower.replace(/^@/, ""); }
          return false;
        });
      if (hit && can("customer.read", { customer: customerCtx(c) }, as)) { out.customers.push(c); }
    });
    D.leads.forEach(function (l) { if (l.leadNo === upper && can("lead.read", { branch: l.branch, owner: l.owner, viaCustomer: customerCtx(l.customerNo) }, as)) { out.leads.push(l); } });
    D.opportunities.forEach(function (o) { if (o.opportunityNo === upper && can("opportunity.read", { branch: o.branch, owner: o.owner, viaCustomer: customerCtx(o.customerNo) }, as)) { out.opportunities.push(o); } });
    D.quotations.forEach(function (q) { if (q.quotationNo === upper && can("quotation.read", { branch: q.branch, owner: q.owner, viaCustomer: customerCtx(q.customerNo) }, as)) { out.quotations.push(q); } });
    return out;
  }
  function renderSearchResults(term) {
    var r = searchAll(term);
    var count = r.customers.length + r.leads.length + r.opportunities.length + r.quotations.length;
    var h = "";
    if (String(term).trim().length < 3) {
      h = '<p class="period-note">พิมพ์อย่างน้อย 3 ตัวอักษร แล้วกด Enter · ชื่อ · เลขลูกค้า (CUS-) · LD- · OP- · QT- · เบอร์/อีเมล/LINE ID ต้องตรงทั้งค่า</p>';
    } else if (!count) {
      h = '<p class="period-note">ไม่พบผลลัพธ์สำหรับ “' + esc(term) + '” · เบอร์โทร อีเมล LINE ID IMEI และเลขธุรกรรมต้องพิมพ์ครบทั้งค่า</p>';
    } else {
      if (r.customers.length) {
        h += '<p class="menu-group-label">ลูกค้า (' + r.customers.length + ")</p>" + r.customers.slice(0, 5).map(function (c) {
          var phone = find(c.contacts, "type", "PHONE");
          return '<a class="menu-item" href="' + esc(link("customer-360", { c: c.customerNo })) + '">' + ui.avatar(c.displayName, "sm") +
            '<span class="grow"><span class="t-medium">' + esc(T.customerPrefix + c.displayName) + '</span> <span class="code">' + esc(c.customerNo) + "</span>" +
            '<span class="menu-item__hint">' + esc(phone ? phone.masked : DASH) + "</span>" + ui.customerBadges(c) + "</span></a>";
        }).join("");
      }
      if (r.leads.length) { h += '<p class="menu-group-label">Lead (' + r.leads.length + ")</p>" + r.leads.map(function (l) { return '<a class="menu-item" href="' + esc(link("leads", { lead: l.leadNo })) + '"><span class="code">' + esc(l.leadNo) + "</span><span>" + esc(customerName(l.customerNo)) + "</span></a>"; }).join(""); }
      if (r.opportunities.length) { h += '<p class="menu-group-label">โอกาสขาย (' + r.opportunities.length + ")</p>" + r.opportunities.map(function (o) { return '<a class="menu-item" href="' + esc(link("pipeline", { op: o.opportunityNo })) + '"><span class="code">' + esc(o.opportunityNo) + "</span><span>" + esc(customerName(o.customerNo)) + "</span></a>"; }).join(""); }
      if (r.quotations.length) { h += '<p class="menu-group-label">ใบเสนอราคา (' + r.quotations.length + ")</p>" + r.quotations.map(function (q) { return '<a class="menu-item" href="' + esc(link("quotations", { qt: q.quotationNo })) + '"><span class="code">' + esc(q.quotationNo) + "</span><span>" + esc(customerName(q.customerNo)) + "</span></a>"; }).join(""); }
    }
    return h + '<p class="popover__foot">prototype ค้นเฉพาะรายการที่ระบุชื่อใน CANONICAL ข้อ 13 · ระบบจริงเรียก api.search_customers และบันทึก CUSTOMER_SEARCH · ค่าช่องทางติดต่อแสดงแบบปิดบัง · คำค้นไม่ลง URL</p>';
  }

  function unreadNotifs(s) { return select.notificationsFor(s ? s.staffCode : undefined).filter(function (n) { return state.readNotifs.indexOf(n.index) === -1; }); }
  function renderTopbar(host, pageId, opts) {
    var s = currentStaff();
    var notifs = unreadNotifs(s);
    var bOpts = branchOptions();
    var showBranch = opts.branchPicker !== false && bOpts.length > 1;
    var showSearch = searchVisible();
    var sc = screen(pageId);
    var roleLine = s ? assignmentText(s, { branchNames: true }) : DASH;
    host.className = "topbar";
    host.innerHTML =
      '<a class="topbar__brand-mobile" href="' + esc(landingFile()) + '"><span class="brand-mark" aria-hidden="true">J</span><span class="sr-only">JAUN CRM</span></a>' +
      (showSearch ? '<div class="searchbox popover-host" role="search"><label class="sr-only" for="jcrm-search">ค้นหาลูกค้า</label>' + icon("search", "searchbox__icon") +
        '<input id="jcrm-search" class="searchbox__input" type="search" autocomplete="off" placeholder="' + esc(D.meta.searchPlaceholder) + '" aria-controls="jcrm-search-results" aria-expanded="false"></div>' : '<div class="grow"></div>') +
      '<div class="topbar__actions">' +
      (showBranch ? '<div class="popover-host"><button type="button" class="branch-picker" data-jcrm-pop-trigger="branch" aria-haspopup="menu" aria-expanded="false">' + icon("building") +
        '<span class="branch-picker__label">' + esc(state.branch === "ALL" ? "ทุกสาขา" : branchName(state.branch)) + "</span>" + icon("chevron") + "</button></div>" : "") +
      '<div class="popover-host"><button type="button" class="icon-btn" data-jcrm-pop-trigger="bell" aria-haspopup="true" aria-expanded="false" aria-label="การแจ้งเตือน ยังไม่อ่าน ' + notifs.length + ' รายการ">' +
      icon("bell") + (notifs.length ? '<span class="count-dot">' + (notifs.length > 99 ? "99+" : notifs.length) + "</span>" : "") + "</button></div>" +
      '<div class="popover-host"><button type="button" class="persona-chip" data-jcrm-pop-trigger="persona" aria-haspopup="true" aria-expanded="false">' + ui.avatar(s ? s.displayName : "?", null, { solid: true }) +
      '<span class="persona-chip__text"><span class="persona-chip__name">' + esc(s ? s.displayName : DASH) + '</span><span class="persona-chip__meta">' + esc(roleLine) + "</span></span></button></div>" +
      "</div>";

    var input = $("#jcrm-search", host);
    if (input) {
      var searchHost = input.parentNode;
      var showResults = function () {
        var pop = $("[data-jcrm-popover]", searchHost) || popover(searchHost, "", "popover--left popover--wide");
        pop.id = "jcrm-search-results";
        pop.innerHTML = renderSearchResults(input.value);
        input.setAttribute("aria-expanded", "true");
      };
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); showResults(); }
        if (e.key === "Escape") { closePopovers(); input.blur(); input.setAttribute("aria-expanded", "false"); }
      });
    }
    $$("[data-jcrm-pop-trigger]", host).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var kind = btn.getAttribute("data-jcrm-pop-trigger");
        if (kind === "bell") { togglePop(btn, function () { return bellHtml(unreadNotifs(s)); }); }
        if (kind === "persona") { togglePop(btn, function () { return personaHtml(s); }); }
        if (kind === "branch") {
          var bp = togglePop(btn, function () { return branchHtml(bOpts); });
          if (bp) { $$("[data-branch]", bp).forEach(function (b) { b.addEventListener("click", function () { chooseBranch(b.getAttribute("data-branch")); }); }); }
        }
      });
    });
    if (sc && sc.isPublic) { host.hidden = true; }
  }
  function bellHtml(notifs) {
    var body = notifs.length ? notifs.map(function (n) {
      var tone = /OVERDUE|UNASSIGNED|MISSING|LIMIT|LOCKOUT/.test(n.code) ? "warning" : "info";
      return '<a class="notif-item" href="' + esc(n.href) + '" data-jcrm-notif="' + n.index + '" data-tone="' + tone + '"><span class="notif-item__title">' + esc(n.titleTh) + "</span>" +
        '<span class="notif-item__body">' + esc(n.bodyTh || DASH) + "</span>" +
        '<span class="notif-item__meta">' + esc(n.createdAt ? fmt.dateTime(n.createdAt) : DASH) + " · " + esc(n.code) + "</span></a>";
    }).join("") : ui.state("empty", { icon: "bell", title: "ไม่มีการแจ้งเตือนใหม่", compact: true });
    return '<div class="popover__head"><span>การแจ้งเตือน</span><span class="badge badge--neutral">ยังไม่อ่าน ' + notifs.length + "</span></div>" + body +
      '<p class="popover__foot">ข้อความเต็มอยู่ในระบบเท่านั้น · push และอีเมลไม่มีชื่อหรือข้อมูลลูกค้า (ข้อ 1.4 · 11.1) · prototype: กดรายการแล้วลดจำนวนเฉพาะในหน้านี้</p>';
  }
  function personaHtml(s) {
    if (!s) { return ""; }
    var a = aal(s);
    return '<div class="popover__head"><span>' + esc(s.displayName) + ' <span class="code">' + esc(s.staffCode) + "</span></span>" + ui.status("staffStatus", s.status) + "</div>" +
      '<p class="period-note">' + esc(assignmentText(s, { branchNames: true })) + "<br>" + esc(s.email) + "<br>เซสชัน " + esc(a) + (requiresMfa(s) ? (a === "aal2" ? " · ยืนยัน MFA แล้ว" : " · ยังไม่ยืนยัน MFA (บทบาทที่ต้อง MFA ไม่ถูกนับ)") : "") + "</p>" +
      '<a class="menu-item" href="index.html">' + icon("users", "nav-icon") + "<span>สลับผู้ใช้ตัวอย่าง (สารบัญ prototype)</span></a>" +
      '<button type="button" class="menu-item" data-jcrm-logout>' + icon("logout", "nav-icon") + "<span>ออกจากระบบ</span></button>";
  }
  function periodHtml() {
    return '<p class="menu-group-label">ช่วงเวลา (ข้อ 12.0)</p><div role="menu">' + D.meta.presets.map(function (p) {
      var sel = p.code === state.preset;
      return '<button type="button" class="menu-item" role="menuitemradio" aria-checked="' + sel + '"' +
        (p.enabled ? ' data-preset="' + esc(p.code) + '"' : ' aria-disabled="true" data-tooltip="' + esc(T.presetDisabled) + '"') + ">" +
        "<span>" + esc(p.labelTh) + (p.isDefault ? " (ค่าเริ่มต้น)" : "") + '<span class="period-option__range">' +
        esc(p.enabled ? p.rangeTh + " · เทียบ " + p.compareTh : T.presetDisabled) + "</span></span></button>";
    }).join("") + '</div><p class="period-note">' + esc(T.openPeriod) + "</p>";
  }
  function branchHtml(list) {
    var items = [{ code: "ALL", name: "ทุกสาขา" }].concat(list.map(function (c) { return { code: c, name: branchName(c) }; }));
    return '<p class="menu-group-label">สาขาในสิทธิ์ของคุณ</p><div role="menu">' + items.map(function (b) {
      return '<button type="button" class="menu-item" role="menuitemradio" aria-checked="' + (b.code === state.branch) + '" data-branch="' + esc(b.code) + '"><span>' + esc(b.name) + "</span></button>";
    }).join("") + '</div><p class="period-note">"ทุกสาขา" แสดงยอดรวมเฉพาะที่มีในข้อ 13 · ค่าที่ไม่มีแสดง –</p>';
  }
  function choosePreset(code) {
    var p = presetOf(code);
    if (!p || !p.enabled) { toast(T.presetDisabled, "info"); return; }
    state.preset = code; closePopovers(); rerender("jcrm:periodchange");
  }
  function chooseBranch(code) {
    state.branch = code;
    session.set(D.meta.branchSessionKey, code);
    closePopovers(); rerender("jcrm:branchchange");
  }
  function setBranch(code) { chooseBranch(code); }
  function setPreset(code) { choosePreset(code); }

  /* ออกจากระบบ: ล้าง sessionStorage และ localStorage ของ prototype ยกเว้นค่าที่ "จดจำ" (ข้อ 9.2 v2.2) */
  function logout() {
    storage.remove(D.meta.storageKey); storage.remove(D.meta.aalStorageKey);
    session.clear();
    root.location.href = "01-login.html";
  }

  function renderBottomNav(pageId) {
    var nav = $("[data-jcrm-bottom-nav]");
    if (!nav) { nav = root.document.createElement("nav"); nav.setAttribute("data-jcrm-bottom-nav", ""); root.document.body.appendChild(nav); }
    nav.className = "bottom-nav no-print";
    nav.setAttribute("aria-label", "เมนูมือถือ");
    var active = activeMenuScreen(pageId);
    nav.innerHTML = D.mobileNav.map(function (it) {
      if (it.sheet) {
        return '<button type="button" class="bottom-nav__item" data-jcrm-more aria-haspopup="dialog">' + icon(it.icon) + "<span>" + esc(it.label) + "</span></button>";
      }
      var sc = screen(it.screen);
      if (!sc || !canOpen(sc.id)) { return ""; }
      if (it.center) {
        if (!(it.requires || []).every(function (p) { return can(p); })) { return ""; }
        return '<a class="bottom-nav__center" href="' + esc(fileHref(sc, it.query)) + '"><span class="bottom-nav__center-btn">' + icon(it.icon) + "</span><span>" + esc(it.label) + "</span></a>";
      }
      return '<a class="bottom-nav__item" href="' + esc(sc.file) + '"' + (sc.id === active ? ' aria-current="page"' : "") + ">" + icon(it.icon) + "<span>" + esc(it.label) + "</span></a>";
    }).join("");
    var sheet = root.document.getElementById("jcrm-more-sheet");
    if (!sheet) { sheet = root.document.createElement("div"); sheet.id = "jcrm-more-sheet"; root.document.body.appendChild(sheet); }
    sheet.className = "sheet no-print";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "เพิ่มเติม");
    sheet.innerHTML = '<div class="sheet__handle" aria-hidden="true"></div><p class="sheet__title">เพิ่มเติม</p>' + D.mobileMoreSheet.map(function (it) {
      if (it.action === "logout") { return '<button type="button" class="menu-item" data-jcrm-logout>' + icon(it.icon, "nav-icon") + "<span>" + esc(it.label) + "</span></button>"; }
      var sc = screen(it.screen);
      return sc && canOpen(sc.id) ? '<a class="menu-item" href="' + esc(sc.file) + '">' + icon(it.icon, "nav-icon") + "<span>" + esc(it.label) + "</span></a>" : "";
    }).join("") + '<p class="menu-group-label">เฉพาะ prototype</p><a class="menu-item" href="index.html">' + icon("list", "nav-icon") + "<span>สารบัญ prototype</span></a>";
    $("[data-jcrm-more]", nav).addEventListener("click", function () { openPanel("jcrm-more-sheet"); });
  }
  function renderFab(pageId, opts) {
    var old = $("[data-jcrm-fab]"); if (old) { old.remove(); }
    var f = D.tabletFab, sc = screen(f.screen);
    if (opts.fab === false || (f.hiddenOn || []).indexOf(pageId) !== -1 || !sc || !canOpen(sc.id) || !f.requires.every(function (p) { return can(p); })) { return; }
    var a = root.document.createElement("a");
    a.className = "fab no-print"; a.setAttribute("data-jcrm-fab", ""); a.href = fileHref(sc, f.query);
    a.innerHTML = icon("plus") + "<span>" + esc(f.label.replace(/^\+\s*/, "")) + "</span>";
    a.setAttribute("aria-label", f.label);
    root.document.body.appendChild(a);
  }

  /* ---- JCRM.page(opts) ----------------------------------------------------
     opts = {
       id: "customers",          // ต้องตรงกับ <body data-page>
       render: function (ctx) {}, // วาดเนื้อหาลง <div class="page"> · ถูกเรียกซ้ำเมื่อเปลี่ยนสาขา/ช่วงเวลา (ต้อง idempotent)
       period: (อ่านจาก data)     // ตัวเลือกช่วงเวลาเปิดเฉพาะหน้า 02 09 12 (ข้อ 14.3 v2.2) · หน้าอื่นส่ง true ก็ไม่แสดง
       branchPicker: true,       // ตัวเลือกสาขาบนแถบบนเมื่อผู้ใช้มีหลายสาขา
       defaultBranch: "JP1",     // ค่าเริ่มต้นของผู้ใช้หลายสาขา (หน้า 06 07 08 11 12 ใช้ JP1 จาก data อัตโนมัติ · ข้อ 14.1)
       fab: true                 // ปุ่ม + รับลูกค้า บนแท็บเล็ต (ซ่อนบนหน้า 04 07 อัตโนมัติ)
     }
     ctx = { pageId, screen, staff, staffCode, roles, aal, branch, branches, preset, periodEnabled, allowed, can, access, select, link, param, D, fmt, ui } */
  function buildCtx() {
    var s = currentStaff();
    return { pageId: state.pageId, screen: screen(state.pageId), staff: s, staffCode: s ? s.staffCode : null, roles: roleCodes(), aal: aal(s), branch: state.branch,
      branches: branchOptions(), preset: state.periodEnabled ? state.preset : D.meta.defaultPreset, periodEnabled: state.periodEnabled, allowed: state.allowed,
      can: can, access: access, select: select, link: link, param: param, D: D, fmt: fmt, ui: ui, scope: select.scope() };
  }
  function rerender(eventName) {
    var app = $("[data-jcrm-app]") || $(".app");
    var top = app ? $("[data-jcrm-topbar]", app) : null;
    if (top) { renderTopbar(top, state.pageId, state.opts); }
    var ctx = buildCtx();
    if (eventName) { root.document.dispatchEvent(new root.CustomEvent(eventName, { detail: ctx })); }
    if (state.allowed && typeof state.opts.render === "function") { state.opts.render(ctx); initTabs(root.document); }
  }
  function page(opts) {
    opts = opts || {};
    var doc = root.document, body = doc.body;
    var pageId = body.getAttribute("data-page") || opts.id;
    if (opts.id && opts.id !== pageId) { root.console.warn("JCRM.page: opts.id (" + opts.id + ") ไม่ตรงกับ <body data-page> (" + pageId + ")"); }
    var roles = (body.getAttribute("data-roles") || "").trim().split(/\s+/).filter(Boolean);
    var sc = screen(pageId);
    state.pageId = pageId; state.opts = opts;
    state.periodEnabled = periodEnabled(pageId);
    if (opts.period === true && !state.periodEnabled) { root.console.warn("JCRM.page: ตัวเลือกช่วงเวลาอยู่ในหัวหน้า 02 09 12 เท่านั้น (ข้อ 14.3) — ไม่แสดงบนหน้า " + pageId); }
    if (opts.period === false) { state.periodEnabled = false; }
    body.setAttribute("data-period-enabled", state.periodEnabled ? "true" : "false");

    var s = currentStaff();
    var bOpts = branchOptions();
    var saved = session.get(D.meta.branchSessionKey);
    if (bOpts.length === 1) { state.branch = bOpts[0]; }
    else if (opts.defaultBranch || (sc && sc.multiBranchDefault)) { state.branch = opts.defaultBranch || sc.multiBranchDefault; }
    else { state.branch = saved && (saved === "ALL" || bOpts.indexOf(saved) !== -1) ? saved : "ALL"; }
    if (bOpts.length === 0) { state.branch = "ALL"; }

    var app = $("[data-jcrm-app]") || $(".app");
    if (!app) { app = doc.createElement("div"); app.className = "app"; app.setAttribute("data-jcrm-app", ""); body.insertBefore(app, body.firstChild); }
    var side = $("[data-jcrm-sidebar]", app); if (!side) { side = doc.createElement("aside"); side.setAttribute("data-jcrm-sidebar", ""); app.insertBefore(side, app.firstChild); }
    var top = $("[data-jcrm-topbar]", app); if (!top) { top = doc.createElement("header"); top.setAttribute("data-jcrm-topbar", ""); side.parentNode.insertBefore(top, side.nextSibling); }
    var main = $("[data-jcrm-main]", app) || $("main", app);
    if (!main) { main = doc.createElement("main"); main.setAttribute("data-jcrm-main", ""); app.appendChild(main); }
    main.classList.add("main"); if (!main.id) { main.id = "main"; }
    if (!$(".skip-link")) { var sk = doc.createElement("a"); sk.className = "skip-link"; sk.href = "#main"; sk.textContent = "ข้ามไปยังเนื้อหาหลัก"; body.insertBefore(sk, body.firstChild); }

    renderSidebar(side, pageId);
    renderTopbar(top, pageId, opts);
    renderBottomNav(pageId);
    renderFab(pageId, opts);

    var allowed = (sc && sc.isPublic) || (!!s && s.status === "ACTIVE" && roleCodes().some(function (r) { return roles.indexOf(r) !== -1; }));
    state.allowed = allowed;
    if (!allowed) {
      var mfaHint = s && requiresMfa(s) && aal(s) !== "aal2" ? "เซสชันนี้ยังไม่ยืนยัน MFA บทบาทที่ต้องใช้ MFA จึงไม่ถูกนับ (ข้อ 8.0)" : null;
      main.innerHTML = '<div class="page">' + ui.noPermission({ roles: roles, text: (s ? "บทบาทของคุณ: " + s.displayName + " · " + assignmentText(s, { branchNames: true }) : "") + (mfaHint ? " · " + mfaHint : "") }) + "</div>";
      $$("[data-jcrm-fab]").forEach(function (f) { f.remove(); });
      return buildCtx();
    }
    if (sc && sc.desktopOnly) {
      body.setAttribute("data-desktop-only", "true");
      if (!$(".desktop-only-notice", main)) {
        var n = doc.createElement("div");
        n.className = "desktop-only-notice";
        n.innerHTML = '<div class="page">' + ui.state("desktop-only", { text: sc.title + " ออกแบบสำหรับจอกว้าง (ข้อ 14.4)" }) + "</div>";
        main.insertBefore(n, main.firstChild);
      }
    }
    var ctx = buildCtx();
    if (typeof opts.render === "function") { opts.render(ctx); }
    initTabs(doc);
    return ctx;
  }

  /* ---- ตัวจัดการเหตุการณ์ส่วนกลาง (ผูกครั้งเดียว) ---- */
  function isInteractive(el, stopAt) {
    for (var x = el; x && x !== stopAt; x = x.parentNode) {
      if (x.matches && x.matches("a, button, input, select, textarea, label, [data-jcrm-action]")) { return true; }
    }
    return false;
  }
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) { return; }
      var contact = t.closest("[data-jcrm-contact-action]");
      if (contact) { e.preventDefault(); onContactAction(contact); return; }
      if (t.closest("[data-jcrm-logout]")) { e.preventDefault(); logout(); return; }
      var dis = t.closest('[aria-disabled="true"]');
      if (dis && dis.matches("button, a, input, .kanban-card")) {
        if (dis.matches(".kanban-card") && t.closest("a, button")) { /* ลิงก์/เมนูในการ์ดยังใช้ได้ */ }
        else { e.preventDefault(); var why = dis.getAttribute("data-tooltip") || dis.getAttribute("title"); if (why) { toast(why, "info"); } return; }
      }
      var notif = t.closest("[data-jcrm-notif]");
      if (notif) { state.readNotifs.push(Number(notif.getAttribute("data-jcrm-notif"))); return; }
      var trig = t.closest("[data-jcrm-pop-trigger]");
      if (trig && !trig.closest(".topbar")) {
        e.preventDefault(); e.stopPropagation();
        if (trig.getAttribute("data-jcrm-pop-trigger") === "period") {
          var pp = togglePop(trig, periodHtml);
          if (pp) { $$("[data-preset]", pp).forEach(function (b) { b.addEventListener("click", function () { choosePreset(b.getAttribute("data-preset")); }); }); }
        }
        return;
      }
      var km = t.closest("[data-jcrm-kanban-menu]");
      if (km) {
        e.preventDefault(); e.stopPropagation();
        var board = boards[km.getAttribute("data-jcrm-kanban-menu")];
        if (board) { togglePop(km, function () { return kanban.menuHtml(board, km.getAttribute("data-card-id")); }, "menu-popover"); }
        return;
      }
      var kmove = t.closest("[data-jcrm-kanban-move]");
      if (kmove) {
        e.preventDefault(); closePopovers();
        var bd = boards[kmove.getAttribute("data-jcrm-kanban-move")];
        if (bd) { bd.move(kmove.getAttribute("data-card-id"), kmove.getAttribute("data-stage")); }
        return;
      }
      var seg = t.closest("[data-jcrm-segment]");
      if (seg) {
        var group = seg.parentNode, val = seg.getAttribute("data-value"), actName = seg.getAttribute("data-jcrm-segment");
        $$("[data-jcrm-segment]", group).forEach(function (b) { b.setAttribute("aria-checked", b === seg ? "true" : "false"); });
        if (actName.indexOf("__kanban-tab:") === 0) {
          var kb = boards[actName.slice(13)], kel = kb && root.document.getElementById(kb.options.id);
          if (kb) { kb.activeStage = val; }
          if (kel) { kel.setAttribute("data-active-stage", val); $$(".kanban__col", kel).forEach(function (c) { c.classList.toggle("is-active", c.getAttribute("data-stage") === val); }); }
        } else if (actName) { dispatchAction(actName, val, seg, e); }
        return;
      }
      var toggle = t.closest("[data-jcrm-chart-toggle]");
      if (toggle) {
        var fig = toggle.closest(".chart"), isTable = fig.getAttribute("data-view") === "table";
        fig.setAttribute("data-view", isTable ? "graph" : "table");
        toggle.setAttribute("aria-pressed", isTable ? "false" : "true");
        toggle.textContent = isTable ? T.tableToggleOn : T.tableToggleOff;
        return;
      }
      var legendBtn = t.closest("[data-jcrm-legend]");
      if (legendBtn) {
        var figL = legendBtn.closest(".chart"), key = legendBtn.getAttribute("data-jcrm-legend"), pressed = legendBtn.getAttribute("aria-pressed") === "true";
        $$("[data-jcrm-legend]", figL).forEach(function (b) { b.setAttribute("aria-pressed", !pressed && b === legendBtn ? "true" : "false"); });
        $$("[data-seg]", figL).forEach(function (sg) { if (!pressed && sg.getAttribute("data-seg") !== key) { sg.setAttribute("data-dim", "true"); } else { sg.removeAttribute("data-dim"); } });
        return;
      }
      var sortBtn = t.closest("[data-jcrm-sort]");
      if (sortBtn) {
        var tc = tables[sortBtn.getAttribute("data-jcrm-sort")], k2 = sortBtn.getAttribute("data-key");
        if (tc) {
          var dir = tc.options.sort && tc.options.sort.key === k2 && tc.options.sort.dir === "asc" ? "desc" : "asc";
          if (tc.options.onSort) { tc.options.onSort(k2, dir); }
          tc.render({ sort: { key: k2, dir: dir } });
        }
        return;
      }
      var step = t.closest(".stepper__btn");
      if (step) {
        var wrapS = step.closest("[data-jcrm-stepper]"), inp = $("input", wrapS), min = Number(wrapS.getAttribute("data-min") || 1), max = wrapS.getAttribute("data-max");
        var nv = (parseInt(inp.value, 10) || min) + Number(step.getAttribute("data-step"));
        if (nv < min) { nv = min; }
        if (max !== null && nv > Number(max)) { nv = Number(max); }
        inp.value = nv;
        $('[data-step="-1"]', wrapS).disabled = nv <= min;
        inp.dispatchEvent(new root.Event("change", { bubbles: true }));
        return;
      }
      var act = t.closest("[data-jcrm-action]");
      if (act) {
        if (act.matches("a")) { e.preventDefault(); }
        closePopovers();
        dispatchAction(act.getAttribute("data-jcrm-action"), act.getAttribute("data-jcrm-id"), act, e);
        return;
      }
      var row = t.closest("tr[data-href], tr[data-jcrm-row-action]");
      if (row && !isInteractive(t, row)) {
        if (row.getAttribute("data-href")) { root.location.href = row.getAttribute("data-href"); }
        else { dispatchAction(row.getAttribute("data-jcrm-row-action"), row.getAttribute("data-jcrm-id"), row, e); }
        return;
      }
      var closer = t.closest("[data-jcrm-close]");
      if (closer) {
        var target = closer.getAttribute("data-jcrm-close") || (closer.closest(".scrim--dialog, .drawer, .sheet") || {}).id;
        var el = target && root.document.getElementById(target);
        if (el) { if (el.classList.contains("scrim--dialog")) { closeDialog(el); } else { closePanel(el); } }
        return;
      }
      if (t.classList && t.classList.contains("scrim--dialog") && !t._jcrmCtl) { closeDialog(t); return; }
      if (!t.closest("[data-jcrm-popover]") && !t.closest(".searchbox")) { closePopovers(); }
    });
    root.document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.closest) { return; }
      var sel2 = t.closest("[data-jcrm-table-select]");
      if (sel2) {
        var tc2 = tables[sel2.getAttribute("data-jcrm-table-select")];
        if (tc2) {
          var list = tc2.options.selected || [];
          var v = sel2.value;
          list = sel2.checked ? list.concat(list.indexOf(v) === -1 ? [v] : []) : list.filter(function (x) { return x !== v; });
          tc2.render({ selected: list });
        }
        return;
      }
      var ch = t.closest("[data-jcrm-change]");
      if (ch) { dispatchAction(ch.getAttribute("data-jcrm-change"), t.value, t, e); }
    });
    root.document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        var r = e.target && e.target.closest && e.target.closest("tr[data-href], tr[data-jcrm-row-action], .list-card[data-jcrm-action]");
        if (r && r === e.target) { e.preventDefault(); r.click(); return; }
      }
      if (e.key === "/" && !(e.target && e.target.matches && e.target.matches("input, textarea, select"))) {
        var sInput = root.document.getElementById("jcrm-search");
        if (sInput) { e.preventDefault(); sInput.focus(); }
      }
      if (e.key !== "Escape") { return; }
      closePopovers();
      $$(".scrim--dialog.is-open").filter(function (d) { return !d._jcrmCtl; }).forEach(closeDialog);
      $$(".drawer.is-open, .sheet.is-open").filter(function (d) { return !d._jcrmCtl; }).forEach(closePanel);
    });
    root.document.addEventListener("visibilitychange", function () {
      if (root.document.hidden) { $$('.contact-row[data-revealed="true"]').forEach(hideReveal); }
    });
  }

  /* =========================================================================
     12. export
     ====================================================================== */
  JCRM.version = "prototype · CANONICAL " + (D && D.meta ? D.meta.canonicalVersion : "");
  JCRM.data = D;
  /* alias ตัวเลือกบน JCRM.data (ไม่ enumerable · data.js ยังเป็นข้อมูลล้วน) เช่น JCRM.data.tasksFor("ST-0045") */
  Object.keys(select).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(D, k)) { if (root.console) { root.console.warn("JCRM: ชื่อ select." + k + " ชนกับ JCRM_DATA." + k + " — ไม่สร้าง alias"); } return; }
    try { Object.defineProperty(D, k, { value: select[k], enumerable: false, configurable: true, writable: true }); } catch (e) { /* ไม่รองรับ */ }
  });
  JCRM.$ = $; JCRM.$$ = $$; JCRM.esc = esc; JCRM.html = html; JCRM.raw = raw; JCRM.toHtml = toHtml; JCRM.qs = qs; JCRM.param = param; JCRM.link = link; JCRM.linkTarget = linkTarget;
  JCRM.storage = storage; JCRM.session = session; JCRM.find = find; JCRM.uid = uid; JCRM.on = on;
  JCRM.screen = screen; JCRM.role = role; JCRM.staff = staff; JCRM.branch = branch; JCRM.team = team; JCRM.customer = customer; JCRM.teamsOf = teamsOf;
  JCRM.ref = ref; JCRM.refList = refList; JCRM.label = label; JCRM.enumItem = enumItem; JCRM.get = get;
  JCRM.staffName = staffName; JCRM.branchName = branchName; JCRM.customerName = customerName; JCRM.customerCtx = customerCtx;
  JCRM.fmt = fmt;
  JCRM.currentStaffCode = currentStaffCode; JCRM.currentStaff = currentStaff; JCRM.setStaff = setStaff; JCRM.aal = aal; JCRM.setAal = setAal;
  JCRM.requiresMfa = requiresMfa; JCRM.effectiveAssignments = effectiveAssignments; JCRM.roleCodes = roleCodes; JCRM.assignmentText = assignmentText;
  JCRM.teamMembersLedBy = ledTeamMembers; JCRM.can = can; JCRM.access = access; JCRM.topScope = topScope; JCRM.scopeBranches = scopeBranches;
  JCRM.canOpen = canOpen; JCRM.landingFile = landingFile; JCRM.searchVisible = searchVisible; JCRM.periodEnabled = periodEnabled; JCRM.canClaimQueue = canClaimQueue;
  JCRM.icon = icon; JCRM.ui = ui; JCRM.table = table; JCRM.form = form;
  JCRM.toast = toast; JCRM.dialog = dialog; JCRM.drawer = drawer; JCRM.confirm = confirm; JCRM.reasonDialog = reasonDialog;
  JCRM.openDialog = openDialog; JCRM.closeDialog = closeDialog; JCRM.openDrawer = openPanel; JCRM.closeDrawer = closePanel; JCRM.openSheet = openPanel; JCRM.closeSheet = closePanel;
  JCRM.initTabs = initTabs;
  JCRM.chart = chart; JCRM.pipeline = pipeline; JCRM.kanban = kanban; JCRM.select = select;
  JCRM.search = searchAll; JCRM.page = page; JCRM.logout = logout; JCRM.setBranch = setBranch; JCRM.setPreset = setPreset;
  JCRM.state = function () { return buildCtx(); };
  root.JCRM = JCRM;
})(typeof window !== "undefined" ? window : this);
