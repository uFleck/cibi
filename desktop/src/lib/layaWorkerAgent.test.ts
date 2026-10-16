import { describe, expect, it, vi } from 'vitest'
import { LayaWorkerAgent, type LayaWorkerLike, type LayaWorkerRequest, type LayaWorkerResponse } from './layaWorkerAgent'

function fakeWorker() {
  const sent: LayaWorkerRequest[] = []
  const worker: LayaWorkerLike & { reply(data: LayaWorkerResponse): void } = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message) => void sent.push(message),
    terminate: vi.fn(),
    reply: (data) => worker.onmessage?.({ data } as MessageEvent<LayaWorkerResponse>),
  }
  return { worker, sent }
}

async function loaded() {
  const { worker, sent } = fakeWorker()
  const pending = LayaWorkerAgent.load('http://asset.localhost/model', () => worker)
  worker.reply({ type: 'loaded' })
  return { agent: await pending, worker, sent }
}

const questions = { category: { type: 'choice' as const, instructions: 'Which?', criteria: { A: 'a' } } }

describe('LayaWorkerAgent.load', () => {
  it('asks the worker to load the model and resolves when it is loaded', async () => {
    const { sent } = await loaded()
    expect(sent).toEqual([{ type: 'load', url: 'http://asset.localhost/model' }])
  })

  it('rejects and stops the worker when the load fails', async () => {
    const { worker } = fakeWorker()
    const pending = LayaWorkerAgent.load('u', () => worker)
    worker.reply({ type: 'load-failed', message: 'bad model' })
    await expect(pending).rejects.toThrow('bad model')
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('rejects when the worker cannot be created', async () => {
    await expect(
      LayaWorkerAgent.load('u', () => {
        throw new Error('no worker')
      }),
    ).rejects.toThrow('no worker')
  })

  it('rejects when the worker crashes while loading', async () => {
    const { worker } = fakeWorker()
    const pending = LayaWorkerAgent.load('u', () => worker)
    worker.onerror?.({ message: 'boom' } as ErrorEvent)
    await expect(pending).rejects.toThrow('laya worker crashed: boom')
    expect(worker.terminate).toHaveBeenCalled()
  })
})

describe('LayaWorkerAgent.predict', () => {
  it('matches each answer to its own request', async () => {
    const { agent, worker, sent } = await loaded()
    const first = agent.predict('one', questions)
    const second = agent.predict('two', questions)
    const [, a, b] = sent
    if (a?.type !== 'predict' || b?.type !== 'predict') throw new Error('expected predict requests')
    expect([a.state, b.state]).toEqual(['one', 'two'])
    worker.reply({ type: 'predicted', id: b.id, result: { answers: { category: 'B' } } })
    worker.reply({ type: 'predicted', id: a.id, result: { answers: { category: 'A' } } })
    expect(await first).toEqual({ answers: { category: 'A' } })
    expect(await second).toEqual({ answers: { category: 'B' } })
  })

  it('rejects the one request the worker reports as failed', async () => {
    const { agent, worker, sent } = await loaded()
    const failed = agent.predict('x', questions)
    const [, request] = sent
    if (request?.type !== 'predict') throw new Error('expected a predict request')
    worker.reply({ type: 'predict-failed', id: request.id, message: 'no tokens' })
    await expect(failed).rejects.toThrow('no tokens')
  })

  it('rejects pending and later requests once the worker crashes', async () => {
    const { agent, worker } = await loaded()
    const pending = agent.predict('x', questions)
    worker.onerror?.({ message: 'boom' } as ErrorEvent)
    await expect(pending).rejects.toThrow('laya worker crashed: boom')
    await expect(agent.predict('y', questions)).rejects.toThrow('laya worker crashed: boom')
    expect(worker.terminate).toHaveBeenCalled()
  })
})
