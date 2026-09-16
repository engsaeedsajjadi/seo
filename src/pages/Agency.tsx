import {
  Building2, Users, Plus, Globe, BarChart3, FileText,
  Settings, Eye, ExternalLink, Shield
} from 'lucide-react';
import { useAppState } from '../lib/store';

export default function Agency() {
  const { state } = useAppState();
  const isAgency = state.currentOrg?.plan === 'AGENCY' || state.currentOrg?.plan === 'ENTERPRISE';

  if (!isAgency) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Mode</h1>
          <p className="text-sm text-slate-400 mt-1">Manage clients, white-label reports, and team access</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <Building2 className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Agency Plan Required</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Agency features including client management, white-label branding, and client portal
            are available on the Agency and Enterprise plans.
          </p>
          <a href="#/billing" className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
            Upgrade to Agency
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your clients and their SEO projects</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Agency Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Active Clients</p>
          <p className="text-2xl font-bold text-white mt-1">12</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Total Projects</p>
          <p className="text-2xl font-bold text-white mt-1">28</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Reports Generated</p>
          <p className="text-2xl font-bold text-brand-400 mt-1">156</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Team Members</p>
          <p className="text-2xl font-bold text-white mt-1">8</p>
        </div>
      </div>

      {/* Client List */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50">
          <h3 className="text-sm font-semibold text-white">Clients</h3>
        </div>
        <div className="divide-y divide-surface-3/20">
          {[
            { name: 'Acme Corp', domain: 'acme.com', projects: 3, seoScore: 72, lastReport: '2 days ago', status: 'active' },
            { name: 'TechStart Inc', domain: 'techstart.io', projects: 2, seoScore: 58, lastReport: '1 week ago', status: 'active' },
            { name: 'Global Retail', domain: 'globalretail.com', projects: 5, seoScore: 81, lastReport: '3 days ago', status: 'active' },
            { name: 'Local Dentist', domain: 'smile-dental.com', projects: 1, seoScore: 45, lastReport: '2 weeks ago', status: 'active' },
            { name: 'SaaS Platform', domain: 'saastools.dev', projects: 2, seoScore: 67, lastReport: '5 days ago', status: 'paused' },
          ].map((client, i) => (
            <div key={i} className="flex items-center justify-between p-4 hover:bg-surface-3/20">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-accent-purple" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{client.name}</p>
                  <p className="text-xs text-slate-400">{client.domain} · {client.projects} project{client.projects > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-sm font-bold text-white">{client.seoScore}</p>
                  <p className="text-[10px] text-slate-400">SEO Score</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-300">{client.lastReport}</p>
                  <p className="text-[10px] text-slate-400">Last Report</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="View">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Reports">
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Settings">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Client Portal Info */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Client Portal</h3>
        <p className="text-xs text-slate-400 mb-4">
          Each client gets a restricted portal where they can view their SEO performance, rankings, reports, and recommendations.
          Clients have read-only access to their assigned projects and cannot modify settings or access other clients' data.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-surface/50 rounded-lg p-3">
            <Shield className="w-4 h-4 text-accent-green mb-2" />
            <p className="text-xs font-semibold text-white">Isolated Access</p>
            <p className="text-[10px] text-slate-400">Each client sees only their own data</p>
          </div>
          <div className="bg-surface/50 rounded-lg p-3">
            <FileText className="w-4 h-4 text-brand-400 mb-2" />
            <p className="text-xs font-semibold text-white">Branded Reports</p>
            <p className="text-[10px] text-slate-400">Reports use your white-label branding</p>
          </div>
          <div className="bg-surface/50 rounded-lg p-3">
            <ExternalLink className="w-4 h-4 text-accent-purple mb-2" />
            <p className="text-xs font-semibold text-white">Share Links</p>
            <p className="text-[10px] text-slate-400">Secure, expiring links for report sharing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
