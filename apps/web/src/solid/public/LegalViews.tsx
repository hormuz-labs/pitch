import { type JSX, Show } from 'solid-js'
import { useAuth } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'

const Page = (props: {
  title: string
  description: string
  path: string
  children: JSX.Element
}) => {
  const auth = useAuth(),
    signed = () => (typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn)
  return (
    <div class={`min-h-screen flex flex-col ${signed() ? '' : 'lb-root'}`}>
      <Seo title={`${props.title} — Pitch`} description={props.description} path={props.path} />
      <Show when={!signed()}>
        <LandingNav />
      </Show>
      <div class="max-w-3xl mx-auto px-6 pt-6 pb-16 text-gray-800 flex-1">
        <div class="relative inline-block mb-8">
          <h1 class="text-3xl font-bold">{props.title}</h1>
        </div>
        {props.children}
      </div>
      <Show when={!signed()}>
        <LandingFooter />
      </Show>
    </div>
  )
}
export const AboutUs = () => (
  <Page
    title="About Us"
    description="Pitch is building the autonomous way to make product demo videos."
    path="/about"
  >
    <section class="mb-8">
      <h2 class="text-xl font-semibold mb-4">Our Mission</h2>
      <p class="text-gray-600 leading-relaxed">
        At Pitch, we believe that demonstrating your product's true value should be effortless and
        beautifully executed. We are dedicated to transforming how businesses showcase their
        software.
      </p>
      <h2 class="text-xl font-semibold my-4">What We Do</h2>
      <p class="text-gray-600 leading-relaxed">
        Our platform uses advanced automation to turn any website URL into a cinematic product demo,
        interactive walkthrough, or tutorial video.
      </p>
      <h2 class="text-xl font-semibold my-4">Our Vision</h2>
      <p class="text-gray-600 leading-relaxed">
        We envision a world where every piece of software can be understood instantly through
        high-quality visual storytelling.
      </p>
    </section>
  </Page>
)
export const PrivacyPolicy = () => (
  <Page
    title="Privacy Policy"
    description="How Pitch collects, uses, and protects your data."
    path="/privacy"
  >
    <div class="space-y-6 text-gray-600 leading-relaxed">
      <p>Last Updated: {new Date().toLocaleDateString()}</p>
      <h2 class="text-xl font-semibold text-gray-800">1. Introduction</h2>
      <p>
        We respect your privacy and protect personal data collected when you use trypitch.co and our
        automated video services.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">2. Information We Collect</h2>
      <p>
        We collect account and billing information, URLs and instructions supplied for projects, and
        technical usage data needed to operate and improve the service.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">3. How We Use Information</h2>
      <p>
        We use it to deliver requested content, maintain and improve the service, process
        transactions, manage accounts, and provide support.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">4. Sharing and Security</h2>
      <p>
        We do not sell personal information. Service providers receive only data required for their
        work. We use industry-standard security measures.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">5. Your Rights</h2>
      <p>
        You may request access, correction, or deletion by contacting{' '}
        <a href="mailto:support@trypitch.co">support@trypitch.co</a>.
      </p>
    </div>
  </Page>
)
export const TermsOfService = () => (
  <Page
    title="Terms of Service"
    description="The terms that govern your use of Pitch."
    path="/terms"
  >
    <div class="space-y-6 text-gray-600 leading-relaxed">
      <p>Last Updated: {new Date().toLocaleDateString()}</p>
      <h2 class="text-xl font-semibold text-gray-800">1. Acceptance</h2>
      <p>
        By using Pitch, you agree to these terms and confirm that you are at least 18 years old.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">2. Service</h2>
      <p>
        Pitch provides automated video, walkthrough, and presentation generation. We may modify the
        service over time.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">3. Your Responsibilities</h2>
      <p>
        You must protect your credentials, use the service lawfully, and have rights to all URLs and
        content you submit.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">4. Intellectual Property</h2>
      <p>
        You may use generated outputs. Pitch retains rights to its underlying software, design, and
        processes.
      </p>
      <h2 class="text-xl font-semibold text-gray-800">5. Liability and Changes</h2>
      <p>
        To the extent permitted by law, Pitch is not liable for indirect or consequential losses.
        Continued use after an update accepts revised terms.
      </p>
      <p>
        Questions: <a href="mailto:support@trypitch.co">support@trypitch.co</a>.
      </p>
    </div>
  </Page>
)
