'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Radio, Shield, Building, User, Lock, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 items-center justify-center text-white shadow-lg shadow-indigo-500/25 mb-3">
          <Radio className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Sign in to VoiceNuvo
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Phase 1 Multi-Tenant SaaS Control Plane
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 dark:border-slate-800 dark:bg-slate-900 sm:px-10">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" isLoading={loading} className="w-full">
              Sign In
            </Button>
          </form>

          {/* Quick Demo Sign-In Buttons */}
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                Quick Demo Accounts (Dev)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Password123!</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@voicenuvo.com')}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 text-left transition-all dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <Shield className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <div className="truncate">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">Main Admin</p>
                  <p className="text-[9px] text-slate-400 truncate">Global Oversight</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('orgadmin@acme.com')}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 text-left transition-all dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <Building className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <div className="truncate">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">Acme Admin</p>
                  <p className="text-[9px] text-slate-400 truncate">Org Admin (Tenant A)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('employee@acme.com')}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 text-left transition-all dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <div className="truncate">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">Acme Employee</p>
                  <p className="text-[9px] text-slate-400 truncate">Limited Role (Tenant A)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('admin@globex.com')}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 text-left transition-all dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <Lock className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                <div className="truncate">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">Globex Admin</p>
                  <p className="text-[9px] text-slate-400 truncate">Tenant B (Isolated)</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Don&apos;t have an account yet?{' '}
            <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Create an organization
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
