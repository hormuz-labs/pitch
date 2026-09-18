import { A } from '@solidjs/router'
import {
  ArrowUpRight,
  ChevronUp,
  CircleHelp,
  Code2,
  Gift,
  LogOut,
  Megaphone,
  Moon,
  Settings,
  Sun,
  UserRound,
} from 'lucide-solid'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { PLANS } from '../../lib/plans'
import { useAuth, useClerk, useUser } from '../core/auth'
import { useTheme } from '../core/theme'
import { DiscordIcon } from '../public/brand'
import { DISCORD_INVITE_URL } from '../public/socials'
import type { SettingsSection } from './SettingsView'
import { StudioMenu } from './StudioMenu'

export function SidebarAccountMenu(props: { openSettings: (section?: SettingsSection) => void }) {
  const { userAccessor: user } = useUser()
  const clerk = useClerk()
  const theme = useTheme()
  const { getToken } = useAuth()
  const [credits, setCredits] = createSignal<number | null>(null)
  const [plan, setPlan] = createSignal('Free')
  const planName = (key?: string) =>
    PLANS.find(item => item.key === key || item.annual?.key === key)?.name ?? key ?? 'Free'
  const loadCredits = async () => {
    const token = await getToken()
    if (!token) return
    const response = await fetch(`${API_URL}/credits`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (response.ok) {
      const summary = await response.json()
      setCredits(summary.balance)
      setPlan(planName(summary.activeSubscription?.planKey))
    }
  }
  onMount(() => {
    void loadCredits()
    window.addEventListener('credits-changed', loadCredits)
    onCleanup(() => window.removeEventListener('credits-changed', loadCredits))
  })
  return (
    <div class="sidebar-footer-stack">
      <div class="sidebar-account-row">
        <StudioMenu
          label="Open account menu"
          side="top"
          width={224}
          triggerClass="sidebar-account-trigger"
          trigger={
            <>
              <span class="sidebar-account-avatar">
                <Show when={user()?.imageUrl} fallback={<UserRound size={17} />}>
                  {src => <img src={src()} alt="" />}
                </Show>
              </span>
              <span class="sidebar-account-name">{user()?.firstName || 'Your account'}</span>
              <span class="sidebar-account-plan">{plan()}</span>
              <ChevronUp class="sidebar-account-chevron" size={12} />
            </>
          }
        >
          <A role="menuitem" href="/pricing">
            <ArrowUpRight />
            <span>Upgrade plan</span>
          </A>
          <button
            role="menuitem"
            class="sidebar-menu-credits"
            onClick={() => props.openSettings('credits')}
          >
            <img src={pCoinIcon} alt="" />
            <span>Credits</span>
            <small>{credits()?.toLocaleString() ?? '—'}</small>
          </button>
          <button role="menuitem" onClick={() => props.openSettings('mcp')}>
            <Code2 />
            <span>API / MCP</span>
          </button>
          <A role="menuitem" href="/docs">
            <CircleHelp />
            <span>Docs &amp; help</span>
          </A>
          <A role="menuitem" href="/affiliate">
            <Gift />
            <span>Affiliates</span>
          </A>
          <a
            role="menuitem"
            class="sidebar-menu-discord"
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <DiscordIcon size={16} />
            <span>Join Discord</span>
            <ArrowUpRight class="sidebar-menu-external" />
          </a>
          <div class="menu-separator" />
          <button role="menuitem" onClick={() => props.openSettings('account')}>
            <Settings />
            <span>Settings</span>
          </button>
          <button role="menuitem" onClick={() => props.openSettings('rewards')}>
            <Gift />
            <span>Invite a friend</span>
          </button>
          <button
            role="menuitem"
            onClick={() => theme.setTheme(theme.theme() === 'dark' ? 'light' : 'dark')}
          >
            <Show when={theme.theme() === 'dark'} fallback={<Moon />}>
              <Sun />
            </Show>
            <span>{theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div class="menu-separator" />
          <A role="menuitem" href="/blog">
            <Megaphone />
            <span>What's new</span>
          </A>
          <div class="menu-separator" />
          <button
            role="menuitem"
            class="menu-danger"
            onClick={() => void clerk.signOut({ redirectUrl: '/' })}
          >
            <LogOut />
            <span>Sign out</span>
          </button>
        </StudioMenu>
      </div>
    </div>
  )
}
