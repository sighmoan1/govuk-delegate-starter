import { randomUUID } from "node:crypto";
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "jose";
import { config } from "./config";

export const OIDC_COOKIE = "delegate_oidc";

export function redirectUri() {
  return `${config.appUrl}/auth/callback`;
}

export function authorizeUrl(state: string, nonce: string): string {
  const u = new URL("/authorize", config.oidcIssuer);
  u.search = new URLSearchParams({
    response_type: "code",
    scope: "openid email",
    client_id: config.oidcClientId,
    redirect_uri: redirectUri(),
    state,
    nonce,
  }).toString();
  return u.toString();
}

async function clientAssertion(): Promise<string> {
  const key = await importPKCS8(config.oidcPrivateKeyPem, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.oidcClientId)
    .setSubject(config.oidcClientId)
    // The simulator expects its public URL as audience, even when we reach it by another hostname.
    .setAudience(`${config.oidcIssuer}/token`)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

export interface OneLoginUser {
  sub: string;
  email?: string;
}

/** Back-channel: exchange the code, verify the ID token, read userinfo. */
export async function completeLogin(code: string, nonce: string): Promise<OneLoginUser> {
  const res = await fetch(`${config.oidcInternalUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: await clientAssertion(),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { id_token: string; access_token: string };

  const jwks = createRemoteJWKSet(new URL(`${config.oidcInternalUrl}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: `${config.oidcIssuer}/`,
    audience: config.oidcClientId,
  });
  if (payload.nonce !== nonce) throw new Error("Nonce mismatch");
  if (!payload.sub) throw new Error("No subject in ID token");

  let email: string | undefined;
  const ui = await fetch(`${config.oidcInternalUrl}/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (ui.ok) {
    const info = (await ui.json()) as { sub?: string; email?: string };
    if (info.sub && info.sub !== payload.sub) throw new Error("Userinfo subject mismatch");
    email = info.email;
  }
  return { sub: payload.sub, email };
}
