import { useState, useEffect } from 'react';
import { UserProfile, useAuth } from '@clerk/clerk-react';
import { DollarSignIcon, User, CreditCard } from 'lucide-react';
import walletIcon from '../assets/wallet.svg';
import { OptionPicker } from '../components/OptionPicker';
import { API_URL } from '../config';

const TAB_OPTIONS = [
  { id: 'profile', label: 'My Profile', icon: User },
    { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
];

interface CreditTransaction {
  id: string;
  delta: number;
  reason: string;
  jobId?: string | null;
  createdAt: string;
}

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing'>('profile');
  const { getToken } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  useEffect(() => {
    if (activeTab !== 'billing') return;
    const fetchCredits = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance);
          setTransactions(data.transactions);
        }
      } catch {
        // silently fail
      }
    };
    fetchCredits();
  }, [activeTab, getToken]);

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#FAFAFA] absolute inset-0">
      {/* Sidebar for Settings */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-white p-4 md:p-6 flex flex-col justify-between shrink-0 shadow-sm z-10 relative md:pb-8">
        <div>
          <div className="hidden md:flex items-center justify-between mb-6 px-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Settings</h2>
          </div>
          
          {/* Mobile Tab Picker */}
          <div className="md:hidden px-2 mb-2">
            <OptionPicker 
              options={TAB_OPTIONS} 
              selectedId={activeTab} 
              onSelect={(id: string) => setActiveTab(id as any)} 
            />
          </div>

          {/* Desktop Tab List */}
          <div className="hidden md:flex flex-col gap-2">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center shrink-0 gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <User className="w-4 h-4" />
              My Profile
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`flex items-center shrink-0 gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'billing' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <CreditCard className="w-4 h-4" />
              Billing & Credits
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col">
        <div className="flex-1 w-full max-w-5xl mx-auto overflow-hidden flex">
          {activeTab === 'profile' && (
             <div className="w-full h-full overflow-y-auto">
               <UserProfile 
                 routing="hash"
                 appearance={{
                   elements: {
                     rootBox: "w-full",
                     cardBox: "w-full shadow-sm rounded-2xl border border-gray-200",
                     pageHeader: "hidden",
                   }
                 }} 
               />
             </div>
          )}
          {activeTab === 'billing' && (
             <div className="w-full h-full p-8 md:p-12 overflow-y-auto bg-white rounded-2xl shadow-sm border border-gray-200">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                 <div className="p-8 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                   <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Available Credits</div>
                   <div className="text-5xl font-black text-gray-900 flex items-center gap-3">
                     <img src={walletIcon} alt="Wallet" className="w-8 h-8 opacity-80" />
                     <div className="flex items-center">
                       <DollarSignIcon className="w-8 h-8 text-emerald-600 -mr-1" strokeWidth={3} />
                       <span>{balance ?? '—'}</span>
                     </div>
                   </div>
                   <div className="text-sm text-gray-500 mt-4">1 credit = $1. 3 credits used per video generation.</div>
                 </div>

                 <div className="p-8 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                   <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Current Plan</div>
                   <div className="text-3xl font-bold text-gray-900 mb-2">Early Access</div>
                   <div className="text-sm font-medium text-gray-500">Pay as you go — 3 credits per video</div>
                 </div>
               </div>

               <div className="border-t border-gray-100 pt-8">
                 <h4 className="font-bold text-gray-900 mb-6">Transaction History</h4>
                 {transactions.length === 0 ? (
                   <div className="text-sm text-gray-500 text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                     No recent transactions
                   </div>
                 ) : (
                   <div className="flex flex-col gap-2">
                     {transactions.map(tx => (
                       <div key={tx.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50 text-sm">
                         <div className="flex flex-col gap-0.5">
                           <span className="font-medium text-gray-800 capitalize">{tx.reason.replace(/_/g, ' ')}</span>
                           {tx.jobId && <span className="text-xs text-gray-400">Job: {tx.jobId}</span>}
                           <span className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleString()}</span>
                         </div>
                         <span className={`font-bold text-base ${tx.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                           {tx.delta > 0 ? '+' : ''}{tx.delta}
                         </span>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
