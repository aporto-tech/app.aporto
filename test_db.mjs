import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { id: 'desc' },
    take: 5
  })
  console.log("Latest Users:")
  console.dir(users, {depth: null})

  const sessions = await prisma.session.findMany({
    orderBy: { expires: 'desc' },
    take: 5
  })
  console.log("\nRecent Sessions:")
  console.dir(sessions, {depth: null})
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
