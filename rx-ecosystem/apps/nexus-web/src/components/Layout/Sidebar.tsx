import { useState } from 'react';
import { 
  Layout, Menu, Home, Server, Terminal, Settings, Users, 
  Trophy, ChevronLeft, ChevronRight, LogOut, Bell, HelpCircle,
  Sun, Moon, Search
} from 'lucide-react';
import { Link, useLocation, NavLink } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { logout } = useAuthStore();
  const { servers } = useServerStore();

  const navItems = [
    { path: '/servers', label: 'Servers', icon: Server, badge: servers.length },
    { path: '/terminal', label: 'Terminal', icon: Terminal },
    { path: '/players', label: 'Players', icon: Users },
    { path: '/matches', label: 'Matches', icon: Trophy },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full bg-gray-900 border-r border-gray-700 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
        {!collapsed && (
          <Link to="/servers" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Server className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">RX-NEXUS</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
              ${isActive
                ? 'bg-primary/20 text-primary border-l-2 border-primary'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-700">
        {!collapsed && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search servers..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2">
          <div className={`w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center ${collapsed ? 'mx-auto' : ''}`}>
            <Bell className="w-4 h-4 text-gray-400" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Notifications</p>
              <p className="text-xs text-gray-500 truncate">No new notifications</p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={logout}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors ${collapsed ? 'justify-center mx-auto' : 'w-full'}`}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}