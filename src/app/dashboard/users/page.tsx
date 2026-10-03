'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { OrganizationMember, RoleType } from '@/types';

export default function UsersPage() {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite Modal
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>('EMPLOYEE');
  const [invitePassword, setInvitePassword] = useState('Password123!');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit Role Modal
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const [newRole, setNewRole] = useState<RoleType>('EMPLOYEE');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch users');
      }
      setMembers(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success) {
            setMembers(data.data);
          } else {
            setError(data.error?.message || 'Failed to fetch users');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error loading users');
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

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
          password: invitePassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to invite user');
      }

      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('EMPLOYEE');
      await fetchUsers();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Error inviting user');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    setUpdateLoading(true);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/users/${selectedMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update role');
      }

      setSelectedMember(null);
      await fetchUsers();
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : 'Error updating role');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    const confirmMsg = `Remove ${member.user?.name || 'this member'} from the organization?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/users/${member.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to remove user');
      }
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove user');
    }
  };

  const roleBadgeVariant: Record<RoleType, 'info' | 'warning' | 'success'> = {
    MAIN_ADMIN: 'info',
    ORG_ADMIN: 'warning',
    EMPLOYEE: 'success',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Team & User Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage organization members, assign roles, and administer workspace access.
          </p>
        </div>

        <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader
          title={`Organization Members (${members.length})`}
          subtitle="Users with access to this tenant workspace"
        />

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No members found in this organization.</div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Role</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Joined Date</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3.5 pr-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {member.user?.name || 'Unknown User'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {member.user?.email}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <Badge variant={roleBadgeVariant[member.role]}>
                        {member.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {member.status}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-400 text-[11px]">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMember(member);
                          setNewRole(member.role);
                        }}
                        className="h-7 text-xs"
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        Change Role
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member)}
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite New Member"
        description="Add a team member to this organization."
      >
        <form onSubmit={handleInviteUser} className="space-y-4">
          {inviteError && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {inviteError}
            </div>
          )}

          <Input
            label="Full Name *"
            placeholder="e.g. John Doe"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            required
          />

          <Input
            label="Email Address *"
            type="email"
            placeholder="e.g. john@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Role *
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as RoleType)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="EMPLOYEE">Employee (Standard Operator)</option>
              <option value="ORG_ADMIN">Organization Admin (Full Org Control)</option>
            </select>
          </div>

          <Input
            label="Initial Password"
            type="password"
            value={invitePassword}
            onChange={(e) => setInvitePassword(e.target.value)}
            helperText="Default for development: Password123!"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsInviteOpen(false)}
              disabled={inviteLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={inviteLoading}>
              Invite Member
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        title="Change Member Role"
        description={`Update role permissions for ${selectedMember?.user?.name}`}
      >
        <form onSubmit={handleUpdateRole} className="space-y-4">
          {updateError && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {updateError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Assigned Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as RoleType)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="ORG_ADMIN">Organization Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedMember(null)}
              disabled={updateLoading}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={updateLoading}>
              Update Role
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
