export interface CreditBalanceEventDetail {
  balance?: number
  pending?: boolean
}

/** Reject HTTP responses that started before a newer live balance arrived. */
export function createCreditBalanceState(apply: (balance: number) => void) {
  let revision = 0
  let request: AbortController | undefined
  let pending = false
  return {
    beginRequest() {
      request?.abort()
      request = new AbortController()
      return { signal: request.signal, revision }
    },
    applyRequest(balance: number, startedAt: number) {
      if (startedAt !== revision || pending) return false
      apply(balance)
      return true
    },
    applyLive(detail: CreditBalanceEventDetail) {
      if (typeof detail.balance !== 'number') return false
      revision++
      request?.abort()
      pending = detail.pending === true
      apply(detail.balance)
      return true
    },
    shouldPoll: () => !pending,
    dispose() {
      request?.abort()
    },
  }
}
