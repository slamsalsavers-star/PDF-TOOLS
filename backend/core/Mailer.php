<?php
namespace core;

/**
 * Minimal SMTP mailer — no dependencies.
 * Supports STARTTLS (port 587) and SSL (port 465).
 */
class Mailer
{
    private string $host;
    private int    $port;
    private string $encryption;
    private string $username;
    private string $password;
    private string $fromEmail;
    private string $fromName;

    /** @var resource|false */
    private mixed $socket = false;

    public function __construct()
    {
        $cfg = require ROOT_DIR . '/config/mail.php';
        $this->host       = $cfg['host'];
        $this->port       = $cfg['port'];
        $this->encryption = strtolower($cfg['encryption'] ?? 'tls');
        $this->username   = $cfg['username'];
        $this->password   = $cfg['password'];
        $this->fromEmail  = $cfg['from_email'];
        $this->fromName   = $cfg['from_name'];
    }

    // ── Public API ────────────────────────────────────────────

    public function send(string $toEmail, string $toName, string $subject, string $htmlBody): bool
    {
        try {
            $this->connect();
            $this->sendRaw("MAIL FROM:<{$this->fromEmail}>");
            $this->expect('250');
            $this->sendRaw("RCPT TO:<{$toEmail}>");
            $this->expect('250');
            $this->sendRaw('DATA');
            $this->expect('354');

            $headers  = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
            $headers .= "To: {$toName} <{$toEmail}>\r\n";
            $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
            $headers .= "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
            $headers .= "Content-Transfer-Encoding: base64\r\n";
            $headers .= "X-Mailer: PHP-Mailer\r\n";

            $body = chunk_split(base64_encode($htmlBody));
            $this->sendRaw($headers . "\r\n" . $body . "\r\n.");
            $this->expect('250');

            $this->sendRaw('QUIT');
            fclose($this->socket);
            return true;
        } catch (\Exception $e) {
            error_log('[Mailer] ' . $e->getMessage());
            if ($this->socket) @fclose($this->socket);
            return false;
        }
    }

    // ── Email templates ───────────────────────────────────────

    public function sendWelcome(string $toEmail, string $name, string $verifyUrl): bool
    {
        return $this->send($toEmail, $name, 'Verify your PDF Tools account', $this->tplWelcome($name, $verifyUrl));
    }

    public function sendPasswordReset(string $toEmail, string $name, string $resetUrl): bool
    {
        return $this->send($toEmail, $name, 'Reset your PDF Tools password', $this->tplReset($name, $resetUrl));
    }

    public function sendInvitation(string $toEmail, string $companyName, string $invitedByName, string $acceptUrl): bool
    {
        return $this->send($toEmail, $toEmail, "You're invited to join {$companyName} on PDF Tools", $this->tplInvitation($toEmail, $companyName, $invitedByName, $acceptUrl));
    }

    // ── SMTP internals ────────────────────────────────────────

    private function connect(): void
    {
        $prefix = ($this->encryption === 'ssl') ? 'ssl://' : '';
        $target = $prefix . $this->host;

        $this->socket = @stream_socket_client(
            $target . ':' . $this->port,
            $errno, $errstr, 10
        );

        if (!$this->socket) {
            throw new \RuntimeException("Cannot connect to SMTP: $errstr ($errno)");
        }

        stream_set_timeout($this->socket, 10);
        $this->read(); // greeting

        $this->sendRaw("EHLO " . gethostname());
        $this->read();

        if ($this->encryption === 'tls') {
            $this->sendRaw('STARTTLS');
            $this->expect('220');
            if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new \RuntimeException('STARTTLS upgrade failed.');
            }
            $this->sendRaw("EHLO " . gethostname());
            $this->read();
        }

        $this->sendRaw('AUTH LOGIN');
        $this->expect('334');
        $this->sendRaw(base64_encode($this->username));
        $this->expect('334');
        $this->sendRaw(base64_encode($this->password));
        $this->expect('235');
    }

    private function sendRaw(string $cmd): void
    {
        fwrite($this->socket, $cmd . "\r\n");
    }

    private function read(): string
    {
        $response = '';
        while ($line = fgets($this->socket, 515)) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $response;
    }

    private function expect(string $code): string
    {
        $response = $this->read();
        if (!str_starts_with($response, $code)) {
            throw new \RuntimeException("Expected $code, got: $response");
        }
        return $response;
    }

    // ── HTML templates ────────────────────────────────────────

    private function tplWrap(string $title, string $body): string
    {
        return <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;background:#f1f5f9;padding:24px}
.card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 4px 16px rgba(0,0,0,.08)}
h2{color:#0f172a;margin-top:0}.btn{display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}
p{color:#334155;line-height:1.6}.muted{color:#64748b;font-size:13px}</style></head>
<body><div class="card"><h2>{$title}</h2>{$body}<p class="muted">If you didn't request this, you can safely ignore this email.</p></div></body></html>
HTML;
    }

    private function tplWelcome(string $name, string $url): string
    {
        return $this->tplWrap("Welcome to PDF Tools, {$name}!", "<p>Thanks for signing up! Please verify your email address to activate your account.</p><p><a href=\"{$url}\" class=\"btn\">Verify Email</a></p><p class=\"muted\">This link expires in 24 hours.</p>");
    }

    private function tplReset(string $name, string $url): string
    {
        return $this->tplWrap("Reset your password", "<p>Hi {$name},</p><p>We received a request to reset your PDF Tools password. Click the button below to choose a new one.</p><p><a href=\"{$url}\" class=\"btn\">Reset Password</a></p><p class=\"muted\">This link expires in 1 hour.</p>");
    }

    private function tplInvitation(string $email, string $company, string $invitedBy, string $url): string
    {
        return $this->tplWrap("You've been invited to {$company}", "<p>{$invitedBy} has invited <strong>{$email}</strong> to join <strong>{$company}</strong> on PDF Tools and access all premium features.</p><p><a href=\"{$url}\" class=\"btn\">Accept Invitation</a></p><p class=\"muted\">This invitation expires in 7 days.</p>");
    }
}
