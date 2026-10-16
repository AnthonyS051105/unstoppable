"use client";

import { AppMap } from "@/components/map/AppMap";
import { Heading } from "@/components/shared";
import { SosHoldButton } from "@/components/shell/SosHoldButton";
import { Avatar, Badge, Btn, Circle, Icon } from "@/components/ui";
import { useApp } from "@/hooks/useApp";
import { VOLUNTEERS } from "@/lib/data";

export function SosScreen() {
  const { state, update } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="SOS Darurat" subtitle="Tidak ada pesan atau panggilan yang dikirim oleh prototipe ini." back="home" />
      <section className="card empty">
        <Circle icon="phone" kind="red" />
        <h2>Butuh bantuan segera?</h2>
        <p>Tahan tombol SOS selama 1,5 detik. Lepaskan sebelum selesai untuk membatalkan.</p>
        <SosHoldButton />
        <p className="small mt-[15px]">Dapat digunakan dengan mouse, sentuhan, atau tahan tombol Space/Enter.</p>
        <label className="check justify-center">
          <input
            type="checkbox"
            data-no-responder=""
            checked={state.noResponder}
            onChange={(e) => update({ noResponder: e.target.checked })}
          />
          Simulasikan tidak ada penerima
        </label>
      </section>
    </div>
  );
}

export function SosActiveScreen() {
  const { update, go, toast, confirmModal } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="SOS aktif" subtitle="Simulasi permintaan bantuan." back="sos" />
      <section className="card stack">
        <div className="warning red">
          <Icon name="siren" />
          Bantuan diminta. Relawan terdekat dihubungi dalam simulasi.
        </div>
        <h2>Responden di sekitar Anda</h2>
        <ul className="list">
          {VOLUNTEERS.slice(0, 2).map((v, i) => (
            <li key={v.name} className="list-item">
              <Avatar name={v.name} />
              <div>
                <strong>{v.name}</strong>
                <small>
                  {v.distance}, ETA {i + 3} menit
                </small>
              </div>
              <Badge label={i ? "Dihubungi" : "Menuju Anda"} kind={i ? "yellow" : "green"} />
            </li>
          ))}
        </ul>
        <AppMap filters={false} />
        <Btn
          label="Batalkan SOS"
          action="cancel-sos"
          kind="danger full"
          onClick={() =>
            confirmModal(
              "Batalkan SOS",
              "Batalkan permintaan bantuan? Pada layanan produksi, responden akan diberi tahu bahwa bantuan tidak diperlukan lagi.",
              () => {
                update({ sosActive: false });
                go("home");
                toast("SOS simulasi dibatalkan.");
              },
            )
          }
        />
      </section>
    </div>
  );
}

export function SosEmptyScreen() {
  const { update, go } = useApp();
  return (
    <div className="content-page narrow">
      <Heading title="Belum ada penerima" subtitle="SOS tidak boleh gagal tanpa penjelasan." back="sos" />
      <section className="card empty">
        <Circle icon="phone" kind="red" />
        <h2>Belum ada relawan yang bisa dihubungi di sekitar Anda.</h2>
        <p>Gunakan kontak darurat yang sudah Anda atur atau nomor darurat yang ditampilkan.</p>
        <a className="btn danger full min-h-[64px] text-[1.45rem]" href="tel:112">
          <Icon name="phone" />
          Hubungi 112
        </a>
        <p className="small mt-[13px]">Menekan tombol akan membuka aplikasi telepon. Demo tidak melakukan panggilan otomatis.</p>
        <Btn
          label="Coba lagi"
          action="retry-sos"
          kind="primary full"
          onClick={() => {
            update({ noResponder: false, sosActive: true });
            go("sos-active");
          }}
        />
      </section>
    </div>
  );
}
