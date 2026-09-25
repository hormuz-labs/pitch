import { A } from '@solidjs/router'
import {
  Clapperboard,
  Clock,
  CreditCard,
  Infinity as InfinityIcon,
  ShieldCheck,
  Terminal,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-solid'
import { createSignal, For, type JSX, Show } from 'solid-js'
import { CREDITS_PER_VIDEO, REFERRAL_REWARDS } from '../../lib/referral'
import { ReferralPanel } from '../account/ReferralPanel'
import { useAuth } from '../core/auth'
import { Seo } from '../core/Seo'
import { type AccordionItemData, LandingFaqAccordion } from './LandingFaqAccordion'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/affiliates.css'

const { signup: SIGNUP, purchase: PURCHASE } = REFERRAL_REWARDS
const PER_BUYER = SIGNUP + PURCHASE
const videos = (credits: number) => Math.floor(credits / CREDITS_PER_VIDEO)
const fmt = (n: number) => n.toLocaleString('en-US')

const STATS = [
  [fmt(PER_BUYER), 'credits per referral who buys'],
  [`~${videos(PER_BUYER)}`, 'finished videos per paying referral'],
  ['No cap', 'on how many you refer'],
  ['30 days', 'to make up their mind'],
]
const STEPS = [
  [
    '01',
    'Get your link',
    'Open the affiliate page and your link is already there. No separate application, no forms, no waiting to be approved.',
  ],
  [
    '02',
    'Share it anywhere',
    'Posts, replies, videos, newsletters, Discord servers, a class you teach. Every video you made with Pitch can carry it.',
  ],
  [
    '03',
    'Credits land in your wallet',
    `${SIGNUP} credits the moment they sign up, ${PURCHASE} more when they first buy. They arrive in the same balance you make videos with.`,
  ],
]
type Icon = (props: { size?: number; 'aria-hidden'?: boolean }) => JSX.Element
const AUDIENCES: [Icon, string, string][] = [
  [
    Clapperboard,
    'Creators',
    'You already post short-form. A film Pitch made in one sentence is the kind of thing people stop scrolling for, and every view can carry your link.',
  ],
  [
    Terminal,
    'Builders',
    'You show agent workflows, MCP setups and API tricks to a technical audience. Pitch is one of the few agents with something to look at when it finishes.',
  ],
  [
    Users,
    'Communities',
    'You run a newsletter, a Discord, a cohort, a subreddit. Recommend the tool your members keep asking about anyway.',
  ],
]
const TERMS: [Icon, string, string][] = [
  [
    UserPlus,
    `+${SIGNUP} credits when they sign up`,
    'Paid the moment a referred account is created, before they spend anything.',
  ],
  [
    CreditCard,
    `+${PURCHASE} credits when they first buy`,
    `Their first paid plan, Pro or Max. ${fmt(PER_BUYER)} credits in total covers about ${videos(PER_BUYER)} finished demo videos.`,
  ],
  [
    Wallet,
    'Credits, not cash',
    'Rewards land in your normal balance. There is no payout form or minimum.',
  ],
  [
    InfinityIcon,
    'No cap on referrals',
    'Refer as many people as you like. Every new account that pays counts.',
  ],
  [
    Clock,
    '30 days to decide',
    'Your link is remembered for 30 days in the browser they clicked from.',
  ],
  [
    ShieldCheck,
    'One reward per person',
    'Each account earns signup and purchase credit once. Self-referral does not count.',
  ],
]
const FAQ: AccordionItemData[] = [
  {
    value: 'a1',
    title: 'How does the link know who I referred?',
    content:
      'Your link carries a code. We remember it in their browser for 30 days and apply it when they sign up or check out.',
  },
  {
    value: 'a2',
    title: 'How many credits do I earn?',
    content: `${SIGNUP} credits at signup and ${PURCHASE} more on their first purchase: ${fmt(PER_BUYER)} credits per paying referral, about ${videos(PER_BUYER)} narrated demo videos at roughly ${CREDITS_PER_VIDEO} credits each.`,
  },
  {
    value: 'a3',
    title: 'Is any of this paid in cash?',
    content: 'No. The program is credits only, with no payout threshold or bank details.',
  },
  {
    value: 'a4',
    title: 'When do credits show up?',
    content:
      'The signup credit arrives when the account is created and the purchase credit when their first payment succeeds.',
  },
  {
    value: 'a5',
    title: 'What does the person I refer get?',
    content:
      'Rewards go to you. Your friend signs up like anyone else, starts with an empty wallet, and picks a Pro or Max plan when they are ready to make something.',
  },
]
const Calculator = () => {
  const [signups, setSignups] = createSignal(25),
    [buyers, setBuyers] = createSignal(8)
  const paying = () => Math.min(signups(), buyers()),
    credits = () => signups() * SIGNUP + paying() * PURCHASE
  return (
    <div class="lb-aff-calc">
      <div class="lb-aff-calc-dials">
        <label class="lb-aff-dial">
          <span class="lb-aff-dial-head">
            <span>Friends who sign up</span>
            <b>{signups()}</b>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={signups()}
            onInput={e => {
              const n = +e.currentTarget.value
              setSignups(n)
              if (buyers() > n) setBuyers(n)
            }}
          />
        </label>
        <label class="lb-aff-dial">
          <span class="lb-aff-dial-head">
            <span>…who go on to buy</span>
            <b>{paying()}</b>
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(signups(), 1)}
            value={paying()}
            onInput={e => setBuyers(+e.currentTarget.value)}
          />
        </label>
      </div>
      <div class="lb-aff-calc-out">
        <div class="lb-aff-calc-total">
          <span class="lb-aff-calc-num">{fmt(credits())}</span>
          <span class="lb-aff-calc-unit">credits</span>
        </div>
        <p class="lb-aff-calc-videos">~{videos(credits())} finished videos</p>
        <p class="lb-aff-calc-math">
          {signups()} × {SIGNUP} at signup + {paying()} × {PURCHASE} on first purchase.
        </p>
      </div>
    </div>
  )
}
export const AffiliatesView = () => {
  const auth = useAuth(),
    signed = () => (typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn)
  return (
    <div class="lb-root">
      <Seo
        title="Affiliate program: earn Pitch credits for every referral | Pitch"
        description={`Share Pitch and earn credits: ${SIGNUP} when a friend signs up through your link, ${PURCHASE} more on their first purchase. Credits only, no cap on referrals.`}
        path="/affiliates"
      />
      {/* One page for everyone. Signed in, it sits in the app shell (no second
          nav, same as /pricing) and the referral panel replaces the sign-up pitch. */}
      <Show when={!signed()}>
        <LandingNav />
      </Show>
      <section class="lb-band lb-aff-hero">
        <div class="lb-wrap">
          <p class="lb-chy">Affiliate program</p>
          <h1 class="lb-h2 lb-aff-title">
            More friends. <em>More films.</em>
          </h1>
          <p class="lb-sub lb-muted lb-aff-lede">
            Share Pitch, earn credits. {SIGNUP} credits land when someone signs up through your
            link, and {PURCHASE} more when they first buy.
          </p>
          <Show
            when={signed()}
            fallback={
              <>
                <div class="lb-aff-actions">
                  <A class="lb-cta" href="/sign-up?redirect=%2Faffiliates">
                    Join the affiliate program
                  </A>
                  <a class="lb-cta lb-cta--ghost" href="#how">
                    See how it works
                  </a>
                </div>
                <dl class="lb-aff-stats">
                  <For each={STATS}>
                    {s => (
                      <div>
                        <dt>{s[0]}</dt>
                        <dd>{s[1]}</dd>
                      </div>
                    )}
                  </For>
                </dl>
              </>
            }
          >
            <div class="lb-aff-portal">
              <ReferralPanel />
            </div>
          </Show>
        </div>
      </section>
      <section class="lb-band" id="how">
        <div class="lb-wrap">
          <p class="lb-chy">How it works</p>
          <h2 class="lb-h2">Three steps, then you just share</h2>
          <ol class="lb-aff-steps">
            <For each={STEPS}>
              {([n, title, body]) => (
                <li class="lb-aff-step">
                  <span class="lb-aff-step-n">{n}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              )}
            </For>
          </ol>
        </div>
      </section>
      <section class="lb-band">
        <div class="lb-wrap">
          <p class="lb-chy">Who this is for</p>
          <h2 class="lb-h2">If people listen to you, this works</h2>
          <ul class="lb-aff-audiences">
            <For each={AUDIENCES}>
              {([Glyph, title, body]) => (
                <li class="lb-aff-audience">
                  <span class="lb-aff-glyph">
                    <Glyph size={18} aria-hidden />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>
      <section class="lb-band">
        <div class="lb-wrap">
          <p class="lb-chy">Terms</p>
          <h2 class="lb-h2">Simple terms, written down</h2>
          <ul class="lb-aff-terms">
            <For each={TERMS}>
              {([Glyph, title, body]) => (
                <li>
                  <span class="lb-aff-term-glyph">
                    <Glyph size={16} aria-hidden />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              )}
            </For>
          </ul>
        </div>
      </section>
      <section class="lb-band">
        <div class="lb-wrap">
          <p class="lb-chy">The math</p>
          <h2 class="lb-h2">Do the math on your audience</h2>
          <Calculator />
        </div>
      </section>
      <section class="lb-band">
        <div class="lb-wrap">
          <p class="lb-chy">FAQ</p>
          <h2 class="lb-h2">Questions, answered</h2>
          <div class="lb-aff-faq">
            <LandingFaqAccordion items={FAQ} />
          </div>
        </div>
      </section>
      <Show when={!signed()}>
        <LandingFooter />
      </Show>
    </div>
  )
}
