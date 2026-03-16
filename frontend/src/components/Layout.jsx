import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Bell,
  LogOut,
  Shield,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/alerts', label: 'Alert Preferences', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-base tracking-tight">
                Monument Markets
              </span>
              <span className="hidden sm:block text-slate-500 text-xs ml-1">
                Policy Intelligence
              </span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(({ to, label, icon: Icon, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* User menu */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="max-w-36 truncate">{user?.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:block">Logout</span>
              </button>
              {/* Mobile menu toggle */}
              <button
                className="md:hidden p-1.5 text-slate-400 hover:text-white"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-1">
            {navLinks.map(({ to, label, icon: Icon, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 px-6 text-center">
        <p className="text-slate-600 text-xs">
          Monument Markets © {new Date().getFullYear()} · Policy Intelligence for Institutional Investors
        </p>
      </footer>
    </div>
  );
}
