// Wires the Laya classifier into the app. The model lives in the app data folder (see docs/laya.md);
// without it the rules classifier is the only one and Settings says so.

import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { appDataDir, join } from '@tauri-apps/api/path'
import { getClassifier, rulesClassifier, setClassifier } from '@/domain/classifier'
import { composeClassifiers } from '@/domain/classifier/compose'
import { createLayaClassifier, type LayaAgent } from '@/domain/classifier/laya'
import { LayaWorkerAgent } from './layaWorkerAgent'

export type LayaStatus =
  | { state: 'rules' }
  | { state: 'missing'; folder: string }
  | { state: 'active'; folder: string }

const REQUIRED_FILES = ['encoder.onnx', 'head.onnx', 'tokenizer.json', 'rl_agent_config.json']
/** Written by the exporter when the head keeps its weights in a sidecar; absent otherwise. */
const OPTIONAL_FILES = ['head.onnx.data']

let activation: Promise<LayaStatus> | null = null

/** Detects the model folder and, if it is complete, registers Laya after the rules. Runs once. */
export function activateLaya(): Promise<LayaStatus> {
  activation ??= activate().catch((): LayaStatus => ({ state: 'rules' }))
  return activation
}

/** Starts loading the model in the background, so the first category lookup does not wait for it. */
export function warmLaya(): void {
  void activateLaya().then(() => getClassifier().warm?.())
}

async function activate(): Promise<LayaStatus> {
  if (!isTauri()) return { state: 'rules' }
  const folder = await join(await appDataDir(), 'models', 'laya')
  const url = convertFileSrc(folder)
  const required = await Promise.all(REQUIRED_FILES.map((f) => probe(`${url}/${f}`)))
  if (required.some((state) => state !== 'ok')) return { state: 'missing', folder }
  const optional = await Promise.all(OPTIONAL_FILES.map((f) => probe(`${url}/${f}`)))
  if (optional.includes('error')) return { state: 'missing', folder }
  setClassifier(composeClassifiers(rulesClassifier, createLayaClassifier(() => loadAgent(url))))
  return { state: 'active', folder }
}

/** 'ok' when the file is served, 'absent' when it is not there, 'error' when the lookup fails. */
async function probe(fileUrl: string): Promise<'ok' | 'absent' | 'error'> {
  try {
    const response = await fetch(fileUrl)
    await response.body?.cancel().catch(() => {})
    if (response.ok) return 'ok'
    return response.status === 404 ? 'absent' : 'error'
  } catch {
    return 'error'
  }
}

/** The model loads and runs in a worker, so classifying never blocks the UI thread. */
function loadAgent(url: string): Promise<LayaAgent> {
  return LayaWorkerAgent.load(url, () => new Worker(new URL('./laya.worker.ts', import.meta.url), { type: 'module' }))
}
