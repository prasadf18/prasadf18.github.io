---
title: "What Postgres Tells You About Itself"
date: 2026-11-11
---

Postgres keeps a lot of statistics about its own work. You can read them with plain SQL. While building pg-insights I ran it against a test server and a few of the numbers surprised me.

## Counters only go up

The view `pg_stat_database` keeps running totals: commits, rollbacks, blocks read from disk, blocks found in memory. A total does not tell you how busy the server is right now.

To get transactions per second, you read the counters twice and divide the difference by the seconds between the readings. pg-insights does this every 5 seconds.

There is one catch. If someone runs `pg_stat_reset()`, the counters drop back to zero. A naive subtraction then gives a big negative number, so a reading where any counter went down is skipped.

## The cache hit ratio was low

The cache hit ratio is the share of block reads that were found in Postgres's own memory. Busy transactional databases usually stay above 99 percent.

My test database showed about 50 percent. The data was around 300 MB and the default `shared_buffers` is 128 MB, so it could not all fit. The dashboard marked it as low, and that was correct.

## Dead rows after a reset

When a row is updated or deleted, Postgres keeps the old version until autovacuum cleans it up. The view `pg_stat_user_tables` counts live and dead rows for each table.

After I called `pg_stat_reset()` on the test server, the live row counts were zero while updates kept adding dead rows. Every table looked 100 percent dead. Running `VACUUM ANALYZE` put the estimates back. The numbers are estimates that Postgres keeps up to date, and they can be wrong.

## The dashboard listed itself

`pg_stat_statements` ranks queries by how much time they use. Postgres replaces the values with `$1`, `$2` and so on, so the same query with different values counts as one entry.

My first version showed its own monitoring queries in the list. The fix was to start every statement the dashboard sends with a comment, `/* pg-insights */`, and leave those out of the results. You also need to add `pg_stat_statements` to `shared_preload_libraries` and restart before the view exists. If it is missing, the page now says so and shows the steps.

## Replication

On a primary, `pg_stat_replication` lists each replica, how many bytes behind it is, and how long it takes to replay changes. My test replica was about half a millisecond behind. That is a tiny local test, so it says little about a real network.

None of this needs special tools. It is all in the system views, and the next step is to learn which numbers matter before something breaks.
