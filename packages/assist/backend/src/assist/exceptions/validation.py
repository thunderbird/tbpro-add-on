from fastapi import HTTPException

from ..l10n import l10n


class APIException(HTTPException):
    """Base exception for all custom API exceptions
    Custom messages are defined in a function, because l10n needs context set before use."""

    id_code = 'UNKNOWN'
    status_code = 500
    message_key = None

    def __init__(self, **kwargs):
        message_key = kwargs.pop('message_key', False)
        if message_key is not False:
            self.message_key = message_key

        super().__init__(
            status_code=self.status_code,
            detail={
                'id': self.id_code,
                'message': self.get_msg(),
                'status': self.status_code,
            },
            **kwargs,
        )

    def get_msg(self):
        if self.message_key:
            return l10n(self.message_key)

        return l10n('unknown-error')


class InvalidTokenException(APIException):
    """Raise when the subscriber could not be parsed from the auth token"""

    id_code = 'INVALID_TOKEN'
    status_code = 401

    def get_msg(self):
        return l10n('protected-route-fail')
