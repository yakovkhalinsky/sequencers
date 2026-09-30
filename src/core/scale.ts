export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const;

export type ScaleName = keyof typeof SCALES;

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export const SCALE_OPTIONS: Array<{ id: ScaleName; label: string }> = [
  { id: "chromatic", label: "Chromatic" },
  { id: "major", label: "Major" },
  { id: "minor", label: "Minor" },
  { id: "dorian", label: "Dorian" },
  { id: "mixolydian", label: "Mixolydian" },
  { id: "pentatonicMajor", label: "Pentatonic" },
  { id: "pentatonicMinor", label: "Pent. minor" },
  { id: "blues", label: "Blues" },
];

/** Round a MIDI note to the nearest pitch in the scale (ties prefer down). */
export function snapPitch(midi: number, root: number, scale: readonly number[]): number {
  const inSet = (pitch: number) => scale.includes((((pitch - root) % 12) + 12) % 12);
  if (inSet(midi)) return midi;
  for (let distance = 1; distance <= 6; distance += 1) {
    const down = midi - distance;
    if (inSet(down)) return down;
    const up = midi + distance;
    if (inSet(up)) return up;
  }
  return midi;
}