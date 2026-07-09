import { SignJWT, importPKCS8 } from 'jose';

/**
 * Static RSA test keypair + JWKS used in place of a real Clerk instance for
 * Phase 1 development/tests. The `gateway/kong` config embeds the
 * corresponding public key, so service tests and the Kong `jwt` plugin
 * validate against the same keypair. Swapping in a real Clerk app only
 * requires setting CLERK_JWKS_URL/CLERK_ISSUER/CLERK_WEBHOOK_SECRET and
 * regenerating `gateway/kong/kong.yml` - no code changes.
 */
export const TEST_ISSUER = 'https://test-clerk.example.com';
export const TEST_KEY_ID = 'test-key-1';

/** Static Svix webhook signing secret used in place of CLERK_WEBHOOK_SECRET for tests/dev. */
export const TEST_WEBHOOK_SECRET = 'whsec_aqtY1brapqEHcp2fCAUoFGNYxncE1jeNpoWZUOKTfNY=';

const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDJbQ98cjX6mEoq
MkXqIwPwmuGbA+ao7XThKOB2JNED5ULymdess4fy9V4Hw7rgI+smPGLoBVS32qRp
xQhSzbRhkDt14bGxNxQJb7R/KUHmQeYgf/BB6nC5/Pzb2/gyHb0YimM/JluXO0UD
q1C2HWboemk4P1eM66nGqKtQR+bg4AEXjMN0J+JTT3gqTOkgn2SFcrglLCyuoez/
PaeCGCmPKhPnDxa1DsN/ndJ5f9DHHiV7mH+CvV1Di5fWr5UB4iRAeVxu4WzGEecP
3aYvZN7f7z6Peaad4agG8xZPcvD61tsuIqQtrceQT5HFwlTjXhcCcN7gDcz+yGIu
ho3DqU8RAgMBAAECggEAC8+CBLNCsICs+pfriwzGDp3aRCdgpz+TJp+pt6u1eMPA
3u4/2+/D9S5Hdu+WXc2lXF7WktG7M7OVh+EmeYp3vO/C2MjkzSYUXfBHllwyMcDj
8DxoN0k6lmE7511YyoF9ZLq6komafb3bMFmjeCY1skR5NnPaW5g24n/h2al5o25M
V+7eCE7aQoJiLTlKNN/TNGt+AQifwWN5qtd2XFfnmecxwQtu7YlWqRRIFbd5nZj3
KXzGql9qSh9IcU7bx5F3yLZbmM4sf20M4pNngk62g6wh9jp4Pz2WO363oFQ+a6iw
Oayf2rMuNYQiz0ss6vEZIeba6EYnFNyuAewIJ4IRtQKBgQDzpCbNaaPOkrdEHFEL
1jvb+hoiXgn2TliCdRH3JHEUxRrKPwim31Px6Y7dgZQ3Z+R4nJssqo8Oh8obkxpk
ni3nxSFWuG6vxFFwPt5kW/1aAzlaVZ5Dh25mBkNrKPdhPRhMjzeV+6GS65oQ7gws
cpfCM2AIH/H08GEgPnFGfJlxhQKBgQDTpLcwRWGltP5I1SS5H0jDka2pnKfQajsf
Z96yfnHffYLxxSAJehPgCAOWYuPEEeRV8/7Lsq+Jmv24peRtKuDUsbIJiEvpnkUU
7Zc1lkzMzTY5V0pb9k0NvBJwkpBdACxAwJqk+4jOSXOLo7usWtslD0mLWIdo71Mp
+0XBWqqXHQKBgHcrCAuaqxNj8Z2v1/hZLegXeWbr5iWCBoqwpjviqCjHi6X2lM3C
GDYPzeAL/Cnpd/eCaee7+MLbqgA4wEUMlVlysy7OgN0ZwdeL+IzP7ah0QT4s+H8B
I/9k+t7UJ8N49YSk3ERQ0qOg9zdmp6+p0Q6cwFDZByiN1oPF5vPaB9ddAoGASVvC
k1y5J/LAYQZgIDqTwhXwl+XQ1RC9RXl/W2cwmUKr7JljLWW/FdwxQiMsx31cI97a
5kgdSBkM8L+vmZdPLuoYx+0SQvu0/jgMPWrHXAWVUfLLt2x78NLLoXFr0JCKxjb8
Y0s8dCRJhJFQL8GeTA4sc7xP0zOBJAAQgaCnmJECgYBEgISXgo9KsoaGPzR9syn5
qrifRhF1tqyfJV59w5I3x8ZL/jSWxYPylsbCTgaJhwVj+IhUwjM2lFQXR9mOshJ9
zzoQ7XuEn16OOdh9Clj0CNS41ljX+BcGaxlPD3SAbqLcoa2f+9vhvbd3m+ZCiPar
WbNwo07rOY3Swkw2oVqOQg==
-----END PRIVATE KEY-----
`;

/** Public key components for the same keypair, in JWK form (matches TEST_KEY_ID). */
export const TEST_JWKS = {
  keys: [
    {
      kty: 'RSA',
      n: 'yW0PfHI1-phKKjJF6iMD8JrhmwPmqO104SjgdiTRA-VC8pnXrLOH8vVeB8O64CPrJjxi6AVUt9qkacUIUs20YZA7deGxsTcUCW-0fylB5kHmIH_wQepwufz829v4Mh29GIpjPyZblztFA6tQth1m6HppOD9XjOupxqirUEfm4OABF4zDdCfiU094KkzpIJ9khXK4JSwsrqHs_z2nghgpjyoT5w8WtQ7Df53SeX_Qxx4le5h_gr1dQ4uX1q-VAeIkQHlcbuFsxhHnD92mL2Te3-8-j3mmneGoBvMWT3Lw-tbbLiKkLa3HkE-RxcJU414XAnDe4A3M_shiLoaNw6lPEQ',
      e: 'AQAB',
      kid: TEST_KEY_ID,
      alg: 'RS256',
      use: 'sig',
    },
  ],
};

export interface SignTestTokenOptions {
  /** Subject claim - the clerkUserId. */
  sub: string;
  /** Token lifetime in seconds from now. Defaults to 1 hour. */
  expiresInSeconds?: number;
  issuer?: string;
}

/** Signs a JWT with the static test private key, mirroring a Clerk-issued session token. */
export async function signTestToken({
  sub,
  expiresInSeconds = 3600,
  issuer = TEST_ISSUER,
}: SignTestTokenOptions): Promise<string> {
  const privateKey = await importPKCS8(TEST_PRIVATE_KEY_PEM, 'RS256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KEY_ID })
    .setSubject(sub)
    .setIssuer(issuer)
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000))
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(privateKey);
}
