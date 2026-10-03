'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  ArrowLeft,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Contact } from '@/types/crm';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [creating, setCreating] = useState(false);

  const loadContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String((page - 1) * limit),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.data.contacts);
        setTotal(data.data.total);
      }
    } catch (err) {
      console.error('Failed to load contacts', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
    });
    if (search.trim()) params.set('search', search.trim());

    fetch(`/api/contacts?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setContacts(data.data.contacts);
          setTotal(data.data.total);
        }
      })
      .catch((err) => console.error('Failed to load contacts', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [page, search]);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone && !email) {
      alert('Please provide at least a phone number or email address');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          email,
          company,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setFullName('');
        setPhone('');
        setEmail('');
        setCompany('');
        loadContacts();
      } else {
        alert(data.error?.message || 'Failed to create contact');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="h-7 w-7 text-indigo-600" />
            Contacts Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Normalized customer identity database across all leads, forms, and bulk campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Leads
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Contact
          </button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-950 p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search contacts by name, normalized phone, email, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">Total: {total}</div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
            <tr>
              <th className="py-3 px-4">Contact Name</th>
              <th className="py-3 px-4">Phone (E.164)</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Last Activity</th>
              <th className="py-3 px-4">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-600" />
                  Loading contacts...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No contacts found.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {contact.full_name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    {contact.normalized_phone || contact.phone || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {contact.email || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {contact.company || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {[contact.city, contact.state, contact.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {contact.last_activity_at ? new Date(contact.last_activity_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div>
            Showing {contacts.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
            {Math.min(page * limit, total)} of {total} contacts
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl text-xs space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Add New Contact</h3>
            <form onSubmit={handleCreateContact} className="space-y-3">
              <div>
                <label className="block text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Phone Number (E.164)</label>
                <input
                  type="text"
                  placeholder="+14155552671"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Company</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
