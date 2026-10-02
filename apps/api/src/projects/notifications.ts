/**
 * Unified notification service for Pitch projects.
 *
 * Admins hear about everything on Discord (free). Users get at most two emails
 * per project, because Resend's quota is small and the user is usually
 * watching the studio anyway:
 * - when the first turn produces something (they may have walked away)
 * - when the project's first video is ready
 * A project start, a re-export and an export's "completed" echo are Discord only.
 *
 * Honors UserProfile.emailNotifications preferences and deduplicates notifications.
 */

import * as db from '@saas/db'
import { getClerkUserEmail, sendJobCompleteEmail, sendVideoRenderReadyEmail } from '@saas/email'
import { createLogger, DISCORD_COLORS, sendDiscordMessage } from '@saas/shared'
import type { Output } from '../flows/types.js'
import type { ProjectRow } from './rows.js'

const logger = createLogger('studio:notifications')

const APP_URL = () => (process.env.APP_URL || 'https://trypitch.co').replace(/\/$/, '')

const notifiedStarted = new Set<string>()
const notifiedCompleted = new Set<string>()
const notifiedVideoReady = new Set<string>()

export function _resetNotificationCacheForTest(): void {
  notifiedStarted.clear()
  notifiedCompleted.clear()
  notifiedVideoReady.clear()
}

export interface NotificationUserInfo {
  email: string | null
  firstName: string | null
  emailNotifications: boolean
}

export async function resolveUserInfo(userId: string): Promise<NotificationUserInfo> {
  const profile = await db.prisma.userProfile
    .findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, emailNotifications: true },
    })
    .catch(() => null)

  const clerkEmail = await getClerkUserEmail(userId).catch(() => null)
  const email = clerkEmail || profile?.email || null

  return {
    email,
    firstName: profile?.firstName || null,
    emailNotifications: profile?.emailNotifications ?? true,
  }
}

/**
 * Tells admins that a project has started. The user just pressed the button,
 * so they get no email.
 */
