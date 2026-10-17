# Docker Sandbox - Secure Code Execution Microservice

A secure, containerized code execution microservice that runs Python, Java, Node.js, and C++ code in isolated Docker containers with resource limits and network isolation.

## Features

- 🔒 **Secure Execution**: Runs code in isolated Docker containers with no network access
- 🚀 **Multiple Languages**: Supports Python, Java, Node.js, and C++
- 💾 **Resource Limits**: Memory (128MB), CPU (0.5 cores), and process limits
- ⏱️ **Timeout Protection**: 10-second execution timeout
- 📥 **Interactive Input**: Supports stdin for interactive programs
- 🧹 **Clean Output**: Automatically filters prompts and returns only program output
- 🔄 **Auto Cleanup**: Containers and temp files are automatically cleaned up

## Prerequisites

- Docker installed and running
- Node.js 16+ installed
- Docker images built for each language

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd docker-sandbox
```

2. Install dependencies:
```bash
npm install
```

3. Build Docker images:
```bash
docker build -t sandbox-python -f images/python.Dockerfile .
docker build -t sandbox-java -f images/java.Dockerfile .
docker build -t sandbox-node -f images/node.Dockerfile .
docker build -t sandbox-cpp -f images/cpp.Dockerfile .
```

4. Start the server:
```bash
node server.js
```

The server will start on port 3001 (or the port specified in the `PORT` environment variable).

## API Usage

### Execute Code

**Endpoint:** `POST /execute`

**Request Body:**
```json
{
  "language": "python",
  "files": [
    {
      "name": "Main.py",
      "content": "name = input('Enter your name: ')\nprint(f'Hello, {name}!')"
    }
  ],
  "stdin": "John\n"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Hello, John!",
  "error": "",
  "executionTime": "1234ms",
  "language": "python",
  "requestId": "abc123"
}
```

### Supported Languages

- `python` - Python 3.11
- `java` - Java 17
- `node` - Node.js 20
- `cpp` - C++ (GCC 13)

### File Names

Each language requires a specific filename:
- Python: `Main.py`
- Java: `Main.java`
- Node.js: `Main.js`
- C++: `Main.cpp`

## Example Usage

### Python
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "files": [{"name": "Main.py", "content": "print(\"Hello, World!\")"}],
    "stdin": ""
  }'
```

### Java
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "java",
    "files": [{"name": "Main.java", "content": "public class Main { public static void main(String[] args) { System.out.println(\"Hello, World!\"); } }"}],
    "stdin": ""
  }'
```

### Node.js
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "node",
    "files": [{"name": "Main.js", "content": "console.log(\"Hello, World!\");"}],
    "stdin": ""
  }'
```

### C++
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "cpp",
    "files": [{"name": "Main.cpp", "content": "#include <iostream>\nint main() { std::cout << \"Hello, World!\"; return 0; }"}],
    "stdin": ""
  }'
```

## Debug Endpoints

- `GET /health` - Health check
- `GET /debug/python` - Test Python execution
- `GET /debug/java` - Test Java execution
- `GET /debug/node` - Test Node.js execution
- `GET /debug/cpp` - Test C++ execution

## Security Features

- **Network Isolation**: `--network=none` prevents all network access
- **Memory Limit**: 128MB per container
- **CPU Limit**: 0.5 cores per container
- **Process Limit**: 64 processes maximum
- **Read-Only Filesystem**: Container filesystem is read-only (except /tmp)
- **No New Privileges**: Prevents privilege escalation
- **Execution Timeout**: 10-second timeout prevents infinite loops
- **Automatic Cleanup**: Containers and temp files are removed after execution

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP POST /execute
       ▼
┌─────────────────┐
│  Express Server │
│   (server.js)   │
└────────┬────────┘
         │
         ▼
┌────────────────────┐
│  Docker Container  │
│  - Isolated        │
│  - Resource Limited│
│  - No Network      │
└────────────────────┘
```

## Project Structure

```
docker-sandbox/
├── server.js           # Main Express server
├── package.json        # Node.js dependencies
├── images/            # Docker images
│   ├── python.Dockerfile
│   ├── java.Dockerfile
│   ├── node.Dockerfile
│   └── cpp.Dockerfile
├── temp/              # Temporary execution files (auto-cleaned)
└── jobs/              # Job tracking (optional)
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## Error Handling

The API returns appropriate HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid language, missing files, etc.)
- `500` - Server error (execution failed, Docker error, etc.)

## Limitations

- Maximum execution time: 10 seconds
- Maximum memory: 128MB
- Maximum file size: 1MB (recommended)
- No network access
- Single file per execution

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.

## Acknowledgments

Built with:
- Express.js
- Docker
- Node.js

---

**⚠️ Security Warning**: This is a code execution service. Always run it in a secure environment and never expose it directly to the internet without proper authentication and rate limiting.
