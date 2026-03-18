import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { upload } from '@vercel/blob/client';
import { 
  Music, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Plus, 
  X,
  Activity,
  Timer,
  Shuffle,
  ListOrdered,
  Dices,
  Headphones,
  Mic2,
  LogOut,
  Users,
  Crown,
  Check,
  Cloud,
  LoaderCircle,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Track, DeckState, ProducerLibraryTrack, SharedTrack, UserTier } from './types';
import { analyzeAudio, formatTime } from './utils/audio';
import { DJEngine } from './utils/engine';
import { useAuth } from './auth/AuthContext';
import AuthPage from './components/AuthPage';
import SharedTracks from './components/SharedTracks';

const TIER_INTERVALS: Record<UserTier, number[]> = {
  free: [5, 10],
  pro: [5, 10, 15, 20, 25, 30],
  hybrid: [5, 10, 15, 20, 25, 30, 45, 60],
};

const initialDeckState: DeckState = {
  trackId: null,
  isPlaying: false,
  volume: 1.0,
  playbackRate: 1.0,
  eq: { low: 0, mid: 0, high: 0 },
  filter: 0, // 0 = off, -1 = LP, 1 = HP
  currentTime: 0,
  startOffset: 0
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const { user, profile, loading: authLoading, signOut } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || !profile) {
    return <AuthPage />;
  }

  return <AppMain profile={profile} signOut={signOut} />;
}

