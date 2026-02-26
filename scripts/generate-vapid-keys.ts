/**
 * One-time script to generate VAPID keys for Web Push notifications.
 * Run: npx tsx scripts/generate-vapid-keys.ts
 */
import * as crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

// Application server key: uncompressed EC point (04 || x || y), base64url encoded
const pubX = Buffer.from(publicJwk.x!, 'base64');
const pubY = Buffer.from(publicJwk.y!, 'base64');
const uncompressed = Buffer.concat([Buffer.from([0x04]), pubX, pubY]);
const applicationServerKey = uncompressed.toString('base64url');

// Private key: raw 'd' parameter, base64url encoded
const privateKeyBase64url = Buffer.from(privateJwk.d!, 'base64').toString('base64url');

console.log('Add to wrangler.toml [vars]:');
console.log(`VAPID_PUBLIC_KEY = "${applicationServerKey}"`);
console.log('');
console.log('Add to .dev.vars (and wrangler secret put for production):');
console.log(`VAPID_PRIVATE_KEY=${privateKeyBase64url}`);
