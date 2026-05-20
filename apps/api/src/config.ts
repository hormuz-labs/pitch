import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME } from '@saas/shared';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const subscriber = new Redis(redisUrl);

export const videoQueue = new Queue(QUEUE_NAME, { connection });

export const CREDIT_PACKS = {
  starter:    { credits: 10,  priceUsd: 10,  label: '10 Credits/mo', productId: 'pdt_0NfE1TTRkMmGD1uSRKGMG' },
  pro:        { credits: 50,  priceUsd: 40,  label: '50 Credits/mo', productId: 'pdt_0NfE1TUQyO6q0uRvtQa6W' },
  enterprise: { credits: 200, priceUsd: 130, label: '200 Credits/mo', productId: 'pdt_0NfE1TY7rCS3QSWsUiMny' },
} as const;

export const TOPUP_PACKS = {
  topup_10:  { credits: 10,  priceUsd: 12, label: '10 Credits (One-time)', productId: 'pdt_0NfE1TZ3GNquhi63E2E1K' },
  topup_50:  { credits: 50,  priceUsd: 45, label: '50 Credits (One-time)', productId: 'pdt_0NfE1Ta1jXmcchFVWSVnG' },
} as const;

export type PackKey = keyof typeof CREDIT_PACKS;
export type TopupKey = keyof typeof TOPUP_PACKS;
