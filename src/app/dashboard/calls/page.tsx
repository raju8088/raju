'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  RefreshCw,
  Plus,
  FileText,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Headphones,
} from 'lucide-react';
import { NormalizedCallDTO } from '@/services/call.service';
import { NormalizedAgent, NormalizedPhoneNumber } from '@/lib/providers/voice/provider-types';
import { DispatchModal } from '@/components/calls/dispatch-modal';
import { Badge } from '@/components/ui/badge';

export default function CallsPage() {
  const [calls, setCalls] = useState<NormalizedCallDTO[]>([]);
  const [agents, setAgents] = useState<NormalizedAgent[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<NormalizedPhoneNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dispatch modal
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  const fetchCalls = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', '15');
      if (statusFilter) params.set('status', statusFilter);
      if (directionFilter) params.set('direction', directionFilter);
      if (agentFilter) params.set('agentId', agentFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/calls?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to load calls');
      }

      setCalls(json.data.calls || []);
      setTotalPages(json.data.totalPages || 1);
      setTotalCount(json.data.total || 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [currentPage, statusFilter, directionFilter, agentFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch('/api/agents').then((r) => r.json()).catch(() => null),
      fetch('/api/phone-numbers').then((r) => r.json()).catch(() => null),
    ]).then(([agentsJson, phonesJson]) => {
      if (!isMounted) return;
      if (agentsJson?.data) setAgents(agentsJson.data);
      if (phonesJson?.data) setPhoneNumbers(phonesJson.data);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('limit', '15');
    if (statusFilter) params.set('status', statusFilter);
    if (directionFilter) params.set('direction', directionFilter);
    if (agentFilter) params.set('agentId', agentFilter);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    fetch(`/api/calls?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setCalls(json.data.calls || []);
          setTotalPages(json.data.totalPages || 1);
          setTotalCount(json.data.total || 0);
        } else {
          setError(json.error?.message || json.message || 'Failed to load calls');
        }
      })
      .catch((err) => {
        if (isMounted) setError((err as Error).message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentPage, statusFilter, directionFilter, agentFilter, searchQuery]);

  const handleDispatched = (newCall: NormalizedCallDTO) => {
    setCalls([newCall, ...calls]);
    setTotalCount((c) => c + 1);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="info">In Progress</Badge>;
      case 'RINGING':
        return <Badge variant="info">Ringing</Badge>;
      case 'QUEUED':
        return <Badge variant="info">Queued</Badge>;
      case 'BUSY':
        return <Badge variant="warning">Busy</Badge>;
      case 'NO_ANSWER':
        return <Badge variant="warning">No Answer</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Failed</Badge>;
      case 'CANCELED':
        return <Badge variant="neutral">Canceled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-primary" />
            <span>Call History & Logs</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dispatch AI voice calls, track telephony delivery, review transcripts, and listen to recordings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCalls()}
            className="p-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted"
            title="Refresh logs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsDispatchModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 shadow-xs hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>Dispatch Call</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          {/* Search Destination */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search phone number..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RINGING">Ringing</option>
            <option value="QUEUED">Queued</option>
            <option value="BUSY">Busy</option>
            <option value="NO_ANSWER">No Answer</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All Directions</option>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>

          {/* Agent Filter */}
          <select
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing {calls.length} of {totalCount} calls
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Call Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Audio / Text</th>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <span className="animate-spin inline-block h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                    <p className="mt-2 text-xs">Loading call logs...</p>
                  </td>
                </tr>
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground">
                    <PhoneCall className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <h3 className="font-semibold text-foreground text-base">No calls found</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      No call records match your current filters. Dispatch an outbound call to get started.
                    </p>
                    <button
                      onClick={() => setIsDispatchModalOpen(true)}
                      className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Dispatch First Call</span>
                    </button>
                  </td>
                </tr>
              ) : (
                calls.map((call) => (
                  <tr key={call.id} className="hover:bg-muted/40 transition-colors">
                    {/* Direction */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {call.direction === 'inbound' ? (
                          <div className="p-1.5 rounded-full bg-blue-500/10 text-blue-500" title="Inbound Call">
                            <PhoneIncoming className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-500" title="Outbound Call">
                            <PhoneOutgoing className="h-4 w-4" />
                          </div>
                        )}
                        <span className="capitalize text-xs font-medium text-foreground">{call.direction}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {getStatusBadge(call.status)}
                    </td>

                    {/* Agent */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-foreground font-medium">
                      {call.agentName || 'Default Agent'}
                    </td>

                    {/* Destination */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-foreground">
                      {call.destinationNumber}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{call.durationDisplay}</span>
                    </td>

                    {/* Indicators */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {call.recordingUrl ? (
                          <span className="p-1 rounded-md bg-purple-500/10 text-purple-500" title="Recording available">
                            <Headphones className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        {call.transcript ? (
                          <span className="p-1 rounded-md bg-blue-500/10 text-blue-500" title="Transcript available">
                            <FileText className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        {!call.recordingUrl && !call.transcript && (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(call.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <Link
                        href={`/dashboard/calls/${call.id}`}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      <DispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        onDispatched={handleDispatched}
        agents={agents}
        phoneNumbers={phoneNumbers}
      />
    </div>
  );
}
