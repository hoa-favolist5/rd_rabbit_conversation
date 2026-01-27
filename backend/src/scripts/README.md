# Backend Scripts

## Generate Short Waiting Audio

### Purpose
Generates short acknowledgment sounds (< 1s) using Google TTS with the same voice as the main responses for voice consistency.

### Usage

```bash
# From backend directory
npm run generate:short-waiting

# Or from root directory
cd backend && npm run generate:short-waiting
```

### What It Does

1. **Generates 10 audio files** (`0.mp3` to `9.mp3`) in `frontend/public/waiting-short/`
2. **Uses same TTS voice** as main responses (Google TTS, ja-JP-Neural2-B)
3. **Uses "speaking" emotion** for consistent voice parameters (speakingRate: 1.0, pitch: 0.0)

### Audio Files Generated

| File | Text | Meaning |
|------|------|---------|
| 0.mp3 | ああ | ah (acknowledgment) |
| 1.mp3 | うん | un (yes/acknowledgment) |
| 2.mp3 | えっと | etto (um/well) |
| 3.mp3 | そうだね | sou da ne (I see) |
| 4.mp3 | なるほど | naruhodo (I understand) |
| 5.mp3 | ふむ | fumu (hmm) |
| 6.mp3 | へぇ | hee (oh/interesting) |
| 7.mp3 | そっか | sokka (I see) |
| 8.mp3 | うーん | uun (hmm) |
| 9.mp3 | わかった | wakatta (got it) |

### Frontend Behavior

When user submits a message:
- **Response < 1s**: No waiting sound (plays immediately)
- **Response > 1s**: 
  - **50% chance**: Play random short waiting sound from 0-9.mp3
  - **50% chance**: Silent waiting (no sound)

This creates a more natural, varied conversation experience.

### Requirements

- Google Cloud TTS credentials configured in `backend/.env`
- `GOOGLE_APPLICATION_CREDENTIALS` environment variable set
- Frontend directory at `../frontend/public/waiting-short/`

### Troubleshooting

If generation fails:
1. Check Google Cloud credentials: `backend/.env` → `GOOGLE_APPLICATION_CREDENTIALS`
2. Verify service account has Text-to-Speech API enabled
3. Check file permissions for `frontend/public/waiting-short/` directory
4. Review logs for specific error messages
