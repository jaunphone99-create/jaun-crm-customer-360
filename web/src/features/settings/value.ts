/* อ่าน/เขียนค่า jsonb ของ app.settings ให้เป็นรูปที่หน้าจอกับฟอร์มใช้ได้

   ค่าใน app.settings เป็น jsonb ล้วน (ตัวเลข · สตริง · อาร์เรย์ · อ็อบเจกต์) และ CHECK ของตาราง
   บังคับรูปร่างไว้เฉพาะ env กับ clock เท่านั้น ที่เหลือฐานข้อมูลรับอะไรก็ได้
   ไฟล์นี้จึงเป็นด่านที่ทำให้ "ค่าที่ส่งไป" มีรูปร่างเดียวกับที่ระบบอ่านไปใช้จริงเสมอ
   ถ้าส่ง 15 เป็นสตริง "15" ไป app.setting_int จะอ่านไม่ออกแล้วตกไปใช้ค่าเริ่มต้นเงียบ ๆ
   ซึ่งเป็นอาการ "แก้ค่าแล้วไม่มีอะไรเปลี่ยน" ที่หาสาเหตุยากที่สุด

   ฟังก์ชันตรวจค่าทั้งหมดคืน "ข้อความไทย" เมื่อไม่ผ่าน และ null เมื่อผ่าน
   ทั้งฝั่งฟอร์มและฝั่ง Server Action เรียกชุดเดียวกัน — ฝั่งเซิร์ฟเวอร์เป็นคำตอบสุดท้าย
   (และฐานข้อมูลยังตรวจสิทธิ์ซ้ำอีกชั้นที่ api.update_setting เสมอ) */

import { dayKey, time as thaiTime } from "@/lib/format/date";
import { DASH, int } from "@/lib/format/number";

import type { SettingSpec } from "./catalog";

export type ExportLimit = { max_rows: number; per_day: number; approver_role: string | null };

/** ตัวเลขจำนวนเต็มจากค่า jsonb — สตริงที่เป็นตัวเลขก็รับ เพราะ seed เก่าอาจเก็บมาแบบนั้น */
export function asInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

export function asPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const a = asInt(value[0]);
  const b = asInt(value[1]);
  return a === null || b === null ? null : [a, b];
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function asTime(value: unknown): string | null {
  return typeof value === "string" && HHMM.test(value) ? value : null;
}

export type BusinessHours = Record<string, [string, string]>;

/** {"default":["10:00","21:00"], "JP2":[...]} — คีย์ที่รูปร่างไม่ถูกจะถูกตัดทิ้ง ไม่ใช่ทำให้ทั้งค่าพัง */
export function asHours(value: unknown): BusinessHours {
  const out: BusinessHours = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v) && asTime(v[0]) && asTime(v[1])) out[k] = [String(v[0]), String(v[1])];
  }
  return out;
}

export function asLimits(value: unknown): Record<string, ExportLimit> {
  const out: Record<string, ExportLimit> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [role, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const row = v as Record<string, unknown>;
    const maxRows = asInt(row.max_rows);
    const perDay = asInt(row.per_day);
    if (maxRows === null || perDay === null) continue;
    const approver = typeof row.approver_role === "string" && row.approver_role !== "" ? row.approver_role : null;
    out[role] = { max_rows: maxRows, per_day: perDay, approver_role: approver };
  }
  return out;
}

export function asDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/** clock = {"as_of": null | ISO ที่มี offset} · null แปลว่า "ใช้เวลาจริง" */
export function asClock(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = (value as Record<string, unknown>).as_of;
  return typeof v === "string" && v !== "" ? v : null;
}

export const ENV_VALUES = ["dev", "staging", "prod"] as const;
export type EnvValue = (typeof ENV_VALUES)[number];

export const ENV_LABEL: Record<EnvValue, string> = {
  dev: "พัฒนา (dev)",
  staging: "ทดสอบก่อนใช้จริง (staging)",
  prod: "ใช้งานจริง (prod)",
};

