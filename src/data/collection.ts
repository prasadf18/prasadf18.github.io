// Edit this file to add to your collection.
// status can be "watching" / "reading", "finished", or "plan to"
export type Item = { title: string; status?: string; note?: string };

export const collection: { title: string; note: string; items: Item[] }[] = [
  {
    title: "anime",
    note: "what I watch",
    items: [
      { title: "Naruto" },
      { title: "One Piece" },
      { title: "Attack on Titan" },
      { title: "Dragon Ball Z" },
      { title: "Fullmetal Alchemist" },
      { title: "Fairy Tail" },
    ],
  },
  {
    title: "manga",
    note: "what I read",
    items: [{ title: "Vagabond" }],
  },
  {
    title: "manhwa",
    note: "Korean comics I read",
    items: [
      { title: "Solo Leveling" },
      { title: "Eleceed" },
      { title: "Drawn Sword" },
      { title: "Ataza" },
    ],
  },
];
