import { describeLaunchVideoToolActivity } from './activity'
import { type ChatMessage, messageText, rawText, type SessionMessagesResponse } from './api'

export interface SessionChatSnapshot {
  messages: ChatMessage[]
  sceneMessages: Map<string, ChatMessage[]>
}

function sceneIdFromUserMessage(message: SessionMessagesResponse[number]): string | null {
  const text = message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text ?? '')
    .join('\n')
  return text.match(/^Update\s+([^:\s]+):/i)?.[1] ?? null
}

function toChatMessage(
  message: SessionMessagesResponse[number],
  sceneId?: string,
): ChatMessage | null {
  const partTexts: Record<string, string> = {}
  for (const part of message.parts) {
    if (part.type === 'text' && part.text) {
      partTexts[part.id] =
        message.info.role === 'user' && sceneId
          ? part.text.replace(new RegExp(`^Update\\s+${sceneId}:\\s*`, 'i'), '')
          : part.text
    } else if (message.info.role === 'assistant' && part.type === 'tool') {
      partTexts[part.id] = describeLaunchVideoToolActivity(part)
    }
  }
  const chat: ChatMessage = {
    id: message.info.id,
    role: message.info.role as 'user' | 'assistant',
    partTexts,
    created: message.info.time?.created ?? Date.now(),
  }
  return messageText(chat) ? chat : null
}

/** Rebuild global and per-scene chats from OpenCode's persisted parent links. */
export function sessionChatSnapshot(raw: SessionMessagesResponse): SessionChatSnapshot {
  const sceneByUserMessage = new Map<string, string>()
  for (const message of raw) {
    if (message.info.role !== 'user') continue
    const sceneId = sceneIdFromUserMessage(message)
    if (sceneId) sceneByUserMessage.set(message.info.id, sceneId)
  }

  const messages: ChatMessage[] = []
  const sceneMessages = new Map<string, ChatMessage[]>()
  for (const message of raw) {
    if (message.info.role !== 'user' && message.info.role !== 'assistant') continue
    const sceneId =
      message.info.role === 'user'
        ? sceneByUserMessage.get(message.info.id)
        : sceneByUserMessage.get(message.info.parentID ?? '')
    const chat = toChatMessage(message, sceneId)
    if (!chat) continue
    if (!sceneId) {
      messages.push(chat)
      continue
    }
    sceneMessages.set(sceneId, [...(sceneMessages.get(sceneId) ?? []), chat])
  }
  return { messages, sceneMessages }
}

/** Keep optimistic/error bubbles until their persisted equivalent appears. */
export function mergeSessionChat(previous: ChatMessage[], persisted: ChatMessage[]): ChatMessage[] {
  const localOnly = previous.filter(
    local =>
      local.id.startsWith('local-') &&
      !persisted.some(
        saved => saved.role === local.role && rawText(saved).trim() === rawText(local).trim(),
      ),
  )
  return [...persisted, ...localOnly]
}
