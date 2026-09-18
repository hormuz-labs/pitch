import { mkdtemp, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { type RequestHandler, Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('studio:uploads')

const MAX_FILES = 50
// Videos for recording edits are the big ones; decks and images are small.
const MAX_FILE_SIZE_MB = 500

// Accept PDFs, decks, images and screen recordings. We match on mime type OR
// file extension: browsers / OSes sometimes report a file as
// `application/octet-stream` (or omit the type), which would otherwise reject
// a perfectly good file.
const ALLOWED_EXT =
  /\.(pdf|pptx?|png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|tiff?|mp4|webm|mov|mkv|avi)$/i
function isSupported(file: Express.Multer.File): boolean {
  const mt = (file.mimetype || '').toLowerCase()
  return (
    mt === 'application/pdf' ||
    mt.startsWith('image/') ||
    mt.startsWith('video/') ||
    ALLOWED_EXT.test(file.originalname)
  )
}

const upload = multer({
  // Disk, not memory: a 500 MB recording must not live in the heap.
  storage: multer.diskStorage({ destination: os.tmpdir() }),
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
      .json({ error: 'No supported files uploaded — allowed: images, PDFs, decks and videos.' })
  }

  try {
    const prefix = `pitch/${userId}/uploads`
    const results = await Promise.all(
      files.map(async file => {
        // Keep the original file name in the object key: flows read the
        // extension (deck vs pptx, mp4 vs webm) back from the URL.
        const dir = await mkdtemp(path.join(os.tmpdir(), 'pitch-upload-'))
        const named = path.join(dir, path.basename(file.originalname).replace(/[^\w.-]+/g, '_'))
        await rename(file.path, named)
        try {
          const url = await storage.uploadFile(named, undefined, prefix)
          return { url, name: file.originalname, type: file.mimetype, size: file.size }
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(() => {})
        }
      }),
    )

    logger.info({ userId, count: results.length }, 'Files uploaded')
    res.status(201).json(results)
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to upload files')
    res.status(502).json({ error: 'Upload failed. Please try again.' })
  }
})
