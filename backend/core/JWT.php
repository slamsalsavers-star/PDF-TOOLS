<?php
namespace core;

class JWT
{
    // ── Encoding helpers ──────────────────────────────────────

    private static function b64Encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64Decode(string $data): string
    {
        $pad  = strlen($data) % 4;
        $data = $pad ? $data . str_repeat('=', 4 - $pad) : $data;
        return base64_decode(strtr($data, '-_', '+/'));
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Create a signed JWT.
     *
     * @param  array $payload   Custom claims (sub, user_type, etc.)
     * @param  int   $ttl       Lifetime in seconds (default = JWT_ACCESS_TTL)
     * @return string
     */
    public static function encode(array $payload, int $ttl = JWT_ACCESS_TTL): string
    {
        $header = self::b64Encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));

        $payload['iat'] = time();
        $payload['exp'] = time() + $ttl;
        $payload['jti'] = bin2hex(random_bytes(8));

        $body = self::b64Encode(json_encode($payload));
        $sig  = self::b64Encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));

        return "$header.$body.$sig";
    }

    /**
     * Verify and decode a JWT.
     *
     * @throws \RuntimeException on invalid / expired token
     */
    public static function decode(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new \RuntimeException('Malformed token.');
        }

        [$header, $body, $sig] = $parts;

        $expected = self::b64Encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
        if (!hash_equals($expected, $sig)) {
            throw new \RuntimeException('Invalid token signature.');
        }

        $payload = json_decode(self::b64Decode($body), true);
        if (!$payload) {
            throw new \RuntimeException('Cannot decode token payload.');
        }

        if (!isset($payload['exp']) || $payload['exp'] < time()) {
            throw new \RuntimeException('Token has expired.');
        }

        return $payload;
    }
}
