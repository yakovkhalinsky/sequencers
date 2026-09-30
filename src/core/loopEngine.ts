import * as Tone from "tone";
import type { MidiNoteEvent } from "./midi";

export interface RecordedNote {
  midi: number;
  velocity: number; // 0..1
  start: number; // ticks into the loop
  duration: number; // ticks
}

export interface Layer {
  id: number;
  name: string;
  notes: RecordedNote[];
  muted: boolean;
}

export type Quantize = "8n" | "16n" | "32n" | "free";

export const TICKS_PER_SIXTEENTH = 48; // Tone's default PPQ (192) / 4

type PartEvent = RecordedNote & { time: string };

export class LoopEngine {
  layers: Layer[] = [];
  armed = false;
  quantize: Quantize = "16n";
  /** Visual playhead step (0..steps-1), fired via Tone.Draw. */
  onStep: ((step: number) => void) | null = null;

  private synth: Tone.PolySynth;
  private parts = new Map<number, Tone.Part<PartEvent>>();
  private pending = new Map<number, { start: number; velocity: number }>();
  private nextLayerId = 1;
  private activeId = 0;
  private bars = 2;
  private repeatId: number;
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.35, release: 0.3 },
    }).toDestination();

    const transport = Tone.getTransport();
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = `${this.bars}m`;
    transport.bpm.value = 100;
    this.repeatId = transport.scheduleRepeat((time) => {
      const total = this.loopTicks();
      const ticks = ((transport.getTicksAtTime(time) % total) + total) % total;
      Tone.getDraw().schedule(() => this.onStep?.(Math.floor(ticks / TICKS_PER_SIXTEENTH)), time);
    }, "16n", 0);

    this.addLayer();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.revision;

  private touch() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  get loopBars() {
    return this.bars;
  }

  get isPlaying() {
    return Tone.getTransport().state === "started";
  }

  get bpm() {
    return Tone.getTransport().bpm.value;
  }

  get activeLayerId() {
    return this.activeId;
  }

  private get activeLayer(): Layer | undefined {
    return this.layers.find((layer) => layer.id === this.activeId);
  }

  private loopTicks() {
    return Tone.Ticks(`${this.bars}m`).toTicks();
  }

  private quantizeTicks() {
    return this.quantize === "free" ? 0 : Tone.Ticks(this.quantize).toTicks();
  }

  async play() {
    await Tone.start();
    Tone.getTransport().start();
    this.touch();
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    this.synth.releaseAll();
    this.pending.clear();
    this.armed = false;
    this.touch();
  }

  toggleRecord() {
    this.armed = !this.armed;
    if (this.armed && Tone.getTransport().state !== "started") {
      void this.play();
      return;
    }
    this.touch();
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  setQuantize(quantize: Quantize) {
    this.quantize = quantize;
    this.touch();
  }

  setBars(bars: number) {
    this.bars = bars;
    Tone.getTransport().loopEnd = `${bars}m`;
    const total = this.loopTicks();
    for (const layer of this.layers) {
      if (layer.notes.some((note) => note.start >= total)) {
        layer.notes = layer.notes.filter((note) => note.start < total);
      }
      this.syncPart(layer);
    }
    this.touch();
  }

  addLayer() {
    const layer: Layer = {
      id: this.nextLayerId,
      name: `Layer ${this.layers.length + 1}`,
      notes: [],
      muted: false,
    };
    this.nextLayerId += 1;
    this.layers.push(layer);
    this.activeId = layer.id;
    this.touch();
    return layer;
  }

  deleteLayer(id: number) {
    const layer = this.layers.find((candidate) => candidate.id === id);
    if (!layer) return;
    this.parts.get(id)?.dispose();
    this.parts.delete(id);
    this.layers = this.layers.filter((candidate) => candidate.id !== id);
    if (this.activeId === id) {
      this.activeId = this.layers[0]?.id ?? 0;
    }
    if (this.layers.length === 0) {
      this.addLayer();
      return;
    }
    this.touch();
  }

  setActiveLayer(id: number) {
    if (this.layers.some((layer) => layer.id === id)) {
      this.activeId = id;
      this.touch();
    }
  }

  toggleMute(id: number) {
    const layer = this.layers.find((candidate) => candidate.id === id);
    if (!layer) return;
    layer.muted = !layer.muted;
    const part = this.parts.get(id);
    if (part) part.mute = layer.muted;
    this.touch();
  }

  handleNoteOn(event: MidiNoteEvent) {
    this.synth.triggerAttack(Tone.Midi(event.midi).toNote(), Tone.now(), event.velocity);
    const transport = Tone.getTransport();
    if (!this.armed || transport.state !== "started") return;
    const total = this.loopTicks();
    const q = this.quantizeTicks();
    let start = transport.ticks;
    if (q > 0) start = Math.round(start / q) * q;
    start = ((start % total) + total) % total;
    this.pending.set(event.midi, { start, velocity: event.velocity });
  }

  handleNoteOff(midi: number) {
    this.synth.triggerRelease(Tone.Midi(midi).toNote(), Tone.now());
    const pending = this.pending.get(midi);
    if (!pending) return;
    this.pending.delete(midi);
    const layer = this.activeLayer;
    if (!layer) return;
    const total = this.loopTicks();
    const q = this.quantizeTicks();
    const end = ((Tone.getTransport().ticks % total) + total) % total;
    let duration = end - pending.start;
    if (duration <= 0) duration += total; // held across the loop boundary
    if (q > 0) duration = Math.max(Math.round(duration / q) * q, q);
    if (pending.start + duration > total) duration = total - pending.start;
    if (duration <= 0) return;
    layer.notes = [
      ...layer.notes.filter((note) => !(note.midi === midi && note.start === pending.start)),
      { midi, velocity: pending.velocity, start: pending.start, duration },
    ];
    this.syncPart(layer);
    this.touch();
  }

  private syncPart(layer: Layer) {
    const old = this.parts.get(layer.id);
    this.parts.delete(layer.id);
    old?.dispose();
    if (layer.notes.length === 0) return;
    const part = new Tone.Part<PartEvent>(
      (time, note) => {
        this.synth.triggerAttackRelease(
          Tone.Midi(note.midi).toNote(),
          Tone.Ticks(note.duration).toSeconds(),
          time,
          note.velocity,
        );
      },
      layer.notes.map((note) => ({
        ...note,
        time: Tone.Ticks(note.start).toBarsBeatsSixteenths(),
      })),
    );
    part.loop = true;
    part.loopEnd = `${this.bars}m`;
    part.mute = layer.muted;
    part.start(0);
    this.parts.set(layer.id, part);
  }

  dispose() {
    Tone.getTransport().clear(this.repeatId);
    for (const part of this.parts.values()) part.dispose();
    this.parts.clear();
    this.synth.dispose();
  }
}

export const loopEngine = new LoopEngine();