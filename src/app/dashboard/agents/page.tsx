'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
  AlertCircle,
  Cpu,
  Mic,
  Calendar,
  Layers,
} from 'lucide-react';
import type { NormalizedAgent } from '@/lib/providers/voice/provider-types';

export default function AgentsPage() {
  const [agents, setAgents] = useState<NormalizedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.success) {
        setAgents(data.data);
      } else {
        setError(data.error?.message || 'Failed to load agents');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to connect to agent service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setAgents(data.data.agents || []);
        } else {
          setError(data.error?.message || 'Failed to load agents');
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
  }, []);

  const handleDelete = async (agentId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete agent "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(agentId);
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAgents((prev) => prev.filter((a) => a.id !== agentId));
      } else {
        alert(data.error?.message || 'Failed to delete agent');
      }
    } catch (err) {
      alert((err as Error).message || 'Failed to delete agent');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.voiceName && a.voiceName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.model && a.model.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-indigo-600" />
            AI Voice Agents
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Build, configure, and manage conversational voice agents deployed on OmniDimension.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAgents}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Link href="/dashboard/agents/new">
            <Button size="sm" className="flex items-center gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" />
              Create Agent
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start justify-between gap-3 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to Load Agents</p>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
              {error.includes('not connected') && (
                <Link
                  href="/dashboard/settings/integrations"
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  Connect OmniDimension in Settings →
                </Link>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={fetchAgents}>
            Retry
          </Button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search agents by name, voice, or LLM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-xs text-slate-400">
          Showing {filtered.length} of {agents.length} agents
        </div>
      </div>

      {/* Agent Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-slate-100 dark:bg-slate-900 rounded-t-xl" />
              <CardContent className="h-32 bg-slate-50 dark:bg-slate-950/50" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 px-4 border-dashed">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Bot className="h-7 w-7" />
          </div>
          <CardTitle className="text-lg">No Voice Agents Found</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-1.5">
            {searchQuery
              ? 'No agents match your search filter. Try clearing the search query.'
              : 'Create your first AI voice agent to handle inbound inquiries, automated support, and conversational workflows.'}
          </CardDescription>
          <div className="mt-5">
            <Link href="/dashboard/agents/new">
              <Button size="sm" className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Create New Agent
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((agent) => (
            <Card key={agent.id} className="flex flex-col justify-between hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-snug">{agent.name}</CardTitle>
                      <CardDescription className="text-xs truncate max-w-[180px]">
                        {agent.model || 'gpt-4o-mini'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={agent.status === 'ACTIVE' ? 'success' : 'secondary'} size="sm">
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-1 flex-1">
                {agent.welcomeMessage && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 italic bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    &ldquo;{agent.welcomeMessage}&rdquo;
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="truncate">{agent.voiceName || 'Rachel'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-violet-500" />
                    <span className="truncate">{agent.language || 'English'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Created {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'Recently'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Link href={`/dashboard/agents/${agent.id}`}>
                    <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Configure
                    </Button>
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(agent.id, agent.name)}
                    disabled={deletingId === agent.id}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 h-8 px-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
