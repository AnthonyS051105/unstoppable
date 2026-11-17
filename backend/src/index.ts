import express from 'express';
import cors from 'cors';
import helmet from "helmet"
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import sosRoutes from "./modules/sos/sos.routes.js";
import sessionRoutes from "./modules/sessions/sessions.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import {
  accessibilityProfilesRouter,
  userAccessibilityRouter,
} from "./modules/accessibility-profiles/accessibility-profiles.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { volunteersRouter } from "./modules/volunteers/volunteers.routes.js";
import { companionsRouter } from "./modules/companions/companions.routes.js";
import { tripsRouter } from "./modules/trips/trips.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { buildingsRouter } from "./modules/buildings/buildings.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import graphRoutes from "./modules/graph/graph.routes.js";
import { apiLimiter } from './middleware/rate-limit.js';
import verificationRoutes from "./modules/verification/verification.routes.js";
import aiPlannerRoutes from "./modules/ai-planner/ai-planner.routes.js";
import routesRouter from "./modules/routes/routes.routes.js";
import narrationRoutes from "./modules/narration/narration.routes.js";
import speechRoutes from "./modules/speech/speech.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import geocodeRouter from "./modules/geocode/geocode.routes.js";
import notificationsRouter from "./modules/notifications/notifications.routes.js";
import pushRouter from "./modules/notifications/push.routes.js";
import communitiesRouter from "./modules/communities/communities.routes.js";

import { registerCronJobs } from "./jobs/cron.js";
import { registerSocketHandlers } from "./realtime/index.js";

dotenv.config();

const app = express();
// Railway terminates TLS behind one proxy hop; needed for correct client IP in rate limiting.
app.set("trust proxy", 1);
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  },
});

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use("/api", apiLimiter);
app.use("/api/sos", sosRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", accessibilityProfilesRouter);   // GET /api/profiles
app.use("/api/users", usersRouter);             // GET/PATCH /me, /me/caregivers, /me/dependents
app.use("/api/users", userAccessibilityRouter); // GET|PUT /api/users/me/accessibility
app.use("/api/volunteers", volunteersRouter);
app.use("/api/companions", companionsRouter);
app.use("/api/trips", tripsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/buildings", buildingsRouter);
app.use("/api/graph", graphRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/ai-planner", aiPlannerRoutes);
app.use("/api/routes", routesRouter);
app.use("/api/narration", narrationRoutes);
app.use("/api/speech", speechRoutes);
app.use("/api/geocode", geocodeRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/push", pushRouter);
app.use("/api/communities", communitiesRouter);

app.use("/health", healthRoutes); // di luar /api → lolos apiLimiter (wajar untuk health)

app.use(errorHandler); // WAJIB terakhir (SDD §1.3)

registerSocketHandlers(io);
registerCronJobs();

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
