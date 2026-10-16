import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <AppShell>
      <section className="card">
        <EmptyState
          title="Halaman tidak ditemukan"
          text="Alamat ini tidak tersedia. Kembali ke halaman utama untuk melanjutkan."
          label="Ke Beranda"
          route="home"
        />
      </section>
    </AppShell>
  );
}
