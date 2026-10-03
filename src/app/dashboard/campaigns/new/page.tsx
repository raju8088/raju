'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  Bot,
  Phone,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseAndValidateCsv, CsvContactItem, CsvRejectedItem } from '@/lib/validation/campaign.schema';

interface AgentOption {
  id: string;
  name: string;
  model?: string;
  language?: string;
}

interface PhoneOption {
  id: string;
  phone_number: string;
  provider_phone_id: string;
}

const STEPS = [
  { id: 1, name: 'Details' },
  { id: 2, name: 'Voice Agent' },
  { id: 3, name: 'Caller Number' },
  { id: 4, name: 'Contacts Upload' },
  { id: 5, name: 'Variable Mapping' },
  { id: 6, name: 'Calling Settings' },
  { id: 7, name: 'Review' },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [useRotationPool, setUseRotationPool] = useState(false);
  const [rotationPoolIds, setRotationPoolIds] = useState<string[]>([]);
  const [rotationStrategy, setRotationStrategy] = useState<'fixed_count' | 'cpr_threshold' | 'both' | 'none'>('fixed_count');

  // Contacts
  const [manualText, setManualText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [acceptedContacts, setAcceptedContacts] = useState<CsvContactItem[]>([]);
  const [rejectedContacts, setRejectedContacts] = useState<CsvRejectedItem[]>([]);

  // Calling Settings
  const [concurrency, setConcurrency] = useState(2);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [enableCallingWindow, setEnableCallingWindow] = useState(false);
  const [windowStartTime, setWindowStartTime] = useState(9);
  const [windowStopTime, setWindowStopTime] = useState(18);
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState(2);
  const [retryReasons, setRetryReasons] = useState<string[]>(['no-answer', 'busy', 'failed']);

  // Loading & Options
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/agents').then((r) => r.json()).catch(() => null),
      fetch('/api/phone-numbers').then((r) => r.json()).catch(() => null),
    ]).then(([agentsJson, phonesJson]) => {
      if (agentsJson?.data) {
        setAgents(agentsJson.data);
        if (agentsJson.data.length > 0) setAgentId(agentsJson.data[0].id);
      }
      if (phonesJson?.data) {
        setPhoneNumbers(phonesJson.data);
        if (phonesJson.data.length > 0) setPhoneNumberId(phonesJson.data[0].id);
      }
      setIsLoadingOptions(false);
    });
  }, []);

  // CSV parsing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const text = await file.text();
    const result = parseAndValidateCsv(text);
    setAcceptedContacts(result.accepted);
    setRejectedContacts(result.rejected);
  };

  const handleManualParse = () => {
    if (!manualText.trim()) return;
    setCsvFileName('manual-entry.csv');
    const result = parseAndValidateCsv(manualText);
    setAcceptedContacts(result.accepted);
    setRejectedContacts(result.rejected);
  };

  const handleToggleRetryReason = (reason: string) => {
    if (retryReasons.includes(reason)) {
      setRetryReasons(retryReasons.filter((r) => r !== reason));
    } else {
      setRetryReasons([...retryReasons, reason]);
    }
  };

  const handleTogglePoolNumber = (numId: string) => {
    if (rotationPoolIds.includes(numId)) {
      setRotationPoolIds(rotationPoolIds.filter((id) => id !== numId));
    } else {
      setRotationPoolIds([...rotationPoolIds, numId]);
    }
  };

  // Submission
  const handleSubmit = async (saveAsDraft: boolean) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (!name.trim()) throw new Error('Campaign name is required.');
      if (!agentId) throw new Error('Please select a voice agent.');
      if (!phoneNumberId && rotationPoolIds.length === 0) {
        throw new Error('Please select a caller phone number or add numbers to the rotation pool.');
      }

      // 1. Create Campaign
      const payload = {
        name,
        description,
        agentId,
        phoneNumberId: phoneNumberId || null,
        number_pool_ids: useRotationPool ? rotationPoolIds : [],
        rotation_strategy: rotationStrategy,
        concurrency,
        timezone,
        saveAsDraft,
        retry_policy: autoRetry
          ? {
              auto_retry: true,
              max_retries: maxRetries,
              retry_on_reasons: retryReasons,
              retry_interval_minutes: 30,
            }
          : undefined,
        calling_window: enableCallingWindow
          ? {
              enable_daily_hard_stop: true,
              daily_stop_time: windowStopTime,
              daily_stop_timezone: timezone,
              enable_daily_auto_start: true,
              daily_start_time: windowStartTime,
              daily_start_timezone: timezone,
            }
          : undefined,
      };

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to create campaign');
      }

      const campaignId = json.data.id;

      // 2. Import Contacts if any were parsed
      if (acceptedContacts.length > 0) {
        const contactsPayload = {
          contacts: acceptedContacts.map((c) => ({
            phoneNumber: c.normalizedPhoneNumber,
            customVariables: c.customVariables,
            metadata: c.metadata,
          })),
        };

        const contactsRes = await fetch(`/api/campaigns/${campaignId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactsPayload),
        });

        const contactsJson = await contactsRes.json();
        if (!contactsRes.ok) {
          throw new Error(contactsJson.error?.message || 'Campaign created, but contacts import encountered an error');
        }
      }

      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch (err) {
      setSubmitError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Campaigns
        </Link>
        <span className="text-xs font-mono text-slate-400">Step {currentStep} of 7</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Create Bulk Campaign
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Configure an automated outbound calling campaign with AI voice agents, smart scheduling, and contacts.
        </p>
      </div>

      {/* Wizard Step Indicator */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
        {STEPS.map((s) => {
          const isDone = s.id < currentStep;
          const isCurrent = s.id === currentStep;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isCurrent
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                  : isDone
                  ? 'text-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full flex items-center justify-center text-2xs ${
                  isCurrent
                    ? 'bg-indigo-600 text-white'
                    : isDone
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {isDone ? '✓' : s.id}
              </span>
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Step Content Container */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {/* Step 1: Details */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Campaign Details</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 Real Estate Lead Outreach"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description / Objective
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes regarding the purpose or target audience of this campaign..."
                rows={3}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {/* Step 2: Voice Agent */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Select Voice Agent</h2>
            <p className="text-xs text-slate-500">
              Select the trained AI voice agent that will conduct calls in this campaign.
            </p>

            {isLoadingOptions ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading available agents...</div>
            ) : agents.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                No voice agents found in your organization. Please create an agent first in the AI Agents tab.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => setAgentId(agent.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      agentId === agent.id
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/40'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{agent.name}</h4>
                        <span className="text-2xs text-slate-400">{agent.language || 'English (US)'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Caller Number / Pool */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Caller Identification</h2>
            <p className="text-xs text-slate-500">
              Select a dedicated outbound caller number or enable number rotation to distribute calls across multiple lines.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUseRotationPool(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  !useRotationPool
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Single Number
              </button>
              <button
                type="button"
                onClick={() => setUseRotationPool(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  useRotationPool
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                Number Rotation Pool
              </button>
            </div>

            {!useRotationPool ? (
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Primary Caller Phone Number
                </label>
                <select
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Select phone number...</option>
                  {phoneNumbers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.phone_number} (Provider ID: {p.provider_phone_id})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Select Numbers for Rotation Pool
                </label>
                <div className="space-y-2">
                  {phoneNumbers.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={rotationPoolIds.includes(p.id)}
                        onChange={() => handleTogglePoolNumber(p.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-mono text-slate-800 dark:text-slate-200">{p.phone_number}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Rotation Strategy
                  </label>
                  <select
                    value={rotationStrategy}
                    onChange={(e) => setRotationStrategy(e.target.value as 'fixed_count' | 'cpr_threshold' | 'both')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="fixed_count">Round Robin (Fixed Count)</option>
                    <option value="cpr_threshold">CPR Threshold (Health Based)</option>
                    <option value="both">Adaptive Hybrid (Both)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Contacts Upload */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Upload Contacts</h2>
            <p className="text-xs text-slate-500">
              Provide contacts in CSV format or paste rows below. E.164 phone numbers with country code are required.
            </p>

            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <UploadCloud className="h-8 w-8 mx-auto text-indigo-500 mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Drag and drop your CSV file here, or browse
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Supports CSV up to 10,000 rows with headers</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="mt-3 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {csvFileName && (
                <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  Selected file: {csvFileName}
                </p>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">Or Paste Manually</span>
              </div>
            </div>

            <div>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="phone_number,first_name,property,budget&#10;+14155552671,Ravi,3BHK,12000000&#10;+919876543210,Aditi,Villa,25000000"
                rows={4}
                className="w-full font-mono text-xs px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualParse}
                className="mt-2 text-xs"
              >
                Validate Pasted Rows
              </Button>
            </div>

            {/* Validation Breakdown */}
            {(acceptedContacts.length > 0 || rejectedContacts.length > 0) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Accepted</span>
                    <span className="text-lg font-bold text-emerald-700">{acceptedContacts.length}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">Rejected</span>
                    <span className="text-lg font-bold text-rose-700">{rejectedContacts.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Variable Mapping & Preview */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Variable Mapping & Contact Preview
            </h2>
            <p className="text-xs text-slate-500">
              Verify how columns in your CSV are mapped to dynamic agent context and internal correlation metadata.
            </p>

            {acceptedContacts.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No contacts uploaded yet. Please go back to Step 4 to upload or paste contacts.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                      <tr>
                        <th className="py-2 px-3 font-medium">#</th>
                        <th className="py-2 px-3 font-medium">Destination (E.164)</th>
                        <th className="py-2 px-3 font-medium">Custom Variables (Agent Context)</th>
                        <th className="py-2 px-3 font-medium">Metadata (Correlation)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {acceptedContacts.slice(0, 5).map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">
                            {c.normalizedPhoneNumber}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono text-slate-600 dark:text-slate-300">
                              {JSON.stringify(c.customVariables)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {Object.keys(c.metadata).length > 0 ? JSON.stringify(c.metadata) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {acceptedContacts.length > 5 && (
                  <p className="text-2xs text-slate-400 text-right">
                    Showing first 5 of {acceptedContacts.length} accepted contacts.
                  </p>
                )}

                {/* Rejected Rows Detail */}
                {rejectedContacts.length > 0 && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                    <h4 className="text-xs font-semibold text-rose-800 dark:text-rose-300 mb-2">
                      Rejected Rows ({rejectedContacts.length})
                    </h4>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs text-rose-700 dark:text-rose-400">
                      {rejectedContacts.map((rej, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="font-semibold">Row {rej.row}:</span>
                          <span>{rej.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 6: Calling Settings */}
        {currentStep === 6 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Dispatch & Calling Settings
            </h2>

            {/* Concurrency */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Concurrent Call Limit (Lines: 1 to 50)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10) || 1)}
                className="w-32 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
              <span className="text-2xs text-slate-400 block mt-1">
                Controls the maximum number of simultaneous outbound phone calls.
              </span>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                <option value="UTC">UTC (Universal Time)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
              </select>
            </div>

            {/* Daily Calling Window */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Daily Calling Window (Hard Stop / Auto Start)
                  </h4>
                  <p className="text-2xs text-slate-400">
                    Ensure calls are placed only within acceptable business hours.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableCallingWindow}
                  onChange={(e) => setEnableCallingWindow(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              {enableCallingWindow && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-2xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Start Time (Hour 0-23)
                    </label>
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
                    <label className="block text-2xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Stop Time (Hour 0-23)
                    </label>
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
              )}
            </div>

            {/* Retry Policy */}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Automated Retry Policy
                  </h4>
                  <p className="text-2xs text-slate-400">
                    Automatically re-dial contacts that were busy, unanswered, or failed.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoRetry}
                  onChange={(e) => setAutoRetry(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              {autoRetry && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-2xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Maximum Retries per Contact
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(parseInt(e.target.value, 10))}
                      className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-2xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Retry On Failure Reasons:
                    </label>
                    <div className="flex items-center gap-3">
                      {['no-answer', 'busy', 'failed'].map((reason) => (
                        <label key={reason} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={retryReasons.includes(reason)}
                            onChange={() => handleToggleRetryReason(reason)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{reason}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 7: Review & Finalize */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Review & Create</h2>
            <p className="text-xs text-slate-500">
              Confirm your campaign configuration before saving or dispatching calls.
            </p>

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800 text-xs">
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Campaign Name:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{name || '—'}</span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Voice Agent:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {agents.find((a) => a.id === agentId)?.name || '—'}
                </span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Caller ID / Pool:</span>
                <span className="font-mono text-slate-900 dark:text-slate-100">
                  {useRotationPool ? `Rotation Pool (${rotationPoolIds.length} numbers)` : (phoneNumbers.find((p) => p.id === phoneNumberId)?.phone_number || '—')}
                </span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Contacts to Import:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {acceptedContacts.length.toLocaleString()} valid contacts
                </span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Concurrency:</span>
                <span className="text-slate-900 dark:text-slate-100">{concurrency} simultaneous lines</span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Calling Window:</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {enableCallingWindow ? `${windowStartTime}:00 – ${windowStopTime}:00 (${timezone})` : 'Disabled (anytime)'}
                </span>
              </div>
              <div className="flex justify-between py-2.5 px-4">
                <span className="text-slate-500">Retry Policy:</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {autoRetry ? `Up to ${maxRetries} retries (${retryReasons.join(', ')})` : 'Disabled'}
                </span>
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={currentStep === 1 || isSubmitting}
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          {currentStep < 7 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentStep((s) => Math.min(7, s + 1))}
              className="gap-1 text-xs"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleSubmit(true)}
                className="text-xs"
              >
                Save as Draft
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isSubmitting}
                onClick={() => handleSubmit(false)}
                className="text-xs"
              >
                Create Campaign
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
