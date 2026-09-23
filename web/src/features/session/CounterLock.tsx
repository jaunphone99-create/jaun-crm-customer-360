"use client";

import { useCallback, useEffect, useRef } from "react";

import { lockSignOut } from "./actions";

/* หน้าจอล็อกของอุปกรณ์ counter ที่ใช้ร่วมกัน (C-LOCK · CANONICAL ข้อ 9.2 · architecture §6.3 ข้อ 6)

   เรื่องที่ทำให้พังได้ถ้าไม่ระวัง
   - **ห้ามเก็บข้อมูลลูกค้าลง storage เด็ดขาด** (ข้อ 9.2) ที่นี่เก็บแค่รหัสอุปกรณ์
     ธงว่าเป็นเครื่อง counter และเวลาที่ขยับล่าสุด — ไม่มีอะไรที่เป็นข้อมูลบุคคล
   - ล็อกแล้วต้อง **ตัดเซสชันจริง** ไม่ใช่วาดแผ่นทับจอ ไม่งั้นรีเฟรชหนีได้ (security-design T-07)
   - ก่อนขึ้นหน้าล็อกต้องซ่อนเนื้อหาทั้งหมดก่อน ไม่ให้เหลือชื่อหรือเบอร์ลูกค้าค้างบนจอ

   รู้ได้ยังไงว่าเครื่องนี้เป็น counter: ตามสเปคต้องดูจาก `core.devices.is_shared_counter`
   แต่ตาราง `core.devices` ไม่ได้ GRANT SELECT ให้ authenticated (migration 0010) แอปจึงอ่านไม่ได้
   ระหว่างที่ยังไม่มีแท็บ "อุปกรณ์" ในหน้า 13 (ชุดที่ 2) ให้ทำเครื่องหมายที่เครื่องเอง:
   เปิดหน้าไหนก็ได้ด้วย `?counter=on` (เลิกด้วย `?counter=off`) — ธงเก็บใน localStorage ของเครื่องนั้น
   ธงนี้ทำให้ "ล็อกเร็วขึ้น" อย่างเดียว ไม่เพิ่มสิทธิ์ให้ใครจึงปลอดภัยที่จะให้ตั้งจากฝั่งเครื่อง */

/** รหัสอุปกรณ์ · ชื่อคีย์ตรงตาม core.devices.device_id (ไม่ถูกล้างตอน logout) */
const KEY_DEVICE_ID = "device_id";
const KEY_SHARED = "jcrm.device.shared_counter";
const KEY_LAST_ACTIVE = "jcrm.device.last_active";
const KEY_LOCKED = "jcrm.device.locked";
/** นาทีทดสอบ (เฉพาะ JCRM_ENV=dev) — ไม่มีใครอยากรอ 10 นาทีเพื่อดูว่าหน้าล็อกขึ้นไหม */
const KEY_IDLE_DEV = "jcrm.device.idle_min_dev";

const ACTIVITY_EVENTS = ["pointerdown", "mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;

/** เขียนเวลาที่ขยับล่าสุดบ่อยแค่ไหน — ถี่กว่านี้ไม่ช่วยอะไรแต่เขียน storage รัว ๆ */
const WRITE_EVERY_MS = 5_000;

/** เครื่องหมายบนกล่องหน้าจอล็อก ใช้ทั้งกันสร้างซ้ำและเป็นข้อยกเว้นของกฎ "ซ่อนทุกอย่าง" */
const LOCK_ATTR = "data-jcrm-lock";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    /* โหมดส่วนตัวหรือปิด storage ไว้ — ถือว่าไม่มีค่า */
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* เขียนไม่ได้ก็ยังทำงานต่อได้ แค่ไม่ซิงก์ข้ามแท็บ */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ไม่เป็นไร */
  }
}

/** รหัสอุปกรณ์ของเครื่องนี้ — สร้างครั้งเดียวแล้วอยู่ยาว (ใช้ตอนลงทะเบียน counter และส่งเป็น x-device-id) */
function ensureDeviceId(): void {
  if (read(KEY_DEVICE_ID)) return;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  write(KEY_DEVICE_ID, id);
}

