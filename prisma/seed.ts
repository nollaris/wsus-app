import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // ignore if already loaded
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding default admin user...");
  const passwordHash = await bcrypt.hash("P@ssw0rd", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash, role: "admin" },
    create: { username: "admin", passwordHash, role: "admin" },
  });

  const userCount = await prisma.user.count();
  console.log("Seed complete. Users:", userCount);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
