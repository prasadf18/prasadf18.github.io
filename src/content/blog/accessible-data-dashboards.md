---
title: "Making a Data Dashboard Work Without Seeing the Charts"
date: 2026-11-11
---

A chart is a picture. Someone using a screen reader gets nothing from a picture of a line. I wanted pg-insights to work for them too, so I treated that as part of the build and not as something to fix later.

## Give the chart a text summary

Each chart sits in a box with a text label that screen readers read out: the title, the latest value, the lowest, the highest, and how many readings there are. For example, "Connections. Latest 10, lowest 10, highest 11, over 90 readings."

## Let people swap the chart for a table

Every chart has a "Show as table" button. It replaces the picture with a real table of the newest readings. This helps people using screen readers, and it also helps anyone who wants the exact numbers.

## Make tables easy to use

Every table has a caption. The sortable column headers are real buttons, so the keyboard works, and the sorted column says whether it is ascending or descending with `aria-sort`. The filter boxes have labels. A line under each table says how many rows are showing out of the total, and screen readers announce it when it changes.

## Do not rely on colour

A health badge on the page is green, yellow or red, but it also says "Healthy", "Lower than usual" or "Low". The rows that need vacuuming say "Needs vacuum" in words.

## The small things

The page has a skip link, landmark regions and one heading structure. The focus outline is thick and easy to see. Dark mode follows the system setting. When the system asks for reduced motion, animations stop.

## Testing it

The tests find things the way a screen reader would, by role and by name. One test clicks a column header and checks that the rows reorder and that `aria-sort` changes. Another checks that the error message has the alert role and a retry button. If a button loses its label, the test fails.

## What I have not done

I have not used it with a real screen reader, and I have not run a full contrast audit. This is a first pass built on good habits, and it needs real testing with people who rely on these tools. If you try it and something is wrong, please open an issue on GitHub.
