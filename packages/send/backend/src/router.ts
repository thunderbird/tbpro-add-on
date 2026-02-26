import { mergeRouters } from './trpc';
import { containersRouter } from './trpc/containers';
import { sharingRouter } from './trpc/sharing';
import { usersRouter } from './trpc/users';

export const appRouter = mergeRouters(
  usersRouter,
  containersRouter,
  sharingRouter
);

export type AppRouter = typeof appRouter;
