import { BlogPostView } from '../solid/public/Blog'
import { RouteProvider } from '../shims/router'

export default function BlogPost(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <BlogPostView />
    </RouteProvider>
  )
}
