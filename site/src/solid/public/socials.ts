import { Instagram, Linkedin, Youtube } from 'lucide-solid'
import { DiscordIcon, GithubIcon, XIcon } from './brand'

export const DISCORD_INVITE_URL = 'https://discord.gg/a4SBW36mD'
export const GITHUB_SOCIAL = {
  label: 'GitHub',
  href: 'https://github.com/hormuz-labs/pitch',
  icon: GithubIcon,
}

export const SOCIALS = [
  { label: 'Twitter', href: 'https://x.com/trypitchdotco', icon: XIcon },
  { label: 'Instagram', href: 'https://www.instagram.com/trypitch.co', icon: Instagram },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/trypitchdotco/',
    icon: Linkedin,
  },
  { label: 'Discord', href: DISCORD_INVITE_URL, icon: DiscordIcon },
  { label: 'YouTube', href: 'https://www.youtube.com/@trypitchdotco', icon: Youtube },
]
