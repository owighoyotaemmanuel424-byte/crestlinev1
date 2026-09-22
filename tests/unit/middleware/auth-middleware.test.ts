/**
 * @jest-environment node
 */

import { authMiddleware, getAuthUser, requireRole, roleMiddleware, adminMiddleware, complianceMiddleware, superAdminMiddleware } from '../../../src/lib/middleware/auth';
import { NextRequest } from 'next/server';

// Mock the auth service
jest.mock('../../../src/lib/services/auth-service', () => ({
  AuthService: {
    validateSession: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: 'ADMIN',
    }),
  },
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthUser', () => {
    it('should extract user from request headers', () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'ADMIN',
          'x-user-email': 'admin@example.com',
        }),
      } as any;
      
      const user = getAuthUser(request);
      
      expect(user).toEqual({
        id: 'user-1',
        role: 'ADMIN',
        email: 'admin@example.com',
      });
    });

    it('should throw UnauthorizedError when no user ID in headers', () => {
      const request = {
        headers: new Headers({}),
      } as any;
      
      expect(() => getAuthUser(request)).toThrow('Authentication required');
    });
  });

  describe('requireRole', () => {
    it('should return true when user has required role', () => {
      const hasRole = requireRole('ADMIN', ['ADMIN', 'SUPER_ADMIN']);
      expect(hasRole).toBe(true);
    });

    it('should return false when user does not have required role', () => {
      const hasRole = requireRole('USER', ['ADMIN', 'SUPER_ADMIN']);
      expect(hasRole).toBe(false);
    });

    it('should return true when user has one of multiple required roles', () => {
      const hasRole = requireRole('ADMIN', ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE']);
      expect(hasRole).toBe(true);
    });
  });

  describe('roleMiddleware', () => {
    it('should return NextResponse.next() for authorized role', async () => {
      const middleware = roleMiddleware(['ADMIN', 'SUPER_ADMIN']);
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'ADMIN',
        }),
      } as any;
      
      const response = await middleware(request);
      
      expect(response).toBeDefined();
    });

    it('should return 403 Forbidden for unauthorized role', async () => {
      const middleware = roleMiddleware(['ADMIN', 'SUPER_ADMIN']);
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'USER',
        }),
      } as any;
      
      const response = await middleware(request);
      
      expect(response.status).toBe(403);
    });
  });

  describe('adminMiddleware', () => {
    it('should allow ADMIN role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'ADMIN',
        }),
      } as any;
      
      const response = await adminMiddleware(request);
      
      expect(response).toBeDefined();
    });

    it('should allow SUPER_ADMIN role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'SUPER_ADMIN',
        }),
      } as any;
      
      const response = await adminMiddleware(request);
      
      expect(response).toBeDefined();
    });

    it('should deny USER role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'USER',
        }),
      } as any;
      
      const response = await adminMiddleware(request);
      
      expect(response.status).toBe(403);
    });
  });

  describe('complianceMiddleware', () => {
    it('should allow COMPLIANCE role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'COMPLIANCE',
        }),
      } as any;
      
      const response = await complianceMiddleware(request);
      
      expect(response).toBeDefined();
    });

    it('should allow ADMIN role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'ADMIN',
        }),
      } as any;
      
      const response = await complianceMiddleware(request);
      
      expect(response).toBeDefined();
    });

    it('should deny USER role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'USER',
        }),
      } as any;
      
      const response = await complianceMiddleware(request);
      
      expect(response.status).toBe(403);
    });
  });

  describe('superAdminMiddleware', () => {
    it('should allow SUPER_ADMIN role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'SUPER_ADMIN',
        }),
      } as any;
      
      const response = await superAdminMiddleware(request);
      
      expect(response).toBeDefined();
    });

    it('should deny ADMIN role', async () => {
      const request = {
        headers: new Headers({
          'x-user-id': 'user-1',
          'x-user-role': 'ADMIN',
        }),
      } as any;
      
      const response = await superAdminMiddleware(request);
      
      expect(response.status).toBe(403);
    });
  });
});
