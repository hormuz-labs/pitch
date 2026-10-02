export const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.flac'
export const ASSET_ACCEPT = `.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.svg,.heic,.heif,.tif,.tiff,.mp4,.webm,.mov,.mkv,.avi,${AUDIO_ACCEPT}`

export function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const items = Array.from(data.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
  const files = items.length ? items : Array.from(data.files ?? [])
  return files.map(file => {
    if (!file.type.startsWith('image/')) return file
    const extension =
      file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? `.${file.type.split('/')[1] || 'png'}`
    // Clipboard images usually all arrive as image.png. Keep each paste distinct
    // when the server stages attachments by filename in uploads/.
    return new File([file], `pasted-image-${crypto.randomUUID()}${extension}`, { type: file.type })
  })
}
export {
  MAX_UPLOAD_FILES,
  UPLOAD_LIMITS_LABEL,
  uploadLimitError as attachmentLimitError,
} from '../../../../packages/shared/src/upload-limits'
