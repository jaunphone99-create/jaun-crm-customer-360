"use client";

import { useActionState, useState } from "react";

import { devSignIn, passwordSignIn, type DevStaff, type LoginState } from "./actions";
import { roleLabel } from "@/lib/labels";

const initial: LoginState = { error: null };

function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert--danger" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <p className="alert__title">เข้าสู่ระบบไม่สำเร็จ</p>
        <p>{message}</p>
      </div>
    </div>
  );
}

/* ---- โหมดจริง: อีเมล/รหัสพนักงาน + รหัสผ่าน (ตรงกับ prototype หน้า 01) ---- */

export function PasswordLoginForm() {
  const [state, action, pending] = useActionState(passwordSignIn, initial);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <ErrorAlert message={state.error} />
      <form id="login-form" className="stack" action={action} noValidate>
        <div className="field">
          <label className="label" htmlFor="login-id">
            อีเมล หรือ รหัสพนักงาน (ST-NNNN)
          </label>
          <input
            className="input input--lg"
            id="login-id"
            name="loginId"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="name@example.com หรือ ST-0045"
            required
          />
        </div>

        <div className="field">
          <div className="row-between">
            <label className="label" htmlFor="login-password">
              รหัสผ่าน
            </label>
          </div>
          <div className="password-field">
            <input
              className="input input--lg"
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-field__toggle"
              aria-controls="login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending}>
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>

      <p className="t-xs t-muted" style={{ textAlign: "center" }}>
        ระบบนี้ไม่มีการสมัครใช้งานเอง ผู้ใช้ใหม่ต้องได้รับคำเชิญจากผู้จัดการสาขาหรือผู้ดูแลข้อมูลธุรกิจ
      </p>
    </>
  );
}

/* ---- โหมดพัฒนา: เลือกผู้ใช้จาก seed ไม่มีรหัสผ่าน ------------------------- */

export function DevLoginForm({ staff }: { staff: DevStaff[] }) {
  const [state, action, pending] = useActionState(devSignIn, initial);
  const [selected, setSelected] = useState(staff.find((s) => s.staff_code === "ST-0045")?.staff_code ?? staff[0]?.staff_code ?? "");

  if (staff.length === 0) {
    return (
      <div className="alert alert--warning" role="alert">
        <span aria-hidden="true">!</span>
        <div>
          <p className="alert__title">ยังไม่ได้เปิดฐานข้อมูลโหมดพัฒนา</p>
          <p>
            สั่ง <code>npm run dev:db</code> ที่รากโครงการ แล้วโหลดหน้านี้ใหม่
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ErrorAlert message={state.error} />
      <form className="stack" action={action} noValidate>
        <input type="hidden" name="staffCode" value={selected} />

        <div className="field">
          <span className="label">เลือกผู้ใช้ที่จะทดลอง</span>
          <div className="sample-list">
            {staff.map((s) => {
              const roles = s.roles ? s.roles.split(" ").filter(Boolean) : [];
              const isOn = s.staff_code === selected;
              return (
                <button
                  type="button"
                  key={s.staff_code}
                  className="sample-btn"
                  aria-pressed={isOn}
                  style={isOn ? { borderColor: "var(--orange-500)", background: "var(--orange-50)" } : undefined}
                  onClick={() => setSelected(s.staff_code)}
                >
                  <strong>
                    {s.display_name} · {s.staff_code}
                  </strong>
                  <span className="t-xs t-muted">
                    {roles.length ? roles.map(roleLabel).join(" · ") : "ไม่มีบทบาท"}
                    {s.branches ? ` · ${s.branches}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="label">ระดับการยืนยันตัวตน</span>
          <div className="stack" style={{ gap: "var(--space-1)" }}>
            <label className="checkbox">
              <input type="radio" name="aal" value="aal2" defaultChecked />
              <span className="checkbox__text">
                ยืนยัน MFA แล้ว (aal2)
                <small>เหมือนผู้ใช้ที่ผ่านการยืนยันสองขั้นตอน — บทบาทที่บังคับ MFA จะใช้งานได้ครบ</small>
              </span>
            </label>
            <label className="checkbox">
              <input type="radio" name="aal" value="aal1" />
              <span className="checkbox__text">
                ยังไม่ยืนยัน MFA (aal1)
                <small>ใช้ทดสอบว่าหน้าจอกันสิทธิ์ที่ต้องยืนยันตัวตนถูกต้องหรือไม่</small>
              </span>
            </label>
          </div>
        </div>

        <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending || !selected}>
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ (โหมดพัฒนา)"}
        </button>
      </form>
    </>
  );
}
