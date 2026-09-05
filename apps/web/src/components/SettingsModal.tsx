import { useAuth, useUser } from '@clerk/react'
import {
  ArrowUpRight,
  CircleHelp,
  Gift,
  LoaderCircle,
  Mail,
  Plug,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pCoinIcon from '../assets/pCoin.svg'
import { API_URL } from '../config'
import { ApiKeysView } from '../views/ApiKeysView'
import { McpSettingsPanel } from './McpSettingsPanel'
import '../styles/settings-modal.css'

export type SettingsSection =
  | 'account'
  | 'usage'
  | 'plans'
  | 'credits'
  | 'rewards'
  | 'mcp'
  | 'api'
  | 'support'

interface Transaction {
  id: string
  delta: number
  type: string
  description: string
  createdAt: string
}

interface Subscription {
  planKey: string
  status: string
  creditsPerCycle: number
  currentPeriodStart: string
  currentPeriodEnd: string
}

interface UsageProject {
  id: string
  title: string
  creditsCharged: number
  usageUsd: number
  updatedAt: string
}

interface CreditSummary {
  balance: number
  activeSubscription: Subscription | null
  transactions: Transaction[]
  usage?: { credits: number; usd: number; projects: UsageProject[] }
}

const groups: { label: string; items: { id: SettingsSection; label: string }[] }[] = [
  {
    label: 'Account',
    items: [
      { id: 'account', label: 'Account' },
      { id: 'usage', label: 'Usage' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { id: 'plans', label: 'Plans & billing' },
      { id: 'credits', label: 'Credits' },
    ],
  },
  { label: 'Rewards', items: [{ id: 'rewards', label: 'Rewards' }] },
  {
    label: 'Integrations',
    items: [
      { id: 'mcp', label: 'MCP' },
      { id: 'api', label: 'API' },
    ],
  },
  { label: 'Support', items: [{ id: 'support', label: 'Help & support' }] },
]

const planNames: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}
const plans: {
  key: 'starter' | 'pro' | 'enterprise'
  name: string
  price: number | null
  credits: number | null
  copy: string
  popular?: boolean
}[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 10,
    credits: 10,
    copy: 'A simple monthly allowance for occasional projects.',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 40,
    credits: 50,
    copy: 'More room for regular creation and iteration.',
    popular: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 130,
    credits: 200,
    copy: 'High-volume production and the strongest credit value for teams.',
  },
]

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`settings-card ${className}`}>{children}</section>
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="settings-empty">{children}</div>
}

