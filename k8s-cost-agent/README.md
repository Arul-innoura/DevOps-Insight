# k8s-cost-agent

A lightweight Go agent that runs inside a Kubernetes cluster, collects 100+
real-resource metrics per namespace every 60 seconds, and writes per-namespace
costs and service-to-service usage to MongoDB.

No third-party SaaS. No service mesh required. Single binary,
single replica, ~20 MB image, ~50 m CPU / 64 Mi memory at rest.

## What it collects

Every 60 s (configurable), for each namespace:

| Group           | Examples (full list in [internal/collector/types.go](internal/collector/types.go)) |
| --------------- | -------- |
| Pods (10)       | total, running, pending, failed, restart count, age stats |
| Containers (8)  | ready / not ready / init / waiting / terminated / OOM-killed |
| CPU (7)         | request / limit / actual usage (metrics-server) / throttled seconds |
| Memory (10)     | request / limit / working-set / RSS / cache / OOM events |
| Storage (10)    | PVC count + phase, PV capacity + used, ephemeral storage |
| Network (10)    | rx/tx bytes, packets, errors, dropped, internet vs internal egress |
| Workloads (17)  | deployments, statefulsets, daemonsets, jobs, cronjobs, HPAs |
| Services (9)    | by type, ingresses, endpoints, network policies |
| Config / RBAC (7) | configmaps + bytes, secrets + bytes, SAs, roles, role bindings |
| Events (4)      | warning vs normal in last minute, total warnings, failed scheduling |
| Quotas (4)      | resource quota CPU / memory used %, limit ranges |
| HPA (2)         | min / max replicas summed |
| **Cost (9)**    | per-hour USD broken down: CPU, memory, ephemeral, PV, egress, LB, total + day + month |

Plus per-node metrics and a service-to-service edge graph derived from pod
env vars, configmap data, and ingress backends — weighted by the caller pod's
egress bytes.

## MongoDB layout

Same database as the existing Spring backend (`devops_portal`). Four new
collections, all upsert-keyed (no duplicates on restart):

| Collection                    | One document per                                  |
| ----------------------------- | ------------------------------------------------- |
| `k8s_namespace_metrics`       | `(env, namespace, capturedAt)` — the 100+ fields  |
| `k8s_node_metrics`            | `(env, node, capturedAt)`                         |
| `k8s_service_communications`  | `(env, source, target, capturedAt)` edge          |
| `k8s_cost_summary`            | `(env, capturedAt)` cluster roll-up               |

A 14-day TTL index is created automatically (override with
`AGENT_RETENTION_DAYS`).

## HTTP API

Read-only, no auth — deploy behind ingress / NetworkPolicy.

| Path                            | What it returns |
| ------------------------------- | ----------------|
| `GET /healthz`                  | liveness        |
| `GET /readyz`                   | becomes ready after the first cycle |
| `GET /v1/summary?env=…`         | latest cluster roll-up |
| `GET /v1/namespaces?env=…`      | latest row per namespace |
| `GET /v1/namespace?env=…&ns=…`  | latest row for one namespace |
| `GET /v1/namespace/history?env=…&ns=…&from=&to=` | RFC3339 range (default 24 h) |
| `GET /v1/nodes?env=…`           | latest row per node |
| `GET /v1/edges?env=…&ns=…`      | latest service-to-service edges |
| `GET /v1/cycle`                 | last in-memory cycle (raw, no DB roundtrip) |

A ready-to-import [Postman collection](postman/k8s-cost-agent.postman_collection.json) is in `postman/`.

## Local test (Windows)

**Minikube inside Docker Compose:** flattened kubeconfig often has `server: https://127.0.0.1:<port>`.
`docker-compose.yml` defaults `AGENT_KUBE_API_HOST_REMAP=host.docker.internal` so the agent hits the host (port still comes from kubeconfig). Rebuild after pulling changes: `docker compose up --build`. On startup, logs include `kubernetes client` with `apiHost` — it should be `https://host.docker.internal:...`, not `127.0.0.1`.

Spin up Mongo and run the agent against your current kubeconfig:

```powershell
cd d:\DevOps-Insight\k8s-cost-agent
docker compose up --build
# in another shell
curl http://localhost:8090/healthz
curl "http://localhost:8090/v1/summary?env=local-cluster"
curl "http://localhost:8090/v1/namespaces?env=local-cluster"
```

