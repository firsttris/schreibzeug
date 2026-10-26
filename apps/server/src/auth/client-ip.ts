/**
 * The address Better Auth's rate limit counts a client by (sign-in, sign-up: a few tries in ten
 * seconds). Better Auth takes it from a header (@better-auth/core utils/ip.mjs getIP); left at
 * `x-forwarded-for`, a client sets that itself, gets a new count with every value, or, without
 * the header, shares one count with everyone else. So the server writes the header itself, from
 * the connection, and drops whatever a client sent under that name.
 */
export const CLIENT_IP_HEADER = "x-schreibzeug-client-ip";

/**
 * What the header says: the peer of the connection. Behind proxies the operator named
 * (SCHREIBZEUG_TRUSTED_PROXIES), the forwarded chain with the peer at its end; Better Auth walks it
 * from the right past the trusted proxies to the first address that is not one of them, so a
 * client that connects directly cannot forge it.
 */
export const clientAddressOf = (
  forwardedFor: string | null,
  peer: string | undefined,
  behindProxies: boolean,
): string | null => {
  if (!peer) return null;
  return behindProxies && forwardedFor ? `${forwardedFor}, ${peer}` : peer;
};

/**
 * Puts the client's address on the request as main.ts receives it, replacing any copy the client
 * sent. Bun's request is changed in place: its WebSocket upgrade needs the request it was given.
 */
export const markClientAddress = (
  request: Request,
  peer: string | undefined,
  trustedProxies: readonly string[],
): Request => {
  const address = clientAddressOf(request.headers.get("x-forwarded-for"), peer, trustedProxies.length > 0);
  if (address) request.headers.set(CLIENT_IP_HEADER, address);
  else request.headers.delete(CLIENT_IP_HEADER);
  return request;
};
