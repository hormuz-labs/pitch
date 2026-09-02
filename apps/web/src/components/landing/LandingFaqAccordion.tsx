import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { MinusIcon, PlusIcon } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem } from '@/components/accordion'

type AccordionItemData = {
  value: string
  title: string
  content: string
}

const items: readonly AccordionItemData[] = [
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
      'A full AI-generated demo video uses 3 credits. On Starter ($10/mo) that is roughly $3 per video. On Pro ($40/mo for 50 credits) it works out to about $2.40 per video. One-time top-ups start at $12 for 10 credits. Credits never expire.',
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
      'Free and Starter tier videos include a small "Powered by Pitch" watermark. The Pro and Enterprise plans remove it.',
  },
] as const

export const LandingFaqAccordion = () => {
  return (
    <Accordion className="landing-faq-accordion" type="multiple" defaultValue={[items[0].value]}>
      {items.map(item => (
        <AccordionItem key={item.value} value={item.value} className="landing-faq-accordion-item">
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
              data-slot="accordion-trigger"
              className="landing-faq-accordion-trigger group/accordion-trigger"
            >
              <span>{item.title}</span>
              <span className="landing-faq-accordion-icon relative shrink-0">
                <PlusIcon
                  className="absolute inset-0 group-aria-expanded/accordion-trigger:hidden"
                  style={{ width: 16, height: 16 }}
                />
                <MinusIcon
                  className="absolute inset-0 hidden group-aria-expanded/accordion-trigger:block"
                  style={{ width: 16, height: 16 }}
                />
              </span>
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>

          <AccordionContent>
            <p className="landing-faq-a">{item.content}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
