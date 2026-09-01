import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════
// BOKA — Database Connection
// Pamięć jest w osobnym folderze: /home/z/boka-memory/db/boka.db
// Aplikacja się nadpisuje, pamięć przetrwa
// ═══════════════════════════════════════════════════════════

// Override DATABASE_URL to point to memory folder if not explicitly set
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('prisma/dev.db')) {
  const memoryDbPath = process.env.BOKA_MEMORY_DIR
    ? `${process.env.BOKA_MEMORY_DIR}/db/boka.db`
    : '/home/z/boka-memory/db/boka.db';
  process.env.DATABASE_URL = `file:${memoryDbPath}`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

// Aliases — some modules import as `prisma`, others as `db`
export const prisma = db;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db