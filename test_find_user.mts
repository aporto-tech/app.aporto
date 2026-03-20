import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    process.env.NEWAPI_URL = "https://api.aporto.tech";
    process.env.NEWAPI_ADMIN_TOKEN = "1T8Pd/QtjT3aBNzccom+5KaXgtZ2Rh0="; 
    
    // Quick script to fetch user list by calling the admin endpoint
    const res = await fetch(`${process.env.NEWAPI_URL}/api/user/`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${process.env.NEWAPI_ADMIN_TOKEN}`
        }
    });
    
    const data = await res.json();
    console.log("Found users:", data.data.length);
    
    const usersToFix = ["hawaiianmolade@gmail.com", "mldknnwk@fmlkmd.com"];
    
    for (const email of usersToFix) {
        let apiUser = data.data.find((u: any) => u.email === email);
        if (!apiUser) {
           const likelyUsername = email.split("@")[0].substring(0, 9);
           apiUser = data.data.find((u: any) => u.username.startsWith(likelyUsername));
        }
        if (apiUser) {
            console.log(`Found ${email} in NewAPI! ID: ${apiUser.id}`);
            await prisma.user.update({
                where: { email },
                data: { newApiUserId: apiUser.id }
            });
            console.log(`✅ Linked ${email}`);
        } else {
            console.log(`❌ Could not find ${email} in NewAPI by email or username prefix`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
