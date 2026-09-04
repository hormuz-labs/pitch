/**
 * There is one agent.
 *
 * This used to be a registry of four flows, each with its own tools, prompt
 * and idea of what a project was. That made the common request impossible:
 * you could not upload a video and ask for the music to be quieter, because
 * no flow owned "quieter". The pipelines are still here — they are host tools
 * and skills now — but the agent that reaches for them is one agent, and
 * every project gets all of it (see ../agent/).
 *
 * `getAgent()` takes no argument on purpose. Project rows still carry the
 * `flow` column they were created with, because it names their directory on
 * disk, but nothing branches on it any more.
 */
import { studioAgent } from '../agent/index.js'

export function getAgent(): typeof studioAgent {
  return studioAgent
}

export type { Description, Output, Scene, Slide, TurnInput, UploadRef } from './types.js'
