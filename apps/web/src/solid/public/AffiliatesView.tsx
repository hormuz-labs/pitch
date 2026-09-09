import { A } from '@solidjs/router'
import { createSignal, For } from 'solid-js'
import { useAuth } from '../core/auth'
import { Seo } from '../core/Seo'
import { type AccordionItemData, LandingFaqAccordion } from './LandingFaqAccordion'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/affiliates.css'

const STATS = [
  ['9', 'credits per referral who buys'],
  ['6', 'credits your friend starts with'],
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
    'One credit the moment they sign up, eight more when they first buy. They arrive in the same balance you make videos with.',
  ],
]
const AUDIENCES = [
  [
    'Creators',
    'You already post short-form. A film Pitch made in one sentence is the kind of thing people stop scrolling for, and every view can carry your link.',
  ],
  [
    'Builders',
    'You show agent workflows, MCP setups and API tricks to a technical audience. Pitch is one of the few agents with something to look at when it finishes.',
  ],
  [
    'Communities',
    'You run a newsletter, a Discord, a cohort, a subreddit. Recommend the tool your members keep asking about anyway.',
  ],
]
const TERMS = [
  [
    '+1 credit when they sign up',
    'Paid the moment a referred account is created, before they spend anything.',
  ],
  [
    '+8 credits when they first buy',
    'Their first purchase of any plan or top-up. Nine credits in total is three finished videos.',
  ],
  ['Credits, not cash', 'Rewards land in your normal balance. There is no payout form or minimum.'],
  ['No cap on referrals', 'Refer as many people as you like. Every new account that pays counts.'],
  ['30 days to decide', 'Your link is remembered for 30 days in the browser they clicked from.'],
  [
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
    content:
      'One credit at signup and eight more on their first purchase: nine credits per paying referral.',
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
    content: 'They start with six credits instead of the usual five.',
  },
]
const Calculator = () => {
  const [signups, setSignups] = createSignal(25),
    [buyers, setBuyers] = createSignal(8)
  const paying = () => Math.min(signups(), buyers()),
    credits = () => signups() + paying() * 8
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
          <span class="lb-aff-calc-num">{credits()}</span>
          <span class="lb-aff-calc-unit">credits</span>
        </div>
        <p class="lb-aff-calc-videos">{Math.floor(credits() / 3)} finished videos</p>
        <p class="lb-aff-calc-math">
          {signups()} × 1 at signup + {paying()} × 8 on first purchase.
        </p>
      </div>
    </div>
  )
}
export const AffiliatesView = () => {
  const auth = useAuth(),
    signed = () => (typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn),
    to = () => (signed() ? '/affiliate' : '/sign-up?redirect=%2Faffiliate')
  return (
    <div class="lb-root">
      <Seo
        title="Pitch — Affiliate program"
        description="Share Pitch and earn credits: one when a friend signs up, eight more when they buy."
        path="/affiliates"
      />
      <LandingNav />
      <section class="lb-band lb-aff-hero">
        <div class="lb-wrap">
          <p class="lb-chy">Affiliate program</p>
          <h1 class="lb-h2 lb-aff-title">
            More friends. <em>More films.</em>
          </h1>
          <p class="lb-sub lb-muted lb-aff-lede">
            Share Pitch, earn credits. One credit lands when someone signs up, eight more when they
            first buy. They start with six credits.
          </p>
          <div class="lb-aff-actions">
            <A class="lb-cta" href={to()}>
              {signed() ? 'Get your link' : 'Join the affiliate program'}
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
        </div>
      </section>
      <For
        each={[
          ['How it works', 'Three steps, then you just share', STEPS, 'lb-aff-steps'],
          [
            'Who this is for',
            'If people listen to you, this works',
            AUDIENCES,
            'lb-prod-grid lb-aff-audiences',
          ],
          ['Terms', 'Simple terms, written down', TERMS, 'lb-aff-terms'],
        ]}
      >
        {section => (
          <section class="lb-band" id={section[0] === 'How it works' ? 'how' : undefined}>
            <div class="lb-wrap">
              <p class="lb-chy">{section[0] as string}</p>
              <h2 class="lb-h2">{section[1] as string}</h2>
              <div class={section[3] as string}>
                <For each={section[2] as string[][]}>
                  {x => (
                    <div class="lb-aff-step lb-prod-point">
                      <span class="lb-aff-step-n">{x.length > 2 ? x[0] : ''}</span>
                      <h3>{x[x.length - 2]}</h3>
                      <p>{x[x.length - 1]}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </section>
        )}
      </For>
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
      <LandingFooter />
    </div>
  )
}
