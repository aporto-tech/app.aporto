import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient()
async function main() {
  try {
    const t = await prisma.$queryRawUnsafe(`SELECT id, key, name FROM tokens ORDER BY id DESC LIMIT 5`);
    console.log(JSON.stringify(t, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));
  } catch(e) {
    console.error(e)
  } finally {
    await prisma.$disconnect();
  }
}
main()
