import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance for the whole process.
// Re-using one client avoids exhausting SQLite connections.
export const prisma = new PrismaClient();

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
