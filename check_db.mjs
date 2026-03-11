import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const t = await prisma.$queryRawUnsafe(`SELECT id, key, name FROM tokens ORDER BY id DESC LIMIT 5`);
  console.log(t);
  await prisma.$disconnect();
}
main()
