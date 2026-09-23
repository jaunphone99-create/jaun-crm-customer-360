"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { int } from "@/lib/format/number";
import { roleLabel, ROLE_LABEL } from "@/lib/labels";

import { updateSettingValue } from "./actions";
import type { SettingSpec } from "./catalog";
import { Feedback } from "./Feedback";
import { INITIAL_ACTION, type ActionState, type BranchRow } from "./types";
import {
  asClock,
  asDomains,
  asEnv,
  asHours,
  asInt,
  asLimits,
  asPair,
  asText,
  asTime,
  ENV_LABEL,
  ENV_VALUES,
  isoToLocal,
} from "./value";

/* ฟอร์มแก้ค่าตั้งหนึ่งคีย์

   เปิด/ปิดฟอร์มด้วย query string (?edit=<key>) ไม่ใช่ state ฝั่ง client
   เหตุผลเดียวกับหน้า 13: สถานะของหน้าจึงแชร์ลิงก์กันดูได้ และไม่มี state ที่หลุดจากสิทธิ์จริง

   ช่องกรอกมี min/max/pattern ของ HTML เพื่อให้ผู้ใช้รู้ตัวก่อนกดส่ง
   แต่ตัวตัดสินจริงคือ actions.ts (ตรวจซ้ำฝั่งเซิร์ฟเวอร์) แล้วต่อด้วย api.update_setting
   ซึ่งเป็นผู้ตรวจสิทธิ์ตาม editable_by — ฟอร์มนี้ไม่ได้ตัดสินสิทธิ์ให้ใครทั้งนั้น */

const APPROVER_OPTIONS = Object.keys(ROLE_LABEL);

export function SettingEditForm({
  spec,
  value,
  branches,
  query,
}: {
  spec: SettingSpec;
  value: unknown;
  /** ใช้เฉพาะ business_hours — สาขาที่ตั้งเวลาทำการเฉพาะสาขาได้ */
  branches: BranchRow[];
  /** ตัวกรอง/แท็บปัจจุบัน ใส่กลับไปในลิงก์ยกเลิก เพื่อให้ปิดฟอร์มแล้วยังอยู่ที่เดิม */
  query: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSettingValue, INITIAL_ACTION);

  return (
    <form action={action} className="stack" noValidate>
      <Feedback state={state} />
      <input type="hidden" name="key" value={spec.key} />

      <Fields spec={spec} value={value} branches={branches} />

      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          บันทึกค่า
        </button>
        <Link className="btn btn--secondary" href={{ pathname: "/settings", query }}>
          ยกเลิก
        </Link>
        <span className="help">
          ฐานข้อมูลเป็นผู้ตรวจสิทธิ์และบันทึกประวัติการแก้ (SETTINGS_UPDATED) ให้เอง
        </span>
      </div>
    </form>
  );
}

function Fields({ spec, value, branches }: { spec: SettingSpec; value: unknown; branches: BranchRow[] }) {
  switch (spec.kind) {
    case "int":
      return <IntField spec={spec} value={value} />;
    case "pair":
      return <PairField spec={spec} value={value} />;
    case "time":
      return <TimeField spec={spec} value={value} />;
    case "text":
      return <TextField spec={spec} value={value} />;
    case "env":
      return <EnvField value={value} />;
    case "clock":
      return <ClockField value={value} />;
    case "domains":
      return <DomainsField value={value} />;
    case "hours":
      return <HoursField value={value} branches={branches} />;
    case "limits":
      return <LimitsField value={value} />;
  }
}

/* ------------------------------------------------------------------- ตัวเลข */

function IntField({ spec, value }: { spec: SettingSpec; value: unknown }) {
  const min = spec.min ?? 1;
  const max = spec.max ?? 100000;
  return (
    <div className="field" style={{ maxWidth: "28ch" }}>
      <label className="label" htmlFor="set-v">
        {spec.label} ({spec.unit})
      </label>
      <input
        className="input"
        id="set-v"
        name="v"
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        defaultValue={asInt(value) ?? ""}
        required
      />
      <p className="help">
        หน่วยเป็น{spec.unit} · รับได้ {int(min)}–{int(max)} และต้องเป็นจำนวนเต็ม
      </p>
    </div>
  );
}

