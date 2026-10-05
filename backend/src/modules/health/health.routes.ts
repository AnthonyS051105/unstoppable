import { Router } from "express";
import { getHealth } from "./health.controller.js";

const router = Router();

// GET /health — public, unauthenticated, outside the /api rate limiter.
router.get("/", getHealth);

export default router;
