'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Phone,
  Search,
  ShoppingCart,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { NormalizedPhoneNumber, NormalizedAgent } from '@/lib/providers/voice/provider-types';

export default function PhoneNumbersPage() {
  const [activeTab, setActiveTab] = useState<'my-numbers' | 'buy'>('my-numbers');
  const [numbers, setNumbers] = useState<(NormalizedPhoneNumber & { assignedAgentName?: string })[]>([]);
  const [agents, setAgents] = useState<NormalizedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search available state
  const [searchRegion, setSearchRegion] = useState<'US' | 'IN'>('US');
  const [searchCarrier, setSearchCarrier] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<NormalizedPhoneNumber[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Purchase modal
  const [selectedNumberToBuy, setSelectedNumberToBuy] = useState<NormalizedPhoneNumber | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Releasing state
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const fetchMyNumbers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [phonesRes, agentsRes] = await Promise.all([
        fetch('/api/phone-numbers'),
        fetch('/api/agents'),
      ]);
      const phonesData = await phonesRes.json();
      const agentsData = await agentsRes.json();

      if (phonesData.success) {
        setNumbers(phonesData.data);
      } else {
        setError(phonesData.error?.message || 'Failed to load phone numbers');
      }

      if (agentsData.success) {
        setAgents(agentsData.data);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to connect to phone service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetch('/api/phone-numbers'), fetch('/api/agents')])
      .then(async ([phonesRes, agentsRes]) => {
        const phonesData = await phonesRes.json();
        const agentsData = await agentsRes.json();
        if (!isMounted) return;
        if (phonesData.success) {
          setNumbers(phonesData.data);
        } else {
          setError(phonesData.error?.message || 'Failed to load phone numbers');
        }
        if (agentsData.success) {
          setAgents(agentsData.data);
        }
      })
      .catch((err) => {
        if (isMounted) setError((err as Error).message || 'Failed to connect to phone service');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchAvailable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSearching(true);
      setError(null);
      const queryParams = new URLSearchParams({
        region: searchRegion,
        ...(searchCarrier ? { carrier: searchCarrier } : {}),
      });

      const res = await fetch(`/api/phone-numbers/search?${queryParams.toString()}`);
      const data = await res.json();
      if (data.success) {
        setAvailableNumbers(data.data);
      } else {
        setError(data.error?.message || 'Search failed');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to search available numbers');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedNumberToBuy) return;

    try {
      setIsPurchasing(true);
      setError(null);
      const res = await fetch('/api/phone-numbers/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: selectedNumberToBuy.phoneNumber,
          carrier: selectedNumberToBuy.carrier,
          region: selectedNumberToBuy.region,
          idempotencyKey: `buy_${selectedNumberToBuy.phoneNumber}_${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Successfully acquired ${selectedNumberToBuy.phoneNumber}!`);
        setSelectedNumberToBuy(null);
        setActiveTab('my-numbers');
        await fetchMyNumbers();
      } else {
        setError(data.error?.message || 'Purchase failed');
      }
    } catch (err) {
      setError((err as Error).message || 'Purchase error');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleAssignAgent = async (phoneId: string, agentId: string) => {
    try {
      setError(null);
      if (!agentId) {
        // Detach
        await fetch('/api/phone-numbers/detach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneId }),
        });
        setSuccess('Phone number detached from agent.');
      } else {
        // Attach
        await fetch('/api/phone-numbers/attach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneId, agentId }),
        });
        setSuccess('Phone number successfully assigned to agent.');
      }
      await fetchMyNumbers();
    } catch (err) {
      setError((err as Error).message || 'Failed to update agent assignment');
    }
  };

  const handleRelease = async (phoneId: string, phoneStr: string) => {
    if (!confirm(`Release number ${phoneStr}? This number will be removed from your account inventory.`)) {
      return;
    }

    try {
      setReleasingId(phoneId);
      const res = await fetch(`/api/phone-numbers/${phoneId}/release`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Number ${phoneStr} released.`);
        await fetchMyNumbers();
      } else {
        setError(data.error?.message || 'Failed to release number');
      }
    } catch (err) {
      setError((err as Error).message || 'Release error');
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Phone className="h-6 w-6 text-indigo-600" />
            Telephony & Phone Numbers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your phone number inventory, purchase virtual local/toll-free numbers, and route inbound calls to voice agents.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMyNumbers}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setActiveTab('buy')}
            className="flex items-center gap-1.5"
          >
            <ShoppingCart className="h-4 w-4" />
            Buy Numbers
          </Button>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Telephony Notice</p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('my-numbers')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'my-numbers'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Phone className="h-4 w-4" />
          My Numbers ({numbers.length})
        </button>
        <button
          onClick={() => setActiveTab('buy')}
          className={`px-4 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'buy'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Buy Number (Shop)
        </button>
      </div>

      {/* Tab 1: My Numbers */}
      {activeTab === 'my-numbers' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Phone Numbers</CardTitle>
            <CardDescription>Inbound phone numbers routed to your AI voice agents</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading phone numbers...</div>
            ) : numbers.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                <Phone className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Phone Numbers in Inventory</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Acquire a virtual phone number from the Number Shop to start receiving inbound voice calls.
                </p>
                <Button size="sm" onClick={() => setActiveTab('buy')} className="mt-4">
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Explore Available Numbers
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {numbers.map((phone) => (
                  <div key={phone.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                          {phone.phoneNumber}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>Region: {phone.region}</span>
                          <span>•</span>
                          <span>Carrier: {phone.carrier || 'Default'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-52">
                        <select
                          value={phone.assignedAgentId || ''}
                          onChange={(e) => handleAssignAgent(phone.id, e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-xs font-medium"
                        >
                          <option value="">Unassigned (No Agent)</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>Agent: {a.name}</option>
                          ))}
                        </select>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRelease(phone.id, phone.phoneNumber)}
                        disabled={releasingId === phone.id}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 h-8 px-2"
                        title="Release Number"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Buy Number */}
      {activeTab === 'buy' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Search Available Phone Numbers</CardTitle>
              <CardDescription>Browse numbers provided by OmniDimension telephony network</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearchAvailable} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Region</label>
                  <select
                    value={searchRegion}
                    onChange={(e) => setSearchRegion(e.target.value as 'US' | 'IN')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-sm"
                  >
                    <option value="US">United States (+1)</option>
                    <option value="IN">India (+91)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Carrier (Optional)</label>
                  <Input
                    placeholder="e.g. Twilio, Tier1"
                    value={searchCarrier}
                    onChange={(e) => setSearchCarrier(e.target.value)}
                  />
                </div>

                <div>
                  <Button type="submit" disabled={isSearching} className="w-full flex items-center justify-center gap-1.5">
                    <Search className="h-4 w-4" />
                    {isSearching ? 'Searching Network...' : 'Search Numbers'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Results List */}
          {availableNumbers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Available Inventory ({availableNumbers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {availableNumbers.map((num) => (
                    <div key={num.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          {num.region}
                        </div>
                        <div>
                          <p className="text-base font-mono font-bold text-slate-900 dark:text-slate-100">
                            {num.phoneNumber}
                          </p>
                          <span className="text-xs text-slate-400">Carrier: {num.carrier || 'Default'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            ${num.monthlyRentalUsd?.toFixed(2) || '2.00'}
                          </p>
                          <span className="text-[10px] text-slate-400">/ month</span>
                        </div>

                        <Button size="sm" onClick={() => setSelectedNumberToBuy(num)}>
                          Purchase
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Purchase Confirmation Modal */}
          {selectedNumberToBuy && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
              <Card className="w-full max-w-md shadow-xl animate-in fade-in-50 zoom-in-95">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-indigo-600" />
                    Confirm Phone Number Acquisition
                  </CardTitle>
                  <CardDescription>
                    Acquire this number into your organization telephony inventory.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Phone Number:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {selectedNumberToBuy.phoneNumber}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Carrier:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {selectedNumberToBuy.carrier || 'Default'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Region:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {selectedNumberToBuy.region}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-800 font-semibold">
                      <span>Monthly Rental:</span>
                      <span className="text-indigo-600 dark:text-indigo-400">
                        ${selectedNumberToBuy.monthlyRentalUsd?.toFixed(2) || '2.00'}/mo
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <Button type="button" variant="outline" onClick={() => setSelectedNumberToBuy(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handlePurchase} disabled={isPurchasing}>
                      {isPurchasing ? 'Processing Order...' : 'Confirm & Purchase'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
