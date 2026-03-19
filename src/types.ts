export type Genre = 'Electronic' | 'Hip Hop' | 'Rock' | 'Pop' | 'House' | 'Techno' | 'Ambient' | 'Unknown';

export interface Track {
  id: string;
  name: string;
  file?: File;  // undefined for community stubs — downloaded on first deck load
  url: string;
  storageUrl?: string;
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

export type UserTier = 'free' | 'pro' | 'hybrid';
export type HybridRole = 'producer' | 'dj';

export interface UserProfile {
  uid: string;
  email: string;
  djName: string;
  tier: UserTier;
  hybridRole?: HybridRole;
  createdAt: number;
}

export interface SharedTrack {
  id: string;
  name: string;
  bpm: number;
  genre: Genre;
  producer: string;
  duration: number;
  storageUrl: string;
  uploadedBy: string;      // uid
  uploaderName: string;     // djName
  uploadedAt: number;
  downloadCount: number;
  fileSize: number;
}

export interface ProducerLibraryTrack {
  id: string;
  name: string;
  bpm: number;
  genre: Genre;
  producer: string;
  duration: number;
  storageUrl: string;
  fileSize: number;
  uploadedAt: number;
}

export type PostType = 'general' | 'question' | 'track_spotlight';

export interface CommunityPost {
  id: string;
  type: PostType;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  likes: string[];       // array of uids that liked
  commentCount: number;
  trackRef?: { name: string; producer: string };
}

export interface CommunityComment {
  id: string;
  postId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  likes: string[];       // array of uids that liked
}
