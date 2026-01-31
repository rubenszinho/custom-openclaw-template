#!/usr/bin/env python3
"""
API Bridge Handler
Receives tool invocation arguments from OpenClaw, makes HTTP requests to external APIs,
and returns the response for the LLM to process.
"""

import sys
import json
import os
import requests
from urllib.parse import urljoin, urlencode


def main():
    try:
        input_data = sys.stdin.read()
        args = json.loads(input_data)
        
        method = args.get("method", "GET").upper()
        endpoint = args.get("endpoint", "")
        body = args.get("body")
        query_params = args.get("query_params", {})
        
        base_url = os.environ.get("MIDDLEWARE_URL")
        api_key = os.environ.get("API_KEY")
        
        if not base_url:
            raise ValueError("MIDDLEWARE_URL environment variable is not set")
        
        url = urljoin(base_url, endpoint.lstrip("/"))
        
        if query_params:
            url = f"{url}?{urlencode(query_params)}"
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "OpenClaw-APIBridge/1.0"
        }
        
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        response = requests.request(
            method=method,
            url=url,
            json=body if body else None,
            headers=headers,
            timeout=30
        )
        
        result = {
            "status_code": response.status_code,
            "success": response.ok,
            "url": url,
            "method": method
        }
        
        try:
            result["data"] = response.json()
        except json.JSONDecodeError:
            result["data"] = response.text
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
