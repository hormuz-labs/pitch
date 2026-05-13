import { LandingNav } from './LandingNav';
import { LandingFooter } from './LandingFooter';
import { useAuth } from '@clerk/clerk-react';

export const PrivacyPolicy = () => {
  const { isSignedIn } = useAuth();

  return (
    <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
      {!isSignedIn && <LandingNav />}
      <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800 flex-1">
        <div className="relative inline-block mb-8">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <svg className="absolute w-[110%] h-3 -bottom-2 -left-[5%] text-gray-800" viewBox="0 0 100 10" preserveAspectRatio="none">
            <path d="M0 8 Q 50 0 100 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        
        <p className="text-sm text-gray-500 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Introduction</h2>
            <p>
              Welcome to Pitch ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website (trypitch.co), use our application, or utilize our automated video generation services (collectively, the "Services").
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Personal Information:</strong> When you register for an account, we may collect personal details such as your name, email address, and billing information.</li>
              <li><strong>Service Data:</strong> To provide our Services, we collect the website URLs, scripts, and specific instructions you provide to generate product demos and walkthrough videos.</li>
              <li><strong>Usage Data:</strong> We automatically collect information about how you interact with our platform, including IP addresses, browser types, log data, and performance metrics.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. How We Use Your Information</h2>
            <p className="mb-2">We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>To autonomously generate and deliver the video content, screencasts, and tutorials you request.</li>
              <li>To maintain, improve, and personalize the Services.</li>
              <li>To process transactions and manage your account.</li>
              <li>To communicate with you regarding updates, support, and promotional offers (which you can opt out of at any time).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Data Sharing and Disclosure</h2>
            <p className="mb-2">We do not sell your personal information. We may share your information only in the following circumstances:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Service Providers:</strong> We may employ third-party companies (such as payment processors, cloud hosting, and analytics providers) to facilitate our Services. These third parties have access to your data only to perform specific tasks on our behalf and are obligated not to disclose or use it for other purposes.</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal information and the proprietary URLs/scripts you submit to our platform. However, please be aware that no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Your Rights</h2>
            <p>
              Depending on your location, you may have the right to access, correct, update, or delete your personal information. If you wish to exercise these rights or manage your account data, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Changes to This Privacy Policy</h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Contact Us</h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at: <a href="mailto:support@trypitch.co" className="text-blue-600 hover:underline">support@trypitch.co</a>.
            </p>
          </section>
        </div>
      </div>
      {!isSignedIn && <LandingFooter />}
    </div>
  );
};