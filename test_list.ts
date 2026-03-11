import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEWAPI_URL;
  const adminToken = process.env.NEWAPI_ADMIN_TOKEN;
  
  const res = await fetch(`${url}/api/token/?p=0&size=5`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data.data.items.slice(0, 2), null, 2));
}
main();
