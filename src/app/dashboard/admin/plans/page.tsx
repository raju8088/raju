'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { BillingPlan } from '@/types/billing';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    monthly_price: 2999,
    annual_price: 29990,
    included_minutes: 500,
    max_users: 5,
    max_agents: 2,
    max_campaigns: 10,
    max_monthly_calls: 1000,
    max_concurrency: 2,
  });

  const loadPlans = async () => {
    try {
      const res = await fetch('/api/admin/plans');
      const data = await res.json();
      if (data.success) {
        setPlans(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const res = await fetch('/api/admin/plans');
        const data = await res.json();
        if (mounted && data.success) {
          setPlans(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setMsg(null);
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        monthly_price_minor: form.monthly_price * 100,
        annual_price_minor: form.annual_price * 100,
        included_minutes: form.included_minutes,
        max_users: form.max_users,
        max_agents: form.max_agents,
        max_campaigns: form.max_campaigns,
        max_monthly_calls: form.max_monthly_calls,
        max_concurrency: form.max_concurrency,
        features: ['Standard feature set'],
      };

      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to create plan');

      setMsg({ type: 'success', text: `Plan ${form.name} created successfully!` });
      setCreateModalOpen(false);
      await loadPlans();
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading subscription plans...</p>
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
            <span className="text-xs text-slate-400">• Subscription Pricing Engine</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5 mt-1.5">
            <Settings className="w-6 h-6 text-indigo-600" />
            Plan & Entitlement Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure subscription pricing tiers, versioned rate cards, included voice minutes, and concurrency limits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Create New Plan
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 text-sm ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{msg.text}</span>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {p.code}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                  {p.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-2">{p.name}</h3>
              <p className="text-2xl font-extrabold text-indigo-600 mt-2">
                ₹{(p.monthly_price_minor / 100).toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">/mo</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description || 'No description provided.'}</p>

              <div className="mt-5 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>Included Minutes:</span>
                  <span className="font-bold">{p.included_minutes.toLocaleString()} mins</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Agents:</span>
                  <span className="font-bold">{p.max_agents}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Users:</span>
                  <span className="font-bold">{p.max_users}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Campaigns:</span>
                  <span className="font-bold">{p.max_campaigns}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Concurrency:</span>
                  <span className="font-bold">{p.max_concurrency} parallel calls</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => alert(`Plan ${p.name} is managed directly via versioned price records.`)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Version Price Card →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Plan Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                Create New Billing Plan
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Plan Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="ENTERPRISE_PLUS"
                    className="mt-1 w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Plan Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enterprise Plus"
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Custom high-volume tier for large enterprises..."
                  rows={2}
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Monthly Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.monthly_price}
                    onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 text-sm font-bold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Annual Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.annual_price}
                    onChange={(e) => setForm({ ...form, annual_price: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 text-sm font-bold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Included Mins</label>
                  <input
                    type="number"
                    min="0"
                    value={form.included_minutes}
                    onChange={(e) => setForm({ ...form, included_minutes: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Max Agents</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_agents}
                    onChange={(e) => setForm({ ...form, max_agents: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Concurrency</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_concurrency}
                    onChange={(e) => setForm({ ...form, max_concurrency: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
