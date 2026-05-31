import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME } from '@saas/shared';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const subscriber = new Redis(redisUrl);

export const videoQueue = new Queue(QUEUE_NAME, { connection });

// Single source of truth for which Dodo environment we target. Explicit
// DODO_ENVIRONMENT wins (lets dev opt into either mode); when unset we default
// to live in production and test elsewhere. The checkout route imports this so
// the API client and the product IDs below can never point at different envs.
export const DODO_ENV: 'live_mode' | 'test_mode' =
  process.env.DODO_ENVIRONMENT === 'live_mode' ? 'live_mode'
  : process.env.DODO_ENVIRONMENT === 'test_mode' ? 'test_mode'
  : process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode';

// Product IDs are environment-specific in Dodo — the same plan has a different
// id in live vs test. Keep both sets and pick by DODO_ENV.
const PRODUCT_IDS = DODO_ENV === 'live_mode'
  ? {
      starter:    'pdt_0NfE1TTRkMmGD1uSRKGMG',
      pro:        'pdt_0NfE1TUQyO6q0uRvtQa6W',
      enterprise: 'pdt_0NfE1TY7rCS3QSWsUiMny',
      topup_10:   'pdt_0NfE1TZ3GNquhi63E2E1K',
      topup_50:   'pdt_0NfE1Ta1jXmcchFVWSVnG',
    }
  : {
      starter:    'pdt_0Nf0dKdBN6HnWpCSGT0MO',
      pro:        'pdt_0Nf0dKdqu4BpQLYOg2ejC',
      enterprise: 'pdt_0Nf0dKeZUi9JwPEP7Lv7I',
      topup_10:   'pdt_0Nf0csCgGaZqU0e8OSOPF',
      topup_50:   'pdt_0Nf0csDWPJdbh1c9MBQg7',
    };

export const CREDIT_PACKS = {
  starter:    { credits: 10,  priceUsd: 10,  label: '10 Credits/mo', productId: PRODUCT_IDS.starter },
  pro:        { credits: 50,  priceUsd: 40,  label: '50 Credits/mo', productId: PRODUCT_IDS.pro },
  enterprise: { credits: 200, priceUsd: 130, label: '200 Credits/mo', productId: PRODUCT_IDS.enterprise },
} as const;

export const TOPUP_PACKS = {
  topup_10:  { credits: 10,  priceUsd: 12, label: '10 Credits (One-time)', productId: PRODUCT_IDS.topup_10 },
  topup_50:  { credits: 50,  priceUsd: 45, label: '50 Credits (One-time)', productId: PRODUCT_IDS.topup_50 },
} as const;

export type PackKey = keyof typeof CREDIT_PACKS;
export type TopupKey = keyof typeof TOPUP_PACKS;
