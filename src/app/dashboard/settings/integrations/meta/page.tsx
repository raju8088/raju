'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  Shield,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Key,
  HelpCircle,
} from 'lucide-react';
import { SafeMetaIntegrationDTO } from '@/services/meta-integration.service';
import { Badge } from '@/components/ui/badge';

export default function MetaIntegrationPage() {
  const [integration, setIntegration] = useState<SafeMetaIntegrationDTO | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect form state
  const [pageId, setPageId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [pageName, setPageName] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // Settings state
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<{ id: string; phone_number: string }[]>([]);
  const [autoCallEnabled, setAutoCallEnabled] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [showAutoCallConfirmModal, setShowAutoCallConfirmModal] = useState(false);

  const loadIntegration = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/meta');
      const data = await res.json();
      if (data.success && data.data) {
        setIntegration(data.data);
        setAutoCallEnabled(data.data.autoCallEnabled);
        if (data.data.autoCallAgentId) setSelectedAgentId(data.data.autoCallAgentId);
        if (data.data.autoCallPhoneNumberId) setSelectedPhoneId(data.data.autoCallPhoneNumberId);
      } else {
        setIntegration(null);
      }
    } catch (err) {
      console.error('Failed to load Meta integration', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/integrations/meta')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.data) {
          setIntegration(data.data);
          setAutoCallEnabled(data.data.autoCallEnabled);
          if (data.data.autoCallAgentId) setSelectedAgentId(data.data.autoCallAgentId);
          if (data.data.autoCallPhoneNumberId) setSelectedPhoneId(data.data.autoCallPhoneNumberId);
        } else {
          setIntegration(null);
        }
      })
      .catch((err) => console.error('Failed to load Meta integration', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    async function loadCallResources() {
      try {
        const [agentsRes, numbersRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/phone-numbers'),
        ]);
        const agentsData = await agentsRes.json();
        const numbersData = await numbersRes.json();

        if (agentsData.success && agentsData.data) {
          setAgents(agentsData.data);
          if (!selectedAgentId && agentsData.data.length > 0) {
            setSelectedAgentId(agentsData.data[0].id);
          }
        }
        if (numbersData.success && numbersData.data) {
          setPhoneNumbers(numbersData.data);
          if (!selectedPhoneId && numbersData.data.length > 0) {
            setSelectedPhoneId(numbersData.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load agents/numbers', err);
      }
    }
    loadCallResources();
  }, [selectedAgentId, selectedPhoneId]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageId.trim() || !pageAccessToken.trim()) {
      setConnectError('Page ID and Page Access Token are required');
      return;
    }

    setConnecting(true);
    setConnectError('');

    try {
      const res = await fetch('/api/integrations/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageId.trim(),
          pageAccessToken: pageAccessToken.trim(),
          pageName: pageName.trim() || undefined,
          businessId: businessId.trim() || undefined,
          adAccountId: adAccountId.trim() || undefined,
          autoCallEnabled: false,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPageAccessToken('');
        loadIntegration();
      } else {
        setConnectError(data.error?.message || 'Failed to connect Meta account');
      }
    } catch (err) {
      setConnectError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleToggleAutoCall = (checked: boolean) => {
    if (checked) {
      // Show explicit confirmation modal (Section 67)
      setShowAutoCallConfirmModal(true);
    } else {
      setAutoCallEnabled(false);
    }
  };

  const handleConfirmAutoCall = () => {
    setAutoCallEnabled(true);
    setShowAutoCallConfirmModal(false);
  };

  const handleSaveSettings = async () => {
    if (!integration) return;
    setSavingSettings(true);
    setSettingsSuccess(false);

    try {
      const res = await fetch('/api/integrations/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: integration.id,
          autoCallEnabled,
          autoCallAgentId: autoCallEnabled ? selectedAgentId || null : null,
          autoCallPhoneNumberId: autoCallEnabled ? selectedPhoneId || null : null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSettingsSuccess(true);
        loadIntegration();
        setTimeout(() => setSettingsSuccess(false), 3000);
      } else {
        alert(data.error?.message || 'Failed to update settings');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDisconnect = async () => {
    if (!integration) return;
    if (!confirm('Are you sure you want to disconnect Meta Lead Ads? Incoming leads from this Page will no longer be captured.')) {
      return;
    }

    try {
      const res = await fetch(`/api/integrations/meta?id=${integration.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setIntegration(null);
        loadIntegration();
      } else {
        alert(data.error?.message || 'Failed to disconnect');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Leads
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Cpu className="h-7 w-7 text-indigo-600" />
          Meta Lead Ads Integration
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Connect your Facebook Page to automatically ingest leads generated by Meta Lead Ads and trigger outbound AI voice calls.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">
          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-600" />
          Loading integration state...
        </div>
      ) : integration ? (
        /* Connected View */
        <div className="space-y-6">
          {/* Active Connection Card */}
          <div className="bg-white dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {integration.pageName || 'Facebook Page'}
                  </h3>
                  <div className="text-xs text-slate-500 font-mono">Page ID: {integration.pageId}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Active
                </Badge>
                <button
                  onClick={handleDisconnect}
                  className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-rose-200"
                >
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" />
                  Disconnect
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400">Encrypted Token Status</span>
                <div className="font-mono text-slate-700 dark:text-slate-300 mt-0.5 flex items-center gap-1">
                  <Shield className="h-3 w-3 text-emerald-600" />
                  {integration.tokenMasked}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Connected At</span>
                <div className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {new Date(integration.connectedAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Last Verified</span>
                <div className="text-slate-700 dark:text-slate-300 mt-0.5">
                  {integration.lastVerifiedAt ? new Date(integration.lastVerifiedAt).toLocaleString() : 'Just now'}
                </div>
              </div>
            </div>
          </div>

          {/* Automated Outbound Calling Settings */}
          <div className="bg-white dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-indigo-600" />
                Automatic Lead Calling Flow
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure whether new incoming Meta leads automatically receive an outbound voice call dispatched through your AI agent.
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                  Auto-Call New Meta Leads
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  When enabled, VoiceNuvo immediately dispatches an outbound call upon receiving a new leadgen webhook.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoCallEnabled}
                onChange={(e) => handleToggleAutoCall(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded border-slate-300"
              />
            </div>

            {autoCallEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Select Voice Agent
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Caller ID / Source Number
                  </label>
                  <select
                    value={selectedPhoneId}
                    onChange={(e) => setSelectedPhoneId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">Provider Default Number</option>
                    {phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.phone_number}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {settingsSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Settings saved successfully!
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>

          {/* Webhook Endpoint Reference */}
          <div className="bg-slate-50 dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 text-xs">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4 text-indigo-600" />
              Meta App Webhook Configuration
            </h4>
            <p className="text-slate-500">
              In your Meta App Dashboard under <strong>Webhooks &gt; Page</strong>, configure the callback URL and subscription:
            </p>
            <div className="space-y-1.5 font-mono text-[11px] bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-400">Callback URL:</span>{' '}
                <span className="text-indigo-600">{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/meta/leadgen</span>
              </div>
              <div>
                <span className="text-slate-400">Verify Token:</span>{' '}
                <span className="text-slate-700 dark:text-slate-300">voicenuvo_meta_verify_token_2026</span>
              </div>
              <div>
                <span className="text-slate-400">Subscription Field:</span>{' '}
                <span className="text-slate-700 dark:text-slate-300">leadgen</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Not Connected: Connection Form */
        <div className="bg-white dark:bg-slate-950 p-6 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Connect Facebook Page
              </h3>
              <p className="text-xs text-slate-500">
                Enter your Facebook Page ID and Page Access Token with <code>leads_retrieval</code> permissions.
              </p>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4 text-xs">
            {connectError && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {connectError}
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Facebook Page ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 102938475610293"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Page Access Token <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                placeholder="EAA..."
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Never shared with the client. Encrypted at rest using AES-256-GCM.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Page Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VoiceNuvo Healthcare"
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Business ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ad Account ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="act_123456789"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={connecting}
                className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {connecting ? 'Verifying & Connecting...' : 'Connect Meta Page'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Explicit Confirmation Modal for Auto-Calling (Section 67) */}
      {showAutoCallConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl text-xs space-y-4">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                Confirm Automated AI Outbound Calls
              </h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              <strong>Warning:</strong> New leads arriving via Meta Lead Ads will automatically receive an outbound voice call from your selected AI Agent.
            </p>
            <p className="text-slate-500">
              Calls consume voice provider minutes and contact customers immediately upon form submission.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAutoCallConfirmModal(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAutoCall}
                className="px-4 py-1.5 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700"
              >
                Enable Auto-Calling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
