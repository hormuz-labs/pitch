import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { FaDiscord, FaInstagram, FaLinkedinIn, FaXTwitter, FaYoutube } from 'react-icons/fa6'
import { Link } from 'react-router-dom'
import { PitchWordmark } from './PitchWordmark'
// Same reasoning as LandingNav: the footer is shared chrome, so it carries its
// own stylesheet instead of depending on which view happened to import it.
import '../styles/landing-broadcast.css'

export interface Footer15Link {
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string; size?: number }>
}

export interface Footer15Column {
  title: string
  links: Footer15Link[]
}

export interface Footer15Props {
  /** Custom logo mark element */
  logoIcon?: ReactNode
  /** Short brand description / tagline */
  description?: string
  /** Navigation columns */
  columns?: Footer15Column[]
}

/** Shared by the footer's Social column and the landing navbar. */
export const SOCIALS: Footer15Link[] = [
  { label: 'Twitter', href: 'https://x.com/trypitchdotco', icon: FaXTwitter },
  { label: 'Instagram', href: 'https://www.instagram.com/trypitch.co', icon: FaInstagram },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    icon: FaLinkedinIn,
  },
  { label: 'Discord', href: 'https://discord.gg/a4SBW36mD', icon: FaDiscord },
  { label: 'YouTube', href: 'https://www.youtube.com/@trypitchdotco', icon: FaYoutube },
]

const defaultColumns: Footer15Column[] = [
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
  {
    title: 'Social',
    links: SOCIALS,
  },
]

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.05,
    },
  },
}

const navStagger: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.02,
    },
  },
}

const riseItem: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', duration: 0.6, bounce: 0 },
  },
}

const linkStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const linkItem: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.4, bounce: 0 },
  },
}

export function Footer15({
  logoIcon,
  description = 'The AI agent that turns your product URL into a cinematic pitch video in minutes.',
  columns = defaultColumns,
}: Footer15Props) {
  return (
    <footer className="w-full overflow-hidden rounded-t-4xl bg-black text-white font-sans antialiased sm:rounded-t-[2.5rem] md:rounded-t-[3rem]">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
        className="px-6 pt-6 pb-2 sm:px-10 sm:pt-8 lg:px-14 lg:pt-10 xl:px-20"
      >
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-center gap-8 text-center">
          <motion.div
            variants={riseItem}
            className="flex shrink-0 flex-col items-center text-center gap-5"
          >
            <div className="flex items-center justify-center w-full">
              <span className="shrink-0 text-white">
                {logoIcon ?? (
                  <PitchWordmark className="text-white" style={{ height: '40px', width: 'auto' }} />
                )}
              </span>
            </div>

            <p className="text-xs leading-relaxed font-light tracking-wide sm:whitespace-nowrap text-zinc-400">
              {description}
            </p>
          </motion.div>

          <motion.nav
            variants={navStagger}
            aria-label="Footer navigation"
            className="grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 gap-x-12 gap-y-8"
          >
            {columns.map(col => (
              <motion.div key={col.title} variants={riseItem} className="text-center sm:text-left">
                <h3 className="text-[10px] leading-none font-bold tracking-widest uppercase text-zinc-100">
                  {col.title}
                </h3>
                {col.title === 'Social' ? (
                  <div className="flex flex-row gap-4 justify-center sm:justify-start items-center mt-4 leading-none">
                    {col.links.map(link => {
                      const Icon = link.icon
                      return (
                        <motion.a
                          key={link.label}
                          href={link.href}
                          variants={linkItem}
                          whileHover={{ scale: 1.15 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center text-white hover:text-zinc-300 transition-colors duration-200"
                          aria-label={link.label}
                        >
                          {Icon && <Icon className="size-3.5" />}
                        </motion.a>
                      )
                    })}
                  </div>
                ) : (
                  <motion.ul variants={linkStagger} className="mt-3 flex flex-col gap-3">
                    {col.links.map(link => (
                      <motion.li key={link.label} variants={linkItem}>
                        {link.href.startsWith('/') && !link.href.startsWith('//') ? (
                          <Link
                            to={link.href}
                            className="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
                          >
                            {link.label}
                          </Link>
                        ) : (
                          <a
                            href={link.href}
                            className="inline-block text-xs leading-none font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:text-white"
                            target={link.href.startsWith('http') ? '_blank' : undefined}
                            rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                          >
                            {link.label}
                          </a>
                        )}
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </motion.div>
            ))}
          </motion.nav>
        </div>
      </motion.div>

      {/* Copyright row */}
      <div className="mt-6 border-t border-zinc-900 px-6 py-4 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto flex max-w-[1440px] items-center justify-center text-center text-xs text-zinc-500">
          <p className="text-[10px] leading-none font-light tracking-widest uppercase text-zinc-500">
            © {new Date().getFullYear()} Pitch. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

export const LandingFooter = () => {
  return (
    <div className="lb-chrome flex w-full items-end">
      <Footer15 />
    </div>
  )
}
