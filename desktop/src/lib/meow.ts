// Tiny synthesized cat sounds (WebAudio, no audio files). Only the secret triggers use them.

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** A short "mew": a pitch glide through a vowel-ish band-pass filter. `pitch` 1 is a normal cat. */
export function meow(pitch = 1, volume = 0.12): void {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime
  const dur = 0.42 / Math.sqrt(pitch)

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(520 * pitch, t)
  osc.frequency.linearRampToValueAtTime(820 * pitch, t + dur * 0.35)
  osc.frequency.exponentialRampToValueAtTime(430 * pitch, t + dur)

  const formant = ac.createBiquadFilter()
  formant.type = 'bandpass'
  formant.Q.value = 4
  formant.frequency.setValueAtTime(900 * pitch, t)
  formant.frequency.linearRampToValueAtTime(1700 * pitch, t + dur * 0.4)
  formant.frequency.linearRampToValueAtTime(1000 * pitch, t + dur)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(formant).connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** A soft purr: low rumble, pulsing about 25 times a second. */
export function purr(seconds = 1.4, volume = 0.1): void {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime

  const length = Math.floor(ac.sampleRate * seconds)
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const noise = ac.createBufferSource()
  noise.buffer = buffer

  const low = ac.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 180

  const pulse = ac.createGain()
  pulse.gain.value = 0
  const lfo = ac.createOscillator()
  lfo.frequency.value = 25
  const lfoDepth = ac.createGain()
  lfoDepth.gain.value = 0.5
  lfo.connect(lfoDepth).connect(pulse.gain)
  const bias = ac.createConstantSource()
  bias.offset.value = 0.5
  bias.connect(pulse.gain)

  const out = ac.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(volume * 4, t + 0.25)
  out.gain.setValueAtTime(volume * 4, t + seconds - 0.35)
  out.gain.exponentialRampToValueAtTime(0.0001, t + seconds)

  noise.connect(low).connect(pulse).connect(out).connect(ac.destination)
  for (const node of [noise, lfo, bias]) {
    node.start(t)
    node.stop(t + seconds + 0.05)
  }
}
