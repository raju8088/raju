import { getOrganizationContext } from '@/lib/auth/session';
import { successResponse, errorResponse } from '@/lib/utils/api-response';

export async function GET() {
  const ctx = await getOrganizationContext();
  if (!ctx) {
    return errorResponse('UNAUTHORIZED', 'Not authenticated or no active organization', 401);
  }

  return successResponse({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      phone: ctx.user.phone,
      status: ctx.user.status,
    },
    organization: ctx.organization,
    role: ctx.role,
    permissions: ctx.permissions,
  });
}
