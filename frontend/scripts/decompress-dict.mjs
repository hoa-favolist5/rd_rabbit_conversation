#!/usr/bin/env node
/**
 * Decompress kuroshiro-browser dictionary files from Brotli to raw format.
 * This is needed because browsers don't automatically decompress .br files
 * when fetched via JavaScript (only via Content-Encoding negotiation).
 * 
 * Also patches kuroshiro-browser to look for .dat files instead of .dat.br
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { brotliDecompressSync } from "zlib";

const SOURCE_DIR = "./node_modules/kuroshiro-browser/dist/dict";
const TARGET_DIR = "./public/dict";
const LIB_FILE = "./node_modules/kuroshiro-browser/dist/kuroshiro-browser.js";

async function decompressFiles() {
  console.log("🔄 Decompressing kuroshiro dictionary files...");
  
  // Create target directory
  await mkdir(TARGET_DIR, { recursive: true });
  
  // Get all .br files
  const files = await readdir(SOURCE_DIR);
  const brFiles = files.filter(f => f.endsWith(".br"));
  
  console.log(`📦 Found ${brFiles.length} Brotli-compressed files`);
  
  let totalCompressed = 0;
  let totalDecompressed = 0;
  
  for (const file of brFiles) {
    const sourcePath = join(SOURCE_DIR, file);
    // Remove .br extension for output file name
    const targetFile = file.replace(/\.br$/, "");
    const targetPath = join(TARGET_DIR, targetFile);
    
    // Read compressed file
    const compressed = await readFile(sourcePath);
    totalCompressed += compressed.length;
    
    // Decompress using Node.js native brotli
    const decompressed = brotliDecompressSync(compressed);
    totalDecompressed += decompressed.length;
    
    console.log(`  📄 ${file} (${(compressed.length / 1024 / 1024).toFixed(2)} MB) → ${targetFile} (${(decompressed.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Write decompressed file
    await writeFile(targetPath, decompressed);
  }
  
  console.log("✅ Dictionary files decompressed!");
  console.log(`   Compressed:   ${(totalCompressed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Decompressed: ${(totalDecompressed / 1024 / 1024).toFixed(2)} MB`);
}

async function patchLibrary() {
  console.log("🔧 Patching kuroshiro-browser to use .dat files...");
  
  let content = await readFile(LIB_FILE, "utf-8");
  
  // Replace all .dat.br references with .dat
  const originalCount = (content.match(/\.dat\.br/g) || []).length;
  content = content.replace(/\.dat\.br/g, ".dat");
  const newCount = (content.match(/\.dat\.br/g) || []).length;
  
  await writeFile(LIB_FILE, content);
  
  console.log(`✅ Patched ${originalCount} references (.dat.br → .dat)`);
}

async function main() {
  await decompressFiles();
  await patchLibrary();
  console.log("🎉 Setup complete!");
}

main().catch(err => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
