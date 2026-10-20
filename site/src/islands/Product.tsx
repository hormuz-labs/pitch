import { ProductView } from '../solid/public/ProductView'
import { RouteProvider } from '../shims/router'

export default function Product(props: { path: string; params?: Record<string, string> }) {
  return (
    <RouteProvider path={props.path} params={props.params}>
      <ProductView slug={props.params?.slug} />
    </RouteProvider>
  )
}
