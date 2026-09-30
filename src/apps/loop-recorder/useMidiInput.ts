import { useEffect, useState } from "react";
import { MidiInput, type MidiDeviceInfo } from "../../core/midi";
import type { LoopEngine } from "../../core/loopEngine";

export function useMidiInput(engine: LoopEngine) {
  const [input, setInput] = useState<MidiInput | null>(null);
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const midi = new MidiInput();
    let disposed = false;
    midi.onNoteOn = (event) => engine.handleNoteOn(event);
    midi.onNoteOff = (midi) => engine.handleNoteOff(midi);
    midi.onDevicesChanged = (list) => {
      if (!disposed) setDevices(list);
    };
    midi
      .init()
      .then((list) => {
        if (disposed) return;
        setDevices(list);
        const preferred = list.find((device) => /nanokey2/i.test(device.name)) ?? list[0];
        if (preferred) {
          midi.select(preferred.id);
          setSelectedId(preferred.id);
        }
        setInput(midi);
      })
      .catch((err: unknown) => {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
      midi.dispose();
    };
  }, [engine]);

  return {
    devices,
    selectedId,
    error,
    select: (id: string | null) => {
      input?.select(id);
      setSelectedId(id);
    },
  };
}