import { Request, Response } from 'express';

export function handleCors(req: Request, res: Response): boolean {
  // Allow the production Vercel frontend, and any local development ports
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://vocal-mxzo.vercel.app',
    'http://localhost:3000'
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // If no origin (e.g. S2S), we don't strictly need CORS, but we can default it or skip
  } else {
    // If we want to be strict, we could deny, but for safety in this assignment, 
    // we'll allow the exact origin if requested, or just fallback to the production URL.
    res.setHeader('Access-Control-Allow-Origin', 'https://vocal-mxzo.vercel.app');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-hasura-admin-secret');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
