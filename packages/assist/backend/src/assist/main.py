from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, APIRouter, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# The starlette CORS middleware allows regex origins.
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .middleware.CookieMiddleware import CookieMiddleware


import sentry_sdk

from .logger import logger

from .routes import auth

from pytoml import load
import os
from .defines import APP_ENV_DEV


def add_session_middleware(app):
    session_secret = os.getenv('SESSION_SECRET')
    if session_secret is None:
        raise ValueError('SESSION_SECRET must be set in environment variables')
    app.add_middleware(
        SessionMiddleware,
        secret_key=session_secret,
        max_age=None,
        same_site='none',  # Allow requests from tb extension to keep same session
        https_only=(os.getenv('APP_ENV') != APP_ENV_DEV),
    )


with open('pyproject.toml', 'r') as f:
    pyproject = load(f)


def traces_sampler(sampling_context):
    if sampling_context.get('transaction_context', {}).get('name', '').endswith('/stat'):
        # disable for `stat` route
        return 0

    # otherwise, use reduced sampling rate
    return 0.5


def server():
    sentry_sdk.init(
        dsn=os.getenv('SENTRY_DSN'),
        # Set traces_sample_rate to 1.0 to capture 100%
        # of transactions for tracing.
        traces_sampler=traces_sampler,
        # Set profiles_sample_rate to 1.0 to profile 100%
        # of sampled transactions.
        # We recommend adjusting this value in production.
        profiles_sample_rate=1.0,
    )
    app = FastAPI()

    # Will only be accessing from the extension.
    # For that, we need to specify origin as regex
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex='moz-extension:.*',
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    app.add_middleware(CookieMiddleware)
    add_session_middleware(app)

    logger.debug(f'Setting https_only to {(os.getenv('APP_ENV') != APP_ENV_DEV)}')

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        exc_str = f'{exc}'.replace('\n', ' ').replace('   ', ' ')
        logger.error(f'{request}: {exc_str}')
        content = {'status_code': status.HTTP_422_UNPROCESSABLE_ENTITY, 'message': exc_str, 'data': None}
        return JSONResponse(content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    app.include_router(auth.router, prefix='/api/v1/auth')

    @app.get('/health')
    async def health_check():
        return {'status': 'ok', 'version': pyproject['project']['version']}

    return app


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(server(), host='0.0.0.0', port=8000)
