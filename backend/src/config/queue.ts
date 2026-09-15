import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export const deadManSwitchQueue = new Queue("dead-man-switch", {
  connection: redisConnection,
});
