<?php
namespace core;

class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(mixed $data = null, string $message = 'OK', int $status = 200): never
    {
        self::json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    public static function paginated(array $rows, int $total, int $page, int $perPage): never
    {
        self::json([
            'success' => true,
            'data'    => $rows,
            'meta'    => [
                'total'       => $total,
                'page'        => $page,
                'per_page'    => $perPage,
                'total_pages' => (int) ceil($total / max(1, $perPage)),
            ],
        ]);
    }

    public static function error(string $message, int $status = 400, array $errors = []): never
    {
        $body = ['success' => false, 'message' => $message];
        if ($errors) $body['errors'] = $errors;
        self::json($body, $status);
    }

    public static function unauthorized(string $message = 'Unauthenticated.'): never
    {
        self::error($message, 401);
    }

    public static function forbidden(string $message = 'Forbidden.'): never
    {
        self::error($message, 403);
    }

    public static function notFound(string $message = 'Not found.'): never
    {
        self::error($message, 404);
    }

    public static function created(mixed $data = null, string $message = 'Created.'): never
    {
        self::success($data, $message, 201);
    }
}
