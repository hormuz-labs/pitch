import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { type RequestHandler, Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api:uploads')

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 25

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`))
    }
  },
})

export const router = Router()

// Wrap multer so its errors (unsupported type, too many/too large files)
// surface as 400s instead of falling through to the default 500 handler.
const parseFiles: RequestHandler = (req, res, next) => {
  upload.array('files', MAX_FILES)(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Invalid upload' })
    }
    next()
  })
}

router.post('/', parseFiles, async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const files = req.files
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' })
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
