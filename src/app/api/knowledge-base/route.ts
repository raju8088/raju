import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/auth/session';
import { knowledgeBaseService } from '@/services/knowledge-base.service';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission, AuthorizationError } from '@/lib/permissions/rbac';
import { VoiceProviderError } from '@/lib/providers/voice/omnidimension/omnidimension.errors';

export async function GET() {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'KNOWLEDGE_BASE_VIEW');

    const files = await knowledgeBaseService.listFiles(ctx.organizationId);
    return successResponse(files);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('INTERNAL_SERVER_ERROR', (error as Error).message || 'Failed to list knowledge files', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getOrganizationContext();
    if (!ctx) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    requirePermission(ctx, 'KNOWLEDGE_BASE_MANAGE');

    const contentType = req.headers.get('content-type') || '';

    let filename = '';
    let mimeType = 'application/pdf';
    let content: string | Buffer = '';
    let fileSizeBytes = 0;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      filename = body.filename || 'document.txt';
      mimeType = body.mimeType || 'text/plain';
      content = body.content || '';
      fileSizeBytes = body.fileSizeBytes || (typeof content === 'string' ? content.length : 0);
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return errorResponse('VALIDATION_ERROR', 'File is required in form-data', 400);
      }
      filename = file.name;
      mimeType = file.type || 'application/octet-stream';
      fileSizeBytes = file.size;
      const buffer = await file.arrayBuffer();
      content = Buffer.from(buffer);
    } else {
      return errorResponse('UNSUPPORTED_MEDIA_TYPE', 'Use multipart/form-data or application/json with base64 content', 415);
    }

    // Check upload limits
    const quota = await knowledgeBaseService.canUpload(ctx.organizationId, fileSizeBytes, filename);
    if (!quota.canUpload) {
      return errorResponse('UPLOAD_QUOTA_EXCEEDED', quota.message || 'File size or upload limit exceeded', 400);
    }

    const uploaded = await knowledgeBaseService.uploadFile(ctx.organizationId, ctx.userId, {
      filename,
      mimeType,
      content,
      fileSizeBytes,
    });

    return successResponse(uploaded, 201);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    if (error instanceof VoiceProviderError) {
      return errorResponse(error.code, error.message, error.httpStatus, error.details);
    }
    return errorResponse('UPLOAD_FAILED', (error as Error).message || 'Failed to upload knowledge file', 400);
  }
}
