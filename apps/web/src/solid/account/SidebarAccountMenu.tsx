import { A } from '@solidjs/router'
import {
  ArrowUpRight,
  ChevronUp,
  Gift,
  LogOut,
  Megaphone,
  Moon,
  Settings,
  Sun,
  UserRound,
} from 'lucide-solid'
import { Show } from 'solid-js'
import { useClerk, useUser } from '../core/auth'
import { useTheme } from '../core/theme'
import { DiscordIcon } from '../public/brand'
import { SettingsCreditButton } from './credits'
import type { SettingsSection } from './SettingsView'
import { StudioMenu } from './StudioMenu'

export function SidebarAccountMenu(props: { openSettings: (section?: SettingsSection) => void }) {
  const { userAccessor: user } = useUser()
  const clerk = useClerk()
  const theme = useTheme()
  return (
    <div class="sidebar-footer-stack">
      <a
        class="sidebar-community-link"
        href="https://discord.gg/a4SBW36mD"
        target="_blank"
        rel="noopener noreferrer"
      >
        <DiscordIcon size={17} />
        <span>Join Discord</span>
        <ArrowUpRight size={13} />
      </a>
      <div class="sidebar-theme-switch" role="group" aria-label="Color theme">
        <button
          type="button"
          aria-label="Switch to light theme"
          aria-pressed={theme.theme() === 'light'}
          onClick={() => theme.setTheme('light')}
        >
          <Sun size={14} />
          <span>Light</span>
        </button>
        <button
          type="button"
          aria-label="Switch to dark theme"
          aria-pressed={theme.theme() === 'dark'}
          onClick={() => theme.setTheme('dark')}
        >
          <Moon size={14} />
          <span>Dark</span>
        </button>
      </div>
      <nav class="sidebar-resource-links" aria-label="Resources">
        <A href="/docs">Docs</A>
        <A href="/pricing">Pricing</A>
        <A href="/affiliate">Affiliates</A>
      </nav>
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
              <span>{user()?.firstName || 'Your account'}</span>
              <ChevronUp class="sidebar-account-chevron" size={12} />
            </>
          }
        >
          <button role="menuitem" onClick={() => props.openSettings('account')}>
            <Settings />
            <span>Settings</span>
          </button>
          <button role="menuitem" onClick={() => props.openSettings('rewards')}>
            <Gift />
            <span>Invite a friend</span>
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
        <div class="sidebar-account-balance">
          <SettingsCreditButton showLabel onClick={() => props.openSettings('credits')} />
        </div>
      </div>
    </div>
  )
}
