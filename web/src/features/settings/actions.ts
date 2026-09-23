"use server";

import { revalidatePath } from "next/cache";

import { rpc } from "@/lib/db";
import { toThaiMessage } from "@/lib/errors";
import { ROLE_LABEL } from "@/lib/labels";

import { specOf, type SettingSpec } from "./catalog";
import type { ActionState, SettingRow } from "./types";
import {
  asClock,
  asHours,
  asLimits,
  checkDomains,
  checkInt,
  checkTime,
  ENV_VALUES,
  localToIso,
  type BusinessHours,
  type ExportLimit,
} from "./value";

/* การกระทำของหน้า 18 · ตั้งค่าระบบ

   มี Server Action เดียวเพราะมี RPC เดียว: api.update_setting(p_key, p_value)
   ซึ่งเป็นผู้ตรวจสิทธิ์จริงตาม app.settings.editable_by แล้วเขียน audit SETTINGS_UPDATED เอง
   (supabase/migrations/0011_api.sql) — ที่นี่ไม่เช็คสิทธิ์เองแล้วคิดว่าพอ

   หน้าที่ของไฟล์นี้มีสามอย่าง ไม่มีข้อไหนเกี่ยวกับสิทธิ์เลย:

   1. เลือกวิธีตรวจค่าจาก "แคตตาล็อกของเรา" โดยใช้ key ที่ส่งมาเป็นตัวค้น
      ไม่เชื่อ kind/ชนิดที่ฟอร์มส่งมา เพราะฟอร์มถูกแก้ได้ทั้งฟอร์ม
   2. ทำให้ค่าที่ส่งเป็น jsonb รูปร่างเดียวกับที่ระบบอ่านไปใช้จริง (ตัวเลขเป็น number ไม่ใช่ "15")
      ถ้ารูปร่างเพี้ยน app.setting_int จะตกไปใช้ค่าเริ่มต้นเงียบ ๆ = แก้ค่าแล้วไม่มีผล
   3. ค่าที่เป็นอ็อบเจกต์ (business_hours · export.limits) ต้องรวมกับของเดิม
      โดยอ่านของเดิมจากฐานข้อมูลใหม่ ไม่ใช่จากช่องซ่อนในฟอร์ม
      ไม่งั้นคนที่เปิดหน้าค้างไว้แล้วกดบันทึก จะลบค่าที่คนอื่นเพิ่งเพิ่มไปทิ้งโดยไม่รู้ตัว */

const SETTINGS = "/settings";

function fail(e: unknown): ActionState {
  const thai = toThaiMessage(e);
  return { ok: false, title: thai.title, detail: thai.detail ?? null };
}

