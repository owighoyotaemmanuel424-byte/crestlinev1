import { prisma } from '../prisma';
import { generateReference } from '../utils/security';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InsufficientBalanceError,
  AccountError,
} from '../utils/errors';
import { Decimal } from '@prisma/client/runtime/library';