"use client";

import { IMAGES } from "@/assets/images";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProfileChoices } from "@/components/shared";
import { Btn, Circle, Icon, SelectField, TextField } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { demoRolePatch, isSeniorRole, newRolePatch, roleHome } from "@/lib/access";
import { DEMO_ACCOUNTS, ROLE_CHOICES, ROLE_LABEL, ROLE_PAGE_CHOICES } from "@/lib/data";
import type { Sharing } from "@/lib/demo-state";

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

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const { state, update, go } = useApp();
  const reg = mode === "register";
  const account = state.loginAccount || "user";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update({
      ...(reg ? { name: String(fd.get("name") || "") } : {}),
      phone: String(fd.get("phone") || ""),
      authMode: mode,
    });
    go("otp");
  };

  return (
    <>
      <h1>{reg ? "Buat akun Unstoppable" : "Selamat datang kembali"}</h1>
      <p>{reg ? "Pilih peran Anda, lalu verifikasi nomor telepon." : "Masuk untuk melanjutkan perjalanan Anda."}</p>
      <form className="stack" data-form="auth" onSubmit={onSubmit}>
        <input type="hidden" name="mode" value={mode} />
        {reg ? <TextField label="Nama lengkap" name="name" placeholder="Nama Anda" required /> : null}
        <TextField label="Nomor telepon" name="phone" placeholder="08xxxxxxxxxx" type="tel" required />
        <fieldset className="role-fieldset">
          <legend>{reg ? "Saya mendaftar sebagai" : "Masuk sebagai (akun demo)"}</legend>
          <div className="stack">
            {reg
              ? ROLE_CHOICES.map(([id, t, p, i]) => (
                  <RoleCard
                    key={id}
                    type="button"
                    title={t}
                    text={p}
                    icon={i}
                    selected={state.role === id}
                    data-role={id}
                    onClick={() => update({ role: id })}
                  />
                ))
              : DEMO_ACCOUNTS.map(([id, t, p, i]) => (
                  <RoleCard
                    key={id}
                    type="button"
                    title={t}
                    text={p}
                    icon={i}
                    selected={account === id}
                    data-account={id}
                    onClick={() => update({ loginAccount: id })}
                  />
                ))}
          </div>
          {reg ? <p className="small">Verifikator tidak dapat didaftarkan sendiri; akun ini diberikan oleh tim layanan.</p> : null}
        </fieldset>
        <button className="btn primary full" type="submit">
          Kirim OTP <Icon name="send" />
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
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const finishAuth = () => {
    if (state.authMode === "login") {
      const patch = demoRolePatch(state.loginAccount || "user")!;
      update(patch);
      go(roleHome(patch));
      toast("Masuk sebagai " + ROLE_LABEL[patch.role] + " (akun demo)");
    } else if (state.authMode === "register") {
      const patch = newRolePatch(state);
      update({ ...patch, onboard: 1 });
      go(isSeniorRole(patch) ? "onboarding" : patch.role === "caregiver" ? "caregiver-link" : "volunteer-register");
    } else go("role");
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = [1, 2, 3, 4, 5, 6].map((i) => String(fd.get("otp" + i) || "")).join("");
    if (code !== "123456") {
      const msg = "Kode demo tidak cocok. Gunakan 123456.";
      setError(msg);
      announce(msg);
      return;
    }
    finishAuth();
  };

  return (
    <>
      <h1>Masukkan kode verifikasi</h1>
      <p>
        Kode demo: <strong>123456</strong>. Tidak ada SMS yang dikirim.
      </p>
      <form className="stack" data-form="otp" onSubmit={onSubmit}>
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
        <button className="btn primary full" type="submit">
          Verifikasi
        </button>
        <Btn
          label="Kirim ulang kode"
          action="resend"
          kind="ghost full"
          onClick={() => toast("Kode OTP demo tetap 123456. Tidak ada SMS yang dikirim.")}
        />
      </form>
    </>
  );
}

export function RoleScreen() {
  const { state, update, go } = useApp();
  return (
    <>
      <h1>Pilih peran Anda</h1>
      <p>Satu aplikasi untuk perjalanan yang saling mendukung.</p>
      <div className="stack">
        {ROLE_PAGE_CHOICES.map(([id, t, p, i]) => (
          <RoleCard key={id} title={t} text={p} icon={i} selected={state.role === id} data-role={id} onClick={() => update({ role: id })} />
        ))}
        <Btn
          label="Lanjut"
          action="role-next"
          kind="primary full"
          icon="arrow-right"
          onClick={() => {
            const patch = newRolePatch(state);
            update({ ...patch, onboard: 1 });
            go(isSeniorRole(patch) ? "onboarding" : patch.role === "caregiver" ? "caregiver-link" : "volunteer-register");
          }}
        />
      </div>
    </>
  );
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
  const n = state.onboard;
  const formRef = useRef<HTMLFormElement>(null);
  const [profileError, setProfileError] = useState("");
  const stepped = useRef(false);

  useEffect(() => {
    if (!stepped.current) return;
    document.querySelector<HTMLElement>(".auth-card h1")?.focus();
    announce(`Langkah ${n} dari 5`);
  }, [n, announce]);

  const next = (skip = false) => {
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
    if (n >= 5) {
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
        <Btn label="Mulai" action="onboard-next" kind="primary full" onClick={() => next()} />
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
        <p>Opsional. Tautkan anggota keluarga agar dapat melihat perjalanan sesuai izin Anda. Anda dapat melewati langkah ini.</p>
        <TextField label="Nama" name="contactName" value={state.contactName} placeholder="Nama kontak" />
        <TextField label="Nomor telepon" name="contactPhone" value={state.contactPhone} placeholder="08xxxxxxxxxx" type="tel" />
        <label className="check">
          <input type="checkbox" name="linkKeluarga" />
          Tautkan anggota keluarga
        </label>
        <SelectField
          label="Mode berbagi lokasi"
          name="sharing"
          options={[
            ["trip_only", "Hanya selama perjalanan"],
            ["sos_only", "Hanya saat darurat"],
            ["always", "Selalu, dengan persetujuan Anda"],
          ]}
          value={state.sharing as Sharing}
        />
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
          next();
        }}
      >
        {body}
        {n > 1 ? (
          <div className="auth-actions">
            <Btn
              label={n > 2 ? "Lewati" : "Kembali"}
              action={n > 2 ? "onboard-skip" : "onboard-back"}
              kind="sm"
              onClick={() => (n > 2 ? next(true) : update({ onboard: Math.max(1, n - 1) }))}
            />
            <div className="dots">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i === n ? "active" : ""}></span>
              ))}
            </div>
            <button type="submit" className="btn primary">
              {n === 5 ? "Selesai" : "Lanjut"} <Icon name="arrow-right" />
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
