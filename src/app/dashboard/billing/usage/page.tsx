'use client';

import React, { useState, useEffect } from 'react';
import { Radio, Download, Calendar } from 'lucide-react';
import { UsageCharge } from '@/types/billing';

export default function UsageDashboardPage() {
  const [charges, setCharges] = useState<UsageCharge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const res = await fetch(`/api/billing/usage?limit=${limit}&offset=${offset}`);
        const data = await res.json();
        if (mounted && data.success) {
          setCharges(data.data.charges || []);
          setTotal(data.data.total || 0);
        }
      } catch (err) {
        console.error('Failed to load usage data:', err);
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
  }, [limit, offset]);

  const totalMinutes = charges.reduce((acc, c) => acc + Number(c.quantity), 0);
  const totalSpendMinor = charges.reduce((acc, c) => acc + c.total_minor, 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-indigo-600" />
            Voice Usage & Call Metering
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Authoritative call durations, rounding calculations, unit rates, and debited charges.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/billing/export?type=usage"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            Export Usage CSV
          </a>
        </div>
      </div>

      {/* Usage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Billable Minutes (Page)</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            {totalMinutes.toFixed(0)} <span className="text-sm font-normal text-slate-500">mins</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Rounded according to organization billing policy</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Charged (Page)</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            ₹{(totalSpendMinor / 100).toFixed(2)}
          </div>
          <p className="text-xs text-slate-400 mt-1">Includes 18% GST deduction</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Metered Calls</span>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            {total.toLocaleString()}
          </div>
          <p className="text-xs text-slate-400 mt-1">Calls with verified provider durations</p>
        </div>
      </div>

      {/* Usage Charges Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4">Actual Duration</th>
                <th className="py-3 px-4">Billable Mins</th>
                <th className="py-3 px-4">Rate (INR/min)</th>
                <th className="py-3 px-4">Subtotal</th>
                <th className="py-3 px-4">Tax (18%)</th>
                <th className="py-3 px-4 font-bold text-right">Total Charged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    Loading call metering logs...
                  </td>
                </tr>
              ) : charges.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                    No billable call usage recorded yet.
                  </td>
                </tr>
              ) : (
                charges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(charge.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                      {charge.destination_number || 'Direct Dial'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {charge.call_duration_seconds ? `${charge.call_duration_seconds}s` : '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 text-xs">
                      {Number(charge.quantity).toFixed(0)} min(s)
                    </td>
                    <td className="py-3 px-4 text-xs">
                      ₹{(charge.unit_price_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      ₹{(charge.subtotal_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      ₹{(charge.tax_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₹{(charge.total_minor / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {Math.min(offset + 1, total)} to {Math.min(offset + limit, total)} of {total} records
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
