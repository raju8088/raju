import { redirect } from 'next/navigation';
import { getOrganizationContext } from '@/lib/auth/session';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { DashboardHeader } from '@/components/layout/dashboard-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getOrganizationContext();

  if (!context) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <DashboardSidebar role={context.role} />
      <div className="flex flex-col flex-1 min-w-0">
        <DashboardHeader context={context} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
