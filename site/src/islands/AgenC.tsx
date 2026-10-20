import { AgenCView } from '../solid/public/AgenCView'
import { RouteProvider } from '../shims/router'

export default function AgenC(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <AgenCView />
    </RouteProvider>
  )
}
