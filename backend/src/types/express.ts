// Augmentasi tipe Express: `req.user` diisi oleh middleware requireAuth
// (src/middleware/auth.ts) setelah verifikasi JWT. Dideklarasikan di sini
// supaya seluruh controller bertipe benar tanpa cast berulang.
//
// Catatan: file ini sengaja TIDAK meng-import apa pun dari "express" di scope
// modul (agar tetap sebagai ambient augmentation global). Bentuk payload
// mengikuti AccessTokenPayload (src/modules/auth/token.ts): { sub, role }.

import "express";

declare global {
  namespace Express {
    interface AuthenticatedUser {
      /** userId (UUID) dari klaim `sub` JWT. */
      id: string;
      /** peran pengguna dari klaim `role` JWT. */
      role: string;
    }

    interface Request {
      /**
       * Terisi oleh middleware `requireAuth`. Opsional karena rute publik
       * tidak melewati middleware itu; controller yang di belakang
       * `requireAuth` boleh memakai `req.user!`.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
