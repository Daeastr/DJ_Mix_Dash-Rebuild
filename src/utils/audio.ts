import { Genre } from "../types";

export async function analyzeAudio(file: File, audioContext: AudioContext): Promise<{ bpm: number; genre: Genre; duration: number; audioBuffer: AudioBuffer }> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const bpm = await detectBPM(audioBuffer);
  const genre = detectGenre(file.name);

  return { bpm, genre, duration, audioBuffer };
}

async function detectBPM(buffer: AudioBuffer): Promise<number> {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // Optimization: Only analyze a 30-second window in the middle of the song
  const startOffset = Math.floor(Math.max(0, (buffer.duration / 2) - 15) * sampleRate);
  const endOffset = Math.min(data.length, startOffset + (30 * sampleRate));
  
  const step = Math.floor(sampleRate / 50); // 50 samples per second is enough for beat detection
  const peaks: number[] = [];
  let threshold = 0.7;
  
  for (let i = startOffset; i < endOffset; i += step) {
    if (Math.abs(data[i]) > threshold) {
      peaks.push(i / sampleRate);
      i += Math.floor(sampleRate * 0.25); // Skip 250ms
    }
  }

  if (peaks.length < 2) return 120;

  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  const counts: Record<string, number> = {};
  intervals.forEach(interval => {
    const rounded = Math.round(interval * 20) / 20; // 0.05s precision
    counts[rounded] = (counts[rounded] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topInterval = parseFloat(sorted[0][0]);
  
  let bpm = 60 / topInterval;
  while (bpm < 75) bpm *= 2;
  while (bpm > 150) bpm /= 2;
  
  return Math.round(bpm);
}

function detectGenre(filename: string): Genre {
  const name = filename.toLowerCase();
  const genreKeywords: Record<string, Genre> = {
    'house': 'House',
    'techno': 'Techno',
    'hip hop': 'Hip Hop',
    'rap': 'Hip Hop',
    'rock': 'Rock',
    'pop': 'Pop',
    'ambient': 'Ambient',
    'chill': 'Ambient',
    'electro': 'Electronic'
  };

  for (const [key, genre] of Object.entries(genreKeywords)) {
    if (name.includes(key)) return genre;
  }
  
  const genres: Genre[] = ['Electronic', 'Hip Hop', 'Rock', 'Pop', 'House', 'Techno', 'Ambient'];
  return genres[Math.floor(Math.random() * genres.length)];
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
