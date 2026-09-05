/**
 * AffiliatesView — the public pitch for the referral program, at /affiliates.
 *
 * Readable signed-out, the way the pricing page is: someone deciding whether
 * to tell their audience about Pitch should not have to make an account to
 * find out what they get. The signed-in dashboard — the link itself, the
 * clicks, the running total — stays at /affiliate, and every button here
 * points at it.
 *
 * Every number on this page comes from REFERRAL_REWARDS in the API config
 * (+1 when a referral signs up, +8 when they first buy) and the 30-day TTL in
 * lib/referral.ts. The program pays credits, never cash — if those constants
 * move, this copy moves with them.
 */
import { useAuth } from '@clerk/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { LandingFaqAccordion } from '../components/landing/LandingFaqAccordion'
import { Seo } from '../components/Seo'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'
import '../styles/affiliates.css'

/** Mirrors REFERRAL_REWARDS in apps/api/src/config.ts. */
const SIGNUP_REWARD = 1
const PURCHASE_REWARD = 8
/** Mirrors CREDITS_PER_VIDEO in AffiliateView. */
const CREDITS_PER_VIDEO = 3
/** Mirrors SIGNUP_BONUS_CREDITS + newUserBonus — what the friend starts with. */
const FRIEND_CREDITS = 6

const STATS = [
  { value: '9', label: 'credits per referral who buys' },
  { value: '6', label: 'credits your friend starts with' },
  { value: 'No cap', label: 'on how many you refer' },
  { value: '30 days', label: 'to make up their mind' },
]

const STEPS = [
  {
    n: '01',
    h: 'Get your link',
    p: 'Open the affiliate page and your link is already there. No separate application, no forms, no waiting to be approved.',
  },
  {
    n: '02',
    h: 'Share it anywhere',
    p: 'Posts, replies, videos, newsletters, Discord servers, a class you teach. Every video you made with Pitch can carry it.',
  },
  {
    n: '03',
    h: 'Credits land in your wallet',
    p: 'One credit the moment they sign up, eight more when they first buy. They arrive in the same balance you make videos with.',
  },
]

const AUDIENCES = [
  {
    h: 'Creators',
    p: 'You already post short-form. A film Pitch made in one sentence is the kind of thing people stop scrolling for, and every view can carry your link.',
  },
  {
    h: 'Builders',
    p: 'You show agent workflows, MCP setups and API tricks to a technical audience. Pitch is one of the few agents with something to look at when it finishes.',
  },
  {
    h: 'Communities',
    p: 'You run a newsletter, a Discord, a cohort, a subreddit. Recommend the tool your members keep asking about anyway, and get paid in the thing they came for.',
  },
]

const TERMS = [
  {
    h: '+1 credit when they sign up',
    p: 'Paid the moment a referred account is created, before they spend anything.',
  },
  {
    h: '+8 credits when they first buy',
    p: 'Their first purchase of any plan or top-up. Nine credits in total is three finished videos.',
  },
  {
    h: 'Credits, not cash',
    p: 'Rewards land in your normal balance and buy exactly what your own credits buy. There is no payout form, no minimum, and nothing to invoice.',
  },
  {
    h: 'No cap on referrals',
    p: 'Refer as many people as you like. Every new account that pays counts.',
  },
  {
    h: '30 days to decide',
    p: 'Your link is remembered for 30 days in the browser they clicked from, and applied when they sign up or check out.',
  },
  {
    h: 'One reward per person',
    p: 'Each referred account earns you the signup credit once and the purchase credit once. Referring yourself does not count.',
  },
]

