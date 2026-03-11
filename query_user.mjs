import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient()
async function main() {
  try {
    const users = await prisma.$queryRawUnsafe(`SELECT id, username, email FROM users WHERE username = 'kaqqqaat_tm4p31' OR email = 'kaqqqaat_tm4p31'`);
    console.log("Users:", users);
    
    if (users.length > 0) {
       const u = users[0];
       const logs = await prisma.$queryRawUnsafe(`SELECT id, user_id, type, created_at, content FROM logs WHERE user_id = $1 ORDER BY id DESC LIMIT 5`, u.id);
       console.log("Logs:", logs);
    }
  } catch(e) {
    console.error(e)
  } finally {
    await prisma.$disconnect();
  }
}
main()
