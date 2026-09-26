import { Minus, Plus } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'

export interface AccordionItemData {
  value: string
  title: string
  content: string
}
const PRODUCT_FAQ: readonly AccordionItemData[] = [
  {
    value: 'faq-1',
    title: 'How is Pitch different from Loom?',
    content:
      'Loom records you clicking around your product. Pitch is autonomous. An AI agent opens a real browser, navigates your product, writes the script, and produces a polished, narrated video with cinematic cursor motion and color grading. Loom is what you record. Pitch is what you publish.',
  },
  {
    value: 'faq-2',
    title: 'How is Pitch different from Synthesia or HeyGen?',
    content:
      'Synthesia and HeyGen generate talking-head avatars. Pitch shows your actual product. The AI agent navigates your real website and narrates what is happening on screen. It is a product demo, not an avatar presentation.',
  },
  {
    value: 'faq-3',
    title: 'How long does it take to generate a video?',
    content:
      'Most videos generate in minutes once you submit your URL and instructions. Longer or more complex flows take a bit more, but you do not stay in the editor waiting on it.',
  },
  {
    value: 'faq-4',
    title: 'What does a video cost?',
    content:
      'You pay for the work a video actually takes, in credits shared across every model and tool. Faster models cost the least per step and the most capable ones, like Astra, the most; the pricing page lists a typical cost for each model, taken from the same prices we bill with. The sandbox and renders cost the same on every model, AI-generated footage is billed per second only when a clip is actually generated, and a job can start with as few as 40 credits.',
  },
  {
    value: 'faq-5',
    title: 'Do I need to install anything or instrument my site?',
    content:
      'No. You just provide a public URL. The agent uses a real browser to navigate the live product, so there is nothing to install, no SDK to embed, and no code change required.',
  },
  {
    value: 'faq-7',
    title: 'Will the video have a watermark?',
    content:
      'Free exports include a small "Powered by Pitch" watermark. Every paid plan removes it.',
  },
]

export const LandingFaqAccordion = (props: { items?: readonly AccordionItemData[] }) => {
  const items = () => props.items ?? PRODUCT_FAQ
  const [open, setOpen] = createSignal(new Set([items()[0]?.value]))
  const toggle = (value: string) =>
    setOpen(current => {
      const next = new Set(current)
      next.has(value) ? next.delete(value) : next.add(value)
      return next
    })
  return (
    <Show when={items().length}>
      <div class="landing-faq-accordion">
        <For each={items()}>
          {item => (
            <div
              class="landing-faq-accordion-item"
              data-state={open().has(item.value) ? 'open' : 'closed'}
            >
              <h3 class="flex">
                <button
                  type="button"
                  class="landing-faq-accordion-trigger group/accordion-trigger"
                  aria-expanded={open().has(item.value)}
                  onClick={() => toggle(item.value)}
                >
                  <span>{item.title}</span>
                  <span class="landing-faq-accordion-icon relative shrink-0">
                    <Show
                      when={open().has(item.value)}
                      fallback={<Plus style={{ width: '16px', height: '16px' }} />}
                    >
                      <Minus style={{ width: '16px', height: '16px' }} />
                    </Show>
                  </span>
                </button>
              </h3>
              <div class="overflow-hidden text-sm transition-all" hidden={!open().has(item.value)}>
                <div class="pt-0 pb-4">
                  <p class="landing-faq-a">{item.content}</p>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
