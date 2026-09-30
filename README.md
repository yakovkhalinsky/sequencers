# Sequencers

Web-based MIDI sequencer apps. Note input: Korg nanoKEY2 over USB-MIDI (Web MIDI API). Sound and sequencing run in the browser (Web Audio via Tone.js) — the nanoKEY2 is MIDI-only and makes no sound itself.

## Apps

- **loop-recorder** — live loop recorder: arm (`R`), play on the nanoKEY2, notes quantize onto a looping bar; layers for overdubs (mute/delete per layer).

Live at https://yakovkhalinsky.github.io/sequencers/ (Web MIDI needs a Chromium browser and a MIDI device on the machine you're browsing from).

## Dev

```
npm install
npm run dev
```

Open http://localhost:5173 in a Chromium browser (Web MIDI), plug in the nanoKEY2, allow the MIDI permission prompt when asked. First press of ▶ enables audio (browser autoplay policy).

`src/core` holds shared engine pieces (MIDI input, loop engine/scheduler); `src/apps/<name>` holds each standalone sequencer app, wired up in `src/App.tsx`.