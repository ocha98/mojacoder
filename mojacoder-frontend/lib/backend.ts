import { useEffect } from 'react'
import { Auth as Cognito } from 'aws-amplify'
import AWSAppSyncClient from 'aws-appsync'
import { DocumentNode } from 'graphql'

import Auth from '../lib/auth'

export interface SubscriptionPayload<T> {
    data: T
}

const client = new AWSAppSyncClient({
    url: process.env.APPSYNC_ENDPOINT,
    region: process.env.AWS_REGION,
    auth: {
        type: 'AMAZON_COGNITO_USER_POOLS',
        jwtToken: async () =>
            (await Cognito.currentSession()).getAccessToken().getJwtToken(),
    },
    disableOffline: true,
})

const clientWithApiKey = new AWSAppSyncClient({
    url: process.env.APPSYNC_ENDPOINT,
    region: process.env.AWS_REGION,
    auth: {
        type: 'API_KEY',
        apiKey: process.env.APPSYNC_APIKEY,
    },
    disableOffline: true,
})

export function useSubscription<D, V>(
    query: DocumentNode,
    variables: V,
    callback: (data: D) => void
) {
    const { auth } = Auth.useContainer()
    useEffect(() => {
        if (auth) {
            const subscription = client
                .subscribe<SubscriptionPayload<D>>({ query, variables })
                .subscribe({
                    next: ({ data }) => callback(data),
                    error: (err) => console.error(err),
                })
            return () => subscription.unsubscribe()
        }
    }, [client, query, variables, callback])
}

export async function invokeMutation<D, V>(
    mutation: DocumentNode,
    variables: V
) {
    return (await client.mutate<D>({ mutation, variables })).data
}

export async function invokeQuery<D, V>(query: DocumentNode, variables: V) {
    return (
        await client.query<D>({
            fetchPolicy: 'network-only',
            query,
            variables,
        })
    ).data
}

export async function invokeQueryWithApiKey<D, V>(
    query: DocumentNode,
    variables: V
) {
    return (
        await clientWithApiKey.query<D>({
            fetchPolicy: 'network-only',
            query,
            variables,
        })
    ).data
}
