import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const url = 'https://api.aporto.tech';
  const adminToken = process.env.NEWAPI_ADMIN_TOKEN;
  
  console.log("Fetching logs from:", url);

  const res = await fetch(`${url}/api/log/?p=0&size=50`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'New-Api-User': "5"
    }
  });

  const data = await res.json();
  console.log("Response DB:");
  console.log(JSON.stringify(data, null, 2));
}
main();
