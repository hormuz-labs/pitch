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
    description="Who builds Pitch, the AI production studio for launch films, product demos, slide decks and video edits, and how its agent does the work."
    path="/about"
  >
    <section class="mb-8 space-y-6 text-gray-600 leading-relaxed text-base">
      <h2 class="text-2xl font-semibold mb-4 text-gray-900">Directable AI Production Studio</h2>
      <p>
        Pitch is a directable AI production studio that turns a URL, recording, document, asset, or
        rough idea into polished launch films, product demos, demo recordings, slide decks, and
        edited videos. Its agent can research your product, write the story, design visuals, record
        real browser workflows, generate narration and music, edit footage, and render the final
        result.
      </p>
      <h2 class="text-2xl font-semibold my-4 text-gray-900">Live, Interactive Workflow</h2>
      <p>
        What makes Pitch different is its live, interactive workflow. Instead of accepting a
        one-shot AI output, you can watch the work take shape, select any visual element, timestamp,
        or asset, and request precise changes in plain language. The same project can evolve from a
        deck into a demo recording or launch video without starting over or switching tools.
      </p>
      <h2 class="text-2xl font-semibold my-4 text-gray-900">Complete Control</h2>
      <p>
        Pitch helps founders, marketers, and product teams move from an unfinished idea to
        presentation-ready creative work faster, with fewer handoffs, less production overhead, and
        complete control over every revision.
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
