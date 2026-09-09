import { useNavigate, useSearchParams } from '@solidjs/router'
import { CheckCircle, XCircle } from 'lucide-solid'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { api } from '../../lib/api'
import { useAuth, useUser } from '../core/auth'

interface Receipt {
  status: 'success' | 'failed'
  credits?: number
  amount?: string
  method?: string
  balance?: number
  date?: string
  receiptId?: string
  email?: string
  label?: string
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
    ['failed', 'cancelled'].includes(param(params.status))
  const id: [string, string] | null = param(params.subscription_id)
    ? ['subscription_id', param(params.subscription_id)]
    : param(params.payment_id)
      ? ['payment_id', param(params.payment_id)]
      : param(params.session_id)
        ? ['session_id', param(params.session_id)]
        : null
  const [receipt, setReceipt] = createSignal<Receipt | null>(
    failed || !id ? { status: 'failed' } : null,
  )
  onMount(() => {
    let cancelled = false
    let timer: number
    let attempts = 0
    const poll = async () => {
      if (cancelled || receipt()) return
      if (attempts++ >= 10) {
        setReceipt({ status: 'failed' })
        return
      }
      try {
        const token = await getToken()
        if (!token) return
        const result = await api.get<any>(
          `/checkout/status?${id![0]}=${encodeURIComponent(id![1]!)}`,
          token,
        )
        if (['succeeded', 'active'].includes(result.status)) {
          const value = result.receipt
          setReceipt({
            status: 'success',
            credits: value?.credits ?? result.credits_granted,
            amount: value?.amount,
            method: value?.method,
            balance: value?.balance,
            date: value?.date,
            receiptId: value?.id,
            email: value?.email,
            label: value?.label,
          })
          window.dispatchEvent(new Event('credits-changed'))
          return
        }
      } catch {
        /* retry webhook lag */
      }
      timer = window.setTimeout(poll, 2000)
    }
    if (isLoaded() && userId()) void poll()
    onCleanup(() => {
      cancelled = true
      clearTimeout(timer)
    })
  })
  return (
    <Show
      when={receipt()}
      fallback={
        <div
          role="status"
          class="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-4 bg-gray-50"
        >
          <span class="h-11 w-11 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600" />
          <b>Confirming your payment...</b>
        </div>
      }
    >
      {value => (
        <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
          <article class="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-2xl">
            <Show
              when={value().status === 'success'}
              fallback={<XCircle class="mx-auto text-red-500" size={52} />}
            >
              <CheckCircle class="mx-auto text-emerald-600" size={52} />
            </Show>
            <h1 class="mt-4 text-2xl font-bold">
              {value().status === 'success' ? 'Payment confirmed' : 'Payment not completed'}
            </h1>
            <p class="mt-2 text-sm text-gray-500">
              {value().status === 'success'
                ? `${value().credits ?? 50} credits were added for ${user()?.fullName || user()?.primaryEmailAddress?.emailAddress || 'your account'}.`
                : 'We could not confirm this checkout.'}
            </p>
            <Show when={value().status === 'success'}>
              <dl class="my-6 rounded-xl bg-gray-50 p-4 text-left text-sm">
                <div class="flex justify-between">
                  <dt>Amount</dt>
                  <dd>{value().amount ?? '—'}</dd>
                </div>
                <div class="mt-2 flex justify-between">
                  <dt>Balance</dt>
                  <dd>{value().balance ?? '—'} credits</dd>
                </div>
                <div class="mt-2 flex justify-between">
                  <dt>Receipt</dt>
                  <dd>{value().receiptId ?? '—'}</dd>
                </div>
              </dl>
            </Show>
            <button
              class="mt-5 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white"
              onClick={() => navigate(value().status === 'success' ? '/new' : '/pricing')}
            >
              {value().status === 'success' ? 'Start creating' : 'Try again'}
            </button>
          </article>
        </div>
      )}
    </Show>
  )
}
