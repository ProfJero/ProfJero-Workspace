import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError } from 'react-router';
import { useAuth } from './auth';
import { TenantGate } from './Shell';
import { LoginPage, ResetPasswordPage, SignupPage } from '@/features/auth/AuthPages';
import { WorkspaceHome } from '@/features/workspace/Workspaces';
import { Button, Spinner } from '@/ui/primitives';

function page(load: () => Promise<Record<string, ComponentType>>, name: string) {
  const C = lazy(async () => ({ default: (await load())[name]! }));
  return (
    <Suspense fallback={<Spinner />}>
      <C />
    </Suspense>
  );
}

function RequireAuth() {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Spinner label="Signing in" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Last-resort boundary: shows a recoverable message, never a stack trace. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    // Hook for an error-reporting service; never shown to the user.
    console.error(error);
  }
  override render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

function CrashScreen() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-2">The page hit an unexpected problem. Your saved data is safe.</p>
      <Button className="mt-4" variant="primary" onClick={() => window.location.reload()}>Reload</Button>
    </main>
  );
}

function RouteError() {
  const error = useRouteError();
  console.error(error);
  return <CrashScreen />;
}

const finance = () => import('@/features/finance');
const learning = () => import('@/features/learning');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/portal', element: page(() => import('@/features/portal/Portal'), 'PortalPage') },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <WorkspaceHome /> },
      { path: '/vault', element: page(() => import('@/features/vault/Vault'), 'VaultPage') },
      {
        path: '/w/:tenantId',
        element: <TenantGate />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: page(() => import('@/features/dashboard/Dashboard'), 'DashboardPage') },
          { path: 'tasks', element: page(() => import('@/features/tasks/Tasks'), 'TasksPage') },
          { path: 'projects', element: page(() => import('@/features/projects/Projects'), 'ProjectsPage') },
          { path: 'projects/:id', element: page(() => import('@/features/projects/Projects'), 'ProjectDetailPage') },
          { path: 'goals', element: page(() => import('@/features/goals/Goals'), 'GoalsPage') },
          { path: 'goals/:id', element: page(() => import('@/features/goals/Goals'), 'GoalDetailPage') },
          { path: 'calendar', element: page(() => import('@/features/calendar/Calendar'), 'CalendarPage') },
          { path: 'notes', element: page(() => import('@/features/notes/Notes'), 'NotesPage') },
          { path: 'clients', element: page(() => import('@/features/clients/Clients'), 'ClientsPage') },
          { path: 'clients/:id', element: page(() => import('@/features/clients/Clients'), 'ClientDetailPage') },
          {
            path: 'finance',
            element: page(finance, 'FinanceLayout'),
            children: [
              { index: true, element: page(finance, 'FinanceOverview') },
              { path: 'transactions', element: page(finance, 'TransactionsPage') },
              { path: 'accounts', element: page(finance, 'AccountsPage') },
              { path: 'budgets', element: page(finance, 'BudgetsPage') },
              { path: 'savings', element: page(finance, 'SavingsPage') },
              { path: 'debts', element: page(finance, 'DebtsPage') },
              { path: 'invoices', element: page(finance, 'InvoicesPage') },
              { path: 'reports', element: page(finance, 'ReportsPage') },
            ],
          },
          { path: 'learning', element: page(learning, 'LearningPage') },
          { path: 'learning/documents/:id', element: page(learning, 'ReaderPage') },
          { path: 'habits', element: page(() => import('@/features/habits/Habits'), 'HabitsPage') },
          { path: 'settings', element: page(() => import('@/features/settings/Settings'), 'SettingsPage') },
          { path: '*', element: <Navigate to="." replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
