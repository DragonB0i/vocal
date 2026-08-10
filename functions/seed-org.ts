import { Request, Response } from 'express';

export default async function seedOrg(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, name, slug, role } = req.body;
  if (!userId || !name || !slug || !role) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Nhost automatically injects NHOST_ADMIN_SECRET into functions
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  const graphqlEndpoint = process.env.NHOST_GRAPHQL_URL || `https://${process.env.NHOST_SUBDOMAIN}.graphql.${process.env.NHOST_REGION}.nhost.run/v1/graphql`;

  const query = `
    mutation CreateOrgAndMember($name: String!, $slug: String!, $userId: uuid!, $role: String!) {
      insert_organizations_one(object: {
        name: $name,
        slug: $slug,
        org_members: {
          data: [
            {
              user_id: $userId,
              role: $role
            }
          ]
        }
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
        variables: { name, slug, userId, role }
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
