'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Cpu, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck, Unlink } from 'lucide-react';

interface ConnectionStatus {
  provider: 'OMNIDIMENSION';
  displayName: string;
  connected: boolean;
  status: 'ACTIVE' | 'FAILED' | 'SUSPENDED' | 'NOT_CONNECTED';
  maskedKey?: string;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('OmniDimension Voice');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/voice/omnidimension');
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch {
      setActionError('Failed to fetch provider connection status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/integrations/voice/omnidimension')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setStatus(data.data);
        }
      })
      .catch(() => {
        if (isMounted) setActionError('Failed to fetch provider connection status');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTestConnection = async () => {
    if (!apiKeyInput.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key to test' });
      return;
    }
    try {
      setIsTesting(true);
      setTestResult(null);
      const res = await fetch('/api/integrations/voice/omnidimension/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.data.success) {
        setTestResult({
          success: true,
          message: `Connected successfully (${data.data.latencyMs ?? 0}ms latency)`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.data?.message || data.error?.message || 'Connection test failed',
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: (err as Error).message || 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    try {
      setIsSaving(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await fetch('/api/integrations/voice/omnidimension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          displayName: displayNameInput.trim() || 'OmniDimension Voice',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
        setApiKeyInput('');
        setTestResult(null);
        setActionSuccess('OmniDimension provider credentials verified and safely activated.');
      } else {
        setActionError(data.error?.message || 'Failed to save connection');
      }
    } catch (err) {
      setActionError((err as Error).message || 'Failed to connect');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect OmniDimension? Agents and numbers will be unlinked until reconnected.')) {
      return;
    }

    try {
      setIsDisconnecting(true);
      setActionError(null);
      const res = await fetch('/api/integrations/voice/omnidimension', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setActionSuccess('Provider disconnected successfully.');
        await fetchStatus();
      } else {
        setActionError(data.error?.message || 'Failed to disconnect');
      }
    } catch (err) {
      setActionError((err as Error).message || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
          <Cpu className="h-6 w-6 text-indigo-600" />
          Voice Provider Integrations
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure external AI voice engine connections. VoiceNuvo serves as your branded control plane while OmniDimension powers real-time voice synthesis and telephony.
        </p>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main OmniDimension Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg">OmniDimension Voice AI</CardTitle>
              <CardDescription>
                Primary conversational speech engine for agents, knowledge bases, and phone numbers.
              </CardDescription>
            </div>
          </div>
          <div>
            {loading ? (
              <Badge variant="outline">Checking...</Badge>
            ) : status?.connected ? (
              <Badge variant="success" className="flex items-center gap-1.5 py-1 px-2.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="warning" className="flex items-center gap-1.5 py-1 px-2.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Status summary banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-400 font-medium">Provider Status</span>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {status?.status === 'ACTIVE' ? 'Active & Healthy' : status?.status || 'Unconfigured'}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium">Active API Key</span>
              <p className="text-sm font-mono text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-slate-400" />
                {status?.maskedKey || 'No key configured'}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium">Last Verified</span>
              <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                {status?.lastVerifiedAt ? new Date(status.lastVerifiedAt).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>

          {/* Form: Connect / Replace Key */}
          <form onSubmit={handleSaveConnection} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span>{status?.connected ? 'Replace API Key' : 'OmniDimension API Key'}</span>
                <span className="text-xs text-slate-400">Never exposed to the browser or logged</span>
              </label>
              <Input
                type="password"
                placeholder={status?.connected ? 'Enter new API key to replace existing connection...' : 'Enter your OmniDimension API Key (od_live_...)'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Connection Display Name
              </label>
              <Input
                type="text"
                placeholder="OmniDimension Voice"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
              />
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-lg text-xs flex items-center gap-2.5 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting || !apiKeyInput.trim()}
                  className="flex items-center gap-1.5"
                >
                  {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Test Connection
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving || !apiKeyInput.trim()}
                  className="flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                  {status?.connected ? 'Replace & Activate' : 'Save Connection'}
                </Button>
              </div>

              {status?.connected && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex items-center gap-1.5"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              )}
            </div>
          </form>

          {/* Security Guardrail Notice */}
          <div className="p-3.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Safe Connection Replacement Rule (Section 7 & 34)</p>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                If testing a new API key fails, VoiceNuvo automatically preserves your currently active working connection without interrupting live agents. Credentials are encrypted at rest with AES-256-GCM.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meta Lead Ads Card */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Meta Lead Ads Integration</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Real-time webhook ingestion and automatic outbound calling for Facebook & Instagram lead forms.
                </CardDescription>
              </div>
            </div>
            <Link
              href="/dashboard/settings/integrations/meta"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
            >
              Configure Meta
            </Link>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
