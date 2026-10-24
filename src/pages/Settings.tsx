import {
  Settings, Globe, Bell, Shield, Palette, Users, Key,
  Save, AlertCircle, CheckCircle2
} from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function SettingsPage() {
  const { state } = useAppState();
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'branding', label: 'White Label', icon: Palette },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'api', label: 'API Keys', icon: Key },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your organization and project settings</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white hover:bg-surface-3/30'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Organization Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Organization Name</label>
                    <input type="text" defaultValue={state.currentOrg?.name || 'My Organization'} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Organization Slug</label>
                    <input type="text" defaultValue={state.currentOrg?.slug || 'my-org'} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">Default Timezone</label>
                    <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                      <option>UTC</option>
                      <option>America/New_York</option>
                      <option>Europe/London</option>
                      <option>Europe/Berlin</option>
                      <option>Asia/Tokyo</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Project Defaults</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300 mb-1.5 block">Default Country</label>
                      <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                        <option>United States</option>
                        <option>United Kingdom</option>
                        <option>Germany</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300 mb-1.5 block">Default Language</label>
                      <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                        <option>English</option>
                        <option>German</option>
                        <option>French</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300 mb-1.5 block">Max Crawl Depth</label>
                      <input type="number" defaultValue={5} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300 mb-1.5 block">Max Pages per Crawl</label>
                      <input type="number" defaultValue={500} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
                    </div>
                  </div>
                </div>
              </div>

              <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <Save className="w-4 h-4" /> Save Settings
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Authentication</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-sm text-white">Two-Factor Authentication</p>
                      <p className="text-xs text-slate-400">Add an extra layer of security to your account</p>
                    </div>
                    <button className="px-3 py-1.5 bg-surface-3/50 text-slate-300 text-xs rounded-lg">Enable</button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-sm text-white">Session Management</p>
                      <p className="text-xs text-slate-400">View and revoke active sessions</p>
                    </div>
                    <button className="px-3 py-1.5 bg-surface-3/50 text-slate-300 text-xs rounded-lg">Manage</button>
                  </div>
                </div>
              </div>
              <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Data & Privacy</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-sm text-white">Export Personal Data</p>
                      <p className="text-xs text-slate-400">GDPR: Download all your personal data</p>
                    </div>
                    <button className="px-3 py-1.5 bg-surface-3/50 text-slate-300 text-xs rounded-lg">Export</button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div>
                      <p className="text-sm text-white">Delete Account</p>
                      <p className="text-xs text-slate-400">Permanently delete your account and all data</p>
                    </div>
                    <button className="px-3 py-1.5 bg-accent-red/20 text-accent-red text-xs rounded-lg">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">White Label Configuration</h3>
              <p className="text-xs text-slate-400 mb-4">Available on Agency and Enterprise plans. Customize the branding shown to clients.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Company Name</label>
                  <input type="text" placeholder="Your Agency Name" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Logo URL</label>
                  <input type="url" placeholder="https://your-agency.com/logo.png" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" defaultValue="#3b82f6" className="w-10 h-10 rounded cursor-pointer" />
                    <input type="text" defaultValue="#3b82f6" className="px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white w-32" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Custom Domain</label>
                  <input type="text" placeholder="seo.your-agency.com" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
                </div>
                <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Branding
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Notification Preferences</h3>
              <div className="space-y-3">
                {[
                  { label: 'Critical SEO issues detected', enabled: true },
                  { label: 'Keyword position changes (>5 positions)', enabled: true },
                  { label: 'Weekly summary report', enabled: true },
                  { label: 'Crawl completed', enabled: false },
                  { label: 'Backlink changes', enabled: false },
                  { label: 'Credit balance low', enabled: true },
                ].map((pref, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <span className="text-sm text-slate-300">{pref.label}</span>
                    <div className={`w-10 h-5 rounded-full cursor-pointer transition-colors ${pref.enabled ? 'bg-brand-600' : 'bg-surface-3'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${pref.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Team Members</h3>
              <div className="space-y-3">
                {[
                  { name: 'Admin User', email: 'admin@company.com', role: 'Owner' },
                  { name: 'SEO Manager', email: 'seo@company.com', role: 'SEO Manager' },
                  { name: 'Analyst', email: 'analyst@company.com', role: 'Analyst' },
                ].map((member, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-600/30 flex items-center justify-center text-xs font-bold text-brand-400">
                        {member.name[0]}
                      </div>
                      <div>
                        <p className="text-sm text-white">{member.name}</p>
                        <p className="text-xs text-slate-400">{member.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-brand-500/20 text-brand-400">{member.role}</span>
                  </div>
                ))}
              </div>
              <button className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
                Invite Member
              </button>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">API Keys</h3>
              <p className="text-xs text-slate-400 mb-4">API keys allow programmatic access to your data. Keep them secure.</p>
              <div className="space-y-3">
                {[
                  { name: 'Production Key', key: 'rf_live_...a8f2', created: '2024-01-15', lastUsed: '2 hours ago' },
                  { name: 'Development Key', key: 'rf_test_...b3c1', created: '2024-03-20', lastUsed: '1 day ago' },
                ].map((apiKey, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-sm text-white font-mono">{apiKey.name}</p>
                      <p className="text-xs text-slate-400">Created: {apiKey.created} · Last used: {apiKey.lastUsed}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-slate-400 font-mono">{apiKey.key}</code>
                      <button className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red text-xs">Revoke</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
                Create API Key
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
