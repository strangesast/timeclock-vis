from python:3.8-alpine as base

from base as builder
run apk add --update alpine-sdk libffi-dev openssl-dev libxml2-dev xmlsec-dev
copy daemon.requirements.txt requirements.txt
run pip install --target=/install -r /requirements.txt

from base
copy --from=builder /install /usr/local
workdir /app
copy daemon.py .
cmd ["python3.8", "daemon.py"]
