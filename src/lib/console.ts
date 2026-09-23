/**
 * Roles allowed into the internal operations console.
 *
 * ADMIN / SUPER_ADMIN get full access; COMPLIANCE and OPERATOR get the
 * read/ops surfaces their services already enforce. Customer accounts
 * (CUSTOMER, SUPPORT) are rejected at sign-in.
 */
export const CONSOLE_ROLES = ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'OPERATOR'] as const;

export type ConsoleRole = (typeof CONSOLE_ROLES)[number];

export function isConsoleRole(role: string | null | undefined): role is ConsoleRole {
  return !!role && (CONSOLE_ROLES as readonly string[]).includes(role);
}
