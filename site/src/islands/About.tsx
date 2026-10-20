import { AboutUs } from '../solid/public/LegalViews'
import { RouteProvider } from '../shims/router'

export default function About(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <AboutUs />
    </RouteProvider>
  )
}
