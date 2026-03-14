import React, { useState } from 'react';
import { Headphones, Mail, Lock, User, ChevronRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserTier } from '../types';

export default function AuthPage() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [djName, setDjName] = useState('');
  const [tier, setTier] = useState<UserTier>('free');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!djName.trim()) { setError('DJ name is required'); setLoading(false); return; }
        await signUp(email, password, djName.trim(), tier);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') setError('Email already in use');
      else if (code === 'auth/invalid-email') setError('Invalid email address');
      else if (code === 'auth/weak-password') setError('Password must be at least 6 characters');
      else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Invalid email or password');
      else setError(err?.message || 'Authentication failed');
    }
    setLoading(false);
  };

  const tiers: { value: UserTier; label: string; desc: string; color: string }[] = [
    { value: 'free', label: 'FREE DJ', desc: 'Quick mixes up to 10s', color: '#00f5a0' },
    { value: 'pro', label: 'PRO DJ', desc: 'Extended drops up to 30s', color: '#00e5ff' },
    { value: 'hybrid', label: 'HYBRID DJ', desc: 'Full access + upload & share', color: '#bf00ff' },
  ];

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,245,160,0.08),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(191,0,255,0.06),transparent_50%)]" />

      <div className="relative z-10 w-full max-w-md px-6 animate-landing-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center animate-vinyl-spin">
              <Headphones className="w-7 h-7 text-accent" />
            </div>
          </div>
          <h1 className="font-bebas text-5xl tracking-[6px] text-accent drop-shadow-[0_0_30px_rgba(0,245,160,0.4)]">
            DJ MIX<span className="text-text"> DASH</span>
          </h1>
          <p className="font-mono text-[0.7rem] text-muted mt-1 tracking-widest">
            {mode === 'signin' ? 'WELCOME BACK' : 'JOIN THE BOOTH'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
          {/* Mode Toggle */}
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

          {/* DJ Name (signup only) */}
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

          {/* Tier Selection (signup only) */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <div className="font-mono text-[0.6rem] text-muted tracking-widest uppercase">SELECT YOUR TIER</div>
              <div className="grid grid-cols-3 gap-2">
                {tiers.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTier(t.value)}
                    className="relative p-3 rounded-xl border text-center transition-all"
                    style={{
                      borderColor: tier === t.value ? t.color : 'var(--color-border)',
                      backgroundColor: tier === t.value ? `${t.color}15` : 'transparent',
                      boxShadow: tier === t.value ? `0 0 20px ${t.color}30` : 'none',
                    }}
                  >
                    <div className="font-bold text-[0.65rem] tracking-wider" style={{ color: t.color }}>{t.label}</div>
                    <div className="text-[0.5rem] text-muted mt-1 leading-tight">{t.desc}</div>
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
              backgroundColor: mode === 'signin' ? 'var(--color-accent)' : '#bf00ff',
              color: mode === 'signin' ? '#000' : '#fff',
            }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'ENTER THE BOOTH' : 'CREATE ACCOUNT'}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center mt-6 font-mono text-[0.6rem] text-muted/50 tracking-widest">
          POWERED BY FIRE · DJ MIX DASH v1.0
        </div>
      </div>
    </div>
  );
}
