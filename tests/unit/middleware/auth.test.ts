/**
 * @jest-environment node
 */

import { authMiddleware } from '../../../../src/lib/middleware/auth';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';

// Mock the auth service
jest.mock('../../../../src/lib/services/auth-service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    validateSession: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: Role.ADMIN,
    }),
  })),
}));

describe('Auth Middleware', () => {
  let mockRequest: Partial<NextRequest>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: new Headers({
        authorization: 'Bearer valid-token',
      }),
      cookies: new Map([['token', 'valid-token']]),
    };
    mockNext = jest.fn();
  });

  it('should allow access for authenticated users', async () => {
    const result = await authMiddleware(mockRequest as NextRequest, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
  });

  it('should deny access for unauthenticated users', async () => {
    mockRequest.headers = new Headers({});
    mockRequest.cookies = new Map();

    await expect(
      authMiddleware(mockRequest as NextRequest, mockNext)
    ).rejects.toThrow('Unauthorized');
  });

  it('should check for specific roles when required', async () => {
    // Test role-based access control
    const adminOnlyMiddleware = authMiddleware({ requiredRole: Role.ADMIN });
    
    await expect(
      adminOnlyMiddleware(mockRequest as NextRequest, mockNext)
    ).resolves.toBeDefined();
    
    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject users without required role', async () => {
    // Mock user with CUSTOMER role
    const authService = require('../../../../src/lib/services/auth-service').AuthService;
    authService.mockImplementation(() => ({
      validateSession: jest.fn().mockResolvedValue({
        id: 'user-2',
        email: 'customer@example.com',
        role: Role.CUSTOMER,
      }),
    }));

    const adminOnlyMiddleware = authMiddleware({ requiredRole: Role.ADMIN });
    
    await expect(
      adminOnlyMiddleware(mockRequest as NextRequest, mockNext)
    ).rejects.toThrow('Forbidden');
  });
});
