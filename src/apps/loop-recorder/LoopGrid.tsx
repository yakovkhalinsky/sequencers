import { TICKS_PER_SIXTEENTH, type LoopEngine } from "../../core/loopEngine";
import { layerColor } from "./LayerList";

const ROW_H = 14;

export default function LoopGrid({ engine, step }: { engine: LoopEngine; step: number }) {
  const bars = engine.loopBars;
  const totalSteps = bars * 16;
  const loopTicks = totalSteps * TICKS_PER_SIXTEENTH;
  const audible = engine.layers.filter((layer) => !layer.muted);
  const notes = audible.flatMap((layer) =>
    layer.notes.map((note) => ({ ...note, color: layerColor(layer.id) })),
  );

  if (notes.length === 0) {
    return (
      <div className="grid empty">
        Arm recording and play the nanoKEY2 — notes land on the {bars}-bar loop.
      </div>
    );
  }

  const lo = Math.min(...notes.map((note) => note.midi)) - 1;
  const hi = Math.max(...notes.map((note) => note.midi)) + 1;
  const rows: number[] = [];
  for (let midi = hi; midi >= lo; midi -= 1) rows.push(midi);
  const height = rows.length * ROW_H;

  return (
    <div className="grid">
      <div className="grid-labels">
        {rows.map((midi) => (
          <span key={midi} style={{ height: ROW_H }}>
            {midi % 12 === 0 ? `C${midi / 12 - 1}` : ""}
          </span>
        ))}
      </div>
      <div
        className="grid-body"
        style={{
          height,
          backgroundSize: `${100 / (bars * 4)}% 100%, ${100 / totalSteps}% 100%`,
        }}
      >
        {notes.map((note, index) => (
          <div
            key={`${note.midi}:${note.start}:${index}`}
            className="note"
            style={{
              left: `${(note.start / loopTicks) * 100}%`,
              top: (hi - note.midi) * ROW_H,
              width: `${Math.max((note.duration / loopTicks) * 100, 0.7)}%`,
              height: ROW_H - 2,
              background: note.color,
              opacity: 0.45 + 0.55 * note.velocity,
            }}
          />
        ))}
        {step >= 0 && <div className="playhead" style={{ left: `${(step / totalSteps) * 100}%` }} />}
      </div>
    </div>
  );
}