export async function notifyProjectStarted(
  p: ProjectRow,
  opts?: { prompt?: string },
): Promise<void> {
  if (notifiedStarted.has(p.id)) return
  notifiedStarted.add(p.id)

  const userInfo = await resolveUserInfo(p.userId)
  const studioUrl = `${APP_URL()}/projects/${p.id}`
  const promptText = (opts?.prompt ?? p.prompt ?? '').trim() || '(opened from an upload)'
  const userLabel = userInfo.email ? `${userInfo.email} (${p.userId})` : p.userId

  // 1. Admin Discord notification
  sendDiscordMessage({
    content: `🎬 **Project Started**: **${p.title}**\n• **User:** ${userLabel}\n• **Studio:** <${studioUrl}>\n• **Prompt:** *${promptText.slice(0, 300)}*`,
    embeds: [
      {
        title: `🎬 Project Started: ${p.title}`,
        url: studioUrl,
        color: DISCORD_COLORS.INFO,
        fields: [
          { name: 'Project ID', value: `\`${p.id}\``, inline: true },
          { name: 'User', value: userLabel, inline: true },
          { name: 'Studio Link', value: `[Open Studio](${studioUrl})`, inline: false },
          { name: 'Prompt', value: promptText.slice(0, 1000), inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Pitch Studio Admin Notification' },
      },
    ],
  }).catch(err => logger.warn({ err, projectId: p.id }, 'discord start alert failed'))
}

/**
 * Notifies admins that a project has completed, with its final result link, and
 * emails the user unless `email: false`.
 */
export async function notifyProjectCompleted(
  p: ProjectRow,
  opts?: { resultUrl?: string; output?: Output; email?: boolean },
): Promise<void> {
  if (notifiedCompleted.has(p.id)) return
  notifiedCompleted.add(p.id)

  const userInfo = await resolveUserInfo(p.userId)
  const studioUrl = `${APP_URL()}/projects/${p.id}`
  const shareUrl = p.shareSlug ? `${APP_URL()}/d/${p.shareSlug}` : null
  const primaryOutput = opts?.output || p.outputs.find(o => o.kind === 'video' || o.kind === 'pdf')
  const resultUrl = opts?.resultUrl || primaryOutput?.url || shareUrl || studioUrl
  const userLabel = userInfo.email ? `${userInfo.email} (${p.userId})` : p.userId
  const artifactType = primaryOutput
    ? `${primaryOutput.kind.toUpperCase()}${primaryOutput.res ? ` (${primaryOutput.res})` : ''} - ${primaryOutput.label || 'Output'}`
    : 'Interactive Studio Preview'

  // 1. Admin Discord notification with full result link and studio link
  sendDiscordMessage({
    content: `✅ **Project Completed**: **${p.title}**\n• **User:** ${userLabel}\n• **Final Result:** <${resultUrl}>\n• **Studio:** <${studioUrl}>${shareUrl ? `\n• **Share Link:** <${shareUrl}>` : ''}`,
    embeds: [
      {
        title: `✅ Project Completed: ${p.title}`,
        url: resultUrl,
        color: DISCORD_COLORS.SUCCESS,
        fields: [
          { name: 'Project ID', value: `\`${p.id}\``, inline: true },
          { name: 'User', value: userLabel, inline: true },
          {
            name: 'Final Result Link',
            value: resultUrl ? `[View Final Result](${resultUrl})` : `[Open Studio](${studioUrl})`,
            inline: false,
          },
          { name: 'Studio Link', value: `[Open Project Studio](${studioUrl})`, inline: true },
          ...(shareUrl
            ? [{ name: 'Share Page', value: `[Public Share Link](${shareUrl})`, inline: true }]
            : []),
          { name: 'Artifact', value: artifactType, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Pitch Studio Admin Notification' },
      },
    ],
  }).catch(err => logger.warn({ err, projectId: p.id }, 'discord completion alert failed'))

  // 2. User transactional email
  if (opts?.email !== false && userInfo.email && userInfo.emailNotifications) {
    sendJobCompleteEmail({
      to: userInfo.email,
      firstName: userInfo.firstName,
      jobId: p.id,
      title: p.title,
      videoUrl: primaryOutput?.kind === 'video' ? resultUrl : undefined,
      projectUrl: studioUrl,
    }).catch(err => logger.warn({ err, projectId: p.id }, 'user completion email failed'))
  }
}

/**
 * Notifies admins when an MP4 video has rendered, and emails the user unless
 * `email: false`.
 */
export async function notifyVideoRenderReady(
  p: ProjectRow,
  videoUrl: string,
  opts?: { resolution?: string; label?: string; email?: boolean },
): Promise<void> {
  const renderKey = `${p.id}:${opts?.resolution || videoUrl}`
  if (notifiedVideoReady.has(renderKey)) return
  notifiedVideoReady.add(renderKey)

  const userInfo = await resolveUserInfo(p.userId)
  const studioUrl = `${APP_URL()}/projects/${p.id}`
  const userLabel = userInfo.email ? `${userInfo.email} (${p.userId})` : p.userId

  // 1. Admin Discord notification
  sendDiscordMessage({
    content: `🎥 **Video Render Ready to Export**: **${p.title}**\n• **User:** ${userLabel}\n• **Video URL:** <${videoUrl}>\n• **Studio:** <${studioUrl}>`,
    embeds: [
      {
        title: `🎥 Video Render Ready: ${p.title}`,
        url: videoUrl,
        color: DISCORD_COLORS.RENDER,
        fields: [
          { name: 'Project ID', value: `\`${p.id}\``, inline: true },
          { name: 'User', value: userLabel, inline: true },
          {
            name: 'Video Download URL',
            value: `[Download Video MP4](${videoUrl})`,
            inline: false,
          },
          { name: 'Studio Link', value: `[Open Studio Export](${studioUrl})`, inline: true },
          ...(opts?.resolution
            ? [{ name: 'Resolution', value: opts.resolution, inline: true }]
            : []),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Pitch Studio Admin Notification' },
      },
    ],
  }).catch(err => logger.warn({ err, projectId: p.id }, 'discord video ready alert failed'))

  // 2. User transactional email
  if (opts?.email !== false && userInfo.email && userInfo.emailNotifications) {
    sendVideoRenderReadyEmail({
      to: userInfo.email,
      firstName: userInfo.firstName,
      jobId: p.id,
      videoUrl,
      title: p.title,
      resolution: opts?.resolution,
      projectUrl: studioUrl,
    }).catch(err => logger.warn({ err, projectId: p.id }, 'user video ready email failed'))
  }
}
