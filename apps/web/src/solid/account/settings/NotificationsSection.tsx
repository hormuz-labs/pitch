import { Bell } from 'lucide-solid'
import { createSignal, onMount } from 'solid-js'
import { api } from '../../../lib/api'
import { useAuth, useUser } from '../../core/auth'
import { Switch } from '../primitives'

interface Prefs {
  emailNotifications: boolean
  browserNotifications: boolean
}

export function NotificationsSection() {
  const { getToken } = useAuth()
  const { userAccessor: user } = useUser()
  const [prefs, setPrefs] = createSignal<Prefs>({
    emailNotifications: true,
    browserNotifications: false,
  })
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const profile = await api.get<Prefs>('/users/me', token)
      setPrefs({
        emailNotifications: profile.emailNotifications,
        browserNotifications: profile.browserNotifications,
      })
    } finally {
      setLoading(false)
    }
  })

  const update = async (patch: Partial<Prefs>) => {
    const previous = prefs()
    setPrefs({ ...previous, ...patch })
    try {
      const token = await getToken()
      if (!token) return
      await api.patch('/users/me', token, patch)
    } catch {
      setPrefs(previous)
    }
  }

  const toggleBrowser = async (checked: boolean) => {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    await update({ browserNotifications: checked })
  }

  return (
    <section class="settings-card">
      <div class="settings-card__title">
        <Bell size={15} />
        Notifications
      </div>
      <div class="settings-toggle-list">
        <div class="settings-toggle">
          <span>
            <strong>Email</strong>
            <small>Completion and account updates</small>
          </span>
          <Switch
            checked={prefs().emailNotifications}
            disabled={loading()}
            label="Email notifications"
            onChange={checked => void update({ emailNotifications: checked })}
          />
        </div>
        <div class="settings-toggle">
          <span>
            <strong>Browser</strong>
            <small>Desktop alerts when runs finish</small>
          </span>
          <Switch
            checked={prefs().browserNotifications}
            disabled={loading() || !user()}
            label="Browser notifications"
            onChange={checked => void toggleBrowser(checked)}
          />
        </div>
      </div>
    </section>
  )
}
