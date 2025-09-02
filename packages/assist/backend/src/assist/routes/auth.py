from secrets import token_urlsafe
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

import hashlib
import os
from datetime import timedelta, datetime

from ..dependencies.flwr_auth import get_flwr_api_key
from ..dependencies.fxa import get_fxa_client
from ..dependencies.auth import get_current_user, set_cookie_in_request, create_access_token, delete_cookie_in_request
from ..controllers.fxa_client import FxaClient
from ..exceptions.fxa_api import NotInAllowListException

from ..defines import APP_ENV_DEV, COOKIE_AUTH_KEY
from ..logger import logger

router = APIRouter()
templates = Jinja2Templates(directory='templates')


@router.get('/fxa_login')
def fxa_login(
    request: Request,
    fxa_client: FxaClient = Depends(get_fxa_client),
):
    logger.debug(request.session)

    fxa_client.setup()
    url, state = fxa_client.get_redirect_url(token_urlsafe(32))

    request.session['fxa_state'] = state
    logger.debug(f'writing fxa_state to session: {request.session['fxa_state']}')
    return {'url': url}


# Currently does not log out of FXA, as we don't have a place
# to store the refresh_token.
# However, it does invalidate the cookie.
@router.get('/logout')
def fxa_logout(
    request: Request,
    response: Response,
    fxa_client: FxaClient = Depends(get_fxa_client),
):
    # Even if we don't log out of fxa, we can still log out of our app
    fxa_client.setup()
    try:
        fxa_client.logout()
    except Exception as e:
        logger.error('Error logging out')
        # This doesn't print anything useful
        # but I know that the error is MissingRefreshTokenException
        logger.error(e)

    delete_cookie_in_request(request=request, key=COOKIE_AUTH_KEY, secure=(os.getenv('APP_ENV') != APP_ENV_DEV))
    return {'status': 'ok'}


@router.get('/fxa')
def fxa_callback(
    request: Request,
    response: Response,
    code: str,
    state: str,
    fxa_client: FxaClient = Depends(get_fxa_client),
):
    """Auth callback from fxa:
    - We first ensure the state has not changed during the authentication process.
    - We setup a fxa_client, and retrieve credentials and profile information on the user.
    - Store the user in JWT Token
    - Put Token in Cookie
    """

    logger.debug(f'we received state: {state}')
    logger.debug(f'about to check against fxa_state in session: {request.session['fxa_state']}')

    if 'fxa_state' not in request.session or request.session['fxa_state'] != state:
        logger.debug('Yeah. those do not match. Invalid state')
        raise HTTPException(400, 'Invalid state.')

    # Clear session keys
    request.session.pop('fxa_state')

    fxa_client.setup()

    # Retrieve user info
    fxa_client.get_credentials(code)
    profile = fxa_client.get_profile()
    email = profile['email']
    # avatar_url = profile['avatar']
    uid = profile['uid']

    is_in_allow_list = fxa_client.is_in_allow_list(email)
    if not is_in_allow_list:
        raise NotInAllowListException(404, 'Not in allow list')

    # Store email and mozid in the session for displaying on /login-complete page
    request.session['email'] = email
    request.session['uid'] = uid

    # Generate JWT token, storing the uid and email
    expiration_in_mins = os.getenv('JWT_EXPIRE_IN_MINS')
    if expiration_in_mins is None:
        expiration_in_mins = 6_00
    access_token_expires = timedelta(minutes=float(expiration_in_mins))

    # Set the expiry date for 31 days
    expiration_in_days = 31
    expires_at = datetime.now() + timedelta(days=expiration_in_days)
    flwr_api_key = get_flwr_api_key(expires_at=int(expires_at.timestamp()))

    token = create_access_token(
        data={'uid': uid, 'email': email, 'flwr_api_key': flwr_api_key}, expires_delta=access_token_expires
    )

    # Put JWT token in cookie
    cookie_max_age = os.getenv('COOKIE_MAX_AGE')
    if cookie_max_age is None:
        raise ValueError('COOKIE_MAX_AGE must be set in environment variables')
    set_cookie_in_request(
        request=request,
        key=COOKIE_AUTH_KEY,
        value=token,
        max_age=cookie_max_age,
        samesite='None',
        secure=(os.getenv('APP_ENV') != APP_ENV_DEV),
    )

    return RedirectResponse('login-complete')


@router.get('/login-complete', response_class=HTMLResponse)
def login_complete(request: Request, response: HTMLResponse):
    # Get data from session
    email = request.session['email']
    uid = request.session['uid']

    # Clear session data
    request.session.pop('email')
    request.session.pop('uid')

    return templates.TemplateResponse(
        request=request,
        name='login_complete.html',
        context={
            'uid': uid,
            'email': email,
        },
    )


@router.get('/stat')
def stat(user=Depends(get_current_user)):
    logger.debug(user)
    return user


@router.get('/token-debug')
def get_token(request: Request, response: Response):
    logger.debug('this is the uid from the decoded payload')
    # get_user_from_token
    user = get_current_user(request)
    logger.debug(user)
    return user
