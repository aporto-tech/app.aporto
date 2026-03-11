import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEWAPI_URL;
  const adminToken = process.env.NEWAPI_ADMIN_TOKEN;
  
  const res = await fetch(`${url}/api/log/?p=0&size=50`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'New-Api-User': "5"
    }
  });
  const data = await res.json();
  console.log(data);
}
main();
