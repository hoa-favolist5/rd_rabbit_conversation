#!/usr/bin/env node

/**
 * Test AWS Transcribe credentials
 * Run with: node test-aws-credentials.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing AWS Transcribe Configuration...\n');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  console.error('💡 Create it with:\n');
  console.error('cat > .env.local << \'EOF\'');
  console.error('NEXT_PUBLIC_AWS_REGION=us-west-2');
  console.error('NEXT_PUBLIC_AWS_ACCESS_KEY_ID=your_access_key_here');
  console.error('NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=your_secret_key_here');
  console.error('NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws');
  console.error('EOF\n');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

// Check variables
console.log('1. Checking environment variables...\n');

const region = envVars['NEXT_PUBLIC_AWS_REGION'];
const accessKeyId = envVars['NEXT_PUBLIC_AWS_ACCESS_KEY_ID'];
const secretAccessKey = envVars['NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY'];

let hasErrors = false;

if (!region) {
  console.error('   ❌ NEXT_PUBLIC_AWS_REGION is missing');
  hasErrors = true;
} else {
  console.log(`   ✅ NEXT_PUBLIC_AWS_REGION: ${region}`);
  if (region !== 'us-west-2' && region !== 'ap-northeast-1') {
    console.warn(`   ⚠️  Region ${region} may not support Japanese optimally`);
    console.warn('   💡 Recommended: us-west-2 or ap-northeast-1');
  }
}

if (!accessKeyId) {
  console.error('   ❌ NEXT_PUBLIC_AWS_ACCESS_KEY_ID is missing');
  hasErrors = true;
} else if (accessKeyId === 'your_access_key_here' || accessKeyId === 'YOUR_ACCESS_KEY_HERE') {
  console.error('   ❌ NEXT_PUBLIC_AWS_ACCESS_KEY_ID is placeholder value');
  console.error('   💡 Replace with actual AWS Access Key ID');
  hasErrors = true;
} else {
  console.log(`   ✅ NEXT_PUBLIC_AWS_ACCESS_KEY_ID: ${accessKeyId.slice(0, 8)}...${accessKeyId.slice(-4)}`);
  
  // Check format
  if (!accessKeyId.startsWith('AKIA')) {
    console.warn('   ⚠️  Access Key ID should start with "AKIA"');
    console.warn('   💡 Make sure you copied the correct Access Key ID');
  }
  
  if (accessKeyId.length !== 20) {
    console.warn('   ⚠️  Access Key ID should be 20 characters');
    console.warn(`   💡 Current length: ${accessKeyId.length}`);
  }
}

if (!secretAccessKey) {
  console.error('   ❌ NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY is missing');
  hasErrors = true;
} else if (secretAccessKey === 'your_secret_key_here' || secretAccessKey === 'YOUR_SECRET_KEY_HERE') {
  console.error('   ❌ NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY is placeholder value');
  console.error('   💡 Replace with actual AWS Secret Access Key');
  hasErrors = true;
} else {
  console.log(`   ✅ NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY: ${secretAccessKey.slice(0, 4)}...${secretAccessKey.slice(-4)}`);
  
  if (secretAccessKey.length !== 40) {
    console.warn('   ⚠️  Secret Access Key should be 40 characters');
    console.warn(`   💡 Current length: ${secretAccessKey.length}`);
  }
}

console.log('');

if (hasErrors) {
  console.error('❌ Configuration has errors!\n');
  console.error('📋 How to get AWS credentials:\n');
  console.error('1. Go to: https://console.aws.amazon.com/iam/');
  console.error('2. Click "Users" → "Create user"');
  console.error('3. Name: rabbit-ai-transcribe');
  console.error('4. Attach policy: AmazonTranscribeFullAccess');
  console.error('5. Create access key → Copy credentials\n');
  console.error('📘 Full guide: ../QUICKSTART_VOICE.md\n');
  process.exit(1);
}

console.log('2. Testing AWS SDK import...\n');

try {
  const { TranscribeStreamingClient } = require('@aws-sdk/client-transcribe-streaming');
  console.log('   ✅ AWS SDK is installed\n');
  
  console.log('3. Creating test client...\n');
  
  const client = new TranscribeStreamingClient({
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
  
  console.log('   ✅ Client created successfully\n');
  console.log('═'.repeat(60));
  console.log('✅ ALL CHECKS PASSED!\n');
  console.log('Your AWS credentials appear to be configured correctly.');
  console.log('\nNext steps:');
  console.log('1. Make sure frontend is running: npm run dev');
  console.log('2. Open http://localhost:3000');
  console.log('3. Click the microphone button');
  console.log('4. Allow microphone access');
  console.log('5. Start speaking!\n');
  console.log('If you still get errors, check browser console for details.\n');
  console.log('📋 The error might be:');
  console.log('   - Invalid credentials (test by logging into AWS Console)');
  console.log('   - IAM permissions missing (needs transcribe:StartStreamTranscription)');
  console.log('   - Network/firewall blocking AWS requests\n');
  
} catch (error) {
  console.error('   ❌ Error:', error.message);
  console.error('\n💡 Install AWS SDK:');
  console.error('   npm install @aws-sdk/client-transcribe-streaming\n');
  process.exit(1);
}
