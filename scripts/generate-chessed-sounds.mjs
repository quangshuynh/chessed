import { mkdirSync, writeFileSync } from "node:fs";

const sampleRate = 22050;
const sounds = {
  move: { frequencies: [330, 495], duration: 0.09 },
  capture: { frequencies: [220, 330], duration: 0.12 },
  check: { frequencies: [440, 660], duration: 0.15 },
  checkmate: { frequencies: [330, 495, 660], duration: 0.24 },
};

function wav({ frequencies, duration }) {
  const sampleCount = Math.floor(sampleRate * duration);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, index / (sampleRate * 0.006));
    const decay = Math.exp((-5 * index) / sampleCount);
    const signal = frequencies.reduce(
      (sum, frequency, harmonic) =>
        sum + Math.sin(2 * Math.PI * frequency * time) / (harmonic + 1),
      0,
    );
    const sample = Math.max(-1, Math.min(1, signal * attack * decay * 0.25));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return buffer;
}

mkdirSync("public/sounds", { recursive: true });
for (const [name, definition] of Object.entries(sounds)) {
  writeFileSync(`public/sounds/${name}.wav`, wav(definition));
}
