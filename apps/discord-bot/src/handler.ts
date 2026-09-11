export type DiscordProject = {
  id: string
  title: string
  status: 'empty' | 'working' | 'ready' | 'failed'
  outputs?: Array<{ kind: string; url: string }>
  lastError?: string | null
}

export type DiscordCreationKind = 'auto' | 'demo' | 'launch' | 'generated'

export interface PitchBotApi {
  createVideo(
    discordUserId: string,
    prompt: string,
    kind: DiscordCreationKind,
  ): Promise<{ project: DiscordProject }>
  getProject(discordUserId: string, projectId: string): Promise<{ project: DiscordProject }>
  shareProject(discordUserId: string, projectId: string): Promise<{ shareUrl: string }>
}

export interface VideoCommandInteraction {
  discordUserId: string
  kind: DiscordCreationKind
  prompt: string
  acknowledge(): Promise<void>
  updateProgress(message: string): Promise<void>
  postToChannel(message: string): Promise<void>
}

export class PitchApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface VideoCommandOptions {
  appUrl: string
  pollIntervalMs?: number
  maxPolls?: number
}

export async function handleVideoCommand(
  interaction: VideoCommandInteraction,
  api: PitchBotApi,
  options: VideoCommandOptions,
): Promise<void> {
  await interaction.acknowledge()
  try {
    const created = await api.createVideo(
      interaction.discordUserId,
      interaction.prompt,
      interaction.kind,
    )
    const appUrl = options.appUrl.replace(/\/$/, '')
    const projectUrl = `${appUrl}/p/${created.project.id}`
    await interaction.updateProgress(
      `Creating **${created.project.title}**… Follow it in Pitch: ${projectUrl}`,
    )

    const pollIntervalMs = options.pollIntervalMs ?? 5_000
    const maxPolls = options.maxPolls ?? 1_440
    for (let attempt = 0; attempt < maxPolls; attempt++) {
      if (pollIntervalMs > 0) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      }
      const { project } = await api.getProject(interaction.discordUserId, created.project.id)
      if (project.status === 'ready') {
        const { shareUrl } = await api.shareProject(interaction.discordUserId, project.id)
        await interaction.postToChannel(`✅ **${project.title}** is ready: ${shareUrl}`)
        return
      }
      if (project.status === 'failed') {
        await interaction.postToChannel(
          `⚠️ **${project.title}** could not be completed. ${project.lastError ?? `Open it in Pitch: ${projectUrl}`}`,
        )
        return
      }
    }
    await interaction.postToChannel(
      `⏳ **${created.project.title}** is still running. Follow it in Pitch: ${projectUrl}`,
    )
  } catch (error) {
    if (error instanceof PitchApiError && error.status === 404) {
      const appUrl = options.appUrl.replace(/\/$/, '')
      await interaction.updateProgress(
        `Link your Discord account in Pitch first: ${appUrl}/new?settings=connections`,
      )
      return
    }
    if (error instanceof PitchApiError && error.status === 402) {
      await interaction.updateProgress(
        `You need more Pitch credits. Claim your one-time Discord welcome reward in Settings → Discord, or buy credits in Pitch: ${options.appUrl.replace(/\/$/, '')}/new?settings=connections`,
      )
      return
    }
    throw error
  }
}
