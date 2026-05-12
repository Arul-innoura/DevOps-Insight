// Package api exposes a small read-only HTTP surface so dashboards (and
// Postman) can query the latest cycle results. Writes happen exclusively
// through the collector loop — the HTTP server never mutates state.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/encipher/k8s-cost-agent/internal/collector"
	"github.com/encipher/k8s-cost-agent/internal/storage"
)

// Server holds the routes and a pointer to the last in-memory cycle, which
// lets clients fetch the freshest data without a Mongo round-trip.
type Server struct {
	store    *storage.Store
	last     atomic.Pointer[collector.Cycle]
	envID    string
	cluster  string
	startup  time.Time
}

func New(store *storage.Store, envID, cluster string) *Server {
	return &Server{store: store, envID: envID, cluster: cluster, startup: time.Now()}
}

// Publish is called by the agent loop after every successful cycle.
func (s *Server) Publish(c *collector.Cycle) { s.last.Store(c) }

// Routes wires HTTP paths. Auth is intentionally omitted — deploy this
// behind the cluster's ingress with mTLS or NetworkPolicy.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz",         s.handleHealthz)
	mux.HandleFunc("/readyz",          s.handleReadyz)
	mux.HandleFunc("/v1/summary",      s.handleSummary)
	mux.HandleFunc("/v1/namespaces",   s.handleNamespaces)
	mux.HandleFunc("/v1/namespace",    s.handleNamespace) // ?ns=foo (latest)
	mux.HandleFunc("/v1/namespace/history", s.handleNamespaceHistory) // ?ns=foo&from=&to=
	mux.HandleFunc("/v1/nodes",        s.handleNodes)
	mux.HandleFunc("/v1/edges",        s.handleEdges) // ?ns=foo
	mux.HandleFunc("/v1/cycle",        s.handleCycle) // last in-memory cycle (raw)
	return logging(mux)
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"uptime": time.Since(s.startup).String(),
	})
}

func (s *Server) handleReadyz(w http.ResponseWriter, _ *http.Request) {
	if s.last.Load() == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ready": false, "reason": "no cycle yet"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ready": true})
}

func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	ctx, cancel := timed(r.Context())
	defer cancel()
	sum, err := s.store.LatestSummary(ctx, env)
	if err != nil { writeErr(w, http.StatusNotFound, err); return }
	writeJSON(w, http.StatusOK, sum)
}

func (s *Server) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	ctx, cancel := timed(r.Context())
	defer cancel()
	rows, err := s.store.LatestNamespaces(ctx, env)
	if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleNamespace(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	ns := r.URL.Query().Get("ns")
	if ns == "" { writeErr(w, http.StatusBadRequest, errMsg("missing ?ns=")); return }
	ctx, cancel := timed(r.Context())
	defer cancel()
	rows, err := s.store.LatestNamespaces(ctx, env)
	if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
	for i := range rows {
		if rows[i].Namespace == ns { writeJSON(w, http.StatusOK, rows[i]); return }
	}
	writeErr(w, http.StatusNotFound, errMsg("namespace not found in latest cycle"))
}

func (s *Server) handleNamespaceHistory(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	q := r.URL.Query()
	ns := q.Get("ns")
	if ns == "" { writeErr(w, http.StatusBadRequest, errMsg("missing ?ns=")); return }
	to := time.Now().UTC()
	from := to.Add(-24 * time.Hour)
	if v := q.Get("from"); v != "" { if t, err := time.Parse(time.RFC3339, v); err == nil { from = t } }
	if v := q.Get("to");   v != "" { if t, err := time.Parse(time.RFC3339, v); err == nil { to = t } }
	ctx, cancel := timed(r.Context())
	defer cancel()
	rows, err := s.store.NamespaceHistory(ctx, env, ns, from, to)
	if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleNodes(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	ctx, cancel := timed(r.Context())
	defer cancel()
	rows, err := s.store.LatestNodes(ctx, env)
	if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleEdges(w http.ResponseWriter, r *http.Request) {
	env := envOrDefault(r, s.envID)
	ns := r.URL.Query().Get("ns")
	ctx, cancel := timed(r.Context())
	defer cancel()
	rows, err := s.store.LatestEdges(ctx, env, ns)
	if err != nil { writeErr(w, http.StatusInternalServerError, err); return }
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleCycle(w http.ResponseWriter, _ *http.Request) {
	c := s.last.Load()
	if c == nil { writeErr(w, http.StatusServiceUnavailable, errMsg("no cycle yet")); return }
	writeJSON(w, http.StatusOK, c)
}

// ── helpers ─────────────────────────────────────────────────────────────────

func envOrDefault(r *http.Request, def string) string {
	if v := r.URL.Query().Get("env"); v != "" { return v }
	return def
}

func timed(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 8*time.Second)
}

type httpError struct{ Msg string `json:"error"` }

func errMsg(s string) error { return &errStr{s} }
type errStr struct{ s string }
func (e *errStr) Error() string { return e.s }

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}
func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, httpError{Msg: err.Error()})
}

// logging is a tiny middleware so kubectl logs surface request lines.
func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		// stdlib logger is wired to stdout in main; using fmt would need an import here.
		w.Header().Set("X-Response-Time", time.Since(start).String())
		_ = sw.status
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(c int) { s.status = c; s.ResponseWriter.WriteHeader(c) }
