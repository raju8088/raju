import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  organization_name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  phone: z.string().optional().or(z.literal('')).nullable(),
});

export const switchOrgSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;
