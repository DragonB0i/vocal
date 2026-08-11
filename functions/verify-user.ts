import { Request, Response } from 'express';

export default async function verifyUser(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId } = req.body;

  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1`;

  const query = `
    mutation VerifyEmail($userId: uuid!) {
      updateUser(pk_columns: {id: $userId}, _set: {emailVerified: true}) {
        id
      }
    }
  `;

  try {
    // Actually the auth schema isn't directly updatable via GraphQL usually, but let's try calling Nhost Auth API directly
    // Nhost Auth API has a specific endpoint for verifying emails or we can just use the DB
    // But since we can't easily do it, wait, what if we use the backend Nhost Management API?
    return res.status(200).json({ success: false, message: 'Not implemented' });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
