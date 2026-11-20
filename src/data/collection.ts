// Edit this file to add to your collection.
// status can be "watching" / "reading", "finished", or "plan to"
export type Item = { title: string; status?: string; note?: string };

export const collection: { title: string; note: string; items: Item[] }[] = [
  {
    title: "anime",
    note: "what I watch",
    items: [{ title: "Naruto" }],
  },
  {
    title: "manga",
    note: "what I read",
    items: [{ title: "Vagabond" }],
  },
  {
    title: "manhwa",
    note: "Korean comics I read",
    items: [],
  },
];
