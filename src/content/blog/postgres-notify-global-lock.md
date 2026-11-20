---
title: "The One Lock Hiding Behind Postgres LISTEN/NOTIFY"
date: 2026-11-20
---

I keep seeing two opposite claims about Postgres LISTEN/NOTIFY. One camp says it does not scale at all. The other says it scales fine if you use it right. Both sides have a blog post with numbers, so I read them side by side, read the docs, and tried to work out who is right. This is a research post. I did not run my own benchmarks here, so every number below comes from the sources I link at the end.

## What it is

NOTIFY lets one database session send a small message on a named channel. Any session that ran LISTEN on that channel gets the message. It is a cheap way to say "something changed, go look" without polling.

Two details from the docs matter later. A notification is only delivered when the sending transaction commits. And the payload has to be shorter than 8000 bytes, so the docs suggest sending a row key and reading the real data from a table.

## Where it goes wrong

A team at Recall.ai writes data to Postgres from tens of thousands of writers at once. In March 2025 their database stalled three times. The odd part was that CPU, disk and network all dropped while the load went up. Nothing was busy, everything was waiting.

They turned on `log_lock_waits` and found a huge queue of sessions all waiting for the same heavyweight lock during COMMIT. The lock was taken by transactions that had called NOTIFY. It is a database wide lock, so only one of those commits can go through at a time.

<figure>
<svg viewBox="0 0 720 300" role="img" aria-label="Three transactions queue for one global lock before committing" style="width:100%;height:auto;font-family:'Caveat','Segoe Print',cursive;">
<defs>
<filter id="rough1" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
<marker id="arr1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#1e1e1e" stroke-width="1.6"/></marker>
</defs>
<g filter="url(#rough1)" stroke="#1e1e1e" stroke-width="2" fill="none">
<rect x="20" y="40" width="130" height="60" rx="8" fill="#a5d8ff"/>
<rect x="20" y="120" width="130" height="60" rx="8" fill="#a5d8ff"/>
<rect x="20" y="200" width="130" height="60" rx="8" fill="#a5d8ff"/>
<rect x="240" y="100" width="210" height="100" rx="10" fill="#ffc9c9"/>
<rect x="520" y="60" width="60" height="50" fill="#ffec99"/>
<rect x="580" y="60" width="60" height="50" fill="#ffec99"/>
<rect x="640" y="60" width="60" height="50" fill="#ffec99"/>
<path d="M150 70 L238 130" marker-end="url(#arr1)"/>
<path d="M150 150 L238 150" marker-end="url(#arr1)"/>
<path d="M150 230 L238 172" marker-end="url(#arr1)"/>
<path d="M450 150 C490 150 490 120 518 105" marker-end="url(#arr1)"/>
</g>
<g fill="#1e1e1e" font-size="24" text-anchor="middle">
<text x="85" y="76">tx A</text>
<text x="85" y="156">tx B</text>
<text x="85" y="236">tx C</text>
<text x="345" y="143" font-size="24">one global lock</text>
<text x="345" y="172" font-size="18">held until commit is done</text>
<text x="550" y="92">A</text>
<text x="610" y="92">B</text>
<text x="670" y="92">C</text>
<text x="610" y="140" font-size="18">notification queue</text>
<text x="610" y="160" font-size="18">in commit order</text>
</g>
</svg>
<figcaption>Every transaction that sent a NOTIFY has to pass through the same door to commit.</figcaption>
</figure>

## Why the lock exists

This is the part I found most interesting, because the lock is there for a good reason.

Postgres promises that notifications arrive in the same order as the transactions that sent them committed. To keep that promise it keeps one global queue of outgoing notifications. A transaction has to add its notifications to that queue as part of committing.

The catch is that Postgres only knows the commit order once the commits are done, and a commit can take a variable amount of time. So the order has to be fixed before the commit finishes. The simple answer is a global lock that makes these commits go one after another. The DBOS team describes the lock as held until the commit is fully flushed to disk with fsync.

That also explains the missing CPU. Normally Postgres groups several commits into a single fsync, which is called group commit. With the lock in place that grouping cannot happen for these transactions. Each one pays for its own flush, in line, and the machine sits idle between them.

## The fix that DBOS used

The DBOS team hit the same wall while building streams on Postgres, where every chunk of an LLM response is a row and a trigger sent a NOTIFY for each write. They could not get past about 2.9 thousand writes a second, even on a big machine.

Their observation is that in many uses the notification is just a nudge. The real data lives in a table. So the nudge does not need to be perfectly ordered or perfectly durable. They buffer notifications in memory and send them in one batch, so the lock is taken once per flush and not once per write.

