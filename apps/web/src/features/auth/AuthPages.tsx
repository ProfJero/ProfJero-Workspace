import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { toUserError } from '@profjero/shared';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/app/auth';
import { Button, Field, Input } from '@/ui/primitives';
import { InlineError, Notice } from '@/ui/overlays';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.png" alt="" className="mb-3 size-14" />
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-sm text-ink-2">{footer}</p>
      </div>
    </main>
  );
}

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      className="w-full"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) {
          onError(toUserError(e).message);
        } finally {
          setPending(false);
        }
      }}
    >
      Continue with Google
    </Button>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  return (
    <AuthLayout title="Sign in to ProfJero Workspace" subtitle="Your tasks, projects, finances and learning in one place." footer={<>New here? <Link className="font-medium text-brand hover:underline" to="/signup">Create an account</Link></>}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ email, password }) => {
          setError(null);
          try {
            await signInWithEmailAndPassword(auth, email, password);
          } catch (e) {
            setError(toUserError(e).message);
          }
        })}
      >
        {error && <InlineError message={error} />}
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} invalid={!!form.formState.errors.email} {...form.register('email')} />}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(id, d) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={d} invalid={!!form.formState.errors.password} {...form.register('password')} />}
        </Field>
        <div className="flex justify-end">
          <Link to="/reset-password" className="text-sm text-brand hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>Sign in</Button>
      </form>
      <Divider />
      <GoogleButton onError={setError} />
    </AuthLayout>
  );
}

const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    email: z.string().trim().email('Enter a valid email'),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function SignupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(signupSchema), defaultValues: { name: '', email: '', password: '', confirm: '' } });
  if (user) return <Navigate to="/" replace />;
  const err = form.formState.errors;

  return (
    <AuthLayout title="Create your account" subtitle="A personal workspace is created for you. You can add business workspaces later." footer={<>Already have an account? <Link className="font-medium text-brand hover:underline" to="/login">Sign in</Link></>}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ name, email, password }) => {
          setError(null);
          try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(cred.user, { displayName: name });
            await sendEmailVerification(cred.user).catch(() => undefined);
            navigate('/', { replace: true });
          } catch (e) {
            setError(toUserError(e).message);
          }
        })}
      >
        {error && <InlineError message={error} />}
        <Field label="Full name" error={err.name?.message}>
          {(id) => <Input id={id} autoComplete="name" invalid={!!err.name} {...form.register('name')} />}
        </Field>
        <Field label="Email" error={err.email?.message}>
          {(id) => <Input id={id} type="email" autoComplete="email" invalid={!!err.email} {...form.register('email')} />}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={err.password?.message}>
          {(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} invalid={!!err.password} {...form.register('password')} />}
        </Field>
        <Field label="Confirm password" error={err.confirm?.message}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" invalid={!!err.confirm} {...form.register('confirm')} />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>Create account</Button>
      </form>
      <Divider />
      <GoogleButton onError={setError} />
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email') })), defaultValues: { email: '' } });
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="font-medium text-brand hover:underline" to="/login">Back to sign in</Link>}>
      {sent ? (
        <Notice>If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.</Notice>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(async ({ email }) => {
            // The same message is shown whether or not the account exists (no account enumeration).
            await sendPasswordResetEmail(auth, email).catch(() => undefined);
            setSent(true);
          })}
        >
          <Field label="Email" error={form.formState.errors.email?.message}>
            {(id) => <Input id={id} type="email" autoComplete="email" invalid={!!form.formState.errors.email} {...form.register('email')} />}
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={form.formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
