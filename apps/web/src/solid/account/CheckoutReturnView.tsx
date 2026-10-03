import { useNavigate, useSearchParams } from '@solidjs/router'
import { XCircle } from 'lucide-solid'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { api } from '../../lib/api'
import { useAuth, useUser } from '../core/auth'
import { type PurchaseDetails, PurchaseReceipt } from './PurchaseReceipt'

interface CheckoutStatus {
  status: string
  credits_granted?: number
  receipt?: Omit<PurchaseDetails, 'receiptId'> & { id?: string }
}

export function CheckoutReturnView() {
  const { getToken, isLoaded, userId } = useAuth()
  const { userAccessor: user } = useUser()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const param = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : (value?.[0] ?? '')
  const failed =
    ['failed', 'cancelled'].includes(param(params.checkout)) ||
    ['failed', 'cancelled'].includes(param(params.status)) ||
    ['failed', 'cancelled'].includes(param(params.payment_status))
  const id: [string, string] | null = param(params.subscription_id)
    ? ['subscription_id', param(params.subscription_id)]
    : param(params.payment_id)
      ? ['payment_id', param(params.payment_id)]
      : param(params.session_id)
        ? ['session_id', param(params.session_id)]
        : null
  const [state, setState] = createSignal<'pending' | 'success' | 'failed' | 'unconfirmed'>(
    failed ? 'failed' : !id ? 'unconfirmed' : 'pending',
  )
  const [receipt, setReceipt] = createSignal<PurchaseDetails>({})
  const [retry, setRetry] = createSignal(0)

  // Auth may hydrate after mount; start polling when it is ready and cancel
  // in-flight responses when this effect is disposed or the user navigates away.
  createEffect(() => {
    retry()
    if (!isLoaded() || !userId() || failed || !id) return
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const poll = async () => {
      if (cancelled) return
      if (attempts++ >= 15) {
        setState('unconfirmed')
        return
      }
      try {
        const token = await getToken()
        if (cancelled) return
        if (token) {
          const result = await api.get<CheckoutStatus>(
            `/checkout/status?${id[0]}=${encodeURIComponent(id[1])}`,
            token,
          )
          if (cancelled) return
          if (result.status === 'succeeded') {
            setReceipt({
              ...result.receipt,
              credits: result.receipt?.credits ?? result.credits_granted,
              receiptId: result.receipt?.id,
            })
            setState('success')
            window.dispatchEvent(new Event('credits-changed'))
            return
          }
          if (['failed', 'cancelled'].includes(result.status)) {
            setState('failed')
            return
          }
        }
      } catch {
        // The payment or webhook may still be settling; retry before showing a pending result.
      }
      if (!cancelled) timer = window.setTimeout(poll, 2000)
    }
    void poll()
    onCleanup(() => {
      cancelled = true
      clearTimeout(timer)
    })
  })

  return (
    <Show
      when={state() === 'success'}
      fallback={
        <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
          <Show
            when={state() !== 'pending'}
            fallback={
              <div role="status" class="flex flex-col items-center gap-4">
                <span class="h-11 w-11 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600" />
                <b>Confirming your payment...</b>
              </div>
            }
          >
            <article class="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-2xl">
              <XCircle class="mx-auto text-gray-500" size={52} />
              <h1 class="mt-4 text-2xl font-bold">
                {state() === 'failed' ? 'Payment not completed' : 'Payment not confirmed yet'}
              </h1>
              <p class="mt-2 text-sm text-gray-500">
                {state() === 'failed'
                  ? 'This checkout was cancelled or the payment failed.'
                  : 'Confirmation is taking longer than expected. If you were charged, your credits will be added when payment is confirmed.'}
              </p>
              <Show when={state() === 'unconfirmed' && id}>
                <button
                  class="mt-5 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
                  onClick={() => {
                    setState('pending')
                    setRetry(value => value + 1)
                  }}
                >
                  Check again
                </button>
              </Show>
              <button
                class="mt-5 block w-full text-sm font-semibold"
                onClick={() => navigate(state() === 'failed' ? '/pricing' : '/new')}
              >
                {state() === 'failed' ? 'Back to pricing' : 'Continue to studio'}
              </button>
            </article>
          </Show>
        </div>
      }
    >
      <PurchaseReceipt
        receipt={receipt()}
        customerName={
          user()?.fullName || user()?.primaryEmailAddress?.emailAddress || 'Your account'
        }
        onContinue={() => navigate('/new')}
      />
    </Show>
  )
}
