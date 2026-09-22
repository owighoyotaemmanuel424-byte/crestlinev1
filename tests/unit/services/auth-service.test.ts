import { AuthService } from '@/lib/services/auth-service';
import { prisma } from '@/lib/prisma';
import { mockPrismaFindUnique, mockPrismaCreate, TEST_DATE } from '../../setup';

// ============================================
// AUTH SERVICE UNIT TESTS
// ============================================

describe('AuthService', () => {
  describe('login', () => {
    it('should return user and token on successful login', async () => {
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

      // bcrypt rejects the placeholder hash, so stub a successful comparison
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      
      const result = await AuthService.login({
        email: 'test@example.com',
        password: 'password123',
      });
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should throw error for non-existent user', async () => {
      mockPrismaFindUnique('user', null);
      
      await expect(AuthService.login({
        email: 'nonexistent@example.com',
        password: 'password123',
      })).rejects.toThrow();
    });

    it('should throw error for incorrect password', async () => {
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
      })).rejects.toThrow();
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
      });
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should throw error for existing email', async () => {
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
      })).rejects.toThrow();
    });
  });

  describe('validateSession', () => {
    it('should return session result for valid session', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        token: 'valid-token',
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
      
      const result = await AuthService.validateSession('valid-token');
      
      expect(result).toBeDefined();
    });

    it('should return null for invalid session', async () => {
      mockPrismaFindUnique('session', null);
      
      const result = await AuthService.validateSession('invalid-token');
      
      expect(result).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
        status: 'ACTIVE',
      };
      
      mockPrismaFindUnique('user', mockUser);
      
      const result = await AuthService.getUserById('user-1');
      
      expect(result).toBeDefined();
    });

    it('should throw error for non-existent user', async () => {
      mockPrismaFindUnique('user', null);
      
      await expect(AuthService.getUserById('nonexistent')).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should delete session', async () => {
      mockPrismaFindUnique('session', { id: 'session-1', userId: 'user-1' });
      (prisma as any).session.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      
      await AuthService.logout('session-1');
      
      expect((prisma as any).session.deleteMany).toHaveBeenCalled();
    });
  });
});
