const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  starter: { bg: '#eff6ff', text: '#1d4ed8' },
  pro: { bg: '#eef2ff', text: '#4338ca' },
  enterprise: { bg: '#f5f3ff', text: '#6d28d9' },
}

const SUB_STATUS: Record<string, { bg: string; text: string }> = {
  active: { bg: '#d1fae5', text: '#065f46' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
  past_due: { bg: '#fef3c7', text: '#92400e' },
  paused: { bg: '#f3f4f6', text: '#4b5563' },
}

interface TopUp {
  id: string
  packKey: string
  credits: number
  amountUsd: number
  createdAt: string
}
interface Subscription {
  id: string
  planKey: string
  status: string
  creditsPerCycle: number
  currentPeriodEnd: string
  cancelledAt?: string
  createdAt: string
}
interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  imageUrl?: string
  role: string
  createdAt: string
  creditsRemaining: number
  creditsBought: number
  subscription?: Subscription | null
  topUps?: TopUp[]
}

export function UsersTable({
  users,
  onSelectUser,
}: {
  users: User[]
  onSelectUser: (id: string) => void
}) {
  if (!users || users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-3 opacity-40"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <p className="text-sm font-medium">No users found</p>
      </div>
    )
  }

  return (
    /* Outer wrapper: full width, horizontally scrollable on small screens */
    <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>
        {/* ── Head ── */}
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
            {['User', 'Role', 'Plan', 'Joined', 'Credits Left', 'Bought', ''].map((h, i) => (
              <th
                key={h + i}
                style={{
                  padding: '10px 16px',
                  textAlign: i >= 4 ? 'right' : 'left',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#9ca3af',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody>
          {users.map((user, idx) => {
            const initials = (user.firstName?.[0] || user.email[0]).toUpperCase()
            const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'
            const plan = user.subscription?.planKey
            const planColor = plan
              ? (PLAN_COLORS[plan] ?? { bg: '#f3f4f6', text: '#374151' })
              : null
            const subStatus = user.subscription?.status
            const statusColor = subStatus
              ? (SUB_STATUS[subStatus] ?? { bg: '#f3f4f6', text: '#374151' })
              : null

            return (
              <tr
                key={user.id}
                style={{
                  borderBottom: '1px solid #f9fafb',
                  background: idx % 2 === 0 ? '#fff' : '#fafafa',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')}
                onMouseLeave={e =>
                  (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')
                }
              >
                {/* User cell */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                    {user.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt=""
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: 'linear-gradient(135deg, #c7d2fe, #a5f3fc)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#4338ca',
                        }}
                      >
                        {initials}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 600,
                          color: '#111827',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          color: '#9ca3af',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 200,
                        }}
                      >
                        {user.email}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      background: user.role === 'admin' ? '#111827' : '#f3f4f6',
                      color: user.role === 'admin' ? '#fff' : '#6b7280',
                    }}
                  >
                    {user.role}
                  </span>
                </td>

                {/* Plan */}
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                  {planColor ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          background: planColor.bg,
                          color: planColor.text,
                        }}
                      >
                        {plan}
                      </span>
                      {statusColor && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1px 6px',
                            borderRadius: 9999,
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: statusColor.bg,
                            color: statusColor.text,
                          }}
                        >
                          {subStatus}
                        </span>
                      )}
                      {user.subscription?.creditsPerCycle && (
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>
                          {user.subscription.creditsPerCycle} cr/cycle
                        </span>
                      )}
                    </div>
                  ) : user.topUps && user.topUps.length > 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: '#f0fdfa',
                        color: '#0d9488',
                      }}
                    >
                      Top-up only
                    </span>
                  ) : (
                    <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* Joined */}
                <td
                  style={{
                    padding: '12px 16px',
                    color: '#6b7280',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>

                {/* Credits left */}
                <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      background: user.creditsRemaining > 0 ? '#eef2ff' : '#f3f4f6',
                      color: user.creditsRemaining > 0 ? '#4338ca' : '#9ca3af',
                    }}
                  >
                    {user.creditsRemaining}
                  </span>
                </td>

                {/* Credits bought */}
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#374151',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.creditsBought}
                </td>

                {/* Action */}
                <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    onClick={() => onSelectUser(user.id)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '5px 12px',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: '#374151',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'
                      ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                        '0 1px 3px rgba(0,0,0,0.08)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#fff'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'
                      ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
                    }}
                  >
                    Inspect →
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
