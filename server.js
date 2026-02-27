const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json({ limit: "1mb" }));

const SANDBOX_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR);
}

// Track active requests to prevent mixing
const activeRequests = new Map();

/* =========================
   LANGUAGE CONFIGURATION
   All languages use /tmp with unbuffered output
========================= */

const languages = {
  python: {
    image: "sandbox-python",
    filename: "Main.py",
    runCmd: ["sh", "-c", "cd /tmp && python3 -u Main.py; sleep 0.2"],
    workDir: "/tmp",
  },
  java: {
    image: "sandbox-java",
    filename: "Main.java",
    runCmd: ["sh", "-c", "cd /tmp && javac Main.java && java Main; sleep 0.2"],
    workDir: "/tmp",
  },
  node: {
    image: "sandbox-node",
    filename: "Main.js",
    runCmd: ["sh", "-c", "cd /tmp && node Main.js; sleep 0.2"],
    workDir: "/tmp",
  },
  cpp: {
    image: "sandbox-cpp",
    filename: "Main.cpp",
    runCmd: ["sh", "-c", "cd /tmp && g++ Main.cpp -o main && ./main; sleep 0.2"],
    workDir: "/tmp",
  },
};

/* =========================
   DOCKER HELPER
========================= */

function runDockerCommand(args, input = null, timeoutMs = 5000, requestId = null) {
  return new Promise((resolve, reject) => {
    const logPrefix = requestId ? `[Request ${requestId}]` : '';
    console.log(`${logPrefix} Running Docker:`, args.join(" "));

    const proc = spawn("docker", args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Execution timeout"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/* =========================
   EXECUTION ENDPOINT
========================= */

app.post("/execute", async (req, res) => {
  const requestId = uuidv4().substring(0, 8);
  const startTime = Date.now();
  let containerId = null;
  let jobDir = null;

  console.log(`[${requestId}] /execute request received for language: ${req.body.language}`);

  // Set response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Request-ID', requestId);

  try {
    if (!req.body) {
      return res.status(400).json({ 
        success: false,
        error: "Request body missing",
        requestId 
      });
    }

    const { language, files, stdin = "" } = req.body;

    if (!language || !files || !Array.isArray(files)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid request format",
        requestId 
      });
    }

    const langKey = typeof language === "string" ? language.trim().toLowerCase() : String(language).trim().toLowerCase();
    let mappedLang = langKey;
    if (mappedLang === "c++") mappedLang = "cpp";

    if (!languages[mappedLang]) {
      return res.status(400).json({ 
        success: false,
        error: "Unsupported language", 
        received: language, 
        supported: Object.keys(languages),
        requestId 
      });
    }

    const config = languages[mappedLang];

    if (files.length !== 1) {
      return res.status(400).json({ 
        success: false,
        error: "Only one file allowed",
        requestId 
      });
    }

    if (files[0].name !== config.filename) {
      return res.status(400).json({
        success: false,
        error: `File must be named ${config.filename}`,
        requestId
      });
    }

    /* =========================
       CREATE TEMP FILE
    ========================= */

    const jobId = uuidv4();
    jobDir = path.join(SANDBOX_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const filePath = path.join(jobDir, config.filename);
    fs.writeFileSync(filePath, files[0].content);

    console.log(`[${requestId}] Created temp file: ${filePath}`);

    /* =========================
       CREATE CONTAINER
    ========================= */

    const createResult = await runDockerCommand([
      "create",
      "--network=none",
      "--memory=128m",
      "--cpus=0.5",
      "--pids-limit=64",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,size=64m",
      "--security-opt",
      "no-new-privileges",
      config.image,
      "sh",
      "-c",
      "sleep 60",
    ], null, 5000, requestId);

    if (createResult.code !== 0) {
      throw new Error(createResult.stderr);
    }

    containerId = createResult.stdout.trim();
    console.log(`[${requestId}] Container created:`, containerId);

    await runDockerCommand(["start", containerId], null, 5000, requestId);

    /* =========================
       COPY FILE INTO CONTAINER
    ========================= */

    const fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
    
    const targetDir = "/tmp";
    
    // Write the file directly to /tmp
    const writeResult = await runDockerCommand(
      ["exec", "-i", containerId, "sh", "-c", `cat > ${targetDir}/${config.filename}`],
      fileContent,
      5000,
      requestId
    );

    if (writeResult.code !== 0) {
      throw new Error(writeResult.stderr || "Failed to write file into container");
    }

    /* =========================
       EXECUTE CODE
    ========================= */

    const runResult = await runDockerCommand(
      ["exec", "-i", "-w", targetDir, containerId, ...config.runCmd],
      stdin,
      10000,
      requestId
    );

    const executionTime = Date.now() - startTime;

    // ========== UNIVERSAL OUTPUT CLEANING ==========
    let rawOutput = runResult.stdout
      .replace(/\r\n/g, '\n')
      .trim();

    console.log(`[${requestId}] Raw stdout:`, JSON.stringify(rawOutput));

    // If stdin was provided, filter out ALL prompts and keep only actual output
    if (stdin && stdin.trim()) {
      const inputs = stdin.split('\n').filter(i => i !== '');
      console.log(`[${requestId}] Inputs:`, JSON.stringify(inputs));
      
      // Remove ALL prompt patterns aggressively
      let cleaned = rawOutput;
      
      // Remove all variations of prompts
      cleaned = cleaned.replace(/Enter\s+[^:\n]*:\s*/gi, '');
      cleaned = cleaned.replace(/Input\s+[^:\n]*:\s*/gi, '');
      cleaned = cleaned.replace(/Please\s+[^:\n]*:\s*/gi, '');
      cleaned = cleaned.replace(/Type\s+[^:\n]*:\s*/gi, '');
      
      // Split into lines and filter
      const lines = cleaned.split('\n');
      const outputLines = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip if it's just an input echo
        if (inputs.includes(trimmed)) continue;
        
        // Keep this line
        outputLines.push(trimmed);
      }
      
      rawOutput = outputLines.join('\n').trim();
      console.log(`[${requestId}] Clean output:`, JSON.stringify(rawOutput));
    }

    // Send clean JSON response
    return res.json({
      success: runResult.code === 0,
      output: rawOutput,
      error: runResult.stderr.trim(),
      executionTime: `${executionTime}ms`,
      language: mappedLang,
      requestId
    });

  } catch (err) {
    console.error(`[${requestId}] Execution Error:`, err);

    return res.status(500).json({
      success: false,
      error: "Execution failed",
      details: err.message,
      requestId
    });

  } finally {
    // Cleanup
    if (containerId) {
      await runDockerCommand(["rm", "-f", containerId], null, 5000, requestId).catch(() => {});
    }

    if (jobDir) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[${requestId}] Cleanup error:`, err);
      }
    }
    
    console.log(`[${requestId}] Request completed in ${Date.now() - startTime}ms`);
  }
});

/* =========================
   DEBUG ENDPOINTS
========================= */

app.get("/debug/java", async (req, res) => {
  const requestId = uuidv4().substring(0, 8);
  
  try {
    const testResult = await runDockerCommand([
      "run",
      "--rm",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,size=64m",
      "sandbox-java",
      "sh",
      "-c",
      'cd /tmp && echo \'public class Main { public static void main(String[] args) { System.out.println("Java debug works!"); } }\' > Main.java && javac Main.java && java Main'
    ], null, 5000, requestId);
    
    res.json({
      success: testResult.code === 0,
      output: testResult.stdout.trim(),
      error: testResult.stderr.trim(),
      language: "java",
      requestId
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message,
      requestId 
    });
  }
});

app.get("/debug/cpp", async (req, res) => {
  const requestId = uuidv4().substring(0, 8);
  
  try {
    const testResult = await runDockerCommand([
      "run",
      "--rm",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,size=64m",
      "sandbox-cpp",
      "sh",
      "-c",
      'cd /tmp && echo \'#include <iostream>\nint main(){std::cout<<"C++ debug works!";}\' > test.cpp && g++ test.cpp -o test && ./test'
    ], null, 5000, requestId);
    
    res.json({
      success: testResult.code === 0,
      output: testResult.stdout.trim(),
      error: testResult.stderr.trim(),
      language: "cpp",
      requestId
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message,
      requestId 
    });
  }
});

app.get("/debug/python", async (req, res) => {
  const requestId = uuidv4().substring(0, 8);
  
  try {
    const testResult = await runDockerCommand([
      "run",
      "--rm",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,size=64m",
      "sandbox-python",
      "sh",
      "-c",
      'cd /tmp && echo \'print("Python debug works!")\' > test.py && python3 -u test.py'
    ], null, 5000, requestId);
    
    res.json({
      success: testResult.code === 0,
      output: testResult.stdout.trim(),
      error: testResult.stderr.trim(),
      language: "python",
      requestId
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message,
      requestId 
    });
  }
});

app.get("/debug/node", async (req, res) => {
  const requestId = uuidv4().substring(0, 8);
  
  try {
    const testResult = await runDockerCommand([
      "run",
      "--rm",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,size=64m",
      "sandbox-node",
      "sh",
      "-c",
      'cd /tmp && echo \'console.log("Node debug works!")\' > test.js && node test.js'
    ], null, 5000, requestId);
    
    res.json({
      success: testResult.code === 0,
      output: testResult.stdout.trim(),
      error: testResult.stderr.trim(),
      language: "node",
      requestId
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message,
      requestId 
    });
  }
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    activeRequests: activeRequests.size
  });
});

/* ========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Secure Sandbox running on port ${PORT} 🚀`);
  console.log(`Debug endpoints:`);
  console.log(`  GET /debug/python`);
  console.log(`  GET /debug/node`);
  console.log(`  GET /debug/java`);
  console.log(`  GET /debug/cpp`);
  console.log(`  GET /health`);
});