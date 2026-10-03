'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, User } from 'lucide-react';
import { OrgContext, RoleType } from '@/types';
import { Badge } from '../ui/badge';
import { OrgSwitcher } from './org-switcher';

interface HeaderProps {
  context: OrgContext;
}

export const DashboardHeader: React.FC<HeaderProps> = ({ context }) => {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const roleBadgeVariant: Record<RoleType, 'info' | 'warning' | 'success'> = {
    MAIN_ADMIN: 'info',
    ORG_ADMIN: 'warning',
    EMPLOYEE: 'success',
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-center gap-4">
        <OrgSwitcher currentOrg={context.organization} role={context.role} />
      </div>

      <div className="flex items-center gap-4">
        {/* Role badge */}
        <Badge variant={roleBadgeVariant[context.role]} size="sm" className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {context.role.replace('_', ' ')}
        </Badge>

        {/* User preview */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-slate-800">
          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              {context.user.name}
            </p>
            <p className="text-[10px] text-slate-400 max-w-[150px] truncate">{context.user.email}</p>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out of VoiceNuvo"
          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
