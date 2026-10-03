'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  Building2,
  Plus,
  Edit2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Organization, OrganizationStatus } from '@/types';
import { slugify } from '@/lib/utils/slug';

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createBrand, setCreateBrand] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Modal state
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Suspend action state
  const [suspendingOrgId, setSuspendingOrgId] = useState<string | null>(null);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch organizations');
      }
      setOrganizations(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading organizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/organizations')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success) {
            setOrganizations(data.data);
          } else {
            setError(data.error?.message || 'Failed to fetch organizations');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error loading organizations');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          slug: createSlug || slugify(createName),
          brand_name: createBrand || createName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create organization');
      }

      setIsCreateOpen(false);
      setCreateName('');
      setCreateSlug('');
      setCreateBrand('');
      await fetchOrganizations();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error creating organization');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/organizations/${editingOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          brand_name: editBrand,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update organization');
      }

      setEditingOrg(null);
      await fetchOrganizations();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating organization');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleSuspend = async (org: Organization) => {
    const newStatus: OrganizationStatus = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMessage =
      newStatus === 'SUSPENDED'
        ? `Are you sure you want to suspend organization '${org.name}'?`
        : `Re-activate organization '${org.name}'?`;

    if (!confirm(confirmMessage)) return;

    setSuspendingOrgId(org.id);
    try {
      const res = await fetch(`/api/organizations/${org.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update status');
      }

      await fetchOrganizations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setSuspendingOrgId(null);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    try {
      const res = await fetch('/api/auth/switch-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId }),
      });

      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to switch organization', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Organization Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Global Main Admin controls to provision, configure, and isolate tenant workspaces.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Organizations Table / List */}
      <Card>
        <CardHeader
          title={`Organizations (${organizations.length})`}
          subtitle="All registered platform tenant workspaces"
        />

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading organizations...</div>
        ) : organizations.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No organizations found.</div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">Name & Brand</th>
                  <th className="pb-3 font-semibold">Slug</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Created Date</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {organizations.map((org) => {
                  const isSuspended = org.status === 'SUSPENDED';
                  return (
                    <tr key={org.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3.5 pr-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {org.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {org.brand_name || 'No custom brand'}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {org.slug}
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge variant={isSuspended ? 'danger' : 'success'}>
                          {org.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 pr-4 text-slate-400 text-[11px]">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSwitchOrg(org.id)}
                          title="Adopt this tenant context"
                          className="h-7 text-xs"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Enter
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingOrg(org);
                            setEditName(org.name);
                            setEditBrand(org.brand_name || '');
                          }}
                          className="h-7 text-xs"
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant={isSuspended ? 'secondary' : 'danger'}
                          size="sm"
                          isLoading={suspendingOrgId === org.id}
                          onClick={() => handleToggleSuspend(org)}
                          className="h-7 text-xs"
                        >
                          {isSuspended ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Activate
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              Suspend
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Organization Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Organization"
        description="Provision an isolated multi-tenant organization container."
      >
        <form onSubmit={handleCreateOrg} className="space-y-4">
          {createError && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {createError}
            </div>
          )}

          <Input
            label="Organization Name *"
            placeholder="e.g. Nexus Telephony Corp"
            value={createName}
            onChange={(e) => {
              setCreateName(e.target.value);
              if (!createSlug) {
                setCreateSlug(slugify(e.target.value));
              }
            }}
            required
          />

          <Input
            label="URL Slug *"
            placeholder="e.g. nexus-telephony"
            value={createSlug}
            onChange={(e) => setCreateSlug(slugify(e.target.value))}
            helperText="Lowercase alphanumeric letters and hyphens only."
            required
          />

          <Input
            label="Brand Display Name"
            placeholder="e.g. Nexus AI Voice"
            value={createBrand}
            onChange={(e) => setCreateBrand(e.target.value)}
            helperText="Visible on white-labeled customer portals."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createLoading}>
              Create Organization
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Organization Modal */}
      <Modal
        isOpen={Boolean(editingOrg)}
        onClose={() => setEditingOrg(null)}
        title="Edit Organization Details"
        description={`Modify settings for ${editingOrg?.name}`}
      >
        <form onSubmit={handleEditOrg} className="space-y-4">
          {editError && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {editError}
            </div>
          )}

          <Input
            label="Organization Name *"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <Input
            label="Brand Display Name"
            value={editBrand}
            onChange={(e) => setEditBrand(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingOrg(null)}
              disabled={editLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={editLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
