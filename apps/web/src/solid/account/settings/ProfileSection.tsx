import { Check, Upload } from 'lucide-solid'
import { createSignal, onMount, Show } from 'solid-js'
import { api, isApiError } from '../../../lib/api'
import { useAuth, useUser } from '../../core/auth'

export function ProfileSection() {
  const { getToken } = useAuth()
  const { userAccessor: user } = useUser()
  const [photoFile, setPhotoFile] = createSignal<File | null>(null)
  const [savingPhoto, setSavingPhoto] = createSignal(false)
  const [photoSaved, setPhotoSaved] = createSignal(false)
  // Our own public handle — a distinct field from Clerk's own `user.username`
  // (a sign-in identifier we don't use), so it's loaded from our API.
  const [username, setUsername] = createSignal('')
  const [savingUsername, setSavingUsername] = createSignal(false)
  const [usernameError, setUsernameError] = createSignal('')
  const [usernameSaved, setUsernameSaved] = createSignal(false)

  onMount(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const profile = await api.get<{ username: string | null }>('/users/me', token)
      setUsername(profile.username ?? '')
    } catch {
      // Non-blocking: the field just starts empty if this fails.
    }
  })

  let fileInput: HTMLInputElement | undefined

  const choosePhoto = () => fileInput?.click()

  const savePhoto = async () => {
    const file = photoFile()
    const current = user()
    if (!file || !current) return
    setSavingPhoto(true)
    try {
      await current.setProfileImage({ file })
      setPhotoFile(null)
      setPhotoSaved(true)
      window.setTimeout(() => setPhotoSaved(false), 1800)
    } finally {
      setSavingPhoto(false)
    }
  }

  const saveUsername = async () => {
    setUsernameError('')
    setSavingUsername(true)
    try {
      const token = await getToken()
      if (!token) return
      await api.patch('/users/me', token, { username: username().trim() })
      setUsernameSaved(true)
      window.setTimeout(() => setUsernameSaved(false), 1800)
    } catch (err) {
      setUsernameError(isApiError(err) ? err.message : 'Could not save that username. Try again.')
    } finally {
      setSavingUsername(false)
    }
  }

  return (
    <section class="settings-card">
      <h4>Profile</h4>

      <div class="settings-avatar-row">
        <Show
          when={photoFile()}
          fallback={
            <Show
              when={user()?.imageUrl}
              fallback={
                <span class="settings-avatar settings-avatar--placeholder">
                  {(
                    user()?.firstName?.[0] ??
                    user()?.primaryEmailAddress?.emailAddress?.[0] ??
                    'P'
                  ).toUpperCase()}
                </span>
              }
            >
              {src => <img class="settings-avatar" src={src()} alt="" />}
            </Show>
          }
        >
          {file => <img class="settings-avatar" src={URL.createObjectURL(file())} alt="" />}
        </Show>
        <div>
          <span class="settings-field__label">Profile photo</span>
          <div class="settings-avatar-row__actions">
            <button type="button" class="settings-secondary" onClick={choosePhoto}>
              <Upload size={14} />
              Choose image
            </button>
            <button
              type="button"
              class="settings-secondary"
              disabled={!photoFile() || savingPhoto()}
              onClick={() => void savePhoto()}
            >
              <Show when={photoSaved()} fallback="Save photo">
                <Check size={14} />
                Saved
              </Show>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            class="sr-only"
            onChange={event => setPhotoFile(event.currentTarget.files?.[0] ?? null)}
          />
          <small>JPEG, PNG, WebP, GIF, or AVIF up to 5 MB.</small>
        </div>
      </div>

      <div class="settings-field">
        <span class="settings-field__label">Email</span>
        <strong>{user()?.primaryEmailAddress?.emailAddress}</strong>
        <small>The address you use to sign in and receive account updates.</small>
      </div>

      <div class="settings-field">
        <span class="settings-field__label">Username</span>
        <div class="settings-username-row">
          <div class="settings-username-input">
            <span>@</span>
            <input
              type="text"
              value={username()}
              placeholder="your-handle"
              maxLength={20}
              onInput={event => setUsername(event.currentTarget.value)}
            />
          </div>
          <button
            type="button"
            class="settings-secondary"
            disabled={savingUsername() || !username().trim()}
            onClick={() => void saveUsername()}
          >
            <Show when={usernameSaved()} fallback="Save username">
              <Check size={14} />
              Saved
            </Show>
          </button>
        </div>
        <Show when={usernameError()} fallback={<small>Your public handle on Pitch.</small>}>
          <small class="settings-field__error">{usernameError()}</small>
        </Show>
      </div>
    </section>
  )
}
