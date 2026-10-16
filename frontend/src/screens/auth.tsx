"use client";

import { IMAGES } from "@/assets/images";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProfileChoices } from "@/components/shared";
import { Btn, Circle, Icon, SelectField, TextField } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/hooks/useApp";
import { href, isSeniorRole, roleHome } from "@/lib/access";
import * as authApi from "@/lib/api/auth";
import { accessibilitySelection, addCaregiver, putAccessibility } from "@/lib/api/users";
import { ApiError, errorMessage } from "@/lib/api-client";
import { ROLE_CHOICES, SHARING_NOTE, SHARING_OPTIONS, type Role } from "@/lib/data";
import type { Sharing } from "@/lib/demo-state";
import type { FieldError, RegisterRole } from "@/types/api";

function RoleCard({
  title,
  text,
  icon,
  selected,
  ...rest
}: { title: string; text: string; icon: string; selected: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`choice role-choice ${selected ? "selected" : ""}`} aria-pressed={selected} {...rest}>
      <Circle icon={icon} />
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </button>
  );
}

/** Readable text for a failed auth call: field messages from VALIDATION_ERROR, else the backend message. */
function authError(e: unknown) {
  if (e instanceof ApiError && e.code === "VALIDATION_ERROR" && Array.isArray(e.details) && e.details.length)
    return (e.details as FieldError[]).map((d) => d.message).join(" ");
  return errorMessage(e);
}

