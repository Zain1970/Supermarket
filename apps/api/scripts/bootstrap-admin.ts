import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";

const envSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(254),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(14).max(200),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(100).default("Platform Administrator")
});

async function main() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (minimum 14 characters), and optionally BOOTSTRAP_ADMIN_NAME."
    );
  }

  const email = parsed.data.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const passwordHash = await hash(parsed.data.BOOTSTRAP_ADMIN_PASSWORD, 12);

  const admin = await prisma.$transaction(async (tx) => {
    // Serialize bootstrap attempts so two concurrent runs cannot both create an initial admin.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(4815162342::bigint)`;

    const existingAdmin = await tx.user.findFirst({
      where: { isPlatformAdmin: true },
      select: { id: true }
    });
    if (existingAdmin) {
      throw new Error("A platform administrator already exists. Bootstrap is disabled.");
    }

    const existingUser = await tx.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existingUser) {
      throw new Error("This email already exists. Use the approved account recovery process.");
    }

    return tx.user.create({
      data: {
        email,
        displayName: parsed.data.BOOTSTRAP_ADMIN_NAME,
        passwordHash,
        isPlatformAdmin: true
      },
      select: { id: true, email: true }
    });
  });

  console.log(`Created initial platform administrator: ${admin.email} (id: ${admin.id})`);
  console.log("Store the credentials securely. The password is not printed.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
