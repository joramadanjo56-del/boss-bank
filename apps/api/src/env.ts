import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), ".env") });

const port = Number(process.env.API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT must be a valid TCP port");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET ?? "",
};

if (env.nodeEnv === "production" && env.sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}