/** อ่านคำสั่งจาก query string แล้วลบทิ้งจากแถบที่อยู่ เพื่อไม่ให้ติดไปกับลิงก์ที่แชร์ต่อ */
function applyQueryOverrides(allowDevOverride: boolean): void {
  const url = new URL(window.location.href);
  const counter = url.searchParams.get("counter");
  const idle = url.searchParams.get("counter-idle");
  let changed = false;

  if (counter === "on" || counter === "off") {
    write(KEY_SHARED, counter === "on" ? "1" : "0");
    url.searchParams.delete("counter");
    changed = true;
  }
  if (idle !== null && allowDevOverride) {
    const minutes = Number(idle);
    if (Number.isFinite(minutes) && minutes > 0) write(KEY_IDLE_DEV, String(minutes));
    url.searchParams.delete("counter-idle");
    changed = true;
  }
  /* ส่ง state เดิมกลับไปด้วย — Next.js เก็บสถานะ router ไว้ใน history.state
     ถ้าเขียนทับด้วย null ปุ่มย้อนกลับของเบราว์เซอร์จะเพี้ยน */
  if (changed) window.history.replaceState(window.history.state, "", url.toString());
}

/* สร้างหน้าจอล็อกด้วย DOM ตรง ๆ ไม่ผ่าน React — **ตั้งใจ ไม่ใช่ความมักง่าย**

   เหตุผล: ขั้นตอนถัดไปคือเรียก Server Action เพื่อตัดเซสชัน ซึ่ง Next.js จะวาด route ปัจจุบันใหม่
   ให้อัตโนมัติ → (app)/layout.tsx เห็นว่าไม่มีเซสชันแล้วจึง redirect ไป /login
   ถ้าหน้าจอล็อกเป็นส่วนหนึ่งของ React tree มันจะถูกถอดทิ้งพร้อมกัน ผู้ใช้จะเห็นแค่แวบเดียว
   กล่องที่ต่อไว้กับ document.body ตรง ๆ อยู่นอกต้นไม้ของ router จึงค้างอยู่จนกว่าจะโหลดหน้าใหม่
   ข้อความและคลาสตรงตาม design-system ข้อ 7.25 (C-LOCK) ห้ามแต่งใหม่ */
function showLockScreen(): void {
  if (document.querySelector(`[${LOCK_ATTR}]`)) return;

  /* ซ่อนทุกอย่างที่ไม่ใช่หน้าจอล็อก — ครอบคลุมหน้าที่ router วาดทับเข้ามาทีหลังด้วย
     นี่คือข้อบังคับ "ล้างข้อมูลที่แสดงบนจอก่อนแสดงหน้าล็อก" (ข้อ 9.2) */
  const style = document.createElement("style");
  style.setAttribute(LOCK_ATTR, "style");
  style.textContent = `html[data-locked="1"] body > *:not([${LOCK_ATTR}]) { display: none !important; }`;
  document.head.appendChild(style);
  document.documentElement.dataset.locked = "1";

  const box = document.createElement("div");
  box.setAttribute(LOCK_ATTR, "screen");
  box.className = "lock-screen";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "jcrm-lock-title");
  /* ข้อความคงที่ทั้งก้อน ไม่มีค่าจากผู้ใช้หรือจากฐานข้อมูลปนเข้ามา */
  box.innerHTML = `
    <div class="stack" style="align-items:center">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <rect x="4" y="10" width="16" height="11" rx="2"></rect>
        <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
      </svg>
      <h2 id="jcrm-lock-title">หน้าจอถูกล็อกเนื่องจากไม่มีการใช้งาน</h2>
      <a class="btn btn--accent" href="/login">เข้าสู่ระบบอีกครั้ง</a>
    </div>`;
  document.body.appendChild(box);

  /* โฟกัสออกจากช่องกรอกที่ค้างอยู่ แล้วย้ายมาที่ปุ่มของหน้าล็อก */
  (document.activeElement as HTMLElement | null)?.blur?.();
  box.querySelector<HTMLAnchorElement>("a")?.focus();
}