export function asEnv(value: unknown): EnvValue | null {
  return typeof value === "string" && (ENV_VALUES as readonly string[]).includes(value) ? (value as EnvValue) : null;
}

/* ----------------------------------------------------------------- แสดงค่า */

/** ข้อความสั้นของค่าในคอลัมน์ "ค่า" — ค่าที่รูปร่างไม่ตรง kind จะได้ – แทนการเดา */
export function displayValue(spec: SettingSpec, value: unknown): string {
  switch (spec.kind) {
    case "int": {
      const n = asInt(value);
      return n === null ? DASH : `${int(n)} ${spec.unit ?? ""}`.trim();
    }
    case "pair": {
      const p = asPair(value);
      return p === null ? DASH : `${int(p[0])} · ${int(p[1])} ${spec.unit ?? ""}`.trim();
    }
    case "time": {
      const t = asTime(value);
      return t === null ? DASH : `${t} น.`;
    }
    case "text":
      return asText(value) ?? DASH;
    case "env": {
      const e = asEnv(value);
      return e === null ? DASH : ENV_LABEL[e];
    }
    case "clock": {
      const iso = asClock(value);
      if (iso === null) return "เวลาจริง (now)";
      const day = dayKey(iso);
      return day === null ? DASH : `ตรึงไว้ที่ ${day} ${thaiTime(iso, { suffix: false })} น.`;
    }
    case "domains": {
      const list = asDomains(value);
      return list.length === 0 ? "ยังไม่ได้ตั้งค่า" : list.join(" · ");
    }
    case "hours": {
      const h = asHours(value);
      const def = h.default;
      const base = def ? `ทุกสาขา ${def[0]}–${def[1]} น.` : DASH;
      const extra = Object.keys(h).filter((k) => k !== "default");
      return extra.length === 0 ? base : `${base} · เฉพาะสาขา ${extra.length} รายการ`;
    }
    case "limits": {
      const rows = Object.keys(asLimits(value));
      return rows.length === 0 ? DASH : `${int(rows.length)} บทบาท`;
    }
  }
}

/* --------------------------------------------------------------- ตรวจค่า */

export function checkInt(raw: string, spec: SettingSpec): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: `ต้องระบุค่า (${spec.unit ?? "ตัวเลข"})` };
  if (!/^\d+$/.test(trimmed)) return { error: "ต้องเป็นจำนวนเต็มบวก ไม่มีจุดทศนิยม" };
  const n = Number(trimmed);
  const min = spec.min ?? 1;
  const max = spec.max ?? 100000;
  if (n < min || n > max) return { error: `ค่าต้องอยู่ระหว่าง ${int(min)} ถึง ${int(max)} ${spec.unit ?? ""}`.trim() };
  return { value: n };
}

export function checkTime(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (!HHMM.test(trimmed)) return { error: "ต้องเป็นเวลารูปแบบ ชช:นน เช่น 18:00" };
  return { value: trimmed };
}

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function checkDomains(raw: string): { value: string[] } | { error: string } {
  const list = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "");
  for (const d of list) {
    if (!DOMAIN.test(d)) return { error: `โดเมน “${d}” ไม่ถูกต้อง — ใส่เฉพาะชื่อโดเมน เช่น example.com` };
  }
  return { value: [...new Set(list)] };
}

/** datetime-local ("2026-09-11T10:24") → ISO ที่มี offset ตามที่ CHECK ของตารางบังคับ (ข้อ 1.2) */
export function localToIso(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmed);
  if (!m) return { error: "ต้องระบุวันและเวลาให้ครบ" };
  return { value: `${trimmed}:00+07:00` };
}

/** ISO → ค่าเริ่มต้นของช่อง datetime-local (เวลา Asia/Bangkok) */
export function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const day = dayKey(iso);
  const t = thaiTime(iso, { suffix: false });
  return day && t !== DASH ? `${day}T${t}` : "";
}
