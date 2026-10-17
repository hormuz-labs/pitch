import { LandingView } from '../solid/public/LandingView'
import { RouteProvider } from '../shims/router'

export default function Landing(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <LandingView />
    </RouteProvider>
  )
}
