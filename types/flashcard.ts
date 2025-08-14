export interface Flashcard {
  id: string;            // unique id
  deck: string;          // deck name/category
  question: string;      // front content
  answer: string;        // back content
  source?: string;       // optional source text / snippet
  createdAt: string;     // ISO date
}

export interface FlashcardDeckSummary {
  deck: string;
  count: number;
  lastCreatedAt: string | null;
}

export interface FlashcardsListResponse {
  decks: FlashcardDeckSummary[];
  total: number;
}
