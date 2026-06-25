<?php
namespace core;

class Router
{
    private array $routes = [];

    public function get(string $path, array $handler): void    { $this->add('GET',    $path, $handler); }
    public function post(string $path, array $handler): void   { $this->add('POST',   $path, $handler); }
    public function put(string $path, array $handler): void    { $this->add('PUT',    $path, $handler); }
    public function delete(string $path, array $handler): void { $this->add('DELETE', $path, $handler); }
    public function patch(string $path, array $handler): void  { $this->add('PATCH',  $path, $handler); }

    private function add(string $method, string $path, array $handler): void
    {
        $this->routes[] = compact('method', 'path', 'handler');
    }

    public function dispatch(string $method, string $uri): void
    {
        $uri = rtrim($uri, '/') ?: '/';

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) continue;

            // Convert :param to named capture groups
            $pattern = preg_replace('#/:([^/]+)#', '/(?P<$1>[^/]+)', $route['path']);
            $pattern = '#^' . $pattern . '$#';

            if (preg_match($pattern, $uri, $matches)) {
                // Keep only string-keyed matches (named params)
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

                [$class, $action] = $route['handler'];
                $controller = new $class();
                $controller->$action($params);
                return;
            }
        }

        Response::notFound("Route not found: $method $uri");
    }
}
