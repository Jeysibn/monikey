import { FastifyInstance } from 'fastify';
import { authGuard } from '../../common/auth/authGuard';
import { BootstrapService } from './bootstrap.service.js.js.js.js';

export async function bootstrapRoutes(fastify: FastifyInstance, service: BootstrapService) {
  fastify.addHook('preHandler', authGuard);

  fastify.get(
    '/bootstrap',
    async (req, reply) => {
      const bootstrap = await service.getBootstrap(req.user!.id);
      return bootstrap;
    }
  );
}