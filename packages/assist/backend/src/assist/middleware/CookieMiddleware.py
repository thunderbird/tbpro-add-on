from starlette.middleware.base import BaseHTTPMiddleware


class CookieMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if 'set-cookie' in request.scope:
            for cookie in request.scope['set-cookie']:
                response.set_cookie(**cookie)
        return response
