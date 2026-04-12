# Docker Setup

CIBI containerized for easy deployment.

## Quick Start (Local Dev)

```bash
docker-compose up
```

Opens http://localhost:42069 with persistent SQLite at `cibi-data` volume.

## Production Build

```bash
docker build -t cibi:latest .
docker run -d \
  --name cibi \
  -p 42069:42069 \
  -v cibi-data:/data \
  cibi:latest
```

## Configuration

All config via env vars (read by Viper in `internal/config/config.go`):

| Env Var | Default | Purpose |
|---------|---------|---------|
| `CIBI_DATABASEPATH` | `/data/cibi.db` | SQLite db location (must be on mounted volume) |
| `CIBI_SERVERPORT` | `:42069` | Port to bind |
| `CIBI_SAFETYBUFFER` | `1000` | Safety buffer in cents |

### Example: Custom port + custom db path

```bash
docker run -d \
  --name cibi \
  -p 8080:8080 \
  -v /custom/data:/data \
  -e CIBI_SERVERPORT=:8080 \
  -e CIBI_DATABASEPATH=/data/cibi.db \
  cibi:latest
```

## Persistence

SQLite db lives in the **volume** (`cibi-data` or `-v /host/path:/data`), not the image.
- Survives container restarts/replacements
- Portable across servers (rsync `/host/path` to new machine)
- No rebuild needed when moving servers

## Server Migration

1. Stop container on old server:
   ```bash
   docker stop cibi && docker rm cibi
   ```

2. Backup data volume:
   ```bash
   rsync -av /old-server:/data/ /new-server:/data/
   ```

3. Start fresh container on new server with same volume:
   ```bash
   docker run -d --name cibi -p 42069:42069 -v /data:/data cibi:latest
   ```

Done. Same app, same data, zero downtime.

## Health Check

Container includes `HEALTHCHECK` that tests `GET /` every 30s.

```bash
docker ps  # STATUS shows "healthy" if up
```
