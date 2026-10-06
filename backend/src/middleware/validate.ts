// Zod schema -> req.body/req.query tervalidasi & bertipe. Kegagalan parse
// dilempar sebagai ZodError, ditangkap error-handler.ts (SDD §3.4).
import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

interface ValidateSchemas {
  body?: ZodType;
  query?: ZodType;
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        // Express 5: req.query hanya getter, jadi ditimpa lewat defineProperty.
        Object.defineProperty(req, "query", {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
