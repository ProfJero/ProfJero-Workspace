import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import * as RDialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import {
  BookOpen, Briefcase, CalendarDays, Check, CheckSquare, ChevronsUpDown, FolderKanban, Home, KeyRound, LogOut,
  Menu as MenuIcon, Monitor, Moon, NotebookPen, Plus, Search, Settings, Sun, Target, Users, Wallet, WifiOff, Repeat,
} from 'lucide-react';
import type { Permission } from '@profjero/shared';
import { useOnline } from '@/lib/api';
import { useAuth } from './auth';
import { TenantProvider, rememberTenant, useMemberships, useTenant, useTenants } from './tenant';
import { CreateWorkspaceDialog } from '@/features/workspace/Workspaces';
import { Menu } from '@/ui/overlays';
import { Spinner } from '@/ui/primitives';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission: Permission;
  primary?: boolean;
}

export const NAV: NavItem[] = [
  { to: '', label: 'Today', icon: Home, permission: 'workspace.read', primary: true },
  { to: 'tasks', label: 'Tasks', icon: CheckSquare, permission: 'workspace.read', primary: true },
  { to: 'projects', label: 'Projects', icon: FolderKanban, permission: 'workspace.read' },
  { to: 'goals', label: 'Goals', icon: Target, permission: 'workspace.read' },
  { to: 'calendar', label: 'Calendar', icon: CalendarDays, permission: 'workspace.read', primary: true },
  { to: 'notes', label: 'Notes', icon: NotebookPen, permission: 'workspace.read' },
  { to: 'clients', label: 'Clients', icon: Briefcase, permission: 'clients.read' },
  { to: 'finance', label: 'Finance', icon: Wallet, permission: 'finance.read', primary: true },
  { to: 'learning', label: 'Learning', icon: BookOpen, permission: 'workspace.read' },
  { to: 'habits', label: 'Habits', icon: Repeat, permission: 'workspace.read' },
  { to: 'settings', label: 'Settings', icon: Settings, permission: 'workspace.read' },
];

