import * as Tone from "tone";
import type { MidiNoteEvent } from "./midi";
import { SCALES, snapPitch, type ScaleName } from "./scale";
import { VOICE_PRESETS, type SynthVoice, type VoiceId } from "./voices";

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

/** A selected note tile (slot=false) or an empty clicked step (slot=true). */
export interface Selection {
  layerId: number;
  start: number; // ticks
  midi: number;
  slot: boolean;
}

export type Quantize = "8n" | "16n" | "32n" | "free";

export const TICKS_PER_SIXTEENTH = 48; // Tone's default PPQ (192) / 4

const SLOT_VELOCITY = 0.8;

type PartEvent = RecordedNote & { time: string };

export class LoopEngine {
  layers: Layer[] = [];
  armed = false;
  quantize: Quantize = "16n";
  voiceId: VoiceId = "keys";
  scaleRoot = 0; // pitch class, 0 = C
  scaleName: ScaleName = "chromatic";
  /** A note/step picked on the grid; the next played key edits it. */
  selection: Selection | null = null;
  /** Visual playhead step (0..steps-1), fired via Tone.Draw. */
  onStep: ((step: number) => void) | null = null;

  private voice: SynthVoice;
  private parts = new Map<number, Tone.Part<PartEvent>>();
  private pending = new Map<number, { start: number; velocity: number; pitch: number }>();
  private nextLayerId = 1;
  private activeId = 0;
  private bars = 2;
  private repeatId: number;
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.voice = VOICE_PRESETS[0].build();

    const transport = Tone.getTransport();
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = `${this.bars}m`;
    transport.bpm.value = 100;

    this.repeatId = transport.scheduleRepeat((time) => this.onSixteenth(time), "16n", 0);

    this.addLayer();
  }

  private onSixteenth(time: number) {
    const total = this.loopTicks();
    const raw = Tone.getTransport().getTicksAtTime(time);
    const ticks = ((raw % total) + total) % total;
    Tone.getDraw().schedule(() => this.onStep?.(Math.floor(ticks / TICKS_PER_SIXTEENTH)), time);
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

  private snap(midi: number) {
    if (this.scaleName === "chromatic") return midi;
    return snapPitch(midi, this.scaleRoot, SCALES[this.scaleName]);
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
    this.voice.allOff();
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

  setVoice(id: VoiceId) {
    if (id === this.voiceId) return;
    const preset = VOICE_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    this.voice.dispose();
    this.voice = preset.build();
    this.voiceId = id;
    this.touch();
  }

  setScaleRoot(root: number) {
    this.scaleRoot = ((root % 12) + 12) % 12;
    this.touch();
  }

  setScaleName(scaleName: ScaleName) {
    this.scaleName = scaleName;
    this.touch();
  }

  /** Move every pitch in the active layer onto the chosen scale. */
  snapActiveLayerToScale() {
    if (this.scaleName === "chromatic") return;
    const layer = this.activeLayer;
    if (!layer) return;
    const merged = new Map<string, RecordedNote>();
    for (const note of layer.notes) {
      const moved: RecordedNote = { ...note, midi: this.snap(note.midi) };
      const key = `${moved.start}:${moved.midi}`;
      const keep = merged.get(key);
      if (!keep || moved.duration > keep.duration) merged.set(key, moved);
    }
    layer.notes = [...merged.values()].sort((a, b) => a.start - b.start);
    this.syncPart(layer);
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

  setSelection(selection: Selection | null) {
    this.selection = selection;
    this.touch();
  }

  handleNoteOn(event: MidiNoteEvent) {
    this.voice.attack(event.midi, event.velocity);
    const selection = this.selection;
    if (selection && this.editSelection(selection, event.midi)) {
      this.selection = null;
      this.touch();
      return;
    }
    const transport = Tone.getTransport();
    if (!this.armed || transport.state !== "started") return;
    const total = this.loopTicks();
    const q = this.quantizeTicks();
    let start = transport.ticks;
    if (q > 0) start = Math.round(start / q) * q;
    start = ((start % total) + total) % total;
    this.pending.set(event.midi, {
      start,
      velocity: event.velocity,
      pitch: this.snap(event.midi),
    });
  }

  handleNoteOff(midi: number) {
    this.voice.release(midi);
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
    layer.notes = layer.notes.filter(
      (note) => note.midi !== pending.pitch || note.start !== pending.start,
    );
    layer.notes.push({
      midi: pending.pitch,
      velocity: pending.velocity,
      start: pending.start,
      duration,
    });
    this.syncPart(layer);
    this.touch();
  }

  /** Re-pitch the selected note, or fill the selected empty step, with midi. */
  private editSelection(selection: Selection, midi: number) {
    const layer = this.layers.find((candidate) => candidate.id === selection.layerId);
    if (!layer) return false;
    const pitch = this.snap(midi);
    if (selection.slot) {
      layer.notes = layer.notes.filter(
        (note) => note.start !== selection.start || note.midi !== pitch,
      );
      layer.notes.push({
        midi: pitch,
        velocity: SLOT_VELOCITY,
        start: selection.start,
        duration: TICKS_PER_SIXTEENTH,
      });
      this.syncPart(layer);
      this.touch();
      return true;
    }
    const index = layer.notes.findIndex(
      (note) => note.midi === selection.midi && note.start === selection.start,
    );
    if (index < 0) return false;
    const moved = { ...layer.notes[index], midi: pitch };
    layer.notes = layer.notes
      .filter((_note, position) => position !== index)
      .filter((note) => note.start !== moved.start || note.midi !== pitch);
    layer.notes.push(moved);
    this.syncPart(layer);
    this.touch();
    return true;
  }

  /** Remove the selected note from the grid (empty-step selections just deselect). */
  deleteSelection() {
    const selection = this.selection;
    if (!selection) return;
    this.selection = null;
    this.touch();
    if (selection.slot) return;
    const layer = this.layers.find((candidate) => candidate.id === selection.layerId);
    if (!layer) return;
    layer.notes = layer.notes.filter(
      (note) => !(note.midi === selection.midi && note.start === selection.start),
    );
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
        const duration = Tone.Ticks(note.duration).toSeconds();
        this.voice.attackRelease(note.midi, duration, time, note.velocity);
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
    this.voice.dispose();
  }
}

export const loopEngine = new LoopEngine();