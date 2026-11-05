/**
 * The completion chime: two struck bell notes, synthesised, no audio asset.
 *
 * The reference is the sound a download manager makes when a file lands — a
 * bright two-note figure you can recognise from the next room without it being
 * loud. It is built from two FM bells: an inharmonic modulator gives each strike
 * its metallic edge, and an exponential envelope gives it the short decay that
 * makes a bell read as a bell rather than as a beep.
 *
 * A synthesised figure rather than a bundled recording is deliberate. It is a
 * few hundred bytes instead of a media file, it follows the system volume, and
 * the same code can make the failure figure darker without shipping a second
 * asset.
 *
 * Browsers do not allow audio before a gesture, so the context is created and
 * resumed on the first pointer or key event. Until then a completion is silent —
 * the visual surfaces still work.
 *
 * @module dsh-task-notice/client/sound
 */

/** One audio context for the page, created on the first gesture. */
let audio: AudioContext | undefined

/** When the last figure started, for coalescing a burst of completions. */
let lastPlayedAt = 0

/** Minimum gap between two figures, in milliseconds. */
const COALESCE_MS = 900

/** Whether this browser can make the sound at all. */
export function soundSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

/**
 * Create or resume the shared audio context. Call from a user gesture.
 * @returns the context, or `undefined` when the browser has no Web Audio.
 */
export function unlockAudio(): AudioContext | undefined {
  if (!soundSupported()) return undefined
  try {
    audio ??= new window.AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return undefined
  }
}

/**
 * Whether the context is running, so a silent chime can be explained.
 * @returns whether audio can play right now.
 */
export function audioReady(): boolean {
  return audio !== undefined && audio.state === 'running'
}

/** Release the audio context when the plugin unmounts (including HMR reloads). */
export function disposeAudio(): void {
  if (audio === undefined) return
  void audio.close().catch(() => {})
  audio = undefined
}

/**
 * One struck bell.
 * @param context - destination context.
 * @param output - gain node the strike feeds.
 * @param at - start time on the context clock.
 * @param frequency - fundamental in hertz.
 * @param peak - peak gain before the envelope decays.
 */
function strike(context: AudioContext, output: AudioNode, at: number, frequency: number, peak: number): void {
  const carrier = context.createOscillator()
  carrier.type = 'sine'
  carrier.frequency.setValueAtTime(frequency, at)

  // 3.01 is deliberately inharmonic: a whole-number ratio would sound like an
  // organ, this ratio is what gives a struck bell its shimmer.
  const modulator = context.createOscillator()
  modulator.type = 'sine'
  modulator.frequency.setValueAtTime(frequency * 3.01, at)
  const modulation = context.createGain()
  modulation.gain.setValueAtTime(frequency * 0.32, at)
  modulator.connect(modulation)
  modulation.connect(carrier.frequency)

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, at)
  envelope.gain.exponentialRampToValueAtTime(peak, at + 0.006)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.15)

  carrier.connect(envelope)
  envelope.connect(output)
  carrier.start(at)
  modulator.start(at)
  carrier.stop(at + 1.2)
  modulator.stop(at + 1.2)
}

/**
 * Play the figure for one completion or decision.
 * @param tone - `done` rises, `failed` falls, `decision` climbs a third,
 *   higher step so a question is recognisable before the words are read.
 * @param volume - 0–1 gain.
 * @returns whether a figure was actually scheduled.
 */
export function playChime(tone: 'done' | 'failed' | 'decision', volume: number): boolean {
  const context = audio
  if (context === undefined || context.state !== 'running' || volume <= 0) return false
  const now = Date.now()
  if (now - lastPlayedAt < COALESCE_MS) return true
  lastPlayedAt = now
  const start = context.currentTime + 0.03
  const master = context.createGain()
  master.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), start)
  master.connect(context.destination)
  if (tone === 'decision') {
    strike(context, master, start, 783.99, 0.14)
    strike(context, master, start + 0.18, 1046.5, 0.13)
    strike(context, master, start + 0.36, 1318.51, 0.16)
    return true
  }
  const [first, second] = tone === 'done' ? [1318.51, 987.77] : [659.25, 493.88]
  strike(context, master, start, first, 0.16)
  strike(context, master, start + 0.19, second, 0.13)
  return true
}

/**
 * Play a short figure for the settings "test" button, bypassing coalescing.
 * @param volume - 0–1 gain.
 * @returns whether anything was scheduled.
 */
export function testChime(volume: number): boolean {
  lastPlayedAt = 0
  return playChime('done', volume)
}
