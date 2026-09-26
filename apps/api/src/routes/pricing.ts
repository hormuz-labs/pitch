import { Router } from 'express'
import { publicModelRates } from '../studio/model-picker.js'
import { studioModelPrices } from '../studio/session.js'

export const router = Router()

/** Public: what each studio model costs in credits, for the pricing page. */
router.get('/models', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json({ models: publicModelRates(undefined, await studioModelPrices()) })
})
