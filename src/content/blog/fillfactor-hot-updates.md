---
title: "Why My Table Grew From 81 MB to 322 MB: Fillfactor and HOT Updates"
date: 2026-11-11
---

I made a table with 1 million small rows, updated every row three times, and watched it grow to four times its starting size. Then I did the same thing with one setting changed and it grew less than three times, and the updates ran several times faster. This post is about that setting, `fillfactor`, and the thing it enables, called HOT updates.

## What happens when you update a row

Postgres never changes a row in place. An update writes a new version of the row and leaves the old one behind until vacuum removes it. If the table has indexes, the new version usually needs new entries in all of them too, even when the column you changed is not indexed.

There is a shortcut called a heap-only tuple update, or HOT. If the changed column is not in any index and the new row version fits on the same 8 kB page as the old one, Postgres can skip the index entries entirely. That is cheaper to write and cheaper to clean up.

The catch is the second condition. A page that is completely full has no room for the new version. `fillfactor` tells Postgres to leave some free space on each page when it first inserts rows, so there is room for it.

## The experiment

The same laptop as before (i7-8750H, 32 GB, Windows 10, PostgreSQL 17.2, default settings). Two tables, identical except for fillfactor. I turned autovacuum off for both, so that vacuum would not change the result while I was measuring.

```sql
create table t100 (id int primary key, counter int not null, note text)
  with (fillfactor=100, autovacuum_enabled=false);
create table t70 (id int primary key, counter int not null, note text)
  with (fillfactor=70, autovacuum_enabled=false);

insert into t100 select g, 0, repeat('x',40) from generate_series(1,1000000) g;
-- same for t70
```

Then three rounds of this on each table:

```sql
update t100 set counter = counter + 1;
```

The `counter` column has no index. Only `id` does.

## The results

| | fillfactor 100 | fillfactor 70 |
| --- | --- | --- |
| Size at start | 81 MB | 117 MB |
| Size after 3 rounds | 322 MB | 236 MB |
| HOT updates, of 3,000,000 | 93 | 1,974,400 |
| Time, round 1 | 10.6 s | 6.5 s |
| Time, round 2 | 33.4 s | 5.5 s |
| Time, round 3 | 34.4 s | 6.8 s |

The fillfactor 70 table started 44 percent bigger, because it left 30 percent of each page empty. But after three rounds of updates it was smaller, 236 MB against 322 MB. In the full table nearly every update had to find a new page, so only 93 out of 3 million were HOT. In the table with free space, about two thirds of them were.

The timings need a warning. The first table got slower from 10.6 seconds to over 33 seconds in the later rounds, and I did not investigate why. My guess is that the extra writes to the data files and the write-ahead log hit checkpoints, but that is a guess and I have not checked it. I also ran each round once, so I would not claim a precise speedup. What I can say is that the fillfactor 70 table was consistently between 5 and 7 seconds in all three rounds and the other was not.

## Vacuum does not shrink the table

After the three rounds I ran a plain `VACUUM` on each table. The size did not change, 322 MB and 236 MB. This surprised me at first. Vacuum marks the space from dead row versions as reusable, but it does not return it to the operating system, except for empty pages at the very end of the file. When I ran one more round of updates, the size stayed the same, because the new versions went into the space vacuum had freed.

That is the intended behavior, and it means a table will settle at a size that reflects its busiest moment. If you want the file to actually shrink, you need `VACUUM FULL` or a tool like `pg_repack`, and both come with locking costs. I did not test those.

## When I would use it

Lowering fillfactor makes sense for a table with many updates to columns that are not indexed, like counters, status flags and timestamps. It does not help for tables that are only ever inserted into, and it makes every scan read more pages. The 117 MB against 81 MB at the start is a real price.

The way to know is to watch two numbers. `n_tup_hot_upd` against `n_tup_upd` in `pg_stat_user_tables` tells you how many of your updates are HOT. If that ratio is close to zero on a table with a heavy update load, free space on the page is probably the reason. This is one of the checks my pg-insights dashboard is missing, and I want to add it.

## Limits of this test

One table shape, one run per round, autovacuum disabled on purpose, and a laptop with a replica running in the background. With autovacuum on, the real behavior would be somewhere between the two tables, because cleanup would happen along the way. The size numbers come from `pg_table_size`, which includes TOAST data and the free space map but not the indexes.