export function SettingsModal({
  section,
  onSectionChange,
  onClose,
}: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onClose: () => void
}) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<CreditSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkout, setCheckout] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await getToken()
        if (!token) return
        const response = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok && !cancelled) setSummary(await response.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getToken])

  const usedThisPeriod = useMemo(() => {
    const start = summary?.activeSubscription?.currentPeriodStart
    return (summary?.transactions ?? [])
      .filter(
        item => item.type === 'usage' && (!start || new Date(item.createdAt) >= new Date(start)),
      )
      .reduce((total, item) => total + Math.abs(item.delta), 0)
  }, [summary])
  const allowance = summary?.activeSubscription?.creditsPerCycle ?? 0
  const usagePercent = allowance ? Math.min(100, (usedThisPeriod / allowance) * 100) : 0
  const referralCredits = (summary?.transactions ?? [])
    .filter(item => item.type === 'referral')
    .reduce((total, item) => total + Math.max(0, item.delta), 0)

  const startCheckout = async (key: string, topup = false) => {
    setCheckout(key)
    try {
      const token = await getToken()
      const response = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(topup ? { topup: key } : { pack: key }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Checkout failed')
      window.location.assign(data.url)
    } catch {
      setCheckout(null)
    }
  }

  const title = groups.flatMap(group => group.items).find(item => item.id === section)?.label

  return (
    <div
      className="settings-overlay"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-dialog__header">
          <div>
            <h2 id="settings-title">Pitch settings</h2>
            <p>Manage your account, usage, billing, integrations, and support.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </header>
        <div className="settings-dialog__body">
          <aside className="settings-nav" aria-label="Settings sections">
            {groups.map(group => (
              <div key={group.label} className="settings-nav__group">
                <span>{group.label}</span>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={section === item.id ? 'is-active' : ''}
                    onClick={() => onSectionChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <main className="settings-content">
            <div className="settings-mobile-tabs">
              <label htmlFor="settings-section">Settings</label>
              <select
                id="settings-section"
                value={section}
                onChange={event => onSectionChange(event.target.value as SettingsSection)}
              >
                {groups
                  .flatMap(group => group.items)
                  .map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="settings-content__heading">
              <h3>{title}</h3>
            </div>

            {section === 'account' && (
              <div className="settings-grid settings-grid--account">
                <Panel>
                  <div className="settings-card__title">
                    <UserRound size={17} /> Profile
                  </div>
                  <div className="settings-profile">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt="" />
                    ) : (
                      <span>{user?.firstName?.[0] ?? 'P'}</span>
                    )}
                    <div>
                      <strong>{user?.fullName || 'Pitch creator'}</strong>
                      <small>{user?.primaryEmailAddress?.emailAddress}</small>
                    </div>
                  </div>
                  <div className="settings-field">
                    <span>Name</span>
                    <strong>{user?.fullName || 'Not set'}</strong>
                  </div>
                  <div className="settings-field">
                    <span>Email</span>
                    <strong>{user?.primaryEmailAddress?.emailAddress || 'Not set'}</strong>
                  </div>
                </Panel>
                <Panel>
                  <div className="settings-card__title">Notifications</div>
                  <label className="settings-toggle">
                    <span>
                      <strong>Email</strong>
                      <small>Completion and account updates</small>
                    </span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label className="settings-toggle">
                    <span>
                      <strong>Browser</strong>
                      <small>Desktop alerts when work finishes</small>
                    </span>
                    <input type="checkbox" />
                  </label>
                </Panel>
              </div>
            )}

            {section === 'usage' && (
              <div className="settings-stack">
                <Panel>
                  <div className="settings-metrics">
                    <div>
                      <span>Used this period</span>
                      <strong>{usedThisPeriod}</strong>
                      <small>credits</small>
                    </div>
                    <div>
                      <span>Available</span>
                      <strong>{summary?.balance ?? '—'}</strong>
                      <small>credits</small>
                    </div>
                    <div>
                      <span>Measured cost</span>
                      <strong>${(summary?.usage?.usd ?? 0).toFixed(2)}</strong>
                      <small>all time</small>
                    </div>
                  </div>
                  <div className="settings-progress">
                    <span style={{ width: `${usagePercent}%` }} />
                  </div>
                  <p className="settings-note">
                    Pitch meters the agent’s model spend and the compute time used to record,
                    generate, and render. Charges are drawn from the same credit balance.
                  </p>
                </Panel>
                <Panel>
                  <div className="settings-card__title">Usage by project</div>
                  {(summary?.usage?.projects ?? []).length ? (
                    summary?.usage?.projects.slice(0, 12).map(project => (
                      <div className="settings-activity" key={project.id}>
                        <span>
                          <strong>{project.title || 'Untitled project'}</strong>
                          <small>{new Date(project.updatedAt).toLocaleDateString()}</small>
                        </span>
                        <b>{project.creditsCharged} credits</b>
                      </div>
                    ))
                  ) : (
                    <EmptyState>{loading ? 'Loading usage…' : 'No measured usage yet.'}</EmptyState>
                  )}
                </Panel>
              </div>
            )}

            {section === 'plans' && (
              <div className="settings-stack">
                <Panel className="settings-current-plan">
                  <span>Current plan</span>
                  <strong>
                    {summary?.activeSubscription
                      ? (planNames[summary.activeSubscription.planKey] ??
                        summary.activeSubscription.planKey)
                      : 'No active plan'}
                  </strong>
                  <small>
                    {summary?.activeSubscription
                      ? `${summary.activeSubscription.creditsPerCycle} credits per billing cycle`
                      : 'Choose a plan whenever you are ready.'}
                  </small>
                </Panel>
                <div className="settings-billing-cycle" role="tablist" aria-label="Billing cycle">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={billingCycle === 'monthly'}
                    className={billingCycle === 'monthly' ? 'is-active' : ''}
                    onClick={() => setBillingCycle('monthly')}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={billingCycle === 'annual'}
                    className={billingCycle === 'annual' ? 'is-active' : ''}
                    onClick={() => setBillingCycle('annual')}
                  >
                    Annual <span>Save 20%</span>
                  </button>
                </div>
                {billingCycle === 'annual' && (
                  <div className="settings-offer-note">
                    <Gift size={15} />
                    <span>
                      <strong>Annual pricing is coming next.</strong> Preview the savings below;
                      checkout stays disabled until the annual products are connected.
                    </span>
                  </div>
                )}
                <div className="settings-plans">
                  {plans.map(plan => (
                    <Panel key={plan.key} className={plan.popular ? 'is-popular' : ''}>
                      <div className="settings-plan-name">
                        {plan.name}
                        {plan.popular && <em>Popular</em>}
                      </div>
                      <strong className="settings-price">
                        {plan.price === null
                          ? 'Custom'
                          : `$${billingCycle === 'annual' ? Math.round(plan.price * 0.8) : plan.price}`}
                        <small>{plan.price === null ? '' : '/mo'}</small>
                      </strong>
                      <p>{plan.copy}</p>
                      <span>
                        {plan.credits ? `${plan.credits} credits each month` : 'Volume pricing'}
                      </span>
                      {plan.price !== null && (
                        <span className="settings-plan-saving">
                          {billingCycle === 'annual'
                            ? `Save $${Math.round(plan.price * 12 * 0.2)} per year`
                            : plan.key === 'pro'
                              ? 'Save 20% per credit'
                              : plan.key === 'enterprise'
                                ? 'Save 35% per credit'
                                : 'Cancel any time'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void startCheckout(plan.key)
                        }}
                        disabled={checkout === plan.key || billingCycle === 'annual'}
                      >
                        {checkout === plan.key ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : billingCycle === 'annual' ? (
                          'Annual offer coming soon'
                        ) : (
                          `Choose ${plan.name}`
                        )}
                      </button>
                    </Panel>
                  ))}
                </div>
              </div>
            )}

            {section === 'credits' && (
              <div className="settings-stack">
                <Panel>
                  <div className="settings-balance">
                    <img src={pCoinIcon} alt="" />
                    <div>
                      <span>Available credits</span>
                      <strong>{summary?.balance ?? '—'}</strong>
                    </div>
                    <small>
                      {summary?.activeSubscription
                        ? `${planNames[summary.activeSubscription.planKey] ?? summary.activeSubscription.planKey} plan`
                        : 'No plan'}
                    </small>
                  </div>
                  <div className="settings-buy">
                    <div>
                      <strong>Need more room?</strong>
                      <span>Buy a one-time credit pack. Credits do not expire.</span>
                    </div>
                    <button type="button" onClick={() => void startCheckout('topup_10', true)}>
                      Buy 10 credits
                    </button>
                    <button type="button" onClick={() => void startCheckout('topup_50', true)}>
                      Buy 50 credits
                    </button>
                  </div>
                </Panel>
                <Panel>
                  <div className="settings-card__title">Credit activity</div>
                  {(summary?.transactions ?? []).slice(0, 12).map(item => (
                    <div className="settings-activity" key={item.id}>
                      <span>
                        <strong>{item.description}</strong>
                        <small>{new Date(item.createdAt).toLocaleDateString()}</small>
                      </span>
                      <b className={item.delta > 0 ? 'is-positive' : ''}>
                        {item.delta > 0 ? '+' : ''}
                        {item.delta}
                      </b>
                    </div>
                  ))}
                </Panel>
              </div>
            )}

            {section === 'rewards' && (
              <Panel>
                <div className="settings-card__title">
                  <Gift size={17} /> Rewards
                </div>
                <div className="settings-reward">
                  <strong>{referralCredits}</strong>
                  <span>reward credits earned</span>
                </div>
                <p className="settings-note">
                  Invite people to Pitch and earn credits when their referral qualifies. Your
                  existing referral link and activity stay available in the rewards dashboard.
                </p>
                <button
                  className="settings-primary"
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/affiliate')
                  }}
                >
                  Open rewards dashboard <ArrowUpRight size={14} />
                </button>
              </Panel>
            )}

            {section === 'mcp' && (
              <div className="settings-embedded">
                <McpSettingsPanel openApi={() => onSectionChange('api')} />
              </div>
            )}
            {section === 'api' && (
              <div className="settings-embedded">
                <ApiKeysView embedded />
              </div>
            )}

            {section === 'support' && (
              <Panel>
                <div className="settings-card__title">
                  <CircleHelp size={17} /> Help & support
                </div>
                <div className="settings-support">
                  <a href="https://discord.gg/a4SBW36mD" target="_blank" rel="noreferrer">
                    <Plug size={18} />
                    <span>
                      <strong>Join our Discord</strong>
                      <small>Ask the community and get fast answers.</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </a>
                  <a href="mailto:support@trypitch.co">
                    <Mail size={18} />
                    <span>
                      <strong>Talk to the team</strong>
                      <small>Plans, product questions, and support.</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </Panel>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

export function SettingsCreditButton({ onClick }: { onClick: () => void }) {
  const { getToken } = useAuth()
  const [credits, setCredits] = useState<number | null>(null)
  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setCredits((await response.json()).balance)
    }
    void load()
    window.addEventListener('credits-changed', load)
    return () => window.removeEventListener('credits-changed', load)
  }, [getToken])
  return (
    <button
      type="button"
      className="settings-credit-trigger"
      onClick={onClick}
      aria-label={`${credits ?? 0} credits — open billing`}
    >
      <img src={pCoinIcon} alt="" />
      <span>{credits ?? '—'}</span>
    </button>
  )
}
