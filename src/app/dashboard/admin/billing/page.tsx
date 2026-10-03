'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { AdminBillingKPIs, ReconciliationReport } from '@/types/billing';

export default function AdminBillingPage() {
  const [kpis, setKpis] = useState<AdminBillingKPIs | null>(null);
  const [reconReport, setReconReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchKpis() {
      try {
        const res = await fetch('/api/admin/billing');
        const data = await res.json();
        if (mounted && data.success) {
          setKpis(data.data);
        }
      } catch (err) {
        console.error('Failed to load admin billing KPIs:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    fetchKpis();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRunReconciliation = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch('/api/admin/billing/reconciliation');
      const data = await res.json();
      if (data.success) {
        setReconReport(data.data);
      }
    } catch (err) {
      console.error('Failed to run reconciliation:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading platform financial metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              Platform Admin
            </span>
            <span className="text-xs text-slate-400">• Multi-tenant Control Plane</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5 mt-1.5">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            Platform Monetization & Revenue
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Recorded billing revenue, active organization subscriptions, prepaid wallet holdings, and audit reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunReconciliation}
            disabled={isAuditing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
            Run Reconciliation Audit
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recorded Revenue</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            ₹{((kpis?.recordedRevenueMinor ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-1">Total settled paid invoices across all tenants</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Prepaid Wallets</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            ₹{((kpis?.totalPrepaidWalletBalanceMinor ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-1">Prepaid customer credits held in trust</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Subscriptions</span>
          <div className="mt-2 text-3xl font-extrabold text-indigo-600">
            {kpis?.activeSubscriptionsCount ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {kpis?.trialSubscriptionsCount ?? 0} on trial • {kpis?.pastDueSubscriptionsCount ?? 0} past due
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Usage Volume</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            {kpis?.monthlyBilledMinutes.toLocaleString() ?? 0} <span className="text-sm font-normal text-slate-500">mins</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{kpis?.monthlyBilledCalls ?? 0} billable calls finalized</p>
        </div>
      </div>

      {/* Reconciliation Audit Panel */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600" />
              Cross-System Financial & Usage Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated audit comparing completed calls, usage events, usage charges, and wallet ledger balances.
            </p>
          </div>
          {reconReport && (
            <span
              className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${
                reconReport.discrepancyCount === 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
              }`}
            >
              {reconReport.discrepancyCount === 0 ? '100% Balanced' : `${reconReport.discrepancyCount} Discrepancies`}
            </span>
          )}
        </div>

        <div className="mt-5">
          {!reconReport ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              Click &quot;Run Reconciliation Audit&quot; to execute cross-table invariant checks across all tenant organizations.
            </div>
          ) : reconReport.discrepancies.length === 0 ? (
            <div className="py-6 flex items-center justify-center gap-3 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              All {reconReport.totalChecked} checked records, calls, and wallet balances are strictly balanced and verified!
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                The following anomalies were detected during audit run at {new Date(reconReport.timestamp).toLocaleTimeString()}:
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reconReport.discrepancies.map((disc, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-700 dark:text-slate-300">{disc.details}</span>
                    <span className="font-bold text-amber-600 uppercase">{disc.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
