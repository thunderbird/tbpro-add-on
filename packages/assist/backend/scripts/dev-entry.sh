#!/bin/sh

# Start up real webserver
uvicorn --factory assist.main:server --reload --host 0.0.0.0 --port 8000