function AppMain({ profile, signOut }: { profile: import('./types').UserProfile | null; signOut: () => Promise<void> }) {
  const userTier = profile?.tier ?? 'hybrid';
  const canUseProducerTools = userTier === 'hybrid';
  const tierIntervals = TIER_INTERVALS[userTier];

  const [tracks, setTracks] = useState<Track[]>([]);
  const [mixQueue, setMixQueue] = useState<string[]>([]);
  const [decks, setDecks] = useState<{ A: DeckState; B: DeckState }>({
    A: { ...initialDeckState },
    B: { ...initialDeckState }
  });
  const [crossfade, setCrossfade] = useState(0); // -1 to 1
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [activeTab, setActiveTab] = useState<'songs' | 'mix' | 'fx'>('songs');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto Drop State
  const [isAutoDropEnabled, setIsAutoDropEnabled] = useState(false);
  const [autoDropMode, setAutoDropMode] = useState<'quick' | 'end'>('quick');
  const [autoDropInterval, setAutoDropInterval] = useState(10);
  const [autoDropOrder, setAutoDropOrder] = useState<'chronological' | 'random'>('chronological');
  const [fxIntensity, setFxIntensity] = useState(0.5);
  const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
  const [viewMode, setViewMode] = useState<'producer' | 'dj' | 'community'>('dj');
  const [sortBy, setSortBy] = useState<'bpm' | 'genre' | 'producer' | 'newest' | 'oldest'>('bpm');
  const [filterGenre, setFilterGenre] = useState('all');
  const [filterProducer, setFilterProducer] = useState('all');
  const [trackPersistenceState, setTrackPersistenceState] = useState<Record<string, 'saving' | 'saved' | 'deleting'>>({});

  const engineRef = useRef<DJEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const autoDropTriggeredRef = useRef(false);
  const isAutoDropEnabledRef = useRef(isAutoDropEnabled);
  const autoDropModeRef = useRef(autoDropMode);
  const autoDropIntervalRef = useRef(autoDropInterval);
  const activeDeckRef = useRef(activeDeck);
  const triggerAutoDropRef = useRef<() => void>(() => {});
  const mixQueueRef = useRef(mixQueue);
  const tracksRef = useRef(tracks);
  const decksRef = useRef(decks);

  useEffect(() => { isAutoDropEnabledRef.current = isAutoDropEnabled; }, [isAutoDropEnabled]);
  useEffect(() => { autoDropModeRef.current = autoDropMode; }, [autoDropMode]);
  useEffect(() => { autoDropIntervalRef.current = autoDropInterval; }, [autoDropInterval]);
  useEffect(() => { activeDeckRef.current = activeDeck; }, [activeDeck]);
  useEffect(() => { mixQueueRef.current = mixQueue; }, [mixQueue]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { decksRef.current = decks; }, [decks]);

  // Sync FX Intensity
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.deckA.fxIntensity = fxIntensity;
      engineRef.current.deckB.fxIntensity = fxIntensity;
    }
  }, [fxIntensity]);

  const restoreLibraryTrack = useCallback(async (savedTrack: ProducerLibraryTrack) => {
    if (!engineRef.current) {
      throw new Error('Engine not initialized');
    }

    const response = await fetch(savedTrack.storageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${savedTrack.name}`);
    }

    const blob = await response.blob();
    const file = new File([blob], `${savedTrack.name}.mp3`, { type: blob.type || 'audio/mpeg' });
    const localUrl = URL.createObjectURL(blob);
    const analysis = await analyzeAudio(file, engineRef.current.context);

    return {
      id: savedTrack.id,
      name: savedTrack.name,
      file,
      url: localUrl,
      storageUrl: savedTrack.storageUrl,
      duration: savedTrack.duration || analysis.duration,
      bpm: savedTrack.bpm || analysis.bpm,
      genre: savedTrack.genre || analysis.genre,
      producer: savedTrack.producer,
      addedAt: savedTrack.uploadedAt,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      audioBuffer: analysis.audioBuffer,
    } satisfies Track;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadTracks = async () => {
      if (!profile || !engineRef.current) return;

      if (canUseProducerTools) {
        // Hybrid: load personal producer library
        try {
          const savedTracks = await parseJsonResponse<ProducerLibraryTrack[]>(await fetch('/api/library'));
          const restoredTracks: Track[] = [];

          for (const savedTrack of savedTracks) {
            try {
              restoredTracks.push(await restoreLibraryTrack(savedTrack));
            } catch (error) {
              console.error('Failed to restore saved producer track:', error);
            }
          }

          if (!cancelled) {
            setTracks(restoredTracks.sort((left, right) => right.addedAt - left.addedAt));
            setTrackPersistenceState(
              Object.fromEntries(restoredTracks.map(track => [track.id, 'saved'])) as Record<string, 'saved'>
            );
          }
        } catch (error) {
          console.error('Failed to load producer library:', error);
        }
      } else {
        // Free / Pro DJ: populate the mix library from community tracks
        try {
          const communityTracks = await parseJsonResponse<SharedTrack[]>(await fetch('/api/tracks'));
          const restoredTracks: Track[] = [];

          for (const t of communityTracks) {
            try {
              restoredTracks.push(await restoreLibraryTrack(t));
            } catch (error) {
              console.error('Failed to load community track:', error);
            }
          }

          if (!cancelled) {
            setTracks(restoredTracks);
          }
        } catch (error) {
          console.error('Failed to load community tracks:', error);
        }
      }
    };

    loadTracks();

    return () => {
      cancelled = true;
    };
  }, [profile?.uid, canUseProducerTools, restoreLibraryTrack, profile]);

  // Initialize Engine
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new DJEngine();
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.deckA.stop();
        engineRef.current.deckB.stop();
        engineRef.current.context.close();
        engineRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: FileList | null = null;
    if ('files' in e.target) files = e.target.files;
    else if ('dataTransfer' in e) {
      e.preventDefault();
      files = e.dataTransfer.files;
    }
    if (!files) return;

    const filesArray = Array.from(files);
    showToast(`Analyzing ${filesArray.length} tracks...`);

    for (const file of filesArray) {
      if (!file.type.startsWith('audio/')) continue;
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      
      const producer = file.name.includes(' - ')
        ? file.name.split(' - ')[0].trim()
        : 'Unknown';
      const tempTrack: Track = {
        id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        file,
        url,
        duration: 0,
        bpm: 'Analyzing...',
        genre: 'Unknown',
        producer,
        addedAt: Date.now(),
        color: `hsl(${Math.random() * 360}, 70%, 60%)`
      };

      setTracks(prev => [...prev, tempTrack]);
      if (profile && canUseProducerTools) {
        setTrackPersistenceState(prev => ({ ...prev, [id]: 'saving' }));
      }

      try {
        if (!engineRef.current) throw new Error("Engine not initialized");
        const analysis = await analyzeAudio(file, engineRef.current.context);
        setTracks(prev => prev.map(t => t.id === id ? { ...t, ...analysis } : t));

        if (profile && canUseProducerTools) {
          try {
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blob = await upload(`library/${profile.uid}/${Date.now()}_${sanitizedName}`, file, {
              access: 'public',
              handleUploadUrl: '/api/upload',
            });

            const savedTrack = await parseJsonResponse<ProducerLibraryTrack>(await fetch('/api/library', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: tempTrack.name,
                bpm: analysis.bpm,
                genre: analysis.genre,
                producer,
                duration: analysis.duration,
                storageUrl: blob.url,
                fileSize: file.size,
                uploadedAt: tempTrack.addedAt,
              }),
            }));

            setTracks(prev => prev.map(track =>
              track.id === id
                ? {
                    ...track,
                    id: savedTrack.id,
                    addedAt: savedTrack.uploadedAt,
                    name: savedTrack.name,
                    producer: savedTrack.producer,
                    storageUrl: savedTrack.storageUrl,
                  }
                : track
            ));
            setTrackPersistenceState(prev => {
              const next = { ...prev };
              delete next[id];
              next[savedTrack.id] = 'saved';
              return next;
            });
            showToast(`Saved "${tempTrack.name}" to your producer library`);
          } catch (saveError) {
            console.error('Failed to save producer track:', saveError);
            setTrackPersistenceState(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
            showToast(`"${tempTrack.name}" loaded locally but did not save`, 'error');
          }
        }
      } catch (err) {
        console.error("Audio analysis failed:", err);
        showToast(`Failed to analyze ${file.name}`, 'error');
        setTrackPersistenceState(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setTracks(prev => prev.map(t => t.id === id ? { ...t, bpm: 120, genre: 'Electronic' } : t));
      }
    }
  };

  const deleteProducerTrack = useCallback(async (trackId: string) => {
    const track = tracksRef.current.find(candidate => candidate.id === trackId);
    if (!track?.storageUrl) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete "${track.name}" from your producer library?`);
      if (!confirmed) {
        return;
      }
    }

    setTrackPersistenceState(prev => ({ ...prev, [trackId]: 'deleting' }));

    try {
      await parseJsonResponse<{ success: boolean; id: string }>(await fetch(`/api/library/${trackId}`, {
        method: 'DELETE',
      }));

      if (decksRef.current.A.trackId === trackId) {
        engineRef.current?.deckA.stop();
      }
      if (decksRef.current.B.trackId === trackId) {
        engineRef.current?.deckB.stop();
      }

      if (track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url);
      }

      setTracks(prev => prev.filter(candidate => candidate.id !== trackId));
      setMixQueue(prev => prev.filter(candidate => candidate !== trackId));
      setDecks(prev => ({
        A: prev.A.trackId === trackId ? { ...prev.A, trackId: null, isPlaying: false, currentTime: 0, startOffset: 0 } : prev.A,
        B: prev.B.trackId === trackId ? { ...prev.B, trackId: null, isPlaying: false, currentTime: 0, startOffset: 0 } : prev.B,
      }));
      setTrackPersistenceState(prev => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
      showToast(`Removed "${track.name}" from your producer library`);
    } catch (error) {
      console.error('Failed to delete producer track:', error);
      setTrackPersistenceState(prev => ({ ...prev, [trackId]: 'saved' }));
      showToast(`Failed to remove "${track.name}"`, 'error');
    }
  }, [showToast]);

  const getTrackPersistence = useCallback((track: Track) => {
    const state = trackPersistenceState[track.id];
    return {
      isSaving: state === 'saving',
      isDeleting: state === 'deleting',
      isSaved: Boolean(track.storageUrl) || state === 'saved',
    };
  }, [trackPersistenceState]);

  const loadSharedTrack = useCallback(async (url: string, name: string) => {
    showToast(`Loading "${name}" from community...`);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `${name}.mp3`, { type: blob.type || 'audio/mpeg' });
      const id = Math.random().toString(36).substring(7);
      const localUrl = URL.createObjectURL(blob);
      const producer = name.includes(' - ') ? name.split(' - ')[0].trim() : 'Community';
      const tempTrack: Track = {
        id, name, file, url: localUrl, duration: 0, bpm: 'Analyzing...',
        genre: 'Unknown', producer, addedAt: Date.now(),
        color: `hsl(${Math.random() * 360}, 70%, 60%)`
      };
      setTracks(prev => [...prev, tempTrack]);
      if (engineRef.current) {
        const analysis = await analyzeAudio(file, engineRef.current.context);
        setTracks(prev => prev.map(t => t.id === id ? { ...t, ...analysis } : t));
      }
      showToast(`"${name}" added to library`);
    } catch (err) {
      console.error('Failed to load shared track:', err);
      showToast(`Failed to load "${name}"`, 'error');
    }
  }, [showToast]);

  const getNextTrackId = useCallback((currentTrackId?: string) => {
    if (mixQueueRef.current.length > 0) {
      const nextId = mixQueueRef.current[0];
      mixQueueRef.current = mixQueueRef.current.slice(1);
      setMixQueue(mixQueueRef.current);
      return nextId;
    } else if (tracksRef.current.length > 0) {
      if (autoDropOrder === 'random') {
        const randomIndex = Math.floor(Math.random() * tracksRef.current.length);
        return tracksRef.current[randomIndex].id;
      } else {
        const trackIdToUse = currentTrackId || decksRef.current[activeDeckRef.current].trackId;
        const sortedTracks = [...tracksRef.current].sort((a, b) => {
          if (a.bpm === 'Analyzing...') return 1;
          if (b.bpm === 'Analyzing...') return -1;
          return (a.bpm as number) - (b.bpm as number);
        });
        const currentIndex = sortedTracks.findIndex(t => t.id === trackIdToUse);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sortedTracks.length;
        return sortedTracks[nextIndex].id;
      }
    }
    return null;
  }, [autoDropOrder]);

  const loadToDeck = useCallback(async (trackId: string, deckKey: 'A' | 'B') => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track) return;
    
    if (!engineRef.current) {
      showToast('Audio engine not ready', 'error');
      return;
    }

    if (engineRef.current.context.state === 'suspended') {
      engineRef.current.context.resume();
    }

    if (!track.audioBuffer) {
      showToast('Track is still analyzing or failed to load', 'error');
      return;
    }

    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    deck.load(track.audioBuffer);
    if (typeof track.bpm === 'number') {
      deck.bpm = track.bpm;
    }
    
    setDecks(prev => ({
      ...prev,
      [deckKey]: { ...prev[deckKey], trackId, isPlaying: false, currentTime: 0, startOffset: 0 }
    }));
    showToast(`Loaded to Deck ${deckKey}`);
    if (deckKey === activeDeckRef.current) {
      autoDropTriggeredRef.current = false;
    }
  }, [showToast]);

  const setDeckPlayState = useCallback(async (deckKey: 'A' | 'B', play: boolean) => {
    if (!engineRef.current) return;
    if (engineRef.current.context.state === 'suspended') {
      engineRef.current.context.resume();
    }
    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    
    if (play && !deck.isPlaying) {
      deck.play();
    } else if (!play && deck.isPlaying) {
      deck.pause();
    }

    setDecks(prev => ({
      ...prev,
      [deckKey]: { ...prev[deckKey], isPlaying: play }
    }));
  }, []);

  const randomizeStart = useCallback((deckKey: 'A' | 'B') => {
    const trackId = decksRef.current[deckKey].trackId;
    if (!trackId) {
      showToast('No track loaded', 'error');
      return;
    }
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track || typeof track.bpm !== 'number' || !track.audioBuffer) {
      showToast('Track not fully analyzed', 'error');
      return;
    }

    // 8 bars = 32 beats
    // seconds per beat = 60 / BPM
    // seconds per 8 bars = 32 * (60 / BPM) = 1920 / BPM
    const sectionLength = 1920 / track.bpm;
    const totalSections = Math.floor(track.audioBuffer.duration / sectionLength);
    
    if (totalSections > 1) {
      // Pick a random section from 1 to totalSections - 1 (skip the front which is 0)
      const randomSection = Math.floor(Math.random() * (totalSections - 1)) + 1;
      const newTime = randomSection * sectionLength;
      
      const deck = deckKey === 'A' ? engineRef.current?.deckA : engineRef.current?.deckB;
      if (deck) {
        deck.seek(newTime);
        setDecks(prev => ({
          ...prev,
          [deckKey]: { ...prev[deckKey], currentTime: newTime, startOffset: newTime }
        }));
        showToast(`Skipped to random 8-bar section (${formatTime(newTime)})`);
      }
    } else {
      showToast('Track too short to skip sections', 'error');
    }
  }, [showToast]);

  const playFullSong = useCallback(() => {
    const active = activeDeckRef.current;
    const deck = active === 'A' ? engineRef.current?.deckA : engineRef.current?.deckB;
    if (deck) {
      deck.seek(0);
      setDecks(prev => ({
        ...prev,
        [active]: { ...prev[active], currentTime: 0, startOffset: 0, isPlaying: true }
      }));
      deck.play();
      showToast(`Playing full song on Deck ${active}`);
    }
  }, [showToast]);

  const triggerFX = useCallback((deckKey: 'A' | 'B', fxName: string, active: boolean) => {
    const deck = deckKey === 'A' ? engineRef.current?.deckA : engineRef.current?.deckB;
    if (deck) {
      deck.triggerFX(fxName, active);
    }
  }, []);

  const toggleDeckPlay = async (deckKey: 'A' | 'B') => {
    if (!engineRef.current) return;
    
    if (engineRef.current.context.state === 'suspended') {
      engineRef.current.context.resume();
    }

    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    const otherDeckKey = deckKey === 'A' ? 'B' : 'A';
    const otherDeck = deckKey === 'A' ? engineRef.current.deckB : engineRef.current.deckA;
    const willPlay = !decks[deckKey].isPlaying;
    
    if (willPlay) {
      // If the other deck is playing, interrupt it
      if (decks[otherDeckKey].isPlaying) {
        otherDeck.pause();
      }
      
      deck.play();
      setActiveDeck(deckKey);
      setCrossfade(deckKey === 'A' ? -1 : 1);
      autoDropTriggeredRef.current = false;
      
      setDecks(prev => ({
        ...prev,
        [deckKey]: { ...prev[deckKey], isPlaying: true },
        [otherDeckKey]: { ...prev[otherDeckKey], isPlaying: false }
      }));

      // Pre-load the new idle deck if auto-drop is enabled
      if (isAutoDropEnabledRef.current) {
        const upcomingTrackId = getNextTrackId(decks[deckKey].trackId as string);
        if (upcomingTrackId) {
          loadToDeck(upcomingTrackId, otherDeckKey);
        }
      }
    } else {
      deck.pause();
      setDecks(prev => ({
        ...prev,
        [deckKey]: { ...prev[deckKey], isPlaying: false }
      }));
    }
  };

  const triggerAutoDrop = useCallback(async () => {
    try {
      const nextDeckKey = activeDeck === 'A' ? 'B' : 'A';
      
      // If the next deck doesn't have a track loaded (e.g. user ejected it), load one
      let nextTrackId = decksRef.current[nextDeckKey].trackId;
      if (!nextTrackId) {
        nextTrackId = getNextTrackId(decksRef.current[activeDeck].trackId);
        if (nextTrackId) await loadToDeck(nextTrackId, nextDeckKey);
      }

      if (nextTrackId) {
        setDeckPlayState(nextDeckKey, true);
        setActiveDeck(nextDeckKey);
        
        // Smooth crossfade
        const startCrossfade = activeDeck === 'A' ? -1 : 1;
        const endCrossfade = nextDeckKey === 'A' ? -1 : 1;
        
        // Duration: 2s for quick mix, or the full interval for end-of-track blend
        const duration = autoDropMode === 'quick' ? 2000 : autoDropInterval * 1000;
        const startTime = performance.now();
        
        const animateCrossfade = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
          
          setCrossfade(startCrossfade + (endCrossfade - startCrossfade) * ease);
          
          if (progress < 1) {
            requestAnimationFrame(animateCrossfade);
          } else {
            setDeckPlayState(activeDeck, false);
            autoDropTriggeredRef.current = false;
            
            // Pre-load the new idle deck
            const newIdleDeck = activeDeck;
            const upcomingTrackId = getNextTrackId(nextTrackId as string);
            if (upcomingTrackId) {
              loadToDeck(upcomingTrackId, newIdleDeck);
            }
          }
        };
        requestAnimationFrame(animateCrossfade);
      } else {
        autoDropTriggeredRef.current = false;
      }
    } catch (error) {
      console.error("Error in triggerAutoDrop:", error);
      autoDropTriggeredRef.current = false;
    }
  }, [activeDeck, autoDropMode, autoDropInterval, setDeckPlayState, getNextTrackId, loadToDeck]);

  const startAutoMix = async () => {
    if (engineRef.current?.context.state === 'suspended') {
      engineRef.current.context.resume();
    }

    if (tracksRef.current.length === 0 && mixQueueRef.current.length === 0) {
      showToast('No tracks available to mix', 'error');
      return;
    }

    const firstTrackId = getNextTrackId();
    if (firstTrackId) {
      await loadToDeck(firstTrackId, 'A');
      setCrossfade(-1);
      setActiveDeck('A');
      setDeckPlayState('A', true);
      setIsAutoDropEnabled(true);
      autoDropTriggeredRef.current = false;
      
      // Pre-load Deck B
      const secondTrackId = getNextTrackId(firstTrackId);
      if (secondTrackId) {
        await loadToDeck(secondTrackId, 'B');
      }
    }
  };

  useEffect(() => { triggerAutoDropRef.current = triggerAutoDrop; }, [triggerAutoDrop]);

  const updateDeckEQ = (deckKey: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => {
    if (!engineRef.current) return;
    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    
    const newEQ = { ...decks[deckKey].eq, [band]: value };
    deck.setEQ(newEQ.low, newEQ.mid, newEQ.high);
    
    setDecks(prev => ({
      ...prev,
      [deckKey]: { ...prev[deckKey], eq: newEQ }
    }));
  };

  const updateDeckFilter = (deckKey: 'A' | 'B', value: number) => {
    if (!engineRef.current) return;
    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    
    // value: -1 (LP) to 1 (HP)
    if (value < 0) {
      // LP: 200Hz to 20000Hz
      const freq = 200 + (1 + value) * 19800;
      deck.setFilter(freq, 'lowpass');
    } else if (value > 0) {
      // HP: 20Hz to 4000Hz
      const freq = 20 + value * 3980;
      deck.setFilter(freq, 'highpass');
    } else {
      // Off: LP at 20000Hz
      deck.setFilter(20000, 'lowpass');
    }
    
    setDecks(prev => ({
      ...prev,
      [deckKey]: { ...prev[deckKey], filter: value }
    }));
  };

  const updateDeckTempo = (deckKey: 'A' | 'B', rate: number) => {
    if (!engineRef.current) return;
    const deck = deckKey === 'A' ? engineRef.current.deckA : engineRef.current.deckB;
    deck.setPlaybackRate(rate);
    setDecks(prev => ({
      ...prev,
      [deckKey]: { ...prev[deckKey], playbackRate: rate }
    }));
  };

  // Sync Engine with UI State
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCrossfade(crossfade);
    }
  }, [crossfade]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMasterVolume(masterVolume);
    }
  }, [masterVolume]);

  // Update current times
  useEffect(() => {
    const update = () => {
      if (engineRef.current) {
        const currentTimeA = engineRef.current.deckA.getCurrentTime();
        const currentTimeB = engineRef.current.deckB.getCurrentTime();

        setDecks(prev => ({
          A: { ...prev.A, currentTime: currentTimeA },
          B: { ...prev.B, currentTime: currentTimeB }
        }));

        if (isAutoDropEnabledRef.current) {
          const active = activeDeckRef.current;
          const currentDeckTime = active === 'A' ? currentTimeA : currentTimeB;
          const isPlaying = active === 'A' ? engineRef.current.deckA.isPlaying : engineRef.current.deckB.isPlaying;
          const duration = active === 'A' ? engineRef.current.deckA.buffer?.duration || 0 : engineRef.current.deckB.buffer?.duration || 0;
          const startOffset = decksRef.current[active].startOffset || 0;
          
          let shouldDrop = false;
          if (autoDropModeRef.current === 'quick') {
            shouldDrop = currentDeckTime >= startOffset + autoDropIntervalRef.current;
          } else {
            shouldDrop = currentDeckTime >= duration - autoDropIntervalRef.current && duration > 0;
          }

          if (isPlaying && shouldDrop && !autoDropTriggeredRef.current) {
            autoDropTriggeredRef.current = true;
            triggerAutoDropRef.current();
          }
        }
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const addToMix = (id: string) => {
    setMixQueue(prev => prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]);
  };

  const filteredSortedTracks = useMemo(() => {
    let result = [...tracks];
    if (filterGenre !== 'all') result = result.filter(t => t.genre === filterGenre);
    if (filterProducer !== 'all') result = result.filter(t => t.producer === filterProducer);
    switch (sortBy) {
      case 'bpm':
        result.sort((a, b) => {
          if (a.bpm === 'Analyzing...') return 1;
          if (b.bpm === 'Analyzing...') return -1;
          return (a.bpm as number) - (b.bpm as number);
        });
        break;
      case 'genre': result.sort((a, b) => a.genre.localeCompare(b.genre)); break;
      case 'producer': result.sort((a, b) => a.producer.localeCompare(b.producer)); break;
      case 'newest': result.sort((a, b) => b.addedAt - a.addedAt); break;
      case 'oldest': result.sort((a, b) => a.addedAt - b.addedAt); break;
    }
    return result;
  }, [tracks, filterGenre, filterProducer, sortBy]);

  const uniqueGenres = useMemo(() =>
    ['all', ...Array.from(new Set(tracks.map(t => t.genre)))], [tracks]);

  const uniqueProducers = useMemo(() =>
    ['all', ...Array.from(new Set(tracks.map(t => t.producer)))], [tracks]);

  const groupedTracks = useMemo(() => {
    if (sortBy === 'genre') {
      const groups: Record<string, Track[]> = {};
      filteredSortedTracks.forEach(track => {
        if (!groups[track.genre]) groups[track.genre] = [];
        groups[track.genre].push(track);
      });
      return Object.keys(groups).sort().map(key => ({ label: key, tracks: groups[key] }));
    }
    if (sortBy === 'producer') {
      const groups: Record<string, Track[]> = {};
      filteredSortedTracks.forEach(track => {
        if (!groups[track.producer]) groups[track.producer] = [];
        groups[track.producer].push(track);
      });
      return Object.keys(groups).sort().map(key => ({ label: key, tracks: groups[key] }));
    }
    if (sortBy === 'newest' || sortBy === 'oldest') {
      return filteredSortedTracks.length > 0
        ? [{ label: sortBy === 'newest' ? 'NEWEST FIRST' : 'OLDEST FIRST', tracks: filteredSortedTracks }]
        : [];
    }
    // Default: BPM range grouping
    const groups: Record<string, Track[]> = {};
    filteredSortedTracks.forEach(track => {
      if (track.bpm === 'Analyzing...') {
        if (!groups['Analyzing']) groups['Analyzing'] = [];
        groups['Analyzing'].push(track);
      } else {
        const bpm = track.bpm as number;
        const lowerBound = Math.floor(bpm / 5) * 5;
        const upperBound = lowerBound + 4;
        const rangeLabel = `${lowerBound} - ${upperBound} BPM`;
        if (!groups[rangeLabel]) groups[rangeLabel] = [];
        groups[rangeLabel].push(track);
      }
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Analyzing') return 1;
      if (b === 'Analyzing') return -1;
      const bpmA = parseInt(a.split(' ')[0]);
      const bpmB = parseInt(b.split(' ')[0]);
      return bpmA - bpmB;
    });
    return sortedKeys.map(key => ({ label: key, tracks: groups[key] }));
  }, [filteredSortedTracks, sortBy]);

  // Calculate countdown
  let countdownText = '';
  if (isAutoDropEnabled) {
    const activeDeckState = decks[activeDeck];
    const track = tracks.find(t => t.id === activeDeckState.trackId);
    if (activeDeckState.isPlaying && track?.audioBuffer) {
      const duration = track.audioBuffer.duration;
      const current = activeDeckState.currentTime;
      const startOffset = activeDeckState.startOffset || 0;
      let remaining = 0;
      
      if (autoDropMode === 'quick') {
        remaining = (startOffset + autoDropInterval) - current;
      } else {
        remaining = (duration - autoDropInterval) - current;
      }
      
      if (autoDropTriggeredRef.current) {
        countdownText = 'MIXING...';
      } else if (remaining > 0) {
        countdownText = `NEXT IN ${Math.ceil(remaining)}s (c:${current.toFixed(1)} s:${engineRef.current?.context.state})`;
      } else {
        countdownText = 'DROPPING...';
      }
    } else {
      countdownText = 'WAITING...';
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans selection:bg-accent/30 overflow-hidden">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-border bg-bg/90 backdrop-blur-md shrink-0">
        <div className="font-bebas text-4xl tracking-[4px] text-accent drop-shadow-[0_0_20px_rgba(0,245,160,0.4)]">
          DJ MIX<span className="text-text"> DASH</span>
        </div>
        <div className="flex gap-6 items-center">
          <div className="stat-pill">TRACKS <span className="val">{tracks.length}</span></div>
          <div className="stat-pill">MIX QUEUE <span className="val">{mixQueue.length}</span></div>
          {/* View Mode Toggle */}
          <div className="flex bg-surface border border-border rounded-xl p-1 gap-0.5 ml-2">
            {canUseProducerTools && (
              <button
                onClick={() => setViewMode('producer')}
                className={`px-4 py-1.5 rounded-lg text-[0.7rem] font-bold tracking-widest transition-all flex items-center gap-1.5 ${
                  viewMode === 'producer' ? 'bg-accent text-black shadow-lg' : 'text-muted hover:text-text'
                }`}
              >
                <Mic2 className="w-3 h-3" /> PRODUCER
              </button>
            )}
            <button
              onClick={() => setViewMode('dj')}
              className={`px-4 py-1.5 rounded-lg text-[0.7rem] font-bold tracking-widest transition-all flex items-center gap-1.5 ${
                viewMode === 'dj' ? 'bg-[#00e5ff] text-black shadow-lg' : 'text-muted hover:text-text'
              }`}
            >
              <Headphones className="w-3 h-3" /> DJ MIX
            </button>
            <button
              onClick={() => setViewMode('community')}
              className={`px-4 py-1.5 rounded-lg text-[0.7rem] font-bold tracking-widest transition-all flex items-center gap-1.5 ${
                viewMode === 'community' ? 'bg-[#bf00ff] text-white shadow-lg' : 'text-muted hover:text-text'
              }`}
            >
              <Users className="w-3 h-3" /> COMMUNITY
            </button>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <Volume2 className="w-4 h-4 text-muted" />
            <input 
              type="range" min="0" max="1" step="0.01" value={masterVolume} 
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="w-24 accent-accent"
            />
          </div>
          {/* User Info */}
          {profile && (
          <div className="flex items-center gap-2 ml-2 pl-4 border-l border-border">
            <div className="flex flex-col items-end">
              <span className="text-[0.7rem] font-bold text-text tracking-wider">{profile.djName}</span>
              <span className="text-[0.55rem] font-mono tracking-widest flex items-center gap-1" style={{
                color: userTier === 'hybrid' ? '#bf00ff' : userTier === 'pro' ? '#00e5ff' : '#00f5a0'
              }}>
                <Crown className="w-2.5 h-2.5" />
                {userTier.toUpperCase()} DJ
              </span>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-red"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          )}
        </div>
      </header>

      {viewMode === 'producer' ? (
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr] overflow-hidden">
        {/* Sidebar */}
        <aside className="border-r border-border bg-surface flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="font-bebas text-lg tracking-[3px] text-muted">LIBRARY</div>
            <button onClick={() => fileInputRef.current?.click()} className="text-accent hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <input type="file" ref={fileInputRef} className="hidden" multiple accept="audio/*" onChange={handleFileUpload} />

          {/* Filter Controls */}
          <div className="px-3 pt-3 pb-2 border-b border-border flex flex-col gap-2 shrink-0">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full bg-bg border border-border rounded-lg py-1.5 px-2 text-[0.65rem] font-mono text-accent outline-none">
              <option value="bpm">Sort: BPM</option>
              <option value="genre">Sort: Genre / Category</option>
              <option value="producer">Sort: Producer / Artist</option>
              <option value="newest">Sort: Newest Added</option>
              <option value="oldest">Sort: Oldest Added</option>
            </select>
            <div className="flex gap-1.5">
              <select value={filterGenre} onChange={e => setFilterGenre(e.target.value)} className="flex-1 bg-bg border border-border rounded-lg py-1 px-1.5 text-[0.6rem] font-mono text-[#00e5ff] outline-none">
                {uniqueGenres.map(g => <option key={g} value={g}>{g === 'all' ? 'All Genres' : g}</option>)}
              </select>
              <select value={filterProducer} onChange={e => setFilterProducer(e.target.value)} className="flex-1 bg-bg border border-border rounded-lg py-1 px-1.5 text-[0.6rem] font-mono text-[#ffe600] outline-none">
                {uniqueProducers.map(p => <option key={p} value={p}>{p === 'all' ? 'All Artists' : p}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredSortedTracks.map(track => (
              <div 
                key={track.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('trackId', track.id)}
                className="flex items-center p-2 gap-3 rounded-lg hover:bg-white/5 group transition-all cursor-grab active:cursor-grabbing"
              >
                {(() => {
                  const persistence = getTrackPersistence(track);
                  return (
                    <>
                <div className="w-8 h-8 rounded bg-surface2 flex items-center justify-center text-xs font-bold shrink-0" style={{ color: track.color }}>
                  {track.genre[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8rem] font-medium truncate">{track.name}</div>
                  <div className="flex items-center gap-2 text-[0.65rem] text-muted font-mono">
                    <span>{track.bpm} BPM</span>
                    {persistence.isSaving && <span className="text-accent inline-flex items-center gap-1"><LoaderCircle className="w-3 h-3 animate-spin" /> SAVING</span>}
                    {!persistence.isSaving && persistence.isSaved && <span className="text-accent inline-flex items-center gap-1"><Check className="w-3 h-3" /> SAVED</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => loadToDeck(track.id, 'A')} className="p-1 hover:text-accent" title="Load to Deck A">A</button>
                  <button onClick={() => loadToDeck(track.id, 'B')} className="p-1 hover:text-accent2" title="Load to Deck B">B</button>
                  <button onClick={() => addToMix(track.id)} className={`p-1 ${mixQueue.includes(track.id) ? 'text-accent3' : 'text-muted'}`}>
                    <Plus className="w-4 h-4" />
                  </button>
                  {persistence.isSaved && (
                    <button
                      onClick={() => void deleteProducerTrack(track.id)}
                      disabled={persistence.isDeleting}
                      className="p-1 text-muted hover:text-red disabled:opacity-50"
                      title="Remove from saved library"
                    >
                      {persistence.isDeleting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Console */}
        <main className="flex flex-col overflow-hidden">
          {/* Global Progress & Controls */}
          <div className="px-6 pt-6 flex flex-col items-center bg-surface2/30">
            <div className="w-full max-w-4xl flex items-center gap-4">
              <button 
                onClick={playFullSong}
                className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-[0.75rem] font-bold flex items-center gap-2 transition-all shrink-0 shadow-lg shadow-accent/5"
              >
                <Play className="w-3.5 h-3.5" /> PLAY FULL SONG
              </button>
              
              <div className="flex-1 h-12 bg-bg rounded-xl border border-border relative overflow-hidden group cursor-pointer shadow-inner"
                   onClick={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     const x = e.clientX - rect.left;
                     const pct = x / rect.width;
                     const active = activeDeckRef.current;
                     const deck = active === 'A' ? engineRef.current?.deckA : engineRef.current?.deckB;
                     if (deck && deck.buffer) {
                       const newTime = pct * deck.buffer.duration;
                       deck.seek(newTime);
                       setDecks(prev => ({ ...prev, [active]: { ...prev[active], currentTime: newTime, startOffset: newTime } }));
                     }
                   }}>
                {/* Progress Fill */}
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-accent/10 border-r border-accent/40"
                  style={{ width: `${(decks[activeDeck].currentTime / (tracks.find(t => t.id === decks[activeDeck].trackId)?.audioBuffer?.duration || 1)) * 100}%` }}
                />
                
                {/* Track Name Scrolling */}
                <div className="absolute inset-0 flex items-center px-6 pointer-events-none overflow-hidden">
                  <div className="whitespace-nowrap animate-marquee font-mono text-[0.8rem] text-accent/60 tracking-wider">
                    {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                    {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                    {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                    {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'}
                  </div>
                </div>
                
                {/* Time display */}
                <div className="absolute right-4 inset-y-0 flex items-center pointer-events-none text-[0.7rem] font-mono text-muted bg-bg/80 px-2 my-2 rounded-md">
                  {formatTime(decks[activeDeck].currentTime)} / {formatTime(tracks.find(t => t.id === decks[activeDeck].trackId)?.audioBuffer?.duration || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Deck Area */}
          <div className="p-6 grid grid-cols-[1fr_120px_1fr] gap-6 bg-surface2/30 border-b border-border">
            {/* Deck A */}
            <DeckUI 
              deckKey="A" 
              state={decks.A} 
              track={tracks.find(t => t.id === decks.A.trackId)} 
              onTogglePlay={() => toggleDeckPlay('A')}
              onEQChange={(band, val) => updateDeckEQ('A', band, val)}
              onFilterChange={(val) => updateDeckFilter('A', val)}
              onTempoChange={(val) => updateDeckTempo('A', val)}
              onDropTrack={(id) => loadToDeck(id, 'A')}
              onRandomizeStart={() => randomizeStart('A')}
              onTriggerFX={(fx, active) => triggerFX('A', fx, active)}
            />

            {/* Mixer Center */}
            <div className="flex flex-col items-center justify-between py-4">
              <div className="font-bebas text-xs tracking-widest text-muted">MIXER</div>
              
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex flex-col items-center gap-1">
                  <input 
                    type="range" min="0" max="1" step="0.01" value={fxIntensity} 
                    onChange={(e) => setFxIntensity(parseFloat(e.target.value))}
                    className="w-24 accent-accent"
                  />
                  <div className="font-mono text-[0.5rem] text-muted uppercase tracking-tighter">FX INTENSITY</div>
                </div>

                <div className="h-24 w-2 bg-bg rounded-full relative overflow-hidden">
                  <motion.div 
                    animate={{ height: `${(crossfade + 1) * 50}%` }}
                    className="absolute bottom-0 w-full bg-accent/50"
                  />
                </div>
                <input 
                  type="range" min="-1" max="1" step="0.01" value={crossfade} 
                  onChange={(e) => setCrossfade(parseFloat(e.target.value))}
                  className="w-32 accent-accent rotate-0"
                />
                <div className="font-mono text-[0.6rem] text-muted">CROSSFADE</div>
              </div>

              <div className="flex flex-col gap-3 w-full px-4">
                <div className="flex items-center justify-between bg-bg rounded-lg p-1 border border-border">
                  <button 
                    onClick={() => setIsAutoDropEnabled(!isAutoDropEnabled)}
                    className={`flex-1 py-1.5 rounded text-[0.65rem] font-bold flex items-center justify-center gap-1 transition-colors ${isAutoDropEnabled ? 'bg-accent text-black' : 'text-[#00e5ff] border border-[#00e5ff]/40 hover:bg-[#00e5ff]/10'}`}
                  >
                    <Timer className="w-3 h-3" /> AUTO
                  </button>
                  <button 
                    onClick={() => setAutoDropOrder(prev => prev === 'chronological' ? 'random' : 'chronological')}
                    className="flex-1 py-1.5 rounded text-[0.65rem] font-bold flex items-center justify-center gap-1 text-[#ffe600] border border-[#ffe600]/40 hover:bg-[#ffe600]/10 transition-colors"
                    title={`Order: ${autoDropOrder}`}
                  >
                    {autoDropOrder === 'chronological' ? <ListOrdered className="w-3 h-3" /> : <Shuffle className="w-3 h-3" />}
                  </button>
                </div>
                
                {isAutoDropEnabled && (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex bg-bg border border-border rounded-lg p-1">
                      <button 
                        onClick={() => setAutoDropMode('quick')}
                        className={`flex-1 py-1 rounded text-[0.6rem] font-bold transition-colors ${autoDropMode === 'quick' ? 'bg-[#bf00ff]/20 text-[#bf00ff] border border-[#bf00ff]/60' : 'text-[#bf00ff]/50 hover:text-[#bf00ff]'}`}
                      >
                        QUICK MIX
                      </button>
                      <button 
                        onClick={() => setAutoDropMode('end')}
                        className={`flex-1 py-1 rounded text-[0.6rem] font-bold transition-colors ${autoDropMode === 'end' ? 'bg-[#ff6b00]/20 text-[#ff6b00] border border-[#ff6b00]/60' : 'text-[#ff6b00]/50 hover:text-[#ff6b00]'}`}
                      >
                        FULL TRACK
                      </button>
                    </div>
                    <select 
                      value={autoDropInterval}
                      onChange={(e) => setAutoDropInterval(Number(e.target.value))}
                      className="w-full bg-bg border border-border rounded-lg py-1 px-2 text-[0.7rem] font-mono text-center text-accent outline-none"
                    >
                      {tierIntervals.map(sec => (
                        <option key={sec} value={sec}>{autoDropMode === 'quick' ? `${sec} SEC DROP` : `${sec} SEC BLEND`}</option>
                      ))}
                    </select>
                    
                    <button
                      onClick={startAutoMix}
                      className="w-full mt-1 bg-accent hover:bg-accent/80 text-black py-1.5 rounded-lg text-[0.7rem] font-bold tracking-wider transition-colors"
                    >
                      START MIX
                    </button>
                    
                    {isAutoDropEnabled && (
                      <div className="w-full mt-1 bg-surface2 border border-border rounded-lg py-1.5 px-2 text-[0.7rem] font-mono text-center text-accent animate-pulse">
                        {countdownText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Deck B */}
            <DeckUI 
              deckKey="B" 
              state={decks.B} 
              track={tracks.find(t => t.id === decks.B.trackId)} 
              onTogglePlay={() => toggleDeckPlay('B')}
              onEQChange={(band, val) => updateDeckEQ('B', band, val)}
              onFilterChange={(val) => updateDeckFilter('B', val)}
              onTempoChange={(val) => updateDeckTempo('B', val)}
              onDropTrack={(id) => loadToDeck(id, 'B')}
              onRandomizeStart={() => randomizeStart('B')}
              onTriggerFX={(fx, active) => triggerFX('B', fx, active)}
            />
          </div>

          {/* Bottom Tabs */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex border-b border-border bg-surface px-6">
              {['songs', 'mix', 'fx'].map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-6 py-3 text-[0.75rem] font-medium tracking-widest uppercase transition-all border-b-2 ${
                    activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'songs' && (
                <div className="space-y-8">
                  {tracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
                      <Music className="w-12 h-12 mb-4" />
                      <p>Upload audio files to see your library</p>
                    </div>
                  ) : groupedTracks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
                      <Activity className="w-12 h-12 mb-4" />
                      <p>No tracks match the current filters</p>
                    </div>
                  ) : (
                    groupedTracks.map(group => (
                      <div key={group.label} className="space-y-3">
                        <div className="flex items-center gap-3">
                          <h3 className="font-bebas text-lg tracking-[2px] text-muted">{group.label}</h3>
                          <div className="h-px flex-1 bg-border/50"></div>
                          <span className="font-mono text-[0.65rem] text-muted">{group.tracks.length} TRACK{group.tracks.length !== 1 ? 'S' : ''}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {group.tracks.map(track => (
                            <div key={track.id} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4 group hover:border-accent/50 transition-colors">
                              {(() => {
                                const persistence = getTrackPersistence(track);
                                return (
                                  <>
                              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-md" style={{ backgroundColor: track.color }}>🎵</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold truncate">{track.name}</div>
                                  {persistence.isSaving && <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.55rem] font-mono text-accent"><LoaderCircle className="w-3 h-3 animate-spin" /> SAVING</span>}
                                  {!persistence.isSaving && persistence.isSaved && <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[0.55rem] font-mono text-accent"><Cloud className="w-3 h-3" /> SAVED</span>}
                                </div>
                                <div className="text-xs text-muted font-mono mt-1">{track.bpm} BPM · {track.genre}</div>
                                <div className="text-[0.6rem] text-[#ffe600]/60 font-mono mt-0.5 truncate">{track.producer}</div>
                              </div>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => loadToDeck(track.id, 'A')} className="px-3 py-1.5 rounded bg-bg border border-border text-[0.6rem] font-bold hover:text-accent hover:border-accent transition-colors">DECK A</button>
                                <button onClick={() => loadToDeck(track.id, 'B')} className="px-3 py-1.5 rounded bg-bg border border-border text-[0.6rem] font-bold hover:text-accent2 hover:border-accent2 transition-colors">DECK B</button>
                                {persistence.isSaved && (
                                  <button
                                    onClick={() => void deleteProducerTrack(track.id)}
                                    disabled={persistence.isDeleting}
                                    className="px-3 py-1.5 rounded bg-bg border border-border text-[0.6rem] font-bold text-muted hover:text-red hover:border-red disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                                  >
                                    {persistence.isDeleting ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    DELETE
                                  </button>
                                )}
                              </div>
                                  </>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {activeTab === 'mix' && (
                <div className="space-y-2">
                  {mixQueue.map((id, i) => {
                    const t = tracks.find(track => track.id === id);
                    return t ? (
                      <div key={id} className="flex items-center gap-4 p-3 bg-surface border border-border rounded-lg">
                        <div className="font-mono text-xs text-muted">{i + 1}</div>
                        <div className="flex-1 font-medium">{t.name}</div>
                        <div className="text-xs text-muted">{t.bpm} BPM</div>
                        <button onClick={() => addToMix(id)} className="text-muted hover:text-red"><X className="w-4 h-4" /></button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      ) : viewMode === 'dj' ? (
        <DJMixView
          decks={decks}
          tracks={tracks}
          activeDeck={activeDeck}
          activeDeckRef={activeDeckRef}
          engineRef={engineRef}
          crossfade={crossfade}
          setCrossfade={setCrossfade}
          fxIntensity={fxIntensity}
          setFxIntensity={setFxIntensity}
          isAutoDropEnabled={isAutoDropEnabled}
          setIsAutoDropEnabled={setIsAutoDropEnabled}
          autoDropMode={autoDropMode}
          setAutoDropMode={setAutoDropMode}
          autoDropInterval={autoDropInterval}
          setAutoDropInterval={setAutoDropInterval}
          autoDropOrder={autoDropOrder}
          setAutoDropOrder={setAutoDropOrder}
          countdownText={countdownText}
          mixQueue={mixQueue}
          filteredSortedTracks={filteredSortedTracks}
          uniqueGenres={uniqueGenres}
          uniqueProducers={uniqueProducers}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterGenre={filterGenre}
          setFilterGenre={setFilterGenre}
          filterProducer={filterProducer}
          setFilterProducer={setFilterProducer}
          onTogglePlay={toggleDeckPlay}
          onEQChange={(deck, band, val) => updateDeckEQ(deck, band, val)}
          onFilterChange={(deck, val) => updateDeckFilter(deck, val)}
          onTempoChange={(deck, val) => updateDeckTempo(deck, val)}
          onDropTrack={(id, deck) => loadToDeck(id, deck)}
          onRandomizeStart={randomizeStart}
          onTriggerFX={(deck, fx, active) => triggerFX(deck, fx, active)}
          onPlayFullSong={playFullSong}
          onAddToMix={addToMix}
          setDecks={setDecks}
          startAutoMix={startAutoMix}
          tierIntervals={tierIntervals}
          isHybrid={canUseProducerTools}
        />
      ) : (
        <SharedTracks onLoadTrack={loadSharedTrack} />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg border-l-4 shadow-xl z-50 bg-surface border-border ${toast.type === 'error' ? 'border-l-red' : 'border-l-accent'}`}
          >
            <div className="text-sm font-medium">{toast.message}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DJMixView({
  decks, tracks, activeDeck, activeDeckRef, engineRef, crossfade, setCrossfade,
  fxIntensity, setFxIntensity, isAutoDropEnabled, setIsAutoDropEnabled,
  autoDropMode, setAutoDropMode, autoDropInterval, setAutoDropInterval,
  autoDropOrder, setAutoDropOrder, countdownText, mixQueue, filteredSortedTracks,
  uniqueGenres, uniqueProducers, sortBy, setSortBy, filterGenre, setFilterGenre,
  filterProducer, setFilterProducer, onTogglePlay, onEQChange, onFilterChange,
  onTempoChange, onDropTrack, onRandomizeStart, onTriggerFX, onPlayFullSong,
  onAddToMix, setDecks, startAutoMix, tierIntervals,
}: {
  decks: { A: DeckState; B: DeckState };
  tracks: Track[];
  activeDeck: 'A' | 'B';
  activeDeckRef: React.MutableRefObject<'A' | 'B'>;
  engineRef: React.MutableRefObject<DJEngine | null>;
  crossfade: number;
  setCrossfade: (v: number) => void;
  fxIntensity: number;
  setFxIntensity: (v: number) => void;
  isAutoDropEnabled: boolean;
  setIsAutoDropEnabled: (v: boolean) => void;
  autoDropMode: 'quick' | 'end';
  setAutoDropMode: (v: 'quick' | 'end') => void;
  autoDropInterval: number;
  setAutoDropInterval: (v: number) => void;
  autoDropOrder: 'chronological' | 'random';
  setAutoDropOrder: React.Dispatch<React.SetStateAction<'chronological' | 'random'>>;
  countdownText: string;
  mixQueue: string[];
  filteredSortedTracks: Track[];
  uniqueGenres: string[];
  uniqueProducers: string[];
  sortBy: string;
  setSortBy: (v: any) => void;
  filterGenre: string;
  setFilterGenre: (v: string) => void;
  filterProducer: string;
  setFilterProducer: (v: string) => void;
  onTogglePlay: (deck: 'A' | 'B') => void;
  onEQChange: (deck: 'A' | 'B', band: 'low' | 'mid' | 'high', val: number) => void;
  onFilterChange: (deck: 'A' | 'B', val: number) => void;
  onTempoChange: (deck: 'A' | 'B', val: number) => void;
  onDropTrack: (trackId: string, deck: 'A' | 'B') => void;
  onRandomizeStart: (deck: 'A' | 'B') => void;
  onTriggerFX: (deck: 'A' | 'B', fx: string, active: boolean) => void;
  onPlayFullSong: () => void;
  onAddToMix: (id: string) => void;
  setDecks: React.Dispatch<React.SetStateAction<{ A: DeckState; B: DeckState }>>;
  startAutoMix: () => void;
  tierIntervals: number[];
  isHybrid: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Global Progress & Controls */}
      <div className="px-6 pt-6 flex flex-col items-center bg-surface2/30 shrink-0">
        <div className="w-full max-w-4xl flex items-center gap-4">
          <button
            onClick={onPlayFullSong}
            className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 rounded-xl text-[0.75rem] font-bold flex items-center gap-2 transition-all shrink-0 shadow-lg shadow-accent/5"
          >
            <Play className="w-3.5 h-3.5" /> PLAY FULL SONG
          </button>
          <div className="flex-1 h-12 bg-bg rounded-xl border border-border relative overflow-hidden group cursor-pointer shadow-inner"
               onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const pct = x / rect.width;
                 const active = activeDeckRef.current;
                 const deck = active === 'A' ? engineRef.current?.deckA : engineRef.current?.deckB;
                 if (deck && deck.buffer) {
                   const newTime = pct * deck.buffer.duration;
                   deck.seek(newTime);
                   setDecks(prev => ({ ...prev, [active]: { ...prev[active], currentTime: newTime, startOffset: newTime } }));
                 }
               }}>
            <motion.div
              className="absolute inset-y-0 left-0 bg-accent/10 border-r border-accent/40"
              style={{ width: `${(decks[activeDeck].currentTime / (tracks.find(t => t.id === decks[activeDeck].trackId)?.audioBuffer?.duration || 1)) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center px-6 pointer-events-none overflow-hidden">
              <div className="whitespace-nowrap animate-marquee font-mono text-[0.8rem] text-accent/60 tracking-wider">
                {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'} • 
                {tracks.find(t => t.id === decks[activeDeck].trackId)?.name || 'NO TRACK PLAYING'}
              </div>
            </div>
            <div className="absolute right-4 inset-y-0 flex items-center pointer-events-none text-[0.7rem] font-mono text-muted bg-bg/80 px-2 my-2 rounded-md">
              {formatTime(decks[activeDeck].currentTime)} / {formatTime(tracks.find(t => t.id === decks[activeDeck].trackId)?.audioBuffer?.duration || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Deck Area */}
      <div className="p-6 grid grid-cols-[1fr_120px_1fr] gap-6 bg-surface2/30 border-b border-border shrink-0">
        <DeckUI
          deckKey="A"
          state={decks.A}
          track={tracks.find(t => t.id === decks.A.trackId)}
          onTogglePlay={() => onTogglePlay('A')}
          onEQChange={(band, val) => onEQChange('A', band, val)}
          onFilterChange={(val) => onFilterChange('A', val)}
          onTempoChange={(val) => onTempoChange('A', val)}
          onDropTrack={(id) => onDropTrack(id, 'A')}
          onRandomizeStart={() => onRandomizeStart('A')}
          onTriggerFX={(fx, active) => onTriggerFX('A', fx, active)}
        />

        {/* Mixer Center */}
        <div className="flex flex-col items-center justify-between py-4">
          <div className="font-bebas text-xs tracking-widest text-muted">MIXER</div>
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="flex flex-col items-center gap-1">
              <input type="range" min="0" max="1" step="0.01" value={fxIntensity} onChange={(e) => setFxIntensity(parseFloat(e.target.value))} className="w-24 accent-accent" />
              <div className="font-mono text-[0.5rem] text-muted uppercase tracking-tighter">FX INTENSITY</div>
            </div>
            <div className="h-24 w-2 bg-bg rounded-full relative overflow-hidden">
              <motion.div animate={{ height: `${(crossfade + 1) * 50}%` }} className="absolute bottom-0 w-full bg-accent/50" />
            </div>
            <input type="range" min="-1" max="1" step="0.01" value={crossfade} onChange={(e) => setCrossfade(parseFloat(e.target.value))} className="w-32 accent-accent" />
            <div className="font-mono text-[0.6rem] text-muted">CROSSFADE</div>
          </div>
          <div className="flex flex-col gap-3 w-full px-4">
            <div className="flex items-center justify-between bg-bg rounded-lg p-1 border border-border">
              <button onClick={() => setIsAutoDropEnabled(!isAutoDropEnabled)} className={`flex-1 py-1.5 rounded text-[0.65rem] font-bold flex items-center justify-center gap-1 transition-colors ${isAutoDropEnabled ? 'bg-accent text-black' : 'text-[#00e5ff] border border-[#00e5ff]/40 hover:bg-[#00e5ff]/10'}`}>
                <Timer className="w-3 h-3" /> AUTO
              </button>
              <button onClick={() => setAutoDropOrder(prev => prev === 'chronological' ? 'random' : 'chronological')} className="flex-1 py-1.5 rounded text-[0.65rem] font-bold flex items-center justify-center gap-1 text-[#ffe600] border border-[#ffe600]/40 hover:bg-[#ffe600]/10 transition-colors" title={`Order: ${autoDropOrder}`}>
                {autoDropOrder === 'chronological' ? <ListOrdered className="w-3 h-3" /> : <Shuffle className="w-3 h-3" />}
              </button>
            </div>
            {isAutoDropEnabled && (
              <div className="flex flex-col gap-2 w-full">
                <div className="flex bg-bg border border-border rounded-lg p-1">
                  <button onClick={() => setAutoDropMode('quick')} className={`flex-1 py-1 rounded text-[0.6rem] font-bold transition-colors ${autoDropMode === 'quick' ? 'bg-[#bf00ff]/20 text-[#bf00ff] border border-[#bf00ff]/60' : 'text-[#bf00ff]/50 hover:text-[#bf00ff]'}`}>QUICK MIX</button>
                  <button onClick={() => setAutoDropMode('end')} className={`flex-1 py-1 rounded text-[0.6rem] font-bold transition-colors ${autoDropMode === 'end' ? 'bg-[#ff6b00]/20 text-[#ff6b00] border border-[#ff6b00]/60' : 'text-[#ff6b00]/50 hover:text-[#ff6b00]'}`}>FULL TRACK</button>
                </div>
                <select value={autoDropInterval} onChange={(e) => setAutoDropInterval(Number(e.target.value))} className="w-full bg-bg border border-border rounded-lg py-1 px-2 text-[0.7rem] font-mono text-center text-accent outline-none">
                  {tierIntervals.map(sec => (
                    <option key={sec} value={sec}>{autoDropMode === 'quick' ? `${sec} SEC DROP` : `${sec} SEC BLEND`}</option>
                  ))}
                </select>
                <button onClick={startAutoMix} className="w-full mt-1 bg-accent hover:bg-accent/80 text-black py-1.5 rounded-lg text-[0.7rem] font-bold tracking-wider transition-colors">START MIX</button>
                {isAutoDropEnabled && (
                  <div className="w-full mt-1 bg-surface2 border border-border rounded-lg py-1.5 px-2 text-[0.7rem] font-mono text-center text-accent animate-pulse">{countdownText}</div>
                )}
              </div>
            )}
          </div>
        </div>

        <DeckUI
          deckKey="B"
          state={decks.B}
          track={tracks.find(t => t.id === decks.B.trackId)}
          onTogglePlay={() => onTogglePlay('B')}
          onEQChange={(band, val) => onEQChange('B', band, val)}
          onFilterChange={(val) => onFilterChange('B', val)}
          onTempoChange={(val) => onTempoChange('B', val)}
          onDropTrack={(id) => onDropTrack(id, 'B')}
          onRandomizeStart={() => onRandomizeStart('B')}
          onTriggerFX={(fx, active) => onTriggerFX('B', fx, active)}
        />
      </div>

      {/* DJ Browser: Filter Sidebar + Track Grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-[220px_1fr]">
        {/* Filter Sidebar */}
        <aside className="border-r border-border bg-surface flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="font-bebas text-lg tracking-[3px] text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">BROWSE</div>
            <div className="text-[0.65rem] text-muted font-mono mt-0.5">{filteredSortedTracks.length} / {tracks.length} TRACKS</div>
          </div>
          <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar">
            <div>
              <label className="font-mono text-[0.55rem] text-muted uppercase tracking-widest block mb-1">Sort By</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full bg-bg border border-border rounded-lg py-1.5 px-2 text-[0.7rem] font-mono text-accent outline-none">
                <option value="bpm">BPM</option>
                <option value="genre">Genre / Category</option>
                <option value="producer">Producer / Artist</option>
                <option value="newest">Newest Added</option>
                <option value="oldest">Oldest Added</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-[0.55rem] text-muted uppercase tracking-widest block mb-1">Category / Genre</label>
              <select value={filterGenre} onChange={e => setFilterGenre(e.target.value)} className="w-full bg-bg border border-border rounded-lg py-1.5 px-2 text-[0.7rem] font-mono text-[#00e5ff] outline-none">
                {uniqueGenres.map(g => <option key={g} value={g}>{g === 'all' ? 'All Genres' : g}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono text-[0.55rem] text-muted uppercase tracking-widest block mb-1">Producer / Artist</label>
              <select value={filterProducer} onChange={e => setFilterProducer(e.target.value)} className="w-full bg-bg border border-border rounded-lg py-1.5 px-2 text-[0.7rem] font-mono text-[#ffe600] outline-none">
                {uniqueProducers.map(p => <option key={p} value={p}>{p === 'all' ? 'All Producers' : p}</option>)}
              </select>
            </div>
            <button
              onClick={() => { setSortBy('bpm'); setFilterGenre('all'); setFilterProducer('all'); }}
              className="w-full py-1.5 rounded-lg text-[0.6rem] font-bold tracking-widest border border-[#00e5ff]/30 text-[#00e5ff]/60 hover:text-[#00e5ff] hover:border-[#00e5ff]/60 transition-colors"
            >
              RESET FILTERS
            </button>
          </div>
        </aside>

        {/* Track Grid */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
              <Music className="w-12 h-12 mb-4" />
              <p className="text-sm">No tracks available yet</p>
              <p className="text-xs mt-1">{isHybrid ? 'Switch to Producer view to upload tracks' : 'Check back later or browse the Community tab'}</p>
            </div>
          ) : filteredSortedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
              <Activity className="w-12 h-12 mb-4" />
              <p className="text-sm">No tracks match your filters</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="font-bebas text-lg tracking-[2px] text-[#00e5ff]/60">{filteredSortedTracks.length} TRACK{filteredSortedTracks.length !== 1 ? 'S' : ''}</span>
                {(filterGenre !== 'all' || filterProducer !== 'all') && (
                  <span className="text-[0.6rem] font-mono text-muted bg-surface border border-border rounded-full px-2 py-0.5">FILTERED</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSortedTracks.map(track => (
                  <div key={track.id} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4 group hover:border-[#00e5ff]/30 transition-colors">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-md shrink-0" style={{ backgroundColor: track.color }}>🎵</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm">{track.name}</div>
                      <div className="text-xs text-muted font-mono mt-0.5">{track.bpm} BPM · {track.genre}</div>
                      <div className="text-[0.6rem] text-[#ffe600]/60 font-mono mt-0.5 truncate">{track.producer}</div>
                    </div>
                    <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => onDropTrack(track.id, 'A')} className="px-2.5 py-1 rounded bg-bg border border-border text-[0.6rem] font-bold hover:text-accent hover:border-accent transition-colors">DECK A</button>
                      <button onClick={() => onDropTrack(track.id, 'B')} className="px-2.5 py-1 rounded bg-bg border border-border text-[0.6rem] font-bold hover:text-accent2 hover:border-accent2 transition-colors">DECK B</button>
                      <button onClick={() => onAddToMix(track.id)} className={`px-2.5 py-1 rounded bg-bg border border-border text-[0.6rem] font-bold transition-colors ${mixQueue.includes(track.id) ? 'text-accent3 border-accent3/50' : 'text-muted hover:text-accent3'}`}>QUEUE</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeckUI({ deckKey, state, track, onTogglePlay, onEQChange, onFilterChange, onTempoChange, onDropTrack, onRandomizeStart, onTriggerFX }: {
  deckKey: 'A' | 'B',
  state: DeckState,
  track?: Track,
  onTogglePlay: () => void,
  onEQChange: (band: 'low' | 'mid' | 'high', val: number) => void,
  onFilterChange: (val: number) => void,
  onTempoChange: (val: number) => void,
  onDropTrack: (trackId: string) => void,
  onRandomizeStart: () => void,
  onTriggerFX: (fx: string, active: boolean) => void
}) {
  const [activeFX, setActiveFX] = useState<string | null>(null);
  const [lastUsedFX, setLastUsedFX] = useState<string | null>(null);

  const fxPads = [
    { id: 'baby_scratch',  label: 'BABY SCRATCH',  neon: '#00e5ff' },
    { id: 'flare_scratch', label: 'FLARE SCRATCH', neon: '#ff2d9b' },
    { id: 'echo_scratch',  label: 'ECHO SCRATCH',  neon: '#bf00ff' },
    { id: 'beatmasher',    label: 'BEATMASHER',    neon: '#ffe600' },
    { id: 'echo_out',      label: 'ECHO OUT',      neon: '#ff6b00' },
    { id: 'delay_build',   label: 'DELAY BUILD',   neon: '#4d9fff' },
    { id: 'vinyl_stop',    label: 'VINYL STOP',    neon: '#ef4444' },
    { id: 'filter_riser',  label: 'FILTER RISER',  neon: '#00ffd5' },
  ];

  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const trackId = e.dataTransfer.getData('trackId');
        if (trackId) onDropTrack(trackId);
      }}
      className={`flex flex-col gap-4 p-4 rounded-2xl border border-border bg-bg/50 transition-colors ${deckKey === 'A' ? 'border-l-accent/30' : 'border-r-accent2/30'} hover:bg-surface`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-lg ${deckKey === 'A' ? 'bg-accent/20' : 'bg-accent2/20'}`}>
            {track ? '🎵' : <Activity className="w-5 h-5 text-muted" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate w-40">{track?.name || 'NO TRACK LOADED'}</div>
            <div className="text-[0.6rem] font-mono text-muted uppercase tracking-widest">DECK {deckKey}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-mono font-medium text-accent">{track?.bpm || '000'}</div>
          <div className="text-[0.6rem] text-muted font-mono">BPM</div>
        </div>
      </div>

      {/* Waveform Placeholder / Progress */}
      <div className="h-16 bg-bg rounded-lg relative overflow-hidden border border-border/50">
        <div 
          className={`absolute inset-y-0 left-0 transition-all duration-100 ${deckKey === 'A' ? 'bg-accent/20' : 'bg-accent2/20'}`}
          style={{ width: `${(state.currentTime / (track?.duration || 1)) * 100}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.6rem] text-muted">
          {formatTime(state.currentTime)} / {formatTime(track?.duration || 0)}
        </div>
      </div>

      {/* FX Pads */}
      <div className="relative">
        {/* Stop FX / Retrigger button — top-right corner of the pad grid */}
        <button
          onClick={() => {
            if (activeFX) {
              onTriggerFX(activeFX, false);
              setActiveFX(null);
            } else if (lastUsedFX) {
              setActiveFX(lastUsedFX);
              onTriggerFX(lastUsedFX, true);
            }
          }}
          title={activeFX ? 'STOP FX' : lastUsedFX ? `RETRIGGER: ${lastUsedFX.replace(/_/g, ' ').toUpperCase()}` : 'NO FX USED YET'}
          className="absolute -top-1 right-0 z-10 h-6 px-2 rounded text-[0.5rem] font-bold tracking-wider transition-all active:scale-95"
          style={{
            backgroundColor: activeFX ? '#ef4444' : lastUsedFX ? '#00f5a0' : '#1e2130',
            color: activeFX ? '#fff' : lastUsedFX ? '#000' : '#4a5568',
            boxShadow: activeFX
              ? '0 0 10px rgba(239,68,68,0.7)'
              : lastUsedFX
              ? '0 0 10px rgba(0,245,160,0.6)'
              : 'none',
            border: `1px solid ${activeFX ? '#ef4444' : lastUsedFX ? '#00f5a0' : '#1e2130'}`,
          }}
        >
          {activeFX ? '■ STOP FX' : '▶ RETRIGGER'}
        </button>

        <div className="grid grid-cols-4 gap-2 pt-7">
          {fxPads.map(pad => (
            <button
              key={pad.id}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setActiveFX(pad.id);
                setLastUsedFX(pad.id);
                onTriggerFX(pad.id, true);
              }}
              onPointerUp={() => {
                setActiveFX(null);
                onTriggerFX(pad.id, false);
              }}
              onPointerCancel={() => {
                setActiveFX(null);
                onTriggerFX(pad.id, false);
              }}
              className="h-12 rounded-lg text-[0.55rem] font-bold flex items-center justify-center text-center p-1 leading-tight transition-all active:scale-95"
              style={{
                backgroundColor: activeFX === pad.id ? pad.neon : `${pad.neon}18`,
                color: activeFX === pad.id ? '#000' : pad.neon,
                border: `1px solid ${activeFX === pad.id ? pad.neon : pad.neon + '50'}`,
                boxShadow: activeFX === pad.id ? `0 0 14px ${pad.neon}90` : 'none',
                textShadow: activeFX === pad.id ? 'none' : `0 0 6px ${pad.neon}80`,
              }}
            >
              {pad.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-6">
        {/* EQ Knobs */}
        <div className="space-y-3">
          <div className="font-mono text-[0.55rem] text-muted tracking-widest uppercase">Equalizer</div>
          <div className="flex justify-between gap-2">
            {(['low', 'mid', 'high'] as const).map(band => (
              <div key={band} className="flex flex-col items-center gap-1">
                <input 
                  type="range" min="-12" max="12" step="0.5" value={state.eq[band]} 
                  onChange={(e) => onEQChange(band, parseFloat(e.target.value))}
                  className="h-16 w-1 accent-accent vertical-range"
                  style={{ appearance: 'slider-vertical' } as any}
                />
                <span className="text-[0.5rem] text-muted uppercase">{band}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filter & Tempo */}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[0.55rem] text-muted uppercase">
              <span>Filter</span>
              <span>{state.filter === 0 ? 'OFF' : (state.filter < 0 ? 'LPF' : 'HPF')}</span>
            </div>
            <input 
              type="range" min="-1" max="1" step="0.01" value={state.filter} 
              onChange={(e) => onFilterChange(parseFloat(e.target.value))}
              className="w-full h-1 accent-accent"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[0.55rem] text-muted uppercase">
              <span>Tempo</span>
              <span>{state.playbackRate.toFixed(2)}x</span>
            </div>
            <input 
              type="range" min="0.5" max="1.5" step="0.01" value={state.playbackRate} 
              onChange={(e) => onTempoChange(parseFloat(e.target.value))}
              className="w-full h-1 accent-accent"
            />
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-4 pt-2 border-t border-border/30">
        <button 
          onClick={onRandomizeStart}
          className="p-2 text-[#ffe600] hover:text-[#ffe600]/80 drop-shadow-[0_0_4px_#ffe60080] transition-colors"
          title="Skip Front (Random 8-bar Section)"
        >
          <Dices className="w-4 h-4" />
        </button>
        <button className="p-2 text-[#00e5ff] hover:text-[#00e5ff]/80 drop-shadow-[0_0_4px_#00e5ff80] transition-colors"><SkipBack className="w-4 h-4" /></button>
        <button 
          onClick={onTogglePlay}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-lg ${
            state.isPlaying ? 'bg-red text-white' : (deckKey === 'A' ? 'bg-accent text-black' : 'bg-accent2 text-white')
          }`}
        >
          {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
        </button>
        <button className="p-2 text-[#00e5ff] hover:text-[#00e5ff]/80 drop-shadow-[0_0_4px_#00e5ff80] transition-colors"><SkipForward className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
