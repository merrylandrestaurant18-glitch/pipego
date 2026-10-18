-- Demo listings only: running this marks two seeded provider accounts online.
-- Change these coordinates to the center of Kiserian, Kajiado County if needed.
-- PostGIS points are constructed as ST_MakePoint(longitude, latitude).
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TEMP TABLE pipego_seed_config (
    base_latitude double precision NOT NULL,
    base_longitude double precision NOT NULL
);

INSERT INTO pipego_seed_config (base_latitude, base_longitude)
VALUES (-1.4333, 36.6850);

CREATE TEMP TABLE pipego_seed_plumbers (
    email text PRIMARY KEY,
    name text NOT NULL,
    bio text NOT NULL,
    north_meters double precision NOT NULL,
    east_meters double precision NOT NULL,
    profile_image_data text NOT NULL
);

INSERT INTO pipego_seed_plumbers
    (email, name, bio, north_meters, east_meters, profile_image_data)
VALUES
    (
        'gioja-slate-plumbers@seed.pipego.test',
        'Gioja Slate Plumbers',
        'Local plumbing team serving Kiserian.',
        180.0,
        -120.0,
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAD6ElEQVR42u3bSY4TQRBA0bgIaxZsECs4BVJL3IEdnICzMM9cgQXNPO0R83yMRG7JkoXcdmZWRmZExi8pVi2rq/K/qnK7y3L1ycfExB1hEQDAQgCAAQADACYggGuHnxITdwAAABYBAAwAGACEnNUGgEnDtt4AECx4BBBC9NgYhOixMcj1p5+Th/G4eVhXIXxsCEL42BCE8LEhCOFjQxDix0YghI8NQYgfG4EQPzYCIX5sBEL82AjkxrMvqcewlW89ugjxYyMQ4sdGINHjf3h0PjQCmTn+Km6rmRWBzBS/ZXCrIMwDmD28BQgAGBx9NAazACLH94pAPMW3HH4EhFAAPMXvhaAJgJvPv6alQ/xxCJa2AwAAiB8ZAQAAYDc+APQRCGd/7KuAWD77uQLoIwAAAOzGB4A+AvMALh6ccz29t2IAt158S6UDALsASluK5fgA0EcAAADYBsDzAIYAWNgeXzk4Govx1/vmCYFbAJtjIfrmAKAzgBEQdu0HAAbE1wZR+runA2D97K+dmrgeAOQiCA9AawAQOL6n24Dcfvk95QwA/AHI6QoAAAAAAAAAAAAAMCWA06dOLoq45PUAGAxgFW89I14/DQDv8WsiLn29FwRcAbgC8B4g9HuAO69+pJzhrwB/AHK6AgAAAAAAAAAAAAAAAAB2AfBEEAAAMBIAt4H5Lv/uAHhB4OXsDwXg8tkzRRMGwN3XP1PuAMAPgNymRQC8I4hy+S/pCQAA+ANgFYGVTRXAaAQnLlw6GosA1vvmJb4rAOvF3RyL8TcHAErhrSHYt4/TAeiFYN/CWkCQu48W45sFkLuooxHU7Oc0ALQQ1CyqJwBaCGobyr03v1LtWInfG0KL/Wy91TZcBKAlghaL2gNBy/0cHd8MgJaLqolAYz/dA1iKYFdAKxBa7YcGgqXthgIoidUbg/bva4XABIBaBKVxtG4Vo25BSwG06DYMwMgzU3tqj8c1gBIES+/Rs8RfgqBVs6YAchG0eIM2S/ya/yS27NUdQOsFmw1ADgLTAPYhsPbnmaXPHXIAtG4l99/+ThqjefbPDuA4BBqd1ABsQwCAegBajVQB/I9A42PaWeLvug1o9lEHsEagvWCzAVgj0G7TBcBqAFB+PD26AAAAAAAAAAAAAAB0AeDlSR0LTx5NA6DXGTPbFaAHAnnw7k/qMQAoP54eXQAAAAAAAAAAAAAAAACAPgB4HiDveKYCoHEVmBlAryYAAMAYADwVPP7yfwTg4fu/qecAYP/x9OwxFADfDNp+PFMDWIpg5u8G9o5vBsDIbwePRLDtdSEA1CDwFL/2eEZ0GAbgOATa39sfiWHXz0c1+AdJoVYfWMpfqwAAAABJRU5ErkJggg=='
    ),
    (
        'ahakir-hardware-plumbing@seed.pipego.test',
        'Ahakir Hardware Plumbing',
        'New junior plumbers serving Kiserian.',
        -240.0,
        210.0,
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAD5klEQVR42u3byW4TQRCA4XobDlwiTvAA3FGeggsST8ATsYUtYUnYzuz7lRdpZEuWLJTY3T1d3VVd/0h1iqzM9P/NjOOM5e6H48TEHWERAMBCAIABAAMAJiCAex9PEhN3AAAAFgEADAAYAISc1QaAScO23gAQLHgEEEL02BiE6LExyP1Pz5OH8bh5WFchfGwIQvjYEITwsSEI4WNDEOLHRiCEjw1BiB8bgRA/NgIhfmwEQvzYCOTB5xepx7CVbz26CPFjIxDix0Yg0eP/PboeGoHMHH8Vt9XMikBmit8yuFUQ5gHMHt4CBAAMjj4ag1kAkeN7RSCe4lsOPwJCKACe4vdC0ATAwy8v09Ih/jgES9sBAADEj4wAAACwGx8A+giEsz/2VUAsn/1cAfQRAAAAduMDQB+BeQA3D6+5nt5bMYCjr69S6QDALoDSlmI5PgD0EQAAALYB8DyAIQAWtrM7h+uxGH+zb54QuAWwPRaibw8AOgMYAWHXfgBgQHxtEKW/ezoA1s/+2qmJ6wFALoLwALQGAIHje7oNyKNvpylnAOAPQE5XAAAAAAAAAAAAAIApARxcvrQo4pLXA2AwgFW8zYx4/TQAvMevibj09V4QcAXgCsB7gNDvAR5/P0s5w18B/gDkdAUAAAAAAAAAAAAAAAAA7ALgiSAAAGAkAG4D813+3QHwgsDL2R8KwO2rV4omDIAnP16n3AGAHwC5TYsAeEcQ5fJf0hMAAPAHwCoCK5sqgNEIDm7dWI9FAJt98xLfFYDN4m6PxfjbAwCl8NYQ7NvH6QD0QrBvYS0gyN1Hi/HNAshd1NEIavZzGgBaCGoW1RMALQS1DeXpzzepdqzE7w2hxX623mobLgLQEkGLRe2BoOV+jo5vBkDLRdVEoLGf7gEsRbAroBUIrfZDA8HSdkMBlMTqjUH797VCYAJALYLSOFq3ilG3oKUAWnQbBmDkmak9tcfjGkAJgqX36FniL0HQqllTALkIWrxBmyV+zX8SW/bqDqD1gs0GIAeBaQD7EFj788zS5w45AFq3kme/3iaN0Tz7ZwdwEQKNTmoAzkMAgHoAWo1UAfyPQONj2lni77oNaPZRB7BBoL1gswHYINBu0wXAagBQfjw9ugAAAAAAAAAAAAAAdAHg5UkdC08eTQOg1xkz2xWgBwI5/v0u9RgAlB9Pjy4AAAAAAAAAAAAAAAAAQB8APA+QdzxTAdC4CswMoFcTAABgDACeCh5/+V8DOPnzPvUcAOw/np49hgLgm0HnH8/UAJYimPm7gb3jmwEw8tvBIxGc97oQAGoQeIpfezwjOgwDcBEC7e/tj8Sw6+ejGvwD0Wt8NBt7EV0AAAAASUVORK5CYII='
    );

