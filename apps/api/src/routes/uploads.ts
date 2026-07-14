import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { type RequestHandler, Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:uploads')

const MAX_FILES = 50
const MAX_FILE_SIZE_MB = 25

// Accept PDFs and images. We match on mime type OR file extension: browsers /
// OSes sometimes report an image as `application/octet-stream` (or omit the
// type), which would otherwise reject a perfectly good file.
const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i
function isSupported(file: Express.Multer.File): boolean {
  const mt = (file.mimetype || '').toLowerCase()
  return mt === 'application/pdf' || mt.startsWith('image/') || ALLOWED_EXT.test(file.originalname)
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Skip unsupported files (cb(null, false)) rather than erroring — one odd
    // file in a multi-file upload must not fail the whole batch. Truly-empty
    // batches are handled as "no supported files" below.
    if (isSupported(file)) {
      cb(null, true)
    } else {
      logger.warn({ name: file.originalname, type: file.mimetype }, 'Skipping unsupported file')
      cb(null, false)
    }
  },
})

export const router = Router()

// Wrap multer so its limit errors (too many / too large) surface as 400s with a
// clear, logged reason instead of falling through to the default 500 handler.
const parseFiles: RequestHandler = (req, res, next) => {
  upload.array('files', MAX_FILES)(req, res, (err: any) => {
    if (err) {
      const code = err?.code
      let message = err?.message || 'Invalid upload'
      if (code === 'LIMIT_FILE_SIZE') message = `Each file must be under ${MAX_FILE_SIZE_MB} MB`
      else if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE')
        message = `Too many files (max ${MAX_FILES})`
      logger.warn({ code, err: err?.message }, 'Upload rejected by multer')
      return res.status(400).json({ error: message, code })
    }
    next()
  })
}

router.post('/', parseFiles, async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const files = req.files
  if (!Array.isArray(files) || files.length === 0) {
    return res
      .status(400)
      .json({ error: 'No supported files uploaded — allowed: images and PDFs.' })
  }

  try {
    const prefix = `pitch/${userId}/uploads`
    const results = await Promise.all(
      files.map(async file => {
        const url = await storage.uploadBuffer(
          file.buffer,
          file.originalname,
          file.mimetype,
          undefined,
          prefix,
        )
        return {
          url,
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
        }
      }),
    )

    logger.info({ userId, count: results.length }, 'Files uploaded')
    res.status(201).json(results)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to upload files')
    res.status(500).json({ error: error.message || 'Upload failed' })
  }
})
