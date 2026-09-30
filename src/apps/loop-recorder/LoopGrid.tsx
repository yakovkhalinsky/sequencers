import type { MouseEvent } from "react";
import { TICKS_PER_SIXTEENTH, type LoopEngine, type Selection } from "../../core/loopEngine";
import { layerColor } from "./LayerList";

const ROW_H = 14;

interface GridNote {
  layerId: number;
  midi: number;
  velocity: number;
  start: number;
  duration: number;
  color: string;
}

export default function LoopGrid({ engine, step }: { engine: LoopEngine; step: number }) {
  const bars = engine.loopBars;
  const totalSteps = bars * 16;
  const loopTicks = totalSteps * TICKS_PER_SIXTEENTH;
  const selection = engine.selection;

  const notes: GridNote[] = [];
  for (const layer of engine.layers) {
    if (layer.muted) continue;
    for (const note of layer.notes) {
      notes.push({
        layerId: layer.id,
        midi: note.midi,
        velocity: note.velocity,
        start: note.start,
        duration: note.duration,
        color: layerColor(layer.id),
      });
    }
  }

  if (notes.length === 0) {
    return (
      <div className="grid empty">
        Arm recording and play the nanoKEY2 — notes land on the {bars}-bar loop.
      </div>
    );
  }

  let lo = notes[0].midi;
  let hi = notes[0].midi;
  for (const note of notes) {
    if (note.midi < lo) lo = note.midi;
    if (note.midi > hi) hi = note.midi;
  }
  lo -= 1;
  hi += 1;

  const rows: number[] = [];
  for (let midi = hi; midi >= lo; midi -= 1) rows.push(midi);
  const gridHeight = rows.length * ROW_H;

  const onCellClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * totalSteps);
    const row = Math.floor((event.clientY - rect.top) / ROW_H);
    if (column < 0 || column >= totalSteps || row < 0 || row >= rows.length) return;
    const picked: Selection = {
      layerId: engine.activeLayerId,
      start: column * TICKS_PER_SIXTEENTH,
      midi: rows[row],
      slot: true,
    };
    engine.setSelection(picked);
  };

  const pickNote = (note: GridNote) => {
    engine.setSelection({
      layerId: note.layerId,
      start: note.start,
      midi: note.midi,
      slot: false,
    });
  };

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
        onClick={onCellClick}
        style={{
          height: gridHeight,
          backgroundSize: `${100 / (bars * 4)}% 100%, ${100 / totalSteps}% 100%`,
        }}
      >
        {notes.map((note) => {
          const isSelected =
            selection !== null &&
            !selection.slot &&
            selection.midi === note.midi &&
            selection.start === note.start &&
            selection.layerId === note.layerId;
          return (
            <div
              key={`${note.layerId}:${note.start}:${note.midi}`}
              className={isSelected ? "note selected" : "note"}
              style={{
                left: `${(note.start / loopTicks) * 100}%`,
                top: (hi - note.midi) * ROW_H,
                width: `${Math.max((note.duration / loopTicks) * 100, 0.7)}%`,
                height: ROW_H - 2,
                background: note.color,
                opacity: 0.45 + 0.55 * note.velocity,
              }}
              onClick={(event) => {
                event.stopPropagation();
                pickNote(note);
              }}
            />
          );
        })}
        {selection !== null && selection.slot && (
          <div
            className="ghost"
            style={{
              left: `${(selection.start / loopTicks) * 100}%`,
              top: (hi - selection.midi) * ROW_H,
              width: `${100 / totalSteps}%`,
              height: ROW_H - 2,
            }}
          />
        )}
        {step >= 0 && <div className="playhead" style={{ left: `${(step / totalSteps) * 100}%` }} />}
      </div>
    </div>
  );
}