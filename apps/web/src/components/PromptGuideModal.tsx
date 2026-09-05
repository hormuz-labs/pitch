import { X } from 'lucide-react'
import { useEffect } from 'react'
import '../styles/prompt-guide.css'

const inputs = [
  {
    title: 'The thing you want made',
    copy: 'Say the format, audience, and outcome. Pitch should know what winning looks like.',
    example:
      'a 25s homepage hero video that makes startup founders trust the product in five seconds',
  },
  {
    title: 'Your source of truth',
    copy: 'Paste your website, landing page, deck, brand doc, or product link if you have one.',
    example:
      'use https://trypitch.co for product language, colors, logo feel, and customer promise',
  },
  {
    title: 'Taste and references',
    copy: 'Describe the visual taste plainly: premium, playful, cinematic, minimal, brutalist, or editorial.',
    example:
      'Apple keynote restraint, Stripe-like polish, off-white background, crisp black type, one warm accent',
  },
  {
    title: 'Non-negotiables',
    copy: 'Give exact text, scenes, timing, colors, sound, and anything you absolutely do not want.',
    example:
      '“Focus without friction” must appear, 25s, no stock footage, no fake 3D, no AI-looking glow',
  },
]

const patterns = [
  {
    title: 'Start like a creative brief, not a command.',
    example:
      'Make a 30s product teaser for founders who are tired of noisy project tools. It should feel calm, exact, and expensive.',
  },
  {
    title: 'Give Pitch a source it can study — your website is usually the best one.',
    example:
      'Use https://example.com for messaging, product promise, color palette, logo treatment, and feature names.',
  },
  {
    title: 'Anchor the canvas up top — aspect ratio, duration, fps, and base background.',
    example:
      '16:9, 30s, clean off-white background, black typography, one restrained amber accent.',
  },
  {
    title: 'Name the craft you want it to feel like, not just the topic.',
    example:
      'Feels like an iPhone-native motion piece — kinetic typography, edge-to-edge text, deliberate pacing.',
  },
  {
    title: 'Write the video as a beat sheet — each beat gets its own timestamp.',
    example: '0–3s hook · 3–7s build · 7–12s payoff · 12–15s lockup. Every beat earns its seconds.',
  },
  {
    title: 'Pair every beat with a visual cue, a voiceover line, and one mood word.',
    example:
      '0:31–0:34 · white typewriter line, slow · VO (calm): “we built something else” · mood: deliberate.',
  },
  {
    title: 'Reserve one accent color and one signature phrase, then reuse them sparingly.',
    example:
      'Teal only on the period in the name, the URL, and the closing line. Never decorative.',
  },
  {
    title: 'End on a held lockup — name, one-line promise, and URL — long enough to read twice.',
    example:
      'Logo mark + name with accent period + tagline + URL, hold for about 10s, then fade to black.',
  },
]

const checklist = [
  'A website, landing page, deck, doc, or product URL Pitch can learn from',
  'Format and length: hero video, ad, launch teaser, product walkthrough, 15s/30s/60s',
  'Audience and desired reaction: who is watching, what should they feel, what should they do next',
  'Brand cues: colors, logo behavior, font vibe, real phrases, product screenshots, UI moments',
  'Sound direction: music energy, voiceover yes/no, calm, punchy, cinematic, or editorial',
  'Things to avoid: corporate, AI-looking, stock footage, fake 3D, slow pacing, overused gradients',
]

function NumberedItems({ items }: { items: { title: string; copy?: string; example: string }[] }) {
  return (
    <div className="prompt-guide__items">
      {items.map((item, index) => (
        <article className="prompt-guide__item" key={item.title}>
          <span className="prompt-guide__number">{index + 1}</span>
          <div>
            <h4>{item.title}</h4>
            {item.copy && <p>{item.copy}</p>}
            <blockquote>e.g. {item.example}</blockquote>
          </div>
        </article>
      ))}
    </div>
  )
}

export function PromptGuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="prompt-guide-overlay"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div
        className="prompt-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-guide-title"
      >
        <button
          className="prompt-guide__close"
          type="button"
          onClick={onClose}
          aria-label="Close prompt guide"
        >
          <X size={17} />
        </button>

        <header className="prompt-guide__hero">
          <span>Prompt guide</span>
          <h2 id="prompt-guide-title">Get the best video out of Pitch</h2>
          <p>
            Think of this less like a prompt and more like a tiny creative brief. Give Pitch the
            goal, the taste, the source material, and the hard constraints. It can invent the
            execution, but the best results start with strong direction.
          </p>
        </header>

        <div className="prompt-guide__content">
          <section>
            <h3>The inputs that raise the ceiling</h3>
            <NumberedItems items={inputs} />
          </section>

          <section>
            <h3>What pro prompts do</h3>
            <p className="prompt-guide__intro">
              Strong prompts give enough taste and structure that Pitch does not have to guess the
              important stuff. Steal these patterns.
            </p>
            <NumberedItems items={patterns} />
          </section>

          <section>
            <h3>Tiny beat sheet</h3>
            <ul className="prompt-guide__beats">
              <li>
                <b>0–3s</b>
                <span>Black screen, big typewriter line, calm VO: “we built something else”</span>
              </li>
              <li>
                <b>3–10s</b>
                <span>Feed of cards accelerates, audio cacophony rising, mood: overwhelmed</span>
              </li>
              <li>
                <b>10–11s</b>
                <span>Hard white flash, dead silence, the pivot lands</span>
              </li>
              <li>
                <b>11–18s</b>
                <span>Slow logo lockup, accent-colored period, VO: “the first instrument”</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>Quick checklist before you hit generate</h3>
            <ul className="prompt-guide__checklist">
              {checklist.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Skip these</h3>
            <div className="prompt-guide__skip">
              <div>
                <strong>“Make it pop”</strong>
                <p>Tell Pitch what kind of pop — punchy edits, big type, or neon energy?</p>
              </div>
              <div>
                <strong>“A cool video about my app”</strong>
                <p>Name the app, the audience, and the one feeling you want them to leave with.</p>
              </div>
              <div>
                <strong>“Surprise me”</strong>
                <p>Pitch will, but you will iterate faster if you anchor mood and length.</p>
              </div>
            </div>
          </section>

          <section>
            <h3>Rough idea vs. strong brief</h3>
            <div className="prompt-guide__comparison">
              <div>
                <span>Before</span>
                <p>Make a launch video for my app.</p>
              </div>
              <div className="is-after">
                <span>After</span>
                <p>
                  Create a 25s launch video for Pitch, an AI motion-design agent. Use
                  https://trypitch.co as the source for product language, visual tone, and brand
                  cues. The audience is startup founders and product marketers who need a polished
                  launch video without a slow agency process.
                </p>
                <p>
                  Style: calm, premium, mostly off-white and black, crisp kinetic typography, subtle
                  product UI moments, and the restrained blue used on trypitch.co. No stock footage,
                  fake 3D, or neon glow. Music should feel warm and focused, with no voiceover.
                </p>
                <p>
                  Structure: 0–4s show the problem with fast overlapping task fragments. 4–12s slow
                  everything down and introduce Pitch as the agent that turns an idea into a
                  finished cut. 12–20s show three capabilities: launch films, product demos, and
                  explainers. 20–25s hold the final line: “One agent. Idea to finished cut.”
                </p>
              </div>
            </div>
          </section>

          <footer>
            Short on time? Start with a one-liner. You can refine the direction with Pitch in the
            same chat.
          </footer>
        </div>
      </div>
    </div>
  )
}
