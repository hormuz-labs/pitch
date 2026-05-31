import { useEffect, useMemo, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import PaymentReceipt, { type PaymentReceiptStatus } from '../components/printer';

/**
 * /checkout/return — the page Dodo Payments redirects back to after checkout.
 *
 * Owns the confirmation flow: reads the identifiers Dodo appends to the URL,
 * polls /checkout/status until credits are granted (webhook-independent), then
 * renders the animated <PaymentReceipt>. Because it's a real route, the receipt
 * survives refreshes and can be deep-linked, unlike a transient overlay.
 */

type ReceiptState = {
  status: PaymentReceiptStatus;
  credits?: number;
  amount?: string;
  method?: string;
  balance?: number;
  date?: string;
  receiptId?: string;
  email?: string;
  label?: string;
};

type ReceiptPayload = {
  id?: string;
  amount: string;
  credits: number;
  method: string;
  balance: number;
  date: string;
  email?: string | null;
  name?: string | null;
  label?: string;
};

const LoadingState = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Confirming your payment"
    style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'linear-gradient(170deg,#f7faf9 0%,#fafafa 55%,#eef0ee 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, padding: '24px', textAlign: 'center',
      fontFamily: "'DM Sans','Helvetica Neue',sans-serif", userSelect: 'none',
    }}
  >
    <div className="animate-spin motion-reduce:animate-none" aria-hidden="true" style={{
      width: 44, height: 44, borderRadius: '50%',
      border: '3px solid rgba(0,0,0,0.08)', borderTopColor: '#059669',
    }} />
    <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>Confirming your payment…</div>
    <div style={{ fontSize: 13, color: '#9ca3af' }}>This usually takes a few seconds.</div>
  </div>
);

export const CheckoutReturnView = () => {
  const { getToken, isLoaded, userId } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  // Identifiers Dodo appends to the return URL. Determined synchronously so the
  // failure cases need no effect (and no setState-in-effect).
  const ids = useMemo(() => {
    const checkout = params.get('checkout');
    const statusParam = params.get('status');
    const failed = checkout === 'failed' || checkout === 'cancelled' ||
                   statusParam === 'failed' || statusParam === 'cancelled';
    const subscriptionId = params.get('subscription_id') || undefined;
    const paymentId      = params.get('payment_id') || undefined;
    const sessionId      = params.get('session_id') || undefined;
    const hasId = Boolean(subscriptionId || paymentId || sessionId);
    return { failed, subscriptionId, paymentId, sessionId, hasId };
  }, [params]);

  // A return with no confirmable identifier (or an explicit failure flag) is a
  // failure we can render immediately, without polling.
  const [receipt, setReceipt] = useState<ReceiptState | null>(
    ids.failed || !ids.hasId ? { status: 'failed' } : null,
  );

  useEffect(() => {
    if (receipt) return;            // already resolved (immediate failure)
    if (!isLoaded || !userId) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const POLL_INTERVAL_MS = 2000;

    const poll = async () => {
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setReceipt({ status: 'failed' });
        return;
      }
      attempts++;

      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const qs = new URLSearchParams();
        if (ids.subscriptionId) qs.set('subscription_id', ids.subscriptionId);
        else if (ids.paymentId)  qs.set('payment_id', ids.paymentId);
        else if (ids.sessionId)  qs.set('session_id', ids.sessionId);

        const result = await api.get<{
          status: string;
          credits_granted?: number;
          receipt?: ReceiptPayload;
        }>(`/checkout/status?${qs.toString()}`, token);

        if (cancelled) return;

        if (result.status === 'succeeded' || result.status === 'active') {
          const r = result.receipt;
          setReceipt({
            status: 'success',
            credits: r?.credits ?? result.credits_granted,
            amount: r?.amount,
            method: r?.method,
            balance: r?.balance,
            date: r?.date,
            receiptId: r?.id,
            email: r?.email ?? undefined,
            label: r?.label,
          });
          window.dispatchEvent(new Event('credits-changed'));
          return;
        }

        // Still pending — keep polling.
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        console.error('[Checkout Return] poll error:', err);
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [isLoaded, userId, receipt, getToken, ids]);

  if (!receipt) return <LoadingState />;

  return (
    <PaymentReceipt
      status={receipt.status}
      credits={receipt.credits ?? 50}
      amount={receipt.amount}
      method={receipt.method}
      balance={receipt.balance}
      date={receipt.date}
      receiptId={receipt.receiptId}
      email={receipt.email || user?.primaryEmailAddress?.emailAddress}
      label={receipt.label}
      payerName={user?.fullName || 'there'}
      onClose={() => navigate('/dashboard')}
      onRetry={() => navigate('/pricing')}
    />
  );
};
