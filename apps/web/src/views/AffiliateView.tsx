import { useAuth } from '@clerk/react'
import * as Popover from '@radix-ui/react-popover'
import {
  ArrowUpRight,
  Check,
  Copy,
  DollarSign,
  ExternalLink,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface AffiliateStats {
  clicks: number
  signups: number
  conversions: number
  creditsEarned: number
  videosEarned: number
}

interface AffiliateData {
  id: string
  code: string
  status: string
  createdAt: string
  stats: AffiliateStats
}

// 1 free video = 3 credits.
const CREDITS_PER_VIDEO = 3

// X/Twitter supports @mentions in prefilled share text, so tag the brand there.
// Copy/other text-capable platforms use the plain brand name "Pitch".
const X_HANDLE = '@trypitchdotco'

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: 'blue' | 'violet' | 'orange' | 'green'
}) {
  const accentMap: Record<string, { icon: string; ring: string }> = {
    blue: { icon: 'bg-blue-50 text-blue-600', ring: 'border-blue-100' },
    violet: { icon: 'bg-violet-50 text-violet-600', ring: 'border-violet-100' },
    orange: { icon: 'bg-orange-50 text-orange-600', ring: 'border-orange-100' },
    green: { icon: 'bg-emerald-50 text-emerald-600', ring: 'border-emerald-100' },
  }
  const cfg = accentMap[accent ?? 'blue']

  return (
    <div className="group bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-none">
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.icon} border ${cfg.ring}`}
        >
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1.5">{sub}</div>}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-900 hover:bg-gray-50 transition-colors border border-gray-300 cursor-pointer"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function ShareMenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Popover.Close asChild>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-left"
      >
        <span className="w-4 h-4 flex items-center justify-center text-gray-500 shrink-0">
          {icon}
        </span>
        {children}
      </button>
    </Popover.Close>
  )
}

const XGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)
const LinkedInGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
  </svg>
)
const WhatsAppGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.738-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
  </svg>
)
const TelegramGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
)

import { API_URL } from '../config'

export function AffiliateView() {
  const { getToken } = useAuth()
  const [data, setData] = useState<AffiliateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseUrl =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:5173'
      : 'https://trypitch.co'
  const referralUrl = data ? `${baseUrl}/r/${data.code}` : ''

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/affiliate/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) {
        setData(null)
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error('Failed to fetch affiliate data')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRegister = async () => {
    setRegistering(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/affiliate/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Registration failed')
      await fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRegistering(false)
    }
  }

  // Message with a swappable brand mention (X gets the @handle; everywhere else
  // uses "Pitch"). LinkedIn/Facebook ignore prefilled text — they share the URL
  // only — so the brand surfaces there via the landing page's OpenGraph preview.
  const shareMessage = (brand: string) =>
    `I use ${brand} to create AI-powered product demos. Try it free → ${referralUrl}`

  const openShare = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

  // Caption without the URL, for platforms that take the link as a separate param.
  const shareCaption = 'I use Pitch to create AI-powered product demos. Try it free →'

  const shareTo = {
    x: () =>
      openShare(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage(X_HANDLE))}`,
      ),
    linkedin: () =>
      openShare(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralUrl)}`,
      ),
    whatsapp: () => openShare(`https://wa.me/?text=${encodeURIComponent(shareMessage('Pitch'))}`),
    telegram: () =>
      openShare(
        `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareCaption)}`,
      ),
  }

  // Native OS share sheet (mobile → Instagram, Messages, etc.); falls back to copy.
  const shareNative = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Pitch', text: shareMessage('Pitch'), url: referralUrl })
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(referralUrl)
      } catch {
        /* ignore */
      }
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
      </div>
    )
  }

  // ── Registration Screen ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center gap-5">
        {/* Heading + stat with decorative SVGs */}
        <div className="relative flex flex-col items-center gap-2">
          {/* Confetti + curved lines — decorative, pointer-events-none */}
          <svg
            className="absolute -top-6 -left-16 w-36 h-28 pointer-events-none"
            viewBox="0 0 144 112"
            fill="none"
            aria-hidden="true"
          >
            {/* Curved arc */}
            <path
              d="M10 90 Q40 20 90 50 Q130 80 140 20"
              stroke="#e5e7eb"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Confetti dots */}
            <rect
              x="8"
              y="18"
              width="5"
              height="5"
              rx="1"
              fill="#fbbf24"
              transform="rotate(18 10 20)"
            />
            <rect
              x="30"
              y="6"
              width="4"
              height="4"
              rx="1"
              fill="#a78bfa"
              transform="rotate(-12 32 8)"
            />
            <rect
              x="55"
              y="14"
              width="4"
              height="4"
              rx="1"
              fill="#34d399"
              transform="rotate(30 57 16)"
            />
            <circle cx="72" cy="4" r="2.5" fill="#f87171" />
            <circle cx="20" cy="55" r="2" fill="#60a5fa" />
            <circle cx="95" cy="22" r="2" fill="#fbbf24" />
            <rect
              x="110"
              y="40"
              width="5"
              height="5"
              rx="1"
              fill="#a78bfa"
              transform="rotate(22 112 42)"
            />
          </svg>

          <svg
            className="absolute -top-6 -right-16 w-36 h-28 pointer-events-none"
            viewBox="0 0 144 112"
            fill="none"
            aria-hidden="true"
          >
            {/* Curved arc — mirrored */}
            <path
              d="M134 90 Q104 20 54 50 Q14 80 4 20"
              stroke="#e5e7eb"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Confetti dots */}
            <rect
              x="130"
              y="18"
              width="5"
              height="5"
              rx="1"
              fill="#34d399"
              transform="rotate(-18 132 20)"
            />
            <rect
              x="108"
              y="6"
              width="4"
              height="4"
              rx="1"
              fill="#f87171"
              transform="rotate(12 110 8)"
            />
            <rect
              x="84"
              y="14"
              width="4"
              height="4"
              rx="1"
              fill="#fbbf24"
              transform="rotate(-30 86 16)"
            />
            <circle cx="68" cy="4" r="2.5" fill="#a78bfa" />
            <circle cx="120" cy="55" r="2" fill="#34d399" />
            <circle cx="44" cy="22" r="2" fill="#f87171" />
            <rect
              x="22"
              y="40"
              width="5"
              height="5"
              rx="1"
              fill="#60a5fa"
              transform="rotate(-22 24 42)"
            />
          </svg>

          {/* Bottom trailing arcs */}
          <svg
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-10 pointer-events-none"
            viewBox="0 0 192 40"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 32 Q96 -10 182 32"
              stroke="#f3f4f6"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M30 38 Q96 8 162 38"
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          <h1 className="text-2xl font-bold text-black tracking-tight relative z-10">
            Affiliate Program
          </h1>

          <div className="relative z-10">
            <div className="inline-flex items-start">
              <span className="text-[64px] font-black text-black leading-none tracking-tighter">
                8
              </span>
              <span className="text-2xl font-bold text-black mt-3 ml-1">cr</span>
            </div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
              Credits per referral upgrade
            </p>
          </div>
        </div>

        {/* Headline + subtitle */}
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold text-black tracking-tight leading-snug mb-1.5">
            Turn referrals into free videos
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Share your link — your friends get free starter credits, and you earn credits every time
            one signs up or upgrades.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 max-w-sm">
          {[
            { icon: '🔗', label: 'Unique referral link' },
            { icon: '📊', label: 'Real-time tracking' },
            { icon: '🎬', label: 'Earn free videos' },
            { icon: '🗓', label: '30-day attribution' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
            >
              <span>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
            <span>⚠</span> {error}
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleRegister}
            disabled={registering}
            className="flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer border-none"
          >
            {registering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                Get started for free
                <ArrowUpRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
          <p className="text-[11px] text-gray-400">No credit card required</p>
        </div>

        {/* Inline stats strip */}
        <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
          {[
            { val: '30 days', label: 'Attribution' },
            { val: 'Credits', label: 'Paid in product' },
            { val: 'Instant', label: 'Link creation' },
          ].map(({ val, label }, i, arr) => (
            <div key={label} className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-sm font-bold text-black">{val}</div>
                <div className="text-[10px] text-gray-400">{label}</div>
              </div>
              {i < arr.length - 1 && <div className="w-px h-6 bg-gray-100" />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Affiliate Dashboard ──────────────────────────────────────────────────────
  const stats = data.stats
  const creditsToNextVideo =
    (CREDITS_PER_VIDEO - (stats.creditsEarned % CREDITS_PER_VIDEO)) % CREDITS_PER_VIDEO

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            Affiliate Portal
          </p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Earn free video credits for every friend you refer.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </div>

      {/* Referral Link Card — dark premium strip */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-lg">
        {/* Decorative orb */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
            Your Referral Link
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Code: <span className="font-bold text-white">{data.code}</span> · 30-day attribution
            window
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="flex-1 text-sm bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl font-mono truncate text-gray-200">
              {referralUrl}
            </code>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={referralUrl} />
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors border border-white/10 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Share
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={8}
                    className="w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl z-50 font-sans"
                  >
                    <ShareMenuItem onClick={shareTo.x} icon={<XGlyph />}>
                      Share on X
                    </ShareMenuItem>
                    <ShareMenuItem onClick={shareTo.linkedin} icon={<LinkedInGlyph />}>
                      Share on LinkedIn
                    </ShareMenuItem>
                    <ShareMenuItem onClick={shareTo.whatsapp} icon={<WhatsAppGlyph />}>
                      Share on WhatsApp
                    </ShareMenuItem>
                    <ShareMenuItem onClick={shareTo.telegram} icon={<TelegramGlyph />}>
                      Share on Telegram
                    </ShareMenuItem>
                    <ShareMenuItem
                      onClick={shareNative}
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      More…
                    </ShareMenuItem>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Link Clicks"
          value={stats.clicks.toLocaleString()}
          sub="All time"
          accent="blue"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Signups"
          value={stats.signups.toLocaleString()}
          sub={`${stats.clicks > 0 ? ((stats.signups / stats.clicks) * 100).toFixed(1) : 0}% of clicks`}
          accent="violet"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Conversions"
          value={stats.conversions.toLocaleString()}
          sub="Referrals who upgraded"
          accent="orange"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="Credits Earned"
          value={stats.creditsEarned.toLocaleString()}
          sub={`${stats.videosEarned} free video${stats.videosEarned === 1 ? '' : 's'}`}
          accent="green"
        />
      </div>

      {/* Credits earned — summary strip */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Credits Earned
          </p>
          <p className="text-3xl font-bold text-gray-900 tracking-tight">
            {stats.creditsEarned.toLocaleString()}
            <span className="text-sm font-medium text-gray-400 ml-2">
              = {stats.videosEarned} free video{stats.videosEarned === 1 ? '' : 's'}
            </span>
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            Credits land in your wallet automatically — spend them on video generations.
          </p>
        </div>
        {creditsToNextVideo > 0 && (
          <div className="sm:text-right">
            <p className="text-xs text-gray-400">Next free video in</p>
            <p className="text-sm font-semibold text-gray-700">
              {creditsToNextVideo} credit{creditsToNextVideo === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {/* How it works — subtle info strip */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
          How it works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            {
              step: '01',
              title: 'Share your link',
              desc: 'Post on socials, embed in content, or email your audience.',
            },
            {
              step: '02',
              title: 'They sign up',
              desc: 'Your friend gets free starter credits, and you earn credits too — attributed for 30 days.',
            },
            {
              step: '03',
              title: 'They upgrade',
              desc: 'Earn a bigger credit bonus when a referral buys a plan. 3 credits = 1 free video.',
            },
          ].map(item => (
            <div key={item.step} className="flex gap-3">
              <span className="text-[11px] font-bold text-gray-300 tabular-nums mt-0.5 shrink-0">
                {item.step}
              </span>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
