import logging

FORMAT = '[%(filename)s:%(lineno)s - %(funcName)10s() ] %(message)s'
logger = logging.getLogger(__name__)
logging.basicConfig(format=FORMAT)
logger.setLevel(logging.DEBUG)
