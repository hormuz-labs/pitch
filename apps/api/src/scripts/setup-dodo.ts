import DodoPayments from 'dodopayments'
import type { Price, ProductListResponse } from 'dodopayments/resources/products/products.js'
import dotenv from 'dotenv'
import fs from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { CREDIT_PACKS, TOPUP_PACKS } from '../config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../../../.env') })

const dodoKey = process.env.DODO_PAYMENTS_API_KEY
if (!dodoKey) {
  console.error('Missing DODO_PAYMENTS_API_KEY in .env')
  process.exit(1)
}

const client = new DodoPayments({
  bearerToken: dodoKey,
  environment:
    process.env.NODE_ENV === 'production' && process.env.DODO_ENVIRONMENT !== 'test_mode'
      ? 'live_mode'
      : 'test_mode',
})

async function main() {
  console.log('Listing existing products...')

  // Dodo doesn't have an easy "find by name" API, we just list and filter locally.
  const products: ProductListResponse[] = []
  try {
    for await (const product of client.products.list()) {
      products.push(product)
    }
  } catch (err: unknown) {
    console.error('Failed to list products:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  type PackData = { credits: number; priceUsd: number; label: string; productId: string }
  const newPacks: Record<string, PackData> = JSON.parse(JSON.stringify(CREDIT_PACKS))
  const newTopups: Record<string, PackData> = JSON.parse(JSON.stringify(TOPUP_PACKS))
  let configUpdated = false

  const processPacks = async (packs: Record<string, PackData>, isTopup: boolean) => {
    for (const [_key, pack] of Object.entries(packs)) {
      const productName = `TryPitch - ${pack.label}`
      const existing = products.find(p => p.name === productName)

      if (existing) {
        console.log(`Product "${productName}" already exists with ID: ${existing.product_id}`)
        if (pack.productId !== existing.product_id) {
          pack.productId = existing.product_id
          configUpdated = true
        }
      } else {
        console.log(`Creating product "${productName}"...`)
        try {
          const priceConfig = {
            type: isTopup ? 'one_time_price' : 'recurring_price',
            currency: 'USD',
            price: isTopup ? pack.priceUsd * 100 : pack.priceUsd * 5 * 100,
            discount: isTopup ? 0 : 80,
            purchasing_power_parity: false,
            ...(isTopup
              ? {}
              : {
                  payment_frequency_count: 1,
                  payment_frequency_interval: 'Month',
                  subscription_period_count: 1,
                  subscription_period_interval: 'Month',
                }),
          } as Price

          const created = await client.products.create({
            name: productName,
            description: `${pack.credits} credits${isTopup ? ' (One-time)' : ' per month'}`,
            tax_category: 'saas',
            price: priceConfig,
          })
          console.log(`Created product ID: ${created.product_id}`)
          pack.productId = created.product_id
          configUpdated = true
        } catch (err: unknown) {
          console.error(
            `Failed to create ${productName}:`,
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    }
  }

  await processPacks(newPacks, false)
  await processPacks(newTopups, true)

  if (configUpdated) {
    const configPath = join(__dirname, '../config.ts')
    let configContent = fs.readFileSync(configPath, 'utf8')

    // Quick regex to update productId in config.ts
    for (const [key, pack] of Object.entries(newPacks)) {
      const regex = new RegExp(`(${key}:\\s*{[^}]*productId:\\s*')[^']+(')`)
      configContent = configContent.replace(regex, `$1${pack.productId}$2`)
    }

    for (const [key, pack] of Object.entries(newTopups)) {
      const regex = new RegExp(`(${key}:\\s*{[^}]*productId:\\s*')[^']+(')`)
      configContent = configContent.replace(regex, `$1${pack.productId}$2`)
    }

    fs.writeFileSync(configPath, configContent)
    console.log('Updated config.ts with new product IDs.')
  } else {
    console.log('No updates to config.ts needed.')
  }
}

main().catch(console.error)
