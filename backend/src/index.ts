import express from 'express';
import cors from 'cors';
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
import { errorHandler } from "./middleware/error-handler.js";
import graphRoutes from "./modules/graph/graph.routes.js";

import "./jobs/dead-man-switch.job.js";
import { registerSocketHandlers } from "./realtime/index.js";


dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
});

app.use(cors());
app.use(express.json());

app.use("/api/sos", sosRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", accessibilityProfilesRouter);   // GET /api/profiles
app.use("/api/users", userAccessibilityRouter); // GET|PUT /api/users/me/accessibility
app.use("/api/graph", graphRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler); // WAJIB terakhir (SDD §1.3)

registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
