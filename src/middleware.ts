import { defineMiddleware } from 'astro:middleware';
import { verifySession, SESSION_COOKIE } from './lib/auth';

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isAdminApi = pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login';

  if (!isAdminPage && !isAdminApi) return next();

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);

  if (!session) {
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: 'Pole sisse logitud' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/admin/login');
  }

  context.locals.adminUser = session.username;
  return next();
});
