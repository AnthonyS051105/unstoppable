import { Worker } from "bullmq";
import { redisConnection } from "../config/redis";

export const deadManSwitchWorker = new Worker(
  "dead-man-switch",
  async (job) => {
    console.log("processing job", job.id, job.data);
    // logic dead man's switch nanti di sini
  },
  { connection: redisConnection }
);
