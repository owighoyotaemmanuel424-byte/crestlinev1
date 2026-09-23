/**
 * Provision (or refresh) operations-console access for the platform operator.
 *
 * Idempotent — safe to re-run against any environment, including production.
 * It only touches the single operator account: password, name, role and status.
 *
 *   pnpm db:ensure-admin
 *
 * Credentials come from the environment so rotating them never needs a code
 * change:
 *   ADMIN_DEFAULT_PASSWORD (required) / ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_NAME
 * The legacy ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_FIRST_NAME / ADMIN_LAST_NAME
 * names are still honoured. Only the email and display name have defaults —
 * the password must always be supplied, because a credential committed to the
 * repository is readable by anyone who can read the repository.
 */
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { consoleOperator } from '../src/lib/admin/console-env';

const prisma = new PrismaClient();

async function main() {
  const config = consoleOperator();
  const legacyEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const legacyPassword = process.env.ADMIN_PASSWORD;
  const legacyFirst = process.env.ADMIN_FIRST_NAME;
  const legacyLast = process.env.ADMIN_LAST_NAME;

  const email = legacyEmail || config.email;
  const password = legacyPassword || config.password;
  const firstName = legacyFirst || config.firstName;
  const lastName = legacyLast || config.lastName;

  if (!password) {
    throw new Error(
      'No console password configured. Set ADMIN_DEFAULT_PASSWORD to at least 8 characters ' +
        'in the environment before provisioning — credentials are never read from source.'
    );
  }

  if (password.length < 8) {
    throw new Error('The console password must be at least 8 characters long.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      firstName,
      lastName,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
    create: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: true,
    },
    select: { id: true, email: true, role: true, status: true },
  });

  // The password stored in the database must actually verify — a silent
  // mismatch here is what makes an operator think the console is broken.
  const stored = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { password: true },
  });

  if (!stored || !(await bcrypt.compare(password, stored.password))) {
    throw new Error('Provisioning wrote a credential that does not verify.');
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'UPDATE',
        resourceType: 'USER',
        resourceId: admin.id,
        newValues: { role: admin.role, status: admin.status },
        metadata: {
          source: 'ensure-admin script',
          name: `${firstName} ${lastName}`.trim(),
          notificationEmail: config.notificationEmail,
        },
        status: 'SUCCESS',
      },
    });
  } catch {
    // Auditing must never block provisioning the operator account.
  }

  console.log(`✅ Console access ready for ${admin.email} (${admin.role}, ${admin.status})`);
  console.log(`   Name: ${firstName} ${lastName}`);
  console.log(`   Master key: ${config.masterKey ? 'configured' : 'not configured'}`);
}

main()
  .catch(async (error) => {
    console.error('❌ Could not provision console access:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
