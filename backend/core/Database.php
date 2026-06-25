<?php
namespace core;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $instance = null;

    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            $cfg = require ROOT_DIR . '/config/database.php';

            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
                $cfg['host'],
                $cfg['port'],
                $cfg['name'],
                $cfg['sslmode']
            );

            try {
                self::$instance = new PDO($dsn, $cfg['user'], $cfg['password'], [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);
            } catch (PDOException $e) {
                http_response_code(503);
                echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
                exit;
            }
        }

        return self::$instance;
    }

    /** Execute a query and return all rows. */
    public static function query(string $sql, array $params = []): array
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** Execute a query and return the first row. */
    public static function queryOne(string $sql, array $params = []): ?array
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** Execute an INSERT/UPDATE/DELETE and return affected row count. */
    public static function execute(string $sql, array $params = []): int
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /** Execute INSERT and return the generated UUID (expects RETURNING id). */
    public static function insert(string $sql, array $params = []): ?string
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row['id'] ?? null;
    }

    public static function beginTransaction(): void  { self::getInstance()->beginTransaction(); }
    public static function commit(): void            { self::getInstance()->commit(); }
    public static function rollback(): void          { self::getInstance()->rollBack(); }
}
