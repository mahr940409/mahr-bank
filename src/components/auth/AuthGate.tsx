import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthenticated(Boolean(data.session));
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthenticated(Boolean(session));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError('Correo o contraseña incorrectos.');
    setSubmitting(false);
  };

  if (!ready) return null;
  if (authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[hsl(220_42%_6%)] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-[hsl(39_45%_45%_/_0.45)] bg-[hsl(220_35%_10%_/_0.96)] text-[hsl(42_35%_94%)] shadow-2xl">
        <CardHeader className="text-center">
          <img src="/mahr-bank-emblem.png" alt="MAHR Bank" className="mx-auto h-16 w-16 rounded-xl border border-[hsl(39_64%_62%_/_0.6)] object-cover" />
          <Lock className="mx-auto h-8 w-8 text-[hsl(39_64%_62%)]" />
          <CardTitle>Acceso a MAHR Bank</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-4">
            <Input className="border-[hsl(39_45%_45%_/_0.7)] bg-[hsl(220_28%_15%)] text-white placeholder:text-slate-400" type="email" required placeholder="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input className="border-[hsl(39_45%_45%_/_0.7)] bg-[hsl(220_28%_15%)] text-white placeholder:text-slate-400" type="password" required placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">{submitting ? 'Ingresando…' : 'Ingresar'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
