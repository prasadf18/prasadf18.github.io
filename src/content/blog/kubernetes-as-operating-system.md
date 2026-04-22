---
title: "Kubernetes: The Operating System of Distributed Systems"
date: 2026-04-14
---

Kubernetes has become the default platform for running modern cloud-native applications. It sits underneath most scalable systems today—quietly managing how services run, scale, recover, and communicate.

At its core, Kubernetes is not just a container orchestrator. It is a declarative system for managing distributed systems at scale.

---

## What is Kubernetes?

:contentReference[oaicite:0]{index=0} is an open-source platform that automates the deployment and management of containerized applications.

Instead of manually running servers or containers, you define:

> “This is what my system should look like.”

Kubernetes ensures the system continuously matches that desired state.

---

## Why Kubernetes Matters

Before Kubernetes, scaling systems looked like:

- Manually provisioning servers
- Running containers with scripts
- Handling failures manually
- Writing custom deployment logic

This quickly becomes unmanageable at scale.

Kubernetes solves this by introducing:

- Declarative configuration
- Automated scheduling
- Self-healing systems
- Built-in scaling and networking

---

## The Core Idea: Desired State

Kubernetes operates on a simple but powerful concept:

> You declare the desired state. Kubernetes makes reality match it.

For example:

- “Run 5 replicas of my API”
- “Ensure this service is always available”
- “Restart failed containers automatically”

This loop is called the **reconciliation loop**.

---

## Core Components of Kubernetes

### 1. Pods

A Pod is the smallest deployable unit.

- Runs one or more containers
- Shares networking and storage
- Ephemeral by design

Think of it as:

> A single running instance of your application

---

### 2. Deployments

A Deployment defines how your application behaves.

- Number of replicas
- Update strategy
- Rollback behavior

Example:

> “Always run 3 instances of my backend service.”

---

### 3. Services

Services expose Pods reliably.

Because Pods can die and restart, Services provide a stable endpoint.

Types:

- ClusterIP (internal)
- NodePort (node-level access)
- LoadBalancer (external traffic)

---

### 4. Nodes

Nodes are the machines where workloads run.

- Can be physical or virtual
- Managed by Kubernetes
- Host Pods

---

### 5. Control Plane

The control plane is the brain of Kubernetes.

It handles:

- Scheduling workloads
- Maintaining cluster state
- Managing scaling decisions
- Ensuring system health

---

## How Kubernetes Works Internally

At a high level, Kubernetes runs a continuous loop:

1. You define desired state (YAML files)
2. Kubernetes stores it
3. Controllers observe actual state
4. If mismatch → system corrects it

This continuous process ensures reliability and self-healing behavior.

---

## Example Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: node:20
          ports:
            - containerPort: 3000