/** Where a freshly registered account continues (senior → onboarding, caregiver → link, volunteer → application). */
const afterRegister = (role: string) => (isSeniorRole({ role: role as Role }) ? "onboarding" : role === "caregiver" ? "caregiver-link" : "volunteer-register");

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const { update, go, announce } = useApp();
  const { signIn, user } = useAuth();
  const router = useRouter();
  const reg = mode === "register";
  const [role, setRole] = useState<RegisterRole>("blind_user");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. opened /login from a bookmark): go to the role's home.
  useEffect(() => {
    if (user && !busy) router.replace(href(roleHome(user)));
  }, [user, busy, router]);

  const fail = (msg: string) => {
    setError(msg);
    announce(msg);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") || "").trim();
    const password = String(fd.get("password") || "");
    setError("");
    setBusy(true);
    try {
      if (reg) {
        const res = await authApi.register({ phoneNumber: phone, name: String(fd.get("name") || "").trim(), role, password });
        update({ phone, authMode: "register", otpSentTo: res.otpSentTo });
        go("otp");
        return;
      }
      const me = await signIn(await authApi.login(phone, password));
      go(roleHome(me));
    } catch (err) {
      // Registered but never verified: send a new code and continue on the OTP screen.
      if (!reg && err instanceof ApiError && err.code === "FORBIDDEN") {
        try {
          await authApi.resendOtp(phone);
          update({ phone, authMode: "register", otpSentTo: undefined });
          go("otp");
          return;
        } catch (resendErr) {
          return fail(authError(resendErr));
        }
      }
      fail(authError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>{reg ? "Buat akun Unstoppable" : "Selamat datang kembali"}</h1>
      <p>{reg ? "Pilih peran Anda, lalu verifikasi nomor telepon." : "Masuk untuk melanjutkan perjalanan Anda."}</p>
      <form className="stack" data-form="auth" onSubmit={onSubmit} aria-busy={busy}>
        <input type="hidden" name="mode" value={mode} />
        {reg ? (
          <TextField label="Nama lengkap" name="name" placeholder="Nama Anda" required inputProps={{ minLength: 2, maxLength: 100, autoComplete: "name" }} />
        ) : null}
        <TextField
          label="Nomor telepon"
          name="phone"
          placeholder="08xxxxxxxxxx"
          type="tel"
          required
          inputProps={{ pattern: "08[0-9]{8,11}", title: "Nomor diawali 08, 10–13 digit.", autoComplete: "tel" }}
        />
        <TextField
          label="Kata sandi"
          name="password"
          placeholder={reg ? "Minimal 8 karakter" : "Kata sandi Anda"}
          type="password"
          required
          inputProps={{ minLength: reg ? 8 : undefined, autoComplete: reg ? "new-password" : "current-password" }}
        />
        {reg ? (
          <fieldset className="role-fieldset">
            <legend>Saya mendaftar sebagai</legend>
            <div className="stack">
              {ROLE_CHOICES.map(([id, t, p, i]) => (
                <RoleCard
                  key={id}
                  type="button"
                  title={t}
                  text={p}
                  icon={i}
                  selected={role === id}
                  data-role={id}
                  onClick={() => setRole(id as RegisterRole)}
                />
              ))}
            </div>
            <p className="small">Verifikator tidak dapat didaftarkan sendiri; akun ini diberikan oleh tim layanan.</p>
          </fieldset>
        ) : null}
        <div className="inline-error" role="alert">
          {error}
        </div>
        <button className="btn primary full" type="submit" disabled={busy}>
          {reg ? (
            <>
              Kirim OTP <Icon name="send" />
            </>
          ) : (
            <>
              Masuk <Icon name="arrow-right" />
            </>
          )}
        </button>
      </form>
      <p className="mt-[18px] text-center text-[.8rem]">
        {reg ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
        <Link className="link" href={reg ? "/login" : "/register"}>
          {reg ? "Masuk" : "Daftar"}
        </Link>
      </p>
    </>
  );
}

export function OtpScreen() {
  const { state, update, go, toast, announce } = useApp();
  const { signIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const done = useRef(false);
  const phone = state.phone;

  // Opened directly (no number from /register or /login in this tab): start over.
  useEffect(() => {
    if (!phone && !done.current) router.replace("/register");
  }, [phone, router]);

  const fail = (msg: string) => {
    setError(msg);
    announce(msg);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!phone) return;
    const fd = new FormData(e.currentTarget);
    const code = [1, 2, 3, 4, 5, 6].map((i) => String(fd.get("otp" + i) || "")).join("");
    setError("");
    setBusy(true);
    try {
      const me = await signIn(await authApi.verifyOtp(phone, code));
      done.current = true;
      update({ phone: undefined, otpSentTo: undefined, authMode: undefined, onboard: 1 });
      go(afterRegister(me.role));
    } catch (err) {
      fail(authError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!phone) return;
    try {
      await authApi.resendOtp(phone);
      toast("Kode verifikasi baru telah dikirim.");
    } catch (err) {
      fail(authError(err));
    }
  };

  return (
    <>
      <h1>Masukkan kode verifikasi</h1>
      <p>
        Kami mengirim kode 6 digit ke <strong>{state.otpSentTo || "nomor telepon Anda"}</strong>. Kode berlaku 5 menit.
      </p>
      <form className="stack" data-form="otp" onSubmit={onSubmit} aria-busy={busy}>
        <div className="otp-inputs" role="group" aria-label="Enam digit kode OTP">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i - 1] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              autoComplete={i === 1 ? "one-time-code" : "off"}
              name={"otp" + i}
              aria-label={"Digit " + i}
              required
              onInput={(e) => {
                const t = e.currentTarget;
                t.value = t.value.replace(/\D/g, "");
                if (t.value) {
                  announce(`Digit ${i}: ${t.value}`);
                  inputs.current[i]?.focus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !e.currentTarget.value) inputs.current[i - 2]?.focus();
              }}
              onPaste={(e) => {
                const code = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (code.length > 1) {
                  e.preventDefault();
                  inputs.current.forEach((input, n) => input && (input.value = code[n] || ""));
                  inputs.current[Math.min(code.length, 6) - 1]?.focus();
                  announce(
                    "Kode ditempel. " +
                      code
                        .split("")
                        .map((d, n) => "Digit " + (n + 1) + ": " + d)
                        .join(", "),
                  );
                }
              }}
            />
          ))}
        </div>
        <div id="otp-error" className="inline-error" role="alert">
          {error}
        </div>
        <button className="btn primary full" type="submit" disabled={busy}>
          Verifikasi
        </button>
        <Btn label="Kirim ulang kode" action="resend" kind="ghost full" onClick={() => void resend()} />
      </form>
    </>
  );
}

/** Roles are chosen at registration and cannot change afterwards (PATCH /users/me forbids `role`). */
export function RoleScreen() {
  const { status, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous" || status === "signed-out") router.replace("/register");
    else if (user) router.replace(href(roleHome(user)));
  }, [status, user, router]);
  return null;
}

