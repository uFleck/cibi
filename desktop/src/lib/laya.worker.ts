// Runs the Laya model off the UI thread (see layaWorkerAgent.ts for the other side). Requests are
// handled one at a time, in arrival order.

import type { Agent } from '@/vendor/laya/agent'
import type { LayaWorkerRequest, LayaWorkerResponse } from './layaWorkerAgent'

type WorkerScope = {
  onmessage: ((event: MessageEvent<LayaWorkerRequest>) => void) | null
  postMessage(message: LayaWorkerResponse): void
}
const scope = self as unknown as WorkerScope

// Agent.load picks its browser path (fetch + onnxruntime-web) by looking for `window`, which a worker lacks.
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })

let agent: Agent | null = null
let queue: Promise<void> = Promise.resolve()

scope.onmessage = (event) => {
  queue = queue.then(() => handle(event.data))
}

async function handle(request: LayaWorkerRequest): Promise<void> {
  if (request.type === 'load') {
    try {
      const [{ Agent }, providers] = await Promise.all([import('@/vendor/laya/agent'), import('@/vendor/laya/providers')])
      providers.setOrtLoader('web', () => import('onnxruntime-web'))
      agent = await Agent.load(request.url)
      scope.postMessage({ type: 'loaded' })
    } catch (error) {
      scope.postMessage({ type: 'load-failed', message: messageOf(error) })
    }
    return
  }
  try {
    if (agent === null) throw new Error('laya: predict before load')
    const result = await agent.predict(request.state, request.questions)
    scope.postMessage({ type: 'predicted', id: request.id, result: { answers: result.answers } })
  } catch (error) {
    scope.postMessage({ type: 'predict-failed', id: request.id, message: messageOf(error) })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
