import { useEffect, useState, useSyncExternalStore } from "react";
import { loopEngine, type Quantize } from "../../core/loopEngine";
import { useMidiInput } from "./useMidiInput";
import LayerList from "./LayerList";
import LoopGrid from "./LoopGrid";

export default function LoopRecorder() {
  useSyncExternalStore(loopEngine.subscribe, loopEngine.getSnapshot);
  const [step, setStep] = useState(-1);
  const [bpm, setBpm] = useState(Math.round(loopEngine.bpm));
  const midi = useMidiInput(loopEngine);
  const playing = loopEngine.isPlaying;

  useEffect(() => {
    loopEngine.onStep = setStep;
    return () => {
      loopEngine.onStep = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (loopEngine.isPlaying) loopEngine.stop();
        else void loopEngine.play();
      } else if (event.code === "KeyR") {
        loopEngine.toggleRecord();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
          <select value={loopEngine.quantize} onChange={(event) => loopEngine.setQuantize(event.target.value as Quantize)}>
            <option value="8n">1/8</option>
            <option value="16n">1/16</option>
            <option value="32n">1/32</option>
            <option value="free">Free</option>
          </select>
        </label>
        <span className="hint">Space play/stop · R arm · first ▶ click enables audio</span>
      </div>

      <div className="main">
        <LayerList engine={loopEngine} />
        <LoopGrid engine={loopEngine} step={playing ? step : -1} />
      </div>

      {midi.error && <p className="error">{midi.error}</p>}
    </div>
  );
}