/** Resolves :tenantId against the user's memberships. Unknown or revoked → no access. */
export function TenantGate() {
  const { tenantId = '' } = useParams();
  const memberships = useMemberships();
  const ids = useMemo(() => (memberships.data ?? []).map((m) => m.tenantId), [memberships.data]);
  const tenants = useTenants(ids);
  const membership = memberships.data?.find((m) => m.tenantId === tenantId);
  const tenant = tenants.get(tenantId);

  useEffect(() => {
    if (membership) rememberTenant(tenantId);
  }, [membership, tenantId]);

  if (memberships.loading || (membership && !tenant)) return <Spinner label="Opening workspace" />;
  if (!membership || !tenant) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-lg font-semibold">You don't have access to this workspace</h1>
        <p className="mt-2 text-sm text-ink-2">It may not exist, or your membership may have been removed.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Go to your workspaces</Link>
      </main>
    );
  }
  return (
    <TenantProvider tenant={tenant} membership={membership}>
      <Shell workspaces={[...tenants.values()]} />
    </TenantProvider>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('pj.theme') as 'light' | 'dark' | null) ?? 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('pj.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { tenantId, can } = useTenant();
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV.filter((n) => can(n.permission)).map((n) => (
        <NavLink
          key={n.to}
          to={`/w/${tenantId}/${n.to}`}
          end={n.to === ''}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <n.icon className="size-4.5" aria-hidden />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function WorkspaceSwitcher({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const { tenant, role } = useTenant();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Menu
        label="Switch workspace"
        trigger={
          <button className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left hover:bg-surface-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold text-brand-ink">
              {tenant.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{tenant.name}</span>
              <span className="block text-xs capitalize text-muted">{role}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted" aria-hidden />
          </button>
        }
        items={[
          ...workspaces.map((w) => ({
            label: w.name,
            icon: w.id === tenant.id ? <Check className="size-4" /> : <span className="size-4" />,
            onSelect: () => navigate(`/w/${w.id}`),
          })),
          { label: 'New workspace', icon: <Plus className="size-4" />, onSelect: () => setCreating(true) },
        ]}
      />
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <div className="flex items-center gap-1">
      <button
        className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"
        aria-label={`Theme: ${theme}. Change theme`}
        title={`Theme: ${theme}`}
        onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
      >
        <ThemeIcon className="size-4.5" />
      </button>
      <Menu
        label="Account"
        trigger={
          <button className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink" aria-label="Account menu">
            {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
          </button>
        }
        items={[
          { label: 'Password vault', icon: <KeyRound className="size-4" />, onSelect: () => navigate('/vault') },
          { label: 'Sign out', icon: <LogOut className="size-4" />, onSelect: () => void signOut() },
        ]}
      />
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tenantId, can } = useTenant();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const commands = useMemo(
    () => [
      ...NAV.filter((n) => can(n.permission)).map((n) => ({ label: `Go to ${n.label}`, to: `/w/${tenantId}/${n.to}` })),
      ...(can('workspace.write')
        ? [
            { label: 'New task', to: `/w/${tenantId}/tasks?new=1` },
            { label: 'New note', to: `/w/${tenantId}/notes?new=1` },
            { label: 'New event', to: `/w/${tenantId}/calendar?new=1` },
          ]
        : []),
      ...(can('finance.write') ? [{ label: 'Record a transaction', to: `/w/${tenantId}/finance/transactions?new=1` }] : []),
    ],
    [tenantId, can],
  );
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const [active, setActive] = useState(0);
  const go = (to: string) => {
    onOpenChange(false);
    setQ('');
    navigate(to);
  };
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RDialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Search pages and actions</RDialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
                if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                if (e.key === 'Enter' && filtered[active]) go(filtered[active].to);
              }}
              placeholder="Search pages and actions…"
              aria-label="Search pages and actions"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-80 overflow-y-auto p-1">
            {filtered.map((c, i) => (
              <li key={c.label} role="option" aria-selected={i === active}>
                <button onMouseEnter={() => setActive(i)} onClick={() => go(c.to)} className={clsx('w-full rounded-lg px-3 py-2 text-left text-sm', i === active && 'bg-surface-2')}>
                  {c.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>}
          </ul>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Shell({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const { tenantId, can } = useTenant();
  const online = useOnline();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setMobileNav(false), [location.pathname]);

  const primary = NAV.filter((n) => n.primary && can(n.permission));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link to={`/w/${tenantId}`} className="flex items-center gap-2 px-2">
          <img src="/logo.png" alt="" className="size-7" />
          <span className="text-sm font-semibold">ProfJero Workspace</span>
        </Link>
        <WorkspaceSwitcher workspaces={workspaces} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
          <button className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2 lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
            <MenuIcon className="size-5" />
          </button>
          <button
            onClick={() => setPalette(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted hover:text-ink sm:max-w-sm"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Search or jump to…</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-xs sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {!online && (
              <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-xs font-medium text-warning-ink" role="status">
                <WifiOff className="size-3.5" aria-hidden /> Offline
              </span>
            )}
            <UserMenu />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, 1fr)` }}>
        {primary.map((n) => (
          <NavLink key={n.to} to={`/w/${tenantId}/${n.to}`} end={n.to === ''} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
            <n.icon className="size-5" aria-hidden />
            {n.label}
          </NavLink>
        ))}
        <button onClick={() => setMobileNav(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
          <Users className="size-5" aria-hidden />
          More
        </button>
      </nav>

      <RDialog.Root open={mobileNav} onOpenChange={setMobileNav}>
        <RDialog.Portal>
          <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <RDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface px-3 py-4 shadow-xl lg:hidden">
            <RDialog.Title className="px-2 text-sm font-semibold">ProfJero Workspace</RDialog.Title>
            <RDialog.Description className="sr-only">Navigation</RDialog.Description>
            <WorkspaceSwitcher workspaces={workspaces} />
            <NavLinks onNavigate={() => setMobileNav(false)} />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
