import { Blog } from '../solid/public/Blog'
import { RouteProvider } from '../shims/router'

export default function BlogIndex(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <Blog />
    </RouteProvider>
  )
}
