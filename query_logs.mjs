import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  try {
    const logs = await prisma.$queryRawUnsafe(`SELECT * FROM logs WHERE user_id = 5 AND type = 1 ORDER BY id DESC LIMIT 5`);
    console.log("Consume Logs:", logs);
  } catch(e) {
    console.error(e)
  } finally {
    await prisma.$disconnect();
  }
}
main()
