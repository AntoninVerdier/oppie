export type GeneratedProposition = {
  statement: string;
  isTrue: boolean;
  explanation: string;
};

export type GeneratedQuestion = {
  id: string;
  topic: string;
  rationale?: string;
  propositions: GeneratedProposition[]; // length 5
};



