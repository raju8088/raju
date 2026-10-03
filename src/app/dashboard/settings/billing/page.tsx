'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Wallet,
  ArrowUpRight,
  Download,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { OrgBillingSummary, BillingPlan, BillingInvoice, BillingWalletLedger } from '@/types/billing';

export default function BillingPage() {
  const [summary, setSummary] = useState<OrgBillingSummary | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [ledger, setLedger] = useState<BillingWalletLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupModalOpen, setTopupModalOpen] = useState(false);
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(1000); // ₹1,000
  const [isProcessing, setIsProcessing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Billing Profile State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    businessLegalName: '',
    gstin: '',
    isGstRegistered: false,
    placeOfSupply: '',
  });

  const loadData = async () => {
    try {
      const [sumRes, planRes, invRes, wallRes] = await Promise.all([
        fetch('/api/billing'),
        fetch('/api/billing/plans'),
        fetch('/api/billing/invoices'),
        fetch('/api/billing/wallet'),
      ]);

      const sumData = await sumRes.json();
      const planData = await planRes.json();
      const invData = await invRes.json();
      const wallData = await wallRes.json();

      if (sumData.success) {
        setSummary(sumData.data);
        if (sumData.data.customer) {
          setProfileForm({
            name: sumData.data.customer.name || '',
            email: sumData.data.customer.email || '',
            phone: sumData.data.customer.phone || '',
            businessLegalName: sumData.data.customer.business_legal_name || '',
            gstin: sumData.data.customer.gstin || '',
            isGstRegistered: sumData.data.customer.is_gst_registered || false,
            placeOfSupply: sumData.data.customer.place_of_supply || '',
          });
        }
      }
      if (planData.success) setPlans(planData.data);
      if (invData.success) setInvoices(invData.data.invoices || []);
      if (wallData.success) setLedger(wallData.data.ledger || []);
    } catch (err) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const [sumRes, planRes, invRes, wallRes] = await Promise.all([
          fetch('/api/billing'),
          fetch('/api/billing/plans'),
          fetch('/api/billing/invoices'),
          fetch('/api/billing/wallet'),
        ]);

        const sumData = await sumRes.json();
        const planData = await planRes.json();
        const invData = await invRes.json();
        const wallData = await wallRes.json();

        if (mounted) {
          if (sumData.success) {
            setSummary(sumData.data);
            if (sumData.data.customer) {
              setProfileForm({
                name: sumData.data.customer.name || '',
                email: sumData.data.customer.email || '',
                phone: sumData.data.customer.phone || '',
                businessLegalName: sumData.data.customer.business_legal_name || '',
                gstin: sumData.data.customer.gstin || '',
                isGstRegistered: sumData.data.customer.is_gst_registered || false,
                placeOfSupply: sumData.data.customer.place_of_supply || '',
              });
            }
          }
          if (planData.success) setPlans(planData.data);
          if (invData.success) setInvoices(invData.data.invoices || []);
          if (wallData.success) setLedger(wallData.data.ledger || []);
        }
      } catch (err) {
        console.error('Failed to load billing data:', err);
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

  const handleTopUp = async () => {
    setIsProcessing(true);
    setMsg(null);
    try {
      const amountMinor = topupAmount * 100;
      const orderRes = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor, purpose: 'WALLET_TOPUP' }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) throw new Error(orderData.error?.message || 'Failed to create order');

      // Verify payment with server (in test/demo mode, automatic capture)
      const verifyRes = await fetch('/api/billing/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderData.data.order.id,
          razorpayOrderId: orderData.data.order.razorpay_order_id,
          razorpayPaymentId: (orderData.data.order.razorpay_order_id as string).replace('order_', 'pay_'),
          razorpaySignature: 'sig_mock_verified',
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) throw new Error(verifyData.error?.message || 'Payment verification failed');

      setMsg({ type: 'success', text: `Successfully added ₹${topupAmount.toLocaleString()} to prepaid wallet!` });
      setTopupModalOpen(false);
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    setIsProcessing(true);
    setMsg(null);
    try {
      const orderRes = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: 'MONTHLY', purpose: 'SUBSCRIPTION' }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) throw new Error(orderData.error?.message || 'Failed to initialize subscription');

      const verifyRes = await fetch('/api/billing/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderData.data.order.id,
          razorpayOrderId: orderData.data.order.razorpay_order_id,
          razorpayPaymentId: (orderData.data.order.razorpay_order_id as string).replace('order_', 'pay_sub_'),
          razorpaySignature: 'sig_mock_verified',
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) throw new Error(verifyData.error?.message || 'Subscription activation failed');

      setMsg({ type: 'success', text: 'Plan upgraded successfully!' });
      setChangePlanModalOpen(false);
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setMsg(null);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to update profile');
      setMsg({ type: 'success', text: 'Billing profile & GST details updated.' });
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
          <p className="text-sm text-slate-500 font-medium">Loading billing details...</p>
        </div>
      </div>
    );
  }

  const walletBalance = (summary?.wallet?.balance_minor ?? 0) / 100;
  const isLowBalance = (summary?.wallet?.balance_minor ?? 0) < (summary?.wallet?.low_balance_threshold_minor ?? 50000);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            Billing & Subscription
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your VoiceNuvo plan, prepaid wallet balance, GST tax invoices, and usage rates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTopupModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
          >
            <Wallet className="w-4 h-4" />
            Add Credits
          </button>
          <button
            onClick={() => setChangePlanModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg transition"
          >
            <Sparkles className="w-4 h-4 text-violet-500" />
            Change Plan
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Wallet Balance */}
        <div className={`p-5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm ${isLowBalance ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-slate-800'}`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Prepaid Wallet</span>
            <Wallet className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              ₹{walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          {isLowBalance && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Low balance (below threshold)
            </div>
          )}
          <button
            onClick={() => setTopupModalOpen(true)}
            className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            Recharge Credits <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Current Plan */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Plan</span>
            <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              {summary?.subscription?.status || 'ACTIVE'}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {summary?.plan?.name || 'Growth Plan'}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              ₹{((summary?.plan?.monthly_price_minor ?? 799900) / 100).toLocaleString()} / month
            </p>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Renews: {summary?.subscription?.current_period_end ? new Date(summary.subscription.current_period_end).toLocaleDateString() : 'Next month'}
          </div>
        </div>

        {/* Included Minutes */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Included Minutes</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {summary?.includedMinutesRemaining ?? 0}
            </span>
            <span className="text-xs text-slate-500 ml-1">/ {summary?.includedMinutesTotal ?? 500} mins left</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full"
              style={{
                width: `${Math.min(100, ((summary?.includedMinutesUsed ?? 0) / (summary?.includedMinutesTotal || 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Consumed first before wallet balance</p>
        </div>

        {/* Monthly Call Usage */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Usage This Month</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              ₹{((summary?.currentMonthUsageMinor ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rate: ₹7.00/min standard outbound
          </p>
          <a
            href="/dashboard/billing/usage"
            className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View call logs breakdown →
          </a>
        </div>
      </div>

      {/* GST & Invoicing Profile */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-600" />
          Tax & Billing Profile (GST)
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Indian GST rules require billing legal details for official tax deductions and B2B input tax credits.
        </p>

        <form onSubmit={handleSaveProfile} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Billing Contact Name
            </label>
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Billing Email (for Invoices)
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Business Legal Name
            </label>
            <input
              type="text"
              value={profileForm.businessLegalName}
              onChange={(e) => setProfileForm({ ...profileForm, businessLegalName: e.target.value })}
              placeholder="e.g. Acme Telephony Solutions Pvt Ltd"
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              GSTIN (Tax Identification)
            </label>
            <input
              type="text"
              value={profileForm.gstin}
              onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value })}
              placeholder="e.g. 27AAAAA0000A1Z5"
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Place of Supply (State)
            </label>
            <input
              type="text"
              value={profileForm.placeOfSupply}
              onChange={(e) => setProfileForm({ ...profileForm, placeOfSupply: e.target.value })}
              placeholder="e.g. Maharashtra, Karnataka, Delhi"
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="gst_check"
              checked={profileForm.isGstRegistered}
              onChange={(e) => setProfileForm({ ...profileForm, isGstRegistered: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <label htmlFor="gst_check" className="text-sm text-slate-700 dark:text-slate-300">
              Organization is registered for GST (Input Tax Credit)
            </label>
          </div>

          <div className="md:col-span-2 pt-3">
            <button
              type="submit"
              disabled={isProcessing}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {isProcessing ? 'Saving...' : 'Update Billing Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Invoices History Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Invoices & Statements</h2>
            <p className="text-xs text-slate-500">Download GST tax invoices and settlement statements.</p>
          </div>
          <a
            href="/api/billing/export?type=invoices"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Tax (GST)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                    No invoices generated yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4 text-xs">{new Date(inv.issue_date).toLocaleDateString()}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      ₹{(inv.total_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      ₹{(inv.tax_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => alert(`Invoice ${inv.invoice_number}\nTotal: ₹${(inv.total_minor / 100).toFixed(2)}\nStatus: ${inv.status}`)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wallet Ledger History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent Wallet Transactions</h2>
          <p className="text-xs text-slate-500">Append-only audit trail of credit recharges and call debits.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                    No wallet transactions recorded yet.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-xs font-mono">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                          entry.amount_minor >= 0
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                        }`}
                      >
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs">{entry.description}</td>
                    <td
                      className={`py-3 px-4 font-semibold text-sm ${
                        entry.amount_minor >= 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {entry.amount_minor >= 0 ? '+' : ''}₹{(entry.amount_minor / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      ₹{(entry.balance_after_minor / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top-up Modal */}
      {topupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                Add Prepaid Credits
              </h3>
              <button
                onClick={() => setTopupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase">Select Amount</label>
              <div className="grid grid-cols-3 gap-2">
                {[500, 1000, 2500, 5000, 10000, 25000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-2 px-3 text-sm font-bold rounded-lg border text-center transition ${
                      topupAmount === amt
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-500 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    ₹{amt.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase">Custom Amount (₹)</label>
                <input
                  type="number"
                  min="500"
                  step="100"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-base font-bold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">Minimum top-up is ₹500 (plus 18% GST invoice).</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTopupModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTopUp}
                disabled={isProcessing || topupAmount < 500}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : `Pay ₹${topupAmount.toLocaleString()} via Razorpay`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {changePlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full p-6 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Upgrade VoiceNuvo Plan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Select a subscription tier to expand agents, concurrency, and included minutes.</p>
              </div>
              <button
                onClick={() => setChangePlanModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p) => {
                const isCurrent = summary?.plan?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{p.name}</h4>
                      <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                        ₹{(p.monthly_price_minor / 100).toLocaleString()}{' '}
                        <span className="text-xs font-normal text-slate-500">/mo</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>

                      <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <div>• {p.included_minutes.toLocaleString()} included mins</div>
                        <div>• Up to {p.max_agents} voice agents</div>
                        <div>• Up to {p.max_users} team members</div>
                        <div>• {p.max_concurrency} parallel calls</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectPlan(p.id)}
                      disabled={isCurrent || isProcessing}
                      className={`mt-6 w-full py-2 text-xs font-bold rounded-lg transition ${
                        isCurrent
                          ? 'bg-slate-200 text-slate-500 cursor-default'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isCurrent ? 'Current Plan' : 'Select Plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
