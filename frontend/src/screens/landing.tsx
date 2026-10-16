import { IMAGES } from "@/assets/images";
import Link from "next/link";
import { Brand, Circle, Icon, LinkBtn } from "@/components/ui";
import { VoiceButton } from "@/contexts/VoiceContext";
import { FamilyDemo, RouteStory, ScrollLinks, StickyStories } from "./landing-islands";

const FEATURES: [string, string, string][] = [
  ["shield-check", "Rute sesuai kondisi Anda", "cara-kerja"],
  ["map-pinned", "Data lapangan diperiksa langsung", "fitur"],
  ["users-round", "Pendampingan & jaringan relawan", "lp-support"],
  ["phone", "Fitur darurat SOS untuk keadaan kritis", "lp-support"],
];

const SUPPORT: [string, string, string, string][] = [
  [
    "clipboard-check",
    "Kenali kondisi jalur",
    "Lihat informasi ramp, tangga, permukaan, dan tanggal survei. Laporkan hambatan baru agar informasi jalur tetap berguna.",
    "report",
  ],
  [
    "handshake",
    "Pilih pendamping sendiri",
    "Sampaikan titik temu dan jenis bantuan. Relawan mengajukan diri; Anda menentukan siapa yang mendampingi.",
    "assistance",
  ],
  [
    "phone",
    "Bantuan saat darurat",
    "Tahan SOS selama 1,5 detik. Status penerima ditampilkan dengan jelas.",
    "sos",
  ],
];

const FAQ: [string, string][] = [
  [
    "Apakah rute setiap lansia sama?",
    "Tidak. Kondisi penglihatan, alat bantu, toleransi tangga, dan preferensi jalur dapat menghasilkan rute yang berbeda untuk tujuan yang sama.",
  ],
  [
    "Apakah keluarga selalu bisa melihat lokasi?",
    "Anda memilih mode berbagi. Lokasi dapat dibagikan selama perjalanan, hanya ketika SOS aktif, atau tidak dibagikan setelah tautan keluarga dilepas.",
  ],
  [
    "Apakah saya harus menggunakan suara?",
    "Tidak. Semua pencarian dan navigasi tetap dapat dilakukan dengan tombol, keyboard, dan teks. Mikrofon hanya aktif setelah Anda memulainya.",
  ],
  [
    "Apakah ini sudah layanan operasional?",
    "Ini prototipe demonstrasi. Peta, rute, relawan, dan pemberitahuan menggunakan data simulasi. SOS tidak mengirim permintaan bantuan sungguhan.",
  ],
];

const FOOTER: [string, [string, string][]][] = [
  [
    "Produk",
    [
      ["Cari rute", "search"],
      ["Peta sekitar", "home"],
      ["Minta Pendamping", "assistance"],
    ],
  ],
  [
    "Bersama",
    [
      ["Keluarga", "caregiver-link"],
      ["Menjadi relawan", "volunteer-register"],
      ["Komunitas", "communities"],
    ],
  ],
  [
    "Informasi",
    [
      ["Bantuan", "help"],
      ["Privasi & izin", "privacy"],
      ["Panduan suara", "voice-settings"],
    ],
  ],
];

const COMMANDS = ["Cari Puskesmas Mergangsan", "Buka beranda", "Ulangi petunjuk", "Buka pengaturan", "Berhenti mendengarkan"];

