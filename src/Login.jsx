import { useState } from 'react'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from './firebase'


const LOGIN_URL = 'https://us-central1-invoice-management-861d5.cloudfunctions.net/companyLogin';

export default function Login ({onSuccess}) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try{
            const res = await fetch (LOGIN_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username, password})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login Failed')

            await signInWithCustomToken(auth, data.token);
            onSuccess?.();

        } catch(err){
            setError(err.message)
        }finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-background-tertiary)' }}>
          <form onSubmit={handleSubmit} style={{ background: 'var(--color-background-primary)', padding: 32, borderRadius: 12, width: 320 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 20px' }}>Sign in</h2>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', marginBottom: 10, borderRadius: 8, border: '1px solid var(--color-border-tertiary)', boxSizing: 'border-box' }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', marginBottom: 16, borderRadius: 8, border: '1px solid var(--color-border-tertiary)', boxSizing: 'border-box' }}
            />
            {error && <p style={{ color: '#B3261E', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: '#639922', color: '#fff', border: 'none', fontWeight: 500, cursor: 'pointer' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      );
}
