"""
IP-based Rate Limiter Middleware
"""

import time
from fastapi import Request, HTTPException, status
from typing import Dict, Tuple

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger

logger = setup_logger("rate_limiter")


class RateLimiter:
    """Sliding-window IP-based rate limiter"""
    
    def __init__(self):
        # Maps IP Address -> List of timestamps of recent requests
        self.request_history: Dict[str, list] = {}
        
    def check_rate_limit(self, client_ip: str) -> bool:
        """Returns True if request is within rate limit, False otherwise"""
        current_time = time.time()
        window_seconds = 60
        limit = settings.RATE_LIMIT_PER_MINUTE
        
        # Initialize client history
        if client_ip not in self.request_history:
            self.request_history[client_ip] = []
            
        # Filter timestamps outside the sliding window
        self.request_history[client_ip] = [
            ts for ts in self.request_history[client_ip]
            if current_time - ts < window_seconds
        ]
        
        # Check limit
        if len(self.request_history[client_ip]) >= limit:
            logger.warning(f"Rate limit exceeded for client: {client_ip} ({len(self.request_history[client_ip])} reqs/min)")
            return False
            
        # Record request
        self.request_history[client_ip].append(current_time)
        return True


limiter = RateLimiter()


async def rate_limit_middleware(request: Request, call_next):
    """FastAPI middleware function to check client rate limits"""
    client_ip = request.client.host if request.client else "unknown"
    
    # Bypass for docs and healthchecks
    if request.url.path in ["/docs", "/redoc", "/openapi.json", "/health", "/metrics"]:
        return await call_next(request)
        
    if not limiter.check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down."
        )
        
    response = await call_next(request)
    return response
