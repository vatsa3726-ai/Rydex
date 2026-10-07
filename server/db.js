import { PrismaClient } from '@prisma/client'

let prisma = null

if (process.env.DATABASE_URL) {
  prisma = new PrismaClient()
}

export function getPrisma() {
  return prisma
}

export async function closePrisma() {
  if (prisma) await prisma.$disconnect()
}
