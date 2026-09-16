import { NextRequest } from 'next/server';

export function serviceAuthorized(request: NextRequest, expected: string | undefined) {
  if (!expected) return false;
  const value = request.headers.get('authorization');
  return value === `Bearer ${expected}`;
}

export function adminAuthorized(request: NextRequest) {
  const token = process.env.ADMIN_API_TOKEN;
  return serviceAuthorized(request, token);
}
