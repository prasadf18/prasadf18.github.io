---
title: "One Query, Four Ways: From 183 ms to 0.5 ms With the Right Index"
date: 2026-11-11
---

Most of the Postgres advice I had read said the same thing: add an index. It never said which kind of index, or how much difference the choice makes. So I took one query on a table of 3 million rows and tried it four ways on my own machine, writing down every number.

## The setup

A laptop with an Intel i7-8750H (12 threads), 32 GB of RAM and Windows 10. PostgreSQL 17.2 with the default settings, so `shared_buffers` is 128 MB. Nothing else was tuned.

The table is a fake orders table:

```sql
create table orders as
select g as id,
  (random()*50000)::int as customer_id,
  case when random()<0.02 then 'pending'
       when random()<0.5 then 'shipped'
       else 'delivered' end as status,
  (random()*500)::numeric(8,2) as amount,
  now() - (random()*365)*interval '1 day' as created_at
from generate_series(1,3000000) g;
alter table orders add primary key (id);
vacuum analyze orders;
```

The table takes up 184 MB. About 60,000 of the 3 million rows are `pending`, which is 2 percent. That detail matters later. Most real order tables look like this: a small number of rows that someone cares about and a huge pile of finished ones.

The query asks for the pending orders from the last week:

```sql
select count(*), sum(amount)
from orders
where status = 'pending'
  and created_at > now() - interval '7 days';
```

It returns around 1,200 rows worth of work. I ran each version 7 times with `EXPLAIN (ANALYZE)` and took the median of the reported execution time. Everything was in cache, so these are warm numbers.

## Round 1: no index

Postgres reads the whole table. It used a parallel sequential scan.

Median: 183.3 ms.

That is not terrible for 3 million rows, but if this query runs on every page load, it is a lot.

## Round 2: the index everyone would write

```sql
create index orders_status_created on orders (status, created_at);
```

Postgres switched to a bitmap index scan followed by a bitmap heap scan.

Median: 4.77 ms. The index is 103 MB.

That is about 38 times faster, and for most people this is where the story ends. But look at the size. The index is more than half the size of the table, and it holds entries for the 2.9 million rows I never ask about.

## Round 3: a partial index

```sql
create index orders_pending_created on orders (created_at)
where status = 'pending';
```

A partial index only contains the rows that match the `where` clause. Postgres can use it for any query that includes the same condition.

Median: 4.76 ms. The index is 1,336 kB.

The speed is the same as round 2, but the index is about 80 times smaller. Smaller means less to cache, less to write on every insert, and less for vacuum to walk through. For the cost of one `where` clause it is hard to argue against.

## Round 4: partial and covering

The query needs `amount` too, and the index above does not store it, so Postgres still visits the table for every matching row. I can store the column in the index with `include`:

```sql
create index orders_pending_cov on orders (created_at)
  include (amount)
where status = 'pending';
vacuum analyze orders;
```

Now the plan became an index only scan, and the explain output showed `Heap Fetches: 0` and `shared hit=7`. The whole query touched seven buffers.

Median: 0.467 ms. The index is 1,864 kB.

| Version | Median | Index size |
| --- | --- | --- |
| No index | 183.3 ms | none |
| (status, created_at) | 4.77 ms | 103 MB |
| Partial on created_at | 4.76 ms | 1.3 MB |
| Partial, covering amount | 0.467 ms | 1.8 MB |

## Things to be careful about

An index only scan depends on the visibility map. I ran `vacuum` before measuring, so `Heap Fetches` was zero. On a table with lots of recent updates, Postgres has to check the table for rows that are not marked as all visible, and you lose part of the win.

A partial index helps only queries that repeat its condition. If someone writes `status = 'Pending'` with a capital letter, or filters on a different status, this index is not used.

My numbers come from one machine, one table, one query and 7 runs each. The random data is evenly spread, which real data rarely is. I would not quote 183 ms or 0.467 ms to anyone. The ratios and the sizes are the part I would trust, and it is worth running the same test on your own table before you copy any of this.

## What I took from it

Before this I thought of an index as something I either had or did not have. Now I think about what it stores, and whether it needs to store everything. For a column where one value is rare and interesting, a partial index gave me the same speed in one eightieth of the space.
