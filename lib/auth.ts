import { getSessionUser } from './session';

export function serviceAuthorized(request: Request, expected: string | undefined) {
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export function integrationAuthorized(request: Request) {
  return serviceAuthorized(request, process.env.INTEGRATION_API_TOKEN);
}

export function adminAuthorized(request: Request) {
  return serviceAuthorized(request, process.env.ADMIN_API_TOKEN);
}

export async function localAdminAuthorized() {
  const user = await getSessionUser();
  return user && ['owner','admin','operator'].includes(user.role) ? user : null;
}