function PairField({ spec, value }: { spec: SettingSpec; value: unknown }) {
  const pair = asPair(value);
  const names = spec.names ?? ["ขั้นที่ 1", "ขั้นที่ 2"];
  const min = spec.min ?? 1;
  const max = spec.max ?? 100000;
  return (
    <div className="form-grid">
      {(["a", "b"] as const).map((name, i) => (
        <div className="field" key={name}>
          <label className="label" htmlFor={`set-${name}`}>
            {names[i]} ({spec.unit})
          </label>
          <input
            className="input"
            id={`set-${name}`}
            name={name}
            type="number"
            inputMode="numeric"
            step={1}
            min={min}
            max={max}
            defaultValue={pair ? pair[i] : ""}
            required
          />
        </div>
      ))}
      <p className="help span-2">ขั้นที่ 2 คือการยกระดับต่อจากขั้นที่ 1 จึงต้องมากกว่าเสมอ</p>
    </div>
  );
}

function TimeField({ spec, value }: { spec: SettingSpec; value: unknown }) {
  return (
    <div className="field" style={{ maxWidth: "22ch" }}>
      <label className="label" htmlFor="set-v">
        {spec.label}
      </label>
      <input className="input" id="set-v" name="v" type="time" defaultValue={asTime(value) ?? ""} required />
      <p className="help">เวลาตามเขตเวลา Asia/Bangkok (ข้อ 1.2)</p>
    </div>
  );
}

function TextField({ spec, value }: { spec: SettingSpec; value: unknown }) {
  return (
    <div className="field" style={{ maxWidth: "32ch" }}>
      <label className="label" htmlFor="set-v">
        {spec.label}
      </label>
      <input
        className="input"
        id="set-v"
        name="v"
        type="text"
        maxLength={40}
        defaultValue={asText(value) ?? ""}
        required
      />
      <p className="help">ยาวได้ไม่เกิน 40 ตัวอักษร</p>
    </div>
  );
}

/* --------------------------------------------------------------- เชิงเทคนิค */

function EnvField({ value }: { value: unknown }) {
  return (
    <div className="field" style={{ maxWidth: "32ch" }}>
      <label className="label" htmlFor="set-v">
        สภาพแวดล้อม
      </label>
      <select className="select" id="set-v" name="v" defaultValue={asEnv(value) ?? "dev"} required>
        {ENV_VALUES.map((e) => (
          <option key={e} value={e}>
            {ENV_LABEL[e]}
          </option>
        ))}
      </select>
      <p className="help">
        เปลี่ยนเป็น prod ได้ก็ต่อเมื่อนาฬิกาอ้างอิงเป็น “เวลาจริง” แล้ว เพราะ prod ต้องใช้เวลาปัจจุบันเสมอ (ข้อ 1.2)
      </p>
    </div>
  );
}

function ClockField({ value }: { value: unknown }) {
  const iso = asClock(value);
  const [mode, setMode] = useState<"now" | "fixed">(iso === null ? "now" : "fixed");

  return (
    <div className="stack">
      <fieldset className="fieldset">
        <legend className="label">นาฬิกาอ้างอิงของรายงาน</legend>
        <label className="checkbox">
          <input type="radio" name="mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} />
          <span className="checkbox__text">ใช้เวลาจริง (จำเป็นสำหรับ prod)</span>
        </label>
        <label className="checkbox">
          <input type="radio" name="mode" value="fixed" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
          <span className="checkbox__text">ตรึงไว้ที่วันเวลาที่กำหนด (ใช้กับชุดข้อมูลตัวอย่างเท่านั้น)</span>
        </label>
      </fieldset>

      {mode === "fixed" ? (
        <div className="field" style={{ maxWidth: "28ch" }}>
          <label className="label" htmlFor="set-v">
            วันเวลาอ้างอิง (Asia/Bangkok)
          </label>
          <input className="input" id="set-v" name="v" type="datetime-local" defaultValue={isoToLocal(iso)} required />
          <p className="help">ระบบจะบันทึกพร้อมเขตเวลา +07:00 เสมอ เพื่อไม่ให้ผลขึ้นกับเครื่องที่รัน</p>
        </div>
      ) : null}
    </div>
  );
}

function DomainsField({ value }: { value: unknown }) {
  return (
    <div className="field" style={{ maxWidth: "48ch" }}>
      <label className="label" htmlFor="set-v">
        โดเมนที่อนุญาต (บรรทัดละหนึ่งโดเมน)
      </label>
      <textarea className="textarea" id="set-v" name="v" rows={4} defaultValue={asDomains(value).join("\n")} />
      <p className="help">เว้นว่างได้ = ไม่จำกัดโดเมน · ใส่เฉพาะชื่อโดเมน เช่น example.com ไม่ต้องมี https://</p>
    </div>
  );
}

