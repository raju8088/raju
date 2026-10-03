import { ensureDatabaseReady, QueryClient } from '../client';

export interface KnowledgeFileRecord {
  id: string;
  organization_id: string;
  provider: 'OMNIDIMENSION';
  provider_file_id: string;
  filename: string;
  status: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeFileInput {
  organizationId: string;
  provider?: 'OMNIDIMENSION';
  providerFileId: string;
  filename: string;
  status?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export class KnowledgeFileRepository {
  async findByOrganizationId(
    organizationId: string,
    client?: QueryClient
  ): Promise<KnowledgeFileRecord[]> {
    const db = client || (await ensureDatabaseReady());
    return db.query<KnowledgeFileRecord>(
      `SELECT * FROM knowledge_files WHERE organization_id = $1 ORDER BY created_at DESC;`,
      [organizationId]
    );
  }

  async findById(
    id: string,
    organizationId?: string,
    client?: QueryClient
  ): Promise<KnowledgeFileRecord | null> {
    const db = client || (await ensureDatabaseReady());
    if (organizationId) {
      return db.queryOne<KnowledgeFileRecord>(
        `SELECT * FROM knowledge_files WHERE id = $1 AND organization_id = $2;`,
        [id, organizationId]
      );
    }
    return db.queryOne<KnowledgeFileRecord>(
      `SELECT * FROM knowledge_files WHERE id = $1;`,
      [id]
    );
  }

  async findByProviderFileId(
    organizationId: string,
    providerFileId: string,
    client?: QueryClient
  ): Promise<KnowledgeFileRecord | null> {
    const db = client || (await ensureDatabaseReady());
    return db.queryOne<KnowledgeFileRecord>(
      `SELECT * FROM knowledge_files WHERE organization_id = $1 AND provider_file_id = $2;`,
      [organizationId, providerFileId]
    );
  }

  async create(
    input: CreateKnowledgeFileInput,
    client?: QueryClient
  ): Promise<KnowledgeFileRecord> {
    const db = client || (await ensureDatabaseReady());
    const row = await db.queryOne<KnowledgeFileRecord>(
      `INSERT INTO knowledge_files (
        organization_id, provider, provider_file_id, filename,
        status, mime_type, file_size_bytes, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *;`,
      [
        input.organizationId,
        input.provider || 'OMNIDIMENSION',
        input.providerFileId,
        input.filename,
        input.status || 'READY',
        input.mimeType || null,
        input.fileSizeBytes || null,
        JSON.stringify(input.metadata || {}),
      ]
    );

    if (!row) {
      throw new Error('Failed to create knowledge file record');
    }
    return row;
  }

  async delete(id: string, organizationId: string, client?: QueryClient): Promise<boolean> {
    const db = client || (await ensureDatabaseReady());
    const res = await db.query(
      `DELETE FROM knowledge_files WHERE id = $1 AND organization_id = $2 RETURNING id;`,
      [id, organizationId]
    );
    return res.length > 0;
  }
}

export const knowledgeFileRepository = new KnowledgeFileRepository();
