# Build stage: compile Go
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Go dependencies - cached unless go.mod/go.sum changes
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Copy source code
COPY . .

# Build Go binaries
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o cibi-api ./cmd/cibi-api

# Runtime stage: minimal image
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata sqlite-libs

WORKDIR /app

# Copy binaries from builder
COPY --from=builder /build/cibi-api /app/cibi-api

# Create data directory for SQLite volume mount
RUN mkdir -p /data

# Expose port
EXPOSE 42069

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:42069/api/docs || exit 1

ENTRYPOINT ["/app/cibi-api"]
