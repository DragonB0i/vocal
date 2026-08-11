import { Request, Response } from 'express';
import { handleCors } from './_shared/cors';

export default async function addMember(req: Request, res: Response) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { orgId, email, role } = req.body;
  if (!orgId || !email || !role) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (role !== 'editor' && role !== 'viewer') {
    return res.status(400).json({ message: 'Invalid role. Must be editor or viewer.' });
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
    const callerId = userData.id || userData.user?.id; // Depends on Nhost auth version
    if (!callerId) {
      return res.status(401).json({ message: 'Failed to extract user ID' });
    }

    // 2. Check if caller is owner of the target org
    const checkQuery = `
      query CheckOwner($orgId: uuid!, $callerId: uuid!) {
        org_members(where: {org_id: {_eq: $orgId}, user_id: {_eq: $callerId}, role: {_eq: "owner"}}) {
          id
        }
      }
    `;
    const checkRes = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret as string },
      body: JSON.stringify({ query: checkQuery, variables: { orgId, callerId } })
    });
    const checkData = await checkRes.json();
    if (!checkData.data?.org_members?.length) {
      return res.status(403).json({ message: 'Forbidden: Caller is not an owner of this organization' });
    }

    // 3. Find the target user by email
    const findUserQuery = `
      query FindUserByEmail($email: citext!) {
        users(where: {email: {_eq: $email}}) {
          id
        }
      }
    `;
    const findUserRes = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret as string },
      body: JSON.stringify({ query: findUserQuery, variables: { email } })
    });
    const findUserData = await findUserRes.json();
    if (findUserData.errors) {
      return res.status(500).json({ message: 'Error querying users' });
    }
    if (!findUserData.data?.users?.length) {
      return res.status(404).json({ message: 'User must sign up and verify their account first.' });
    }
    const targetUserId = findUserData.data.users[0].id;

    // 4. Add the member
    const insertQuery = `
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
    const insertRes = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': adminSecret as string },
      body: JSON.stringify({ query: insertQuery, variables: { orgId, userId: targetUserId, role } })
    });

    const result = await insertRes.json();
    if (result.errors) {
      if (result.errors[0]?.message?.includes('Uniqueness violation')) {
        return res.status(400).json({ message: 'User is already a member of this organization.' });
      }
      return res.status(400).json({ errors: result.errors });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
