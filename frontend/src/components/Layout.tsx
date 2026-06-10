import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bug,
  LayoutDashboard,
  Zap,
  BarChart2,
  Activity,
  Settings,
  LogOut,
  Search,
  ChevronDown
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { cn } from '../lib/utils';
import { authAPI } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  // Poll system health
  const { data: healthData, isError } = useQuery({
    queryKey: queryKeys.health(),
    queryFn: api.getHealth,
    refetchInterval: 30000,
    retry: 1,
  });

  const isHealthy = !isError && healthData?.status === 'healthy';

  const handleLogout = () => {
    authAPI.logout();
    window.location.reload();
  };

  // Nav Items - Icons only
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Predictor', path: '/prediction', icon: Zap },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Monitoring', path: '/monitoring', icon: Activity },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-[#EBF1F6] text-slate-800 antialiased font-sans">
      {/* Floating Dark Charcoal Left Sidebar */}
      <aside className="w-[88px] fixed inset-y-4 left-4 bg-slate-950 text-white rounded-[2rem] flex flex-col items-center justify-between py-8 shadow-2xl z-30 select-none border border-slate-900">
        <div className="flex flex-col items-center gap-10 w-full">
          {/* Logo Area */}
          <div className="bg-white p-2 rounded-2xl border border-white/10 text-white flex items-center justify-center w-14 h-14 overflow-hidden">
            <img src="/src/assets/logo.jpg" alt="Logo" className="w-full h-full object-contain rounded-xl" />
          </div>

          {/* Navigation Link Icons */}
          <nav className="flex flex-col items-center gap-3.5 w-full px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  title={item.name}
                  className={() =>
                    cn(
                      'relative h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-150',
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-500'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    )
                  }
                >
                  <Icon size={18} className="shrink-0" />
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Logout at absolute bottom */}
        <div className="w-full px-2 flex justify-center">
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-red-400 hover:bg-red-950/20 hover:text-red-500 cursor-pointer transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 pl-[120px] pr-6 py-6 flex flex-col min-h-screen">
        {/* Top Header Row */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 select-none bg-transparent">
          {/* Welcome greeting */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950 leading-none">
              Smart Bug Priority Predictor
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">Enterprise MLOps console controls</p>
          </div>

          {/* Pill search bar */}
          <div className="relative w-full max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search predictions, metrics, settings..."
              className="w-full h-10 pl-11 pr-4 bg-white border border-transparent rounded-full text-xs font-semibold outline-none focus:border-blue-500/20 focus:ring-2 focus:ring-blue-500/10 shadow-md transition-all text-slate-800 placeholder:text-slate-400"
            />
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Badge & profile */}
          <div className="flex items-center gap-3">
            {/* Status Indicator Badges */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-transparent shadow-md select-none">
              <span className={cn('h-2 w-2 rounded-full shrink-0', isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
              <span className={cn('text-[10px] font-bold', isHealthy ? 'text-green-600' : 'text-red-600')}>
                {isHealthy ? 'API Operational' : 'Service Degraded'}
              </span>
            </div>

            {/* Profile Dropdown */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-transparent shadow-md cursor-pointer hover:bg-slate-50/80 transition-colors">
              <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center">
                A
              </div>
              <span className="text-[10px] font-bold text-slate-800">Admin</span>
              <ChevronDown size={12} className="text-slate-400" />
            </div>
          </div>
        </header>

        {/* Content container */}
        <div className="flex-1 flex flex-col justify-start">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
