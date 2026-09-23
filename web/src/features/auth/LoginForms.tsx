"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { roleLabel } from "@/lib/labels";

import { ErrorAlert } from "./AuthUi";
import { devSignIn, passwordSignIn, type DevStaff, type LoginState } from "./actions";

/* หน้า 01 · เข้าสู่ระบบ — โครงและข้อความตาม prototype/01-login.html
   ค่าที่กรอกอยู่ใน state ของ React เท่านั้น การตรวจตัวตนทั้งหมดเกิดใน Server Action */

const initial: LoginState = { error: null };

/** จำเฉพาะ "อีเมล/รหัสพนักงาน" ในเครื่องนี้ · ไม่จำรหัสผ่าน · ไม่ยืดอายุเซสชัน (ข้อ 9.2 · D34)
    ใช้คีย์เดียวกับ prototype (JCRM.data.meta.loginIdStorageKey) และ Logout ไม่ล้างค่านี้ */
const REMEMBER_KEY = "jcrm.login_id";

/** อุปกรณ์ counter ที่ใช้ร่วมกัน — แหล่งจริงคือ core.devices.is_shared_counter
    หน้าจอนี้แค่เคารพค่าที่ผู้ลงทะเบียนอุปกรณ์ตั้งไว้ในเครื่อง ไม่ได้ตั้งเอง (ข้อ 9.2) */
const SHARED_COUNTER_KEY = "jcrm.device.shared_counter";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน storage — ถือว่าไม่เคยจำไว้ */
    return null;
  }
}

/* ---- โหมดจริง: อีเมล/รหัสพนักงาน + รหัสผ่าน -------------------------------- */

