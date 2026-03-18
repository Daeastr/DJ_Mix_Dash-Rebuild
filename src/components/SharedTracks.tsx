import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, HelpCircle, Music2, Plus, Heart, ChevronDown, ChevronUp,
  Send, Trash2, Loader2, Users, Sparkles,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { CommunityPost, CommunityComment, PostType } from '../types';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const POST_TYPE_META: Record<PostType, { label: string; icon: React.ReactNode; color: string }> = {
  general: { label: 'DISCUSSION', icon: <MessageCircle className="w-3 h-3" />, color: '#00e5ff' },
  question: { label: 'Q&A', icon: <HelpCircle className="w-3 h-3" />, color: '#ffe600' },
  track_spotlight: { label: 'TRACK SPOTLIGHT', icon: <Music2 className="w-3 h-3" />, color: '#bf00ff' },
};

async function api<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Request failed');
  }
  return res.json() as Promise<T>;
}

// ─── Post Card ──────────────────────────────────────────────────────────────
function PostCard({
  post,
  currentUid,
  onLike,
  onDelete,
  onCommentPosted,
}: {
  post: CommunityPost;
  currentUid: string | undefined;
  onLike: (post: CommunityPost) => void;
  onDelete: (postId: string) => void;
  onCommentPosted: (postId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const meta = POST_TYPE_META[post.type];
  const liked = currentUid ? post.likes.includes(currentUid) : false;

  const loadComments = useCallback(async () => {
    if (loadingComments) return;
    setLoadingComments(true);
    try {
      const { comments: fetched } = await api<{ post: CommunityPost; comments: CommunityComment[] }>(
        `/api/community/${post.id}`
      );
      setComments(fetched);
    } catch { /* ignore */ }
    setLoadingComments(false);
  }, [post.id, loadingComments]);

  const toggle = () => {
    if (!expanded) loadComments();
    setExpanded(e => !e);
  };

  const submitComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const comment = await api<CommunityComment>(`/api/community/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      setComments(prev => [...prev, comment]);
      setCommentText('');
      onCommentPosted(post.id);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden transition-colors hover:border-white/10">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div
            className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
            style={{ backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
          >
            <span style={{ color: meta.color }}>{meta.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span
                className="text-[0.55rem] font-bold tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ color: meta.color, backgroundColor: `${meta.color}15` }}
              >
                {meta.label}
              </span>
              <span className="text-[0.6rem] text-muted font-mono">
                {post.authorName} · {timeAgo(post.createdAt)}
              </span>
            </div>
            <div className="font-semibold text-sm leading-snug">{post.title}</div>
            {!expanded && (
              <p className="text-[0.75rem] text-muted mt-1 line-clamp-2 leading-relaxed">{post.body}</p>
            )}
          </div>

          {currentUid === post.authorId && (
            <button
              onClick={() => onDelete(post.id)}
              className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
              title="Delete post"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {expanded && (
          <p className="text-[0.8rem] text-text/80 mt-3 mb-1 leading-relaxed whitespace-pre-wrap">{post.body}</p>
        )}

        {post.type === 'track_spotlight' && post.trackRef && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-[#bf00ff]/8 border border-[#bf00ff]/20 text-[0.65rem] font-mono text-[#bf00ff] flex items-center gap-2">
            <Music2 className="w-3 h-3" />
            {post.trackRef.name} — {post.trackRef.producer}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 mt-3">
          <button
            onClick={() => onLike(post)}
            className="flex items-center gap-1.5 text-[0.65rem] font-mono transition-colors"
          >
            <Heart
              className="w-3.5 h-3.5 transition-colors"
              style={{ color: liked ? '#ff2d9b' : undefined, fill: liked ? '#ff2d9b' : 'transparent' }}
            />
            <span className="text-muted" style={{ color: liked ? '#ff2d9b' : undefined }}>
              {post.likes.length}
            </span>
          </button>

          <button
            onClick={toggle}
            className="flex items-center gap-1.5 text-[0.65rem] font-mono text-muted hover:text-[#00e5ff] transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{post.commentCount} comment{post.commentCount !== 1 ? 's' : ''}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Comments */}
      {expanded && (
        <div className="border-t border-border/50 bg-bg/40">
          {loadingComments ? (
            <div className="flex items-center justify-center py-5">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          ) : (
            <div className="px-4 py-3 space-y-3">
              {comments.length === 0 && (
                <p className="text-[0.65rem] text-muted/40 font-mono text-center py-1">No replies yet — be first</p>
              )}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-[0.55rem] font-bold text-accent shrink-0 mt-0.5">
                    {c.authorName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-bold text-text/80">{c.authorName}</span>
                      <span className="text-[0.55rem] text-muted font-mono">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-[0.75rem] text-text/70 mt-0.5 leading-relaxed">{c.body}</p>
                  </div>
                </div>
              ))}

              {currentUid && (
                <div className="flex gap-2 pt-1">
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
                    }}
                    placeholder="Add a reply…"
                    className="flex-1 bg-bg border border-border rounded-lg py-2 px-3 text-[0.75rem] text-text placeholder:text-muted/40 outline-none focus:border-accent/50 transition-colors"
                  />
                  <button
                    onClick={submitComment}
                    disabled={submitting || !commentText.trim()}
                    className="p-2 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 transition-all disabled:opacity-40"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── New Post Form ───────────────────────────────────────────────────────────
function NewPostForm({
  onCreated,
  onCancel,
}: {
  onCreated: (post: CommunityPost) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PostType>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !body.trim()) { setError('Title and body are required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const post = await api<CommunityPost>('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title: title.trim(), body: body.trim() }),
      });
      onCreated(post);
    } catch (err: any) {
      setError(err?.message || 'Failed to post');
    }
    setSubmitting(false);
  };

  const typeOptions: { value: PostType; label: string; color: string }[] = [
    { value: 'general', label: '💬 Discussion', color: '#00e5ff' },
    { value: 'question', label: '❓ Q&A', color: '#ffe600' },
    { value: 'track_spotlight', label: '🎵 Track Spotlight', color: '#bf00ff' },
  ];

  return (
    <div className="bg-surface border border-accent/30 rounded-xl p-5 mb-4 shadow-lg shadow-accent/5">
      <div className="font-bebas text-base tracking-[2px] text-accent mb-4">NEW POST</div>

      {/* Type selector */}
      <div className="flex gap-2 mb-4">
        {typeOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            className="flex-1 py-2 rounded-lg text-[0.65rem] font-bold tracking-wider border transition-all"
            style={{
              color: type === opt.value ? opt.color : undefined,
              borderColor: type === opt.value ? `${opt.color}60` : undefined,
              backgroundColor: type === opt.value ? `${opt.color}12` : undefined,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Post title…"
        maxLength={200}
        className="w-full bg-bg border border-border rounded-lg py-2.5 px-3 text-sm text-text placeholder:text-muted/40 outline-none focus:border-accent/50 transition-colors mb-3"
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write your post…"
        maxLength={2000}
        rows={4}
        className="w-full bg-bg border border-border rounded-lg py-2.5 px-3 text-sm text-text placeholder:text-muted/40 outline-none focus:border-accent/50 transition-colors resize-none"
      />

      {error && (
        <p className="text-[0.7rem] text-red-400 font-mono mt-2">{error}</p>
      )}

      <div className="flex gap-3 mt-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-[0.7rem] font-bold text-muted hover:text-text border border-border hover:border-white/20 transition-colors"
        >
          CANCEL
        </button>
        <button
          onClick={submit}
          disabled={submitting || !title.trim() || !body.trim()}
          className="px-5 py-2 rounded-lg text-[0.7rem] font-bold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-all disabled:opacity-40 flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          POST
        </button>
      </div>
    </div>
  );
}

// ─── Main Community Hub ───────────────────────────────────────────────────────
export default function SharedTracks() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');
  const [showNewPost, setShowNewPost] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await api<CommunityPost[]>('/api/community');
      setPosts(fetched);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleLike = async (post: CommunityPost) => {
    if (!profile) return;
    const alreadyLiked = post.likes.includes(profile.uid);
    // Optimistic update
    setPosts(prev =>
      prev.map(p =>
        p.id === post.id
          ? {
              ...p,
              likes: alreadyLiked
                ? p.likes.filter(u => u !== profile.uid)
                : [...p.likes, profile.uid],
            }
          : p
      )
    );
    try {
      await api(`/api/community/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: alreadyLiked ? 'unlike' : 'like' }),
      });
    } catch { fetchPosts(); /* revert on error */ }
  };

  const handleDelete = async (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    try {
      await api(`/api/community/${postId}`, { method: 'DELETE' });
    } catch { fetchPosts(); }
  };

  const handleCommentPosted = (postId: string) => {
    setPosts(prev =>
      prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)
    );
  };

  const filtered = typeFilter === 'all' ? posts : posts.filter(p => p.type === typeFilter);

  const filterTabs: { value: PostType | 'all'; label: string; color: string }[] = [
    { value: 'all', label: 'ALL', color: '#ffffff' },
    { value: 'general', label: '💬 DISCUSSION', color: '#00e5ff' },
    { value: 'question', label: '❓ Q&A', color: '#ffe600' },
    { value: 'track_spotlight', label: '🎵 SPOTLIGHT', color: '#bf00ff' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-surface/50 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bebas text-2xl tracking-[4px] text-[#bf00ff] drop-shadow-[0_0_16px_rgba(191,0,255,0.4)]">
              COMMUNITY HUB
            </h2>
            <p className="font-mono text-[0.65rem] text-muted tracking-wider mt-0.5">
              <Users className="w-3 h-3 inline mr-1.5 -mt-0.5" />
              {posts.length} POST{posts.length !== 1 ? 'S' : ''} · DISCUSSIONS · Q&A · TRACK SPOTLIGHTS
            </p>
          </div>
          {profile && (
            <button
              onClick={() => setShowNewPost(v => !v)}
              className="px-5 py-2.5 rounded-xl text-[0.75rem] font-bold tracking-wider flex items-center gap-2 transition-all shadow-lg"
              style={{
                backgroundColor: showNewPost ? '#bf00ff30' : '#bf00ff',
                color: showNewPost ? '#bf00ff' : 'white',
                border: showNewPost ? '1px solid #bf00ff60' : 'none',
              }}
            >
              {showNewPost ? 'CANCEL' : <><Plus className="w-4 h-4" /> NEW POST</>}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className="px-3 py-1.5 rounded-lg text-[0.6rem] font-bold tracking-wider border transition-all"
              style={{
                color: typeFilter === tab.value ? tab.color : undefined,
                borderColor: typeFilter === tab.value ? `${tab.color}50` : undefined,
                backgroundColor: typeFilter === tab.value ? `${tab.color}12` : undefined,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {showNewPost && profile && (
          <NewPostForm
            onCreated={post => {
              setPosts(prev => [post, ...prev]);
              setShowNewPost(false);
            }}
            onCancel={() => setShowNewPost(false)}
          />
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm font-mono">Loading community…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted opacity-30">
            <Users className="w-12 h-12 mb-4" />
            <p className="text-sm">{typeFilter === 'all' ? 'No posts yet' : 'No posts in this category'}</p>
            {profile && typeFilter === 'all' && (
              <p className="text-xs mt-1">Start the conversation!</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {filtered.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUid={profile?.uid}
                onLike={handleLike}
                onDelete={handleDelete}
                onCommentPosted={handleCommentPosted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
