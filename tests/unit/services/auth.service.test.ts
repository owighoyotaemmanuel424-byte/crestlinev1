/**
 * @jest-environment node
 */

import { AuthService } from '../../../../src/lib/services/auth-service';
import { prisma } from '../../../../src/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the prisma client
jest.mock('../../../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user already exists', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'test@example.com',
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow('User already exists');
    });
  });

  describe('login', () => {
    it('should return user and create session on successful login', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2a$10$hashedpassword',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.session.create.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        token: 'test-token',
        expiresAt: new Date(),
      });

      // Mock bcrypt compare
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await authService.login('test@example.com', 'password123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
      expect(mockPrisma.session.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error for invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('nonexistent@example.com', 'password123')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('validateSession', () => {
    it('should return user for valid session', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          role: 'CUSTOMER',
        },
      };

      mockPrisma.session.findMany.mockResolvedValue([mockSession]);

      const result = await authService.validateSession('session-1');

      expect(result).toEqual(mockSession.user);
    });

    it('should return null for invalid session', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const result = await authService.validateSession('invalid-session');

      expect(result).toBeNull();
    });
  });
});
