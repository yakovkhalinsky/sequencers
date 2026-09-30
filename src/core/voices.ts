import * as Tone from "tone";

export interface SynthVoice {
  attack(midi: number, velocity: number, time?: number): void;
  attackRelease(midi: number, duration: number, time: number, velocity: number): void;
  release(midi: number, time?: number): void;
  allOff(): void;
  dispose(): void;
}

export type VoiceId = "keys" | "bass" | "acid" | "pluck" | "pad" | "lead";

export interface VoiceDef {
  id: VoiceId;
  name: string;
  transpose: number;
  build(): SynthVoice;
}

type Instrument = Tone.PolySynth | Tone.MonoSynth;

function makeVoice(instrument: Instrument, transpose: number, extra: Array<{ dispose(): void }> = []): SynthVoice {
  const mono = instrument instanceof Tone.PolySynth ? null : (instrument as Tone.MonoSynth);
  const name = (midi: number) => Tone.Midi(midi + transpose).toNote();
  return {
    attack: (midi, velocity, time) => {
      const at = time ?? Tone.now();
      const note = name(midi);
      if (mono) mono.triggerAttack(note, at, velocity);
      else (instrument as Tone.PolySynth).triggerAttack(note, at, velocity);
    },
    attackRelease: (midi, duration, time, velocity) => {
      if (mono) mono.triggerAttackRelease(name(midi), duration, time, velocity);
      else (instrument as Tone.PolySynth).triggerAttackRelease(name(midi), duration, time, velocity);
    },
    release: (midi, time) => {
      if (mono) mono.triggerRelease(time);
      else (instrument as Tone.PolySynth).triggerRelease(name(midi), time);
    },
    allOff: () => {
      if (mono) mono.triggerRelease();
      else (instrument as Tone.PolySynth).releaseAll();
    },
    dispose: () => {
      instrument.dispose();
      for (const node of extra) node.dispose();
    },
  };
}

export const VOICE_PRESETS: VoiceDef[] = [
  {
    id: "keys",
    name: "Soft Keys",
    transpose: 0,
    build: () => {
      const instrument = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.25, sustain: 0.35, release: 0.3 },
      }).toDestination();
      return makeVoice(instrument, 0);
    },
  },
  {
    id: "bass",
    name: "Analog Bass",
    transpose: -12,
    build: () => {
      const instrument = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.25, release: 0.2 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.35,
          sustain: 0.2,
          release: 0.2,
          baseFrequency: 120,
          octaves: 2.6,
        },
        filter: { Q: 3 },
      }).toDestination();
      return makeVoice(instrument, -12);
    },
  },
  {
    id: "acid",
    name: "Acid",
    transpose: -24,
    build: () => {
      const instrument = new Tone.MonoSynth({
        oscillator: { type: "square" },
        envelope: { attack: 0.002, decay: 0.2, sustain: 0.2, release: 0.12 },
        filterEnvelope: {
          attack: 0.002,
          decay: 0.22,
          sustain: 0.05,
          release: 0.1,
          baseFrequency: 180,
          octaves: 2.5,
        },
        filter: { Q: 8, type: "lowpass" },
      }).toDestination();
      return makeVoice(instrument, -24);
    },
  },
  {
    id: "pluck",
    name: "Pluck",
    transpose: 0,
    build: () => {
      const instrument = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", spread: 24 },
        envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.25 },
      });
      const filter = new Tone.Filter({ type: "lowpass", frequency: 2400, Q: 1 }).toDestination();
      instrument.connect(filter);
      return makeVoice(instrument, 0, [filter]);
    },
  },
  {
    id: "pad",
    name: "Warm Pad",
    transpose: 0,
    build: () => {
      const instrument = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", spread: 40 },
        envelope: { attack: 0.6, decay: 0.6, sustain: 0.6, release: 1.6 },
      });
      const filter = new Tone.Filter({ type: "lowpass", frequency: 1500 }).toDestination();
      instrument.connect(filter);
      return makeVoice(instrument, 0, [filter]);
    },
  },
  {
    id: "lead",
    name: "Analog Lead",
    transpose: 0,
    build: () => {
      const instrument = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.55, release: 0.3 },
        filterEnvelope: {
          attack: 0.02,
          decay: 0.3,
          sustain: 0.5,
          release: 0.3,
          baseFrequency: 700,
          octaves: 2,
        },
        filter: { Q: 2 },
        portamento: 0.04,
      }).toDestination();
      return makeVoice(instrument, 0);
    },
  },
];