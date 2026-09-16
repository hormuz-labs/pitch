import {
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import {
  type DiscordCreationKind,
  handleVideoCommand,
  type VideoCommandInteraction,
} from './handler.js'
import { createPitchApi } from './pitch-api.js'

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const token = required('DISCORD_BOT_TOKEN')
const applicationId = required('DISCORD_APPLICATION_ID')
const serviceToken = required('DISCORD_SERVICE_TOKEN')
const apiUrl = process.env.PITCH_API_URL || 'http://localhost:3000'
const appUrl = process.env.APP_URL || 'http://localhost:5173'
const guildId = process.env.DISCORD_GUILD_ID?.trim()
const api = createPitchApi(apiUrl, serviceToken)

const command = new SlashCommandBuilder()
  .setName('video')
  .setDescription('Create a video using your Pitch credits')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Choose what kind of video Pitch should make')
      .setRequired(true)
      .addChoices(
        { name: 'Auto — let Pitch decide', value: 'auto' },
        { name: 'Product demo', value: 'demo' },
        { name: 'Launch film', value: 'launch' },
        { name: 'Generated footage', value: 'generated' },
      ),
  )
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the video you want Pitch to create')
      .setRequired(true)
      .setMaxLength(2_000),
  )

const rest = new REST({ version: '10' }).setToken(token)
await rest.put(
  guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId),
  { body: [command.toJSON()] },
)

const adaptInteraction = (interaction: ChatInputCommandInteraction): VideoCommandInteraction => ({
  discordUserId: interaction.user.id,
  kind: interaction.options.getString('type', true) as DiscordCreationKind,
  prompt: interaction.options.getString('prompt', true),
  acknowledge: async () => {
    await interaction.deferReply()
  },
  updateProgress: async message => {
    await interaction.editReply({ content: message, allowedMentions: { parse: [] } })
  },
  postToChannel: async message => {
    if (interaction.channel?.isSendable()) {
      await interaction.channel.send({ content: message, allowedMentions: { parse: [] } })
      return
    }
    await interaction.followUp({ content: message, allowedMentions: { parse: [] } })
  },
})

const client = new Client({ intents: [GatewayIntentBits.Guilds] })
client.once(Events.ClientReady, ready => {
  console.info(`[discord-bot] logged in as ${ready.user.tag}`)
})
// The gateway session is the whole bot: a silent drop looks exactly like
// "The application did not respond", so every state change is logged.
client.on(Events.ShardDisconnect, (event, shard) => {
  console.warn(`[discord-bot] shard ${shard} disconnected (${event.code})`)
})
client.on(Events.ShardReconnecting, shard => {
  console.warn(`[discord-bot] shard ${shard} reconnecting`)
})
client.on(Events.ShardResume, (shard, replayed) => {
  console.info(`[discord-bot] shard ${shard} resumed, ${replayed} events replayed`)
})
client.on(Events.ShardError, (error, shard) => {
  console.error(`[discord-bot] shard ${shard} error`, error)
})
client.on(Events.InteractionCreate, interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'video') return
  console.info(`[discord-bot] /video from ${interaction.user.id} in ${interaction.guildId ?? 'DM'}`)
  void handleVideoCommand(adaptInteraction(interaction), api, { appUrl }).catch(async error => {
    console.error('[discord-bot] /video failed', error)
    const message = 'Pitch could not start that video. Please try again shortly.'
    if (interaction.deferred || interaction.replied)
      await interaction.editReply(message).catch(() => {})
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {})
  })
})

await client.login(token)
