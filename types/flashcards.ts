export type FlashcardSRS = {
  repetition: number; // number of successful reviews in a row
  intervalDays: number; // current interval in days
  easeFactor: number; // SM-2 ease factor (min 1.3)
  dueAt: string; // ISO date string when card is due next
  lapses: number; // number of failures
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  createdAt: string;
  updatedAt: string;
  srs?: FlashcardSRS;
};

export type FlashcardDeck = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  cards: Flashcard[];
};

export type FlashcardDeckMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  numCards: number;
  userId?: string;
};


