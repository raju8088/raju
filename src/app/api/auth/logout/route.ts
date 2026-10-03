import { clearSessionCookie, getOrganizationContext } from '@/lib/auth/session';
import { authService } from '@/services/auth.service';
import { successResponse } from '@/lib/utils/api-response';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const ctx = await getOrganizationContext();
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    undefined;

  if (ctx) {
    await authService.logout(ctx.userId, ctx.organizationId, ipAddress);
  }

  await clearSessionCookie();
  return successResponse({ message: 'Logged out successfully' });
}
