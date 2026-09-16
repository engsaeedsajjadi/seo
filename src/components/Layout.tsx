import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Globe, Search, BarChart3, Target, Link2, FileText,
  Bot, Brain, Radio, Bell, Settings, CreditCard, Users, Building2,
  Shield, Zap, ChevronDown, ChevronRight, Menu, X, LogOut, User,
  AlertTriangle, CheckCircle2, XCircle, Clock, ExternalLink
} from 'lucide-react';
import { useAppState, getProviderLabel, getStatusColor, getStatusLabel } from '../lib/store';
import { t } from '../i18n';
import { toPersianDigits, formatPersianNumber } from '../lib/persian';

const navSections = [
  {
    title: 'نمای کلی',
    titleKey: 'common.overview',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'داشبورد', labelKey: 'common.dashboard' },
      { path: '/projects', icon: Globe, label: 'پروژه‌ها', labelKey: 'common.projects' },
    ],
  },
  {
    title: 'موتور سئو',
    titleKey: 'common.seoAudit',
    items: [
      { path: '/audit', icon: Shield, label: 'ممیزی سایت', labelKey: 'common.siteAudit' },
      { path: '/keywords', icon: Search, label: 'کلمات کلیدی', labelKey: 'common.keywords' },
      { path: '/rankings', icon: BarChart3, label: 'رتبه‌بندی', labelKey: 'common.rankings' },
      { path: '/competitors', icon: Target, label: 'رقبا', labelKey: 'common.competitors' },
      { path: '/backlinks', icon: Link2, label: 'بک‌لینک‌ها', labelKey: 'common.backlinks' },
    ],
  },
  {
    title: 'هوش مصنوعی و محتوا',
    titleKey: 'common.aiVisibility',
    items: [
      { path: '/content', icon: FileText, label: 'محتوا', labelKey: 'common.content' },
      { path: '/geo', icon: Brain, label: 'GEO / دیده‌شدن در هوش مصنوعی', labelKey: 'common.geo' },
      { path: '/aeo', icon: Radio, label: 'AEO', labelKey: 'common.aeo' },
    ],
  },
  {
    title: 'عملیات',
    titleKey: 'common.reports',
    items: [
      { path: '/reports', icon: FileText, label: 'گزارش‌ها', labelKey: 'common.reports' },
      { path: '/automation', icon: Zap, label: 'اتوماسیون', labelKey: 'common.alerts' },
      { path: '/alerts', icon: Bell, label: 'هشدارها', labelKey: 'common.alerts' },
      { path: '/integrations', icon: ExternalLink, label: 'یکپارچه‌سازی‌ها', labelKey: 'common.integrations' },
    ],
  },
  {
    title: 'کسب‌وکار',
    titleKey: 'common.billing',
    items: [
      { path: '/billing', icon: CreditCard, label: 'صورتحساب', labelKey: 'common.billing' },
      { path: '/team', icon: Users, label: 'تیم', labelKey: 'common.team' },
      { path: '/agency', icon: Building2, label: 'آژانس', labelKey: 'common.team' },
      { path: '/api', icon: Shield, label: 'API و MCP', labelKey: 'common.apiKeys' },
      { path: '/settings', icon: Settings, label: 'تنظیمات', labelKey: 'common.settings' },
    ],
  },
];

