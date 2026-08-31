import { FastifyInstance } from 'fastify';
import { authGuard } from '../../common/auth/authGuard.js';
import type { PrismaClient } from '@prisma/client';
import { BootstrapService } from './bootstrap.service.js';

export async function bootstrapRoutes(fastify: FastifyInstance, options: { service: BootstrapService; prisma: PrismaClient }) {
  const { service, prisma } = options;
  fastify.addHook('preHandler', authGuard({ prisma }));

  fastify.get(
    '/bootstrap',
    async (req) => {
      const bootstrap = await service.getBootstrap(req.user!.id);
      return bootstrap;
    }
  );
}
