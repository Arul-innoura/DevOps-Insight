package collector

import (
	"crypto/sha1"
	"encoding/hex"
	"net/url"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
)

// svcRef is the in-memory shape of a discovered target service. Package-level
// so we can pass it across helper functions.
type svcRef struct{ ns, name string }

type podKey struct{ ns, name string }

// DiscoverServiceCommunications produces edges between callers and targets
// without any third-party service mesh. We synthesise the graph from:
//
//  1. Pod env vars / args / configmap data referencing service URLs
//     (`http://my-svc:8080`, `my-svc.other-ns.svc.cluster.local`).
//  2. Ingress backends → Service edges (external → internal).
//  3. Service `externalName` → external host edges.
//
// The estimated bytes are the caller-pod's tx bytes from cAdvisor split
// proportionally across distinct discovered targets — a coarse proxy that
// is honest about its limits but still lets dashboards rank busy edges.
func DiscoverServiceCommunications(d *ClusterData, now time.Time, env, cluster string) []ServiceCommunication {
	// Map fully-qualified DNS names back to (ns, name).
	svcByDNS := map[string]svcRef{}
	for _, s := range d.Services {
		full := s.Name + "." + s.Namespace
		svcByDNS[full] = svcRef{s.Namespace, s.Name}
	}

	// Tx bytes per caller pod for edge weighting.
	txByPod := map[podKey]uint64{}
	if d.CAdvisor != nil {
		for k, v := range d.CAdvisor.Net {
			txByPod[podKey{k.Namespace, k.Pod}] = v.TxBytes
		}
	}

	out := make([]ServiceCommunication, 0, 256)

	// (1) Pod-derived edges — env vars and args.
	for i := range d.Pods {
		p := &d.Pods[i]
		txBudget := txByPod[podKey{p.Namespace, p.Name}]

		targets := map[svcRef]string{} // dedupe edges; value = discoveredVia
		sameNS := sameNSServices(d, p.Namespace)
		scan := func(text, via string) {
			for _, t := range scanRefs(text, p.Namespace, svcByDNS, sameNS) {
				if _, ok := targets[t]; !ok {
					targets[t] = via
				}
			}
		}
		for _, c := range p.Spec.Containers {
			for _, e := range c.Env { scan(e.Value, "env") }
			for _, a := range c.Args { scan(a, "arg") }
			for _, cm := range c.Command { scan(cm, "command") }
		}

		// configmap data referenced via volumes
		for _, vol := range p.Spec.Volumes {
			if vol.ConfigMap == nil { continue }
			for _, cm := range d.ConfigMaps {
				if cm.Namespace != p.Namespace || cm.Name != vol.ConfigMap.Name { continue }
				for _, v := range cm.Data { scan(v, "configmap") }
			}
		}

		if len(targets) == 0 { continue }
		share := uint64(0)
		if len(targets) > 0 { share = txBudget / uint64(len(targets)) }

		for tgt, via := range targets {
			out = append(out, ServiceCommunication{
				ID:              edgeID(env, p.Namespace, p.Name, tgt.ns, tgt.name),
				EnvironmentID:   env,
				ClusterName:     cluster,
				CapturedAt:      now,
				SourceNamespace: p.Namespace,
				SourceKind:      "Pod",
				SourceName:      p.Name,
				TargetNamespace: tgt.ns,
				TargetKind:      "Service",
				TargetName:      tgt.name,
				TargetEndpoint:  tgt.name + "." + tgt.ns + ".svc.cluster.local",
				DiscoveredVia:   via,
				EstimatedBytes:  share,
				LastSeen:        latestPodActivity(p, now),
			})
		}
	}

	// (2) Ingress → Service edges (treat ingress as the caller).
	for i := range d.Ingresses {
		ing := &d.Ingresses[i]
		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil { continue }
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil { continue }
				out = append(out, ServiceCommunication{
					ID:              edgeID(env, ing.Namespace, "ingress/"+ing.Name, ing.Namespace, path.Backend.Service.Name),
					EnvironmentID:   env,
					ClusterName:     cluster,
					CapturedAt:      now,
					SourceNamespace: ing.Namespace,
					SourceKind:      "Ingress",
					SourceName:      ing.Name,
					TargetNamespace: ing.Namespace,
					TargetKind:      "Service",
					TargetName:      path.Backend.Service.Name,
					TargetEndpoint:  rule.Host + path.Path,
					DiscoveredVia:   "ingress",
					LastSeen:        now,
				})
			}
		}
		// default backend
		if ing.Spec.DefaultBackend != nil && ing.Spec.DefaultBackend.Service != nil {
			out = append(out, ServiceCommunication{
				ID:              edgeID(env, ing.Namespace, "ingress/"+ing.Name, ing.Namespace, ing.Spec.DefaultBackend.Service.Name),
				EnvironmentID:   env,
				ClusterName:     cluster,
				CapturedAt:      now,
				SourceNamespace: ing.Namespace,
				SourceKind:      "Ingress",
				SourceName:      ing.Name,
				TargetNamespace: ing.Namespace,
				TargetKind:      "Service",
				TargetName:      ing.Spec.DefaultBackend.Service.Name,
				DiscoveredVia:   "ingress-default",
				LastSeen:        now,
			})
		}
	}

	// (3) ExternalName services → external host edges.
	for _, s := range d.Services {
		if s.Spec.Type != corev1.ServiceTypeExternalName || s.Spec.ExternalName == "" { continue }
		out = append(out, ServiceCommunication{
			ID:              edgeID(env, s.Namespace, "service/"+s.Name, "", s.Spec.ExternalName),
			EnvironmentID:   env,
			ClusterName:     cluster,
			CapturedAt:      now,
			SourceNamespace: s.Namespace,
			SourceKind:      "Service",
			SourceName:      s.Name,
			TargetNamespace: "",
			TargetKind:      "ExternalName",
			TargetName:      s.Spec.ExternalName,
			TargetEndpoint:  s.Spec.ExternalName,
			DiscoveredVia:   "externalname",
			LastSeen:        now,
		})
	}

	return out
}

