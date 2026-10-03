'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  Bot,
  FileText,
  Phone,
  PhoneCall,
  Megaphone,
  CreditCard,
  UserCheck,
  Radio,
  Cpu,
} from 'lucide-react';
import { RoleType } from '@/types';
import { Badge } from '../ui/badge';

interface SidebarProps {
  role?: RoleType;
}

export const DashboardSidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();

  const isMainAdmin = role === 'MAIN_ADMIN';

  const navItems = [
    {
      label: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      label: 'AI Agents',
      href: '/dashboard/agents',
      icon: Bot,
      active: pathname.startsWith('/dashboard/agents'),
    },
    {
      label: 'Knowledge Base',
      href: '/dashboard/knowledge-base',
      icon: FileText,
      active: pathname.startsWith('/dashboard/knowledge-base'),
    },
    {
      label: 'Phone Numbers',
      href: '/dashboard/phone-numbers',
      icon: Phone,
      active: pathname.startsWith('/dashboard/phone-numbers'),
    },
    {
      label: 'Calls & Logs',
      href: '/dashboard/calls',
      icon: PhoneCall,
      active: pathname.startsWith('/dashboard/calls'),
    },
    {
      label: 'Campaigns',
      href: '/dashboard/campaigns',
      icon: Megaphone,
      active: pathname.startsWith('/dashboard/campaigns'),
      badge: 'Bulk',
    },
    {
      label: 'CRM & Leads',
      href: '/dashboard/leads',
      icon: UserCheck,
      active: pathname.startsWith('/dashboard/leads') || pathname.startsWith('/dashboard/contacts'),
      badge: 'CRM',
    },
    ...(isMainAdmin
      ? [
          {
            label: 'Organizations',
            href: '/dashboard/organizations',
            icon: Building2,
            active: pathname.startsWith('/dashboard/organizations'),
            badge: 'Global',
          },
        ]
      : []),
    {
      label: 'Team Members',
      href: '/dashboard/users',
      icon: Users,
      active: pathname.startsWith('/dashboard/users'),
    },
    {
      label: 'Integrations',
      href: '/dashboard/settings/integrations',
      icon: Cpu,
      active: pathname.startsWith('/dashboard/settings/integrations'),
      badge: 'Meta',
    },
    {
      label: 'Billing & Plans',
      href: '/dashboard/settings/billing',
      icon: CreditCard,
      active: pathname.startsWith('/dashboard/settings/billing'),
      badge: 'Wallet',
    },
    {
      label: 'Voice Usage',
      href: '/dashboard/billing/usage',
      icon: Radio,
      active: pathname.startsWith('/dashboard/billing/usage'),
    },
    ...(isMainAdmin
      ? [
          {
            label: 'Platform Billing',
            href: '/dashboard/admin/billing',
            icon: CreditCard,
            active: pathname === '/dashboard/admin/billing' || pathname.startsWith('/dashboard/admin/billing'),
            badge: 'Admin',
          },
          {
            label: 'Plan Manager',
            href: '/dashboard/admin/plans',
            icon: Settings,
            active: pathname.startsWith('/dashboard/admin/plans'),
            badge: 'Admin',
          },
        ]
      : []),
    {
      label: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      active: pathname === '/dashboard/settings',
    },
  ];

  const futureModules: Array<{ label: string; icon: React.ComponentType<{ className?: string }>; phase: string }> = [];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 min-h-screen dark:border-slate-800 dark:bg-slate-950">
      <div>
        {/* Brand header */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              VoiceNuvo
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                P3
              </span>
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">AI Voice SaaS</p>
          </div>
        </div>

        {/* Navigation list */}
        <div className="px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  item.active
                    ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-950/50 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 ${item.active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <Badge variant="info" size="sm">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        {/* Future Modules Section */}
        <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Roadmap Pipeline
          </div>
          <div className="space-y-1">
            {futureModules.map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.label}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-normal text-slate-400 cursor-not-allowed opacity-75 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                  title="Coming in future phases"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    <span>{module.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-1.5 py-0.5 rounded">
                    {module.phase}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Phase 3 Voice Engine</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">OmniDimension Voice Integration</p>
        </div>
      </div>
    </aside>
  );
};
