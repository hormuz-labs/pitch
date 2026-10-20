// The static site has no session: every visitor is signed out, and signing in
// happens in the studio. Same exports as the app's Clerk wrapper.
import type { ParentProps } from 'solid-js'
import { STUDIO_URL } from '../../shims/router'

export interface TokenOptions {
  template?: string
  skipCache?: boolean
}

const toStudio = (path: string) => {
  if (typeof window !== 'undefined') window.location.assign(`${STUDIO_URL}${path}`)
}

const clerk = {
  openSignIn: () => toStudio('/login'),
  openSignUp: () => toStudio('/sign-up'),
  redirectToSignIn: () => toStudio('/login'),
  redirectToSignUp: () => toStudio('/sign-up'),
  signOut: async () => {},
  user: null,
  session: null,
}

export interface ClerkProviderProps extends ParentProps {
  publishableKey?: string
}

export function ClerkProvider(props: ClerkProviderProps) {
  return props.children
}

export function useClerk() {
  return clerk
}

export function useAuth() {
  return {
    isLoaded: () => true,
    isSignedIn: () => false,
    userId: () => null,
    getToken: async (_opts?: TokenOptions): Promise<string | null> => null,
    signOut: async () => {},
  }
}

export function useUser() {
  return { isLoaded: () => true, isSignedIn: () => false, user: () => null, userAccessor: () => null }
}

export function useSignIn() {
  return { isLoaded: () => true, signIn: () => null }
}

export function useSignUp() {
  return { isLoaded: () => true, signUp: () => null }
}