const FAQ = [
  {
    value: 'aff-faq-1',
    title: 'How does the link know who I referred?',
    content:
      'Your link carries a code. When someone follows it we record the click and remember the code in their browser for 30 days, then hand it back when they sign up or check out. Nothing for your audience to type in and no coupon to remember.',
  },
  {
    value: 'aff-faq-2',
    title: 'How many credits do I earn?',
    content:
      'One credit when a referral signs up, and eight more the first time they buy — nine credits per paying referral. Three credits make one finished video, so a referral who buys is three videos in your account.',
  },
  {
    value: 'aff-faq-3',
    title: 'Is any of this paid in cash?',
    content:
      'No. The program is credits only: no commission, no payout threshold, no PayPal or bank details to hand over. The credits are the same ones you make videos with.',
  },
  {
    value: 'aff-faq-4',
    title: 'When do the credits show up?',
    content:
      'The signup credit is written the moment the account is created. The purchase credit is written when their first payment goes through. Both appear in your balance and in the ledger on your affiliate page.',
  },
  {
    value: 'aff-faq-5',
    title: 'What does the person I refer get?',
    content: `They start with ${FRIEND_CREDITS} credits instead of the usual 5 — two finished videos on the first day, and a credit spare toward a third.`,
  },
  {
    value: 'aff-faq-6',
    title: 'Can I refer myself, or my own company?',
    content:
      'Self-referral is blocked outright. Referring colleagues who genuinely become customers is fine; making accounts to farm credits is not, and it costs you the account.',
  },
  {
    value: 'aff-faq-7',
    title: 'Can I run paid ads on the Pitch name?',
    content:
      'No. Bidding on our brand terms or running ads that look like they come from us is not allowed. Everything else — organic posts, videos, newsletters, communities — is fair game.',
  },
]

/**
 * Two dials rather than a single number: what a referral is worth depends
 * entirely on how many of them buy, and hiding that behind an assumed
 * conversion rate would be a nicer number and a worse answer.
 */
