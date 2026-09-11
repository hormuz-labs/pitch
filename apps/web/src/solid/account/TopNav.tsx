import { useLocation, useNavigate } from '@solidjs/router'
import { LogOut, Megaphone, Moon, Settings, Sun, UserRound } from 'lucide-solid'
import { Show } from 'solid-js'
import { useAppShell } from '../core/AppShell'
import { useAuth, useClerk, useUser } from '../core/auth'
import { useTheme } from '../core/theme'
import { DiscordIcon } from '../public/brand'
import { CreditPopover } from './credits'
import { Popover } from './primitives'
import type { SettingsSection } from './SettingsView'
import '../../styles/new-project.css'

export function TopNav(props: {
  openSettings?: (section: SettingsSection) => void
  class?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const clerk = useClerk()
  const auth = useAuth()
  const { userAccessor: user } = useUser()
  const theme = useTheme()
  const shell = useAppShell()

  const openSettings = (section: SettingsSection = 'account') => {
    if (props.openSettings) {
      props.openSettings(section)
    } else {
      shell.openSettings(section)
    }
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <nav
      class={`account-topnav new-project-topnav ${props.class ?? ''}`}
      aria-label="Main navigation"
    >
      <div class="new-project-topnav__links">
        <button
          type="button"
          class={isActive('/pricing') ? 'is-active' : ''}
          onClick={() => navigate('/pricing')}
        >
          Pricing
        </button>
        <button
          type="button"
          class={isActive('/affiliate') ? 'is-active' : ''}
          onClick={() => navigate('/affiliate')}
        >
          Affiliates
        </button>
        <button type="button" onClick={() => openSettings('mcp')}>
          API / MCP
        </button>
        <button type="button" onClick={() => navigate('/docs')}>
          Docs
        </button>
      </div>
      <div class="new-project-topnav__actions">
        <button
          type="button"
          onClick={() => navigate('/blog')}
          aria-label="Announcements"
          title="Announcements"
        >
          <Megaphone size={15} />
        </button>
        <button
          type="button"
          onClick={theme.toggleTheme}
          aria-label={`Switch to ${theme.theme() === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme.theme() === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme.theme() === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <Show when={auth.isSignedIn()}>
          <div class="new-project-topnav__credits">
            <CreditPopover />
          </div>
          <Popover
            label="Open account menu"
            trigger={
              <span class="new-project-topnav__avatar">
                <Show when={user()?.imageUrl} fallback={<UserRound size={17} />}>
                  {src => <img src={src()} alt="" />}
                </Show>
              </span>
            }
            class="new-project-profile-menu absolute right-0 top-full z-50 mt-2"
          >
            <button role="menuitem" onClick={() => openSettings('account')}>
              <Settings />
              Account settings
            </button>
            <a
              role="menuitem"
              href="https://discord.gg/a4SBW36mD"
              target="_blank"
              rel="noopener noreferrer"
            >
              <DiscordIcon />
              Join Discord
            </a>
            <button
              role="menuitem"
              class="new-project-profile-menu__danger"
              onClick={() => void clerk.signOut({ redirectUrl: '/' })}
            >
              <LogOut />
              Sign out
            </button>
          </Popover>
        </Show>
      </div>
    </nav>
  )
}
