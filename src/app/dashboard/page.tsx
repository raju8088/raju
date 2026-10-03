import React from 'react';
import { getOrganizationContext } from '@/lib/auth/session';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Bot,
  PhoneCall,
  Megaphone,
  UserCheck,
  Phone,
  CreditCard,
  Lock,
  Layers,
  ArrowRight,
  FileText,
  Cpu,
} from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const { user, organization, role } = context;

  const voiceModules = [
    {
      title: 'AI Voice Agents',
      href: '/dashboard/agents',
      description: 'Configure conversational prompts, acoustic voices, LLM reasoning models, and versions.',
      icon: Bot,
      color: 'from-indigo-600 to-violet-600',
      badge: 'Active',
    },
    {
      title: 'Knowledge Base',
      href: '/dashboard/knowledge-base',
      description: 'Upload product manuals, FAQs, and domain documents for live call retrieval.',
      icon: FileText,
      color: 'from-blue-600 to-indigo-600',
      badge: 'Active',
    },
    {
      title: 'Phone Numbers',
      href: '/dashboard/phone-numbers',
      description: 'Telephony inventory, virtual number shop, and inbound routing to agents.',
      icon: Phone,
      color: 'from-emerald-600 to-teal-600',
      badge: 'Active',
    },
    {
      title: 'Voice Integrations',
      href: '/dashboard/settings/integrations',
      description: 'OmniDimension provider credentials, connection health, and safe replacement.',
      icon: Cpu,
      color: 'from-violet-600 to-purple-600',
      badge: 'OmniDim',
    },
  ];

  const futureModules = [
    {
      title: 'Outbound Calling',
      phase: 'Phase 4 — Calling Engine',
      description: 'Automated call dispatching, live call audio, recordings, and transcripts.',
      icon: PhoneCall,
    },
    {
      title: 'Bulk Campaigns',
      phase: 'Phase 5 — Campaigns',
      description: 'High-throughput call campaigns, contact lists, concurrency, and calling hours.',
      icon: Megaphone,
    },
    {
      title: 'CRM & Lead Qualification',
      phase: 'Phase 6 — Leads & CRM',
      description: 'Instant lead qualification, custom pipelines, webhook triggers, and lead scores.',
      icon: UserCheck,
    },
    {
      title: 'Billing & Wallet Credits',
      phase: 'Phase 7 — Billing',
      description: 'Razorpay top-ups, per-minute usage deduction, subscriptions, and invoicing.',
      icon: CreditCard,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-semibold mb-3 border border-indigo-400/20">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Phase 3 Voice Engine Active
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {user.name}
          </h1>
          <p className="mt-2 text-sm text-indigo-100/80 leading-relaxed">
            VoiceNuvo SaaS multi-tenant control plane is running with OmniDimension voice integration. Tenant isolation, conversational agents, and telephony are active for <span className="font-semibold text-white">{organization.name}</span>.
          </p>
        </div>
      </div>

      {/* Tenant Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Organization Info */}
        <Card>
          <CardHeader
            title="Current Organization"
            action={<Badge variant="success">ACTIVE</Badge>}
          />
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {organization.name}
                </p>
                <p className="text-xs font-mono text-slate-400">
                  slug: {organization.slug}
                </p>
              </div>
            </div>
            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span>Brand: {organization.brand_name || organization.name}</span>
              <span className="text-[11px] font-mono text-slate-400">ID: {organization.id.slice(0, 8)}...</span>
            </div>
          </div>
        </Card>

        {/* Role & Permissions */}
        <Card>
          <CardHeader
            title="User Authorization"
            action={
              <Badge variant="info">
                {role.replace('_', ' ')}
              </Badge>
            }
          />
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {user.email}
                </p>
                <p className="text-xs text-slate-400">
                  Account Status: <span className="text-emerald-600 font-semibold">{user.status}</span>
                </p>
              </div>
            </div>
            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span>Permissions: {context.permissions.length} granted</span>
              <span className="text-[11px] text-emerald-600 font-medium">Session Verified</span>
            </div>
          </div>
        </Card>

        {/* Security & Architecture */}
        <Card>
          <CardHeader
            title="Security Status"
            action={<Badge variant="neutral">Enforced</Badge>}
          />
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Tenant Data Isolation: Active</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Server-Side RBAC Enforcement</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <Layers className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>Service Layer Architecture</span>
            </div>
            <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              Zero cross-tenant leakage guaranteed
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Navigation for Admin */}
      {role === 'MAIN_ADMIN' && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-950 dark:bg-indigo-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              👑
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Main Admin Global Oversight
              </p>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400">
                You have system-wide privileges to create, configure, and suspend child organizations.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/organizations"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
          >
            Manage Organizations
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Voice Engine Workspace Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              Voice Engine Workspace
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active conversational AI modules powered by OmniDimension integration.
            </p>
          </div>
          <Badge variant="success" size="sm">
            Live
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {voiceModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.title}
                href={mod.href}
                className="group relative rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-50 to-violet-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="info" size="sm">
                      {mod.badge}
                    </Badge>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-4 group-hover:text-indigo-600 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    {mod.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-indigo-600 font-semibold">
                  <span>Open Module</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Future Modules Pipeline Section (Section 20 requirement) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Future Platform Modules
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modules scheduled for subsequent development phases using this Phase 1 foundation.
            </p>
          </div>
          <Badge variant="neutral" size="sm">
            Roadmap
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {futureModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                className="relative group rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full">
                    {mod.phase}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4">
                  {mod.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {mod.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-medium">Coming in next phase</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[10px]">
                    LOCKED
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
