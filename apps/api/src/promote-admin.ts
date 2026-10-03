import { prisma } from "@boss-bank/db";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:promote -- email@example.com");
  process.exitCode = 2;
} else {
  try {
    const user = await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "admin.role_promoted", targetType: "user", targetId: user.id } });
    console.log(`Promoted ${user.email} to admin.`);
  } catch {
    console.error("Account not found. Register the account first.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}