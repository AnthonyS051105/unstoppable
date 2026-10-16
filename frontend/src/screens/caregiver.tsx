"use client";

import { AppMap } from "@/components/map/AppMap";
import { MapStage } from "@/components/map/MapStage";
import { FamilyTimeline, Heading, RouteSummary } from "@/components/shared";
import { Avatar, Badge, Btn, EmptyState, Icon, LinkBtn, TextField } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { isSeniorRole } from "@/lib/access";
import { STEPS } from "@/lib/data";
import { canMonitor, type Sharing } from "@/lib/demo-state";

export function CaregiverScreen() {
  const { state, toast } = useApp();
  const monitor = canMonitor(state);
  return (
    <div className="content-page">
      <Heading
        title="Keluarga"
        subtitle="Lokasi hanya ditampilkan sesuai izin pengguna."
        back=""
        actions={<LinkBtn label="Kelola tautan" route="caregiver-link" icon="link" />}
      />
      <div className="grid-2">
        <section className="card stack">
          <div className="profile-card">
            <Avatar name={state.name} big />
            <div>
              <h2>{state.name}</h2>
              <p>
                {state.sharing === "sos_only"
                  ? "Lokasi hanya dibagikan saat darurat"
                  : state.activeTrip
                    ? "Sedang dalam perjalanan (demo)"
                    : "Tidak ada perjalanan aktif"}
              </p>
            </div>
          </div>
          <Badge
            label={
              state.sharing === "sos_only"
                ? "Berbagi saat SOS"
                : state.sharing === "trip_only"
                  ? "Berbagi selama perjalanan"
                  : "Selalu berbagi"
            }
            kind="blue"
            icon="shield-check"
          />
          {!monitor ? (
            <div className="notice">
              {state.sharing === "sos_only"
                ? "Lokasi hanya dibagikan saat darurat."
                : !state.contactName
                  ? "Keluarga belum ditautkan."
                  : "Tidak ada perjalanan aktif."}{" "}
              Posisi tidak dibagikan saat ini.
            </div>
          ) : (
            <LinkBtn label="Pantau Perjalanan" route="monitor" kind="primary full" icon="map-pin" />
          )}
        </section>
        <section className="card stack">
          <h3>Kontak dan persetujuan</h3>
          <p>Kontak tertaut: {state.contactName || "Belum ada"}</p>
          <p>Berbagi lokasi dapat diubah atau dihentikan oleh pengguna kapan saja.</p>
          <LinkBtn label="Pengaturan privasi" route="privacy" />
          <div className="warning red">
            <Icon name="siren" />
            Contoh notifikasi SOS (simulasi): Budi membutuhkan bantuan di Jl. Kolonel Sugiyono.{" "}
            <Btn label="Saya sudah tahu" action="ack-sos" kind="sm" onClick={() => toast("Konfirmasi keluarga tercatat dalam simulasi.")} />
          </div>
        </section>
      </div>
      <FamilyTimeline />
    </div>
  );
}

export function MonitorScreen() {
  const { state, toast } = useApp();
  if (!canMonitor(state))
    return (
      <div className="content-page narrow">
        <Heading title="Pantau perjalanan" back="caregiver" />
        <section className="card">
          <EmptyState
            title={state.sharing === "sos_only" ? "Lokasi hanya dibagikan saat darurat" : "Lokasi tidak dibagikan saat ini"}
            text={
              state.sharing === "sos_only"
                ? "Anggota keluarga memilih berbagi hanya saat darurat. Lokasi tidak dibagikan saat ini."
                : "Tidak ada perjalanan aktif atau anggota keluarga belum ditautkan."
            }
            label="Kembali ke keluarga"
            route="caregiver"
          />
          <FamilyTimeline />
        </section>
      </div>
    );
  return (
    <MapStage
      id="monitor-sheet"
      ariaLabel="Pantauan perjalanan"
      skipLabel="Lewati ke rincian pantauan"
      name="pantauan"
      map={
        <AppMap
          filters={false}
          label="Peta pemantauan"
          summary="Peta skematis lingkungan sekitar, data demonstrasi. Posisi tetap; tidak ada pelacakan GPS pihak lain."
        />
      }
    >
      <div className="peek-keep peek-sub">
        <Heading title={"Pantau perjalanan " + state.name} subtitle="Pembaruan terakhir: baru saja (simulasi)" back="caregiver" />
      </div>
      <section className="card stack">
        <h2>{state.destination}</h2>
        <RouteSummary />
        <Badge
          label={state.sharing === "trip_only" ? "Lokasi selama perjalanan" : "Berbagi sesuai persetujuan"}
          kind="blue"
          icon="shield-check"
        />
        <h3>Langkah saat ini</h3>
        <p>{STEPS[state.step][0]}</p>
        <FamilyTimeline />
        <Btn label="Saya sudah tahu" action="ack-sos" icon="check" onClick={() => toast("Konfirmasi keluarga tercatat dalam simulasi.")} />
        <LinkBtn label="Pengaturan berbagi" route="privacy" />
      </section>
    </MapStage>
  );
}

export function CaregiverLinkScreen() {
  const { state, update, go, toast, confirmModal } = useApp();
  const senior = isSeniorRole(state);
  return (
    <div className="content-page narrow">
      <Heading
        title="Tautkan anggota keluarga"
        subtitle="Anda menentukan kapan lokasi boleh dibagikan."
        back={senior ? "home" : "caregiver"}
      />
      <form
        className="card stack"
        data-form="caregiver"
        key={state.contactName + "|" + state.contactPhone}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          update({
            contactName: String(fd.get("contactName") || ""),
            contactPhone: String(fd.get("contactPhone") || ""),
            sharing: String(fd.get("sharing") || "") as Sharing,
          });
          go(senior ? "home" : "caregiver");
          toast("Preferensi keluarga demo tersimpan.");
        }}
      >
        <TextField label="Nama anggota keluarga" name="contactName" value={state.contactName} placeholder="Nama anggota keluarga" />
        <TextField label="Nomor telepon" name="contactPhone" value={state.contactPhone} placeholder="08xxxxxxxxxx" type="tel" />
        <fieldset className="sharing-options">
          <legend>Kapan lokasi boleh dibagikan?</legend>
          {(
            [
              ["trip_only", "Selama perjalanan", "Keluarga dapat melihat lokasi sejak berangkat sampai perjalanan selesai."],
              ["sos_only", "Hanya saat darurat", "Keluarga hanya melihat lokasi ketika SOS aktif."],
              [
                "always",
                "Selalu, dengan persetujuan",
                "Keluarga dapat melihat lokasi meski tidak sedang bepergian. Anda dapat menghentikannya kapan saja.",
              ],
            ] as const
          ).map(([v, t, d]) => (
            <label key={v} className="choice">
              <input type="radio" name="sharing" value={v} defaultChecked={state.sharing === v} />
              <span>
                <strong>{t}</strong>
                <small>{d}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button className="btn primary" type="submit">
          Simpan tautan demo
        </button>
        <Btn
          label="Putuskan tautan keluarga"
          action="unlink-caregiver"
          kind="danger"
          onClick={() =>
            confirmModal(
              "Putuskan tautan keluarga",
              `Putuskan tautan ${state.contactName || "anggota keluarga"}? Keluarga tidak lagi mendapat informasi perjalanan dan SOS dari akun Anda.`,
              () => {
                update({ contactName: "", contactPhone: "" });
                toast("Tautan keluarga demo diputuskan.");
              },
            )
          }
        />
      </form>
    </div>
  );
}
