import type { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import type { IResolvers } from 'mercurius';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

export async function registerGraphQL(app: FastifyInstance): Promise<void> {
  await app.register(mercurius, {
    schema: typeDefs,
    resolvers: resolvers as unknown as IResolvers,
    graphiql: process.env['NODE_ENV'] !== 'production',
    path: '/graphql',
    context: (request) => ({ request }),
    errorHandler(error, _request, reply) {
      app.log.error({ err: error }, 'GraphQL error');
      reply.send(error);
    },
  });

  app.log.info('GraphQL endpoint registered at /graphql');
}
