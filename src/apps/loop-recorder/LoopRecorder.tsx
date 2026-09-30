import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loopEngine, type Quantize } from "../../core/loopEngine";
import { NOTE_NAMES, SCALE_OPTIONS, type ScaleName } from "../../core/scale";
import { VOICE_PRESETS, type VoiceId } from "../../core/voices";
import { useMidiInput } from "./useMidiInput";
import LayerList from "./LayerList";
import LoopGrid from "./LoopGrid";

const PIANO_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12,
};

export default function LoopRecorder() {
  useSyncExternalStore(loopEngine.subscribe, loopEngine.getSnapshot);
  const [step, setStep] = useState(-1);
  const [bpm, setBpm] = useState(Math.round(loopEngine.bpm));
  const [octave, setOctave] = useState(4);
  const octaveRef = useRef(4);
  const midi = useMidiInput(loopEngine);
  const playing = loopEngine.isPlaying;

  useEffect(() => {
    loopEngine.onStep = setStep;
    return () => {
      loopEngine.onStep = null;
    };
  }, []);

  useEffect(() => {
    const held = new Set<string>();
    const midiFor = (code: string) => (octaveRef.current + 1) * 12 + (PIANO_KEYS[code] ?? 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (loopEngine.isPlaying) loopEngine.stop();
        else void loopEngine.play();
        return;
      }
      if (event.code === "KeyR") {
        loopEngine.toggleRecord();
        return;
      }
      if (event.code === "Escape") {
        loopEngine.setSelection(null);
        return;
      }
      if (event.code === "Backspace" || event.code === "Delete") {
        event.preventDefault();
        loopEngine.deleteSelection();
        return;
      }
      if (event.code === "KeyZ") {
        octaveRef.current = Math.max(1, octaveRef.current - 1);
        setOctave(octaveRef.current);
        return;
      }
      if (event.code === "KeyX") {
        octaveRef.current = Math.min(7, octaveRef.current + 1);
        setOctave(octaveRef.current);
        return;
      }
      if (PIANO_KEYS[event.code] === undefined || event.repeat || held.has(event.code)) return;
      held.add(event.code);
      loopEngine.handleNoteOn({ midi: midiFor(event.code), velocity: 0.8 });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!held.delete(event.code)) return;
      loopEngine.handleNoteOff(midiFor(event.code));
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Loop Recorder</h1>
        <span className="devices">
          <span className="dot" style={{ background: midi.devices.length > 0 ? "#3dd68c" : "#555" }} />
          <select
            value={midi.selectedId ?? ""}
            onChange={(event) => midi.select(event.target.value === "" ? null : event.target.value)}
          >
            <option value="">All MIDI inputs</option>
            {midi.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </span>
      </header>

      <div className="transport">
        <button
          className={playing ? "ctl play on" : "ctl play"}
          onClick={() => (playing ? loopEngine.stop() : void loopEngine.play())}
        >
          {playing ? "■" : "▶"}
        </button>
        <button
          className={loopEngine.armed ? "ctl rec on" : "ctl rec"}
          title="Record arm (R)"
          onClick={() => loopEngine.toggleRecord()}
        >
          ●
        </button>
        <label>
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value >= 40 && value <= 240) {
                setBpm(value);
                loopEngine.setBpm(value);
              }
            }}
          />
        </label>
        <label>
          Bars
          <select value={loopEngine.loopBars} onChange={(event) => loopEngine.setBars(Number(event.target.value))}>
            {[1, 2, 4].map((bars) => (
              <option key={bars} value={bars}>
                {bars}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantize
          <select
            value={loopEngine.quantize}
            onChange={(event) => loopEngine.setQuantize(event.target.value as Quantize)}
          >
            <option value="8n">1/8</option>
            <option value="16n">1/16</option>
            <option value="32n">1/32</option>
            <option value="free">Free</option>
          </select>
        </label>
        <label>
          Voice
          <select value={loopEngine.voiceId} onChange={(event) => loopEngine.setVoice(event.target.value as VoiceId)}>
            {VOICE_PRESETS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scale
          <select
            value={loopEngine.scaleName}
            onChange={(event) => loopEngine.setScaleName(event.target.value as ScaleName)}
          >
            {SCALE_OPTIONS.map((scale) => (
              <option key={scale.id} value={scale.id}>
                {scale.label}
              </option>
            ))}
          </select>
        </label>
        {loopEngine.scaleName !== "chromatic" && (
          <label>
            Root
            <select
              value={loopEngine.scaleRoot}
              onChange={(event) => loopEngine.setScaleRoot(Number(event.target.value))}
            >
              {NOTE_NAMES.map((noteName, index) => (
                <option key={noteName} value={index}>
                  {noteName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="ctl" title="Snap the active layer onto the scale" onClick={() => loopEngine.snapActiveLayerToScale()}>
          Snap notes
        </button>
        <span className="hint">
          Space play/stop · R arm · click a step then play a key to edit · ⌫ removes · Z/X octave C{octave}
        </span>
      </div>

      <div className="main">
        <LayerList engine={loopEngine} />
        <LoopGrid engine={loopEngine} step={playing ? step : -1} />
      </div>

      {midi.error && <p className="error">{midi.error}</p>}
    </div>
  );
}