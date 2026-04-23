---
title: "The Browser's Layered Stack: What Really Happens Between a URL and a Pixel"
date: 2026-04-23
---

You type a URL and pixels appear. In between, a browser orchestrates one of the most complex software pipelines in existence — a layered stack of specialized engines, each with a distinct job, each feeding the next.

Most developers know fragments of this: "the DOM", "reflow", "the render tree". This post assembles those fragments into a single coherent mental model.

## The Mental Model: A Factory Line of Specialists

Think of the browser not as one program, but as a factory line. Raw material (bytes from the network) enters one end. A finished frame (pixels on screen) exits the other. Between them, six specialized stages transform the data, each stage speaking a different language than the one before it.

```
Bytes → Characters → Tokens → Nodes → DOM/CSSOM → Render Tree → Layout → Paint → Composite
```

No stage can skip another. Each has its own data structure, its own failure modes, and its own performance budget.

---

## Stage 1: The Network Stack — Fetching Bytes

Before any parsing begins, the browser must retrieve the resource. This is not simple.

A modern browser fetch involves:

- **DNS resolution** — translating the hostname to an IP
- **TCP handshake** — establishing a reliable connection
- **TLS handshake** — negotiating encryption (for HTTPS)
- **HTTP/2 or HTTP/3 framing** — multiplexing multiple requests over one connection

The key insight here is **head-of-line blocking**. In HTTP/1.1, requests on the same connection queue — one slow resource stalls everything behind it. HTTP/2 solves this with multiplexing. HTTP/3 solves it more completely by moving to QUIC (UDP-based), so packet loss on one stream doesn't freeze others.

> Mental model: the network stack is a negotiation layer. Its job is to get bytes to the parser as fast as possible, regardless of what those bytes contain.

---

## Stage 2: The HTML Parser — Building the DOM

Bytes arrive as a stream. The HTML parser processes them **incrementally** — it does not wait for the full document before starting work. This is a deliberate design choice that enables progressive rendering.

The parser runs two sub-stages:

**Tokenization** — the raw character stream is broken into HTML tokens: start tags, end tags, attributes, text nodes, comments.

**Tree construction** — tokens are consumed by a state machine that builds the **Document Object Model (DOM)** — a tree of node objects.

```
<html>
  <body>
    <p>Hello</p>
  </body>
</html>
```

Becomes:

```
Document
└── html
    └── body
        └── p
            └── "Hello" (TextNode)
```

### Parser-blocking resources

The parser has one critical vulnerability: `<script>` tags without `async` or `defer` **halt parsing entirely**. The browser must fetch, parse, and execute the script before continuing — because scripts can call `document.write()` and rewrite the document mid-parse.

This is why render-blocking JavaScript is such a significant performance concern, and why `defer` (execute after parsing) and `async` (execute as soon as fetched, in any order) exist.

---

## Stage 3: The CSS Engine — Building the CSSOM

In parallel with HTML parsing, the browser parses CSS into the **CSS Object Model (CSSOM)** — a separate tree representing all style rules.

```
body { font-size: 16px; }
p    { color: #333; }
```

Becomes a map of selectors to computed style declarations.

The CSSOM is **render-blocking**: the browser will not build the render tree until the full CSSOM is constructed. Partial styles would cause visual flicker — a partially-styled page flickering into fully-styled as rules arrive. The browser avoids this by waiting.

> Mental model: the DOM is structural, the CSSOM is presentational. You need both before you can describe what anything looks like.

---

## Stage 4: Style Calculation — Merging the Trees

With both trees ready, the browser runs **style calculation**: for every DOM node, it determines the final computed style by:

1. Collecting all matching CSS rules
2. Sorting them by **specificity** and **source order**
3. Applying the **cascade** — resolving conflicts between rules
4. Inheriting values from parent nodes where applicable

The result is a **computed style** for every node — not the raw CSS you wrote, but the final resolved values (`font-size: 16px`, not `1em`).

