import type { LoopEngine } from "../../core/loopEngine";

export function layerColor(id: number) {
  return `hsl(${(id * 67) % 360} 70% 60%)`;
}

export default function LayerList({ engine }: { engine: LoopEngine }) {
  return (
    <div className="layers">
      {engine.layers.map((layer) => (
        <div
          key={layer.id}
          className={layer.id === engine.activeLayerId ? "layer active" : "layer"}
          onClick={() => engine.setActiveLayer(layer.id)}
        >
          <span className="name">{layer.name}</span>
          <span className="count">{layer.notes.length}</span>
          <button
            className={layer.mono ? "" : "dim"}
            title={layer.mono ? "Monophonic playback" : "Polyphonic playback"}
            onClick={(event) => {
              event.stopPropagation();
              engine.toggleMono(layer.id);
            }}
          >
            {layer.mono ? "mono" : "poly"}
          </button>
          <button
            className={layer.muted ? "" : "dim"}
            title={layer.muted ? "Unmute layer" : "Mute layer"}
            onClick={(event) => {
              event.stopPropagation();
              engine.toggleMute(layer.id);
            }}
          >
            M
          </button>
          <button
            title="Delete layer"
            onClick={(event) => {
              event.stopPropagation();
              engine.deleteLayer(layer.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => engine.addLayer()}>+ layer</button>
    </div>
  );
}