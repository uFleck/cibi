# Build stage: compile Go + build React
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Copy Go source
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build React SPA
RUN apk add --no-cache nodejs npm && \
    cd web && npm install && npm run build && cd .. && \
    rm -rf cmd/cibi-api/web/dist && cp -r web/dist cmd/cibi-api/web/dist

# Build Go binaries (CGO_ENABLED=0 for pure Go, scratch-compatible)
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o cibi-api ./cmd/cibi-api && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o cibi ./cmd/cibi

# Runtime stage: minimal image
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata sqlite-libs

WORKDIR /app

# Copy binaries from builder
COPY --from=builder /build/cibi-api /app/cibi-api
COPY --from=builder /build/cibi /app/cibi

# Create data directory for SQLite volume mount
RUN mkdir -p /data

# Expose port
EXPOSE 42069

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:42069/ || exit 1

# Default env: db lives in mounted /data volume
ENV CIBI_DATABASEPATH=/data/cibi.db

ENTRYPOINT ["/app/cibi-api"]
