import { PrismaClient } from '@prisma/client'
import { newApiCreateUser } from './src/lib/newapi.ts'
const prisma = new PrismaClient()

// MUST use the network IP of the Docker container or production URL, plus the admin token
process.env.NEWAPI_URL = "http://localhost:3006"
if (process.env.NEWAPI_URL.includes("localhost")) {
    // Inside node outside docker, localhost:3006 port maps to NewAPI container
    process.env.NEWAPI_URL = "http://localhost:3006";
}
process.env.NEWAPI_ADMIN_TOKEN = "1T8Pd/QtjT3aBNzccom+5KaXgtZ2Rh0="; // Local test token

async function main() {
  const users = await prisma.user.findMany({
    where: { newApiUserId: null },
    orderBy: { id: 'asc' }
  })
  
  if (users.length === 0) {
      console.log("No broken users found.")
      return;
  }
  
  console.log(`Found ${users.length} users with null newApiUserId. Fixing...`)
  
  for (const user of users) {
      if (!user.email) continue;
      
      let baseUsername = user.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
      if (baseUsername.length > 9) baseUsername = baseUsername.substring(0, 9);
      const username = `${baseUsername}_${Math.random().toString(36).substr(2, 6)}`;
      
      console.log(`Creating New-API user for Aporto user ${user.email} -> New username: ${username}`)
      
      // Call New-API to create user
      const newApiUser = await newApiCreateUser({
          username,
          email: user.email,
          password: "Aut0GeneratedPassword123!" // It's fine since Aporto uses its auth and syncs ID
      });
      
      if (newApiUser && newApiUser.id) {
          // Update Prisma
          await prisma.user.update({
              where: { id: user.id },
              data: { newApiUserId: newApiUser.id }
          })
          console.log(`✅ Fixed user ${user.email}: newApiUserId = ${newApiUser.id}`)
      } else {
          console.log(`❌ Failed to create New-API user for ${user.email}`)
      }
  }
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
