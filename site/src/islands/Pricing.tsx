import { PublicPricingView } from '../solid/public/PublicPricingView'
import { RouteProvider } from '../shims/router'

export default function Pricing(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <PublicPricingView />
    </RouteProvider>
  )
}
