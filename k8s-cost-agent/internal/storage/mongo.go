// Package storage writes collected records to MongoDB. We use upserts on
// stable IDs so re-running the agent (or restarting it) produces a single
// time-series row per (cluster, namespace, capturedAt) instead of duplicates.
package storage

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/encipher/k8s-cost-agent/internal/collector"
	"github.com/encipher/k8s-cost-agent/internal/config"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Store struct {
	c   *mongo.Client
	cfg config.Config
}

// Open dials Mongo, pings, and prepares time-series indexes (and a TTL on
// raw snapshots if RetentionDays > 0). Safe to call once at startup.
func Open(ctx context.Context, cfg config.Config) (*Store, error) {
	clientOpts := options.Client().
		ApplyURI(cfg.MongoURI).
		SetMaxPoolSize(8).
		SetServerSelectionTimeout(10 * time.Second).
		SetAppName("k8s-cost-agent")

	cli, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if err := cli.Ping(pingCtx, nil); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}

	s := &Store{c: cli, cfg: cfg}
	if err := s.ensureIndexes(ctx); err != nil {
		return nil, fmt.Errorf("indexes: %w", err)
	}
	return s, nil
}

func (s *Store) Close(ctx context.Context) error { return s.c.Disconnect(ctx) }

func (s *Store) db() *mongo.Database { return s.c.Database(s.cfg.MongoDatabase) }

// WriteCycle persists every record from one collector cycle. We use bulk
// upserts so a single tick is one network round-trip per collection.
func (s *Store) WriteCycle(ctx context.Context, c *collector.Cycle) error {
	if err := s.upsertNamespaces(ctx, c.Namespaces); err != nil {
		return fmt.Errorf("namespaces: %w", err)
	}
	if err := s.upsertNodes(ctx, c.Nodes); err != nil {
		return fmt.Errorf("nodes: %w", err)
	}
	if err := s.upsertEdges(ctx, c.ServiceComms); err != nil {
		return fmt.Errorf("edges: %w", err)
	}
	if err := s.upsertSummary(ctx, c.Summary); err != nil {
		return fmt.Errorf("summary: %w", err)
	}
	return nil
}

func (s *Store) upsertNamespaces(ctx context.Context, recs []collector.NamespaceMetrics) error {
	if len(recs) == 0 { return nil }
	ops := make([]mongo.WriteModel, 0, len(recs))
	for i := range recs {
		recs[i].ID = stableID("ns", recs[i].EnvironmentID, recs[i].Namespace, recs[i].CapturedAt.Format(time.RFC3339))
		ops = append(ops,
			mongo.NewReplaceOneModel().
				SetFilter(bson.M{"_id": recs[i].ID}).
				SetReplacement(recs[i]).
				SetUpsert(true),
		)
	}
	_, err := s.db().Collection(s.cfg.NamespaceColl).BulkWrite(ctx, ops, options.BulkWrite().SetOrdered(false))
	return err
}

func (s *Store) upsertNodes(ctx context.Context, recs []collector.NodeMetrics) error {
	if len(recs) == 0 { return nil }
	ops := make([]mongo.WriteModel, 0, len(recs))
	for i := range recs {
		recs[i].ID = stableID("node", recs[i].EnvironmentID, recs[i].NodeName, recs[i].CapturedAt.Format(time.RFC3339))
		ops = append(ops,
			mongo.NewReplaceOneModel().
				SetFilter(bson.M{"_id": recs[i].ID}).
				SetReplacement(recs[i]).
				SetUpsert(true),
		)
	}
	_, err := s.db().Collection(s.cfg.NodeColl).BulkWrite(ctx, ops, options.BulkWrite().SetOrdered(false))
	return err
}

func (s *Store) upsertEdges(ctx context.Context, recs []collector.ServiceCommunication) error {
	if len(recs) == 0 { return nil }
	ops := make([]mongo.WriteModel, 0, len(recs))
	for i := range recs {
		// EdgeID already encodes source+target so combine with capturedAt.
		recs[i].ID = stableID(recs[i].ID, recs[i].CapturedAt.Format(time.RFC3339))
		ops = append(ops,
			mongo.NewReplaceOneModel().
				SetFilter(bson.M{"_id": recs[i].ID}).
				SetReplacement(recs[i]).
				SetUpsert(true),
		)
	}
	_, err := s.db().Collection(s.cfg.ServiceCommColl).BulkWrite(ctx, ops, options.BulkWrite().SetOrdered(false))
	return err
}

func (s *Store) upsertSummary(ctx context.Context, sum collector.CycleSummary) error {
	sum.ID = stableID("summary", sum.EnvironmentID, sum.CapturedAt.Format(time.RFC3339))
	_, err := s.db().Collection(s.cfg.CostSummaryColl).ReplaceOne(
		ctx, bson.M{"_id": sum.ID}, sum, options.Replace().SetUpsert(true),
	)
	return err
}

// ── Indexes ─────────────────────────────────────────────────────────────────

