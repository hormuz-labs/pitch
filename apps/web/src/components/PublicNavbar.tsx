import { SignInButton } from '@clerk/clerk-react';
import tabLogoB from '../assets/tabLogoB.svg';
import { Link } from 'react-router-dom';

export const PublicNavbar = () => {
  return (
    <>
      {/* Top Banner */}
      <div className="w-full bg-[#e6e6e6] text-[11px] sm:text-sm text-center py-2.5 px-2 font-medium flex items-center justify-center gap-1.5 sm:gap-2 border-b border-gray-200 shrink-0">
        Welcome Offer: Enjoy 80% off your first video generation <span className="text-gray-500">→</span>
      </div>

      {/* Navbar */}
      <nav className="max-w-7xl mx-auto w-full px-6 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* Pitch Logo */}
          <Link to="/" className="w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity">
            <img src={tabLogoB} alt="Pitch" className="w-full h-full object-contain" />
          </Link>
        </div>

        <div className="flex items-center gap-4 md:gap-6 text-sm font-medium text-gray-600 h-8">
          <Link to="/pricing" className="hidden md:block hover:text-gray-900 transition-colors">Enterprise</Link>
          <SignInButton mode="modal">
            <button className="flex items-center gap-2 px-3.5 h-full bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors shadow-sm cursor-pointer">
              Get Started <span className="hidden sm:flex items-center justify-center w-5 h-5 bg-gray-700 border border-gray-600 rounded text-[11px] text-gray-200 font-mono font-bold shadow-inner">G</span>
            </button>
          </SignInButton>
        </div>
      </nav>
    </>
  );
};
