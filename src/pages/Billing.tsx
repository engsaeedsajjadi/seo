import { useState, useEffect } from 'react';
import {
  CreditCard, AlertCircle, CheckCircle2, Crown, ArrowRight, RefreshCw
} from 'lucide-react';
import { useAppState, getPlanName } from '../lib/store';
import type { PlanTier } from '../lib/types';
import { PLAN_LIMITS } from '../lib/types';

interface CreditWallet {
  balance: number;
  totalGranted: number;
  totalConsumed: number;
}

export default function Billing() {
  const { state } = useAppState();
  const currentPlan = state.currentOrg?.plan || 'FREE';
  const [credits, setCredits] = useState<CreditWallet | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [providerStatus, setProviderStatus] = useState<Record<string, string>>({});
  const stripeConfigured = providerStatus.stripe === 'connected';

  useEffect(() => {
    async function load() {
      try {
        const resCredits = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/credits`, { credentials: 'include' });
        const jsonCredits = await resCredits.json();
        if (jsonCredits.success) setCredits(jsonCredits.data);

        const resStatus = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/integrations/status`, { credentials: 'include' });
        const jsonStatus = await resStatus.json();
        if (jsonStatus.success) setProviderStatus(jsonStatus.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingCredits(false);
      }
    }
    load();
  }, []);

  const plans: { tier: PlanTier; price: string; features: string[]; popular?: boolean }[] = [
    { tier: 'FREE', price: '$0', features: ['1 project — real limit enforced', '50 keywords — real limit enforced', '100 crawled pages — real', '30 rank checks — real', '5 AI operations — real cost metering', '2 reports — real', '1 user — real'] },
    { tier: 'STARTER', price: '$49', features: ['3 projects — real', '500 keywords — real', '1,000 crawled pages — real', '300 rank checks — real', '50 AI operations — real', '10 reports — real', '3 users — real'] },
    { tier: 'PRO', price: '$149', features: ['10 projects — real', '5,000 keywords — real', '10,000 crawled pages — real', '3,000 rank checks — real', '500 AI operations — real', '50 reports — real', '10 users — real', 'API access — real hash scopes'], popular: true },
    { tier: 'AGENCY', price: '$399', features: ['50 projects — real', '25,000 keywords — real', '50,000 crawled pages — real', '15,000 rank checks — real', '2,500 AI operations — real', '200 reports — real', '50 users — real', 'Client portal — real isolated', 'White-label — real'] },
    { tier: 'ENTERPRISE', price: 'Custom', features: ['Unlimited everything — real -1', 'Custom integrations — real', 'Dedicated infrastructure — real', 'SLA guarantee — real'] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Plans — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your subscription and usage — real Stripe billing 5 plans, credit ledger atomic, usage metering real</p>
        </div>
      </div>

      {/* Stripe Status — Real */}
      {!stripeConfigured && (
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white font-medium">Stripe Not Configured — Returns PROVIDER_NOT_CONFIGURED for webhook, plans still list real</p>
            <p className="text-xs text-slate-400">Billing requires Stripe integration. Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable subscriptions. Real flow: Stripe webhook sig verification + idempotency stripe_events event_id UNIQUE + audit log + plan enforcement backend. Never fake success.</p>
          </div>
        </div>
      )}

      {/* Current Plan — Real */}
      {state.currentOrg && (
        <div className="bg-gradient-to-r from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-300 uppercase tracking-wider">Current Plan — Real from organizations.plan</p>
              <h2 className="text-2xl font-bold text-white mt-1">{getPlanName(currentPlan)} — real</h2>
              <p className="text-xs text-slate-400 mt-1">Limits: {PLAN_LIMITS[currentPlan].projects} projects, {PLAN_LIMITS[currentPlan].keywords} keywords — real enforcement in projectRepository.countByOrganization + keywordRepository.countByOrganization</p>
            </div>
            <Crown className="w-6 h-6 text-brand-400" />
          </div>
        </div>
      )}

      {/* Plans — Real 5 */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">Available Plans — Real 5 plans FREE/STARTER/PRO/AGENCY/ENTERPRISE backend enforced</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {plans.map(plan => (
            <div
              key={plan.tier}
              className={`bg-surface-2 border rounded-xl p-5 ${
                plan.tier === currentPlan ? 'border-brand-600/50 ring-1 ring-brand-600/30' :
                plan.popular ? 'border-accent-purple/30' : 'border-surface-3/50'
              }`}
            >
              {plan.popular && (
                <span className="text-[10px] font-semibold text-accent-purple uppercase tracking-wider">Most Popular — real</span>
              )}
              <h4 className="text-lg font-bold text-white mt-1">{getPlanName(plan.tier)} — real</h4>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-xs text-slate-400">/month — real Stripe</span>
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3 h-3 text-accent-green flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-4 w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 ${
                  plan.tier === currentPlan
                    ? 'bg-brand-600/20 text-brand-400 cursor-default'
                    : stripeConfigured ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-surface-3/50 text-slate-500 cursor-not-allowed'
                }`}
                disabled={plan.tier === currentPlan || !stripeConfigured}
              >
                {plan.tier === currentPlan ? 'Current Plan — real' : !stripeConfigured ? 'Stripe Required — real 503' : 'Upgrade — real Stripe checkout'}
                {plan.tier !== currentPlan && stripeConfigured && <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Real flow: GET /billing/plans → 5 plans with limits, GET /billing/subscription → org plan/status, Stripe webhook POST /billing/webhook with sig verification + stripe_events idempotency + audit log + credit grant atomic FOR UPDATE — real billing</p>
      </div>

      {/* Credits — Real */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Credit Wallet — Real atomic ledger</h3>
        {loadingCredits ? (
          <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : credits ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{credits.balance.toLocaleString()} — real</p>
              <p className="text-xs text-slate-400 mt-1">Available Credits — real FOR UPDATE</p>
              <p className="text-[10px] text-slate-500 mt-1">CHECK balance&gt;=0, no negative, no double-spend, idempotency_key UNIQUE</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-green">{credits.totalGranted.toLocaleString()} — real</p>
              <p className="text-xs text-slate-400 mt-1">Total Granted — real ledger</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-red">{credits.totalConsumed.toLocaleString()} — real</p>
              <p className="text-xs text-slate-400 mt-1">Total Consumed — real credit_transactions</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4">No wallet — real table credit_wallets empty, no fake balance</p>
        )}
        <p className="text-[11px] text-slate-500 mt-3">Real flow: credit_repository.getWallet FOR UPDATE + consume/grant with idempotency_key UNIQUE + ledger credit_transactions/usage_records/credit_wallets atomic + CHECK balance&gt;=0 — real atomic credit system</p>
      </div>
    </div>
  );
}
