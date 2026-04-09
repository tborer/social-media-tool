import { PrismaClient } from '@prisma/client'

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more:
// https://pris.ly/d/help/next-js-best-practices

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Increase connection pool timeout for serverless environments where
    // sequential DB operations (e.g. syncing many IG posts) can exhaust the
    // default 10-second pool timeout with connection_limit=1.
    // The connection_limit is controlled via the DATABASE_URL query string
    // (?connection_limit=5&pool_timeout=30), but we also raise the
    // Prisma-level transaction timeout here.
    transactionOptions: {
      maxWait: 30000,  // 30s max wait for a connection
      timeout: 30000,  // 30s transaction timeout
    },
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.VERCEL_ENV !== 'production') globalThis.prismaGlobal = prisma