export function Landing() {
  return (
    <div className="landing landing-v3">
      <ScrollLinks />
      <StickyStories />
      <header className="landing-nav">
        <Brand />
        <nav aria-label="Navigasi landing">
          <a href="#tentang" data-scroll="tentang">
            Tentang
          </a>
          <a href="#cara-kerja" data-scroll="cara-kerja">
            Cara kerja
          </a>
          <a href="#fitur" data-scroll="fitur">
            Fitur
          </a>
        </nav>
        <div className="row">
          <LinkBtn label="Masuk" route="login" kind="ghost" />
          <LinkBtn label="Daftar" route="register" kind="primary" />
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="landing-copy">
            <h1>
              Mandiri melangkah.
              <br />
              <span className="accent">Keluarga tenang.</span>
            </h1>
            <p>
              Ke puskesmas, berbelanja, atau bertemu teman. Temukan rute yang sesuai kondisi Anda, dengan dukungan keluarga sepanjang
              perjalanan.
            </p>
            <div className="row">
              <Link href="/home" className="btn primary lp-hero-primary">
                Temukan rute Anda <Icon name="arrow-right" />
              </Link>
              <a className="btn lp-secondary" href="#cara-kerja" data-scroll="cara-kerja">
                <Icon name="circle-play" />
                Lihat cara kerja
              </a>
            </div>
          </div>
          <figure className="landing-art hero-art">
            <img
              src={IMAGES.hero}
              alt="Lansia berambut perak memakai kardigan kuning dan rok batik, berjalan dengan tongkat biasa di depan puskesmas di Yogyakarta"
              fetchPriority="high"
            />
          </figure>
        </section>
        <section className="lp-feature-strip" aria-label="Dukungan dalam perjalanan">
          {FEATURES.map(([i, t, target]) => (
            <a key={t} href={`#${target}`} data-scroll={target}>
              <Icon name={i} />
              <strong>{t}</strong>
            </a>
          ))}
        </section>
        <section className="lp-intro lp-container" id="tentang">
          <div>
            <span className="lp-eyebrow">SETIAP PERJALANAN PUNYA CERITA</span>
            <h2>
              Aktivitas Anda.
              <br />
              Pilihan jalan Anda.
            </h2>
          </div>
          <div>
            <p>
              Menjadi lansia tidak berarti memiliki kebutuhan yang sama. Satu anak tangga bisa menghalangi pengguna kursi roda. Persimpangan
              tanpa ubin pemandu bisa menyulitkan lansia dengan penglihatan menurun.
            </p>
            <p>
              Unstoppable membantu Anda mempertimbangkan kondisi jalur sebelum berangkat, memilih pendamping sendiri, dan membagikan
              perjalanan sesuai izin Anda.
            </p>
          </div>
        </section>
        <div className="lp-story-stack lp-container" id="cara-kerja">
          <RouteStory />
          <section className="lp-story lp-family-story">
            <div className="lp-story-copy">
              <span className="lp-eyebrow">02. TETAP TERHUBUNG</span>
              <h2>
                Anda tetap
                <br />
                memegang kendali.
              </h2>
              <p>
                Keluarga ikut memastikan perjalanan, dengan izin yang Anda tentukan. Pilih kapan lokasi dibagikan dan ubah pilihan Anda
                kapan saja.
              </p>
              <LinkBtn label="Kenali pemantauan keluarga" route="caregiver-link" kind="lp-story-action" icon="users-round" />
            </div>
            <FamilyDemo />
          </section>
          <section className="lp-story lp-voice-story">
            <div className="lp-story-copy">
              <span className="lp-eyebrow">03. GUNAKAN SUARA</span>
              <h2>
                Cukup ucapkan
                <br />
                tujuan Anda.
              </h2>
              <p>
                Cari tujuan, buka halaman, dan ulangi panduan perjalanan melalui perintah suara. Anda bisa mengaktifkan dan menghentikan
                mikrofon sendiri.
              </p>
              <VoiceButton mode="control" className="btn primary">
                <Icon name="mic" />
                Coba kendali suara
              </VoiceButton>
              <p className="small">Perlu izin mikrofon dan browser yang mendukung. Suara dapat diproses oleh layanan browser.</p>
            </div>
            <div className="lp-command-examples">
              <span className="lp-voice-orb">
                <Icon name="audio-lines" />
              </span>
              <h3>Beberapa hal yang bisa Anda ucapkan</h3>
              <div>
                {COMMANDS.map((t) => (
                  <span key={t}>{`“${t}”`}</span>
                ))}
              </div>
              <Link href="/voice-settings" className="lp-text-link">
                <Icon name="book-open" />
                Lihat panduan suara
              </Link>
            </div>
          </section>
        </div>
        <section className="lp-container lp-support" id="fitur">
          <span className="lp-eyebrow">DUKUNGAN SAAT DIBUTUHKAN</span>
          <h2>Lebih siap, sebelum melangkah.</h2>
          <div className="lp-support-grid" id="lp-support">
            {SUPPORT.map(([i, t, p, r]) => (
              <article key={t}>
                <Circle icon={i} />
                <h3>{t}</h3>
                <p>{p}</p>
                <LinkBtn label="Lihat fitur" route={r} kind="lp-text-link" />
              </article>
            ))}
          </div>
        </section>
        <section className="lp-container lp-faq">
          <span className="lp-eyebrow">PERTANYAAN ANDA</span>
          <h2>Sebelum mulai.</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Icon name="plus" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="lp-cta">
          <div>
            <span className="lp-eyebrow">SAMPAI DENGAN SELAMAT</span>
            <h2>Mulai dari perjalanan terdekat.</h2>
            <p>Ke layanan kesehatan dan aktivitas harian, dengan rute yang sesuai kondisi Anda.</p>
            <LinkBtn label="Coba aplikasi" route="home" kind="lp-dark" icon="map" />
          </div>
        </section>
      </main>
      <footer className="landing-footer lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Brand />
            <p>
              Rute yang sesuai kondisi Anda.
              <br />
              Dukungan keluarga sepanjang perjalanan.
            </p>
            <a href="#tentang" data-scroll="tentang" className="lp-text-link">
              Kenali Unstoppable
            </a>
          </div>
          {FOOTER.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h3>{title}</h3>
              {links.map(([t, r]) => (
                <Link key={r} href={`/${r}`}>
                  {t}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="lp-footer-bottom">
          <span>{`© ${new Date().getFullYear()} Unstoppable`}</span>
        </div>
      </footer>
    </div>
  );
}
