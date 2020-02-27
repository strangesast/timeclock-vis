from python:3.8
workdir /app
copy ws.requirements.txt requirements.txt
run pip install -r requirements.txt
copy ws.py util.py ./

cmd ["gunicorn", "ws:main", "--bind", "localhost:80", "--worker-class", "aiohttp.GunicornWebWorker"]
