# 🎤 Quick Start: Voice Input with AWS Transcribe

Get voice input with barge-in working in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- AWS account with access to Transcribe
- Backend and database already running

## Step 1: Get AWS Credentials (2 minutes)

### Option A: Use IAM User (Quick)

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → "Create user"
3. Name: `rabbit-ai-transcribe-demo`
4. Click "Next"
5. Attach policy: `AmazonTranscribeFullAccess`
6. Click "Next" → "Create user"
7. Click on the created user → "Security credentials"
8. Click "Create access key"
9. Select "Application running outside AWS"
10. Copy the **Access Key ID** and **Secret Access Key**

### Option B: Use Existing Credentials

If you already have AWS credentials:
- Access Key ID
- Secret Access Key

## Step 2: Configure Frontend (1 minute)

```bash
cd frontend
```

Create `.env.local`:

```bash
cat > .env.local << 'EOF'
# AWS Transcribe Configuration
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_HERE
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY_HERE

# WebSocket Backend URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
EOF
```

Replace `YOUR_ACCESS_KEY_HERE` and `YOUR_SECRET_KEY_HERE` with your actual credentials.

## Step 3: Verify Installation (1 minute)

Check that AWS SDK is installed:

```bash
cd frontend
npm list @aws-sdk/client-transcribe-streaming
```

Should show:
```
@aws-sdk/client-transcribe-streaming@3.x.x
```

If not installed:
```bash
npm install @aws-sdk/client-transcribe-streaming
```

## Step 4: Start the App (1 minute)

```bash
# From project root
npm run dev
```

This starts:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Step 5: Test Voice Input (30 seconds)

1. Open http://localhost:3000 in your browser
2. Click the **microphone button** (🎤)
3. Allow microphone access when prompted
4. Say: **"映画を教えて"** (Recommend a movie)
5. Watch:
   - Interim transcripts appear in real-time
   - Final transcript is sent automatically
   - AI responds with movie recommendations

## Step 6: Test Barge-In (30 seconds)

1. While AI is speaking (audio playing)
2. Click the microphone button again
3. Say: **"アニメ映画"** (Anime movie)
4. Observe:
   - Current audio stops immediately ✋
   - Your voice is transcribed
   - New response starts

**Success!** You just interrupted the AI mid-sentence! 🎉

## Troubleshooting

### "AWS credentials not configured"

**Problem:** Browser console shows credentials warning

**Solution:**
1. Check `.env.local` exists in `frontend/` directory
2. Verify credentials are correct (no quotes, no spaces)
3. Restart frontend server: `npm run dev`

### "Microphone access denied"

**Problem:** Browser blocks microphone access

**Solution:**
1. Click the lock icon in address bar
2. Allow microphone access
3. Reload the page
4. Try again

### No transcription appears

**Problem:** Microphone button works but no text appears

**Debug steps:**
1. Open browser console (F12)
2. Look for `🎙️ AWS Transcribe...` logs
3. Check for errors

**Common issues:**
- Wrong AWS region (use `us-west-2` for Japanese)
- Invalid credentials
- IAM permissions missing

### Audio doesn't stop on barge-in

**Problem:** Interrupting doesn't stop current audio

**Debug steps:**
1. Check browser console for `🔇 BARGE-IN:` log
2. Verify `audioPlayer.isPlaying` is true when interrupting
3. Check final transcript is being received (`isFinal=true`)

**Solution:** Make sure you speak loud enough for final transcript to trigger

## Cost Estimation

AWS Transcribe Streaming costs **$0.024 per minute** (~$1.44/hour).

**Example demo usage:**
- 1 hour of testing = **$1.44**
- 10 hours of testing = **$14.40**

**Tips to save costs:**
- Stop transcription when not speaking (button stops it)
- Test in short sessions
- Use IAM policies to set budget limits

## Next Steps

### Learn More

📘 Read the full documentation: [AWS_TRANSCRIBE_SETUP.md](./AWS_TRANSCRIBE_SETUP.md)

Topics covered:
- Architecture details
- Production security (AWS Cognito)
- Cost optimization
- API reference
- Browser compatibility

### Production Setup

**⚠️ Current setup is DEMO only!**

For production:
1. Implement AWS Cognito Identity Pools
2. Use temporary credentials (1-hour expiry)
3. Add rate limiting
4. Monitor usage and costs

See [Production Security](./AWS_TRANSCRIBE_SETUP.md#production-security) in full docs.

### Optimize Performance

1. **Add client-side VAD** - Only stream when speaking (saves ~60% cost)
2. **Tune thresholds** - Adjust sensitivity for your environment
3. **Connection pooling** - Reuse connections when possible

### Explore Features

Try these commands:
- "おすすめの映画を教えて" - Get movie recommendations
- "宮崎駿の映画" - Movies by Hayao Miyazaki
- "アニメ映画でコメディ" - Anime comedies
- Interrupt any time by clicking mic!

## Common Questions

**Q: Why frontend-direct instead of backend proxy?**

A: For demo purposes, it's simpler. In production, you'd use AWS Cognito for temporary credentials. Frontend-direct also has ~100ms lower latency.

**Q: Can I use different AWS region?**

A: Yes, but use `us-west-2` or `ap-northeast-1` for best Japanese support.

**Q: How do I switch back to Web Speech API?**

A: The old Web Speech API code was replaced. To revert, checkout the previous git commit before this integration.

**Q: Does this work on mobile?**

A: Yes! Works on iOS Safari, Android Chrome, etc. One advantage over Web Speech API.

**Q: What about privacy/security?**

A: Audio is sent to AWS (similar to Alexa). For privacy-sensitive apps, consider:
- On-device STT (Whisper.cpp)
- Self-hosted Vosk
- Web Speech API (sends to Google)

## Support

Having issues? Check:

1. 📘 [Full Documentation](./AWS_TRANSCRIBE_SETUP.md)
2. 🐛 [Troubleshooting Section](#troubleshooting)
3. 🔍 Browser console for error messages

## Summary Checklist

- [ ] AWS credentials obtained
- [ ] `.env.local` created with credentials
- [ ] Frontend server restarted
- [ ] Microphone access granted
- [ ] Voice input works
- [ ] Barge-in works (interrupts audio)
- [ ] Real-time transcripts appear

**All checked?** You're all set! 🚀 Enjoy your voice-enabled AI assistant!
