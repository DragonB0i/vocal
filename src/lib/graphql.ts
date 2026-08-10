/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLClient } from 'graphql-request';
import { nhost } from './nhost';

export function getGraphqlEndpoint() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || '';
  return `https://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;
}

export function getGraphqlClient() {
  const token = nhost.auth.getAccessToken();
  return new GraphQLClient(getGraphqlEndpoint(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

export const fetcher = async (query: string, variables?: any) => {
  const client = getGraphqlClient();
  return client.request(query, variables);
};