const HEADERS = [
  "Selamat datang di Unstoppable",
  "Apa kondisi perjalanan Anda?",
  "Toleransi personal",
  "Izin aplikasi untuk pengalaman lebih baik",
  "Tautkan anggota keluarga (opsional)",
];

export function OnboardingScreen() {
  const { state, update, go, toast, announce, speak } = useApp();
  const { status, refreshUser } = useAuth();
  const router = useRouter();
  const n = state.onboard;
  const formRef = useRef<HTMLFormElement>(null);
  const [profileError, setProfileError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const stepped = useRef(false);

  useEffect(() => {
    if (status === "anonymous" || status === "signed-out") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (!stepped.current) return;
    document.querySelector<HTMLElement>(".auth-card h1")?.focus();
    announce(`Langkah ${n} dari 5`);
  }, [n, announce]);

  const next = async (skip = false) => {
    if (n === 2 && !state.profiles.length) {
      const msg = "Pilih minimal satu kondisi perjalanan.";
      setProfileError(msg);
      announce(msg);
      return;
    }
    const patch: Record<string, unknown> = {};
    const els = formRef.current?.elements as unknown as Record<string, HTMLInputElement | undefined> | undefined;
    if (!skip && els) {
      for (const k of ["stairs", "slope", "contactName", "contactPhone", "sharing"]) if (els[k]) patch[k] = els[k]!.value;
    }
    if (n === 3) {
      // Conditions + personal tolerance go to the server; "Lewati" saves the conditions without tolerance.
      setSaveError("");
      setSaving(true);
      try {
        await putAccessibility(accessibilitySelection(state.profiles, skip ? "" : String(patch.stairs ?? ""), skip ? "" : String(patch.slope ?? "")));
        await refreshUser();
      } catch (e) {
        const msg = errorMessage(e);
        setSaveError(msg);
        announce(msg);
        return;
      } finally {
        setSaving(false);
      }
      delete patch.stairs;
      delete patch.slope;
    }
    if (n >= 5) {
      // Family link goes to the server only when the senior ticks "Tautkan anggota keluarga".
      const els5 = formRef.current?.elements as unknown as Record<string, HTMLInputElement | undefined> | undefined;
      const phone = String(patch.contactPhone ?? "").trim();
      if (!skip && els5?.linkKeluarga?.checked && phone) {
        setSaveError("");
        setSaving(true);
        try {
          await addCaregiver(phone, String(patch.sharing || "sos_only") as Sharing);
          await refreshUser();
        } catch (e) {
          const msg = errorMessage(e);
          setSaveError(msg);
          announce(msg);
          return;
        } finally {
          setSaving(false);
        }
      }
      delete patch.contactName;
      delete patch.contactPhone;
      delete patch.sharing;
      update(patch);
      go("home");
      toast("Profil Anda sudah tersimpan. Selamat datang!");
    } else {
      stepped.current = true;
      update({ ...patch, onboard: n + 1 });
    }
  };

  const onPermission = (kind: "location" | "voice", e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.currentTarget;
    if (kind === "location") {
      update({ permissionLocation: t.checked });
      if (t.checked) {
        if (navigator.geolocation)
          navigator.geolocation.getCurrentPosition(
            () => toast("Izin lokasi tersedia. Titik awal dapat digunakan pada browser ini."),
            () => {
              update({ permissionLocation: false });
              toast("Lokasi tidak tersedia. Anda tetap dapat melanjutkan.");
            },
            { timeout: 7000 },
          );
        else toast("Geolokasi tidak tersedia di browser ini.");
      }
    } else {
      update({ permissionVoice: t.checked });
      toast("Pilihan suara aktif. Tekan tombol mikrofon untuk mulai mendengarkan setelah izin diberikan.");
    }
  };

  let body: React.ReactNode = null;
  if (n === 1)
    body = (
      <>
        <p className="text-center">Perjalanan yang bisa dipastikan sebelum berangkat.</p>
        <img className="onboard-art soft-art" src={IMAGES.cityWalk} alt="Lansia berjalan mandiri dengan tongkat jalan biasa" />
        <Btn label="Mulai" action="onboard-next" kind="primary full" onClick={() => void next()} />
        <Btn
          label="Dengarkan penjelasan"
          action="onboard-listen"
          kind="full"
          icon="volume-2"
          onClick={() =>
            speak(
              "Selamat datang di Unstoppable. Perjalanan yang bisa dipastikan sebelum berangkat. Tekan Mulai untuk memilih kondisi perjalanan.",
            )
          }
        />
      </>
    );
  if (n === 2)
    body = (
      <>
        <p className="mb-[16px] text-center">Pilih kondisi yang sesuai. Mengubah kondisi akan menghitung ulang rute.</p>
        <ProfileChoices />
        <div id="profile-error" role="alert" className="inline-error">
          {profileError}
        </div>
      </>
    );
  if (n === 3)
    body = (
      <>
        <p>Langkah ini opsional. Anda dapat mengubahnya kapan saja.</p>
        <SelectField
          label="Berapa anak tangga yang masih sanggup Anda lalui?"
          name="stairs"
          options={["0", "1–3", "4–8", "Lebih dari 8"]}
          value={state.stairs}
        />
        <SelectField
          label="Seberapa curam jalur yang masih nyaman?"
          name="slope"
          options={["Landai", "Sedang", "Curam"]}
          value={state.slope}
        />
        <div role="alert" className="inline-error">
          {saveError}
        </div>
      </>
    );
  if (n === 4)
    body = (
      <>
        <div className="onboard-permission">
          <div className="row">
            <Circle icon="map-pin" />
            <strong className="fit">Akses lokasi</strong>
            <input
              className="switch"
              type="checkbox"
              data-permission="location"
              aria-label="Izinkan lokasi"
              checked={state.permissionLocation}
              onChange={(e) => onPermission("location", e)}
            />
          </div>
          <p>
            Lokasi membantu menentukan titik awal rute. Izin browser baru diminta saat Anda mengaktifkannya. Penolakan tidak menghalangi
            penggunaan aplikasi.
          </p>
        </div>
        <div className="onboard-permission">
          <div className="row">
            <Circle icon="mic" />
            <strong className="fit">Akses suara / mikrofon</strong>
            <input
              className="switch"
              type="checkbox"
              data-permission="voice"
              aria-label="Izinkan fitur suara"
              checked={state.permissionVoice}
              onChange={(e) => onPermission("voice", e)}
            />
          </div>
          <p>
            Pengenalan ucapan memerlukan izin mikrofon. Audio dapat diproses layanan browser. Anda dapat berhenti kapan saja atau tetap
            mengetik tujuan.
          </p>
        </div>
      </>
    );
  if (n === 5)
    body = (
      <>
        <p>
          Opsional. Tautkan anggota keluarga agar dapat melihat perjalanan sesuai izin Anda. Anda dapat melewati langkah ini. Nomor
          tersebut harus sudah terdaftar sebagai akun Keluarga di Unstoppable.
        </p>
        <TextField label="Nama" name="contactName" value={state.contactName} placeholder="Nama kontak" />
        <TextField label="Nomor telepon" name="contactPhone" value={state.contactPhone} placeholder="08xxxxxxxxxx" type="tel" />
        <label className="check">
          <input type="checkbox" name="linkKeluarga" />
          Tautkan anggota keluarga
        </label>
        <SelectField
          label="Mode berbagi lokasi"
          name="sharing"
          options={SHARING_OPTIONS.map(([v, t]) => [v, t] as [string, string])}
          value={state.sharing as Sharing}
        />
        <p>{SHARING_NOTE}</p>
        <div role="alert" className="inline-error">
          {saveError}
        </div>
      </>
    );

  return (
    <>
      <div className="step-header" aria-label={`Langkah ${n} dari 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= n ? "done" : ""}></span>
        ))}
      </div>
      <h1>{HEADERS[n - 1]}</h1>
      <form
        className="stack"
        data-form="onboarding"
        ref={formRef}
        key={n}
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
        aria-busy={saving}
      >
        {body}
        {n > 1 ? (
          <div className="auth-actions">
            <Btn
              label={n > 2 ? "Lewati" : "Kembali"}
              action={n > 2 ? "onboard-skip" : "onboard-back"}
              kind="sm"
              onClick={() => (n > 2 ? void next(true) : update({ onboard: Math.max(1, n - 1) }))}
            />
            <div className="dots">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i === n ? "active" : ""}></span>
              ))}
            </div>
            <button type="submit" className="btn primary" disabled={saving}>
              {n === 5 ? "Selesai" : "Lanjut"} <Icon name="arrow-right" />
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
