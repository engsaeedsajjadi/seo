import {
  CreditCard, AlertCircle, CheckCircle2, Crown, ArrowRight
} from 'lucide-react';
import { useAppState, getPlanName } from '../lib/store';
import type { PlanTier } from '../lib/types';
import { PLAN_LIMITS } from '../lib/types';

export default function Billing() {
  const { state } = useAppState();
  const currentPlan = state.currentOrg?.plan || 'FREE';
  const stripeConfigured = state.providerStatus.stripe === 'connected';

  const plans: { tier: PlanTier; price: string; features: string[]; popular?: boolean }[] = [
    { tier: 'FREE', price: '$0', features: ['1 project', '50 keywords', '100 crawled pages', '30 rank checks', '5 AI operations', '2 reports', '1 user'] },
    { tier: 'STARTER', price: '$49', features: ['3 projects', '500 keywords', '1,000 crawled pages', '300 rank checks', '50 AI operations', '10 reports', '3 users'] },
    { tier: 'PRO', price: '$149', features: ['10 projects', '5,000 keywords', '10,000 crawled pages', '3,000 rank checks', '500 AI operations', '50 reports', '10 users', 'API access'], popular: true },
    { tier: 'AGENCY', price: '$399', features: ['50 projects', '25,000 keywords', '50,000 crawled pages', '15,000 rank checks', '2,500 AI operations', '200 reports', '50 users', 'Client portal', 'White-label'] },
    { tier: 'ENTERPRISE', price: 'Custom', features: ['Unlimited everything', 'Custom integrations', 'Dedicated infrastructure', 'SLA guarantee'] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Plans</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your subscription and usage</p>
        </div>
      </div>

      {/* Stripe Status */}
      {!stripeConfigured && (
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white font-medium">Stripe Not Configured</p>
            <p className="text-xs text-slate-400">Billing requires Stripe integration. Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable subscriptions.</p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      {state.currentOrg && (
        <div className="bg-gradient-to-r from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-300 uppercase tracking-wider">Current Plan</p>
              <h2 className="text-2xl font-bold text-white mt-1">{getPlanName(currentPlan)}</h2>
            </div>
            <Crown className="w-6 h-6 text-brand-400" />
          </div>
        </div>
      )}

      {/* Plans */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">Available Plans</h3>
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
                <span className="text-[10px] font-semibold text-accent-purple uppercase tracking-wider">Most Popular</span>
              )}
              <h4 className="text-lg font-bold text-white mt-1">{getPlanName(plan.tier)}</h4>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-xs text-slate-400">/month</span>
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
                {plan.tier === currentPlan ? 'Current Plan' : !stripeConfigured ? 'Stripe Required' : 'Upgrade'}
                {plan.tier !== currentPlan && stripeConfigured && <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Credits */}
      {state.currentOrg && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Credit Wallet</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white">{state.currentOrg.credits.balance.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Available Credits</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-green">{state.currentOrg.credits.totalGranted.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Total Granted</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-red">{state.currentOrg.credits.totalConsumed.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Total Consumed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
