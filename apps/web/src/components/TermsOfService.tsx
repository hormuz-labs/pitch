import { useAuth } from '@clerk/react'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'

export const TermsOfService = () => {
  const { isSignedIn } = useAuth()

  return (
    <div className={`min-h-screen flex flex-col ${isSignedIn ? '' : 'bg-[#FDFDFD]'}`}>
      {!isSignedIn && <LandingNav />}
      <div className="max-w-3xl mx-auto px-6 pt-6 pb-16 text-gray-800 flex-1">
        <div className="relative inline-block mb-8">
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <svg
            className="absolute w-[110%] h-3 -bottom-2 -left-[5%] text-gray-800"
            viewBox="0 0 100 10"
            preserveAspectRatio="none"
          >
            <path
              d="M0 8 Q 50 0 100 8"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="text-sm text-gray-500 mb-8">
          Last Updated: {new Date().toLocaleDateString()}
        </p>

        <div className="space-y-6 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Pitch ("we," "our," or "us"), you agree to be bound by these
              Terms of Service. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Description of Service</h2>
            <p>
              Pitch provides automated video generation services, allowing users to create cinematic
              product demos, interactive walkthroughs, and tutorial videos from website URLs
              ("Services"). We reserve the right to modify or discontinue the Services at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. User Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years old to use the Services.</li>
              <li>
                You are responsible for maintaining the confidentiality of your account credentials.
              </li>
              <li>
                You agree not to use the Services for any unlawful purpose or in violation of any
                applicable laws.
              </li>
              <li>
                You must have the legal right to submit the URLs and content you provide to generate
                videos.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Intellectual Property</h2>
            <p>
              The generated videos are provided to you for your use. However, Pitch retains all
              rights to the underlying technology, software, design, and processes used to provide
              the Services. You grant us a limited license to process the URLs and content you
              submit solely to provide the Services to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Pitch shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, or any loss of profits or
              revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill,
              or other intangible losses resulting from your access to or use of or inability to
              access or use the Services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Modifications to Terms</h2>
            <p>
              We may modify these Terms at any time. We will provide notice of any material changes
              by updating the "Last Updated" date. Your continued use of the Services after the
              effective date of any changes constitutes your acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us at:{' '}
              <a href="mailto:support@trypitch.co" className="text-blue-600 hover:underline">
                support@trypitch.co
              </a>
              .
            </p>
          </section>
        </div>
      </div>
      {!isSignedIn && <LandingFooter />}
    </div>
  )
}
