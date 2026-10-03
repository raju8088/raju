'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  UserCheck,
  Phone,
  PhoneCall,
  Mail,
  Building2,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Send,
  User,
  Activity,
  Layers,
} from 'lucide-react';
import {
  Lead,
  LeadStatus,
  LeadActivity,
  LeadNote,
} from '@/types/crm';
import { CallRecord } from '@/lib/db/repositories/call.repository';
import { CampaignContactRecord } from '@/lib/db/repositories/campaign-contact.repository';
import { Badge } from '@/components/ui/badge';

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignContactRecord[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab State: 'overview' | 'timeline' | 'calls' | 'campaigns' | 'notes'
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'calls' | 'campaigns' | 'notes'>('overview');

  // Modals & Forms
  const [showCallModal, setShowCallModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);

  // Call resources
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [calling, setCalling] = useState(false);
  const [callSuccessMessage, setCallSuccessMessage] = useState('');
  const [callErrorMessage, setCallErrorMessage] = useState('');

  // Status & Follow-up State
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus>('NEW');
  const [followUpDate, setFollowUpDate] = useState('');

  // Note Input
  const [newNoteBody, setNewNoteBody] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Load Lead details and related collections
  const loadLeadData = useCallback(async () => {
    if (!leadId) return;
    try {
      const [leadRes, actRes, callRes, campRes, noteRes] = await Promise.all([
        fetch(`/api/leads/${leadId}`),
        fetch(`/api/leads/${leadId}/activities`),
        fetch(`/api/leads/${leadId}/calls`),
        fetch(`/api/leads/${leadId}/campaigns`),
        fetch(`/api/leads/${leadId}/notes`),
      ]);

      const leadData = await leadRes.json();
      const actData = await actRes.json();
      const callData = await callRes.json();
      const campData = await campRes.json();
      const noteData = await noteRes.json();

      if (leadData.success) {
        setLead(leadData.data);
        setSelectedStatus(leadData.data.status);
      }
      if (actData.success) setActivities(actData.data || []);
      if (callData.success) setCalls(callData.data || []);
      if (campData.success) setCampaigns(campData.data || []);
      if (noteData.success) setNotes(noteData.data || []);
    } catch (err) {
      console.error('Failed to load lead details', err);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    let isMounted = true;
    if (!leadId) return;

    Promise.all([
      fetch(`/api/leads/${leadId}`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/activities`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/calls`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/campaigns`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/notes`).then((r) => r.json()),
    ])
      .then(([leadData, actData, callData, campData, noteData]) => {
        if (!isMounted) return;
        if (leadData.success && leadData.data) {
          setLead(leadData.data);
          setSelectedStatus(leadData.data.status);
        }
        if (actData.success) setActivities(actData.data || []);
        if (callData.success) setCalls(callData.data || []);
        if (campData.success) setCampaigns(campData.data || []);
        if (noteData.success) setNotes(noteData.data || []);
      })
      .catch((err) => console.error('Failed to load lead details', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [leadId]);

  // Load team users and agents
  useEffect(() => {
    async function loadResources() {
      try {
        const [agentsRes, usersRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/users'),
        ]);
        const agentsData = await agentsRes.json();
        const usersData = await usersRes.json();

        if (agentsData.success) {
          setAgents(agentsData.data || []);
          if (agentsData.data?.length > 0) setSelectedAgentId(agentsData.data[0].id);
        }
        if (usersData.success) {
          setUsers(usersData.data || []);
        }
      } catch (err) {
        console.error('Failed to load resources', err);
      }
    }
    loadResources();
  }, []);

  // Handle Call Dispatch
  const handleDispatchCall = async () => {
    if (!selectedAgentId) return;
    setCalling(true);
    setCallSuccessMessage('');
    setCallErrorMessage('');

    try {
      const res = await fetch(`/api/leads/${leadId}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (data.success) {
        setCallSuccessMessage(`Call successfully dispatched! Call ID: ${data.data.id.slice(0, 8)}...`);
        loadLeadData();
        setTimeout(() => {
          setShowCallModal(false);
          setCallSuccessMessage('');
        }, 2000);
      } else {
        setCallErrorMessage(data.error?.message || 'Call dispatch failed');
      }
    } catch (err) {
      setCallErrorMessage((err as Error).message);
    } finally {
      setCalling(false);
    }
  };

  // Handle Status Update
  const handleUpdateStatus = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setShowStatusModal(false);
        loadLeadData();
      } else {
        alert(data.error?.message || 'Failed to update status');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Handle Assign
  const handleAssign = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAssignModal(false);
        loadLeadData();
      } else {
        alert(data.error?.message || 'Failed to assign lead');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Handle Follow-Up
  const handleScheduleFollowUp = async () => {
    if (!followUpDate) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpAt: new Date(followUpDate).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowFollowUpModal(false);
        loadLeadData();
      } else {
        alert(data.error?.message || 'Failed to schedule follow-up');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Handle Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim()) return;

    setAddingNote(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newNoteBody.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewNoteBody('');
        loadLeadData();
      } else {
        alert(data.error?.message || 'Failed to add note');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setAddingNote(false);
    }
  };

  if (loading && !lead) {
    return (
      <div className="py-24 text-center text-slate-400">
        <Activity className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
        Loading lead details...
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="py-12 text-center text-slate-500">
        Lead not found or does not belong to your organization.
        <div className="mt-4">
          <Link href="/dashboard/leads" className="text-indigo-600 underline text-xs">
            Return to Leads
          </Link>
        </div>
      </div>
    );
  }

  const phone = lead.contact?.normalized_phone || lead.contact?.phone;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all leads
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {lead.contact?.full_name || lead.title || 'Untitled Lead'}
            </h1>
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
              {lead.status}
            </Badge>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {lead.priority}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
            {phone && (
              <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300">
                <Phone className="h-3.5 w-3.5 text-indigo-600" />
                {phone}
              </span>
            )}
            {lead.contact?.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {lead.contact.email}
              </span>
            )}
            {lead.contact?.company && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {lead.contact.company}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              Source: {lead.source_type}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowCallModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Call Lead
          </button>
          <button
            onClick={() => setShowStatusModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            Change Status
          </button>
          <button
            onClick={() => setShowAssignModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <User className="h-3.5 w-3.5" />
            Assign
          </button>
          <button
            onClick={() => setShowFollowUpModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <Clock className="h-3.5 w-3.5" />
            Follow-Up
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-xs font-medium">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Overview & Attribution
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'timeline'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Activity Timeline ({activities.length})
        </button>
        <button
          onClick={() => setActiveTab('calls')}
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'calls'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Calls ({calls.length})
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'campaigns'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`pb-2.5 transition-colors border-b-2 ${
            activeTab === 'notes'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Internal Notes ({notes.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Contact & Sales Opportunity State */}
          <div className="bg-white dark:bg-slate-950 p-5 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-sm">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              Lead & Contact Details
            </h3>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-slate-400">Full Name</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.contact?.full_name || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Company</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.contact?.company || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Phone</span>
                <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.contact?.normalized_phone || lead.contact?.phone || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Email</span>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.contact?.email || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">City / State / Country</span>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {[lead.contact?.city, lead.contact?.state, lead.contact?.country].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Assigned Team Member</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.assigned_user?.name || 'Unassigned'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Assigned AI Agent</span>
                <div className="font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {lead.assigned_agent?.name || 'None'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Next Follow-Up</span>
                <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : 'None scheduled'}
                </div>
              </div>
            </div>
          </div>

          {/* Attribution & Source Data */}
          <div className="bg-white dark:bg-slate-950 p-5 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-sm">
              <Layers className="h-4 w-4 text-indigo-600" />
              Source & Attribution Identifiers
            </h3>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-slate-400">Source Type</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.source_type}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Source Name</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {lead.source_name || '—'}
                </div>
              </div>
              {lead.external_id && (
                <div>
                  <span className="text-slate-400">External ID (Meta / Inbound)</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {lead.external_id}
                  </div>
                </div>
              )}
              {lead.external_form_id && (
                <div>
                  <span className="text-slate-400">Form ID</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {lead.external_form_id}
                  </div>
                </div>
              )}
              {lead.external_ad_id && (
                <div>
                  <span className="text-slate-400">Ad ID</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {lead.external_ad_id}
                  </div>
                </div>
              )}
              {lead.external_campaign_id && (
                <div>
                  <span className="text-slate-400">External Campaign ID</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {lead.external_campaign_id}
                  </div>
                </div>
              )}
              {lead.utm_source && (
                <div>
                  <span className="text-slate-400">UTM Source</span>
                  <div className="text-slate-800 dark:text-slate-200 mt-0.5">{lead.utm_source}</div>
                </div>
              )}
              {lead.utm_campaign && (
                <div>
                  <span className="text-slate-400">UTM Campaign</span>
                  <div className="text-slate-800 dark:text-slate-200 mt-0.5">{lead.utm_campaign}</div>
                </div>
              )}
            </div>

            {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 block mb-1">Custom Form Answers</span>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1">
                  {Object.entries(lead.custom_fields).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-500">{key}:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="bg-white dark:bg-slate-950 p-5 border border-slate-200 dark:border-slate-800 rounded-xl">
          {activities.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">No activity recorded yet.</div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {activities.map((act) => (
                <div key={act.id} className="relative text-xs">
                  <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-950" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {act.activity_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(act.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">{act.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calls Tab */}
      {activeTab === 'calls' && (
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {calls.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No calls have been dispatched to this lead yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Call ID</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Duration</th>
                  <th className="py-2.5 px-4">Agent</th>
                  <th className="py-2.5 px-4">Dispatched At</th>
                  <th className="py-2.5 px-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-4 font-mono">{c.id.slice(0, 8)}...</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="secondary">{c.status}</Badge>
                    </td>
                    <td className="py-2.5 px-4">{c.duration_seconds}s</td>
                    <td className="py-2.5 px-4">{c.agent_name || c.provider_agent_id}</td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link
                        href={`/dashboard/calls`}
                        className="text-indigo-600 hover:underline"
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          {campaigns.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              This contact has not been included in any bulk campaigns yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                <tr>
                  <th className="py-2.5 px-4">Campaign</th>
                  <th className="py-2.5 px-4">Contact Status</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Last Attempt</th>
                  <th className="py-2.5 px-4">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {campaigns.map((cc) => (
                  <tr key={cc.id}>
                    <td className="py-2.5 px-4 font-medium">
                      {((cc as unknown as Record<string, unknown>).campaign_name as string) || cc.campaign_id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="secondary">{cc.status}</Badge>
                    </td>
                    <td className="py-2.5 px-4">{cc.attempt_count}</td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {cc.last_attempt_at ? new Date(cc.last_attempt_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-2.5 px-4">{cc.duration_seconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Internal Notes Tab */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          <form onSubmit={handleAddNote} className="bg-white dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
            <textarea
              rows={3}
              placeholder="Add an internal CRM note regarding this lead (conversations, qualification info, follow-up preferences)..."
              value={newNoteBody}
              onChange={(e) => setNewNoteBody(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addingNote || !newNoteBody.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                {addingNote ? 'Adding...' : 'Post Note'}
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            {notes.length === 0 ? (
              <div className="bg-white dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                No internal notes have been added for this lead yet.
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between items-center text-slate-400 text-[11px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {note.author_name || 'Team Member'}
                    </span>
                    <span>{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {note.body}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Call Dialog Modal */}
      {showCallModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <PhoneCall className="h-5 w-5 text-indigo-600" />
              Call Lead via VoiceNuvo
            </h3>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg">
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  {lead.contact?.full_name}
                </div>
                <div className="text-slate-500 font-mono mt-0.5">{phone}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select AI Agent
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
                  onClick={() => setShowCallModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDispatchCall}
                  disabled={calling || !phone}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {calling ? 'Calling...' : 'Call Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-xl text-xs space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Update CRM Status</h3>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as LeadStatus)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="NURTURE">Nurture</option>
              <option value="CONVERTED">Converted</option>
              <option value="LOST">Lost</option>
              <option value="DISQUALIFIED">Disqualified</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="px-3 py-1.5 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateStatus}
                className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-xl text-xs space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Assign Lead</h3>
            <div>
              <label className="block text-slate-500 mb-1">Select Team Member</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-Up Modal */}
      {showFollowUpModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-xl text-xs space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Schedule Next Follow-Up</h3>
            <div>
              <label className="block text-slate-500 mb-1">Follow-Up Date & Time</label>
              <input
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFollowUpModal(false)}
                className="px-3 py-1.5 border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScheduleFollowUp}
                disabled={!followUpDate}
                className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
