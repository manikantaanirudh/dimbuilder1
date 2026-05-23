import * as client from "openid-client";
import { nanoid } from "nanoid";
import type { AppConfig } from "../../shared/appConfigTypes";
import type { TokenConfig } from "./tokens";
import { signAccessToken, signRefreshToken } from "./tokens";
import { hashPassword } from "./passwords";
import type { Repositories } from "../db/repositories";
import type { Request, Response } from "express";
import type { SystemRole } from "../../shared/authTypes";

// In-memory state store for OIDC flow (code_verifier + state)
const pendingFlows = new Map<string, { codeVerifier: string; redirectUri: string; createdAt: number }>();

// Clean up flows older than 10 minutes
function cleanupFlows(): void {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, flow] of pendingFlows) {
    if (flow.createdAt < tenMinutesAgo) pendingFlows.delete(key);
  }
}

export interface OidcHandlers {
  authorize: (req: Request, res: Response) => Promise<void>;
  callback: (req: Request, res: Response) => Promise<void>;
}

export async function createOidcHandlers(
  config: AppConfig,
  repos: Repositories,
  tokenConfig: TokenConfig
): Promise<OidcHandlers | null> {
  const oidcConfig = config.auth.oidc;
  if (!oidcConfig || config.auth.strategy !== "oidc") return null;

  // Discover OIDC provider and create configuration (openid-client v6 API)
  const oidcConfiguration = await client.discovery(
    new URL(oidcConfig.issuerUrl),
    oidcConfig.clientId,
    { redirect_uris: [oidcConfig.callbackUrl], response_types: ["code"] },
    client.ClientSecretPost(oidcConfig.clientSecret)
  );

  return {
    async authorize(_req: Request, res: Response): Promise<void> {
      cleanupFlows();
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();

      pendingFlows.set(state, {
        codeVerifier,
        redirectUri: oidcConfig.callbackUrl,
        createdAt: Date.now()
      });

      const authUrl = client.buildAuthorizationUrl(oidcConfiguration, {
        scope: oidcConfig.scopes.join(" "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        redirect_uri: oidcConfig.callbackUrl
      });

      res.json({ authorizationUrl: authUrl.href });
    },

    async callback(req: Request, res: Response): Promise<void> {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state) {
        res.status(400).json({ error: "Missing code or state parameter" });
        return;
      }

      const flow = pendingFlows.get(state);
      if (!flow) {
        res.status(400).json({ error: "Invalid or expired state" });
        return;
      }
      pendingFlows.delete(state);

      try {
        // Build the current URL from the request to pass to authorizationCodeGrant
        const currentUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);

        const tokenResponse = await client.authorizationCodeGrant(
          oidcConfiguration,
          currentUrl,
          {
            expectedState: state,
            pkceCodeVerifier: flow.codeVerifier
          }
        );

        const accessTokenValue = tokenResponse.access_token;
        const claims = tokenResponse.claims();
        const sub = claims?.sub;

        // Fetch user info
        const userInfo = await client.fetchUserInfo(
          oidcConfiguration,
          accessTokenValue,
          sub || client.skipSubjectCheck
        );

        const email = userInfo.email as string;
        const displayName = (userInfo.name || userInfo.preferred_username || email.split("@")[0]) as string;
        const userSub = userInfo.sub;

        // Find or create user
        let user = repos.users.findUserByProviderId("oidc", userSub);
        if (!user) {
          user = repos.users.findUserByEmail(email);
          if (user) {
            // Link existing user to OIDC provider
            repos.users.updateUser(user.id, { authProvider: "oidc", authProviderId: userSub });
          } else {
            // Create new user
            const userId = nanoid();
            repos.users.createUser({
              id: userId,
              email,
              displayName,
              authProvider: "oidc",
              authProviderId: userSub,
              role: config.auth.defaultRole
            });
            user = repos.users.findUserById(userId);
          }
        }

        if (!user || user.is_active === 0) {
          res.status(403).json({ error: "Account is disabled" });
          return;
        }

        // Issue JWT tokens
        const jwtAccessToken = signAccessToken(
          { sub: user.id, email: user.email, role: user.role as SystemRole },
          tokenConfig
        );
        const refreshToken = signRefreshToken(user.id, tokenConfig);

        // Store session
        const refreshHash = await hashPassword(refreshToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        repos.sessions.deleteSessionsByUserId(user.id);
        repos.sessions.createSession({ id: nanoid(), userId: user.id, refreshTokenHash: refreshHash, expiresAt });

        repos.users.updateUser(user.id, { lastLoginAt: new Date().toISOString() });

        res.json({
          accessToken: jwtAccessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            authProvider: "oidc",
            role: user.role,
            isActive: true,
            avatarUrl: user.avatar_url
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "OIDC callback failed";
        res.status(500).json({ error: message });
      }
    }
  };
}
