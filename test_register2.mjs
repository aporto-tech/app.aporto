import { newApiCreateUser } from './src/lib/newapi.ts'
// Loading actual local env just like Next.js does
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
   console.log("Using NEWAPI_URL:", process.env.NEWAPI_URL)
   const res = await newApiCreateUser({
       username: "test_" + Date.now().toString().slice(-5),
       email: "test" + Date.now() + "@example.com",
       password: "password123"
   });
   console.log("Result:", res);
}

main().catch(console.error);
