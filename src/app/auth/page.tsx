'use client';

import { useState } from 'react';
import { useSignInEmailPassword, useSignUpEmailPassword } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  
  const { signInEmailPassword, isLoading: isSignInLoading, isError: isSignInError, error: signInError } = useSignInEmailPassword();
  const { signUpEmailPassword, isLoading: isSignUpLoading, isError: isSignUpError, error: signUpError } = useSignUpEmailPassword();
  const router = useRouter();

  const isLoading = isSignInLoading || isSignUpLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNeedsVerification(false);

    if (isLogin) {
      const { isSuccess, isError } = await signInEmailPassword(email, password);
      if (isSuccess && !isError) {
        router.push('/dashboard');
      }
    } else {
      const { isSuccess, isError } = await signUpEmailPassword(email, password);
      if (isSuccess && !isError) {
        // useSignUpEmailPassword does not return session directly in this version
        // if verification is disabled, user is logged in automatically and nhost handles session.
        // if verification is enabled, user is not logged in.
        // We can check nhost client directly.
        const session = (window as any).__NHOST_CLIENT__?.auth.getSession() || null;
        if (!session) {
          setNeedsVerification(true);
        } else {
          router.push('/dashboard');
        }
      }
    }
  };

  if (needsVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Check your email</h2>
          <p className="text-gray-600 dark:text-gray-300">
            We sent a verification link to <strong>{email}</strong>. Please click the link to verify your account, then return here to sign in.
          </p>
          <button
            onClick={() => {
              setNeedsVerification(false);
              setIsLogin(true);
            }}
            className="mt-4 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {isLogin ? 'Sign in to your account' : 'Create a new account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full rounded-md border-0 py-1.5 text-gray-900 dark:text-white dark:bg-gray-700 ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border-0 py-1.5 text-gray-900 dark:text-white dark:bg-gray-700 ring-1 ring-inset ring-gray-300 dark:ring-gray-600 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Password"
              />
            </div>
          </div>

          {(isSignInError || isSignUpError) && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-3 rounded-md">
              {signInError?.message || signUpError?.message || 'An error occurred during authentication.'}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (isLogin ? 'Sign in' : 'Sign up')}
            </button>
          </div>
          
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
