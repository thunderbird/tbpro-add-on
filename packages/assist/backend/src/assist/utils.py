from os import path
from typing import Optional
from .messages import MailMessage, ModelMessages
import json

from .logger import logger


def messages_to_list(messages: ModelMessages):
    messages_list = [message.model_dump() for message in messages.messages]
    return messages_list


def format_email(msg: MailMessage, index: Optional[int] = None) -> str:
    email_obj = msg.model_dump()
    if index is not None:
        email_obj['index'] = index
    return json.dumps(email_obj)


def parse_response(result_dict):
    try:
        choices = result_dict.get('choices')
        return choices[0]['message']['content']
    except:
        return None


def load_json_schema(json_file_path: str):
    schema = {}
    try:
        with open(path.join('json', json_file_path), 'r') as file:
            schema = json.load(file)
    except Exception as e:
        logger.error(e)
    return schema
