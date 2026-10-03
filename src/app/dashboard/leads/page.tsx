'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Search,
  Plus,
  Upload,
  Download,
  PhoneCall,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Lead, LeadStatus, LeadPriority, LeadKPIs } from '@/types/crm';
import { Badge } from '@/components/ui/badge';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [kpis, setKpis] = useState<LeadKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState<Lead | null>(null);

  // Quick action states
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<{ id: string; phone_number: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [calling, setCalling] = useState(false);
  const [callSuccessMessage, setCallSuccessMessage] = useState('');
  const [callErrorMessage, setCallErrorMessage] = useState('');

  // Create Form State
  const [newLeadFullName, setNewLeadFullName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadCompany, setNewLeadCompany] = useState('');
  const [newLeadStatus, setNewLeadStatus] = useState<LeadStatus>('NEW');
  const [newLeadPriority, setNewLeadPriority] = useState<LeadPriority>('MEDIUM');
  const [creating, setCreating] = useState(false);

  // Import State
  interface ImportSummaryResult {
    imported: number;
    skipped: number;
    duplicates: number;
    rejected: number;
    total: number;
    errors?: Array<{ row: number; error: string }>;
  }

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummaryResult | null>(null);

  // Fetch KPIs
  const loadKpis = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/kpis');
      const data = await res.json();
      if (data.success) {
        setKpis(data.data);
      }
    } catch (err) {
      console.error('Failed to load KPIs', err);
    }
  }, []);

  // Fetch Leads
  const loadLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String((page - 1) * limit),
      });

      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (sourceFilter) params.set('sourceType', sourceFilter);

      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLeads(data.data.leads);
        setTotalLeads(data.data.total);
      }
    } catch (err) {
      console.error('Failed to fetch leads', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, priorityFilter, sourceFilter]);

  // Load Agents & Phone numbers for Call dialog
  useEffect(() => {
    let isMounted = true;
    async function loadCallResources() {
      try {
        const [agentsRes, numbersRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/phone-numbers'),
        ]);
        const agentsData = await agentsRes.json();
        const numbersData = await numbersRes.json();

        if (!isMounted) return;

        if (agentsData.success) {
          setAgents(agentsData.data || []);
          if (agentsData.data?.length > 0) {
            setSelectedAgentId(agentsData.data[0].id);
          }
        }
        if (numbersData.success) {
          setPhoneNumbers(numbersData.data || []);
          if (numbersData.data?.length > 0) {
            setSelectedPhoneId(numbersData.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load agents/numbers', err);
      }
    }
    loadCallResources();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/leads/kpis')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setKpis(data.data);
        }
      })
      .catch((err) => console.error('Failed to load KPIs', err));

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
    });

    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (sourceFilter) params.set('sourceType', sourceFilter);

    fetch(`/api/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setLeads(data.data.leads);
          setTotalLeads(data.data.total);
        }
      })
      .catch((err) => console.error('Failed to fetch leads', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [page, search, statusFilter, priorityFilter, sourceFilter]);

  // Handle Quick Call
  const handleQuickCall = async () => {
    if (!showCallModal || !selectedAgentId) return;
    setCalling(true);
    setCallSuccessMessage('');
    setCallErrorMessage('');

    try {
      const res = await fetch(`/api/leads/${showCallModal.id}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          fromNumberId: selectedPhoneId || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCallSuccessMessage(`Call initiated successfully! Call ID: ${data.data.id.slice(0, 8)}...`);
        loadLeads();
        loadKpis();
        setTimeout(() => {
          setShowCallModal(null);
          setCallSuccessMessage('');
        }, 2000);
      } else {
        setCallErrorMessage(data.error?.message || 'Failed to dispatch call');
      }
    } catch (err) {
      setCallErrorMessage((err as Error).message);
    } finally {
      setCalling(false);
    }
  };

  // Handle Create Lead
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadPhone && !newLeadEmail) {
      alert('Please provide at least a phone number or email address');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            fullName: newLeadFullName || undefined,
            phone: newLeadPhone || undefined,
            email: newLeadEmail || undefined,
            company: newLeadCompany || undefined,
          },
          lead: {
            title: newLeadFullName ? `${newLeadFullName}` : undefined,
            status: newLeadStatus,
            priority: newLeadPriority,
            sourceType: 'MANUAL',
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewLeadFullName('');
        setNewLeadPhone('');
        setNewLeadEmail('');
        setNewLeadCompany('');
        loadLeads();
        loadKpis();
      } else {
        alert(data.error?.message || 'Failed to create lead');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // Handle CSV Import
  const handleCSVImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setImportResult(data.data);
        loadLeads();
        loadKpis();
      } else {
        alert(data.error?.message || 'CSV Import failed');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'NEW':
        return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">New</Badge>;
      case 'CONTACTED':
        return <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">Contacted</Badge>;
      case 'QUALIFIED':
        return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">Qualified</Badge>;
      case 'NURTURE':
        return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">Nurture</Badge>;
      case 'CONVERTED':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">Converted</Badge>;
      case 'LOST':
        return <Badge variant="secondary" className="bg-rose-50 text-rose-700 border-rose-200">Lost</Badge>;
      case 'DISQUALIFIED':
        return <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-300">Disqualified</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: LeadPriority) => {
    switch (priority) {
      case 'URGENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Urgent</span>;
      case 'HIGH':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800">High</span>;
      case 'MEDIUM':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Medium</span>;
      case 'LOW':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">Low</span>;
      default:
        return <span>{priority}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-indigo-600" />
            CRM & Lead Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Capture, qualify, assign, and dispatch AI calls across Meta Lead Ads, inbound forms, and campaigns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/contacts"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            Contacts Directory
          </Link>
          <Link
            href="/dashboard/settings/integrations/meta"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"
          >
            Meta Lead Ads
          </Link>
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <a
            href="/api/leads/export"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-slate-500">Total Leads</span>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {kpis.totalLeads}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">All sources</div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">New Leads</span>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
              {kpis.newLeads}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Uncontacted</div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Contacted</span>
            <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">
              {kpis.contactedLeads}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Outreach initiated</div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Qualified</span>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
              {kpis.qualifiedLeads}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Sales-ready</div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Converted</span>
            <div className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">
              {kpis.convertedLeads}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Won opportunities</div>
          </div>
          <div className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Follow-ups</span>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">
              {kpis.pendingFollowUps}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Pending action</div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white dark:bg-slate-950 p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads, phone, email, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="NURTURE">Nurture</option>
            <option value="CONVERTED">Converted</option>
            <option value="LOST">Lost</option>
            <option value="DISQUALIFIED">Disqualified</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <option value="">All Sources</option>
            <option value="META_LEAD_AD">Meta Lead Ads</option>
            <option value="WEBSITE">Website Forms</option>
            <option value="MANUAL">Manual Entry</option>
            <option value="CSV">CSV Import</option>
            <option value="CAMPAIGN">Campaigns</option>
            <option value="API">API Integration</option>
          </select>

          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setPriorityFilter('');
              setSourceFilter('');
              setPage(1);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Reset Filters"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="py-3 px-4">Lead / Contact</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Owner / Agent</th>
                <th className="py-3 px-4">Next Follow-Up</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No leads found matching your criteria.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-600"
                      >
                        {lead.contact?.full_name || lead.title || 'Untitled Lead'}
                      </Link>
                      {lead.contact?.company && (
                        <div className="text-[11px] text-slate-400">{lead.contact.company}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        {lead.contact?.normalized_phone || lead.contact?.phone || '—'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                        {lead.contact?.email || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {lead.source_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(lead.status)}</td>
                    <td className="py-3 px-4">{getPriorityBadge(lead.priority)}</td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700 dark:text-slate-300">
                        {lead.assigned_user?.name || 'Unassigned'}
                      </div>
                      {lead.assigned_agent && (
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400">
                          AI: {lead.assigned_agent.name}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {lead.next_follow_up_at ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          {new Date(lead.next_follow_up_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setShowCallModal(lead)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                          title="Call Lead"
                        >
                          <PhoneCall className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between p-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div>
            Showing {leads.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
            {Math.min(page * limit, totalLeads)} of {totalLeads} leads
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= totalLeads}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-indigo-600" />
                Dispatch AI Call
              </h3>
              <button
                onClick={() => setShowCallModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg">
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {showCallModal.contact?.full_name || showCallModal.title}
                </div>
                <div className="text-slate-500 font-mono mt-0.5">
                  {showCallModal.contact?.normalized_phone || showCallModal.contact?.phone || 'No phone number available'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Voice Agent
                </label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Caller ID (Optional)
                </label>
                <select
                  value={selectedPhoneId}
                  onChange={(e) => setSelectedPhoneId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">Provider Default Number</option>
                  {phoneNumbers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.phone_number}
                    </option>
                  ))}
                </select>
              </div>

              {callSuccessMessage && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {callSuccessMessage}
                </div>
              )}

              {callErrorMessage && (
                <div className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {callErrorMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCallModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickCall}
                  disabled={calling || (!showCallModal.contact?.phone && !showCallModal.contact?.normalized_phone)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {calling ? 'Dispatching...' : 'Dispatch Call'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Lead Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Add New CRM Lead</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={newLeadFullName}
                  onChange={(e) => setNewLeadFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phone (E.164)
                  </label>
                  <input
                    type="text"
                    placeholder="+14155552671"
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Health"
                  value={newLeadCompany}
                  onChange={(e) => setNewLeadCompany(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={newLeadStatus}
                    onChange={(e) => setNewLeadStatus(e.target.value as LeadStatus)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="NEW">New</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="NURTURE">Nurture</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={newLeadPriority}
                    onChange={(e) => setNewLeadPriority(e.target.value as LeadPriority)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                Import Leads from CSV
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCSVImport} className="mt-4 space-y-4 text-xs">
              <p className="text-slate-500">
                Upload a CSV file containing columns for <code>name</code>, <code>phone</code>, <code>email</code>, and <code>company</code>. Duplicate records will be automatically detected and safely skipped or linked.
              </p>

              <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {importResult && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg space-y-1 text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Import Results:</div>
                  <div className="text-emerald-600">✓ {importResult.imported} leads successfully imported</div>
                  <div className="text-amber-600">⚠ {importResult.duplicates} duplicate leads detected</div>
                  {importResult.rejected > 0 && (
                    <div className="text-rose-600">✕ {importResult.rejected} invalid rows rejected</div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportResult(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importing || !csvFile}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {importing ? 'Processing...' : 'Start Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
