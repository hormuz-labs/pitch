import { LandingNav } from './LandingNav';
import { LandingFooter } from './LandingFooter';
import { useAuth } from '@clerk/clerk-react';

export const AboutUs = () => {
  const { isSignedIn } = useAuth();

  return (
    <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
      {!isSignedIn && <LandingNav />}
      <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800 flex-1">
        <div className="relative inline-block mb-8">
          <h1 className="text-3xl font-bold">About Us</h1>
          <svg className="absolute w-[110%] h-3 -bottom-2 -left-[5%] text-gray-800" viewBox="0 0 100 10" preserveAspectRatio="none">
            <path d="M0 8 Q 50 0 100 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Our Mission</h2>
          <p className="text-gray-600 leading-relaxed">
            At Pitch, we believe that demonstrating your product's true value should be effortless and beautifully executed. We are an innovative technology company dedicated to transforming how businesses showcase their software to the world.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">What We Do</h2>
          <p className="text-gray-600 leading-relaxed">
            Our platform leverages advanced automation to instantly turn any website URL into a cinematic, highly professional product demo, interactive walkthrough, or tutorial video. We understand that traditional screencasting and video production can be time-consuming, expensive, and difficult to scale. By removing these complexities, we empower product, marketing, and sales teams to effortlessly generate compelling "show me how" content that drives user engagement and accelerates growth.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Our Vision</h2>
          <p className="text-gray-600 leading-relaxed">
            We envision a world where every piece of software can be understood instantly through high-quality visual storytelling. Whether you are launching a new feature, onboarding users, or creating marketing assets, Pitch provides the autonomous engine to produce polished, ready-to-publish videos in a fraction of the time.
          </p>
        </section>
      </div>
      {!isSignedIn && <LandingFooter />}
    </div>
  );
};