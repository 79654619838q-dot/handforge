// Разовая утилита: выдать роль ADMIN существующему аккаунту.
// Использование: node scripts/make-admin.mjs <username>
import { PrismaClient } from "@prisma/client";

const username = process.argv[2];
if (!username) {
  console.error("Использование: node scripts/make-admin.mjs <username>");
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.update({
  where: { username },
  data: { role: "ADMIN" },
});
console.log(`${user.username} теперь ADMIN`);
await prisma.$disconnect();
