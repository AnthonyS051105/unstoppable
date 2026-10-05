-- Task 16g -- cegah race condition saat dua requester memilih relawan yang
-- SAMA untuk slot waktu yang bentrok. Penguncian baris (SELECT ... FOR UPDATE)
-- di companions.service.ts hanya menyerialkan transaksi pada request yang
-- SAMA; dua request BERBEDA yang memilih relawan sama bisa lolos cek bentrok
-- (hasScheduleClash) secara bersamaan karena membaca state sebelum lawan
-- commit. Constraint basis data ini adalah jaring pengaman terakhir yang
-- benar-benar atomic: PostgreSQL menolak baris kedua.
--
-- "Bentrok" = rentang WAKTU beririsan, bukan nilai tunggal sama -> perlu
-- EXCLUDE + GiST (btree_gist untuk kolom uuid), bukan UNIQUE biasa.
--
-- CATATAN IMMUTABILITY: ekspresi dalam index GiST WAJIB immutable. Aritmetika
-- `scheduled_start + interval` pada timestamptz BUKAN immutable (bergantung
-- timezone), begitu juga make_interval() dan generated column yang memakainya
-- (gagal 42P17). Solusinya: simpan `scheduled_end` sebagai kolom nyata yang
-- diisi aplikasi saat insert (companions.service.ts), lalu range dibangun dari
-- dua kolom timestamptz polos -- tstzrange(scheduled_start, scheduled_end)
-- bersifat immutable. Durasi default 60 menit = DEFAULT_DURATION_MIN
-- (companions.types.ts); jaga tetap selaras.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Kolom akhir jadwal (nullable: diisi app untuk baris baru; backfill di bawah).
ALTER TABLE companion_requests
  ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;

-- 2. Backfill baris existing dari scheduled_start + durasi (default 60 menit).
UPDATE companion_requests
  SET scheduled_end = scheduled_start + (COALESCE(estimated_duration_min, 60) * interval '1 minute')
  WHERE scheduled_end IS NULL;

-- 3. EXCLUDE: relawan terkonfirmasi tak boleh punya dua slot beririsan.
--    Partial (WHERE) -> hanya baris confirmed dengan relawan terisi yang dibatasi.
ALTER TABLE companion_requests
  DROP CONSTRAINT IF EXISTS excl_confirmed_volunteer_no_overlap;

ALTER TABLE companion_requests
  ADD CONSTRAINT excl_confirmed_volunteer_no_overlap
  EXCLUDE USING gist (
    selected_volunteer_id WITH =,
    tstzrange(scheduled_start, scheduled_end) WITH &&
  )
  WHERE (status = 'confirmed' AND selected_volunteer_id IS NOT NULL);
