'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Sliders,
  Clock,
  Download,
  Search,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  agent_id: string;
  agent_name?: string;
  phone_number_id: string;
  phone_number_display?: string;
  concurrency: number;
  timezone: string;
  retry_policy?: {
    auto_retry?: boolean;
    retry_limit?: number;
    failureReasons?: string[];
  };
  calling_window?: {
    enabled?: boolean;
    startTime?: number;
    stopTime?: number;
    timezone?: string;
  };
  total_contacts: number;
  completed_contacts: number;
  failed_contacts: number;
  connected_contacts: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface CampaignContact {
  id: string;
  phone_number: string;
  normalized_phone_number: string;
  custom_variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  failure_reason: string | null;
  attempt_count: number;
  duration_seconds: number;
  last_attempt_at: string | null;
  completed_at: string | null;
}

interface PoolNumber {
  id: string;
  phone_number_id: string;
  phone_number: string;
  is_active: boolean;
  sequence: number;
  health_score: number | null;
  calls_count: number;
}

interface LiveStatusInfo {
  inProgress?: number;
  queued?: number;
  completed?: number;
  busy?: number;
  noAnswer?: number;
  failed?: number;
  [key: string]: unknown;
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [poolNumbers, setPoolNumbers] = useState<PoolNumber[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatusInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'contacts' | 'pool' | 'analytics'>('contacts');

  // Contacts Pagination & Filter
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsTotalPages, setContactsTotalPages] = useState(1);
  const [contactsTotalCount, setContactsTotalCount] = useState(0);

  // Modals
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  const [isConcurrencyModalOpen, setIsConcurrencyModalOpen] = useState(false);
  const [isCallingWindowModalOpen, setIsCallingWindowModalOpen] = useState(false);
  const [isAddNumberModalOpen, setIsAddNumberModalOpen] = useState(false);
  const [isAddContactsModalOpen, setIsAddContactsModalOpen] = useState(false);

