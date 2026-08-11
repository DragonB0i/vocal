/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLClient } from 'graphql-request';
import { nhost } from './nhost';

export function getGraphqlEndpoint() {
  return nhost.graphql.httpUrl;
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
