#!/usr/bin/env node

/**
 * Verification script for AWS Transcribe setup
 * Run with: node verify-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying AWS Transcribe Setup...\n');

let hasErrors = false;
let hasWarnings = false;

// Check 1: .env.local exists
console.log('1. Checking .env.local file...');
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env.local exists\n');
  
  // Parse .env.local
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim();
    }
  });
  
  // Check 2: AWS credentials
  console.log('2. Checking AWS credentials...');
  const requiredVars = [
    'NEXT_PUBLIC_AWS_REGION',
    'NEXT_PUBLIC_AWS_ACCESS_KEY_ID',
    'NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY'
  ];
  
  requiredVars.forEach(varName => {
    if (envVars[varName]) {
      const value = envVars[varName];
      if (value === 'your_access_key_here' || 
          value === 'your_secret_key_here' || 
          value === 'YOUR_ACCESS_KEY_HERE' ||
          value === 'YOUR_SECRET_KEY_HERE') {
        console.log(`   ⚠️  ${varName} is placeholder value`);
        hasWarnings = true;
      } else {
        console.log(`   ✅ ${varName} is set`);
      }
    } else {
      console.log(`   ❌ ${varName} is missing`);
      hasErrors = true;
    }
  });
  console.log('');
  
  // Check 3: Region recommendation
  console.log('3. Checking AWS region...');
  const region = envVars['NEXT_PUBLIC_AWS_REGION'];
  if (region === 'us-west-2' || region === 'ap-northeast-1') {
    console.log(`   ✅ Region ${region} is recommended for Japanese\n`);
  } else if (region) {
    console.log(`   ⚠️  Region ${region} may not support Japanese optimally`);
    console.log('   💡 Recommended: us-west-2 or ap-northeast-1\n');
    hasWarnings = true;
  }
} else {
  console.log('   ❌ .env.local not found');
  console.log('   💡 Create .env.local from template:\n');
  console.log('   cat > .env.local << \'EOF\'');
  console.log('   NEXT_PUBLIC_AWS_REGION=us-west-2');
  console.log('   NEXT_PUBLIC_AWS_ACCESS_KEY_ID=your_access_key_here');
  console.log('   NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=your_secret_key_here');
  console.log('   NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws');
  console.log('   EOF\n');
  hasErrors = true;
}

// Check 4: AWS SDK installed
console.log('4. Checking AWS SDK...');
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const sdkInstalled = packageJson.dependencies && 
                       packageJson.dependencies['@aws-sdk/client-transcribe-streaming'];
  
  if (sdkInstalled) {
    console.log(`   ✅ AWS SDK installed (${sdkInstalled})\n`);
  } else {
    console.log('   ❌ AWS SDK not installed');
    console.log('   💡 Run: npm install @aws-sdk/client-transcribe-streaming\n');
    hasErrors = true;
  }
} else {
  console.log('   ❌ package.json not found\n');
  hasErrors = true;
}

// Check 5: Required files exist
console.log('5. Checking required files...');
const requiredFiles = [
  'src/hooks/useAWSTranscribe.ts',
  'src/utils/audioUtils.ts',
  'src/components/VoiceInput.tsx'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} not found`);
    hasErrors = true;
  }
});
console.log('');

// Check 6: Backend running (optional)
console.log('6. Checking backend (optional)...');
const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200 || res.statusCode === 404) {
    console.log('   ✅ Backend is running on port 3001\n');
  } else {
    console.log(`   ⚠️  Backend returned status ${res.statusCode}\n`);
    hasWarnings = true;
  }
  showSummary();
});

req.on('error', () => {
  console.log('   ⚠️  Backend not running on port 3001');
  console.log('   💡 Start backend: cd ../backend && npm run dev\n');
  hasWarnings = true;
  showSummary();
});

req.on('timeout', () => {
  req.destroy();
  console.log('   ⚠️  Backend not responding\n');
  hasWarnings = true;
  showSummary();
});

req.end();

function showSummary() {
  console.log('═'.repeat(60));
  console.log('VERIFICATION SUMMARY');
  console.log('═'.repeat(60));
  
  if (!hasErrors && !hasWarnings) {
    console.log('\n✅ All checks passed! Setup is complete.\n');
    console.log('Next steps:');
    console.log('1. Start the app: npm run dev');
    console.log('2. Open http://localhost:3000');
    console.log('3. Click the microphone button');
    console.log('4. Say "映画を教えて" (Recommend a movie)\n');
    console.log('📘 Need help? See AWS_TRANSCRIBE_SETUP.md');
    console.log('🚀 Quick start? See QUICKSTART_VOICE.md\n');
  } else if (hasErrors) {
    console.log('\n❌ Setup incomplete. Please fix the errors above.\n');
    console.log('📘 Setup guide: AWS_TRANSCRIBE_SETUP.md');
    console.log('🚀 Quick start: QUICKSTART_VOICE.md\n');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('\n⚠️  Setup has warnings but should work.\n');
    console.log('You can proceed with testing, but consider fixing warnings.');
    console.log('\n📘 See documentation for details:\n');
    console.log('- AWS_TRANSCRIBE_SETUP.md');
    console.log('- QUICKSTART_VOICE.md\n');
  }
}
