import React, { useState, useEffect, useRef, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload, Download, Music, Search, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { SharedTrack, Genre } from '../types';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export default function SharedTracks({ onLoadTrack }: { onLoadTrack: (url: string, name: string) => void }) {
  const { profile } = useAuth();
  const [sharedTracks, setSharedTracks] = useState<SharedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProducer = profile?.tier === 'hybrid' && profile?.hybridRole === 'producer';

  const fetchSharedTracks = useCallback(async () => {
    try {
      const tracks = await parseJsonResponse<SharedTrack[]>(await fetch('/api/tracks'));
      setSharedTracks(tracks);
    } catch (err) {
      console.error('Failed to fetch shared tracks:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSharedTracks(); }, [fetchSharedTracks]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith('audio/')) {
      setError('Only audio files are allowed');
      return;
    }
    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      setError('File must be under 50MB');
      return;
    }

    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const pathname = `sharedTracks/${profile.uid}/${Date.now()}_${sanitizedName}`;
      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        onUploadProgress: event => {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });

      const producer = file.name.includes(' - ')
        ? file.name.split(' - ')[0].trim()
        : profile.djName;
      const trackName = file.name.replace(/\.[^/.]+$/, '');

      const trackData = {
        name: trackName,
        bpm: 0,
        genre: 'Unknown' as Genre,
        producer,
        duration: 0,
        storageUrl: blob.url,
        fileSize: file.size,
      };

      await parseJsonResponse<SharedTrack>(await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackData),
      }));

      await fetchSharedTracks();
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (track: SharedTrack) => {
    if (track.uploadedBy !== profile?.uid) return;
    try {
      await parseJsonResponse<{ success: boolean }>(await fetch(`/api/tracks/${track.id}`, {
        method: 'DELETE',
      }));
      setSharedTracks(prev => prev.filter(t => t.id !== track.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleDownload = async (track: SharedTrack) => {
    // Load the track immediately; increment stats in the background
    onLoadTrack(track.storageUrl, track.name);
    setSharedTracks(prev => prev.map(t => t.id === track.id ? { ...t, downloadCount: t.downloadCount + 1 } : t));
    fetch(`/api/tracks/${track.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'incrementDownload' }),
    }).catch(err => console.error('Failed to increment download count:', err));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredTracks = sharedTracks.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.uploaderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.producer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-surface/50 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bebas text-2xl tracking-[4px] text-[#bf00ff] drop-shadow-[0_0_16px_rgba(191,0,255,0.4)]">
              COMMUNITY TRACKS
            </h2>
            <p className="font-mono text-[0.65rem] text-muted tracking-wider mt-0.5">
              {sharedTracks.length} SHARED TRACK{sharedTracks.length !== 1 ? 'S' : ''} FROM THE COMMUNITY
            </p>
          </div>

          {/* Upload Button (Hybrid Producer only) */}
          {isProducer && (
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="audio/*"
                onChange={handleUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-5 py-2.5 bg-[#bf00ff] hover:bg-[#bf00ff]/80 text-white rounded-xl text-[0.75rem] font-bold tracking-wider flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-[#bf00ff]/20"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    UPLOADING {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    SHARE A TRACK
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Upload progress bar */}
        {uploading && (
          <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-[#bf00ff] rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg py-2 px-3 text-[0.75rem] text-red font-medium mb-3">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search tracks, DJs, producers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-bg border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-muted/50 outline-none focus:border-[#bf00ff]/50 transition-colors"
          />
        </div>
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading community tracks...</p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
            <Music className="w-12 h-12 mb-4" />
            <p className="text-sm">{searchQuery ? 'No matches found' : 'No shared tracks yet'}</p>
            {isProducer && !searchQuery && (
              <p className="text-xs mt-1">Be the first to share a track!</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTracks.map(track => (
              <div
                key={track.id}
                className="bg-surface border border-border rounded-xl p-4 group hover:border-[#bf00ff]/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[#bf00ff]/10 border border-[#bf00ff]/20 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-[#bf00ff]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{track.name}</div>
                    <div className="text-[0.65rem] text-muted font-mono mt-0.5">
                      by <span className="text-[#bf00ff]">{track.uploaderName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[0.6rem] text-muted font-mono">
                      <span>{formatSize(track.fileSize)}</span>
                      <span>·</span>
                      <span>{track.downloadCount} load{track.downloadCount !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{new Date(track.uploadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  <button
                    onClick={() => handleDownload(track)}
                    className="flex-1 py-2 rounded-lg bg-[#bf00ff]/10 hover:bg-[#bf00ff]/20 text-[#bf00ff] border border-[#bf00ff]/20 text-[0.7rem] font-bold tracking-wider flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    LOAD TO DECK
                  </button>
                  {track.uploadedBy === profile?.uid && (
                    <button
                      onClick={() => handleDelete(track)}
                      className="py-2 px-3 rounded-lg bg-red/10 hover:bg-red/20 text-red border border-red/20 transition-all"
                      title="Delete your upload"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
