'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  ArrowLeft,
  RefreshCw,
  Clock,
  FileText,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Tag,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NormalizedCallDTO } from '@/services/call.service';

interface ChatTurn {
  id: string;
  role: 'assistant' | 'user' | 'system';
  speakerName: string;
  text: string;
}

export default function CallDetailPage() {
  const params = useParams();
  const callId = params?.id as string;

  const [call, setCall] = useState<NormalizedCallDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const fetchCall = useCallback(async (refresh = false) => {
    if (!callId) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const url = `/api/calls/${callId}${refresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Call record not found');
      }
      setCall(json.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    let isMounted = true;

    fetch(`/api/calls/${callId}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setCall(json.data);
        } else {
          setError(json.error?.message || json.message || 'Call record not found');
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
  }, [callId]);

  const copyToClipboard = (text: string, type: 'id' | 'transcript') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    }
  };

  // Parse raw provider conversation into structured chat turns safely without dangerouslySetInnerHTML
  const parseConversation = (raw: string | null): ChatTurn[] => {
    if (!raw) return [];

    // Provider returns conversation with <br/> or \n
    const cleaned = raw.replace(/<br\s*\/?>/gi, '\n');
    const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

    const turns: ChatTurn[] = [];
    let currentRole: 'assistant' | 'user' | 'system' = 'system';
    let currentSpeaker = 'System';
    let currentLines: string[] = [];

    lines.forEach((line) => {
      const assistantMatch = line.match(/^(?:Assistant|Agent|Bot|AI):\s*(.*)$/i);
      const userMatch = line.match(/^(?:User|Customer|Human|Caller):\s*(.*)$/i);

      if (assistantMatch) {
        if (currentLines.length > 0) {
          turns.push({
            id: `turn-${turns.length}`,
            role: currentRole,
            speakerName: currentSpeaker,
            text: currentLines.join(' '),
          });
          currentLines = [];
        }
        currentRole = 'assistant';
        currentSpeaker = call?.agentName || 'Voice Agent';
        if (assistantMatch[1]) currentLines.push(assistantMatch[1]);
      } else if (userMatch) {
        if (currentLines.length > 0) {
          turns.push({
            id: `turn-${turns.length}`,
            role: currentRole,
            speakerName: currentSpeaker,
            text: currentLines.join(' '),
          });
          currentLines = [];
        }
        currentRole = 'user';
        currentSpeaker = 'Customer';
        if (userMatch[1]) currentLines.push(userMatch[1]);
      } else {
        currentLines.push(line);
      }
    });

    if (currentLines.length > 0) {
      turns.push({
        id: `turn-${turns.length}`,
        role: currentRole,
        speakerName: currentSpeaker,
        text: currentLines.join(' '),
      });
    }

    return turns;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <Badge variant="success" className="gap-1 px-3 py-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge variant="warning" className="gap-1 px-3 py-1 font-semibold animate-pulse">
            <Clock className="w-3.5 h-3.5" /> In Progress
          </Badge>
        );
      case 'RINGING':
        return (
          <Badge variant="warning" className="gap-1 px-3 py-1 font-semibold">
            <PhoneCall className="w-3.5 h-3.5 animate-bounce" /> Ringing
          </Badge>
        );
      case 'QUEUED':
        return (
          <Badge variant="info" className="gap-1 px-3 py-1 font-semibold">
            <Clock className="w-3.5 h-3.5" /> Dispatched / Queued
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="danger" className="gap-1 px-3 py-1 font-semibold">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </Badge>
        );
      case 'BUSY':
      case 'NO_ANSWER':
      case 'CANCELED':
        return (
          <Badge variant="neutral" className="gap-1 px-3 py-1 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" /> {status.replace('_', ' ')}
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" className="px-3 py-1">
            {status}
          </Badge>
        );
    }
  };

  const getSentimentBadge = (sentiment: string | null) => {
    if (!sentiment) return null;
    const s = sentiment.toLowerCase();
    if (s.includes('positive')) {
      return <Badge variant="success" className="capitalize">Positive Sentiment</Badge>;
    }
    if (s.includes('negative')) {
      return <Badge variant="danger" className="capitalize">Negative Sentiment</Badge>;
    }
    return <Badge variant="neutral" className="capitalize">{sentiment}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/calls" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        </div>
        <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="p-8 text-center rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 max-w-xl mx-auto my-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Unable to Load Call</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{error || 'Call record not found or inaccessible.'}</p>
          <Link href="/dashboard/calls">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Calls
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const turns = parseConversation(call.transcript);
  const hasExtractedVariables = call.extractedVariables && Object.keys(call.extractedVariables).length > 0;
  const hasContext = call.callContext && Object.keys(call.callContext).length > 0;
  const hasMetadata = call.metadata && Object.keys(call.metadata).length > 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/calls"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {call.direction === 'inbound' ? (
                  <PhoneIncoming className="w-5 h-5 text-indigo-500" />
                ) : (
                  <PhoneOutgoing className="w-5 h-5 text-emerald-500" />
                )}
                Call to {call.destinationNumber}
              </h1>
              {getStatusBadge(call.status)}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">ID: {call.id}</span>
              <button
                onClick={() => copyToClipboard(call.id, 'id')}
                className="hover:text-indigo-600 dark:hover:text-indigo-400"
                title="Copy VoiceNuvo Call ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <span>•</span>
              <span>{new Date(call.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCall(true)}
            disabled={isRefreshing}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing with Provider...' : 'Sync Provider Data'}
          </Button>
        </div>
      </div>

      {/* Primary KPI & Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Destination & Source */}
        <Card className="bg-slate-50/50 dark:bg-slate-900/40">
          <CardContent className="p-4 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Participants</span>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Destination:</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">{call.destinationNumber}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Source:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {call.phoneNumberDisplay || call.sourceNumber || 'Platform Default'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 dark:text-slate-400">Direction:</span>
                <span className="capitalize font-medium text-slate-700 dark:text-slate-300">{call.direction}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Voice Agent */}
        <Card className="bg-slate-50/50 dark:bg-slate-900/40">
          <CardContent className="p-4 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Voice Agent</span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{call.agentName || 'Default Agent'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[140px]">
                  {call.agentId || 'OmniDimension Managed'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card className="bg-slate-50/50 dark:bg-slate-900/40">
          <CardContent className="p-4 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Call Duration</span>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {call.durationDisplay || `${call.durationSeconds}s`}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Source: <span className="font-medium text-slate-700 dark:text-slate-300">{call.durationSource.replace('_', ' ')}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Provider Correlation */}
        <Card className="bg-slate-50/50 dark:bg-slate-900/40">
          <CardContent className="p-4 space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider Tracking</span>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Provider:</span>
                <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{call.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Call ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {call.providerCallId || 'Pending'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Request ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {call.providerRequestId || 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call Recording Section */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader
          title="Audio Recording"
          subtitle="Provider-generated audio capture of this voice session"
          action={
            call.recordingAvailable && call.recordingUrl ? (
              <a
                href={call.recordingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                External Link <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : null
          }
        />
        <CardContent>
          {call.recordingAvailable && call.recordingUrl ? (
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Call Recording Playback</p>
                  <p className="text-xs text-slate-500">Streamed securely from OmniDimension</p>
                </div>
              </div>
              <audio controls className="w-full h-10 mt-2 rounded" src={call.recordingUrl} preload="metadata">
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500">
              <VolumeX className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Recording unavailable</p>
                <p className="text-xs text-slate-500">
                  {call.status === 'COMPLETED'
                    ? 'No audio recording file was delivered or processed by the provider for this call session.'
                    : 'Audio recording will become available once the call session completes and the provider finishes post-call processing.'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Analysis & Transcript Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Summary, Sentiment, Extracted Variables */}
        <div className="space-y-6 lg:col-span-1">
          {/* Executive Summary */}
          <Card className="border border-slate-200 dark:border-slate-800">
            <CardHeader
              title="Call Summary"
              subtitle="AI synthesized conversation overview"
              action={<Sparkles className="w-4 h-4 text-indigo-500" />}
            />
            <CardContent>
              {call.summary ? (
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {call.summary}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">No summary generated for this call yet.</p>
              )}

              {/* Sentiment block */}
              {call.sentiment && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Sentiment</span>
                  <div className="flex items-center gap-2">
                    {getSentimentBadge(call.sentiment)}
                  </div>
                  {call.sentimentDetails && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{call.sentimentDetails}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Extracted Variables */}
          <Card className="border border-slate-200 dark:border-slate-800">
            <CardHeader
              title="Extracted Variables"
              subtitle="Structured key/value data collected by AI agent"
              action={<Sliders className="w-4 h-4 text-indigo-500" />}
            />
            <CardContent>
              {hasExtractedVariables ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Object.entries(call.extractedVariables).map(([key, val]) => (
                    <div key={key} className="py-2 flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-500">{key}</span>
                      <span className="font-medium text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No structured variables were extracted from this call.</p>
              )}
            </CardContent>
          </Card>

          {/* Call Context & Correlation Metadata */}
          <Card className="border border-slate-200 dark:border-slate-800">
            <CardHeader
              title="Context & Metadata"
              subtitle="Input payload and correlation parameters"
              action={<Tag className="w-4 h-4 text-slate-400" />}
            />
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Dynamic Call Context
                </span>
                {hasContext ? (
                  <pre className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-800">
                    {JSON.stringify(call.callContext, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-400 italic">None provided</p>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Correlation Metadata
                </span>
                {hasMetadata ? (
                  <pre className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-800">
                    {JSON.stringify(call.metadata, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-400 italic">None provided</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Full Conversation Transcript */}
        <div className="lg:col-span-2">
          <Card className="border border-slate-200 dark:border-slate-800 h-full flex flex-col">
            <CardHeader
              title="Conversation Transcript"
              subtitle="Full turn-by-turn dialogue between agent and customer"
              action={
                call.transcript ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(call.transcript || '', 'transcript')}
                    className="gap-1.5 text-xs"
                  >
                    {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedTranscript ? 'Copied' : 'Copy Transcript'}
                  </Button>
                ) : null
              }
            />
            <CardContent className="flex-1 overflow-y-auto max-h-[700px] p-4">
              {turns.length > 0 ? (
                <div className="space-y-4">
                  {turns.map((turn) => {
                    const isAssistant = turn.role === 'assistant';
                    const isSystem = turn.role === 'system';

                    if (isSystem) {
                      return (
                        <div key={turn.id} className="text-center my-3">
                          <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs rounded-full">
                            {turn.text}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={turn.id}
                        className={`flex gap-3 ${isAssistant ? 'justify-start' : 'justify-end'}`}
                      >
                        {isAssistant && (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}

                        <div
                          className={`max-w-[80%] rounded-2xl p-4 text-sm ${
                            isAssistant
                              ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                              : 'bg-indigo-600 text-white rounded-tr-sm'
                          }`}
                        >
                          <div
                            className={`text-xs font-semibold mb-1 ${
                              isAssistant ? 'text-indigo-600 dark:text-indigo-400' : 'text-indigo-100'
                            }`}
                          >
                            {turn.speakerName}
                          </div>
                          <p className="leading-relaxed whitespace-pre-wrap">{turn.text}</p>
                        </div>

                        {!isAssistant && (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 mt-0.5">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <FileText className="w-12 h-12 mb-3 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No Transcript Available</p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    {call.status === 'COMPLETED'
                      ? 'No verbal dialogue was recorded or transcribed for this call.'
                      : 'The transcript will update once the call finishes and conversation logs are parsed.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