export function CounterLock({
  idleMinutes,
  allowDevOverride,
}: {
  idleMinutes: number;
  allowDevOverride: boolean;
}) {
  /* ใช้ ref ทั้งหมดเพราะตัวจับเวลาต้องอ่านค่าล่าสุดโดยไม่ผูกกับรอบ render
     และหน้าจอล็อกไม่ได้วาดด้วย React (ดูเหตุผลที่ showLockScreen) */
  const lastWriteRef = useRef(0);
  const lockedRef = useRef(false);

  const lock = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;

    /* ซ่อนเนื้อหาก่อน แล้วค่อยตัดเซสชัน — ลำดับนี้คือข้อบังคับของข้อ 9.2 */
    showLockScreen();
    write(KEY_LOCKED, String(Date.now()));

    /* ตัดเซสชันจริงฝั่งเซิร์ฟเวอร์ — กลับมาใช้งานต้องยืนยันตัวตนใหม่เท่านั้น */
    void lockSignOut();
  }, []);

  useEffect(() => {
    applyQueryOverrides(allowDevOverride);
    ensureDeviceId();

    if (read(KEY_SHARED) !== "1") return;

    /* ปุ่มสัมผัส 48px และกติกาหน้าจออื่น ๆ ของเครื่อง counter (design-system ข้อ 8.2) */
    document.documentElement.dataset.device = "counter";

    const devMinutes = allowDevOverride ? Number(read(KEY_IDLE_DEV)) : NaN;
    const minutes = Number.isFinite(devMinutes) && devMinutes > 0 ? devMinutes : idleMinutes;
    const idleMs = Math.max(5_000, minutes * 60_000);
    /* ตรวจถี่พอที่หน้าล็อกจะขึ้นตรงเวลา แต่ไม่ถี่จนกินแรงเครื่อง */
    const tickMs = Math.min(5_000, Math.max(1_000, Math.floor(idleMs / 5)));

    /* หน้านี้เพิ่งวาดโดยมีเซสชันที่ใช้ได้ = มีคนอยู่หน้าเครื่องและยืนยันตัวตนผ่านแล้ว
       จึงล้างธงล็อกของรอบก่อนทิ้ง ไม่งั้นพอเข้าสู่ระบบใหม่จะเจอหน้าล็อกค้างทันที
       (การล็อกข้ามแท็บยังทำงานผ่าน storage event ระหว่างที่แท็บเปิดอยู่) */
    remove(KEY_LOCKED);

    let last = Date.now();
    write(KEY_LAST_ACTIVE, String(last));
    lastWriteRef.current = last;

    const onActivity = () => {
      if (lockedRef.current) return;
      const now = Date.now();
      last = now;
      /* เขียนลง storage แบบหน่วง — ให้แท็บอื่นเห็นว่ามีคนใช้เครื่องอยู่ */
      if (now - lastWriteRef.current >= WRITE_EVERY_MS) {
        lastWriteRef.current = now;
        write(KEY_LAST_ACTIVE, String(now));
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_LAST_ACTIVE && e.newValue) {
        /* แท็บอื่นมีการใช้งาน → นับถอยหลังของแท็บนี้เริ่มใหม่ด้วย */
        last = Math.max(last, Number(e.newValue) || 0);
      }
      if (e.key === KEY_LOCKED && e.newValue) lock();
    };

    const timer = window.setInterval(() => {
      if (lockedRef.current) return;
      const shared = Math.max(last, Number(read(KEY_LAST_ACTIVE)) || 0);
      if (Date.now() - shared >= idleMs) lock();
    }, tickMs);

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      window.removeEventListener("storage", onStorage);
    };
  }, [allowDevOverride, idleMinutes, lock]);

  /* ไม่วาดอะไรในต้นไม้ของ React เลย — หน้าจอล็อกอยู่นอกต้นไม้ตามเหตุผลข้างบน */
  return null;
}
