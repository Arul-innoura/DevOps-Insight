# syntax=docker/dockerfile:1.6
# ── stage 1: build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS build
WORKDIR /src

# GONOSUMDB=* and GOFLAGS=-mod=mod let the build generate go.sum automatically
# so no local `go mod tidy` is needed before the first `docker compose up`.
ENV GONOSUMDB=* GOFLAGS=-mod=mod

# Copy go.mod first — downloads deps in a cached layer so code changes
# don't re-download the internet.
COPY go.mod ./
RUN go mod download

COPY . .
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -trimpath -ldflags="-s -w" -o /out/agent ./cmd/agent

# ── stage 2: runtime — distroless static, ~2 MB above the binary ────────────
FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/agent /agent
USER nonroot:nonroot
EXPOSE 8090
ENTRYPOINT ["/agent"]
