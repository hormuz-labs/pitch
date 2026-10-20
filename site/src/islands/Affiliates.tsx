import { AffiliatesView } from '../solid/public/AffiliatesView'
import { RouteProvider } from '../shims/router'

export default function Affiliates(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <AffiliatesView />
    </RouteProvider>
  )
}