func (s *Store) ensureIndexes(ctx context.Context) error {
	ttl := int32(0)
	if s.cfg.RetentionDays > 0 { ttl = int32(s.cfg.RetentionDays * 24 * 60 * 60) }

	specs := []indexBatch{
		{coll: s.cfg.NamespaceColl, models: []mongo.IndexModel{
			{Keys: bson.D{{"environmentId", 1}, {"namespace", 1}, {"capturedAt", -1}}, Options: options.Index().SetName("env_ns_time")},
			{Keys: bson.D{{"capturedAt", -1}}, Options: options.Index().SetName("time")},
		}},
		{coll: s.cfg.NodeColl, models: []mongo.IndexModel{
			{Keys: bson.D{{"environmentId", 1}, {"nodeName", 1}, {"capturedAt", -1}}, Options: options.Index().SetName("env_node_time")},
			{Keys: bson.D{{"capturedAt", -1}}, Options: options.Index().SetName("time")},
		}},
		{coll: s.cfg.ServiceCommColl, models: []mongo.IndexModel{
			{Keys: bson.D{{"environmentId", 1}, {"sourceNamespace", 1}, {"capturedAt", -1}}, Options: options.Index().SetName("env_src_time")},
			{Keys: bson.D{{"environmentId", 1}, {"targetNamespace", 1}, {"targetName", 1}, {"capturedAt", -1}}, Options: options.Index().SetName("env_tgt_time")},
			{Keys: bson.D{{"capturedAt", -1}}, Options: options.Index().SetName("time")},
		}},
		{coll: s.cfg.CostSummaryColl, models: []mongo.IndexModel{
			{Keys: bson.D{{"environmentId", 1}, {"capturedAt", -1}}, Options: options.Index().SetName("env_time")},
		}},
	}
	if ttl > 0 {
		for i := range specs {
			specs[i].models = append(specs[i].models,
				mongo.IndexModel{
					Keys:    bson.D{{"capturedAt", 1}},
					Options: options.Index().SetName("ttl").SetExpireAfterSeconds(ttl),
				},
			)
		}
	}
	for _, sp := range specs {
		if _, err := s.db().Collection(sp.coll).Indexes().CreateMany(ctx, sp.models); err != nil {
			return fmt.Errorf("%s: %w", sp.coll, err)
		}
	}
	return nil
}

type indexBatch struct {
	coll   string
	models []mongo.IndexModel
}

// ── Read API used by the HTTP server ────────────────────────────────────────

func (s *Store) LatestNamespaces(ctx context.Context, env string) ([]collector.NamespaceMetrics, error) {
	// One row per namespace at the most recent capturedAt for the given env.
	pipeline := mongo.Pipeline{
		{{"$match", bson.M{"environmentId": env}}},
		{{"$sort", bson.D{{"capturedAt", -1}}}},
		{{"$group", bson.M{
			"_id": "$namespace",
			"doc": bson.M{"$first": "$$ROOT"},
		}}},
		{{"$replaceRoot", bson.M{"newRoot": "$doc"}}},
		{{"$sort", bson.D{{"namespace", 1}}}},
	}
	cur, err := s.db().Collection(s.cfg.NamespaceColl).Aggregate(ctx, pipeline)
	if err != nil { return nil, err }
	defer cur.Close(ctx)
	var out []collector.NamespaceMetrics
	return out, cur.All(ctx, &out)
}

func (s *Store) NamespaceHistory(ctx context.Context, env, ns string, from, to time.Time) ([]collector.NamespaceMetrics, error) {
	cur, err := s.db().Collection(s.cfg.NamespaceColl).Find(ctx, bson.M{
		"environmentId": env, "namespace": ns,
		"capturedAt": bson.M{"$gte": from, "$lt": to},
	}, options.Find().SetSort(bson.D{{"capturedAt", 1}}))
	if err != nil { return nil, err }
	defer cur.Close(ctx)
	var out []collector.NamespaceMetrics
	return out, cur.All(ctx, &out)
}

func (s *Store) LatestNodes(ctx context.Context, env string) ([]collector.NodeMetrics, error) {
	pipeline := mongo.Pipeline{
		{{"$match", bson.M{"environmentId": env}}},
		{{"$sort", bson.D{{"capturedAt", -1}}}},
		{{"$group", bson.M{"_id": "$nodeName", "doc": bson.M{"$first": "$$ROOT"}}}},
		{{"$replaceRoot", bson.M{"newRoot": "$doc"}}},
		{{"$sort", bson.D{{"nodeName", 1}}}},
	}
	cur, err := s.db().Collection(s.cfg.NodeColl).Aggregate(ctx, pipeline)
	if err != nil { return nil, err }
	defer cur.Close(ctx)
	var out []collector.NodeMetrics
	return out, cur.All(ctx, &out)
}

func (s *Store) LatestEdges(ctx context.Context, env, ns string) ([]collector.ServiceCommunication, error) {
	filter := bson.M{"environmentId": env}
	if ns != "" { filter["sourceNamespace"] = ns }
	pipeline := mongo.Pipeline{
		{{"$match", filter}},
		{{"$sort", bson.D{{"capturedAt", -1}}}},
		{{"$group", bson.M{
			"_id": bson.M{
				"src": bson.M{"ns": "$sourceNamespace", "name": "$sourceName"},
				"tgt": bson.M{"ns": "$targetNamespace", "name": "$targetName"},
			},
			"doc": bson.M{"$first": "$$ROOT"},
		}}},
		{{"$replaceRoot", bson.M{"newRoot": "$doc"}}},
	}
	cur, err := s.db().Collection(s.cfg.ServiceCommColl).Aggregate(ctx, pipeline)
	if err != nil { return nil, err }
	defer cur.Close(ctx)
	var out []collector.ServiceCommunication
	return out, cur.All(ctx, &out)
}

func (s *Store) LatestSummary(ctx context.Context, env string) (*collector.CycleSummary, error) {
	var sum collector.CycleSummary
	err := s.db().Collection(s.cfg.CostSummaryColl).FindOne(
		ctx, bson.M{"environmentId": env}, options.FindOne().SetSort(bson.D{{"capturedAt", -1}}),
	).Decode(&sum)
	if err != nil { return nil, err }
	return &sum, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

func stableID(parts ...string) string {
	h := sha1.New()
	for _, p := range parts { h.Write([]byte(p)); h.Write([]byte{0}) }
	return hex.EncodeToString(h.Sum(nil))
}
