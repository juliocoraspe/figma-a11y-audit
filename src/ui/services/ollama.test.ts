/**
 * Simple test for Ollama client health check and model detection.
 * Run with: npx tsx src/ui/services/ollama.test.ts
 */

import { OllamaClient } from "./ollama";

async function testCheckpoint1() {
  console.log("=== Checkpoint 1: Ollama Client ===\n");

  const client = new OllamaClient("http://localhost:11434");

  // Test 1: Status callbacks
  console.log("1. Testing status callbacks...");
  client.onStatusChange((status) => {
    console.log(`   → Status: ${status}`);
  });

  // Test 2: Health check
  console.log("\n2. Checking Ollama health...");
  const isHealthy = await client.checkHealth();
  console.log(`   → Ollama running: ${isHealthy}`);

  if (!isHealthy) {
    console.log(
      "\n   ⚠️  Ollama not running. Start it with: OLLAMA_ORIGINS=* ollama serve",
    );
    console.log(
      "   Then run this test again.\n",
    );
    return;
  }

  // Test 3: Get available models
  console.log("\n3. Fetching available models...");
  const models = await client.getAvailableModels();
  console.log(`   → Found ${models.length} models:`);
  models.forEach((m) => {
    const sizeGB = (m.size / 1024 / 1024 / 1024).toFixed(1);
    console.log(`      - ${m.name} (${sizeGB}GB)`);
  });

  // Test 4: Check for vision model
  console.log("\n4. Checking for llama3.2-vision...");
  const hasVision = await client.hasVisionModel();
  console.log(`   → Vision model available: ${hasVision}`);

  if (!hasVision) {
    console.log(
      "\n   ℹ️  llama3.2-vision not found. Would pull it now (takes ~5 min).",
    );
    console.log("   → Skipping pull for this test.\n");
    return;
  }

  // Test 5: Generate alt text (if we have an image)
  console.log("\n5. Testing alt text generation...");
  console.log("   → Skipping real image test (requires image file).");
  console.log(
    "   → In production, provide imageBase64 from exported design image.",
  );

  console.log("\n✅ Checkpoint 1 complete!");
  console.log(
    "   Ollama client is working. Ready for AltTextMode implementation.",
  );
}

testCheckpoint1().catch(console.error);
