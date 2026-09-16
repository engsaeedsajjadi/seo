import {
  Users, Plus, Shield, Mail, MoreVertical,
  CheckCircle2, Clock, UserPlus
} from 'lucide-react';
import { useAppState } from '../lib/store';
import type { Role } from '../lib/types';

export default function Team() {
  const { state } = useAppState();

  const members = [
    { name: 'Admin User', email: 'admin@company.com', role: 'owner' as Role, status: 'active', joined: '2024-01-01', projects: 'All' },
    { name: 'Sarah SEO', email: 'sarah@company.com', role: 'seo_manager' as Role, status: 'active', joined: '2024-02-15', projects: '3 projects' },
    { name: 'Mike Analyst', email: 'mike@company.com', role: 'analyst' as Role, status: 'active', joined: '2024-03-10', projects: '2 projects' },
    { name: 'Client Viewer', email: 'client@example.com', role: 'client' as Role, status: 'active', joined: '2024-04-01', projects: '1 project' },
    { name: 'Pending Invite', email: 'new@company.com', role: 'editor' as Role, status: 'pending', joined: '—', projects: '—' },
  ];

  const roles: { role: Role; label: string; permissions: string }[] = [
    { role: 'owner', label: 'Owner', permissions: 'Full access to everything' },
    { role: 'admin', label: 'Admin', permissions: 'Manage org settings, billing, team' },
    { role: 'manager', label: 'Manager', permissions: 'Manage projects, run audits' },
    { role: 'seo_manager', label: 'SEO Manager', permissions: 'SEO operations, keywords, reports' },
    { role: 'analyst', label: 'Analyst', permissions: 'View data, generate reports' },
    { role: 'editor', label: 'Editor', permissions: 'Content editing, briefs' },
    { role: 'client', label: 'Client', permissions: 'View assigned projects only (read-only)' },
    { role: 'viewer', label: 'Viewer', permissions: 'Read-only access to all data' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-sm text-slate-400 mt-1">Manage organization members and permissions</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {/* Members Table */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Member</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Projects</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Joined</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, i) => (
              <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-600/30 flex items-center justify-center text-xs font-bold text-brand-400">
                      {member.name[0]}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{member.name}</p>
                      <p className="text-xs text-slate-400">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-brand-500/20 text-brand-400">
                    {roles.find(r => r.role === member.role)?.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {member.status === 'active' ? (
                    <span className="flex items-center gap-1 text-xs text-accent-green"><CheckCircle2 className="w-3 h-3" /> Active</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-accent-yellow"><Clock className="w-3 h-3" /> Pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">{member.projects}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{member.joined}</td>
                <td className="px-4 py-3 text-right">
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Roles & Permissions */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Roles & Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roles.map((role, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50">
              <Shield className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-white font-medium">{role.label}</p>
                <p className="text-xs text-slate-400">{role.permissions}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions Matrix */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Permission Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left py-2 pr-4 text-slate-400">Permission</th>
                {roles.map(r => <th key={r.role} className="text-center py-2 px-2 text-slate-400">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { perm: 'project.read', access: [true, true, true, true, true, true, true, true] },
                { perm: 'project.write', access: [true, true, true, true, false, false, false, false] },
                { perm: 'seo.audit.run', access: [true, true, true, true, false, false, false, false] },
                { perm: 'keyword.write', access: [true, true, true, true, false, false, false, false] },
                { perm: 'reports.generate', access: [true, true, true, true, true, false, false, true] },
                { perm: 'billing.manage', access: [true, true, false, false, false, false, false, false] },
                { perm: 'team.invite', access: [true, true, true, false, false, false, false, false] },
                { perm: 'api.manage', access: [true, true, false, false, false, false, false, false] },
              ].map((row, i) => (
                <tr key={i} className="border-b border-surface-3/20">
                  <td className="py-2 pr-4 text-slate-300 font-mono">{row.perm}</td>
                  {row.access.map((has, j) => (
                    <td key={j} className="text-center py-2">
                      {has ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent-green mx-auto" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
