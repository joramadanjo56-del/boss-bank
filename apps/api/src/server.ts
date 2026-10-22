import { env } from "./env.js";
import { prisma } from "@boss-bank/db";
import { createApp } from "./app.js";

async function promoteAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;
  const result = await prisma.user.updateMany({
    where: { email },
    data: { role: "ADMIN" },
  });
  console.log(`ADMIN_EMAIL promotion: ${result.count} account(s) updated`);
}

await promoteAdmin().catch((error) => {
  console.error("Admin promotion failed", error);
});

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