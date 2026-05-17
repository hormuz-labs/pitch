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
  starter:    { credits: 10,  priceUsd: 10,  label: '10 Credits/mo', productId: 'pdt_0Nf0dKdBN6HnWpCSGT0MO' },
  pro:        { credits: 50,  priceUsd: 40,  label: '50 Credits/mo', productId: 'pdt_0Nf0dKdqu4BpQLYOg2ejC' },
  enterprise: { credits: 200, priceUsd: 130, label: '200 Credits/mo', productId: 'pdt_0Nf0dKeZUi9JwPEP7Lv7I' },
} as const;

export const TOPUP_PACKS = {
  topup_10:  { credits: 10,  priceUsd: 12, label: '10 Credits (One-time)', productId: 'pdt_0Nf0csCgGaZqU0e8OSOPF' },
  topup_50:  { credits: 50,  priceUsd: 45, label: '50 Credits (One-time)', productId: 'pdt_0Nf0csDWPJdbh1c9MBQg7' },
} as const;

export type PackKey = keyof typeof CREDIT_PACKS;
export type TopupKey = keyof typeof TOPUP_PACKS;
