export interface MidiNoteEvent {
  midi: number; // MIDI note number
  velocity: number; // 0..1
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
}

type NoteOnHandler = (event: MidiNoteEvent) => void;
type NoteOffHandler = (midi: number) => void;
type DevicesHandler = (devices: MidiDeviceInfo[]) => void;

// Minimal structural types for the Web MIDI API — TypeScript's lib.dom
// versions vary between releases, so these keep us version-proof.
interface MidiMessageEventLike {
  data: Uint8Array | null;
}
interface MidiInputLike {
  id: string;
  name: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
}
interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: ((event: Event) => void) | null;
}
type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
};

export class MidiInput {
  onNoteOn: NoteOnHandler = () => {};
  onNoteOff: NoteOffHandler = () => {};
  onDevicesChanged: DevicesHandler = () => {};

  private access: MidiAccessLike | null = null;
  private selectedId: string | null = null;

  async init(): Promise<MidiDeviceInfo[]> {
    if (!this.access) {
      const nav = navigator as NavigatorWithMidi;
      if (!nav.requestMIDIAccess) {
        throw new Error("Web MIDI not available in this browser — try Chromium.");
      }
      // The nanoKEY2 is a plain note source; sysex access is not needed.
      this.access = (await nav.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
      this.access.onstatechange = () => {
        this.bindSelected();
        this.onDevicesChanged(this.devices);
      };
      this.bindSelected();
    }
    return this.devices;
  }

  dispose() {
    if (this.access) {
      this.access.onstatechange = null;
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.access = null;
  }

  get devices(): MidiDeviceInfo[] {
    const inputs = this.access?.inputs ?? new Map();
    return [...inputs.values()].map((input) => ({
      id: input.id,
      name: input.name ?? input.id,
    }));
  }

  select(id: string | null) {
    this.selectedId = id;
    this.bindSelected();
  }

  private bindSelected() {
    for (const input of this.access?.inputs.values() ?? []) {
      input.onmidimessage =
        this.selectedId === null || input.id === this.selectedId
          ? (event) => this.handleMessage(event)
          : null;
    }
  }

  private handleMessage(event: MidiMessageEventLike) {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [status, midi, velocity = 0] = data;
    const command = status & 0xf0;
    if (command === 0x90 && velocity > 0) {
      this.onNoteOn({ midi, velocity: velocity / 127 });
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.onNoteOff(midi);
    }
  }
}