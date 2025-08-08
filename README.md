## Oppie QCM Generator

Upload any PDF and generate high‑quality True/False QCM (5 propositions per question) using OpenAI. Built with Next.js App Router, Tailwind CSS, and a calm, fast UI.

### Quickstart

1. Create a `.env.local` in project root:

```bash
OPENAI_API_KEY=sk-your-key
```

2. Install and run:

```bash
pnpm i # or npm i / yarn
pnpm dev
```

Open `http://localhost:3000`.

### Notes
- PDF text extraction uses `pdf-parse`. Very large PDFs are truncated to the first ~12k characters for context.
- Output is validated and normalized; the UI can copy results, toggle answer visibility, and reset.


