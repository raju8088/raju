'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Plus,
  Search,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Bot,
  Phone,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  agent_name?: string;
  phone_number_display?: string;
  concurrency: number;
  timezone: string;
  total_contacts: number;
  completed_contacts: number;
  failed_contacts: number;
  started_at: string | null;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCampaigns = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', '10');
      if (statusFilter) params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to load campaigns');
      }

      setCampaigns(json.data.campaigns || []);
      setTotalPages(json.data.totalPages || 1);
      setTotalCount(json.data.total || 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [currentPage, statusFilter, searchQuery]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set('page', String(currentPage));
        params.set('limit', '10');
        if (statusFilter) params.set('status', statusFilter);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        const res = await fetch(`/api/campaigns?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message || json.message || 'Failed to load campaigns');
        }

        if (active) {
          setCampaigns(json.data.campaigns || []);
          setTotalPages(json.data.totalPages || 1);
          setTotalCount(json.data.total || 0);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [currentPage, statusFilter, searchQuery]);

  // Handle Quick Lifecycle Actions
  const handleQuickAction = async (campaignId: string, action: 'start' | 'pause' | 'resume') => {
    setActionLoadingId(campaignId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/${action}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || `Failed to ${action} campaign`);
      }
      await fetchCampaigns(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    switch (s) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            In Progress
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
            Paused
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'CANCELED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
            <XCircle className="h-3 w-3 text-rose-600" />
            Canceled
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
            <Clock className="h-3 w-3 text-slate-500" />
            Draft
          </span>
        );
    }
  };

  // Metrics calculation
  const inProgressCount = campaigns.filter((c) => c.status === 'IN_PROGRESS').length;
  const completedCount = campaigns.filter((c) => c.status === 'COMPLETED').length;
  const totalContactsSum = campaigns.reduce((acc, c) => acc + (c.total_contacts || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Bulk Call Campaigns
            </h1>
            <Badge variant="outline" className="text-xs font-medium">Phase 5</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Dispatch high-volume voice campaigns with number rotation, contact variables, and adaptive retry.
          </p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button variant="primary" className="gap-2">
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Campaigns</span>
            <div className="rounded-lg p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Megaphone className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCount}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Calling</span>
            <div className="rounded-lg p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Play className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</span>
            <span className="text-xs text-slate-400">In Progress</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed Campaigns</span>
            <div className="rounded-lg p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Contacts</span>
            <div className="rounded-lg p-2 bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {totalContactsSum.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by campaign status"
              className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PAUSED">Paused</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELED">Canceled</option>
            </select>

            <Button
              variant="outline"
              size="md"
              onClick={() => fetchCampaigns(true)}
              disabled={isLoading}
              title="Refresh Campaigns"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Campaigns Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">Campaign</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Voice Agent</th>
                <th className="py-3 px-4 font-medium">Caller / Pool</th>
                <th className="py-3 px-4 font-medium">Contacts / Progress</th>
                <th className="py-3 px-4 font-medium">Concurrency</th>
                <th className="py-3 px-4 font-medium">Created</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading && campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
                      <span>Loading campaigns...</span>
                    </div>
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="rounded-full bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 mb-3">
                        <Megaphone className="h-6 w-6" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        No campaigns found
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                        {searchQuery || statusFilter
                          ? 'No campaigns match your selected filter criteria.'
                          : 'You have not created any bulk outbound campaigns yet.'}
                      </p>
                      <Link href="/dashboard/campaigns/new">
                        <Button variant="primary" size="sm" className="gap-2">
                          <Plus className="h-4 w-4" />
                          Create First Campaign
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                campaigns.map((camp) => {
                  const percent =
                    camp.total_contacts > 0
                      ? Math.min(100, Math.round((camp.completed_contacts / camp.total_contacts) * 100))
                      : 0;

                  return (
                    <tr
                      key={camp.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/dashboard/campaigns/${camp.id}`}
                          className="font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                        >
                          {camp.name}
                        </Link>
                        {camp.description && (
                          <p className="text-xs text-slate-400 truncate max-w-xs">{camp.description}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(camp.status)}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <Bot className="h-3.5 w-3.5 text-indigo-500" />
                          <span>{camp.agent_name || 'Assigned Bot'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{camp.phone_number_display || 'Pool Rotation'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="w-36">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {camp.completed_contacts} / {camp.total_contacts}
                            </span>
                            <span className="text-slate-400">{percent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {camp.concurrency} calls
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(camp.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Quick Lifecycle Controls */}
                          {camp.status === 'DRAFT' && camp.total_contacts > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === camp.id}
                              onClick={() => handleQuickAction(camp.id, 'start')}
                              className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                            >
                              <Play className="h-3 w-3 mr-1 text-emerald-600" />
                              Start
                            </Button>
                          )}
                          {camp.status === 'IN_PROGRESS' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === camp.id}
                              onClick={() => handleQuickAction(camp.id, 'pause')}
                              className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                            >
                              <Pause className="h-3 w-3 mr-1 text-amber-600" />
                              Pause
                            </Button>
                          )}
                          {camp.status === 'PAUSED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actionLoadingId === camp.id}
                              onClick={() => handleQuickAction(camp.id, 'resume')}
                              className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300"
                            >
                              <Play className="h-3 w-3 mr-1 text-blue-600" />
                              Resume
                            </Button>
                          )}

                          <Link href={`/dashboard/campaigns/${camp.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              Details
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <div>
              Showing page <span className="font-semibold">{currentPage}</span> of{' '}
              <span className="font-semibold">{totalPages}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
