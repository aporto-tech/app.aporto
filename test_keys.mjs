import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const t = await prisma.$queryRawUnsafe(`SELECT id, key FROM tokens LIMIT 3`);
  console.log(t);
}
main()