<figure>
<svg viewBox="0 0 720 270" role="img" aria-label="Comparison of notify on every write versus buffered notify" style="width:100%;height:auto;font-family:'Caveat','Segoe Print',cursive;">
<defs>
<filter id="rough2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
</defs>
<g filter="url(#rough2)" stroke="#1e1e1e" stroke-width="2">
<rect x="20" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="90" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="160" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="230" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="300" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="370" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="440" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="510" y="40" width="60" height="40" fill="#ffc9c9"/>
<rect x="20" y="150" width="400" height="22" rx="6" fill="#a5d8ff"/>
<rect x="60" y="180" width="400" height="22" rx="6" fill="#a5d8ff"/>
<rect x="100" y="210" width="400" height="22" rx="6" fill="#a5d8ff"/>
<rect x="540" y="150" width="70" height="82" fill="#ffc9c9"/>
</g>
<g fill="#1e1e1e" font-size="23">
<text x="20" y="28">notify on every write</text>
<text x="20" y="102" font-size="20">each commit waits, one at a time</text>
<text x="20" y="138">buffered notify</text>
<text x="20" y="254" font-size="20">writes overlap and share fsyncs</text>
<text x="520" y="142" font-size="20">one flush</text>
<text x="520" y="252" font-size="20">one lock</text>
</g>
</svg>
<figcaption>Red is time spent holding the global lock. Blue is normal writes.</figcaption>
</figure>

There is one new problem with this. If the process crashes while notifications sit in the buffer, those nudges are lost. Their answer is for readers to also poll the table every so often, slowly, as a safety net. Since the table is the source of truth, a late nudge costs a little latency and nothing else.

<figure>
<svg viewBox="0 0 720 300" role="img" aria-label="Writer inserts into a table and sends buffered pings to a reader that also polls" style="width:100%;height:auto;font-family:'Caveat','Segoe Print',cursive;">
<defs>
<filter id="rough3" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
<marker id="arr3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#1e1e1e" stroke-width="1.6"/></marker>
</defs>
<g filter="url(#rough3)" stroke="#1e1e1e" stroke-width="2" fill="none">
<rect x="20" y="110" width="130" height="70" rx="8" fill="#a5d8ff"/>
<rect x="540" y="110" width="160" height="70" rx="8" fill="#b2f2bb"/>
<rect x="250" y="20" width="220" height="70" rx="8" fill="#ffec99"/>
<rect x="250" y="200" width="220" height="70" rx="8" fill="#d0bfff"/>
<path d="M120 110 C150 70 200 55 248 55" marker-end="url(#arr3)"/>
<path d="M150 160 C190 200 210 232 248 235" marker-end="url(#arr3)"/>
<path d="M470 235 C520 232 560 210 580 182" stroke-dasharray="8 7" marker-end="url(#arr3)"/>
<path d="M600 110 C570 70 520 55 472 55" marker-end="url(#arr3)"/>
</g>
<g fill="#1e1e1e" font-size="24" text-anchor="middle">
<text x="85" y="152">writer</text>
<text x="620" y="152">reader</text>
<text x="360" y="52" font-size="26">table</text>
<text x="360" y="78" font-size="20">the real data lives here</text>
<text x="360" y="232" font-size="26">notify buffer</text>
<text x="360" y="258" font-size="20">flushed in batches</text>
<text x="190" y="104" font-size="20">1. insert row</text>
<text x="165" y="226" font-size="20">2. queue a ping</text>
<text x="575" y="270" font-size="19">3. ping wakes reader</text>
<text x="635" y="50" font-size="19">4. reader reads the row</text>
<text x="640" y="212" font-size="18">also polls slowly,</text>
<text x="640" y="232" font-size="18">in case a ping is lost</text>
</g>
</svg>
<figcaption>The ping only says "look". The table has the answer.</figcaption>
</figure>

With this change they report up to 60 thousand stream writes a second, about 20 times more than before, with latency in the range of 15 to 100 milliseconds. At that point the Postgres CPU is fully used, which is what you would hope to see. The database is busy and no longer waiting.

## Is it fixed in Postgres now?

I could not get a clean answer, and I think that is the honest finding.

Recall.ai added an update to the top of their post saying a commit in Postgres core eliminated the bottleneck. DBOS wrote later that a patch going into Postgres 19 does not remove the global lock. They say it speeds up a narrower case, where there are many channels and each listener waits on only one of them.

Both can be true if they are talking about different changes. I did not read the Postgres source to settle it, so I would not rely on either claim. If you plan to use NOTIFY on a busy write path, test it on your own version with many concurrent writers.

## What I take from this

NOTIFY is fine for small things, like telling a few workers that there is a new job. The trouble starts when every write on a hot table fires one. If you do that, you are choosing to make those commits wait for each other.

If you can treat the ping as a hint and keep the real state in a table, batching the pings and polling slowly as a backup looks like a safe pattern. Also, if a database looks slow while CPU and disk are quiet, check for lock waits before you buy a bigger machine. `log_lock_waits` was what cracked the case for Recall.ai.

I learned most from this by reading why the lock exists. The ordering promise sounds like a small feature, and it ends up shaping how the whole commit path behaves.

## Sources

- Recall.ai, [Postgres LISTEN/NOTIFY does not scale](https://www.recall.ai/blog/postgres-listen-notify-does-not-scale)
- DBOS, [Postgres LISTEN/NOTIFY Can Actually Scale](https://dbos.dev/blog/postgres-listen-notify-scalability)
- PostgreSQL docs, [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
