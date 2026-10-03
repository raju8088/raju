import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOrganizationContext } from '@/lib/auth/session';
import { Radio, ArrowRight, ShieldCheck, Building2, Layers, CheckCircle } from 'lucide-react';

export default async function HomePage() {
  const context = await getOrganizationContext();

  if (context) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="max-w-7xl mx-auto w-full px-6 h-20 flex items-center justify-between border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Radio className="h-5 w-5" />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-white">
            VoiceNuvo
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-md shadow-indigo-600/20"
          >
            Create Organization
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto w-full px-6 py-16 text-center my-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-semibold mb-6">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Phase 1 Foundation Operational
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Production AI Voice SaaS{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
            Control Plane
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Engineered for strict multi-tenant isolation, granular role-based access control, and extensible service-layer architecture.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm text-white shadow-lg shadow-indigo-600/25 transition-all"
          >
            Enter Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 font-semibold text-sm text-slate-200 transition-colors"
          >
            Register Organization
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xs">
            <Building2 className="h-6 w-6 text-indigo-400 mb-3" />
            <h3 className="text-sm font-bold text-slate-200">Strict Multi-Tenancy</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Every query enforces organization isolation at both the database and service layers.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xs">
            <ShieldCheck className="h-6 w-6 text-emerald-400 mb-3" />
            <h3 className="text-sm font-bold text-slate-200">Centralized RBAC</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Main Admin, Org Admin, and Employee roles with granular permission checks.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xs">
            <Layers className="h-6 w-6 text-purple-400 mb-3" />
            <h3 className="text-sm font-bold text-slate-200">Service Architecture</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Clean separation of concerns designed for future OmniDimension voice provider plug-in.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full px-6 py-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div>© 2026 VoiceNuvo. Phase 1 Architecture Foundation.</div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" />
            System Healthy
          </span>
        </div>
      </footer>
    </div>
  );
}
