import { z } from 'zod';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthService } from '@/lib/services/auth-service';
import { ProfileService } from '@/lib/services/profile-service';
import { success } from '@/lib/middleware/response';
import { handleRouteError } from '@/lib/middleware/error-handler';
import { getAuthUser } from '@/lib/middleware/auth';

// ============================================
// GET /api/profile
// The signed-in customer's own account details
// ============================================

/**
 * The profile endpoint returns the user record itself (never the password
 * hash) with the optional Profile row attached, which is what the web client
 * and the app shell both read.
 */
function publicUser(user: User, profile: unknown = null) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth,
    address: user.address,
    city: user.city,
    state: user.state,
    zipCode: user.zipCode,
    country: user.country,
    status: user.status,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    name: `${user.firstName} ${user.lastName}`.trim(),
    profile,
  };
}

async function loadProfile(userId: string) {
  try {
    const { profile } = await ProfileService.getProfileByUserId(userId, userId);
    return profile;
  } catch {
    // A user without a Profile row still has a usable account.
    return null;
  }
}

export async function GET(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);

    const account = await AuthService.getUserById(user.id, user.id);
    const profile = await loadProfile(user.id);

    return success(publicUser(account, profile));
  });
}

// ============================================
// PATCH /api/profile
// Update the signed-in customer's own details
// ============================================

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  bio: z.string().optional(),
  timezone: z.string().optional(),
  avatarUrl: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  return handleRouteError(request, { params: {} }, async () => {
    const user = getAuthUser(request);
    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    const userData: Prisma.UserUpdateInput = {};
    if (validated.firstName !== undefined) userData.firstName = validated.firstName;
    if (validated.lastName !== undefined) userData.lastName = validated.lastName;
    if (validated.phone !== undefined) userData.phone = validated.phone;
    if (validated.dateOfBirth !== undefined) {
      userData.dateOfBirth = new Date(validated.dateOfBirth);
    }
    if (validated.address) {
      if (validated.address.street !== undefined) userData.address = validated.address.street;
      if (validated.address.city !== undefined) userData.city = validated.address.city;
      if (validated.address.state !== undefined) userData.state = validated.address.state;
      if (validated.address.postalCode !== undefined) userData.zipCode = validated.address.postalCode;
      if (validated.address.country !== undefined) userData.country = validated.address.country;
    }

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: userData });
    }

    const profileData: { bio?: string; timezone?: string; avatarUrl?: string } = {};
    if (validated.bio !== undefined) profileData.bio = validated.bio;
    if (validated.timezone !== undefined) profileData.timezone = validated.timezone;
    if (validated.avatarUrl !== undefined) profileData.avatarUrl = validated.avatarUrl;

    if (Object.keys(profileData).length > 0 && (await loadProfile(user.id))) {
      await ProfileService.updateProfile(user.id, profileData, user.id);
    }

    const account = await AuthService.getUserById(user.id, user.id);
    const profile = await loadProfile(user.id);

    return success(publicUser(account, profile));
  });
}
