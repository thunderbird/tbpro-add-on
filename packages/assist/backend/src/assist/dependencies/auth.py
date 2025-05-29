import os
import jwt
from datetime import timedelta, datetime, UTC

from fastapi import Request, HTTPException
from itsdangerous import BadSignature, SignatureExpired

from ..defines import COOKIE_AUTH_KEY
from ..exceptions.validation import InvalidTokenException
from ..logger import logger


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    jwt_secret = os.getenv('JWT_SECRET')
    jwt_algo = os.getenv('JWT_ALGO')

    if jwt_secret is None or jwt_algo is None:
        raise ValueError('JWT_SECRET and JWT_ALGO must be set in environment variables')

    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=15)
    to_encode.update({'exp': expire, 'iat': int(datetime.now(UTC).timestamp())})
    encoded_jwt = jwt.encode(to_encode, jwt_secret, algorithm=jwt_algo)
    return encoded_jwt


# Workaround: response.set_cookie was not working, but this does.
def set_cookie_in_request(request, key, value, max_age, samesite, secure, httponly=True):
    if 'set-cookie' not in request.scope:
        request.scope['set-cookie'] = []
    request.scope['set-cookie'].append(
        {
            'key': key,
            'value': value,
            'max_age': max_age,
            'samesite': samesite,
            'secure': secure,
            'httponly': httponly,
        }
    )


# Workaround: response.delete_cookie was not working, but this does.
def delete_cookie_in_request(request, key, secure=False, httponly=True):
    if 'set-cookie' not in request.scope:
        request.scope['set-cookie'] = []
    request.scope['set-cookie'].append(
        {
            'key': key,
            'value': '',
            'max_age': 0,
            'expires': 'Thu, 01 Jan 1970 00:00:00 GMT',
            'samesite': 'None',
            'secure': secure,
            'httponly': httponly,
        }
    )


def get_token_from_cookies(request: Request):
    cookies = request.cookies
    for key, value in cookies.items():
        if key == COOKIE_AUTH_KEY:
            return value
    return None


def get_current_user(request: Request):
    jwt_secret = os.getenv('JWT_SECRET')
    jwt_algo = os.getenv('JWT_ALGO')

    if jwt_secret is None or jwt_algo is None:
        raise ValueError('JWT_SECRET and JWT_ALGO must be set in environment variables')

    token = get_token_from_cookies(request)

    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=[jwt_algo])
        email = payload.get('email')
        # exp = payload.get('exp')
        # iat = payload.get('iat')
        uid = payload.get('uid')
        flwr_api_key = payload.get('flwr_api_key')
    except (BadSignature, SignatureExpired, InvalidTokenException) as e:
        logger.debug(e)
        raise HTTPException(status_code=401, detail='Not authenticated')
    return {'uid': uid, 'email': email, 'flwr_api_key': flwr_api_key}
