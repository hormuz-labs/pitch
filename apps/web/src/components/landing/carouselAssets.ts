/**
 * Shared base URL for the public MinIO bucket that holds the landing-page
 * sample videos. Kept in one module so VideoCarousel, productCatalog and the
 * landing hero's "watch one first" demo cannot drift apart, and so the bucket
 * can be repointed per-env with VITE_CAROUSEL_ASSET_URL.
 */
const ASSET_BASE = (
  import.meta.env.VITE_CAROUSEL_ASSET_URL || 'https://s3.trypitch.co/carousel/carousel'
).replace(/\/$/, '')

/** Absolute URL for a file in the carousel bucket, e.g. video('demo.mp4'). */
export const carouselAsset = (name: string) => `${ASSET_BASE}/${name}`
