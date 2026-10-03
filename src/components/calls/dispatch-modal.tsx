'use client';

import React, { useState } from 'react';
import { PhoneCall, X, AlertCircle, Plus, Trash2, ArrowRight } from 'lucide-react';
import { NormalizedAgent, NormalizedPhoneNumber } from '@/lib/providers/voice/provider-types';
import { NormalizedCallDTO } from '@/services/call.service';

interface ContextPair {
  key: string;
  value: string;
}

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDispatched: (call: NormalizedCallDTO) => void;
  agents: NormalizedAgent[];
  phoneNumbers: NormalizedPhoneNumber[];
}

export const DispatchModal: React.FC<DispatchModalProps> = ({
  isOpen,
  onClose,
  onDispatched,
  agents,
  phoneNumbers,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedPhoneId, setSelectedPhoneId] = useState('');
  const [destinationNumber, setDestinationNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Dynamic context key-value pairs
  const [contextPairs, setContextPairs] = useState<ContextPair[]>([]);
  // Metadata key-value pairs
  const [metadataPairs, setMetadataPairs] = useState<ContextPair[]>([]);

  if (!isOpen) return null;

  const handleAddContext = () => {
    setContextPairs([...contextPairs, { key: '', value: '' }]);
  };

  const handleRemoveContext = (idx: number) => {
    setContextPairs(contextPairs.filter((_: ContextPair, i: number) => i !== idx));
  };

  const handleContextChange = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...contextPairs];
    updated[idx][field] = val;
    setContextPairs(updated);
  };

  const handleAddMetadata = () => {
    setMetadataPairs([...metadataPairs, { key: '', value: '' }]);
  };

  const handleRemoveMetadata = (idx: number) => {
    setMetadataPairs(metadataPairs.filter((_: ContextPair, i: number) => i !== idx));
  };

  const handleMetadataChange = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...metadataPairs];
    updated[idx][field] = val;
    setMetadataPairs(updated);
  };

  const validateForm = () => {
    if (!selectedAgentId) {
      setError('Please select an agent to place the call.');
      return false;
    }
    const cleanNumber = destinationNumber.trim();
    if (!cleanNumber.startsWith('+') || cleanNumber.length < 8) {
      setError('Destination number must be in international format with leading +, e.g. +14155552671');
      return false;
    }
    setError(null);
    return true;
  };

  const handleConfirmStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirm(true);
    }
  };

  const handleDispatch = async () => {
    setIsSubmitting(true);
    setError(null);

    // Build context object
    const callContext: Record<string, string> = {};
    contextPairs.forEach((p: ContextPair) => {
      if (p.key.trim()) callContext[p.key.trim()] = p.value;
    });

    // Build metadata object
    const metadata: Record<string, string> = {};
    metadataPairs.forEach((p: ContextPair) => {
      if (p.key.trim()) metadata[p.key.trim()] = p.value;
    });

    const idempotencyKey = `dispatch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await fetch('/api/calls/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          toNumber: destinationNumber.trim(),
          fromNumberId: selectedPhoneId || undefined,
          callContext: Object.keys(callContext).length > 0 ? callContext : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          idempotencyKey,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to dispatch call');
      }

      onDispatched(json.data);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setShowConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const selectedPhone = phoneNumbers.find((p) => p.id === selectedPhoneId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2 text-foreground font-semibold text-lg">
            <PhoneCall className="h-5 w-5 text-primary" />
            <span>Dispatch Outbound Call</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!showConfirm ? (
          <form onSubmit={handleConfirmStep} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Select Agent <span className="text-destructive">*</span>
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Choose an AI voice agent --</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.model || 'gpt-4o-mini'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Caller ID (From Number)
              </label>
              <select
                value={selectedPhoneId}
                onChange={(e) => setSelectedPhoneId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                <option value="">Platform Default Shared Number</option>
                {phoneNumbers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phoneNumber} ({p.region})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Leave empty to use the platform&apos;s default caller ID pool.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Destination Phone Number <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value)}
                placeholder="+14155552671"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Must include country code with leading + (E.164 format).
              </p>
            </div>

            {/* Dynamic Call Context */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-foreground">
                  Dynamic Call Context (Passed to Agent)
                </label>
                <button
                  type="button"
                  onClick={handleAddContext}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Variable
                </button>
              </div>

              {contextPairs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No custom call context variables.</p>
              ) : (
                <div className="space-y-2">
                  {contextPairs.map((pair: ContextPair, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Key (e.g. customer_name)"
                        value={pair.key}
                        onChange={(e) => handleContextChange(idx, 'key', e.target.value)}
                        className="w-1/2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={pair.value}
                        onChange={(e) => handleContextChange(idx, 'value', e.target.value)}
                        className="w-1/2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveContext(idx)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tracking Metadata */}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-foreground">
                  Tracking Metadata (Echoed in Webhook)
                </label>
                <button
                  type="button"
                  onClick={handleAddMetadata}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Tag
                </button>
              </div>

              {metadataPairs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No tracking tags configured.</p>
              ) : (
                <div className="space-y-2">
                  {metadataPairs.map((pair: ContextPair, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Key (e.g. lead_id)"
                        value={pair.key}
                        onChange={(e) => handleMetadataChange(idx, 'key', e.target.value)}
                        className="w-1/2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={pair.value}
                        onChange={(e) => handleMetadataChange(idx, 'value', e.target.value)}
                        className="w-1/2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMetadata(idx)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent:</span>
                <span className="font-medium text-foreground">{selectedAgent?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">From (Caller ID):</span>
                <span className="font-medium text-foreground">
                  {selectedPhone ? selectedPhone.phoneNumber : 'Platform Default'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To Destination:</span>
                <span className="font-mono font-semibold text-primary">{destinationNumber}</span>
              </div>
              {contextPairs.length > 0 && (
                <div className="pt-2 border-t border-border/50 text-xs">
                  <span className="text-muted-foreground">Context Variables:</span>
                  <div className="mt-1 font-mono text-muted-foreground">
                    {contextPairs.map((p: ContextPair) => `${p.key}: ${p.value}`).join(', ')}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Confirm dispatching this outbound voice call. An active call session will be initiated on OmniDimension.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDispatch}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-4 w-4" />
                    <span>Confirm & Dispatch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
