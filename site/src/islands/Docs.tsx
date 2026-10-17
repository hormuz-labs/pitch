import { DocsView } from '../solid/public/DocsView'
import { RouteProvider } from '../shims/router'

export default function Docs(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <DocsView slug={props.params?.slug ?? ""} />
    </RouteProvider>
  )
}
