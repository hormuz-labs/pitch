import { Trash2 } from 'lucide-solid'
import { createSignal, Show } from 'solid-js'
import { api, isApiError } from '../../../lib/api'
import { useAuth, useUser } from '../../core/auth'

export function AccountSection(props: { onClose: () => void }) {
  const { getToken, signOut } = useAuth()
  const { userAccessor: user } = useUser()
  const [showAdvanced, setShowAdvanced] = createSignal(false)
  const [confirming, setConfirming] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)
  const [error, setError] = createSignal('')

  const deleteAccount = async () => {
    setDeleting(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) return
      await api.delete('/users/me', token)
      props.onClose()
      await signOut()
      window.location.assign('/')
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not delete your account. Try again.')
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <section class="settings-card">
      <h4>Account</h4>
      <p>
        Signed in as <strong>{user()?.primaryEmailAddress?.emailAddress}</strong>
      </p>

      <div class="settings-danger-zone">
        <div class="settings-danger-zone__header">
          <div>
            <strong>Advanced account actions</strong>
            <small>Account deletion is permanent and requires additional confirmation.</small>
          </div>
          <button
            type="button"
            class="settings-secondary"
            onClick={() => setShowAdvanced(value => !value)}
          >
            {showAdvanced() ? 'Hide' : 'Show'}
          </button>
        </div>

        <Show when={showAdvanced()}>
          <div class="settings-danger-card">
            <div>
              <strong>Delete account</strong>
              <small>
                You will lose access to the platform, any active subscription will be cancelled, and
                any unused credits will be lost.
              </small>
            </div>
            <Show
              when={confirming()}
              fallback={
                <button
                  type="button"
                  class="settings-danger-button"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 size={14} />
                  Delete account
                </button>
              }
            >
              <div class="settings-danger-confirm">
                <span>Are you sure? This cannot be undone.</span>
                <button
                  type="button"
                  class="settings-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="settings-danger-button"
                  disabled={deleting()}
                  onClick={() => void deleteAccount()}
                >
                  {deleting() ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            </Show>
          </div>
        </Show>
        <Show when={error()}>
          <p class="settings-field__error">{error()}</p>
        </Show>
      </div>
    </section>
  )
}
