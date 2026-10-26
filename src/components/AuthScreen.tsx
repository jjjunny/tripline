import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';

const ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, '이메일 또는 비밀번호가 맞지 않아요'],
  [/email not confirmed/i, '이메일 인증이 아직 안 됐어요. 받은편지함의 인증 메일을 확인해 주세요'],
  [/already registered|already been registered/i, '이미 가입된 이메일이에요. 로그인해 주세요'],
  [/password should be at least/i, '비밀번호는 6자 이상이어야 해요'],
  [/rate limit/i, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요'],
  [/failed to fetch|network/i, 'Supabase 서버에 연결하지 못했어요. .env의 VITE_SUPABASE_URL을 확인해 주세요'],
];

function translate(msg: string): string {
  for (const [re, ko] of ERRORS) if (re.test(msg)) return ko;
  return msg;
}

export function AuthScreen({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signin') {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({ tone: 'info', text: `${email}으로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.` });
          setMode('signin');
        }
      }
    } catch (e) {
      setMessage({ tone: 'error', text: translate(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <svg viewBox="0 0 520 520">
          <path d="M40 420 C 160 420, 120 160, 260 160 S 380 400, 480 120" fill="none" stroke="#2F6FDB" strokeWidth="14" strokeLinecap="round" />
          <path d="M60 120 C 160 140, 220 300, 300 300 S 420 260, 470 420" fill="none" stroke="#1E9E5A" strokeWidth="14" strokeLinecap="round" />
          <path d="M40 260 L 480 260" fill="none" stroke="#E0782A" strokeWidth="14" strokeLinecap="round" />
          {[
            [40, 420],
            [260, 160],
            [480, 120],
            [60, 120],
            [300, 300],
            [470, 420],
            [40, 260],
            [480, 260],
            [176, 260],
            [372, 260],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="15" fill="#fff" stroke="#14213D" strokeWidth="6" />
          ))}
        </svg>
      </div>
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="auth-title">Tripline</h1>
        <p className="auth-lead">날짜별 동선을 지도 위에 노선도처럼 짜고, 다녀온 곳을 하나씩 체크하세요.</p>
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
            로그인
          </button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
            회원가입
          </button>
        </div>
        <label className="field">
          <span>이메일</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && (
          <p className={message.tone === 'error' ? 'form-error' : 'form-info'} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'signin' ? '로그인' : '가입하기'}
        </button>
      </form>
    </div>
  );
}
