import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Sun, Moon, Bell, CircleHelp as HelpCircle, LogOut, User, ChevronDown, TriangleAlert as AlertTriangle, Server, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useServerStore } from '../../stores/serverStore';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
  isMobile: boolean;
}

export function Header({ onMenuClick, sidebarOpen, isMobile }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout, theme } = useAuthStore();
  const { servers } = useServerStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showServerSwitcher, setShowServerSwitcher] = useState(false);
  const [crashedServers, setCrashedServers] = useState<typeof servers>([]);

  useEffect(() => {
    const crashed = servers.filter(s => s.status === 'crashed');
    setCrashedServers(crashed);
  }, [servers]);

  const onlineCount = servers.filter(s => s.status === 'online').length;

  return (
    <header className="fixed top-0 right-0 left-0 z-40 h-16 bg-gray-900/80 backdrop-blur-sm border-b border-gray-700">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left side - Menu toggle and desktop collapse */}
        <div className="flex items-center gap-3">
          {isMobile ? (
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          ) : (
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
          )}

          {/* Server Quick Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowServerSwitcher(!showServerSwitcher)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors"
            >
              <Server className="w-4 h-4" />
              <span className="hidden sm:inline">
                {onlineCount}/{servers.length} Online
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {showServerSwitcher && (
              <div className="absolute left-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg py-1 z-50 max-h-80 overflow-y-auto">
                <div className="px-3 py-2 border-b border-gray-700">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Servers</p>
                </div>
                {servers.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No servers configured
                  </div>
                ) : (
                  servers.map(server => (
                    <button
                      key={server.id}
                      onClick={() => {
                        navigate(`/servers/${server.id}`);
                        setShowServerSwitcher(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-800 flex items-center gap-2 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        server.status === 'online' ? 'bg-green-500' :
                        server.status === 'crashed' ? 'bg-red-500' :
                        server.status === 'starting' ? 'bg-yellow-500' :
                        'bg-gray-500'
                      }`} />
                      <span className="text-sm text-white truncate flex-1">{server.name}</span>
                      <span className="text-xs text-gray-500">
                        {server.player_count || 0}/{server.max_players || 16}
                      </span>
                    </button>
                  ))
                )}
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <button
                    onClick={() => {
                      navigate('/servers/new');
                      setShowServerSwitcher(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-gray-800 transition-colors"
                  >
                    + Add Server
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side - User actions */}
        <div className="flex items-center gap-2">
          {/* Crash Alert Banner (shows when servers are crashed) */}
          {crashedServers.length > 0 && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{crashedServers.length} crashed</span>
              <button
                onClick={() => navigate(`/servers/${crashedServers[0].id}`)}
                className="underline hover:text-red-300"
              >
                View
              </button>
              <button
                onClick={() => setCrashedServers([])}
                className="p-0.5 hover:bg-red-800 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={() => useAuthStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <button className="relative p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Help */}
          <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="hidden md:block text-sm font-medium text-white">
                {user?.username || 'User'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-lg py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-700">
                  <p className="text-sm font-medium text-white">{user?.username}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                    {user?.role || 'admin'}
                  </span>
                </div>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Help & Docs
                </button>
                <hr className="my-1 border-gray-700" />
                <button
                  onClick={logout}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile crash alert */}
      {crashedServers.length > 0 && (
        <div className="md:hidden bg-red-900/30 border-b border-red-800 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400 flex-1">
            {crashedServers.length} server{crashedServers.length > 1 ? 's' : ''} crashed
          </span>
          <button
            onClick={() => navigate(`/servers/${crashedServers[0].id}`)}
            className="text-xs text-red-300 underline"
          >
            View
          </button>
        </div>
      )}
    </header>
  );
}
