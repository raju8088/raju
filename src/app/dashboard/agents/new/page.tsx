'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Bot, Mic, Plus, Trash2, Globe, PhoneOff, Voicemail } from 'lucide-react';
import type { CatalogVoice, CatalogProvider } from '@/lib/providers/voice/provider-types';

export default function CreateAgentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('Hello! How can I assist you today?');
  const [model, setModel] = useState('gpt-4o-mini');
  const [voiceName, setVoiceName] = useState('Rachel');
  const [voiceProvider, setVoiceProvider] = useState('elevenlabs');
  const [voiceId, setVoiceId] = useState('21m00Tcm4TlvDq8ikWAM');
  const [language, setLanguage] = useState('English');
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [voicemailEnabled, setVoicemailEnabled] = useState(false);
  const [voicemailMessage, setVoicemailMessage] = useState('Please leave a message after the tone.');
  const [isEndCallEnabled, setIsEndCallEnabled] = useState(false);
  const [endCallMessage, setEndCallMessage] = useState('Thank you for calling. Goodbye!');
  const [maxDurationSec, setMaxDurationSec] = useState(600);
  const [contextItems, setContextItems] = useState<{ title: string; body: string }[]>([
    { title: 'Company Overview', body: 'We are a leading customer support provider specialized in fast inquiries.' },
  ]);

  // Catalog data
  const [voices, setVoices] = useState<CatalogVoice[]>([]);
  const [llms, setLlms] = useState<CatalogProvider[]>([]);

  useEffect(() => {
    fetch('/api/catalog')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          if (data.data.voices?.length > 0) setVoices(data.data.voices);
          if (data.data.llms?.length > 0) setLlms(data.data.llms);
        }
      })
      .catch(() => {});
  }, []);

  const addContextItem = () => {
    setContextItems([...contextItems, { title: '', body: '' }]);
  };

  const removeContextItem = (index: number) => {
    setContextItems(contextItems.filter((_, i) => i !== index));
  };

  const updateContextItem = (index: number, field: 'title' | 'body', value: string) => {
    const updated = [...contextItems];
    updated[index][field] = value;
    setContextItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload = {
        name: name.trim(),
        welcomeMessage: welcomeMessage.trim(),
        model,
        voiceName,
        voiceProvider,
        voiceId,
        language,
        speechSpeed,
        enableWebSearch,
        voicemailEnabled,
        voicemailMessage: voicemailEnabled ? voicemailMessage.trim() : undefined,
        isEndCallEnabled,
        endCallMessage: isEndCallEnabled ? endCallMessage.trim() : undefined,
        maxDurationSec: Number(maxDurationSec),
        contextBreakdown: contextItems.filter((c) => c.title.trim() && c.body.trim()),
      };

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/dashboard/agents/${data.data.id}`);
      } else {
        setError(data.error?.message || 'Failed to create agent');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to submit agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/agents">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bot className="h-6 w-6 text-indigo-600" />
            Create AI Voice Agent
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure conversational prompt, voice acoustics, and operational rules on OmniDimension.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Agent Identity & Greeting</CardTitle>
            <CardDescription>Primary name and initial conversational greeting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Agent Name *
              </label>
              <Input
                placeholder="e.g. Sales Inbound Concierge"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Initial Welcome Message
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                rows={2}
                placeholder="Spoken immediately when call connects..."
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Intelligence & Voice */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-indigo-600" />
              2. Voice & LLM Model Configuration
            </CardTitle>
            <CardDescription>Select the speech synthesis acoustics and reasoning engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Language Model (LLM)
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Fast & Cost-effective)</option>
                  <option value="gpt-4o">OpenAI GPT-4o (High Intelligence)</option>
                  <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet (Natural Reasoning)</option>
                  <option value="llama-3.1-70b">Groq Llama 3.1 70B (Ultra Low Latency)</option>
                  {llms.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Voice Synthesis
                </label>
                <select
                  value={voiceName}
                  onChange={(e) => {
                    setVoiceName(e.target.value);
                    const found = voices.find((v) => v.name === e.target.value);
                    if (found) {
                      setVoiceId(found.id);
                      setVoiceProvider(found.provider);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Rachel">Rachel (ElevenLabs - Calm Female)</option>
                  <option value="Domi">Domi (ElevenLabs - Friendly Female)</option>
                  <option value="Bella">Bella (ElevenLabs - Expressive Female)</option>
                  <option value="Antoni">Antoni (ElevenLabs - Confident Male)</option>
                  <option value="Arnold">Arnold (ElevenLabs - Authoritative Male)</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.name}>{v.displayName} ({v.provider})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Speech Speed: {speechSpeed}x</span>
                </label>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={speechSpeed}
                  onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Primary Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Hindi">Hindi</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversational Context Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">3. Conversational Context & Knowledge</CardTitle>
              <CardDescription>Domain prompt rules and prompt blocks injected into the agent</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addContextItem} className="flex items-center gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Context Block
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {contextItems.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Section Title (e.g. Return Policy, Pricing Rules)"
                    value={item.title}
                    onChange={(e) => updateContextItem(idx, 'title', e.target.value)}
                    className="font-medium text-xs h-8"
                  />
                  {contextItems.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeContextItem(idx)}
                      className="text-rose-600 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <textarea
                  placeholder="Detailed guidelines, instructions, or factual information..."
                  rows={2}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  value={item.body}
                  onChange={(e) => updateContextItem(idx, 'body', e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Call Handling Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Telephony & Behavioral Rules</CardTitle>
            <CardDescription>Web search, voicemail, end-call behavior, and max call duration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Real-time Web Search</p>
                  <p className="text-[11px] text-slate-500">Allow agent to browse the web for up-to-date information during calls</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enableWebSearch}
                onChange={(e) => setEnableWebSearch(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Voicemail className="h-4 w-4 text-violet-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Voicemail Detection & Message</p>
                  <p className="text-[11px] text-slate-500">Detect answering machines and leave an automated message</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={voicemailEnabled}
                onChange={(e) => setVoicemailEnabled(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </div>

            {voicemailEnabled && (
              <Input
                placeholder="Voicemail message to leave..."
                value={voicemailMessage}
                onChange={(e) => setVoicemailMessage(e.target.value)}
                className="text-xs"
              />
            )}

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <PhoneOff className="h-4 w-4 text-rose-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">End Call Closing Phrase</p>
                  <p className="text-[11px] text-slate-500">Deliver closing statement before ending call</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isEndCallEnabled}
                onChange={(e) => setIsEndCallEnabled(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
            </div>

            {isEndCallEnabled && (
              <Input
                placeholder="End call phrase (e.g. Goodbye and have a great day!)..."
                value={endCallMessage}
                onChange={(e) => setEndCallMessage(e.target.value)}
                className="text-xs"
              />
            )}

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Max Call Duration (Seconds): {maxDurationSec}s ({Math.round(maxDurationSec / 60)} minutes)
              </label>
              <Input
                type="number"
                min="60"
                max="3600"
                step="30"
                value={maxDurationSec}
                onChange={(e) => setMaxDurationSec(parseInt(e.target.value, 10))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-3">
          <Link href="/dashboard/agents">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? 'Creating on OmniDimension...' : 'Deploy Voice Agent'}
          </Button>
        </div>
      </form>
    </div>
  );
}
