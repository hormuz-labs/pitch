import { useCallback, useState } from 'react'

export function useStepSequence(count: number) {
  const [active, setActive] = useState(-1)
  const [doneUpTo, setDoneUpTo] = useState(-1)

  const start = useCallback(() => setActive(0), [])

  const stepProps = useCallback(
    (i: number) => ({
      active: active === i,
      onComplete: () => {
        setDoneUpTo(i)
        setActive(i + 1 < count ? i + 1 : -1)
      },
    }),
    [active, count],
  )

  const cardProps = useCallback(
    (i: number) => ({
      active: active === i,
      done: doneUpTo >= i,
    }),
    [active, doneUpTo],
  )

  return { start, stepProps, cardProps }
}
