import { Request, Response } from 'express';
import { handleCors } from './_shared/cors';

export default async function seedOrg(req: Request, res: Response) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, slug } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const subdomain = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || `https://${subdomain}.graphql.${region}.nhost.run/v1`;
  const authEndpoint = `https://${subdomain}.auth.${region}.nhost.run/v1/user`;

  try {
    // 1. Verify caller identity via Nhost Auth
    const userRes = await fetch(authEndpoint, {
      headers: { Authorization: authHeader }
    });
    if (!userRes.ok) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const userData = await userRes.json();
    const callerId = userData.id || userData.user?.id;
    if (!callerId) {
      return res.status(401).json({ message: 'Failed to extract user ID' });
    }

    // 2. Create the org and make the caller the owner
    const query = `
      mutation CreateOrgAndMember($name: String!, $slug: String!, $userId: uuid!) {
        insert_organizations_one(object: {
          name: $name,
          slug: $slug,
          org_members: {
            data: [
              {
                user_id: $userId,
                role: "owner"
              }
            ]
          }
        }) {
          id
        }
      }
    `;

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': adminSecret as string
      },
      body: JSON.stringify({
        query,
        variables: { name, slug, userId: callerId }
      })
    });

    const result = await response.json();
    if (result.errors) {
      return res.status(400).json({ errors: result.errors });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
