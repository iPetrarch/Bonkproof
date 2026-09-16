<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$allowedCategories = [
    'supermarket', 'convenience', 'fuel', 'bakery', 'cafe', 'fast_food', 'restaurant',
    'drinking_water', 'toilets', 'pharmacy', 'atm', 'bicycle_shop', 'bicycle_repair_station',
    'railway', 'ferry', 'parcel_locker', 'accommodation', 'campsite', 'shelter',
    'hospital', 'doctor', 'cemetery',
];

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

$requestedCategories = array_values(array_unique(array_filter(array_map('trim', explode(',', (string)($_GET['categories'] ?? ''))))));
if ($requestedCategories === []) fail(400, 'Missing categories.');
foreach ($requestedCategories as $category) {
    if (!in_array($category, $allowedCategories, true)) fail(400, 'Unsupported category.');
}

$west = filter_input(INPUT_GET, 'west', FILTER_VALIDATE_FLOAT);
$south = filter_input(INPUT_GET, 'south', FILTER_VALIDATE_FLOAT);
$east = filter_input(INPUT_GET, 'east', FILTER_VALIDATE_FLOAT);
$north = filter_input(INPUT_GET, 'north', FILTER_VALIDATE_FLOAT);
if ($west === false || $south === false || $east === false || $north === false) fail(400, 'Invalid bounding box.');
if ($west < -180 || $east > 180 || $south < -90 || $north > 90 || $west >= $east || $south >= $north) fail(400, 'Invalid bounding box.');
if (($east - $west) > 1.0 || ($north - $south) > 1.0) fail(400, 'Bounding box is too large.');

$dbPath = getenv('BONKPROOF_OVERTURE_DB');
if (!is_string($dbPath) || trim($dbPath) === '') {
    $dbPath = dirname(__DIR__, 3) . '/bonkproof-data/overture-places.sqlite';
}
if (!is_file($dbPath)) fail(503, 'Local Overture database is not available yet.');
if (!extension_loaded('pdo_sqlite')) fail(500, 'PDO SQLite is not available on this server.');

try {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA query_only = ON');
    $pdo->exec('PRAGMA busy_timeout = 1500');

    $placeholders = implode(',', array_fill(0, count($requestedCategories), '?'));
    $sql = "SELECT p.overture_id AS id, p.name, p.category, p.lat, p.lon
            FROM places_rtree r
            JOIN places p ON p.rowid = r.id
            WHERE r.min_lon <= ? AND r.max_lon >= ?
              AND r.min_lat <= ? AND r.max_lat >= ?
              AND p.category IN ($placeholders)
            LIMIT 5000";
    $stmt = $pdo->prepare($sql);
    $params = [$east, $west, $north, $south, ...$requestedCategories];
    $stmt->execute($params);
    $places = $stmt->fetchAll();

    $metadata = [];
    try {
        foreach ($pdo->query('SELECT key, value FROM metadata') as $row) $metadata[$row['key']] = $row['value'];
    } catch (Throwable $ignored) {
    }

    echo json_encode(['places' => $places, 'metadata' => $metadata], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    fail(500, 'Could not query the local Overture database.');
}