export function PasswordLoginForm() {
  const [state, action, pending] = useActionState(passwordSignIn, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [remember, setRemember] = useState(false);
  const [sharedCounter, setSharedCounter] = useState(false);
  const [ready, setReady] = useState(false);

  /* อ่านค่าที่เคยจำไว้หลัง hydrate เท่านั้น — ไม่งั้น HTML จาก server กับ client จะไม่ตรงกัน */
  useEffect(() => {
    const counter = readLocal(SHARED_COUNTER_KEY) === "1";
    setSharedCounter(counter);
    if (!counter) {
      const saved = readLocal(REMEMBER_KEY);
      if (saved) {
        setLoginId(saved);
        setRemember(true);
      }
    }
    setReady(true);
  }, []);

  /* ค่าเริ่มต้นคือ "ไม่ติ๊ก" (D34) · เลิกติ๊กเมื่อไรก็ลบทิ้งทันที */
  useEffect(() => {
    if (!ready) return;
    try {
      if (remember && !sharedCounter && loginId.trim()) {
        window.localStorage.setItem(REMEMBER_KEY, loginId.trim());
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      /* เขียน storage ไม่ได้ก็ไม่เป็นไร เป็นแค่ความสะดวก ไม่ใช่ส่วนหนึ่งของการยืนยันตัวตน */
    }
  }, [ready, remember, sharedCounter, loginId]);

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
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <div className="row-between">
            <label className="label" htmlFor="login-password">
              รหัสผ่าน
            </label>
            {/* ไม่ส่งอีเมล/รหัสพนักงานไปกับ URL — หน้าปลายทางให้กรอกเอง (ข้อ 9.2 · PDPA) */}
            <Link className="link-btn t-sm" href="/forgot-password">
              ลืมรหัสผ่าน?
            </Link>
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

        {sharedCounter ? (
          <p className="alert">
            อุปกรณ์ counter ที่ใช้ร่วมกัน: ไม่มีตัวเลือกจดจำ · ไม่มีการใช้งาน 10 นาทีจะล็อกหน้าจอและต้องเข้าสู่ระบบใหม่
          </p>
        ) : (
          <div>
            <label className="checkbox">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span className="checkbox__text">
                จดจำอีเมล/รหัสพนักงาน
                <small>จำเฉพาะอีเมลหรือรหัสพนักงานในช่องกรอกบนเครื่องนี้ ไม่ยืดอายุการเข้าสู่ระบบ และไม่จำรหัสผ่าน</small>
              </span>
            </label>
          </div>
        )}

        <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={pending}>
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>

      {/* SSO ยังไม่ได้ตั้งค่าให้องค์กรนี้ (CANONICAL ข้อ 9.2.1 · D23 รอยืนยัน Q5)
          จึงปิดปุ่มไว้พร้อมบอกเหตุผล — ไม่ทำปุ่มที่กดแล้วไม่เกิดอะไรขึ้น */}
      <div className="login__divider">หรือเข้าสู่ระบบด้วย</div>
      <div className="grid grid-2">
        <button type="button" className="btn btn--secondary btn--lg sso-btn" disabled>
          <span className="sso-mark" aria-hidden="true">
            G
          </span>
          <span>Google</span>
        </button>
        <button type="button" className="btn btn--secondary btn--lg sso-btn" disabled>
          <span className="sso-mark" aria-hidden="true">
            M
          </span>
          <span>Microsoft</span>
        </button>
      </div>
      <p className="help" style={{ textAlign: "center" }}>
        ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google/Microsoft สำหรับองค์กรนี้ · เมื่อเปิดแล้วจะใช้ได้เฉพาะบัญชีที่ได้รับเชิญ
        เปิดใช้งานแล้ว และอยู่ในโดเมนที่องค์กรอนุญาต
      </p>

      <p className="t-xs t-muted" style={{ textAlign: "center" }}>
        ระบบนี้ไม่มีการสมัครใช้งานเอง ผู้ใช้ใหม่ต้องได้รับคำเชิญจากผู้จัดการสาขาหรือผู้ดูแลข้อมูลธุรกิจ
      </p>
    </>
  );
}

/* ---- โหมดพัฒนา: เลือกผู้ใช้จาก seed ไม่มีรหัสผ่าน ------------------------- */

export function DevLoginForm({ staff }: { staff: DevStaff[] }) {
  const [state, action, pending] = useActionState(devSignIn, initial);
  const [selected, setSelected] = useState(
    staff.find((s) => s.staff_code === "ST-0045")?.staff_code ?? staff[0]?.staff_code ?? ""
  );
  const [typed, setTyped] = useState("");

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
      <form id="login-form" className="stack" action={action} noValidate>
        <input type="hidden" name="staffCode" value={selected} />

        <div className="field">
          <span className="label">เลือกผู้ใช้ที่จะทดลอง</span>
          <div className="sample-list">
            {staff.map((s) => {
              const roles = s.roles ? s.roles.split(" ").filter(Boolean) : [];
              const isOn = s.staff_code === selected && typed === "";
              return (
                <button
                  type="button"
                  key={s.staff_code}
                  className="sample-btn"
                  aria-pressed={isOn}
                  style={isOn ? { borderColor: "var(--orange-500)", background: "var(--orange-50)" } : undefined}
                  onClick={() => {
                    setSelected(s.staff_code);
                    setTyped("");
                  }}
                >
                  <strong>
                    {s.display_name} · {s.staff_code}
                  </strong>
                  <span className="t-xs t-muted">
                    {roles.length ? roles.map(roleLabel).join(" · ") : "ไม่มีบทบาท"}
                    {s.branches ? ` · ${s.branches}` : ""}
                    {s.status !== "ACTIVE" ? ` · ${s.status}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ช่องนี้มีไว้ทดสอบทางเข้าแบบ ST-NNNN — ของจริงส่งรหัสพนักงาน + รหัสผ่าน
            ไปที่ Edge Function staff-code-login ส่วนโหมดพัฒนาใช้รหัสพนักงานอย่างเดียว */}
        <div className="field">
          <label className="label" htmlFor="dev-staff-code">
            หรือพิมพ์รหัสพนักงาน (ST-NNNN)
          </label>
          <input
            className="input"
            id="dev-staff-code"
            name="staffCodeTyped"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ST-0020"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
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
                <small>บทบาทที่บังคับ MFA จะถูกพาไปหน้ายืนยันตัวตนก่อน ไม่ได้สิทธิ์ของบทบาทนั้นทันที</small>
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn--accent btn--lg btn--block"
          disabled={pending || (!selected && typed.trim() === "")}
        >
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ (โหมดพัฒนา)"}
        </button>
      </form>

      <p className="t-xs t-muted" style={{ textAlign: "center" }}>
        บัญชีที่ไม่ได้อยู่ในสถานะใช้งานจะเข้าไม่ได้เหมือนของจริง และได้ข้อความผิดพลาดเดียวกันกับทุกกรณี
      </p>
    </>
  );
}
