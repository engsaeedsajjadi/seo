import { useState, useEffect } from 'react';
import { VerifyEmailBanner } from './EmailVerification';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Globe, Search, BarChart3, Target, Link2, FileText,
  Bot, Brain, Radio, Bell, Settings, CreditCard, Users, Building2,
  Shield, Zap, Wand2, ChevronDown, ChevronRight, Menu, X, LogOut, User,
  AlertTriangle, CheckCircle2, XCircle, Clock, ExternalLink, HelpCircle
} from 'lucide-react';
import { COUNTRY_LABELS, LANGUAGE_LABELS } from '../lib/labels';
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
    title: 'سئوی سایت',
    titleKey: 'common.seoAudit',
    items: [
      { path: '/audit', icon: Shield, label: 'بررسی فنی سایت', labelKey: 'common.siteAudit' },
      { path: '/fixes', icon: Wand2, label: 'اصلاح خودکار سایت', labelKey: 'common.siteAudit' },
      { path: '/keywords', icon: Search, label: 'کلمات کلیدی', labelKey: 'common.keywords' },
      { path: '/rankings', icon: BarChart3, label: 'رتبه در گوگل', labelKey: 'common.rankings' },
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
      { path: '/aeo', icon: Radio, label: 'AEO / پاسخ مستقیم گوگل', labelKey: 'common.aeo' },
    ],
  },
  {
    title: 'گزارش و پیگیری',
    titleKey: 'common.reports',
    items: [
      { path: '/reports', icon: FileText, label: 'گزارش‌ها', labelKey: 'common.reports' },
      { path: '/automation', icon: Zap, label: 'زمان‌بندی خودکار', labelKey: 'common.alerts' },
      { path: '/alerts', icon: Bell, label: 'هشدارها', labelKey: 'common.alerts' },
      { path: '/integrations', icon: ExternalLink, label: 'اتصال سرویس‌ها', labelKey: 'common.integrations' },
    ],
  },
  {
    title: 'حساب و تیم',
    titleKey: 'common.billing',
    items: [
      { path: '/billing', icon: CreditCard, label: 'صورتحساب', labelKey: 'common.billing' },
      { path: '/team', icon: Users, label: 'تیم', labelKey: 'common.team' },
      { path: '/agency', icon: Building2, label: 'برند و مشتریان', labelKey: 'common.team' },
      { path: '/api', icon: Shield, label: 'کلیدهای API', labelKey: 'common.apiKeys' },
      { path: '/settings', icon: Settings, label: 'تنظیمات', labelKey: 'common.settings' },
    ],
  },
];

import { Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { useAppConfig } from '../lib/app-config';
import { NAV_HELP, useMenuHelp } from '../lib/nav-help';

const ROLE_LABELS: Record<string, string> = {
  Owner: 'مالک', Admin: 'مدیر سازمان', Manager: 'مدیر پروژه', SEO_Manager: 'مدیر سئو', Analyst: 'تحلیلگر', Editor: 'ویراستار', Client: 'مشتری', Viewer: 'مشاهده‌گر',
};

// Sidebar items that live under a project (/projects/:id/...) — linking to the
// bare path used to bounce back to the dashboard via the catch-all route.
const PROJECT_SCOPED_PATHS = new Set([
  '/audit', '/fixes', '/keywords', '/rankings', '/competitors', '/backlinks',
  '/content', '/geo', '/aeo', '/reports', '/automation', '/alerts',
]);

export default function Layout() {
  // On a phone the expanded sidebar takes most of the screen, so it starts collapsed there.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(navSections.map(s => [s.title, true]))
  );
  const [showProviderPanel, setShowProviderPanel] = useState(false);
  const location = useLocation();
  const { state } = useAppState();
  const appConfig = useAppConfig();
  const [helpOn, toggleHelp] = useMenuHelp();
  // The tooltip sits beside the hovered or focused item, outside the scrolling menu.
  const [tip, setTip] = useState<{ path: string; label: string; top: number; right: number } | null>(null);
  const showTip = (path: string, label: string, el: HTMLElement) => {
    if (!helpOn || !NAV_HELP[path]) return;
    const box = el.getBoundingClientRect();
    setTip({ path, label, top: Math.min(box.top, window.innerHeight - 140), right: window.innerWidth - box.left + 8 });
  };
  useEffect(() => { if (!helpOn) setTip(null); }, [helpOn]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  /** Resolve a sidebar path: project-scoped pages get the current project ID;
   *  without a selected project they lead to the project picker. */
  const resolvePath = (path: string): string => {
    if (!PROJECT_SCOPED_PATHS.has(path)) return path;
    const projectId = state.currentProject?.id;
    return projectId ? `/projects/${projectId}${path}` : '/projects';
  };

  const isActive = (path: string, itemPath: string = path) =>
    location.pathname === path && (itemPath === path || !PROJECT_SCOPED_PATHS.has(itemPath) || path !== '/projects');

  const [identity,setIdentity] = useState<{name:string;role:string;emailVerified?:boolean;platformAdmin?:boolean}>({name:'',role:''});
  const [organizations,setOrganizations] = useState<Array<{id:string;name:string}>>([]);
  const [switching,setSwitching] = useState(false);
  const [switchError,setSwitchError] = useState('');
  useEffect(() => {
    let active=true;
    api.getCurrentUser().then(result=>{
      if (active && result.success) {setIdentity(result.data.user);setOrganizations(result.data.organizations);}
    });
    return ()=>{active=false;};
  },[]);
  async function switchOrg(id:string) {
    setSwitching(true); setSwitchError('');
    const result=await api.switchOrganization(id);
    if (result.success) window.location.reload();
    else {setSwitchError('تغییر سازمان انجام نشد.');setSwitching(false);}
  }

  const handleLogout = async () => {
    await api.logout();
    window.location.reload();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface" dir="rtl">
      {/* Sidebar - RTL: on the right side */}
      {sidebarOpen && <button type="button" aria-label={t('common.closeMenu')} onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" />}
      <aside className={`fixed inset-y-0 right-0 z-40 w-72 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0 lg:w-64' : 'translate-x-full lg:translate-x-0 lg:w-16'} flex-shrink-0 bg-surface-2 border-l border-surface-3/50 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-surface-3/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-bold text-lg tracking-tight font-vazirmatn-bold">سئویار</span>
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
                  {section.items.filter(item=>(state.currentOrg?.role!=='client' || !['/billing','/team','/agency','/api','/integrations','/automation'].includes(item.path)) && (item.path!=='/billing' || appConfig?.billing)).map(item => {
                    const to = resolvePath(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={to}
                        aria-label={item.label}
                        aria-describedby={helpOn && tip?.path === item.path ? 'menu-help-tip' : undefined}
                        onMouseEnter={(e) => showTip(item.path, item.label, e.currentTarget)}
                        onMouseLeave={() => setTip(null)}
                        onFocus={(e) => showTip(item.path, item.label, e.currentTarget)}
                        onBlur={() => setTip(null)}
                        onClick={() => { setTip(null); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                        aria-current={isActive(to, item.path) ? 'page' : undefined}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors font-vazirmatn-regular ${
                          isActive(to, item.path)
                            ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                            : 'text-slate-300 hover:bg-surface-3/50 hover:text-white'
                        }`}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {sidebarOpen && <span className="min-w-0">
                          {item.label}
                          {/* Touch screens have no hover, so the help text sits under the name there. */}
                          {helpOn && NAV_HELP[item.path] && <span className="hidden [@media(hover:none)]:block text-[11px] leading-5 text-slate-400 mt-0.5">{NAV_HELP[item.path]}</span>}
                        </span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-surface-3/50 space-y-1">
          <button
            type="button"
            role="switch"
            aria-checked={helpOn}
            onClick={toggleHelp}
            aria-label="راهنمای منو"
            title={helpOn ? 'خاموش کردن راهنمای منو' : 'روشن کردن راهنمای منو'}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-3/50 text-sm font-vazirmatn-regular"
          >
            <HelpCircle className={`w-4 h-4 ${helpOn ? 'text-brand-400' : ''}`} />
            {sidebarOpen && <>
              <span className="flex-1 text-right">راهنمای منو</span>
              <span aria-hidden="true" className={`relative inline-block w-8 h-4 rounded-full transition-colors ${helpOn ? 'bg-brand-600' : 'bg-surface-3'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${helpOn ? 'right-0.5' : 'right-[18px]'}`} />
              </span>
            </>}
          </button>
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

      {helpOn && tip && (
        <div id="menu-help-tip" role="tooltip" style={{ top: tip.top, right: tip.right }}
          className="fixed z-50 w-64 pointer-events-none bg-surface-2 border border-brand-600/40 rounded-lg shadow-2xl p-3 [@media(hover:none)]:hidden">
          <p className="text-xs font-semibold text-white mb-1">{tip.label}</p>
          <p className="text-xs leading-5 text-slate-300">{NAV_HELP[tip.path]}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - RTL */}
        <header className="h-14 bg-surface-2/80 backdrop-blur-sm border-b border-surface-3/50 flex items-center justify-between gap-2 px-3 lg:px-6" dir="rtl">
          <div className="flex items-center gap-2 lg:gap-4 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label={t('common.openMenu')} className="lg:hidden p-2 -ms-1 rounded-lg text-slate-300 hover:bg-surface-3/50 flex-shrink-0">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-medium text-slate-300 font-vazirmatn-medium truncate">
              {state.currentProject ? state.currentProject.domain : 'پروژه‌ای انتخاب نشده'}
            </h1>
            {state.currentProject && (
              <span className="hidden md:inline px-2 py-0.5 rounded text-xs bg-surface-3/50 text-slate-400 font-vazirmatn-light whitespace-nowrap">
                {COUNTRY_LABELS[state.currentProject.country] || state.currentProject.country} · {LANGUAGE_LABELS[state.currentProject.language] || state.currentProject.language}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Provider Status */}
            <button
              onClick={() => setShowProviderPanel(!showProviderPanel)}
              aria-label={t('common.integrations')}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3/30 hover:bg-surface-3/50 text-sm"
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
            <Link to={resolvePath('/alerts')} aria-label={t('common.notifications')} className="relative p-2 rounded-lg hover:bg-surface-3/50">
              <Bell className="w-4 h-4 text-slate-400" />
              {state.alerts.filter(a => !a.read).length > 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full bg-accent-red text-[10px] flex items-center justify-center text-white font-bold persian-numbers">
                  {toPersianDigits(state.alerts.filter(a => !a.read).length)}
                </span>
              )}
            </Link>

            {organizations.length > 1 && <label className="text-slate-300 text-xs">سازمان
              <select aria-label="سازمان فعال" disabled={switching} value={state.currentOrg?.id || ''} onChange={e=>switchOrg(e.target.value)} className="bg-surface-2 p-2 rounded">
                {organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              {switchError && <span role="alert">{switchError}</span>}
            </label>}
            {/* User */}
            <div className="flex items-center gap-2 pr-3 border-r border-surface-3/50">
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-medium text-slate-200 font-vazirmatn-medium">{identity.name}</p>
                <p className="text-[10px] text-slate-500 font-vazirmatn-light">{ROLE_LABELS[identity.role] ?? identity.role}</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label={t('auth.logout')}
                title={t('auth.logout')}
                className="p-2 rounded-lg hover:bg-surface-3/50"
              >
                <LogOut className="w-4 h-4 text-slate-400" />
              </button>
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
              صفحهٔ اتصال سرویس‌ها ←
            </Link>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6" dir="rtl">
          {state.currentOrg?.role==='client' && <p role="status" className="mb-4 text-sm text-slate-400">دسترسی مشتری فقط برای مشاهدهٔ پروژه‌های تخصیص‌یافته است.</p>}
          <VerifyEmailBanner visible={identity.emailVerified === false} />
          {identity.platformAdmin && location.pathname !== '/platform' && (
            <Link to="/platform" className="block mb-4 text-xs text-brand-400 hover:underline">مدیریت پلتفرم</Link>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
