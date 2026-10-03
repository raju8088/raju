'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  User,
  Building2,
  Shield,
  KeyRound,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { OrgContext } from '@/types';

export default function SettingsPage() {
  const [context, setContext] = useState<OrgContext | null>(null);
  const [activeTab, setActiveTab] = useState<'account' | 'organization' | 'security'>('account');
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.success) {
          setContext(data.data);
        }
      } catch (err) {
        console.error('Failed to load session', err);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  if (loading || !context) {
    return <div className="py-12 text-center text-xs text-slate-400">Loading settings...</div>;
  }

  const { user, organization, role, permissions } = context;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          Workspace Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Manage your personal profile, organization preferences, and security credentials.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('account')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'account'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <User className="h-4 w-4" />
          Account Profile
        </button>

        <button
          onClick={() => setActiveTab('organization')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'organization'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Organization Details
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'security'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          Security & Roles
        </button>
      </div>

      {saveSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {/* Account Tab */}
      {activeTab === 'account' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="User Profile"
            subtitle="Your personal identification in VoiceNuvo"
          />
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <Input
              label="Full Name"
              defaultValue={user.name}
              required
            />

            <Input
              label="Email Address"
              defaultValue={user.email}
              disabled
              helperText="Email cannot be changed directly."
            />

            <Input
              label="Phone Number"
              defaultValue={user.phone || ''}
              placeholder="+12025550199"
            />

            <div className="pt-2">
              <Button type="submit">Update Profile</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Organization Tab */}
      {activeTab === 'organization' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Organization Profile"
            subtitle="Tenant settings and branding details"
            action={<Badge variant="success">{organization.status}</Badge>}
          />
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <Input
              label="Organization Legal Name"
              defaultValue={organization.name}
              disabled={role === 'EMPLOYEE'}
            />

            <Input
              label="Organization URL Slug"
              defaultValue={organization.slug}
              disabled
              helperText="Organization slug is immutable."
            />

            <Input
              label="White-Label Brand Display Name"
              defaultValue={organization.brand_name || organization.name}
              disabled={role === 'EMPLOYEE'}
            />

            {role !== 'EMPLOYEE' && (
              <div className="pt-2">
                <Button type="submit">Save Organization Changes</Button>
              </div>
            )}
          </form>
        </Card>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader
              title="Role & Assigned Privileges"
              subtitle="Your current authorization capabilities"
              action={<Badge variant="info">{role.replace('_', ' ')}</Badge>}
            />
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 border border-slate-100 dark:border-slate-800 text-xs">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Active Permissions:</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {permissions.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Authentication & Password"
              subtitle="Manage your access security"
            />
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Password Authentication</p>
                    <p className="text-[11px] text-slate-400">Secure PBKDF2/scrypt hashed credentials</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => alert('Password reset link sent to registered email.')}>
                  Change Password
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 opacity-75">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Provider API Connections</p>
                    <p className="text-[11px] text-slate-400">OmniDimension credentials & API keys (Coming in Phase 3)</p>
                  </div>
                </div>
                <Badge variant="neutral" size="sm">Phase 3</Badge>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
