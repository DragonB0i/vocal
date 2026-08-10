import { Request, Response } from 'express';

export default async function addMember(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { orgId, userId, role } = req.body;
  if (!orgId || !userId || !role) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1/graphql`;

  const query = `
    mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
      insert_org_members_one(object: {
        org_id: $orgId,
        user_id: $userId,
        role: $role
      }) {
        id
      }
    }
  `;

  try {
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': adminSecret as string
      },
      body: JSON.stringify({
        query,
        variables: { orgId, userId, role }
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
