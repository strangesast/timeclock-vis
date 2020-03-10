from python:3.8
workdir /app
copy api.requirements.txt requirements.txt
run pip install -r requirements.txt
copy api.py util.py graph.py models.py ./

cmd ["gunicorn", "api:main", "--bind", "0.0.0.0:80", "--worker-class", "aiohttp.GunicornWebWorker"]
