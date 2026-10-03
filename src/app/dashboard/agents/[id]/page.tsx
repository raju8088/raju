'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Bot,
  Mic,
  Calendar,
  Layers,
  FileText,
  Phone,
  History,
  RotateCcw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import type { NormalizedAgent, NormalizedAgentVersion, NormalizedKnowledgeFile, NormalizedPhoneNumber } from '@/lib/providers/voice/provider-types';

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [agent, setAgent] = useState<NormalizedAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'versions' | 'kb' | 'phones'>('overview');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Versions state
  const [versions, setVersions] = useState<NormalizedAgentVersion[]>([]);
  const [versionSnapshotName, setVersionSnapshotName] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);

  // Config edit state
  const [editName, setEditName] = useState('');
  const [editWelcome, setEditWelcome] = useState('');
  const [editSpeed, setEditSpeed] = useState(1.0);
  const [editModel, setEditModel] = useState('gpt-4o-mini');
  const [editVoice, setEditVoice] = useState('Rachel');
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Knowledge base state
  const [orgFiles, setOrgFiles] = useState<NormalizedKnowledgeFile[]>([]);
  const [selectedFileToAttach, setSelectedFileToAttach] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);

  // Phone numbers state
  const [orgPhones, setOrgPhones] = useState<NormalizedPhoneNumber[]>([]);

  const fetchAgent = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/agents/${id}`);
      const data = await res.json();
      if (data.success) {
        setAgent(data.data);
        setEditName(data.data.name);
        setEditWelcome(data.data.welcomeMessage || '');
        setEditSpeed(data.data.speechSpeed ?? 1.0);
        setEditModel(data.data.model || 'gpt-4o-mini');
        setEditVoice(data.data.voiceName || 'Rachel');
      } else {
        setError(data.error?.message || 'Failed to load agent');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async () => {
    try {
      const res = await fetch(`/api/agents/${id}/versions`);
      const data = await res.json();
      if (data.success) {
        setVersions(data.data);
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch(`/api/agents/${id}`).then((r) => r.json()),
      fetch(`/api/agents/${id}/versions`).then((r) => r.json()).catch(() => ({ success: false })),
      fetch('/api/knowledge-base').then((r) => r.json()).catch(() => ({ success: false })),
      fetch('/api/phone-numbers').then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([agentData, verData, kbData, phoneData]) => {
        if (!isMounted) return;
        if (agentData.success) {
          setAgent(agentData.data);
          setEditName(agentData.data.name);
          setEditWelcome(agentData.data.welcomeMessage || '');
          setEditSpeed(agentData.data.speechSpeed ?? 1.0);
          setEditModel(agentData.data.model || 'gpt-4o-mini');
          setEditVoice(agentData.data.voiceName || 'Rachel');
        } else {
          setError(agentData.error?.message || 'Agent not found');
        }
        if (verData?.success && verData.data) {
          setVersions(verData.data);
        }
        if (kbData?.success && kbData.data) {
          setOrgFiles(kbData.data);
        }
        if (phoneData?.success && phoneData.data) {
          setOrgPhones(phoneData.data);
        }
      })
      .catch((err) => {
        if (isMounted) setError((err as Error).message || 'Failed to connect to agent service');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingConfig(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          welcomeMessage: editWelcome,
          speechSpeed: editSpeed,
          model: editModel,
          voiceName: editVoice,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAgent(data.data);
        setSuccess('Agent configuration updated successfully on OmniDimension.');
      } else {
        setError(data.error?.message || 'Failed to update configuration');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to update');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveVersion = async () => {
    try {
      setIsSavingVersion(true);
      setError(null);
      const res = await fetch(`/api/agents/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: versionSnapshotName || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setVersionSnapshotName('');
        setSuccess('Version snapshot saved successfully.');
        await fetchVersions();
      } else {
        setError(data.error?.message || 'Failed to save version snapshot');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to save version');
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleRestoreVersion = async (versionNumber: number) => {
    if (!confirm(`Restore agent to Version ${versionNumber}? Current uncommitted state will be overwritten.`)) {
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/agents/${id}/versions/${versionNumber}/restore`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Agent restored to Version ${versionNumber}.`);
        await fetchAgent();
        await fetchVersions();
      } else {
        setError(data.error?.message || 'Failed to restore version');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to restore version');
    }
  };

  const handleAttachKb = async () => {
    if (!selectedFileToAttach) return;
    try {
      setIsAttaching(true);
      const res = await fetch('/api/knowledge-base/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, fileIds: [selectedFileToAttach] }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Knowledge base file attached successfully.');
        setSelectedFileToAttach('');
        await fetchAgent();
      } else {
        setError(data.error?.message || 'Failed to attach file');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to attach file');
    } finally {
      setIsAttaching(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 space-y-3">
        <Bot className="h-10 w-10 animate-bounce mx-auto text-indigo-600" />
        <p className="text-sm">Loading agent configuration from OmniDimension...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <Card className="text-center py-12">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
        <CardTitle>Agent Not Found</CardTitle>
        <CardDescription>The requested agent could not be found or has been deleted.</CardDescription>
        <Link href="/dashboard/agents" className="mt-4 inline-block">
          <Button variant="outline">Back to Agents</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/agents">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {agent.name}
              </h1>
              <Badge variant={agent.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {agent.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Provider ID: {agent.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/agents/new">
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Agent
            </Button>
          </Link>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors ${
            activeTab === 'config'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('versions')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'versions'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <History className="h-4 w-4" />
          Versions ({versions.length})
        </button>
        <button
          onClick={() => setActiveTab('kb')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'kb'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FileText className="h-4 w-4" />
          Knowledge Base
        </button>
        <button
          onClick={() => setActiveTab('phones')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'phones'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Phone className="h-4 w-4" />
          Phone Number
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <span className="text-xs text-slate-400 font-medium">Acoustic Voice</span>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
                  <Mic className="h-5 w-5 text-indigo-600" />
                  {agent.voiceName || 'Rachel'}
                </p>
                <span className="text-[11px] text-slate-400">{agent.voiceProvider || 'ElevenLabs'} • {agent.speechSpeed ?? 1.0}x speed</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <span className="text-xs text-slate-400 font-medium">Reasoning LLM</span>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-violet-600" />
                  {agent.model || 'gpt-4o-mini'}
                </p>
                <span className="text-[11px] text-slate-400">Language: {agent.language || 'English'}</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <span className="text-xs text-slate-400 font-medium">Max Duration</span>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  {Math.round((agent.maxDurationSec || 600) / 60)} min
                </p>
                <span className="text-[11px] text-slate-400">{agent.maxDurationSec || 600} seconds cap</span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spoken Welcome Greeting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                &ldquo;{agent.welcomeMessage || 'No greeting configured.'}&rdquo;
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Agent Settings</CardTitle>
            <CardDescription>Live synchronized with OmniDimension voice backend</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateConfig} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Agent Name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Welcome Message</label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  rows={3}
                  value={editWelcome}
                  onChange={(e) => setEditWelcome(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Model</label>
                  <select
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm"
                  >
                    <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                    <option value="gpt-4o">OpenAI GPT-4o</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="llama-3.1-70b">Groq Llama 3.1 70B</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Voice</label>
                  <select
                    value={editVoice}
                    onChange={(e) => setEditVoice(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm"
                  >
                    <option value="Rachel">Rachel (ElevenLabs)</option>
                    <option value="Domi">Domi (ElevenLabs)</option>
                    <option value="Bella">Bella (ElevenLabs)</option>
                    <option value="Antoni">Antoni (ElevenLabs)</option>
                    <option value="Arnold">Arnold (ElevenLabs)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3">
                <Button type="submit" disabled={isSavingConfig} className="flex items-center gap-1.5">
                  <Save className="h-4 w-4" />
                  {isSavingConfig ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === 'versions' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Version History & Snapshots</CardTitle>
                <CardDescription>Create snapshots, compare diffs, and safely roll back live configurations</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Snapshot label (e.g. Pre-Black Friday update)..."
                  value={versionSnapshotName}
                  onChange={(e) => setVersionSnapshotName(e.target.value)}
                />
                <Button onClick={handleSaveVersion} disabled={isSavingVersion} size="sm" className="shrink-0">
                  <Save className="h-4 w-4 mr-1.5" />
                  Save Snapshot
                </Button>
              </div>

              {versions.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No saved versions yet. Save a snapshot above.</p>
              ) : (
                <div className="space-y-2 pt-2">
                  {versions.map((ver) => (
                    <div
                      key={ver.versionNumber}
                      className="flex items-center justify-between p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          v{ver.versionNumber}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {ver.name || `Version ${ver.versionNumber}`}
                          </p>
                          <span className="text-[11px] text-slate-400">
                            {ver.createdAt ? new Date(ver.createdAt).toLocaleString() : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreVersion(ver.versionNumber)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'kb' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attached Knowledge Documents</CardTitle>
            <CardDescription>Documents used by this agent to ground responses during live calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <select
                value={selectedFileToAttach}
                onChange={(e) => setSelectedFileToAttach(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-xs"
              >
                <option value="">Select a knowledge base file to attach...</option>
                {orgFiles.map((f) => (
                  <option key={f.id} value={f.id}>{f.filename} ({f.mimeType})</option>
                ))}
              </select>
              <Button onClick={handleAttachKb} disabled={isAttaching || !selectedFileToAttach} size="sm">
                Attach File
              </Button>
            </div>

            <p className="text-xs text-slate-400 pt-2">
              To upload new documents, visit the{' '}
              <Link href="/dashboard/knowledge-base" className="text-indigo-600 underline">
                Knowledge Base Library
              </Link>.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'phones' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbound Phone Assignment</CardTitle>
            <CardDescription>Routing calls directly to this voice agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orgPhones.filter((p) => p.assignedAgentId === id).length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-300">No phone number currently assigned to this agent.</p>
                <Link href="/dashboard/phone-numbers" className="inline-block mt-3">
                  <Button size="sm" variant="outline">
                    Assign Phone Number →
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {orgPhones
                  .filter((p) => p.assignedAgentId === id)
                  .map((phone) => (
                    <div
                      key={phone.id}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 font-mono text-sm font-semibold">
                        <Phone className="h-4 w-4 text-emerald-600" />
                        {phone.phoneNumber}
                        <Badge variant="success" size="sm">Assigned</Badge>
                      </div>
                      <Link href="/dashboard/phone-numbers">
                        <Button variant="ghost" size="sm" className="text-xs">Manage</Button>
                      </Link>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
