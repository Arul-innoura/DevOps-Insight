# Convenience targets for local dev, container build, and AKS deploy.
# Override variables on the CLI: `make image IMG=myrepo/k8s-cost-agent:v1`

IMG ?= k8s-cost-agent:dev
NS  ?= k8s-cost-agent

.PHONY: tidy build run image kind-load deploy undeploy logs port-forward

tidy:
	go mod tidy

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/agent ./cmd/agent

# Run against your current kubeconfig context (out-of-cluster mode).
# Point AGENT_MONGODB_URI at your local Mongo or the same Atlas the backend uses.
run: build
	AGENT_KUBECONFIG=$$HOME/.kube/config \
	AGENT_MONGODB_URI=$${AGENT_MONGODB_URI:-mongodb://localhost:27017} \
	AGENT_MONGODB_DATABASE=$${AGENT_MONGODB_DATABASE:-devops_portal} \
	AGENT_COLLECT_INTERVAL=60s \
	AGENT_HTTP_ADDR=:8090 \
	./bin/agent

image:
	docker build -t $(IMG) .

# Load image into a local kind cluster (skip for AKS — push to ACR instead).
kind-load:
	kind load docker-image $(IMG)

deploy:
	kubectl apply -f deploy/namespace.yaml
	kubectl apply -f deploy/rbac.yaml
	kubectl apply -f deploy/configmap.yaml
	kubectl -n $(NS) set image deployment/k8s-cost-agent agent=$(IMG) --record || true
	kubectl apply -f deploy/deployment.yaml
	kubectl apply -f deploy/service.yaml
	kubectl -n $(NS) rollout status deployment/k8s-cost-agent --timeout=120s

undeploy:
	kubectl delete -f deploy/ --ignore-not-found

logs:
	kubectl -n $(NS) logs -l app=k8s-cost-agent --tail=200 -f

port-forward:
	kubectl -n $(NS) port-forward svc/k8s-cost-agent 8090:8090
