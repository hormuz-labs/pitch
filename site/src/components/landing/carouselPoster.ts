import { onMount } from 'solid-js'

const POSTERS: Record<string, string> = {
  'Thomas.mp4': 'thomas.webp',
  'agentcard.mp4': 'agentcard.webp',
  'demo.mp4': 'pitch.webp',
  'graphify.mp4': 'graphify.webp',
  'gtmcofounder.mp4': 'gtmcofounder.webp',
  'leeter.mp4': 'leeter.webp',
  'productHunt.mp4': 'product-hunt.webp',
  'quippy.mp4': 'quippy.webp',
  'replit.mp4': 'replit.webp',
  'supermemory.mp4': 'supermemory.webp',
  'unsloth-launch.mp4': 'unsloth.webp',
}

export const carouselPoster = (file: string) => `/carousel-posters/${POSTERS[file]}`

/**
 * Solid clones <video> out of an inert <template>, and Chromium never fetches a
 * poster set before the element joins the document, so a JSX `poster` attribute
 * renders as a blank frame. Apply it from a ref once the video is mounted.
 */
export const applyPoster = (video: HTMLVideoElement, file: string) =>
  onMount(() => video.setAttribute('poster', carouselPoster(file)))
