// Talks to the Laya worker (laya.worker.ts). The model loads and predicts there, so the WebView's UI
// thread never runs the tokenizer, the ONNX runtime or the 300 MB fetch.

import type { LayaAgent, LayaChoiceQuestion } from '@/domain/classifier/laya'

export type LayaWorkerRequest =
  | { type: 'load'; url: string }
  | { type: 'predict'; id: number; state: unknown; questions: Record<string, LayaChoiceQuestion> }

export type LayaWorkerResponse =
  | { type: 'loaded' }
  | { type: 'load-failed'; message: string }
  | { type: 'predicted'; id: number; result: { answers: Record<string, unknown> } }
  | { type: 'predict-failed'; id: number; message: string }

/** The part of Worker the proxy uses, so a test can stand in for it. */
export interface LayaWorkerLike {
  onmessage: ((event: MessageEvent<LayaWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: LayaWorkerRequest): void
  terminate(): void
}

type Pending = { resolve: (result: { answers: Record<string, unknown> }) => void; reject: (error: Error) => void }

export class LayaWorkerAgent implements LayaAgent {
  private readonly pending = new Map<number, Pending>()
  private readonly worker: LayaWorkerLike
  private nextId = 0
  private failure: Error | null = null

  private constructor(worker: LayaWorkerLike) {
    this.worker = worker
    worker.onmessage = ({ data }) => {
      if (data.type !== 'predicted' && data.type !== 'predict-failed') return
      const entry = this.pending.get(data.id)
      if (!entry) return
      this.pending.delete(data.id)
      if (data.type === 'predicted') entry.resolve(data.result)
      else entry.reject(new Error(data.message))
    }
    worker.onerror = (event) => this.fail(new Error(`laya worker crashed: ${event.message ?? 'unknown error'}`))
    worker.onmessageerror = () => this.fail(new Error('laya worker sent an unreadable message'))
  }

  /** Starts the worker and resolves once the model is loaded in it. A failed load stops the worker. */
  static load(url: string, createWorker: () => LayaWorkerLike): Promise<LayaWorkerAgent> {
    return new Promise((resolve, reject) => {
      let worker: LayaWorkerLike
      try {
        worker = createWorker()
      } catch (error) {
        reject(error)
        return
      }
      const stop = (error: Error) => {
        worker.terminate()
        reject(error)
      }
      worker.onmessage = ({ data }) => {
        if (data.type === 'loaded') resolve(new LayaWorkerAgent(worker))
        else if (data.type === 'load-failed') stop(new Error(data.message))
      }
      worker.onerror = (event) => stop(new Error(`laya worker crashed: ${event.message ?? 'unknown error'}`))
      worker.onmessageerror = () => stop(new Error('laya worker sent an unreadable message'))
      worker.postMessage({ type: 'load', url })
    })
  }

  predict(state: unknown, questions: Record<string, LayaChoiceQuestion>): Promise<{ answers: Record<string, unknown> }> {
    if (this.failure) return Promise.reject(this.failure)
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ type: 'predict', id, state, questions })
    })
  }

  private fail(error: Error): void {
    this.failure = error
    this.worker.terminate()
    for (const entry of this.pending.values()) entry.reject(error)
    this.pending.clear()
  }
}
