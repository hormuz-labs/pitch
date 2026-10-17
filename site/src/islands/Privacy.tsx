import { PrivacyPolicy } from '../solid/public/LegalViews'
import { RouteProvider } from '../shims/router'

export default function Privacy(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <PrivacyPolicy />
    </RouteProvider>
  )
}
