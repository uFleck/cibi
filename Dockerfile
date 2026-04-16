# Build stage: compile Go + build React
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Go dependencies - cached unless go.mod/go.sum changes
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# React dependencies - cached unless package.json/package-lock changes
COPY web/package.json web/package-lock.json* ./web/
RUN apk add --no-cache nodejs npm && \
    cd web && npm install --prefer-offline

# Copy source code
COPY . .

# Build React SPA
RUN cd web && npm run build && cd .. && \
    rm -rf cmd/cibi-api/web/dist && cp -r web/dist cmd/cibi-api/web/dist

# Build Go binaries
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
