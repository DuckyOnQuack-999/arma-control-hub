import { useState } from 'react';
import { Link, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Server, Terminal, Settings, Users, Trophy, ChevronLeft, ChevronRight, LogOut, Bell, Globe, FileText, Activity, Search, ChevronDown, Chrome as Home, Shield, Zap, X, Menu } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';

interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function Sidebar({ isOpen, isMobile, onToggle, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { servers } = useServerStore();
  const [showServerList, setShowServerList] = useState(false);

  const collapsed = !isOpen;

  const navItems = [
    { path: '/servers', label: 'Servers', icon: Server, badge: servers.length },
    { path: '/browser', label: 'Browser', icon: Globe },
    { path: '/matches', label: 'Matches', icon: Trophy },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const onlineCount = servers.filter(s => s.status === 'online').length;

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 h-full bg-gray-900 border-r border-gray-700 transition-all duration-300
        ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : ''}
        ${collapsed && !isMobile ? 'w-16' : 'w-64'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
        {!collapsed && (
          <Link to="/servers" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-white text-lg tracking-wide leading-none">RX-NEXUS</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Control Panel</span>
            </div>
          </Link>
        )}
        {collapsed && !isMobile && (
          <button
            onClick={onToggle}
            className="p-2 mx-auto text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Expand sidebar"
          >
            <Zap className="w-6 h-6 text-primary" />
          </button>
        )}
        {isMobile && isOpen && (
          <button
            onClick={onClose}
            className="p-2 ml-auto text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Status bar */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
            <Activity className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-300">
              <span className="text-green-400 font-medium">{onlineCount}</span>
              <span className="text-gray-500">/{servers.length} Online</span>
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group
              ${isActive
                ? 'bg-primary/15 text-primary border-l-2 border-primary'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }
              ${collapsed && !isMobile ? 'justify-center' : ''}
            `}
            title={collapsed && !isMobile ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full group-hover:bg-primary/20 group-hover:text-primary">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-700 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 text-sm"
            />
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-700 rounded">⌘K</kbd>
          </div>
        )}

        {/* User section */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/30 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Admin</p>
              <p className="text-xs text-gray-500">Full Access</p>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            logout();
            isMobile && onClose();
          }}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors
            ${collapsed && !isMobile ? 'justify-center mx-auto' : 'w-full'}
          `}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
