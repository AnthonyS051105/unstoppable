// Helper bentuk response — bungkus payload sesuai amplop di docs/API_CONTRACT.md §1.1.
import type { Response } from "express";

export function ok<T>(res: Response, data: T) {
  return res.status(200).json({ success: true, data });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ success: true, data });
}

export function noContent(res: Response) {
  return res.status(204).send();
}
