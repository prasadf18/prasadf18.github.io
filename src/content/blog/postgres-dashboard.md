---
title: "I Built a Small Dashboard for Postgres"
date: 2026-11-11
---

I want to get deeper on databases, and reading the docs only takes me so far. So I built something with Postgres: a small dashboard that shows how a database is doing. It is called pg-insights and the code is on GitHub at github.com/prasadf18/pg-insights.

## What it shows

The page has five parts.

An overview with connections, cache hit ratio, size and uptime. Four charts for transactions per second, connections, cache hit ratio and disk reads. A table of the biggest tables with their dead rows and scan counts. A list of the slowest queries. And replication lag for any replicas.

All of it comes from Postgres system views, and the server only ever runs SELECT statements.

## How it is put together

The server is Node.js with TypeScript. The page is React with TypeScript, TanStack Query for fetching, and Recharts for the charts.

One shared file describes the shape of the data. The server fills it in from Postgres, and in demo mode the browser fills it in with made up numbers. The page does not know which one it is talking to. That is what lets the demo run on GitHub Pages with no server and no database. A banner on the page says the numbers are not real.

## How I checked it

There are 43 tests. Some cover the maths and the sorting, some cover the whole page, and four run the real SQL against a Postgres server.

I also started a PostgreSQL 17 server with a streaming replica and ran a pgbench workload against it. The screenshot in the readme is that real server.

I built it together with an AI coding assistant, Claude Code. The next two posts are about what the numbers taught me, and about making a dashboard work for people who cannot see the charts.