// scanRefs picks any cluster-DNS references out of a string. Matches both
// `svc-name.ns.svc.cluster.local` and bare `svc-name` if it resolves in the
// caller's namespace. Anything not resolvable is dropped silently.
func scanRefs(text, callerNS string, allDNS map[string]svcRef, sameNS map[string]struct{}) []svcRef {
	if text == "" { return nil }
	out := []svcRef{}
	seen := map[string]struct{}{}

	candidates := []string{text}
	if u, err := url.Parse(text); err == nil && u.Host != "" {
		candidates = append(candidates, u.Hostname())
	}
	for _, raw := range candidates {
		for _, tok := range tokenize(raw) {
			tok = strings.TrimSpace(tok)
			if tok == "" { continue }
			if i := strings.Index(tok, ":"); i > 0 { tok = tok[:i] }
			tok = strings.TrimSuffix(tok, ".svc.cluster.local")
			tok = strings.TrimSuffix(tok, ".svc")
			if ref, ok := allDNS[tok]; ok {
				if _, dup := seen[tok]; !dup {
					out = append(out, ref)
					seen[tok] = struct{}{}
				}
				continue
			}
			if _, ok := sameNS[tok]; ok {
				key := tok + "." + callerNS
				if _, dup := seen[key]; !dup {
					out = append(out, svcRef{callerNS, tok})
					seen[key] = struct{}{}
				}
			}
		}
	}
	return out
}

func tokenize(s string) []string {
	repl := strings.NewReplacer(",", " ", ";", " ", "\"", " ", "'", " ", "<", " ", ">", " ")
	return strings.Fields(repl.Replace(s))
}

func sameNSServices(d *ClusterData, ns string) map[string]struct{} {
	m := map[string]struct{}{}
	for _, s := range d.Services {
		if s.Namespace == ns { m[s.Name] = struct{}{} }
	}
	return m
}

// latestPodActivity = max(container start time, pod start time). Approximates
// "last seen" for a configured caller without us having to subscribe to logs.
func latestPodActivity(p *corev1.Pod, fallback time.Time) time.Time {
	t := fallback
	if p.Status.StartTime != nil && p.Status.StartTime.Time.After(t.Add(-time.Hour*24)) {
		t = p.Status.StartTime.Time
	}
	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Running != nil && cs.State.Running.StartedAt.Time.After(t) {
			t = cs.State.Running.StartedAt.Time
		}
	}
	return t
}

// Stable, short edge identifier so re-running the agent updates documents
// in place rather than appending duplicates.
func edgeID(parts ...string) string {
	h := sha1.New()
	for _, p := range parts { h.Write([]byte(p)); h.Write([]byte{0}) }
	return "edge_" + hex.EncodeToString(h.Sum(nil))[:20]
}
