'use client';

import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { Organization, RoleType } from '@/types';
import { useRouter } from 'next/navigation';

interface OrgSwitcherProps {
  currentOrg: Organization;
  role: RoleType;
}

export const OrgSwitcher: React.FC<OrgSwitcherProps> = ({ currentOrg, role }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const res = await fetch('/api/organizations');
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setOrganizations(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to load organizations', err);
      }
    }
    fetchOrganizations();
  }, []);

  const handleSelectOrg = async (orgId: string) => {
    if (orgId === currentOrg.id) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/switch-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId }),
      });

      if (res.ok) {
        setIsOpen(false);
        router.refresh();
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to switch organization', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 text-left"
      >
        <div className="h-6 w-6 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
          {currentOrg.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[140px] truncate">
            {currentOrg.name}
          </p>
          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
            {currentOrg.slug}
          </p>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 p-1.5 animate-in fade-in zoom-in-95">
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {role === 'MAIN_ADMIN' ? 'All Platform Organizations' : 'Your Organizations'}
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {organizations.map((org) => {
                const isSelected = org.id === currentOrg.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => handleSelectOrg(org.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{org.name}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
