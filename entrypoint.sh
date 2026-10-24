#!/bin/sh
# Pfuma Mbiri backend entrypoint: wait for DB → migrate → collectstatic →
# optional seed → exec the CMD (gunicorn).
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
until python -c "import socket; socket.create_connection(('${DB_HOST}', ${DB_PORT}), timeout=2)" 2>/dev/null; do
  sleep 1
done
echo "Database is up."

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "Seeding demo data (seed_demo --flush)..."
  python manage.py seed_demo --flush || echo "seed_demo failed (continuing)"
fi

exec "$@"
