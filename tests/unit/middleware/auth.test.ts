/**
 * @jest-environment node
 */

import { authMiddleware, roleMiddleware, getAuthUser } from '../../../src/lib/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';

// Mock the auth service
jest.mock('../../../src/lib/services/auth-service', () => ({
  AuthService: {
    validateSession: jest.fn(),
  },
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should allow access for authenticated users with valid Bearer token', async () => {
      const { AuthService } = require('../../../src/lib/services/auth-service');
      AuthService.validateSession.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
      });

      const request = new NextRequest(new Request('http://localhost/api/test', {
        headers: {
          'authorization': 'Bearer valid-token',
        },
      }));

      const response = await authMiddleware(request);

      expect(response).toBeDefined();
    });

    it('should return 401 for unauthenticated requests', async () => {
      const request = new NextRequest(new Request('http://localhost/api/test'));

      const response = await authMiddleware(request);

      expect(response.status).toBe(401);
    });

    it('should skip auth for public routes', async () => {
      const request = new NextRequest(new Request('http://localhost/api/health'));

      const response = await authMiddleware(request);

      // Public routes pass through without requiring a token (no 401/403).
      expect(response.status).toBe(200);
    });
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

    it('should throw when no user ID in headers', () => {
      const request = {
        headers: new Headers({}),
      } as any;

      expect(() => getAuthUser(request)).toThrow();
    });
  });

  describe('roleMiddleware', () => {
    it('should allow authorized role', async () => {
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

    it('should return 403 for unauthorized role', async () => {
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
});
