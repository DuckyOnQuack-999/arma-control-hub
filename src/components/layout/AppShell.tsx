import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuthStore } from '@/stores/authStore';
import {
  LayoutDashboard, Globe, Settings, Terminal, LogOut, Menu, X, ChevronDown, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Server Browser', url: '/browser', icon: Globe },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-background cyber-grid">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <span className="font-display text-sm font-bold tracking-wider text-primary text-glow-cyan">RETROCYCLES</span>
          </button>
          <Button size="icon" variant="ghost" className="lg:hidden h-7 w-7" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-body font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              activeClassName="bg-primary/10 text-primary border border-primary/30 shadow-[0_0_8px_hsl(var(--primary)/0.2)]"
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-body hover:bg-muted">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-xs font-bold text-primary">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-foreground truncate max-w-32">{user?.email}</div>
                  <div className="text-xs text-muted-foreground">{user?.role}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-border bg-card">
              <DropdownMenuItem onClick={handleLogout} className="text-neon-red">
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 lg:px-6">
          <Button size="icon" variant="ghost" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" className="relative h-8 w-8">
            <Bell className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6 animate-in fade-in duration-200">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
