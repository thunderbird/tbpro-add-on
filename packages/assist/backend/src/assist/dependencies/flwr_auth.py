import os
import requests


MGMT_BASE_URL = 'https://api.flower.ai/v1'


def get_flwr_api_key(user_id_hash: str, expires_at: int | None = None) -> str:
    """Request a Flower API key.

    expires_at should be an integer timestamp of the date the API key will become invalid.
    If None, the default timestamp is 90 days from now.

    The response from the server contains the following information:
        id: str
        api_key: str
        redacted_value: str
        expires_at: int

    This function only returns the `api_key`.
    """
    payload: dict[str, str | int] = {
        'billing_id': user_id_hash,
    }
    if expires_at:
        payload['expires_at'] = expires_at

    try:
        response = requests.post(
            _get_mgmt_url(),
            json=payload,
            headers=_get_headers(),
        )
        response.raise_for_status()
        data = response.json()
        return data['api_key']
    except requests.HTTPError as exc:
        raise RuntimeError(f'Error when requesting Flower API key: {exc.response.status_code} {exc.response.text}')
    except KeyError:
        raise RuntimeError('Bad response from Flower API server')


def _get_mgmt_url():
    project_id = os.getenv('FLWR_PROJ_ID')
    if project_id is None:
        raise ValueError('FLWR_PROJ_ID must be set in environment variables')

    return f'{MGMT_BASE_URL}/organization/projects/{project_id}/api_keys'


def _get_headers():
    mgmt_key = os.getenv('FLWR_MGMT_KEY')
    if mgmt_key is None:
        raise ValueError('FLWR_MGMT_KEY must be set in environment variables')

    return {
        'Authorization': f'Bearer {mgmt_key}',
    }
