import * as Popover from '@radix-ui/react-popover';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import pCoinIcon from '../assets/pCoin.svg';
import { LoadingCoin } from './LoadingCoin';
import { API_URL } from '../config';

export const CreditPopover = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
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
        }
      } catch {
        // silently fail — UI falls back to dash
      }
    };
    fetchBalance();

    const handleCreditsChanged = () => {
      fetchBalance();
    };

    window.addEventListener('credits-changed', handleCreditsChanged);
    return () => window.removeEventListener('credits-changed', handleCreditsChanged);
  }, [getToken]);

  // Spin the coin once whenever credits changes (skip the very first load)
  useEffect(() => {
    if (credits === null) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    // Clear any previous timer so rapid updates don't stack
    if (spinTimer.current) clearTimeout(spinTimer.current);
    setSpinning(false);
    // Use a tiny delay so removing/re-adding the class always re-triggers the animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSpinning(true);
        spinTimer.current = setTimeout(() => setSpinning(false), 650);
      });
    });
  }, [credits]);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1 border border-gray-200 text-gray-700 bg-white rounded-lg transition-all hover:bg-gray-50 active:scale-95 cursor-pointer font-semibold text-base md:text-lg"
          id="header-credits-btn"
        >
          {credits === null ? (
            <LoadingCoin className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" />
          ) : (
            <img
              src={pCoinIcon}
              alt="Credits"
              className={`w-[18px] h-[18px] md:w-[22px] md:h-[22px]${spinning ? ' pcoin-spin' : ''}`}
            />
          )}
          {credits !== null && <span>{credits}</span>}
        </button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content 
          className="w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl z-50 font-sans"
          align="end"
          sideOffset={8}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 block">Credits</span>
                <span className="text-lg font-bold text-gray-900">
                  {credits ?? '—'} available
                </span>
              </div>
            </div>
            
            <p className="text-[13px] leading-relaxed text-gray-500">
              Each video generation costs 3 credits. Credits never expire.
            </p>

            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 mt-1">
              <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-bold tracking-tight text-white">
                Early Access
              </span>
            </div>
            
            <button 
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                navigate('/pricing');
              }}
              className="w-full mt-2 py-2.5 px-4 border border-gray-200 text-gray-900 hover:bg-gray-50 text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              View Pricing Plans
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
