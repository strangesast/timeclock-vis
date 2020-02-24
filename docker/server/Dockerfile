#from python:3.8-alpine
from python

workdir /app
copy server/requirements.txt .
run pip install --upgrade pip && pip install -r requirements.txt
copy server/ .

cmd ["python", "server.py"]
