import { PrismaClient } from '@prisma/client'
import { newApiCreateUser } from './src/lib/newapi.js' // .ts in original
const prisma = new PrismaClient()

process.env.NEWAPI_URL = "https://api.aporto.tech";
process.env.NEWAPI_ADMIN_TOKEN = "1T8Pd/QtjT3aBNzccom+5KaXgtZ2Rh0="; 

async function main() {
    const users = ["hawaiianmolade@gmail.com", "mldknnwk@fmlkmd.com"];
    for (const email of users) {
        const user = await prisma.user.findUnique({ where: { email }});
        if (!user) continue;

        let baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
        if (baseUsername.length > 9) baseUsername = baseUsername.substring(0, 9);
        // Using a totally fresh, guaranteed unique suffix
        const username = `${baseUsername}_fix${Math.random().toString(36).substr(2, 3)}`;
        
        console.log(`Trying ${username} for ${email}`);
        const newApiUser = await newApiCreateUser({
            username,
            email,
            password: "Aut0GeneratedPassword12"
        });
        console.log("Result:", newApiUser);
        
        if (newApiUser && newApiUser.id) {
            await prisma.user.update({
                where: { email },
                data: { newApiUserId: newApiUser.id }
            });
            console.log(`✅ Fixed ${email}`);
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