This is also where the browser builds the **Render Tree**: a new tree containing only the nodes that will be painted (so `display: none` nodes are excluded entirely), each annotated with their computed styles.

---

## Stage 5: Layout — Geometry in Abstract Space

The render tree describes *what* to paint but not *where*. The **layout engine** (historically called "reflow") computes the exact position and size of every element — in logical units, not pixels yet.

This is where the browser evaluates:

- The **box model** — margin, border, padding, content area
- **Flow layout** — block elements stack vertically, inline elements flow horizontally
- **Flexbox and Grid** — constraint-based layout algorithms
- **Percentage values** — resolved relative to their containing block

Layout is expensive because it is **recursive**. A change to a parent can cascade down to reposition every child. A change to a child's size can bubble up and reflow the parent. This is why adding a single element to the DOM can trigger a full-page reflow in poorly structured layouts.

> Mental model: layout is a constraint solver. Every element negotiates its geometry with its neighbors and ancestors until the system reaches a stable state.

---

## Stage 6: Paint — Instructions, Not Pixels

Layout produces geometry. **Paint** translates that geometry into **display lists** — ordered lists of drawing instructions.

Not actual pixels yet. Instructions like:

```
drawRect(x: 0, y: 0, w: 320, h: 48, color: #fff)
drawText("Hello", x: 16, y: 24, font: 16px sans-serif)
drawBorder(...)
```

The browser separates the page into **layers** at this stage. Elements with `will-change`, `transform`, `opacity`, or `position: fixed` are promoted to their own compositor layer. This is intentional — isolated layers can be updated without repainting the rest of the page.

---

## Stage 7: Compositing — The GPU Takes Over

The final stage moves off the CPU entirely. The **compositor thread** takes each layer's paint output, rasterizes it into bitmaps, uploads them to the **GPU**, and composites them together into the final frame.

This is why GPU-accelerated CSS properties (`transform`, `opacity`) are so much cheaper than properties that trigger layout or paint (`width`, `top`, `background-color`). Moving an element with `transform: translateX()` only happens on the compositor thread — no layout recalculation, no repaint, no main thread involvement.

```
transform: translateX(100px)  →  compositor only       ✓ cheap
left: 100px                   →  layout + paint + composite  ✗ expensive
```

---

## Putting It Together: The Critical Rendering Path

The sequence from URL to first painted frame is called the **Critical Rendering Path**:

```
Network → HTML parse → DOM
                    ↘
       CSS parse → CSSOM
                    ↓
             Style calculation
                    ↓
                  Layout
                    ↓
                  Paint
                    ↓
               Composite → Frame
```

Optimizing for performance means shortening this path:

- Minimize render-blocking CSS and JavaScript
- Reduce layout thrashing (reading then writing DOM geometry in loops)
- Promote animated elements to their own compositor layers
- Prioritize above-the-fold resources so the first frame arrives quickly

---

## The Three Thread Model

Modern browsers run the rendering pipeline across multiple threads:

- **Main thread** — parses HTML/CSS, runs JavaScript, handles layout and paint
- **Compositor thread** — composites layers, handles scrolling and CSS animations independently of the main thread
- **Raster threads** — rasterize paint instructions into bitmaps, often using the GPU

This separation is why smooth scrolling survives a janky JavaScript computation. The compositor thread keeps scrolling at 60fps even if the main thread is busy — as long as the scroll doesn't trigger layout.

---

## Summary

The browser stack is not one system — it is a pipeline of specialists. Each stage transforms its input into a richer representation: bytes → tokens → trees → geometry → instructions → pixels.

Understanding where each transformation happens tells you exactly where performance problems originate. Layout thrash? Stage 5. Render-blocking scripts? Stage 2. Janky animations? You're triggering Stage 5 and 6 instead of staying in Stage 7.

The browser is opinionated about this pipeline. Work with it, not against it.