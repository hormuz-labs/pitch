import { NotFoundView } from '../solid/public/StatusView'
import { RouteProvider } from '../shims/router'

export default function NotFound(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <NotFoundView />
    </RouteProvider>
  )
}
