import { cleanup } from '@solidjs/testing-library'
import { afterEach } from 'vitest'

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
