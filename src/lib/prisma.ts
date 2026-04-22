import { PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient(
        process.env.NODE_ENV === "development" ? { log: ["query", "warn", "error"] } : undefined
    )

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma


