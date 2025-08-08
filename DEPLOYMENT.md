# 🚀 Deploying Oppie to Vercel

## Option 1: Web Interface (Recommended)

1. **Visit [vercel.com](https://vercel.com)**
2. **Sign up/Login with GitHub**
3. **Click "New Project"**
4. **Import repository: `AntoninVerdier/oppie`**
5. **Configure environment variables:**
   - `OPENAI_API_KEY`: Your OpenAI API key
6. **Click "Deploy"**

## Option 2: CLI (Alternative)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

## Environment Variables

Make sure to set these in Vercel dashboard:
- `OPENAI_API_KEY`: Your OpenAI API key
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` (when using Vercel KV)

## Custom Domain Setup

1. **In Vercel dashboard, go to your project**
2. **Click "Settings" → "Domains"**
3. **Add your domain: `oppie.ovh`**
4. **Follow DNS instructions**

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Troubleshooting

- **Build errors**: Check `vercel.json` configuration
- **API errors**: Verify `OPENAI_API_KEY` is set
- **Domain issues**: Check DNS settings in your domain provider
- **Read-only FS errors (EROFS)**: Ensure Vercel KV is connected; persistence uses KV in production
