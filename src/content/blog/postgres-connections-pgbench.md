---
title: "How Many Connections Does Postgres Actually Want?"
date: 2026-11-11
---

Postgres starts with `max_connections = 100`, and a lot of people respond to slow apps by raising it. I wanted to see what happens to throughput as the number of clients grows, so I ran `pgbench` with 1, 4, 12, 32 and 64 clients and wrote down what came back.

## The machine

An Intel i7-8750H with 6 cores and 12 threads, 32 GB of RAM, Windows 10, PostgreSQL 17.2 with the default configuration. A streaming replica was running on the same laptop during the tests, and `pgbench` itself ran on the same machine as the server. That is a big caveat. The load generator and the database fight for the same CPU, so these are not numbers a real server would give.

I created a database with `pgbench -i -s 10`, which makes about 1 million rows in the accounts table. Each run lasted 20 seconds, and I ran each client count once.

## Test one: read only

This is the `-S` mode, which runs a single primary key `SELECT` per transaction.

| Clients | TPS | Average latency |
| --- | --- | --- |
| 1 | 6,924 | 0.144 ms |
| 4 | 23,585 | 0.170 ms |
| 12 | 41,303 | 0.291 ms |
| 32 | 42,859 | 0.747 ms |
| 64 | 42,390 | 1.510 ms |

Going from 1 to 4 clients, throughput rose by a factor of 3.4. Going from 4 to 12 it nearly doubled. After that, nothing. At 32 clients I got 42,859 TPS and at 64 clients 42,390, which is the same number within noise. The only thing that changed was latency, which doubled from 0.747 ms to 1.510 ms.

So adding more clients past about 12 did not buy more work. It made each query wait longer in line. With 12 hardware threads on this machine, the plateau landing near 12 clients is not a surprise.

## Test two: the default pgbench workload

The default script is a small TPC-B style transaction. Each one updates three tables and inserts into a history table, so it writes to disk.

| Clients | TPS | Average latency |
| --- | --- | --- |
| 1 | 934 | 1.071 ms |
| 4 | 2,831 | 1.413 ms |
| 12 | 5,038 | 2.382 ms |
| 32 | 5,637 | 5.677 ms |
| 64 | 4,964 | 12.893 ms |

The shape is the same, but the plateau is lower and the end is worse. The best result was 5,637 TPS at 32 clients, and at 64 clients throughput went down to 4,964 while latency was more than twice as high. More connections made the system both slower and less fair.

If I had to pick a pool size for this laptop from these results, it would be somewhere around 12 to 32. Past that I only get waiting.

## Why this happens

Every Postgres connection is a separate operating system process. When more processes want to run than there are cores, they wait for each other. Writes add more waiting on the write-ahead log and on row locks, so the write test suffers more than the read test.

This is why people put a pooler such as PgBouncer between the app and the database. The app can open thousands of connections to the pooler, and the pooler keeps a small number of real connections open to Postgres. I did not test PgBouncer here, so I cannot give you numbers for it. I only measured the part before it.

## What I would not conclude from this

A single run for each client count is not enough to say the difference between 32 and 64 clients is exact. I can say that the read test is flat from 12 to 64 clients and that the write test dropped at 64, but I have not repeated it enough to know how big the noise is.

Running the load generator on the same machine probably lowered all of my numbers. And Windows is not where most people run Postgres in production. Linux numbers could look quite different.

## What I took from it

My old idea was that more connections means more throughput. For this machine the data says there is a ceiling, and it is about the number of cores. After it, every extra connection is a cost with no benefit. Next time an app is slow, I will look at how many connections are active before I touch `max_connections`.
