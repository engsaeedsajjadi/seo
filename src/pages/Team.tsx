import { useState, useEffect } from 'react';
import {
  Users, Plus, Shield, CheckCircle2, Clock, UserPlus, MoreVertical
} from 'lucide-react';
import { useAppState } from '../lib/store';
import type { Role } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Team() {
  const { state } = useAppState();

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

  if (!state.currentOrg) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Users className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Organization</h2>
        <p className="text-slate-400">Create an organization to manage team members.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team</h1>
          <p className="text-sm text-slate-400 mt-1">Manage organization members and permissions</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {/* Members */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Members ({state.currentOrg.members.length})</h3>
        {state.currentOrg.members.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No team members yet</p>
            <p className="text-xs text-slate-500 mt-1">Invite team members to collaborate</p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.currentOrg.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-600/30 flex items-center justify-center text-xs font-bold text-brand-400">
                    {member.name[0]}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{member.name}</p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-brand-500/20 text-brand-400">
                  {roles.find(r => r.role === member.role)?.label}
                </span>
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}