function Calculator() {
  const [signups, setSignups] = useState(25)
  const [buyers, setBuyers] = useState(8)

  const paying = Math.min(buyers, signups)
  const credits = signups * SIGNUP_REWARD + paying * PURCHASE_REWARD
  const videos = Math.floor(credits / CREDITS_PER_VIDEO)

  return (
    <div className="lb-aff-calc">
      <div className="lb-aff-calc-dials">
        <label className="lb-aff-dial" htmlFor="aff-signups">
          <span className="lb-aff-dial-head">
            <span>Friends who sign up</span>
            <b>{signups}</b>
          </span>
          <input
            id="aff-signups"
            type="range"
            min={0}
            max={100}
            value={signups}
            onChange={e => {
              const next = Number(e.target.value)
              setSignups(next)
              if (buyers > next) setBuyers(next)
            }}
          />
        </label>

        <label className="lb-aff-dial" htmlFor="aff-buyers">
          <span className="lb-aff-dial-head">
            <span>…who go on to buy</span>
            <b>{paying}</b>
          </span>
          <input
            id="aff-buyers"
            type="range"
            min={0}
            max={Math.max(signups, 1)}
            value={paying}
            onChange={e => setBuyers(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="lb-aff-calc-out">
        <div className="lb-aff-calc-total">
          <span className="lb-aff-calc-num">{credits.toLocaleString()}</span>
          <span className="lb-aff-calc-unit">credits</span>
        </div>
        <p className="lb-aff-calc-videos">
          {videos.toLocaleString()} finished video{videos === 1 ? '' : 's'}
        </p>
        <p className="lb-aff-calc-math">
          {signups} × {SIGNUP_REWARD} at signup + {paying} × {PURCHASE_REWARD} on first purchase.
          Three credits make one video.
        </p>
      </div>
    </div>
  )
}

export const AffiliatesView = () => {
  const { isSignedIn } = useAuth()
  const joinTo = isSignedIn ? '/affiliate' : '/sign-up?redirect=%2Faffiliate'
  const joinLabel = isSignedIn ? 'Get your link' : 'Join the affiliate program'

  return (
    <>
      <Seo
        title="Pitch — Affiliate program"
        description="Share Pitch and earn credits: one when a friend signs up, eight more when they buy. No cap, no payout forms — the credits make videos."
        path="/affiliates"
      />

      <div className="lb-root">
        <LandingNav />

        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="lb-band lb-aff-hero" aria-labelledby="aff-heading">
          <div className="lb-wrap">
            <p className="lb-chy">Affiliate program</p>
            <h1 id="aff-heading" className="lb-h2 lb-aff-title">
              More friends. <em>More films.</em>
            </h1>
            <p className="lb-sub lb-muted lb-aff-lede">
              Share Pitch, earn credits. One credit lands when someone you sent signs up, eight more
              when they first buy — three finished videos per paying referral. They start with six
              credits instead of five. Nothing to apply for; your link already exists.
            </p>

            <div className="lb-aff-actions">
              <Link className="lb-cta" to={joinTo}>
                {joinLabel}
              </Link>
              <a className="lb-cta lb-cta--ghost" href="#how">
                See how it works
              </a>
            </div>

            <dl className="lb-aff-stats">
              {STATS.map(s => (
                <div key={s.label}>
                  <dt>{s.value}</dt>
                  <dd>{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────── */}
        <section className="lb-band" id="how" aria-labelledby="aff-how">
          <div className="lb-wrap">
            <p className="lb-chy">How it works</p>
            <h2 id="aff-how" className="lb-h2">
              Three steps, then you just <em>share</em>
            </h2>
            <div className="lb-aff-steps">
              {STEPS.map(step => (
                <div key={step.n} className="lb-aff-step">
                  <span className="lb-aff-step-n">{step.n}</span>
                  <h3>{step.h}</h3>
                  <p>{step.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Calculator ────────────────────────────────────── */}
        <section className="lb-band" aria-labelledby="aff-math">
          <div className="lb-wrap">
            <p className="lb-chy">The math</p>
            <h2 id="aff-math" className="lb-h2">
              Do the <em>math</em> on your audience
            </h2>
            <p className="lb-sub lb-muted">
              Rewards are credits, so the honest unit is videos, not dollars.
            </p>
            <Calculator />
          </div>
        </section>

        {/* ── Who it's for ──────────────────────────────────── */}
        <section className="lb-band" aria-labelledby="aff-who">
          <div className="lb-wrap">
            <p className="lb-chy">Who this is for</p>
            <h2 id="aff-who" className="lb-h2">
              If people <em>listen</em> to you, this works
            </h2>
            <div className="lb-prod-grid lb-aff-audiences">
              {AUDIENCES.map(a => (
                <div key={a.h} className="lb-prod-point">
                  <h3>{a.h}</h3>
                  <p>{a.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Terms ─────────────────────────────────────────── */}
        <section className="lb-band" aria-labelledby="aff-terms">
          <div className="lb-wrap">
            <p className="lb-chy">Terms</p>
            <h2 id="aff-terms" className="lb-h2">
              Simple terms, <em>written down</em>
            </h2>
            <ul className="lb-aff-terms">
              {TERMS.map(t => (
                <li key={t.h}>
                  <h3>{t.h}</h3>
                  <p>{t.p}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <section className="lb-band" aria-labelledby="aff-faq">
          <div className="lb-wrap">
            <p className="lb-chy">FAQ</p>
            <h2 id="aff-faq" className="lb-h2">
              Questions, <em>answered</em>
            </h2>
            <div className="lb-aff-faq">
              <LandingFaqAccordion items={FAQ} />
            </div>
          </div>
        </section>

        {/* ── Endcap + footer (direct siblings — the footer docks onto the
             endcap as a glass continuation) ─────────────────────────── */}
        <section className="lb-band lb-endcap">
          <div className="lb-endcap-inner">
            <div className="lb-endcap-copy">
              <h2 className="lb-endcap-title">
                More friends.
                <br /> More <em>films</em>.
              </h2>
              <div className="lb-endcap-actions">
                <a
                  className="lb-endcap-link"
                  href="mailto:support@trypitch.co?subject=Pitch%20affiliate%20program"
                >
                  Ask a question <span aria-hidden="true">↗</span>
                </a>
                <Link to={joinTo} className="lb-endcap-primary">
                  {joinLabel}
                </Link>
              </div>
            </div>
            <div className="lb-endcap-word" aria-hidden="true">
              PITCH
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </>
  )
}
