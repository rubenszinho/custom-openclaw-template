# API Bridge Skill

This skill provides a generic HTTP bridge that allows the OpenClaw bot to communicate with external APIs.

## How It Works

1. The LLM decides to use the `api_bridge` tool based on the manifest description
2. OpenClaw invokes `handler.py` with JSON arguments via stdin
3. The handler makes an HTTP request to `MIDDLEWARE_URL` + `endpoint`
4. The response is returned to the LLM for processing

## Configuration

The skill requires these environment variables:
- `MIDDLEWARE_URL`: Base URL of your API (e.g., `https://api.example.com`)
- `API_KEY`: Authentication token (sent as `Authorization: Bearer {API_KEY}`)

## Usage Example

When the LLM wants to fetch user data, it might invoke:

```json
{
  "method": "GET",
  "endpoint": "/users/123",
  "query_params": {
    "include": "profile"
  }
}
```

The handler will make a request to:
```
GET https://api.example.com/users/123?include=profile
Authorization: Bearer your-api-key
```

## Customization

You can extend this skill by:
- Adding custom headers in `handler.py`
- Implementing retry logic
- Adding response caching
- Supporting additional authentication methods
