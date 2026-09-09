import { A } from '@solidjs/router'
import { Instagram, Linkedin, Youtube } from 'lucide-solid'
import { For, type JSX, onMount } from 'solid-js'
import { PitchWordmark } from './brand'
import '../../styles/landing-broadcast.css'

export interface Footer15Link {
  label: string
  href: string
  icon?: (props: { class?: string; size?: number }) => JSX.Element
}
export interface Footer15Column {
  title: string
  links: Footer15Link[]
}
export interface Footer15Props {
  logoIcon?: JSX.Element
  description?: string
  columns?: Footer15Column[]
}

const brandIcon = (path: string) => (props: { class?: string; size?: number }) => (
  <svg
    class={props.class}
    width={props.size ?? 16}
    height={props.size ?? 16}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
)

const XIcon = brandIcon(
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z',
)
const DiscordIcon = brandIcon(
  'M19.54 5.34A16.3 16.3 0 0 0 15.44 4l-.5 1.02a15.4 15.4 0 0 0-5.88 0L8.54 4a16.5 16.5 0 0 0-4.1 1.35C1.85 9.2 1.15 12.95 1.5 16.65a16.7 16.7 0 0 0 5.03 2.55l1.23-1.68c-.68-.25-1.33-.57-1.94-.95l.48-.37c3.74 1.73 7.8 1.73 11.5 0l.48.37c-.62.38-1.27.7-1.95.95l1.23 1.68a16.6 16.6 0 0 0 5.03-2.55c.42-4.3-.72-8.02-3.05-11.31ZM8.68 14.37c-1.12 0-2.04-1.03-2.04-2.3 0-1.26.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Zm6.64 0c-1.12 0-2.04-1.03-2.04-2.3 0-1.26.9-2.3 2.04-2.3 1.15 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Z',
)

export const SOCIALS: Footer15Link[] = [
  { label: 'Twitter', href: 'https://x.com/trypitchdotco', icon: XIcon },
  { label: 'Instagram', href: 'https://www.instagram.com/trypitch.co', icon: Instagram },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    icon: Linkedin,
  },
  { label: 'Discord', href: 'https://discord.gg/a4SBW36mD', icon: DiscordIcon },
  { label: 'YouTube', href: 'https://www.youtube.com/@trypitchdotco', icon: Youtube },
]
const columns: Footer15Column[] = [
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: 'mailto:support@trypitch.co' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Docs', href: '/docs' },
      { label: 'API Reference', href: '/docs/api' },
    ],
  },
  { title: 'Social', links: SOCIALS },
]
const InternalOrExternal = (props: { link: Footer15Link }) =>
  props.link.href.startsWith('/') ? (
    <A
      href={props.link.href}
      class="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
    >
      {props.link.label}
    </A>
  ) : (
    <a
      href={props.link.href}
      target={props.link.href.startsWith('http') ? '_blank' : undefined}
      rel={props.link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
      class="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
    >
      {props.link.label}
    </a>
  )

export function Footer15(props: Footer15Props) {
  let root!: HTMLElement
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        ;[...root.querySelectorAll<HTMLElement>('[data-footer-rise]')].forEach((el, i) =>
          el.animate(
            [
              { opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' },
              { opacity: 1, transform: 'none', filter: 'blur(0)' },
            ],
            { duration: 600, delay: i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
          ),
        )
        io.disconnect()
      },
      { threshold: 0.1 },
    )
    io.observe(root)
  })
  const cols = () => props.columns ?? columns
  return (
    <footer
      ref={root}
      class="w-full overflow-hidden rounded-t-4xl bg-black text-white font-sans antialiased sm:rounded-t-[2.5rem] md:rounded-t-[3rem]"
    >
      <div class="px-6 pt-6 pb-2 sm:px-10 sm:pt-8 lg:px-14 lg:pt-10 xl:px-20">
        <div class="mx-auto flex max-w-[1440px] flex-col items-center justify-center gap-8 text-center">
          <div data-footer-rise class="flex shrink-0 flex-col items-center text-center gap-5">
            <div class="flex items-center justify-center w-full">
              <span class="shrink-0 text-white">
                {props.logoIcon ?? (
                  <PitchWordmark class="text-white" style={{ height: '40px', width: 'auto' }} />
                )}
              </span>
            </div>
            <p class="text-xs leading-relaxed font-light tracking-wide sm:whitespace-nowrap text-zinc-400">
              {props.description ??
                'The AI agent that turns your product URL into a cinematic pitch video in minutes.'}
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            class="grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 gap-x-12 gap-y-8"
          >
            <For each={cols()}>
              {column => (
                <div data-footer-rise class="text-center sm:text-left">
                  <h3 class="text-[10px] leading-none font-bold tracking-widest uppercase text-zinc-100">
                    {column.title}
                  </h3>
                  {column.title === 'Social' ? (
                    <div class="flex flex-row gap-4 justify-center sm:justify-start items-center mt-4 leading-none">
                      <For each={column.links}>
                        {link => (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center justify-center text-white hover:text-zinc-300 transition-colors duration-200"
                            aria-label={link.label}
                          >
                            {link.icon?.({ class: 'size-3.5', size: 14 })}
                          </a>
                        )}
                      </For>
                    </div>
                  ) : (
                    <ul class="mt-3 flex flex-col gap-3">
                      <For each={column.links}>
                        {link => (
                          <li>
                            <InternalOrExternal link={link} />
                          </li>
                        )}
                      </For>
                    </ul>
                  )}
                </div>
              )}
            </For>
          </nav>
        </div>
      </div>
      <div class="mt-6 border-t border-zinc-900 px-6 py-4 sm:px-10 lg:px-14 xl:px-20">
        <div class="mx-auto flex max-w-[1440px] items-center justify-center text-center text-xs text-zinc-500">
          <p class="text-[10px] leading-none font-light tracking-widest uppercase text-zinc-500">
            © {new Date().getFullYear()} Pitch. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
export const LandingFooter = () => (
  <div class="lb-chrome flex w-full items-end">
    <Footer15 />
  </div>
)
