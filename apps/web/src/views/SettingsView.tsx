import { useState } from 'react';
import { UserProfile, OrganizationProfile, useOrganization } from '@clerk/clerk-react';
import { DollarSignIcon, User, Building, CreditCard } from 'lucide-react';
import walletIcon from '../assets/wallet.svg';
import { OptionPicker } from '../components/OptionPicker';

const TAB_OPTIONS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building },
  { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
];

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'organization' | 'billing'>('profile');
  const { organization } = useOrganization();

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
              onClick={() => setActiveTab('organization')}
              className={`flex items-center shrink-0 gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'organization' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <Building className="w-4 h-4" />
              Organization
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
          {activeTab === 'organization' && (
             <div className="w-full h-full overflow-y-auto">
               {organization ? (
                 <OrganizationProfile 
                   routing="hash"
                   appearance={{
                     elements: {
                       rootBox: "w-full",
                       cardBox: "w-full shadow-sm rounded-2xl border border-gray-200",
                     }
                   }}
                 />
               ) : (
                 <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center mx-auto mt-8">
                   <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                       <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                       <circle cx="9" cy="7" r="4" />
                       <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                       <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                     </svg>
                   </div>
                   <h3 className="text-lg font-bold text-gray-900 mb-2">No Active Organization</h3>
                   <p className="text-gray-500 mb-6 max-w-sm mx-auto">You are not currently active in any organization. Switch to an organization using the switcher in the sidebar.</p>
                 </div>
               )}
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
                       <span>50</span>
                     </div>
                   </div>
                   <div className="text-sm text-gray-500 mt-4">1 credit = $1. Used for video generation.</div>
                 </div>

                 <div className="p-8 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                   <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Current Plan</div>
                   <div className="text-3xl font-bold text-gray-900 mb-2">Pro Plan</div>
                   <div className="text-sm font-medium text-gray-500">$10.00 / month</div>
                 </div>
               </div>

               <div className="border-t border-gray-100 pt-8">
                 <h4 className="font-bold text-gray-900 mb-6">Transaction History</h4>
                 <div className="text-sm text-gray-500 text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                   No recent transactions
                 </div>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
