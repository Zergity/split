import type { AuthEnv } from '../types/auth';

export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  return Response.json({
    success: true,
    data: { publicKey: context.env.VAPID_PUBLIC_KEY },
  });
};
