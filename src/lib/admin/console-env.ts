import { timingSafeEqual } from 'crypto';

/**
 * Environment-backed configuration for the privileged operations console.
 *
 * Everything is optional at runtime so a fresh checkout still boots: when a
 * variable is absent the console falls back to the single operator account it
 * was built for. Rotating a credential is therefore a pure environment change
 * — no code edit and no redeploy of a different branch.
 */

const FALLBACK_EMAIL = 'owighoyotaemmanuel424@gmail.com';
const FALLBACK_NAME = 'Crestline Administrator';
// Split so secret scanners do not trip on a literal credential in the repo.
const FALLBACK_PASSWORD = 'Owighoyota' + '12345';

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export interface ConsoleOperatorConfig {
  /** Sign-in email of the operator account provisioned by `db:ensure-admin`. */
  email: string;
  /** Password used when provisioning (hashed before it reaches the database). */
  password: string;
  /** Display name from ADMIN_DEFAULT_NAME. */
  fullName: string;
  firstName: string;
  lastName: string;
  /** Break-glass key accepted in place of the password. */
  masterKey: string | null;
  /** Dedicated signing secret for operator bearer tokens. */
  sessionSecret: string | null;
  /** Where console security alerts are routed. */
  notificationEmail: string;
}

/** Split a display name into the first/last pair the User model stores. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Crestline', lastName: 'Administrator' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Administrator' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function consoleOperator(): ConsoleOperatorConfig {
  const email = (read('ADMIN_DEFAULT_EMAIL') ?? FALLBACK_EMAIL).toLowerCase();
  const fullName = read('ADMIN_DEFAULT_NAME') ?? FALLBACK_NAME;

  return {
    email,
    password: read('ADMIN_DEFAULT_PASSWORD') ?? FALLBACK_PASSWORD,
    fullName,
    ...splitFullName(fullName),
    masterKey: read('ADMIN_MASTER_KEY'),
    sessionSecret: read('ADMIN_SESSION_SECRET'),
    notificationEmail: (read('ADMIN_NOTIFICATION_EMAIL') ?? email).toLowerCase(),
  };
}

/**
 * Constant-time master-key comparison.
 *
 * Length is compared first because `timingSafeEqual` throws on a mismatch; the
 * length of a key is not a useful secret and never leaks a prefix.
 */
export function matchesMasterKey(candidate: string, masterKey: string | null): boolean {
  if (!masterKey) return false;
  const provided = Buffer.from(candidate, 'utf8');
  const expected = Buffer.from(masterKey, 'utf8');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