import { Outlet } from 'react-router-dom';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(navSections.map(s => [s.title, true]))
  );
  const [showProviderPanel, setShowProviderPanel] = useState(false);
  const location = useLocation();
  const { state } = useAppState();

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen overflow-hidden bg-surface" dir="rtl">
      {/* Sidebar - RTL: on the right side */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} flex-shrink-0 bg-surface-2 border-l border-surface-3/50 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-surface-3/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-bold text-lg tracking-tight font-vazirmatn-bold">رنک‌فورج</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2" aria-label="منوی اصلی">
          {navSections.map(section => (
            <div key={section.title} className="mb-2">
              {sidebarOpen && (
                <button
                  onClick={() => toggleSection(section.title)}
                  aria-label={`${section.title} - ${expandedSections[section.title] ? 'بستن' : 'باز کردن'}`}
                  aria-expanded={expandedSections[section.title]}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-300 font-vazirmatn-medium"
                >
                  <span>{section.title}</span>
                  {expandedSections[section.title] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3 rotate-180" />}
                </button>
              )}
              {(expandedSections[section.title] || !sidebarOpen) && (
                <div className="space-y-0.5">
                  {section.items.map(item => (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-label={item.label}
                      aria-current={isActive(item.path) ? 'page' : undefined}
                      className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors font-vazirmatn-regular ${
                        isActive(item.path)
                          ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                          : 'text-slate-300 hover:bg-surface-3/50 hover:text-white'
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-surface-3/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? t('common.closeMenu') : t('common.openMenu')}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-3/50 text-sm font-vazirmatn-regular"
          >
            <Menu className="w-4 h-4" />
            {sidebarOpen && <span>{sidebarOpen ? 'جمع کردن' : 'باز کردن'}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - RTL */}
        <header className="h-14 bg-surface-2/80 backdrop-blur-sm border-b border-surface-3/50 flex items-center justify-between px-6" dir="rtl">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-medium text-slate-300 font-vazirmatn-medium">
              {state.currentProject ? state.currentProject.domain : t('common.noData')}
            </h1>
            {state.currentProject && (
              <span className="px-2 py-0.5 rounded text-xs bg-surface-3/50 text-slate-400 font-vazirmatn-light ltr-content">
                {state.currentProject.country} / {state.currentProject.language}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Provider Status */}
            <button
              onClick={() => setShowProviderPanel(!showProviderPanel)}
              aria-label={t('common.integrations')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3/30 hover:bg-surface-3/50 text-sm"
            >
              <div className="flex gap-1">
                {Object.entries(state.providerStatus).slice(0, 4).map(([key, status]) => (
                  <div
                    key={key}
                    className={`w-2 h-2 rounded-full ${
                      status === 'connected' ? 'bg-accent-green' :
                      status === 'error' ? 'bg-accent-red' :
                      'bg-accent-yellow'
                    }`}
                  />
                ))}
              </div>
              <span className="text-slate-400 text-xs font-vazirmatn-regular">سرویس‌ها</span>
            </button>

            {/* Alerts */}
            <Link to="/alerts" aria-label={t('common.notifications')} className="relative p-2 rounded-lg hover:bg-surface-3/50">
              <Bell className="w-4 h-4 text-slate-400" />
              {state.alerts.filter(a => !a.read).length > 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full bg-accent-red text-[10px] flex items-center justify-center text-white font-bold persian-numbers">
                  {toPersianDigits(state.alerts.filter(a => !a.read).length)}
                </span>
              )}
            </Link>

            {/* User */}
            <div className="flex items-center gap-2 pr-3 border-r border-surface-3/50">
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-medium text-slate-200 font-vazirmatn-medium">مدیر سیستم</p>
                <p className="text-[10px] text-slate-500 font-vazirmatn-light">مالک</p>
              </div>
            </div>
          </div>
        </header>

        {/* Provider Panel - RTL positioned */}
        {showProviderPanel && (
          <div className="absolute left-6 top-14 z-50 w-80 bg-surface-2 border border-surface-3/50 rounded-xl shadow-2xl p-4" dir="rtl">
            <h3 className="text-sm font-semibold text-white mb-3 font-vazirmatn-bold">وضعیت سرویس‌ها</h3>
            <div className="space-y-2">
              {Object.entries(state.providerStatus).map(([key, status]) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-300 font-vazirmatn-regular">{getProviderLabel(key)}</span>
                  <div className="flex items-center gap-2">
                    {status === 'connected' && <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />}
                    {status === 'not_configured' && <Clock className="w-3.5 h-3.5 text-accent-yellow" />}
                    {status === 'error' && <XCircle className="w-3.5 h-3.5 text-accent-red" />}
                    <span className={`text-xs font-vazirmatn-light ${getStatusColor(status)}`}>{getStatusLabel(status)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/integrations"
              className="mt-3 block text-center text-xs text-brand-400 hover:text-brand-300 py-2 rounded-lg bg-brand-600/10 hover:bg-brand-600/20 font-vazirmatn-regular"
            >
              پیکربندی یکپارچه‌سازی‌ها ←
            </Link>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-6" dir="rtl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