UPDATE users
SET is_active = FALSE
WHERE email LIKE 'seed-plumber-%@seed.pipego.test';

INSERT INTO users (id, email, password_hash, role, is_active)
SELECT gen_random_uuid(), email, '!seeded-account-cannot-sign-in', 'plumber', TRUE
FROM pipego_seed_plumbers
ON CONFLICT (email) DO UPDATE
SET role = 'plumber',
    is_active = TRUE;

INSERT INTO plumber_profiles (
    user_id, display_name, verification_status, bio,
    profile_image_data, service_county, service_location, years_experience
)
SELECT u.id, seed.name, 'verified', seed.bio, seed.profile_image_data,
       'Kajiado', 'Kiserian', 1
FROM pipego_seed_plumbers AS seed
JOIN users AS u ON u.email = seed.email
ON CONFLICT (user_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    verification_status = 'verified',
    bio = EXCLUDED.bio,
    profile_image_data = EXCLUDED.profile_image_data,
    service_county = EXCLUDED.service_county,
    service_location = EXCLUDED.service_location,
    years_experience = EXCLUDED.years_experience;

WITH coordinates AS (
    SELECT u.id AS user_id,
           config.base_latitude + seed.north_meters / 111320.0 AS latitude,
           config.base_longitude + seed.east_meters
               / (111320.0 * cos(radians(config.base_latitude))) AS longitude
    FROM pipego_seed_plumbers AS seed
    JOIN users AS u ON u.email = seed.email
    CROSS JOIN pipego_seed_config AS config
)
INSERT INTO provider_availability (
    user_id, is_online, latitude, longitude, service_radius_km, max_active_jobs, updated_at
)
SELECT user_id, TRUE, latitude, longitude, 20, 1, now()
FROM coordinates
ON CONFLICT (user_id) DO UPDATE
SET is_online = TRUE,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = now();

COMMIT;
