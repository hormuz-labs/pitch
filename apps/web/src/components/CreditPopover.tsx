import * as Popover from '@radix-ui/react-popover';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import pCoinIcon from '../assets/pCoin.svg';
import { LoadingCoin } from './LoadingCoin';
import { API_URL } from '../config';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  starter:    { bg: '#eff6ff', text: '#1d4ed8' },
  pro:        { bg: '#f5f3ff', text: '#7c3aed' },
  enterprise: { bg: '#fffbeb', text: '#b45309' },
};

export const CreditPopover = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const isFirstLoad = useRef(true);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const token = await getToken({ skipCache: true });
        if (!token) return;
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCredits(data.balance);
          setPlan(data.activeSubscription?.planKey ?? null);
        }
      } catch {
        // silently fail — UI falls back to dash
      }
    };
    fetchBalance();

    window.addEventListener('credits-changed', fetchBalance);
    return () => window.removeEventListener('credits-changed', fetchBalance);
  }, [getToken]);

  // Spin the coin once whenever credits changes (skip very first load).
  // Respects prefers-reduced-motion — skip animation if user prefers it.
  useEffect(() => {
    if (credits === null) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    if (spinTimer.current) clearTimeout(spinTimer.current);
    // Two rAFs ensure the class removal is painted before re-adding.
    // setState here is intentional — coin spin is display-only feedback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpinning(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSpinning(true);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        spinTimer.current = setTimeout(() => setSpinning(false), 650);
      });
    });
  }, [credits]);

  const planLabel = plan ? (PLAN_LABELS[plan] ?? plan) : 'Free';
  const triggerLabel = credits !== null
    ? `${credits} credits available — ${planLabel} plan`
    : 'Credits loading';

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={triggerLabel}
          className={[
            'flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1',
            'border border-gray-200 text-gray-700 bg-white rounded-lg',
            'transition-colors duration-150',
            'hover:bg-gray-50 cursor-pointer font-semibold text-base md:text-lg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
            'motion-safe:active:scale-95',
          ].join(' ')}
          id="header-credits-btn"
        >
          {credits === null ? (
            <LoadingCoin className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" aria-hidden="true" />
          ) : (
            <img
              src={pCoinIcon}
              alt=""
              aria-hidden="true"
              width="22"
              height="22"
              className={`w-[18px] h-[18px] md:w-[22px] md:h-[22px]${spinning ? ' pcoin-spin' : ''}`}
            />
          )}
          {credits !== null && (
            <span className="tabular-nums">{credits}</span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label="Credits and plan details"
          className="w-72 sm:w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl z-50 font-sans"
          align="end"
          sideOffset={8}
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 block">
                  Credits
                </span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {credits ?? '—'} available
                </span>
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-gray-500">
              Each video generation costs 3 credits. Credits never expire.
            </p>

            <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <span className="text-xs text-gray-500 font-medium">Current plan</span>
              {plan ? (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: PLAN_COLORS[plan]?.bg ?? '#f3f4f6',
                    color: PLAN_COLORS[plan]?.text ?? '#374151',
                  }}
                >
                  {PLAN_LABELS[plan] ?? plan}
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                  Free
                </span>
              )}
            </div>

            <button
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                navigate('/pricing');
              }}
              className={[
                'w-full py-2.5 px-4 border border-gray-200 text-gray-900 text-sm font-medium rounded-xl',
                'transition-colors duration-150 cursor-pointer',
                'hover:bg-gray-50 active:bg-gray-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
              ].join(' ')}
            >
              {plan ? 'Manage Plan' : 'View Pricing Plans'}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
