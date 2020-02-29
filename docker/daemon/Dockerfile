from python:3.8
workdir /app
copy daemon.requirements.txt requirements.txt
run pip install -r requirements.txt
copy daemon.py util.py calculate_rows.py ./
cmd ["python3.8", "-u", "daemon.py"]
