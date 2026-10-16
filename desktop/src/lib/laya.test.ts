import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/domain/categories'

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  appDataDir: vi.fn(async () => 'C:\\Users\\me\\AppData\\Roaming\\com.ufleck.cibi\\'),
}))

const laya = vi.hoisted(() => ({
  load: vi.fn(),
  predict: vi.fn(),
  setOrtLoader: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: tauri.isTauri,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: tauri.appDataDir,
  join: async (...parts: string[]) => parts.join('\\').replace(/\\+/g, '\\'),
}))

vi.mock('@/vendor/laya/agent', () => ({ Agent: { load: laya.load } }))
vi.mock('@/vendor/laya/providers', () => ({ setOrtLoader: laya.setOrtLoader }))

const MODEL_FOLDER = 'C:\\Users\\me\\AppData\\Roaming\\com.ufleck.cibi\\models\\laya'
const MODEL_URL = `http://asset.localhost/${encodeURIComponent(MODEL_FOLDER)}`

beforeEach(() => {
  vi.resetModules()
  tauri.isTauri.mockReturnValue(true)
  tauri.appDataDir.mockResolvedValue('C:\\Users\\me\\AppData\\Roaming\\com.ufleck.cibi\\')
  laya.load.mockReset()
  laya.predict.mockReset()
  laya.setOrtLoader.mockReset()
  laya.load.mockResolvedValue({ predict: laya.predict })
  laya.predict.mockResolvedValue({
    answers: { category: { type: 'choice', choice: 'Outros', answer_confidence: 0.95 } },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function freshModules() {
  const lib = await import('./laya')
  const classifier = await import('@/domain/classifier')
  return { lib, classifier }
}

/** A fetch that serves every model file, except the ones given a status in `statuses` (by file name). */
function serveModel(statuses: Record<string, number> = {}) {
  return vi.fn(async (url: string) => {
    const name = url.split('/').pop() ?? ''
    const status = statuses[name] ?? 200
    return new Response(status === 200 ? 'x' : null, { status })
  })
}

describe('activateLaya', () => {
  it('stays on the rules classifier outside Tauri', async () => {
    tauri.isTauri.mockReturnValue(false)
    const fetchMock = serveModel()
    vi.stubGlobal('fetch', fetchMock)
    const { lib, classifier } = await freshModules()
    const before = classifier.getClassifier()
    expect(await lib.activateLaya()).toEqual({ state: 'rules' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(classifier.getClassifier()).toBe(before)
  })

  it('reports a missing model and leaves the rules classifier active', async () => {
    vi.stubGlobal('fetch', serveModel({ 'encoder.onnx': 404, 'head.onnx': 404, 'tokenizer.json': 404, 'rl_agent_config.json': 404 }))
    const { lib, classifier } = await freshModules()
    const before = classifier.getClassifier()
    expect(await lib.activateLaya()).toEqual({ state: 'missing', folder: MODEL_FOLDER })
    expect(classifier.getClassifier()).toBe(before)
  })

  it('reports a missing model when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'missing', folder: MODEL_FOLDER })
  })

  it('probes every required file before it registers Laya', async () => {
    const fetchMock = serveModel()
    vi.stubGlobal('fetch', fetchMock)
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'active', folder: MODEL_FOLDER })
    const probed = fetchMock.mock.calls.map((call) => String(call[0]).split('/').pop())
    expect(probed).toEqual(expect.arrayContaining(['encoder.onnx', 'head.onnx', 'tokenizer.json', 'rl_agent_config.json', 'head.onnx.data']))
  })

  it('treats a partial install as missing and does not register Laya', async () => {
    vi.stubGlobal('fetch', serveModel({ 'encoder.onnx': 404 }))
    const { lib, classifier } = await freshModules()
    const before = classifier.getClassifier()
    expect(await lib.activateLaya()).toEqual({ state: 'missing', folder: MODEL_FOLDER })
    expect(classifier.getClassifier()).toBe(before)
  })

  it('treats a missing tokenizer as missing even when the encoder is there', async () => {
    vi.stubGlobal('fetch', serveModel({ 'tokenizer.json': 404 }))
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'missing', folder: MODEL_FOLDER })
  })

  it('accepts an install without the head sidecar, which the exporter writes only when needed', async () => {
    vi.stubGlobal('fetch', serveModel({ 'head.onnx.data': 404 }))
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'active', folder: MODEL_FOLDER })
  })

  it('treats a sidecar whose lookup fails as missing', async () => {
    vi.stubGlobal('fetch', serveModel({ 'head.onnx.data': 500 }))
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'missing', folder: MODEL_FOLDER })
  })

  it('registers Laya after the rules: rules answer first and the model is not loaded for them', async () => {
    vi.stubGlobal('fetch', serveModel())
    const { lib, classifier } = await freshModules()
    await lib.activateLaya()
    const active = classifier.getClassifier()
    expect(await active.classify('Carrefour', DEFAULT_CATEGORIES)).toEqual({ category: 'Mercado', confidence: 0.9 })
    expect(laya.load).not.toHaveBeenCalled()
    expect(laya.predict).not.toHaveBeenCalled()
  })

  it('asks Laya only when the rules have no answer, through the asset URL of the model folder', async () => {
    vi.stubGlobal('fetch', serveModel())
    const { lib, classifier } = await freshModules()
    await lib.activateLaya()
    const result = await classifier.getClassifier().classify('Pet shop', DEFAULT_CATEGORIES)
    expect(result).toEqual({ category: 'Outros', confidence: 0.95, minConfidence: 0.8 })
    expect(laya.load).toHaveBeenCalledWith(MODEL_URL)
    expect(laya.setOrtLoader).toHaveBeenCalledWith('web', expect.any(Function))
    expect(laya.predict).toHaveBeenCalledWith('Pagamento: Pet shop', expect.any(Object))
  })

  it('runs once and returns the same status afterwards', async () => {
    const fetchMock = serveModel({ 'encoder.onnx': 404 })
    vi.stubGlobal('fetch', fetchMock)
    const { lib } = await freshModules()
    const first = lib.activateLaya()
    const second = lib.activateLaya()
    expect(second).toBe(first)
    await first
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('falls back to rules when the app data folder cannot be resolved', async () => {
    tauri.appDataDir.mockRejectedValue(new Error('no app data'))
    const { lib } = await freshModules()
    expect(await lib.activateLaya()).toEqual({ state: 'rules' })
  })
})

describe('warmLaya', () => {
  it('loads the model in the background, so a later save-path lookup can use it', async () => {
    vi.stubGlobal('fetch', serveModel())
    const { lib, classifier } = await freshModules()
    lib.warmLaya()
    await vi.waitFor(() => expect(laya.load).toHaveBeenCalledWith(MODEL_URL))
    expect(await classifier.getClassifier().classify('Pet shop', DEFAULT_CATEGORIES, { onlyIfReady: true })).toEqual({
      category: 'Outros',
      confidence: 0.95,
      minConfidence: 0.8,
    })
  })

  it('does not load the model before warm-up, so a save never starts it', async () => {
    vi.stubGlobal('fetch', serveModel())
    const { lib, classifier } = await freshModules()
    await lib.activateLaya()
    expect(await classifier.getClassifier().classify('Pet shop', DEFAULT_CATEGORIES, { onlyIfReady: true })).toBeNull()
    expect(laya.load).not.toHaveBeenCalled()
  })
})
