// Augmentasi tipe Express Request — dipakai middleware/auth.ts dan seluruh
// controller yang butuh req.user setelah autentikasi.
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
      requestId?: string;
    }
  }
}

export {};
