import * as Popover from '@radix-ui/react-popover';
import { DollarSignIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import walletIcon from '../assets/wallet.svg';

export const CreditPopover = () => {
  const navigate = useNavigate();
  // Mock data for demo
  const credits = 50;
  const activePlan = "Pro Plan";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 border border-gray-200 text-gray-700 bg-white rounded-lg transition-all hover:bg-gray-50 active:scale-95 cursor-pointer font-medium text-sm shadow-sm"
          id="header-credits-btn"
        >
          <img src={walletIcon} alt="Wallet" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <div className="flex items-center -ml-1">
            <DollarSignIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-700 -mr-0.5" />
            <span>{credits}</span>
          </div>
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
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 block">Active Plan</span>
                <span className="text-lg font-bold text-gray-900">
                  {activePlan}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xl font-bold text-gray-900">
                  $10.00
                </span>
                <span className="text-[10px] font-medium text-gray-400">
                  per month
                </span>
              </div>
            </div>
            
            <p className="text-[13px] leading-relaxed text-gray-500">
              Specialized tools for creators and professionals. Includes 1080p exports, custom agents, and priority status.
            </p>

            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 mt-1">
              <span className="rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-bold tracking-tight text-white">
                Early Access
              </span>
              <span className="text-xs font-semibold text-gray-600">
                1 credit = $1
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