function invalid(detail: string): ActionState {
  return { ok: false, title: "ค่าที่กรอกยังไม่ถูกต้อง", detail };
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** อ่านค่าปัจจุบันของคีย์หนึ่งจากฐานข้อมูล — ใช้ตอนต้องรวมค่ากับของเดิม */
async function currentValue(key: string): Promise<unknown> {
  const data = await rpc<{ ok: boolean; settings: SettingRow[] }>("get_settings");
  return data?.settings?.find((s) => s.key === key)?.value ?? null;
}

/** ผลการแปลงฟอร์มเป็นค่า jsonb — error เป็นข้อความไทยที่แสดงได้ทันที */
type Built = { value: unknown } | { error: string };

function buildInt(formData: FormData, spec: SettingSpec): Built {
  const r = checkInt(text(formData, "v"), spec);
  return "error" in r ? r : { value: r.value };
}

function buildPair(formData: FormData, spec: SettingSpec): Built {
  const a = checkInt(text(formData, "a"), spec);
  if ("error" in a) return { error: `ขั้นที่ 1: ${a.error}` };
  const b = checkInt(text(formData, "b"), spec);
  if ("error" in b) return { error: `ขั้นที่ 2: ${b.error}` };
  /* ขั้นที่สองคือการ "ยกระดับ" ต่อจากขั้นแรก ถ้าสั้นกว่าหรือเท่ากัน ขั้นแรกจะไม่มีความหมายเลย */
  if (b.value <= a.value) return { error: "ขั้นที่ 2 ต้องมากกว่าขั้นที่ 1" };
  return { value: [a.value, b.value] };
}

function buildTime(formData: FormData): Built {
  const r = checkTime(text(formData, "v"));
  return "error" in r ? r : { value: r.value };
}

function buildText(formData: FormData): Built {
  const v = text(formData, "v");
  if (v === "") return { error: "ต้องระบุค่า" };
  if (v.length > 40) return { error: "ยาวเกิน 40 ตัวอักษร" };
  return { value: v };
}

function buildDomains(formData: FormData): Built {
  const r = checkDomains(text(formData, "v"));
  return "error" in r ? r : { value: r.value };
}

function buildEnv(formData: FormData): Built {
  const v = text(formData, "v");
  if (!(ENV_VALUES as readonly string[]).includes(v)) return { error: "เลือกสภาพแวดล้อมจากรายการเท่านั้น" };
  return { value: v };
}

function buildClock(formData: FormData): Built {
  const mode = text(formData, "mode");
  if (mode === "now") return { value: { as_of: null } };
  const r = localToIso(text(formData, "v"));
  return "error" in r ? r : { value: { as_of: r.value } };
}

function buildHours(formData: FormData, current: unknown): Built {
  const merged: BusinessHours = asHours(current);

  const open = checkTime(text(formData, "open"));
  if ("error" in open) return { error: `เวลาเปิด: ${open.error}` };
  const close = checkTime(text(formData, "close"));
  if ("error" in close) return { error: `เวลาปิด: ${close.error}` };
  if (close.value <= open.value) return { error: "เวลาปิดต้องอยู่หลังเวลาเปิด" };
  merged.default = [open.value, close.value];

  /* ค่าเฉพาะสาขาแก้ได้ครั้งละสาขา — ตั้งใจให้ช้าแต่ชัด ดีกว่าฟอร์มยาวที่กดผิดแล้วทับทั้งชุด */
  const branch = text(formData, "branch");
  if (branch !== "") {
    if (text(formData, "branch_action") === "clear") {
      delete merged[branch];
    } else {
      const bOpen = checkTime(text(formData, "b_open"));
      if ("error" in bOpen) return { error: `เวลาเปิดของสาขา: ${bOpen.error}` };
      const bClose = checkTime(text(formData, "b_close"));
      if ("error" in bClose) return { error: `เวลาปิดของสาขา: ${bClose.error}` };
      if (bClose.value <= bOpen.value) return { error: "เวลาปิดของสาขาต้องอยู่หลังเวลาเปิด" };
      merged[branch] = [bOpen.value, bClose.value];
    }
  }
  return { value: merged };
}

const APPROVER_ROLES = Object.keys(ROLE_LABEL);

function buildLimits(formData: FormData, current: unknown, spec: SettingSpec): Built {
  const merged: Record<string, ExportLimit> = asLimits(current);
  const roles = Object.keys(merged);
  if (roles.length === 0) return { error: "ยังไม่มีเพดานการส่งออกตั้งไว้ในฐานข้อมูล จึงแก้จากหน้านี้ไม่ได้" };

  for (const role of roles) {
    const rowsSpec: SettingSpec = { ...spec, unit: "แถว", min: 1, max: 1000000 };
    const maxRows = checkInt(text(formData, `rows.${role}`), rowsSpec);
    if ("error" in maxRows) return { error: `${role} · แถวต่อครั้ง: ${maxRows.error}` };

    const perDaySpec: SettingSpec = { ...spec, unit: "ครั้ง", min: 1, max: 1000 };
    const perDay = checkInt(text(formData, `perday.${role}`), perDaySpec);
    if ("error" in perDay) return { error: `${role} · ครั้งต่อวัน: ${perDay.error}` };

    const approver = text(formData, `approver.${role}`);
    if (approver !== "" && !APPROVER_ROLES.includes(approver)) {
      return { error: `${role} · ผู้อนุมัติต้องเลือกจากรายการบทบาทเท่านั้น` };
    }
    if (approver === role) return { error: `${role} · ผู้อนุมัติต้องไม่ใช่บทบาทเดียวกับผู้ยื่น` };

    merged[role] = { max_rows: maxRows.value, per_day: perDay.value, approver_role: approver === "" ? null : approver };
  }
  return { value: merged };
}

/** เลือกวิธีตรวจและรูปร่างของค่าตาม kind ในแคตตาล็อก — ไม่ใช่ตามสิ่งที่ฟอร์มส่งมา */
async function buildValue(spec: SettingSpec, formData: FormData): Promise<Built> {
  switch (spec.kind) {
    case "int":
      return buildInt(formData, spec);
    case "pair":
      return buildPair(formData, spec);
    case "time":
      return buildTime(formData);
    case "text":
      return buildText(formData);
    case "domains":
      return buildDomains(formData);
    case "env":
      return buildEnv(formData);
    case "clock":
      return buildClock(formData);
    case "hours":
      return buildHours(formData, await currentValue(spec.key));
    case "limits":
      return buildLimits(formData, await currentValue(spec.key), spec);
  }
}

/**
 * บันทึกค่าตั้งหนึ่งคีย์ (api.update_setting)
 *
 * ฐานข้อมูลเป็นผู้ปฏิเสธจริงทุกกรณี: ไม่มีสิทธิ์ตาม editable_by · ยังไม่ยืนยัน MFA · คีย์ไม่มีอยู่
 * การตรวจในฟังก์ชันนี้มีไว้ให้ผู้ใช้เห็นข้อความที่แก้ได้ ไม่ได้มีไว้แทนการตรวจของฐานข้อมูล
 */
export async function updateSettingValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const key = text(formData, "key");
    const spec = specOf(key);
    if (!spec) {
      /* คีย์ที่ไม่อยู่ในแคตตาล็อกแปลว่าหน้าจอไม่รู้ว่าค่านี้ต้องมีรูปร่างอย่างไร
         ส่งไปมั่ว ๆ แล้วระบบอ่านไม่ออกเงียบ ๆ อันตรายกว่าไม่ให้แก้ */
      return { ok: false, title: "ยังไม่รองรับการแก้ค่าตั้งนี้จากหน้าจอ", detail: `คีย์ ${key || "(ว่าง)"}` };
    }

    const built = await buildValue(spec, formData);
    if ("error" in built) return invalid(built.error);

    /* prod ต้องใช้เวลาปัจจุบันเสมอ (ข้อ 1.2) — เปลี่ยนเป็น prod ทั้งที่นาฬิกายังตรึงอยู่
       จะทำให้ตัวเลขทุกหน้าเพี้ยนพร้อมกันโดยไม่มีใครเห็นสาเหตุ จึงกันไว้ก่อนส่ง */
    const isProd = key === "env" && typeof built.value === "string" && built.value === "prod";
    if (isProd && asClock(await currentValue("clock")) !== null) {
      return invalid('ตั้ง “นาฬิกาอ้างอิงของรายงาน” เป็นเวลาจริงก่อน จึงจะเปลี่ยนสภาพแวดล้อมเป็น prod ได้');
    }

    await rpc("update_setting", { p_key: key, p_value: built.value });
    revalidatePath(SETTINGS);
    return {
      ok: true,
      title: `บันทึก “${spec.label}” แล้ว`,
      detail: `มีผลกับ: ${spec.effect}`,
    };
  } catch (e) {
    return fail(e);
  }
}
