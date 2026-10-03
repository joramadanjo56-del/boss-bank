import { env } from "./env.js";
import { prisma } from "@boss-bank/db";
import { createApp } from "./app.js";

const app = createApp(prisma, { webOrigin: env.webOrigin, nodeEnv: env.nodeEnv });
const server = app.listen(env.port, () => {
  console.log(`Boss Bank API listening on http://localhost:${env.port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
