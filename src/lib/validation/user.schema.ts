import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().or(z.literal('')).nullable(),
  role: z.enum(['MAIN_ADMIN', 'ORG_ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  organization_id: z.string().uuid().optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(['MAIN_ADMIN', 'ORG_ADMIN', 'EMPLOYEE']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']).optional(),
});

export const updateUserProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional().or(z.literal('')).nullable(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
