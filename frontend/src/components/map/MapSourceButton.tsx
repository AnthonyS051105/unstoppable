"use client";

import { Icon } from "@/components/ui";
import { useUi } from "@/contexts/UiContext";

export function MapSourceButton({ className = "" }: { className?: string }) {
  const { modal } = useUi();
  return (
    <button
      type="button"
      className={`map-info ${className}`.trim()}
      aria-label="Sumber peta"
      onClick={() =>
        modal({
          title: "Sumber peta",
          confirmLabel: "Tutup",
          hideCancel: true,
          body: (
            <>
              <p>
                Peta dasar ©{" "}
                <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                  kontributor OpenStreetMap
                </a>
                , tersedia di bawah lisensi Open Database License (ODbL).
              </p>
              <p>Rute, titik layanan, dan graf jalur pada peta ini masih data demonstrasi, belum hasil survei lapangan.</p>
            </>
          ),
        })
      }
    >
      <Icon name="info" />
    </button>
  );
}
