import { knowledgeFileRepository, type KnowledgeFileRecord } from '@/lib/db/repositories/knowledge-file.repository';
import { voiceAgentRepository } from '@/lib/db/repositories/voice-agent.repository';
import { providerConnectionService } from './provider-connection.service';
import { auditRepository } from '@/lib/db/repositories/audit.repository';
import type {
  NormalizedKnowledgeFile,
  UploadFileInput,
} from '@/lib/providers/voice/provider-types';

export class KnowledgeBaseService {
  private async resolveLocalFile(organizationId: string, fileId: string): Promise<KnowledgeFileRecord> {
    const local = await knowledgeFileRepository.findById(fileId, organizationId);
    if (!local) {
      const byProviderId = await knowledgeFileRepository.findByProviderFileId(organizationId, fileId);
      if (!byProviderId) {
        throw new Error('Knowledge file not found or does not belong to your organization.');
      }
      return byProviderId;
    }
    return local;
  }

  async listFiles(organizationId: string): Promise<NormalizedKnowledgeFile[]> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    const localFiles = await knowledgeFileRepository.findByOrganizationId(organizationId);

    const providerFiles = await provider.listKnowledgeFiles();
    const localByProviderId = new Map(localFiles.map((f) => [f.provider_file_id, f]));

    return providerFiles
      .filter((pf) => localByProviderId.has(pf.id))
      .map((pf) => {
        const local = localByProviderId.get(pf.id)!;
        return {
          ...pf,
          id: local.id,
          filename: local.filename || pf.filename,
          status: local.status || pf.status,
        };
      });
  }

  async canUpload(
    organizationId: string,
    fileSize: number,
    filename: string
  ): Promise<{ canUpload: boolean; message?: string; quotaRemaining?: number }> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);
    return provider.canUploadFile(fileSize, filename);
  }

  async uploadFile(
    organizationId: string,
    actorUserId: string,
    input: UploadFileInput
  ): Promise<NormalizedKnowledgeFile> {
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // 1. Upload to provider
    const uploaded = await provider.uploadKnowledgeFile(input);

    // 2. Register local control plane metadata
    const local = await knowledgeFileRepository.create({
      organizationId,
      provider: 'OMNIDIMENSION',
      providerFileId: uploaded.id,
      filename: input.filename,
      status: uploaded.status || 'READY',
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
    });

    // 3. Audit log
    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'KNOWLEDGE_FILE_UPLOADED',
      resource_type: 'knowledge_file',
      resource_id: local.id,
      metadata: {
        filename: input.filename,
        providerFileId: uploaded.id,
        fileSizeBytes: input.fileSizeBytes,
      },
    });

    return {
      ...uploaded,
      id: local.id,
    };
  }

  async attachFiles(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    fileIds: string[]
  ): Promise<{ success: boolean }> {
    const localAgent = await voiceAgentRepository.findById(agentId, organizationId);
    if (!localAgent) {
      throw new Error('Agent not found or does not belong to your organization.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    // Resolve provider file IDs from local file IDs
    const providerFileIds: string[] = [];
    for (const fid of fileIds) {
      const localFile = await knowledgeFileRepository.findById(fid, organizationId);
      if (localFile) {
        providerFileIds.push(localFile.provider_file_id);
      }
    }

    if (providerFileIds.length === 0) {
      throw new Error('No valid files found belonging to your organization to attach.');
    }

    await provider.attachKnowledgeFiles(localAgent.provider_agent_id, providerFileIds);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'KNOWLEDGE_FILE_ATTACHED',
      resource_type: 'voice_agent',
      resource_id: localAgent.id,
      metadata: {
        agentId: localAgent.id,
        fileIds,
      },
    });

    return { success: true };
  }

  async detachFiles(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    fileIds: string[]
  ): Promise<{ success: boolean }> {
    const localAgent = await voiceAgentRepository.findById(agentId, organizationId);
    if (!localAgent) {
      throw new Error('Agent not found or does not belong to your organization.');
    }

    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    const providerFileIds: string[] = [];
    for (const fid of fileIds) {
      const localFile = await knowledgeFileRepository.findById(fid, organizationId);
      if (localFile) {
        providerFileIds.push(localFile.provider_file_id);
      }
    }

    await provider.detachKnowledgeFiles(localAgent.provider_agent_id, providerFileIds);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'KNOWLEDGE_FILE_DETACHED',
      resource_type: 'voice_agent',
      resource_id: localAgent.id,
      metadata: {
        agentId: localAgent.id,
        fileIds,
      },
    });

    return { success: true };
  }

  async deleteFile(
    organizationId: string,
    actorUserId: string,
    fileId: string
  ): Promise<{ success: boolean }> {
    const local = await this.resolveLocalFile(organizationId, fileId);
    const provider = await providerConnectionService.getProviderForOrganization(organizationId);

    await provider.deleteKnowledgeFile(local.provider_file_id);
    await knowledgeFileRepository.delete(local.id, organizationId);

    await auditRepository.record({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action: 'KNOWLEDGE_FILE_DELETED',
      resource_type: 'knowledge_file',
      resource_id: local.id,
      metadata: {
        filename: local.filename,
        providerFileId: local.provider_file_id,
      },
    });

    return { success: true };
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
