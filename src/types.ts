export type Genre = 'Electronic' | 'Hip Hop' | 'Rock' | 'Pop' | 'House' | 'Techno' | 'Ambient' | 'Unknown';

export interface Track {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;
  bpm: number | 'Analyzing...';
  genre: Genre;
  producer: string;
  addedAt: number;
  color: string;
  audioBuffer?: AudioBuffer;
}

export interface DeckState {
  trackId: string | null;
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  eq: {
    low: number; // -12 to 12 dB
    mid: number;
    high: number;
  };
  filter: number; // -1 to 1
  currentTime: number;
  startOffset: number;
  activeFX?: string | null;
}

export interface DJState {
  tracks: Track[];
  mixQueue: string[];
  decks: {
    A: DeckState;
    B: DeckState;
  };
  crossfade: number; // -1 (Deck A) to 1 (Deck B)
  activeTab: 'songs' | 'mix' | 'fx';
}
