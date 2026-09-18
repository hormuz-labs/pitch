import { useNavigate } from '@solidjs/router'
import { createMemo, createSignal, Show } from 'solid-js'
import { firstUrlInText, isAuthenticatedFor } from '../../lib/authOrigins'
import { UrlAuthSuggestion } from '../studio/UrlAuthSuggestion'

export function NewProjectUrlAuth(props: { prompt: string; authenticatedOrigins: string[] }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = createSignal<string | null>(null)
  const url = createMemo(() => firstUrlInText(props.prompt))
  const visible = createMemo(() => {
    const candidate = url()
    return (
      !!candidate &&
      candidate !== dismissed() &&
      !isAuthenticatedFor(candidate, props.authenticatedOrigins)
    )
  })

  return (
    <Show when={visible() && url()}>
      {candidate => (
        <UrlAuthSuggestion
          url={candidate()}
          onPublic={() => setDismissed(candidate())}
          onClose={() => setDismissed(candidate())}
          onAuthenticate={() => {
            sessionStorage.setItem('pitch:new-project-auth-draft', props.prompt)
            navigate(`/sessions?url=${encodeURIComponent(candidate())}&from=new`)
          }}
        />
      )}
    </Show>
  )
}
