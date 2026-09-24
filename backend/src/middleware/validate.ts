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
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
