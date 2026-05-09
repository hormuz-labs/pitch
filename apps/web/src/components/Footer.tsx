import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="w-full bg-[#111111] py-12 px-6 flex flex-col shrink-0">
      <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row justify-between items-center mb-8 md:mb-12">
        {/* PITCH Logo (Static, White) */}
        <div className="w-[180px] md:w-[220px] mb-6 md:mb-0 shrink-0">
          <svg
            width="100%"
            height="100%"
            viewBox="20 20 580 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* P */}
            <rect fill="#ffffff" x="30" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="30" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="30" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="30" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="30" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="63" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="63" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="96" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="96" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="96" y="84" width="28" height="18" rx="3" />

            {/* I */}
            <rect fill="#ffffff" x="146" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="146" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="179" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="179" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="179" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="179" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="179" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="212" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="212" y="130" width="28" height="18" rx="3" />

            {/* T */}
            <rect fill="#ffffff" x="262" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="295" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="295" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="295" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="295" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="295" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="328" y="38" width="28" height="18" rx="3" />

            {/* C */}
            <rect fill="#ffffff" x="378" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="378" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="378" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="378" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="378" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="411" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="411" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="444" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="444" y="130" width="28" height="18" rx="3" />

            {/* H */}
            <rect fill="#ffffff" x="494" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="494" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="494" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="494" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="494" y="130" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="527" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="560" y="38" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="560" y="61" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="560" y="84" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="560" y="107" width="28" height="18" rx="3" />
            <rect fill="#ffffff" x="560" y="130" width="28" height="18" rx="3" />
          </svg>
        </div>

        <div className="flex gap-6 text-sm font-medium text-white font-mono shrink-0 flex-wrap justify-center">
          <Link to="/about" className="hover:text-gray-300 transition-colors">About Us</Link>
          <a href="mailto:support@trypitch.co" className="hover:text-gray-300 transition-colors">Contact</a>
          <Link to="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
          <Link to="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</Link>
        </div>
      </div>
      
      <div className="w-full max-w-7xl mx-auto text-xs text-white/50 font-mono text-center">
        © {new Date().getFullYear()} Pitch. All rights reserved.
      </div>
    </footer>
  );
};