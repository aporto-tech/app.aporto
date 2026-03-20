import { newApiCreateUser } from './src/lib/newapi.ts'

process.env.NEWAPI_URL = "https://api.aporto.tech";
process.env.NEWAPI_ADMIN_TOKEN = "1T8Pd/QtjT3aBNzccom+5KaXgtZ2Rh0="; 

async function main() {
   const res = await newApiCreateUser({
       username: "hawaiianm_" + Date.now().toString().slice(-4), 
       email: "hawaiianmolade@gmail.com",
       password: "password123"
   });
   console.log("Result:", res);
}

main().catch(console.error);
