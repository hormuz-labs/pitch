import { PLANS } from '../../lib/plans'

const SITE = 'https://trypitch.co'

/**
 * Pitch as a product, with offers built from the same PLANS the pricing page
 * renders, so the prices Google shows cannot drift from the ones people pay.
 * Used on the homepage and /pricing.
 */
export const SOFTWARE_APPLICATION = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE}/#app`,
  name: 'Pitch',
  alternateName: 'TryPitch',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  description:
    'Pitch is an AI production studio you direct by chat. Turn a URL, file or idea into launch films, product demos, slide decks and edited videos.',
  url: `${SITE}/`,
  publisher: { '@id': `${SITE}/#org` },
  offers: PLANS.filter(plan => plan.priceUsd !== null).map(plan => ({
    '@type': 'Offer',
    name: plan.name,
    price: String(plan.priceUsd),
    priceCurrency: 'USD',
    description: plan.description,
    url: `${SITE}/pricing`,
    ...(plan.kind === 'subscription'
      ? {
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: String(plan.priceUsd),
            priceCurrency: 'USD',
            billingDuration: 'P1M',
            unitCode: 'MON',
          },
        }
      : {}),
  })),
}

export const PRICING_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [SOFTWARE_APPLICATION],
}

// Homepage schema.org graph: the how-to and FAQ describe the landing page's own
// content, so they must not ride along on every route via index.html.
export const LANDING_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    SOFTWARE_APPLICATION,
    {
      '@type': 'HowTo',
      name: 'How to generate a product demo video with Pitch',
      description:
        'Turn any website URL into a narrated, cinematic product demo video in three steps.',
      totalTime: 'PT10M',
      step: [
        {
          '@type': 'HowToStep',
          position: 1,
          name: 'Drop your URL',
          text: 'Point the agent at your live product. It opens a real browser, navigates flows, and waits for state.',
        },
        {
          '@type': 'HowToStep',
          position: 2,
          name: 'Direct the scene',
          text: 'Tell the agent in plain English what to show. Pick a voice, a theme, and the pace. Subtitles optional.',
        },
        {
          '@type': 'HowToStep',
          position: 3,
          name: 'Receive the cut',
          text: 'Get a narrated, scored, color-graded 1080p MP4. Edit captions, swap voices, or re-render any scene.',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How is Pitch different from Loom or other screen recorders?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Loom records you clicking around your product. Pitch is autonomous — an AI agent opens a real browser, navigates your product, writes the script, and produces a polished, narrated video with cinematic cursor motion and color grading. No recording, no editing.',
          },
        },
        {
          '@type': 'Question',
          name: 'How is Pitch different from Synthesia or HeyGen?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Synthesia and HeyGen generate talking-head avatars. Pitch shows your actual product — the AI agent navigates your real website and narrates what is happening on screen. It is a product demo, not an avatar presentation.',
          },
        },
        {
          '@type': 'Question',
          name: 'How long does it take to generate a video?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Most videos generate in minutes once you submit your URL and instructions. Longer or more complex flows can take a bit more, but you do not stay in the editor waiting on it.',
          },
        },
        {
          '@type': 'Question',
          name: 'What does a video cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A full AI-generated demo video uses about 120 credits. Flex ($20 for 800 credits) puts a credit at $0.025, so a video is around $3. On Pro ($45/mo for 2,500 credits) a credit is $0.018 and a video works out to about $2.16. You are billed for what the work actually costs, so a quick edit costs far less than a 4K render.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do I need to install anything or instrument my site?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. You just provide a public URL. The agent uses a real browser to navigate the live product, so there is nothing to install, no SDK to embed, and no code change required.',
          },
        },
        {
          '@type': 'Question',
          name: "Can I edit the video after it's generated?",
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. You can edit captions, swap voices, or re-render individual scenes without regenerating the entire video.',
          },
        },
        {
          '@type': 'Question',
          name: 'Will the video have a watermark?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Free exports include a small "Powered by Pitch" watermark. Every paid plan removes it.',
          },
        },
      ],
    },
  ],
}