Or run the binary directly without Docker:

```powershell
make tidy
make run     # uses %USERPROFILE%\.kube\config and mongodb://localhost:27017
```

Import [postman/k8s-cost-agent.postman_collection.json](postman/k8s-cost-agent.postman_collection.json),
set `baseUrl=http://localhost:8090` and `env=local-cluster`, then **Run Collection**.

## Azure / AKS test

1. **Build + push** the image to ACR (or your registry):
   ```powershell
   az acr login -n <your-acr>
   make image IMG=<your-acr>.azurecr.io/k8s-cost-agent:v1
   docker push <your-acr>.azurecr.io/k8s-cost-agent:v1
   ```

2. **Connect kubectl** to the AKS cluster:
   ```powershell
   az aks get-credentials -g <rg> -n <aks-name>
   ```

3. **Create the Mongo URI secret** (uses the same Atlas as the Spring backend
   or a dedicated user — read+write on `devops_portal`):
   ```powershell
   copy deploy\secret.example.yaml deploy\secret.yaml
   notepad deploy\secret.yaml          # paste the real URI
   kubectl apply -f deploy\namespace.yaml
   kubectl apply -f deploy\secret.yaml
   ```

4. **Tune the ConfigMap** for your environment ID and prices, then deploy:
   ```powershell
   notepad deploy\configmap.yaml       # set AGENT_ENVIRONMENT_ID etc.
   make deploy IMG=<your-acr>.azurecr.io/k8s-cost-agent:v1
   make logs                           # watch the first cycle land
   ```

5. **Hit the API** (port-forward, or wire your existing ingress):
   ```powershell
   make port-forward
   curl http://localhost:8090/v1/summary?env=aks-prod
   ```

Same Postman collection — just change `baseUrl` and `env`.

## Cost-conscious choices

- **One replica, not a DaemonSet** — the agent collects via the API server
  and the kubelet `nodes/proxy` endpoint, so a single pod sees the whole
  cluster. A DaemonSet would 10× the cost on a 10-node cluster.
- **Distroless static image** — ~20 MB, no shell, runs as non-root with
  read-only root FS.
- **Protobuf for the core API**, JSON only for metrics.k8s.io which doesn't
  speak protobuf.
- **Bulk upserts** — one Mongo round-trip per collection per cycle.
- **TTL index** — raw snapshots auto-expire so storage cost stays bounded.
- **Embedded Azure list-price table** — no calls to a paid pricing API. Tune
  rates per agreement via `AGENT_PRICE_*` env vars.

## Limits to know

- Internet vs internal egress split is heuristic (80 / 20). For exact splits
  use NSG flow logs or eBPF — out of scope here.
- Service-to-service edges are derived from configuration + per-pod tx bytes.
  We do not capture true source→destination bytes (would need a service mesh
  or eBPF). Edges are honest about being "configured to talk to" with a
  weighted byte estimate.
- PV used-bytes assumes 60% utilization where kubelet `/stats/summary`
  isn't surfaced. Replace with `/stats/summary` parsing if you need exact.

## File map

```
k8s-cost-agent/
├── cmd/agent/main.go              # entrypoint: signals, scheduler, lifecycle
├── internal/
│   ├── api/server.go              # HTTP handlers (read-only)
│   ├── collector/
│   │   ├── types.go               # 100+ field NamespaceMetrics struct
│   │   ├── collector.go           # one-cycle orchestrator
│   │   ├── services.go            # service-to-service edge discovery
│   │   └── cost_shim.go           # adapter: NamespaceMetrics ↔ cost.Applier
│   ├── config/config.go           # env-var loader
│   ├── cost/calculator.go         # CPU/mem/PV/egress/LB → USD
│   ├── kube/
│   │   ├── client.go              # in-cluster + kubeconfig client builder
│   │   └── cadvisor.go            # /metrics/cadvisor scraper
│   ├── pricing/azure.go           # embedded Azure VM list-price table
│   └── storage/mongo.go           # upserts, indexes, read API
├── deploy/                         # namespace, RBAC, configmap, secret, deploy, svc
├── postman/                        # importable test collection
├── Dockerfile                      # multi-stage, distroless
├── docker-compose.yml              # local Mongo + agent against host kubeconfig
├── Makefile                        # tidy / build / run / image / deploy / logs
├── go.mod
└── README.md
```
