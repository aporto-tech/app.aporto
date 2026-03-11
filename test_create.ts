import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEWAPI_URL;
  const adminToken = process.env.NEWAPI_ADMIN_TOKEN;
  
  const res = await fetch(`${url}/api/token/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: "test_token_script",
      expired_time: -1,
      remain_quota: 0,
      unlimited_quota: true
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
main();
