// ChatGPT's published file/image sizes, with a 20-file upload batch and the
// studio's user-requested 50 MB soundtrack limit. Shared by browser and server.
export const MAX_UPLOAD_FILES = 20
export const MAX_UPLOAD_FILE_MB = 512
export const MAX_UPLOAD_IMAGE_MB = 20
export const MAX_UPLOAD_AUDIO_MB = 50
export const UPLOAD_LIMITS_LABEL =
  'Up to 20 files · images 20 MB · audio 50 MB · videos and documents 512 MB each'

export interface UploadFile {
  name: string
  type: string
  size: number
}

export function uploadSizeLimitMb(file: Pick<UploadFile, 'name' | 'type'>): number {
  const type = file.type.toLowerCase()
  if (
    type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i.test(file.name)
  )
    return MAX_UPLOAD_IMAGE_MB
  if (type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name))
    return MAX_UPLOAD_AUDIO_MB
  return MAX_UPLOAD_FILE_MB
}

export function uploadLimitError(files: readonly UploadFile[], existingCount = 0): string | null {
  if (existingCount + files.length > MAX_UPLOAD_FILES)
    return `You can attach up to ${MAX_UPLOAD_FILES} files at a time. Remove a file before adding more.`
  for (const file of files) {
    const limit = uploadSizeLimitMb(file)
    if (file.size > limit * 1024 * 1024) return `${file.name} is over ${limit} MB`
  }
  return null
}
