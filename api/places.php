<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$allowedCategories = [
    'commercial.supermarket',
    'commercial.convenience',
    'commercial.kiosk',
    'service.vehicle.fuel',
    'commercial.food_and_drink.bakery',
    'catering.cafe',
    'catering.fast_food',
    'catering.restaurant',
    'amenity.drinking_water',
    'amenity.toilet',
    'healthcare.pharmacy',
    'service.financial.atm',
    'commercial.outdoor_and_sport.bicycle',
    'public_transport.train',
    'public_transport.ferry',
    'service.post.parcel_locker',
    'accommodation.hotel',
    'accommodation.guest_house',
    'camping.camp_site',
    'service.social_facility.shelter',
    'healthcare.hospital',
    'healthcare.clinic_or_praxis',
];

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

$keyFile = __DIR__ . '/.geoapify-key.php';
if (!is_file($keyFile)) {
    fail(503, 'Geoapify is not configured.');
}

$apiKey = require $keyFile;
if (!is_string($apiKey) || trim($apiKey) === '') {
    fail(503, 'Geoapify is not configured.');
}

$requestedCategories = array_values(array_filter(array_map('trim', explode(',', (string)($_GET['categories'] ?? '')))));
if ($requestedCategories === []) {
    fail(400, 'Missing categories.');
}
foreach ($requestedCategories as $category) {
    if (!in_array($category, $allowedCategories, true)) {
        fail(400, 'Unsupported category.');
    }
}
$requestedCategories = array_values(array_unique($requestedCategories));

$west = filter_input(INPUT_GET, 'west', FILTER_VALIDATE_FLOAT);
$south = filter_input(INPUT_GET, 'south', FILTER_VALIDATE_FLOAT);
$east = filter_input(INPUT_GET, 'east', FILTER_VALIDATE_FLOAT);
$north = filter_input(INPUT_GET, 'north', FILTER_VALIDATE_FLOAT);
if ($west === false || $south === false || $east === false || $north === false) {
    fail(400, 'Invalid bounding box.');
}
if ($west < -180 || $east > 180 || $south < -90 || $north > 90 || $west >= $east || $south >= $north) {
    fail(400, 'Invalid bounding box.');
}
if (($east - $west) > 1.0 || ($north - $south) > 1.0) {
    fail(400, 'Bounding box is too large.');
}

$query = http_build_query([
    'categories' => implode(',', $requestedCategories),
    'filter' => sprintf('rect:%F,%F,%F,%F', $west, $north, $east, $south),
    'limit' => 500,
    'lang' => 'de',
    'apiKey' => $apiKey,
], '', '&', PHP_QUERY_RFC3986);
$url = 'https://api.geoapify.com/v2/places?' . $query;

if (!function_exists('curl_init')) {
    fail(500, 'cURL is not available on this server.');
}

$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
    CURLOPT_USERAGENT => 'Bonkproof/1.0',
    CURLOPT_HEADER => false,
]);
$body = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false) {
    fail(502, $error !== '' ? 'Geoapify request failed.' : 'Geoapify request failed.');
}
if ($status < 200 || $status >= 300) {
    http_response_code($status > 0 ? $status : 502);
    echo json_encode(['error' => 'Geoapify returned an error.'], JSON_UNESCAPED_SLASHES);
    exit;
}

$json = json_decode($body, true);
if (!is_array($json) || !isset($json['features']) || !is_array($json['features'])) {
    fail(502, 'Geoapify returned an invalid response.');
}

echo json_encode($json, JSON_UNESCAPED_SLASHES);
