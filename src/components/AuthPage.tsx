import React, { useState } from 'react';
import { Headphones, Mail, Lock, User, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { HybridRole, UserTier } from '../types';

// ─── Tier & role data ─────────────────────────────────────────────────────────

const TIERS: {
  value: UserTier;
  label: string;
  badge: string;
  tagline: string;
  color: string;
  permissions: { icon: string; text: string; allowed: boolean }[];
}[] = [
  {
    value: 'free',
    label: 'FREE DJ',
    badge: 'STARTER',
    tagline: 'Jump in and explore',
    color: '#00f5a0',
    permissions: [
      { icon: '⏱', text: '10 second max clip play', allowed: true },
      { icon: '🎛', text: 'Basic EQ & filters', allowed: true },
      { icon: '☁️', text: 'Upload & save tracks', allowed: false },
      { icon: '🤝', text: 'Community sharing', allowed: false },
    ],
  },
  {
    value: 'pro',
    label: 'PRO DJ',
    badge: 'POPULAR',
    tagline: 'Longer drops, sharper control',
    color: '#00e5ff',
    permissions: [
      { icon: '⏱', text: '30 second max clip play', allowed: true },
      { icon: '🎛', text: 'Full EQ & effects suite', allowed: true },
      { icon: '☁️', text: 'Upload & save tracks', allowed: false },
      { icon: '🤝', text: 'Community sharing', allowed: false },
    ],
  },
  {
    value: 'hybrid',
    label: 'HYBRID DJ',
    badge: 'FULL ACCESS',
    tagline: 'The full booth experience',
    color: '#bf00ff',
    permissions: [
      { icon: '⏱', text: '60 second max clip play', allowed: true },
      { icon: '🎛', text: 'Full EQ & effects suite', allowed: true },
      { icon: '☁️', text: 'Upload & save tracks', allowed: true },
      { icon: '🤝', text: 'Community sharing', allowed: true },
    ],
  },
];

const HYBRID_ROLES: { value: HybridRole; label: string; desc: string }[] = [
  { value: 'producer', label: 'PRODUCER', desc: 'Upload & share tracks with the community' },
  { value: 'dj', label: 'DJ', desc: 'Browse & load community tracks' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { signUp, signIn } = useAuth();

  // Two-step flow
  const [step, setStep] = useState<'gate' | 'auth'>('gate');

  // Auth state
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [djName, setDjName] = useState('');
  const [tier, setTier] = useState<UserTier>('free');
  const [hybridRole, setHybridRole] = useState<HybridRole>('producer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedTier = TIERS.find(t => t.value === tier)!;

  function pickTier(t: UserTier) {
    setTier(t);
    setMode('signup');
    setError('');
    setStep('auth');
  }

  function backToGate() {
    setStep('gate');
    setError('');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!djName.trim()) { setError('DJ name is required'); setLoading(false); return; }
        await signUp(email, password, djName.trim(), tier, tier === 'hybrid' ? hybridRole : undefined);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') setError('Email already in use');
      else if (code === 'auth/invalid-email') setError('Invalid email address');
      else if (code === 'auth/weak-password') setError('Password must be at least 6 characters');
      else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Invalid email or password');
      else if (code === 'auth/missing-hybrid-role') setError('Please select a role for your Hybrid account');
      else setError(err?.message || 'Authentication failed');
    }
    setLoading(false);
  };

  // ── Shared shell (background + logo) ─────────────────────────────────────

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-bg flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,245,160,0.07),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_75%,rgba(191,0,255,0.06),transparent_50%)]" />
      <div className="relative z-10 w-full px-4 animate-landing-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center animate-vinyl-spin">
              <Headphones className="w-6 h-6 text-accent" />
            </div>
          </div>
          <h1 className="font-bebas text-5xl tracking-[6px] text-accent drop-shadow-[0_0_30px_rgba(0,245,160,0.4)]">
            DJ MIX<span className="text-text"> DASH</span>
          </h1>
        </div>
        {children}
        <div className="text-center mt-6 font-mono text-[0.6rem] text-muted/40 tracking-widest">
          POWERED BY VERCEL BLOB · DJ MIX DASH v1.0
        </div>
      </div>
    </div>
  );

  // ── STEP 1: Gate (tier picker) ────────────────────────────────────────────

  if (step === 'gate') {
    return (
      <Shell>
        <div className="max-w-2xl mx-auto">
          <p className="text-center font-bebas text-3xl tracking-[5px] text-text mb-1">
            WHAT DJ DO YOU WANT TO BE TODAY?
          </p>
          <p className="text-center font-mono text-[0.65rem] text-muted/60 tracking-widest mb-6">
            CHOOSE YOUR TIER · UNDERSTAND YOUR PERMISSIONS · THEN SIGN IN OR SIGN UP
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TIERS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => pickTier(t.value)}
                className="group relative flex flex-col rounded-2xl border p-5 text-left transition-all duration-200 hover:scale-[1.02] focus:outline-none"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.borderColor = t.color;
                  el.style.boxShadow = `0 0 32px ${t.color}35`;
                  el.style.backgroundColor = `${t.color}0d`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.borderColor = 'var(--color-border)';
                  el.style.boxShadow = 'none';
                  el.style.backgroundColor = 'var(--color-surface)';
                }}
              >
                <span
                  className="self-start mb-3 rounded-full px-2.5 py-0.5 font-mono text-[0.5rem] font-bold tracking-widest"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}
                >
                  {t.badge}
                </span>

                <span className="font-bebas text-3xl tracking-[3px] leading-none mb-1" style={{ color: t.color }}>
                  {t.label}
                </span>

                <span className="font-mono text-[0.6rem] text-muted/70 mb-4 leading-snug">{t.tagline}</span>

                <ul className="space-y-2 mb-5 flex-1">
                  {t.permissions.map(p => (
                    <li key={p.text} className="flex items-start gap-2">
                      <span
                        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[0.6rem] font-bold mt-0.5"
                        style={{
                          backgroundColor: p.allowed ? `${t.color}25` : 'rgba(255,255,255,0.05)',
                          color: p.allowed ? t.color : 'var(--color-muted)',
                        }}
                      >
                        {p.allowed ? '✓' : '✕'}
                      </span>
                      <span
                        className="font-mono text-[0.6rem] leading-tight"
                        style={{ color: p.allowed ? 'var(--color-text)' : 'var(--color-muted)', opacity: p.allowed ? 1 : 0.45 }}
                      >
                        {p.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className="w-full py-2.5 rounded-xl font-bold tracking-widest text-[0.7rem] flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: `${t.color}20`, color: t.color }}
                >
                  I'M A {t.label} <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>

          <p className="text-center font-mono text-[0.55rem] text-muted/40 mt-5 tracking-wider">
            ALREADY HAVE AN ACCOUNT?{' '}
            <button
              type="button"
              className="underline text-muted/60 hover:text-text transition-colors"
              onClick={() => { setMode('signin'); setStep('auth'); }}
            >
              SIGN IN HERE
            </button>
          </p>
        </div>
      </Shell>
    );
  }

  // ── STEP 2: Auth form ─────────────────────────────────────────────────────

  return (
    <Shell>
      <div className="max-w-md mx-auto">
        {/* Back to gate */}
        <button
          type="button"
          onClick={backToGate}
          className="flex items-center gap-1.5 font-mono text-[0.65rem] text-muted/60 hover:text-text transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          CHANGE DJ TYPE
        </button>

        {/* Selected tier banner (signup mode only) */}
        {mode === 'signup' && (
          <div
            className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-4"
            style={{ borderColor: `${selectedTier.color}50`, backgroundColor: `${selectedTier.color}0d` }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-bebas text-xl tracking-[2px]" style={{ color: selectedTier.color }}>
                  {selectedTier.label}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 font-mono text-[0.45rem] font-bold tracking-widest"
                  style={{ backgroundColor: `${selectedTier.color}22`, color: selectedTier.color }}
                >
                  {selectedTier.badge}
                </span>
              </div>
              <p className="font-mono text-[0.55rem] text-muted/70">{selectedTier.tagline}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {selectedTier.permissions.map(p => (
                <span
                  key={p.text}
                  className="font-mono text-[0.45rem] leading-none"
                  style={{ color: p.allowed ? selectedTier.color : 'var(--color-muted)', opacity: p.allowed ? 1 : 0.4 }}
                >
                  {p.allowed ? '✓' : '✕'} {p.icon}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
          {/* Mode toggle */}
          <div className="flex bg-bg border border-border rounded-xl p-1 gap-0.5">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-[0.7rem] font-bold tracking-widest transition-all ${
                mode === 'signin' ? 'bg-accent text-black shadow-lg' : 'text-muted hover:text-text'
              }`}
            >
              SIGN IN
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-[0.7rem] font-bold tracking-widest transition-all ${
                mode === 'signup' ? 'bg-[#bf00ff] text-white shadow-lg' : 'text-muted hover:text-text'
              }`}
            >
              SIGN UP
            </button>
          </div>

          {/* DJ Name */}
          {mode === 'signup' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="DJ Name"
                value={djName}
                onChange={e => setDjName(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-text placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          )}

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-bg border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-text placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-bg border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-text placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Hybrid Role (signup + hybrid tier only) */}
          {mode === 'signup' && tier === 'hybrid' && (
            <div className="space-y-1.5">
              <div className="font-mono text-[0.6rem] text-muted tracking-widest uppercase">YOUR HYBRID ROLE</div>
              <div className="grid grid-cols-2 gap-2">
                {HYBRID_ROLES.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setHybridRole(r.value)}
                    className="relative p-3 rounded-xl border text-center transition-all"
                    style={{
                      borderColor: hybridRole === r.value ? '#bf00ff' : 'var(--color-border)',
                      backgroundColor: hybridRole === r.value ? '#bf00ff15' : 'transparent',
                      boxShadow: hybridRole === r.value ? '0 0 20px #bf00ff30' : 'none',
                    }}
                  >
                    <div className="font-bold text-[0.65rem] tracking-wider" style={{ color: '#bf00ff' }}>{r.label}</div>
                    <div className="text-[0.5rem] text-muted mt-1 leading-tight">{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red/10 border border-red/30 rounded-lg py-2 px-3 text-[0.75rem] text-red font-medium">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold tracking-widest text-[0.8rem] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: mode === 'signup' ? selectedTier.color : 'var(--color-accent)',
              color: mode === 'signup' && tier === 'hybrid' ? '#fff' : '#000',
            }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'ENTER THE BOOTH' : `JOIN AS ${selectedTier.label}`}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </Shell>
  );
}
