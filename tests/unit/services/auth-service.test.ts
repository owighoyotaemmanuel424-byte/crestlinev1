import { AuthService } from '@/lib/services/auth-service';
import { prisma } from '@/lib/prisma';
import { mockPrismaFindUnique, mockPrismaCreate, TEST_DATE } from '../../setup';

// ============================================
// AUTH SERVICE UNIT TESTS
// ============================================

describe('AuthService', () => {
  describe('login', () => {
    it('should return user and tokens on successful login', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2a$10$hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      const result = await AuthService.login({
        email: 'test@example.com',
        password: 'password123',
      });
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockPrismaFindUnique('user', null);
      
      await expect(AuthService.login({
        email: 'nonexistent@example.com',
        password: 'password123',
      })).rejects.toThrow('User not found');
    });

    it('should throw ForbiddenError for frozen user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2a$10$hashedpassword',
        status: 'FROZEN',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      await expect(AuthService.login({
        email: 'test@example.com',
        password: 'password123',
      })).rejects.toThrow('Account is frozen');
    });

    it('should throw ForbiddenError for incorrect password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2a$10$hashedpassword',
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      await expect(AuthService.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should create new user with hashed password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: TEST_DATE,
        updatedAt: TEST_DATE,
      };
      
      mockPrismaFindUnique('user', null);
      mockPrismaCreate('user', mockUser);
      
      const result = await AuthService.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      }, 'admin-1');
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
    });

    it('should throw ConflictError for existing email', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'existing@example.com',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      await expect(AuthService.register({
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      }, 'admin-1')).rejects.toThrow('Email already exists');
    });
  });

  describe('getCurrentUser', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        status: 'ACTIVE',
        accounts: [],
        kycProfile: null,
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      const result = await AuthService.getCurrentUser('user-1');
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockPrismaFindUnique('user', null);
      
      await expect(AuthService.getCurrentUser('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('refreshToken', () => {
    it('should return new access token for valid refresh token', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(TEST_DATE.getTime() + 7 * 24 * 60 * 60 * 1000),
        user: {
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
        },
      };
      
      mockPrismaFindUnique('session', mockSession);
      
      const result = await AuthService.refreshToken('valid-refresh-token');
      
      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
    });

    it('should throw UnauthorizedError for invalid refresh token', async () => {
      mockPrismaFindUnique('session', null);
      
      await expect(AuthService.refreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
    });

    it('should throw UnauthorizedError for expired refresh token', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        refreshToken: 'expired-refresh-token',
        expiresAt: new Date(TEST_DATE.getTime() - 1000),
      };
      
      mockPrismaFindUnique('session', mockSession);
      
      await expect(AuthService.refreshToken('expired-refresh-token')).rejects.toThrow('Refresh token expired');
    });
  });

  describe('logout', () => {
    it('should delete session and return success', async () => {
      mockPrismaFindUnique('session', { id: 'session-1', userId: 'user-1' });
      (prisma as any).session.delete = jest.fn().mockResolvedValue({ id: 'session-1' });
      
      const result = await AuthService.logout('user-1', false);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should delete all sessions when allSessions is true', async () => {
      mockPrismaFindUnique('session', { id: 'session-1', userId: 'user-1' });
      (prisma as any).session.deleteMany = jest.fn().mockResolvedValue({ count: 3 });
      
      const result = await AuthService.logout('user-1', true);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
    });
  });
});