  // Modal Inputs
  const [newConcurrency, setNewConcurrency] = useState(2);
  const [retryReasons, setRetryReasons] = useState<string[]>(['no-answer', 'busy', 'failed']);
  const [retryMax, setRetryMax] = useState(2);
  const [windowStartTime, setWindowStartTime] = useState(9);
  const [windowStopTime, setWindowStopTime] = useState(18);
  const [availablePhones, setAvailablePhones] = useState<Array<{ id: string; phone_number: string }>>([]);
  const [selectedPoolPhoneId, setSelectedPoolPhoneId] = useState('');
  const [additionalContactsText, setAdditionalContactsText] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Fetch Campaign Details
  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || json.message || 'Failed to load campaign');
      setCampaign(json.data);
      setNewConcurrency(json.data.concurrency || 2);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  // Fetch Contacts
  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(contactsPage));
      params.set('limit', '15');
      if (contactStatusFilter) params.set('status', contactStatusFilter);
      if (contactSearch.trim()) params.set('search', contactSearch.trim());

      const res = await fetch(`/api/campaigns/${id}/contacts?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setContacts(json.data.contacts || []);
        setContactsTotalPages(json.data.totalPages || 1);
        setContactsTotalCount(json.data.total || 0);
      }
    } catch {
      // Ignore
    }
  }, [id, contactsPage, contactStatusFilter, contactSearch]);

  // Fetch Pool Numbers
  const fetchPoolNumbers = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/numbers`);
      const json = await res.json();
      if (res.ok) setPoolNumbers(json.data || []);
    } catch {
      // Ignore
    }
  }, [id]);

  // Fetch Live Status Probe
  const fetchLiveStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/status`);
      const json = await res.json();
      if (res.ok) setLiveStatus(json.data);
    } catch {
      // Ignore
    }
  }, [id]);

  // Load All on Mount
  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      try {
        await Promise.all([
          fetchCampaign(),
          fetchContacts(),
          fetchPoolNumbers(),
          fetchLiveStatus(),
        ]);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadAll();
    return () => {
      active = false;
    };
  }, [fetchCampaign, fetchContacts, fetchPoolNumbers, fetchLiveStatus]);

  // Fetch available numbers for pool modal
  useEffect(() => {
    fetch('/api/phone-numbers')
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setAvailablePhones(json.data);
          if (json.data.length > 0) setSelectedPoolPhoneId(json.data[0].id);
        }
      })
      .catch(() => null);
  }, []);

  // Handlers for Lifecycle Actions
  const handleLifecycle = async (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || json.message || `Failed to ${action} campaign`);
      await fetchCampaign();
      await fetchLiveStatus();
      setIsStartModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateConcurrency = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/concurrency`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency: newConcurrency }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to update concurrency');
      await fetchCampaign();
      setIsConcurrencyModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateCallingWindow = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/calling-window`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDailyHardStop: true,
          dailyStopTime: windowStopTime,
          dailyStopTimezone: campaign?.timezone || 'UTC',
          enableDailyAutoStart: true,
          dailyStartTime: windowStartTime,
          dailyStartTimezone: campaign?.timezone || 'UTC',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to update calling window');
      await fetchCampaign();
      setIsCallingWindowModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRetrySubmit = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retryStrategy: 'all',
          maxRetries: retryMax,
          failureReasons: retryReasons,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to submit retry request');
      await fetchContacts();
      await fetchCampaign();
      setIsRetryModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAddNumberToPool = async () => {
    if (!selectedPoolPhoneId) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: selectedPoolPhoneId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to add number to pool');
      await fetchPoolNumbers();
      setIsAddNumberModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleTogglePoolActive = async (poolNumId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/campaigns/${id}/numbers/${poolNumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) await fetchPoolNumbers();
    } catch {
      // Ignore
    }
  };

  const handleImportMoreContacts = async () => {
    if (!additionalContactsText.trim()) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: additionalContactsText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Failed to import contacts');
      await fetchContacts();
      await fetchCampaign();
      setAdditionalContactsText('');
      setIsAddContactsModalOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading && !campaign) {
    return (
      <div className="py-24 text-center text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-500 mb-2" />
        <p className="text-xs">Loading campaign details...</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="py-16 text-center">
        <ShieldAlert className="h-10 w-10 text-rose-500 mx-auto mb-2" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Failed to load campaign</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{error || 'Campaign not found'}</p>
        <Link href="/dashboard/campaigns" className="inline-block mt-4 text-xs text-indigo-600 hover:underline">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  // Analytics formulas
  const total = campaign.total_contacts || 0;
  const completed = campaign.completed_contacts || 0;
  const failed = campaign.failed_contacts || 0;
  const connected = campaign.connected_contacts || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const dialed = completed + failed;
  const connectionRate = dialed > 0 ? Math.round((connected / dialed) * 100) : 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Campaigns
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {campaign.name}
            </h1>
            <Badge
              variant={
                campaign.status === 'IN_PROGRESS'
                  ? 'info'
                  : campaign.status === 'COMPLETED'
                  ? 'success'
                  : campaign.status === 'PAUSED'
                  ? 'warning'
                  : 'neutral'
              }
            >
              {campaign.status}
            </Badge>
          </div>
          {campaign.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{campaign.description}</p>
          )}
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {campaign.status === 'DRAFT' && (
            <Button
              variant="primary"
              size="sm"
              disabled={isActionLoading || total === 0}
              onClick={() => setIsStartModalOpen(true)}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <Play className="h-3.5 w-3.5" />
              Start Campaign
            </Button>
          )}

          {campaign.status === 'IN_PROGRESS' && (
            <Button
              variant="outline"
              size="sm"
              disabled={isActionLoading}
              onClick={() => handleLifecycle('pause')}
              className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800"
            >
              <Pause className="h-3.5 w-3.5 text-amber-600" />
              Pause
            </Button>
          )}

          {campaign.status === 'PAUSED' && (
            <Button
              variant="primary"
              size="sm"
              disabled={isActionLoading}
              onClick={() => handleLifecycle('resume')}
              className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </Button>
          )}

          {(campaign.status === 'IN_PROGRESS' || campaign.status === 'PAUSED') && (
            <Button
              variant="outline"
              size="sm"
              disabled={isActionLoading}
              onClick={() => handleLifecycle('cancel')}
              className="gap-1.5 text-xs text-rose-700 border-rose-300 hover:bg-rose-50 dark:border-rose-800"
            >
              <XCircle className="h-3.5 w-3.5 text-rose-600" />
              Cancel
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsRetryModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConcurrencyModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Sliders className="h-3.5 w-3.5" />
            Concurrency ({campaign.concurrency})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCallingWindowModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Clock className="h-3.5 w-3.5" />
            Calling Window
          </Button>
        </div>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Total Contacts</span>
          <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{total}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Completed</span>
          <div className="mt-1 text-xl font-bold text-emerald-600">{completed}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Connected</span>
          <div className="mt-1 text-xl font-bold text-indigo-600">{connected}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Unconnected / Failed</span>
          <div className="mt-1 text-xl font-bold text-rose-600">{failed}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Connect Rate</span>
          <div className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-200">{connectionRate}%</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-medium text-slate-500 uppercase tracking-wider">Completion</span>
          <div className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-200">{completionRate}%</div>
        </div>
      </div>

      {/* Live Status Probe Box */}
      {liveStatus && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                Live OmniDimension Provider Telemetry
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchLiveStatus}
              className="h-6 text-2xs gap-1 text-blue-700 dark:text-blue-300"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 text-xs">
            <div>
              <span className="text-slate-500">Live Active Calls:</span>
              <span className="font-bold ml-2 text-slate-900 dark:text-slate-100">{liveStatus.inProgress || 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Queued Contacts:</span>
              <span className="font-bold ml-2 text-slate-900 dark:text-slate-100">{liveStatus.queued || 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Provider Completed:</span>
              <span className="font-bold ml-2 text-slate-900 dark:text-slate-100">{liveStatus.completed || 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Provider Busy/No-Ans:</span>
              <span className="font-bold ml-2 text-slate-900 dark:text-slate-100">
                {(liveStatus.busy || 0) + (liveStatus.noAnswer || 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`pb-2.5 font-medium transition-colors ${
            activeTab === 'contacts'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Contacts ({total})
        </button>
        <button
          onClick={() => setActiveTab('pool')}
          className={`pb-2.5 font-medium transition-colors ${
            activeTab === 'pool'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Number Rotation Pool ({poolNumbers.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-2.5 font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Configuration & Audit
        </button>
      </div>

      {/* TAB 1: Contacts Table */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search phone number..."
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  setContactsPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={contactStatusFilter}
                onChange={(e) => {
                  setContactStatusFilter(e.target.value);
                  setContactsPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="BUSY">Busy</option>
                <option value="NO_ANSWER">No Answer</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddContactsModalOpen(true)}
                className="h-8 text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Contacts
              </Button>

              <a href={`/api/campaigns/${id}/export`} download>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </a>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 text-slate-500">
                    <th className="py-2.5 px-3 font-medium">Destination</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium">Attempts</th>
                    <th className="py-2.5 px-3 font-medium">Duration</th>
                    <th className="py-2.5 px-3 font-medium">Failure Reason</th>
                    <th className="py-2.5 px-3 font-medium">Custom Variables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {contacts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No contacts found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                          {c.normalized_phone_number || c.phone_number}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-2xs font-semibold ${
                              c.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : c.status === 'FAILED' || c.status === 'BUSY' || c.status === 'NO_ANSWER'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                : c.status === 'IN_PROGRESS'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{c.attempt_count}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {c.duration_seconds > 0 ? `${c.duration_seconds}s` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{c.failure_reason || '—'}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-2xs max-w-xs truncate">
                          {Object.keys(c.custom_variables || {}).length > 0
                            ? JSON.stringify(c.custom_variables)
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Contacts Pagination */}
            {contactsTotalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-2xs text-slate-500">
                <span>
                  Page {contactsPage} of {contactsTotalPages} ({contactsTotalCount} total)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={contactsPage <= 1}
                    onClick={() => setContactsPage((p) => Math.max(1, p - 1))}
                    className="h-6 px-2 text-2xs"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={contactsPage >= contactsTotalPages}
                    onClick={() => setContactsPage((p) => Math.min(contactsTotalPages, p + 1))}
                    className="h-6 px-2 text-2xs"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Number Rotation Pool */}
      {activeTab === 'pool' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Outbound Number Pool
              </h3>
              <p className="text-2xs text-slate-500">
                Distribute outbound volume across multiple numbers to avoid carrier spam flagging and maximize pickup rates.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddNumberModalOpen(true)}
              className="gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Number to Pool
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Phone Number</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Sequence</th>
                  <th className="py-2.5 px-4 font-medium">Calls Placed</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {poolNumbers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No rotation numbers added to this campaign yet.
                    </td>
                  </tr>
                ) : (
                  poolNumbers.map((num) => (
                    <tr key={num.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {num.phone_number}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-2xs font-semibold ${
                            num.is_active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {num.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{num.sequence}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{num.calls_count}</td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTogglePoolActive(num.id, num.is_active)}
                          className="h-6 text-2xs"
                        >
                          {num.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Configuration & Audit */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Campaign Configuration</h3>
            <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex justify-between pt-1">
                <span className="text-slate-500">Campaign ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{campaign.id}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Assigned Voice Agent:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{campaign.agent_name || campaign.agent_id}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Primary Outbound Caller ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{campaign.phone_number_display || 'Rotation Pool'}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Concurrent Call Limit:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{campaign.concurrency} channels</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Timezone:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{campaign.timezone}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Timestamps & Execution</h3>
            <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex justify-between pt-1">
                <span className="text-slate-500">Created:</span>
                <span className="text-slate-800 dark:text-slate-200">{new Date(campaign.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Started At:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {campaign.started_at ? new Date(campaign.started_at).toLocaleString() : 'Not started'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Paused At:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {campaign.paused_at ? new Date(campaign.paused_at).toLocaleString() : '—'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Completed At:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {campaign.completed_at ? new Date(campaign.completed_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* START CONFIRMATION MODAL (Section 49 of prompt) */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        title="Confirm Campaign Dispatch"
        description="High-impact outbound voice operation"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">This will begin real outbound phone calls.</p>
              <p className="mt-0.5">Calls will immediately be placed according to your configured concurrency limit.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
            <div className="flex justify-between py-2 px-3">
              <span className="text-slate-500">Contacts to Call:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 px-3">
              <span className="text-slate-500">Concurrency:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{campaign.concurrency} simultaneous calls</span>
            </div>
            <div className="flex justify-between py-2 px-3">
              <span className="text-slate-500">Timezone:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{campaign.timezone}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsStartModalOpen(false)}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isActionLoading}
              onClick={() => handleLifecycle('start')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirm & Start Calling
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADJUST CONCURRENCY MODAL */}
      <Modal
        isOpen={isConcurrencyModalOpen}
        onClose={() => setIsConcurrencyModalOpen(false)}
        title="Adjust Campaign Concurrency"
        description="Set the maximum simultaneous outbound lines"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Concurrent Call Limit (1–50)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={newConcurrency}
              onChange={(e) => setNewConcurrency(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsConcurrencyModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={handleUpdateConcurrency}>
              Save Concurrency
            </Button>
          </div>
        </div>
      </Modal>

      {/* CALLING WINDOW MODAL */}
      <Modal
        isOpen={isCallingWindowModalOpen}
        onClose={() => setIsCallingWindowModalOpen(false)}
        title="Configure Calling Window"
        description="Daily start and hard stop hours"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-medium text-slate-600 mb-1">Start Time (Hour 0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={windowStartTime}
                onChange={(e) => setWindowStartTime(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-2xs font-medium text-slate-600 mb-1">Stop Time (Hour 0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={windowStopTime}
                onChange={(e) => setWindowStopTime(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCallingWindowModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={handleUpdateCallingWindow}>
              Save Calling Window
            </Button>
          </div>
        </div>
      </Modal>

      {/* RETRY CONTACTS MODAL */}
      <Modal
        isOpen={isRetryModalOpen}
        onClose={() => setIsRetryModalOpen(false)}
        title="Retry Eligible Contacts"
        description="Re-queue contacts that did not successfully connect"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Maximum Retries per Contact
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={retryMax}
              onChange={(e) => setRetryMax(parseInt(e.target.value, 10))}
              className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Select Failure Reasons to Retry:
            </label>
            <div className="flex items-center gap-3">
              {['no-answer', 'busy', 'failed'].map((reason) => (
                <label key={reason} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retryReasons.includes(reason)}
                    onChange={() => {
                      if (retryReasons.includes(reason)) {
                        setRetryReasons(retryReasons.filter((r) => r !== reason));
                      } else {
                        setRetryReasons([...retryReasons, reason]);
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsRetryModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={handleRetrySubmit}>
              Submit Retry Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADD NUMBER TO POOL MODAL */}
      <Modal
        isOpen={isAddNumberModalOpen}
        onClose={() => setIsAddNumberModalOpen(false)}
        title="Add Number to Rotation Pool"
        description="Expand caller pool for this campaign"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Select Phone Number
            </label>
            <select
              value={selectedPoolPhoneId}
              onChange={(e) => setSelectedPoolPhoneId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {availablePhones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phone_number}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddNumberModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={handleAddNumberToPool}>
              Add to Pool
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADD CONTACTS MODAL */}
      <Modal
        isOpen={isAddContactsModalOpen}
        onClose={() => setIsAddContactsModalOpen(false)}
        title="Import Additional Contacts"
        description="Add more destination contacts to this campaign"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Paste Contacts (CSV Format with Header)
            </label>
            <textarea
              value={additionalContactsText}
              onChange={(e) => setAdditionalContactsText(e.target.value)}
              placeholder="phone_number,name&#10;+14155552671,Ravi&#10;+919876543210,Aditi"
              rows={5}
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddContactsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={handleImportMoreContacts}>
              Import Contacts
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
