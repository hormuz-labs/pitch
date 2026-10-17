import { TermsOfService } from '../solid/public/LegalViews'
import { RouteProvider } from '../shims/router'

export default function Terms(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <TermsOfService />
    </RouteProvider>
  )
}
