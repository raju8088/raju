import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  logo_url: z.string().url('Invalid logo URL').optional().or(z.literal('')).nullable(),
  brand_name: z.string().max(100).optional().nullable(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  logo_url: z.string().url().optional().or(z.literal('')).nullable(),
  brand_name: z.string().max(100).optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BIN', 'REMOVED']).optional(),
  plan_id: z.string().optional().nullable(),
});

export const suspendOrganizationSchema = z.object({
  status: z.enum(['SUSPENDED', 'BIN', 'REMOVED']),
  reason: z.string().max(250).optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type SuspendOrganizationInput = z.infer<typeof suspendOrganizationSchema>;
