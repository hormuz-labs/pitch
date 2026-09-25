import { Clerk } from '@clerk/clerk-js'
import {
  type Accessor,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  useContext,
} from 'solid-js'

export interface TokenOptions {
  template?: string
  skipCache?: boolean
}

interface ClerkContextValue {
  clerk: Clerk
  isLoaded: Accessor<boolean>
  session: Accessor<Clerk['session']>
  user: Accessor<Clerk['user']>
}

const ClerkContext = createContext<ClerkContextValue>()

export interface ClerkProviderProps extends ParentProps {
  publishableKey: string
}

export function ClerkProvider(props: ClerkProviderProps) {
  const clerk = new Clerk(props.publishableKey)
  const [isLoaded, setIsLoaded] = createSignal(false)
  const [session, setSession] = createSignal<Clerk['session']>()
  const [user, setUser] = createSignal<Clerk['user']>()

  onMount(() => {
    // The build-time prerender renders public pages as a signed-out visitor, which
    // is what crawlers are. It serves from 127.0.0.1, where a production Clerk key
    // never finishes loading, so skip Clerk there instead of waiting on it.
    if ((window as { __PITCH_PRERENDER__?: boolean }).__PITCH_PRERENDER__) {
      setIsLoaded(true)
      return
    }
    let unsubscribe: (() => void) | undefined
    let disposed = false

    void clerk
      .load({
        afterSignOutUrl: '/',
        signInUrl: '/sign-in',
        signUpUrl: '/sign-up',
      })
      .then(() => {
        if (disposed) return
        setSession(() => clerk.session)
        setUser(() => clerk.user)
        setIsLoaded(true)
        unsubscribe = clerk.addListener(resources => {
          setSession(() => resources.session)
          setUser(() => resources.user)
        })
      })
      .catch(error => {
        console.error('Failed to initialize Clerk', error)
        if (!disposed) setIsLoaded(true)
      })

    onCleanup(() => {
      disposed = true
      unsubscribe?.()
    })
  })

  return (
    <ClerkContext.Provider value={{ clerk, isLoaded, session, user }}>
      {props.children}
    </ClerkContext.Provider>
  )
}

function useClerkContext(): ClerkContextValue {
  const context = useContext(ClerkContext)
  if (!context) throw new Error('Clerk hooks must be used inside ClerkProvider')
  return context
}

/** Returns the loaded ClerkJS instance. Resource state is exposed by the other hooks. */
export function useClerk(): Clerk {
  return useClerkContext().clerk
}

/** Solid contract: reactive values are accessors and must be called. */
export function useAuth() {
  const context = useClerkContext()
  return {
    isLoaded: context.isLoaded,
    isSignedIn: () => Boolean(context.session()),
    userId: () => context.user()?.id ?? null,
    sessionId: () => context.session()?.id ?? null,
    getToken: (options?: TokenOptions) =>
      context.session()?.getToken(options) ?? Promise.resolve(null),
    signOut: (...args: Parameters<Clerk['signOut']>) => context.clerk.signOut(...args),
  }
}

export function useUser() {
  const context = useClerkContext()
  return {
    isLoaded: context.isLoaded,
    isSignedIn: () => Boolean(context.user()),
    // `user` matches Clerk's familiar snapshot shape for loaded route views;
    // use `userAccessor()` where updates must remain reactive.
    user: context.user(),
    userAccessor: context.user,
  }
}

export function useSignIn() {
  const context = useClerkContext()
  return {
    isLoaded: context.isLoaded,
    signIn: () => context.clerk.client?.signIn,
    setActive: context.clerk.setActive.bind(context.clerk),
  }
}

export function useSignUp() {
  const context = useClerkContext()
  return {
    isLoaded: context.isLoaded,
    signUp: () => context.clerk.client?.signUp,
    setActive: context.clerk.setActive.bind(context.clerk),
  }
}
