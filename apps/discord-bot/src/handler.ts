export type DiscordProject = {
  id: string
  title: string
  status: 'empty' | 'working' | 'ready' | 'failed'
  outputs?: Array<{ kind: string; url: string }>
  lastError?: string | null
}

export interface PitchBotApi {
  createVideo(discordUserId: string, prompt: string): Promise<{ project: DiscordProject }>
  getProject(discordUserId: string, projectId: string): Promise<{ project: DiscordProject }>
}

export interface VideoCommandInteraction {
  discordUserId: string
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
    const created = await api.createVideo(interaction.discordUserId, interaction.prompt)
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
        const resultUrl =
          project.outputs?.find(output => output.kind === 'video')?.url ?? projectUrl
        await interaction.postToChannel(`✅ **${project.title}** is ready: ${resultUrl}`)
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
    if (error instanceof PitchApiError && error.status === 429) {
      await interaction.updateProgress(
        'You have used today’s 3 free Discord videos. Your allowance resets at 00:00 UTC.',
      )
      return
    }
    throw error
  }
}