/* --------------------------------------------------------------- เวลาทำการ */

function HoursField({ value, branches }: { value: unknown; branches: BranchRow[] }) {
  const hours = asHours(value);
  const def = hours.default ?? ["10:00", "21:00"];
  const [branch, setBranch] = useState("");
  const existing = branch ? hours[branch] : undefined;

  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="set-open">
            เวลาเปิด · ทุกสาขา (ค่าเริ่มต้น)
          </label>
          <input className="input" id="set-open" name="open" type="time" defaultValue={def[0]} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="set-close">
            เวลาปิด · ทุกสาขา (ค่าเริ่มต้น)
          </label>
          <input className="input" id="set-close" name="close" type="time" defaultValue={def[1]} required />
        </div>
      </div>

      <div className="field" style={{ maxWidth: "36ch" }}>
        <label className="label" htmlFor="set-branch">
          ตั้งค่าเฉพาะสาขา (ครั้งละหนึ่งสาขา)
        </label>
        <select className="select" id="set-branch" name="branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">ไม่แก้ค่าเฉพาะสาขา</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name_th} ({b.code}){hours[b.code] ? ` — ${hours[b.code]![0]}–${hours[b.code]![1]} น.` : ""}
            </option>
          ))}
        </select>
        <p className="help">ค่าเฉพาะสาขาทับค่าเริ่มต้น · สาขาที่ไม่ได้ตั้งจะใช้ค่าเริ่มต้นข้างบน</p>
      </div>

      {branch ? (
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="set-bopen">
              เวลาเปิดของสาขา
            </label>
            <input className="input" id="set-bopen" name="b_open" type="time" defaultValue={existing?.[0] ?? def[0]} />
          </div>
          <div className="field">
            <label className="label" htmlFor="set-bclose">
              เวลาปิดของสาขา
            </label>
            <input className="input" id="set-bclose" name="b_close" type="time" defaultValue={existing?.[1] ?? def[1]} />
          </div>
          {existing ? (
            <label className="checkbox span-2">
              <input type="checkbox" name="branch_action" value="clear" />
              <span className="checkbox__text">ลบค่าเฉพาะสาขานี้ แล้วให้กลับไปใช้ค่าเริ่มต้น</span>
            </label>
          ) : null}
        </div>
      ) : null}

      <p className="help">
        สาขาอื่นที่ตั้งค่าไว้แล้วจะถูกเก็บไว้เหมือนเดิม — ระบบอ่านค่าล่าสุดจากฐานข้อมูลมารวมให้ตอนบันทึก
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ เพดานส่งออก */

function LimitsField({ value }: { value: unknown }) {
  const limits = asLimits(value);
  const roles = Object.keys(limits).sort();

  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="st-limits">
          <caption className="sr-only">เพดานการส่งออกของแต่ละบทบาท</caption>
          <thead>
            <tr>
              <th scope="col">ยื่นในบทบาท</th>
              <th scope="col">แถวต่อครั้ง</th>
              <th scope="col">ครั้งต่อวัน</th>
              <th scope="col">ผู้อนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const row = limits[role]!;
              return (
                <tr key={role}>
                  <th scope="row">{roleLabel(role)}</th>
                  <td>
                    <input
                      className="input"
                      aria-label={`แถวต่อครั้งของ ${roleLabel(role)}`}
                      name={`rows.${role}`}
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={1}
                      max={1000000}
                      defaultValue={row.max_rows}
                      required
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={`ครั้งต่อวันของ ${roleLabel(role)}`}
                      name={`perday.${role}`}
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={1}
                      max={1000}
                      defaultValue={row.per_day}
                      required
                    />
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label={`ผู้อนุมัติของ ${roleLabel(role)}`}
                      name={`approver.${role}`}
                      defaultValue={row.approver_role ?? ""}
                    >
                      <option value="">ไม่ต้องอนุมัติ (เกินเพดาน = ปฏิเสธ)</option>
                      {APPROVER_OPTIONS.filter((r) => r !== role).map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="help">
        บทบาทที่ไม่มีผู้อนุมัติ ถ้าขอเกินเพดานจะถูกปฏิเสธทันทีที่ api.request_export (ข้อ 8.2)
      </p>
    </div>
  );
}
