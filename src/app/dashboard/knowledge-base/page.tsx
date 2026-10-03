'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Upload,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileUp,
  Bot,
} from 'lucide-react';
import type { NormalizedKnowledgeFile, NormalizedAgent } from '@/lib/providers/voice/provider-types';

export default function KnowledgeBasePage() {
  const [files, setFiles] = useState<NormalizedKnowledgeFile[]>([]);
  const [agents, setAgents] = useState<NormalizedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Quick attach state
  const [attachAgentId, setAttachAgentId] = useState<string>('');
  const [attachFileId, setAttachFileId] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const [filesRes, agentsRes] = await Promise.all([
        fetch('/api/knowledge-base'),
        fetch('/api/agents'),
      ]);
      const filesData = await filesRes.json();
      const agentsData = await agentsRes.json();

      if (filesData.success) {
        setFiles(filesData.data);
      } else {
        setError(filesData.error?.message || 'Failed to load knowledge files');
      }

      if (agentsData.success) {
        setAgents(agentsData.data);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to connect to knowledge service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetch('/api/knowledge-base'), fetch('/api/agents')])
      .then(async ([filesRes, agentsRes]) => {
        const filesData = await filesRes.json();
        const agentsData = await agentsRes.json();
        if (!isMounted) return;
        if (filesData.success) {
          setFiles(filesData.data);
        } else {
          setError(filesData.error?.message || 'Failed to load knowledge files');
        }
        if (agentsData.success) {
          setAgents(agentsData.data);
        }
      })
      .catch((err) => {
        if (isMounted) setError((err as Error).message || 'Failed to connect to knowledge service');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    // Validate size (max 20MB)
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('File size exceeds 20MB limit');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setSuccess(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/knowledge-base', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`"${selectedFile.name}" uploaded successfully.`);
        setSelectedFile(null);
        setShowUploadModal(false);
        await fetchFiles();
      } else {
        setError(data.error?.message || 'Failed to upload file');
      }
    } catch (err) {
      setError((err as Error).message || 'Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This will detach the file from any assigned agents.`)) {
      return;
    }

    try {
      setDeletingId(fileId);
      const res = await fetch(`/api/knowledge-base/${fileId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        setSuccess(`"${filename}" deleted successfully.`);
      } else {
        setError(data.error?.message || 'Failed to delete file');
      }
    } catch (err) {
      setError((err as Error).message || 'Delete error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAttachSubmit = async () => {
    if (!attachFileId || !attachAgentId) return;

    try {
      setIsAttaching(true);
      const res = await fetch('/api/knowledge-base/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: attachAgentId, fileIds: [attachFileId] }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('File attached to voice agent successfully.');
        setAttachFileId(null);
        setAttachAgentId('');
      } else {
        setError(data.error?.message || 'Failed to attach file');
      }
    } catch (err) {
      setError((err as Error).message || 'Attach error');
    } finally {
      setIsAttaching(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <FileText className="h-6 w-6 text-indigo-600" />
            Knowledge Base Library
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload product manuals, FAQs, and domain documents for agents to reference during live calls.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button size="sm" onClick={() => setShowUploadModal(true)} className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Knowledge Base Issue</p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
            {error.includes('not connected') && (
              <Link href="/dashboard/settings/integrations" className="text-xs font-semibold text-indigo-600 underline mt-1 inline-block">
                Connect OmniDimension Provider →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg shadow-xl animate-in fade-in-50 zoom-in-95">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileUp className="h-5 w-5 text-indigo-600" />
                Upload Knowledge Document
              </CardTitle>
              <CardDescription>
                Supported formats: PDF, TXT, DOCX. Max file size: 20MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    id="kb-file-input"
                    className="hidden"
                    accept=".pdf,.txt,.docx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="kb-file-input" className="cursor-pointer block">
                    <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    {selectedFile ? (
                      <div>
                        <p className="text-sm font-semibold text-indigo-600">{selectedFile.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Click to browse or drag and drop
                        </p>
                        <p className="text-xs text-slate-400 mt-1">PDF, TXT, or DOCX up to 20MB</p>
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowUploadModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUploading || !selectedFile}>
                    {isUploading ? 'Uploading to OmniDimension...' : 'Upload File'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Attach Modal */}
      {attachFileId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md shadow-xl animate-in fade-in-50 zoom-in-95">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-600" />
                Attach Document to Voice Agent
              </CardTitle>
              <CardDescription>Select an agent to ground with this document.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                value={attachAgentId}
                onChange={(e) => setAttachAgentId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm"
              >
                <option value="">Select an agent...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button type="button" variant="outline" onClick={() => setAttachFileId(null)}>
                  Cancel
                </Button>
                <Button onClick={handleAttachSubmit} disabled={isAttaching || !attachAgentId}>
                  {isAttaching ? 'Attaching...' : 'Confirm Attachment'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Files List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Repository ({files.length})</CardTitle>
          <CardDescription>Processed documents ready for conversational retrieval</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading knowledge files...</div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
              <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Knowledge Base Documents</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Upload company documents so your AI agents can accurately reference facts and policies.
              </p>
              <Button size="sm" onClick={() => setShowUploadModal(true)} className="mt-4">
                <Upload className="h-4 w-4 mr-1.5" />
                Upload Document
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.map((file) => (
                <div key={file.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{file.filename}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span>{formatFileSize(file.fileSizeBytes)}</span>
                        <span>•</span>
                        <span>{file.mimeType || 'Document'}</span>
                        <span>•</span>
                        <span>{file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={file.status === 'READY' ? 'success' : 'secondary'} size="sm">
                      {file.status}
                    </Badge>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAttachFileId(file.id)}
                      className="text-xs h-8"
                    >
                      Attach to Agent
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(file.id, file.filename)}
                      disabled={deletingId === file.id}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
