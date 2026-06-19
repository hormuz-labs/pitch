import { useClerk } from '@clerk/clerk-react'
import { useEffect } from 'react'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { PricingView } from './PricingView'

export const PublicPricingView = () => {
  const clerk = useClerk()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'g' || e.key === 'G') {
        clerk.openSignIn()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clerk])

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-gray-900 font-sans selection:bg-gray-200 flex flex-col overflow-x-hidden overflow-y-auto">
      <LandingNav />
      <main className="flex-1 flex flex-col">
        <PricingView />
      </main>
      <LandingFooter />
    </div>
  )
}
