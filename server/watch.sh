DIR=$(dirname "$0")
AMG_USERNAME=admin AMG_PASSWORD=direktforce!2049 AMG_HOST=localhost AMG_PORT=3003 nodemon --exec $DIR/env/bin/python3 $DIR/server.py
