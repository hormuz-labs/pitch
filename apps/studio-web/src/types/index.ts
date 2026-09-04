/**
 * Shared app types. Project/studio shapes live in lib/studio-api.ts and are
 * re-exported here so views can keep importing from '../types'.
 */
export type {
  Description,
  Entry,
  EntryRole,
  ExportStatus,
  FlowId,
  MusicTrack,
  Output,
  Preview,
  Project,
  ProjectDetail,
  ProjectStatus,
  PublicProject,
  Scene,
  Slide,
  StudioEvent,
  UploadRef,
} from '../lib/studio-api'

/** GET /users/me */
export interface UserProfile {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
  role?: 'user' | 'admin' | string
  createdAt?: string
}

/** GET /credits */
export interface CreditTransaction {
  id: string
  type: string
  delta: number
  balanceAfter?: number
  description?: string | null
  createdAt: string
}

export interface CreditsSummary {
  balance: number
  activeSubscription?: { planKey: string; status?: string; renewsAt?: string | null } | null
  transactions?: CreditTransaction[]
}
