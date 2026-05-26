import { prisma } from "@/lib/prisma";

const THREAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_THREAD_MESSAGES = 20;

function threadExpiresAt(): Date {
    return new Date(Date.now() + THREAD_TTL_MS);
}

export async function getOrCreateThread(
    telegramUserId: string,
    skillId: number,
): Promise<{ id: string }> {
    return prisma.skillThread.upsert({
        where: { telegramUserId_skillId: { telegramUserId, skillId } },
        update: { expiresAt: threadExpiresAt() },
        create: { telegramUserId, skillId, expiresAt: threadExpiresAt() },
        select: { id: true },
    });
}

export async function appendThreadMessage(
    threadId: string,
    role: "user" | "assistant",
    content: string,
): Promise<void> {
    await prisma.$transaction([
        prisma.skillThreadMessage.create({
            data: { threadId, role, content },
        }),
        prisma.skillThread.update({
            where: { id: threadId },
            data: { expiresAt: threadExpiresAt() },
        }),
    ]);
}

export async function getThreadMessages(
    threadId: string,
    max = MAX_THREAD_MESSAGES,
): Promise<{ role: string; content: string }[]> {
    const rows = await prisma.skillThreadMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        take: max,
        select: { role: true, content: true },
    });
    return rows.reverse();
}

export async function saveAssistantMessageIfThread(
    telegramUserId: string,
    skillId: number,
    text: string,
): Promise<void> {
    const thread = await prisma.skillThread.findUnique({
        where: { telegramUserId_skillId: { telegramUserId, skillId } },
        select: { id: true },
    });
    if (thread) {
        await appendThreadMessage(thread.id, "assistant", text);
    }
}

export async function deleteExpiredThreads(): Promise<void> {
    await prisma.skillThread.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
}
